// apps/web/src/components/drama-read.tsx
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
	TrialAudio,
	TrialFound,
	TrialModelRate,
} from "@tts-pilot-app/api/providers/trial-contract";
import {
	comboSignature,
	type TrialRequest,
} from "@tts-pilot-app/api/providers/trial-options";
import {
	createContext,
	type ReactNode,
	type RefObject,
	useContext,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";

import { blobUrls } from "@/lib/blob-urls";
import { saveBlob } from "@/lib/browser";
import {
	interrupted,
	isReadKey,
	JOIN_KEY,
	joinPlan,
	joinPlaying,
	READ_IDLE,
	type ReadEvent,
	type ReadLine,
	type ReadMode,
	type ReadState,
	type ReadSummary,
	readKey,
	readReducer,
	readRequests,
	readSummary,
	type SaveKind,
	soundExt,
} from "@/lib/drama-read";
import {
	DRAMA_TEXT,
	type DraftLine,
	joinFileName,
	lineFileName,
	readBlockOf,
	zipFileName,
} from "@/lib/drama-view";
import type { Current } from "@/lib/sample-state";
import { joinSounds } from "@/lib/sound-join";
import { listLoad } from "@/lib/studio-view";
import { trialFailureOf } from "@/lib/trial-view";
import { zipStore } from "@/lib/zip-store";
import { client, orpc, QUIET } from "@/utils/orpc";

import { dramaFieldId, useDrama, useLines } from "./drama-provider";
import { speakerFieldId } from "./drama-voice-dialog";
import { usePresetList } from "./presets";
import { usePlayer } from "./sample-player";

// 드라마 작업실 '읽기'(스펙 14절): 줄 순서대로 그 화자 성우로 듣는다. 줄마다 내 문장 듣기(T5) 생성 기록을 쓴다:
// 시작할 때 trialFindMany로 찾고(오디오 없음), 그 줄 차례에 찾은 줄은 trialAudio, 아니면 trialFind를 한 번 더, 없을 때만 trialCreate.
// 상태는 readReducer로만 바꾸고, 비동기 흐름은 줄을 준비하거나 틀기 전에 run과 phase가 그대로인지 본다(멈춘 뒤 늦은 결과가 새 읽기를 건드리지 않게).
// '받기'(스펙 16절)는 같은 길을 재생 없이 한 줄씩 가서 대본 전체를 한 파일(WAV)·줄마다(zip)·이어 듣기로 낸다.
// 유료 호출은 서명마다 요청 id 하나로 한 번이고 자동으로 다시 만들지 않는다(tts-provider)

type Sound = { blob: Blob; type: string };
// 이번 읽기의 줄. sound는 이 줄이 기다릴 소리 약속이다(처음 준비할 때 정하고 이번 읽기 안에서는 바꾸지 않는다)
type PlanLine = ReadLine & {
	index: number;
	signature: string;
	found: TrialFound | null;
	sound?: Promise<Sound>;
};
// kind·version은 받기만: 다 받은 뒤 할 일과 누른 때의 플레이어 판(이어 듣기가 늦게 끼어들지 않게)
type Plan = {
	run: number;
	sceneName: string;
	lines: PlanLine[];
	kind?: SaveKind;
	version?: number;
};

type DramaReadApi = {
	state: ReadState;
	// 확인 창 셈(마지막 찾기 결과). 찾는 중이면 null
	summary: ReadSummary | null;
	// 받은 대본을 한 파일로 잇는 중(표시용. 판정은 joiningRef)
	joining: boolean;
	// 읽기·받기를 누른 요소(확인 창을 닫은 뒤 포커스가 돌아갈 곳)
	opener: HTMLElement | null;
	// only면 그 줄 하나만 읽는다(줄 ▶)
	start: (fromId: string, opener: HTMLElement | null, only?: boolean) => void;
	// '받기' 메뉴(스펙 16절): 대본 전체를 받아 kind대로 낸다. 이어 듣는 중의 '이어 듣기'는 멈춤이다
	save: (kind: SaveKind, opener: HTMLElement | null) => void;
	confirm: () => void;
	cancel: () => void;
	stop: () => void;
	// 소리를 받는 데 성공한 서명(보내기만 한 약속은 아니다). 이어 듣기 단추 판정에 쓴다
	prepared: ReadonlySet<string>;
};

const DramaReadContext = createContext<DramaReadApi | null>(null);

// readRequests의 재료(저장된 성우·프리셋·머리 모델·시각)를 만드는 함수. 읽기 시작과 막대의 막는 이유가 같은 값으로 거른다.
// 프리셋 목록을 받지 못했으면 presets는 null(저장된 프리셋이 있는 쓰인 화자는 막는다)
export function useReadCtx() {
	const drama = useDrama();
	const presetList = usePresetList();
	return (now = Date.now()) => ({
		saved: drama.savedVoices,
		presets: listLoad(presetList) === "failed" ? null : drama.presets,
		headerModel: drama.model,
		now,
	});
}

const soundFrom = (audio: TrialAudio): Sound => ({
	blob: audio.audio,
	type: audio.audio.type,
});
// 플레이어 재생 실패(소리를 받았지만 틀지 못함). 문구는 T5 기본 실패 문구다
const PLAY_FAILED = {
	reason: "unexpected",
	retryAt: null,
	providerCode: null,
} as const;
// ElevenLabs 배율은 무료 목록 조회다. 한 시간 기억한다(trial-confirm useRate와 같다)
const RATES_STALE = 60 * 60 * 1000;

// 읽기를 막는 이유의 알림 버튼. 막대의 이동 버튼과 같다: 성우 없음 → 그 화자의 성우 창, 줄 → 그 줄의 문제 칸('…번 줄로')
function blockActionOf(
	{ target }: ReturnType<typeof readBlockOf>,
	lines: readonly DraftLine[],
) {
	if (target?.kind === "voice")
		return {
			label: DRAMA_TEXT.pickVoice,
			onClick: () =>
				document.getElementById(speakerFieldId(target.index, "voice"))?.click(),
		};
	if (target?.kind !== "line") return undefined;
	return {
		label: DRAMA_TEXT.toLine(
			lines.findIndex((line) => line.id === target.id) + 1,
		),
		onClick: () =>
			document.getElementById(dramaFieldId(target.id, target.field))?.focus(),
	};
}

// 최신 줄을 ref로만 옮긴다. 글자를 칠 때 이 빈 컴포넌트만 다시 그리고 읽기 컨텍스트는 그대로다(입력 지연, rerender-defer-reads)
export function LatestLines({ into }: { into: RefObject<DraftLine[]> }) {
	const { lines } = useLines();
	useLayoutEffect(() => {
		into.current = lines;
	}, [into, lines]);
	return null;
}

export function DramaReadProvider({ children }: { children: ReactNode }) {
	const drama = useDrama();
	const player = usePlayer();
	const ctxOf = useReadCtx();
	const queryClient = useQueryClient();
	const create = useMutation({
		...orpc.trialCreate.mutationOptions(),
		retry: false,
		// 같은 출처로만 붙으니 브라우저 offline 판단으로 멈추지 않게 한다(drama-provider와 같다)
		networkMode: "always",
	});
	const [state, setState] = useState<ReadState>(READ_IDLE);
	const stateRef = useRef<ReadState>(READ_IDLE);
	const [summary, setSummary] = useState<ReadSummary | null>(null);
	const [joining, setJoining] = useState(false);
	// 잇는 중 판정. 렌더 전에 두 번 눌러도 한 번만 잇는다(계획 리뷰 F1)
	const joiningRef = useRef(false);
	const [opener, setOpener] = useState<HTMLElement | null>(null);
	const linesRef = useRef<DraftLine[]>([]);
	// 기본 쉼의 최신 값. 유료 줄을 만드는 몇 분 사이 바꿔도 다 받은 때의 값으로 잇는다(스펙 16.2 '끝난 뒤', 계획 리뷰 P4-5)
	const gapRef = useRef(drama.gap);
	useLayoutEffect(() => {
		gapRef.current = drama.gap;
	}, [drama.gap]);
	const plan = useRef<Plan | null>(null);
	// 서명별 소리 약속. 멈춤과 다음 읽기에도 남아 같은 대사 두 줄·멈춘 뒤 다시 읽기가 다시 만들지 않는다. 실패·미확인이면 지운다.
	// shortcut: 화면에 있는 동안 받은 소리를 모두 기억한다(줄 50개 × 수백 KB). 오래 고치며 읽어 메모리가 문제가 되면 지금 대본에 없는 서명을 지운다
	const sounds = useRef(new Map<string, Promise<Sound>>());
	// 소리를 실제로 받은 서명. sounds에서 지우는 곳마다 함께 뺀다(kept는 보내기만 한 약속도 담는다)
	const preparedRef = useRef(new Set<string>());
	const [prepared, setPrepared] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	const unprepare = (signature: string) => {
		if (preparedRef.current.delete(signature))
			setPrepared(new Set(preparedRef.current));
	};
	// 멈춰도 남기는 약속: 받았거나 만들기 요청을 보낸 것. 그 밖(아직 보내지 않은 다음 준비)은 멈추면 버린다
	const kept = useRef(new WeakSet<Promise<Sound>>());
	// 미확인으로 끝난 서명. 다시 만들 때는 무료여도 확인 창을 거친다(스펙 14.2)
	const unknown = useRef(new Set<string>());
	// 만들기는 한 번에 하나다(서버 동시 1건). 멈춘 앞 읽기의 만들기가 끝난 뒤 다음을 보낸다
	const makeTurn = useRef<Promise<unknown>>(Promise.resolve());
	// 만들기 요청을 보내고 아직 답을 받지 못한 서명. 앞 읽기가 보낸 만들기를 기다리는 줄에도 '만드는 중'을 보인다
	const sending = useRef(new Set<string>());
	const urls = useRef(blobUrls());
	const mounted = useRef(true);
	const lastCurrent = useRef<Current>(null);

	useEffect(() => {
		mounted.current = true;
		const map = sounds.current;
		const store = urls.current;
		return () => {
			mounted.current = false;
			map.clear();
			preparedRef.current.clear();
			// 상태를 지키며 다시 붙는 경우(StrictMode, Activity)에 비운 맵과 어긋나지 않게
			setPrepared(new Set());
			store.clear();
		};
	}, []);

	// 읽기 상태는 리듀서로만 바꾼다. 비동기 흐름이 바로 읽게 ref에도 둔다(sample-player updateCurrent와 같다).
	// 읽기가 멈추면(멈춤·실패·끝) 아직 보내지 않은 다음 준비는 버리고, 보낸 만들기와 받은 소리는 다음 읽기를 위해 남긴다
	function send(event: ReadEvent): ReadState {
		const previous = stateRef.current;
		const next = readReducer(previous, event);
		if (next === previous) return previous;
		stateRef.current = next;
		setState(next);
		if (next.phase === "idle")
			for (const [signature, sound] of sounds.current)
				if (!kept.current.has(sound)) {
					sounds.current.delete(signature);
					unprepare(signature);
				}
		return next;
	}
	const reading = (run: number) =>
		mounted.current &&
		stateRef.current.run === run &&
		stateRef.current.phase === "reading";
	const halt = () => send({ type: "stop" });

	// 만들기 차례가 오면 그 약속이 아직 이 서명의 것인지 본다(멈춤이 버렸으면 보내지 않는다). 요청 id는 서명의 약속마다 하나다
	async function make(
		run: number,
		line: PlanLine,
		requestId: string,
		owned: () => boolean,
		sent: () => void,
	): Promise<Sound> {
		send({ type: "making", run, lineId: line.id });
		const turn = makeTurn.current.then(async () => {
			if (!owned()) throw new Error("abandoned");
			sent();
			sending.current.add(line.signature);
			try {
				const result = await create.mutateAsync({
					requestId,
					request: line.request,
				});
				// 만든 줄은 그 성우의 '내 문장 듣기' 결과에도 보인다(스펙 14.2)
				void queryClient.invalidateQueries({ queryKey: orpc.trialList.key() });
				return soundFrom(result);
			} finally {
				sending.current.delete(line.signature);
			}
		});
		makeTurn.current = turn.catch(() => undefined);
		try {
			return await turn;
		} finally {
			send({ type: "making", run, lineId: null });
		}
	}

	// 서명의 소리. 약속이 있으면 그것, 없으면 찾은 줄은 trialAudio, 아니면 그사이 끝났을 수 있어 trialFind를 한 번 더 부르고 없을 때만 만든다
	function soundOf(run: number, line: PlanLine): Promise<Sound> {
		const map = sounds.current;
		const known = map.get(line.signature);
		if (known) return known;
		// 약속을 지우면 다음 시도는 새 id라 저장된 실패를 되풀이하지 않는다
		const requestId = crypto.randomUUID();
		const sound: Promise<Sound> = (async () => {
			const saved = line.found
				? await client.trialAudio({ id: line.found.id })
				: await client.trialFind(line.request);
			if (saved) return soundFrom(saved);
			return make(
				run,
				line,
				requestId,
				() => mounted.current && map.get(line.signature) === sound,
				() => kept.current.add(sound),
			);
		})();
		map.set(line.signature, sound);
		sound.then(
			() => {
				kept.current.add(sound);
				// 그사이 지워진 약속은 준비로 세지 않는다
				if (map.get(line.signature) !== sound) return;
				preparedRef.current.add(line.signature);
				setPrepared(new Set(preparedRef.current));
			},
			(error: unknown) => {
				if (map.get(line.signature) === sound) {
					map.delete(line.signature);
					unprepare(line.signature);
				}
				if (trialFailureOf(error).reason === "unknown_outcome")
					unknown.current.add(line.signature);
			},
		);
		return sound;
	}
	const prepare = (run: number, line: PlanLine) => {
		line.sound ??= soundOf(run, line);
		return line.sound;
	};

	// 줄 하나를 준비해 튼다. 끝나면(onEnded) 다음 줄, 트는 동안 다음 줄을 준비한다(줄 N을 듣는 동안 줄 N+1을 만든다).
	// 실패하면 그 줄에서 멈춘다. 다음 줄 준비의 실패도 그 줄 차례에 알린다(다시 만들지 않는다)
	async function playLine(run: number, at: number) {
		const current = plan.current;
		const line = current?.lines[at];
		if (!current || current.run !== run || !line || !reading(run)) return;
		// 앞 읽기가 보낸 만들기를 기다리면 그 만들기의 표시는 앞 run이라 무시된다. 이 읽기로 '만드는 중'을 보인다(재생하면 내린다)
		if (sending.current.has(line.signature))
			send({ type: "making", run, lineId: line.id });
		let sound: Sound;
		try {
			sound = await prepare(run, line);
		} catch (error) {
			send({
				type: "fail",
				run,
				lineId: line.id,
				problem: trialFailureOf(error),
			});
			return;
		}
		// 준비하는 사이 멈췄거나 다른 소리가 끼어들었으면 틀지 않는다
		if (!reading(run) || stateRef.current.atId !== line.id) return;
		const url = urls.current.ensure(line.signature, sound.blob);
		send({ type: "playing", run, lineId: line.id });
		const next = current.lines[at + 1];
		player.toggle(
			readKey(line.id),
			DRAMA_TEXT.readAnnounce(line.index + 1, line.speaker),
			url,
			DRAMA_TEXT.lineNoun,
			null,
			() => {
				send({ type: "ended", run, lineId: line.id, next: next?.id ?? null });
				if (next) void playLine(run, at + 1);
			},
		);
		if (next) void prepare(run, next);
	}

	// 받기(스펙 16절): 계획의 줄을 한 줄씩 차례로 준비한다(재생하지 않는다). 앞 줄 준비를 하지 않아 한 줄이 실패하면
	// 다음 줄 만들기는 나가지 않는다(계획 리뷰 P4-1). 줄마다 기다린 뒤 멈춤·새 시작·화면 떠남이면 아무것도 내지 않고 끝낸다
	async function collect(run: number) {
		const current = plan.current;
		if (!current || current.run !== run) return;
		const got: { line: PlanLine; sound: Sound }[] = [];
		for (const [at, line] of current.lines.entries()) {
			// 앞 run이 보낸 만들기를 기다리는 줄에도 '만드는 중'을 보인다(그 줄을 받으면 ended가 내린다)
			if (sending.current.has(line.signature))
				send({ type: "making", run, lineId: line.id });
			let sound: Sound;
			try {
				sound = await prepare(run, line);
			} catch (error) {
				send({
					type: "fail",
					run,
					lineId: line.id,
					problem: trialFailureOf(error),
				});
				return;
			}
			if (!reading(run)) return;
			got.push({ line, sound });
			const next = current.lines[at + 1];
			send({ type: "ended", run, lineId: line.id, next: next?.id ?? null });
		}
		// 모두 받았다(읽기 상태는 idle). 고른 일을 한다: zip은 줄마다 받은 형식 그대로, WAV·이어 듣기는 쉼을 넣어 잇는다
		if (current.kind === "zip") {
			try {
				const entries = await Promise.all(
					got.map(async ({ line, sound }) => ({
						name: lineFileName(
							current.sceneName,
							line.index,
							line.speaker,
							soundExt(sound.type),
						),
						parts: [new Uint8Array(await sound.blob.arrayBuffer())],
					})),
				);
				// 화면을 떠났으면 저장도 알림도 하지 않는다(wav와 같다)
				if (!mounted.current) return;
				saveBlob(
					zipStore(entries),
					zipFileName(current.sceneName, new Date().toISOString()),
				);
			} catch {
				if (mounted.current) toast.error(DRAMA_TEXT.downloadFailed);
			}
			return;
		}
		const heard = got.map(({ line, sound }) => ({
			lineId: line.id,
			blob: sound.blob,
		}));
		if (current.kind === "wav") {
			const blob = await join(heard, () => true);
			if (blob && mounted.current)
				saveBlob(
					blob,
					joinFileName(current.sceneName, new Date().toISOString()),
				);
			return;
		}
		if (current.kind !== "play") return;
		// 이어 듣기. 누른 뒤 다른 소리(플레이어 판)·읽기(run)·화면 떠남이 있었으면 다 이어도 틀지 않고 실패도 알리지 않는다
		// (trial-provider와 같은 검사, 계획 리뷰 F1). 주소는 이을 때마다 새로 만든다(ensure는 같은 키면 옛 주소를 돌려줘 바꾼 쉼이 들리지 않는다)
		const dropped = () =>
			!mounted.current ||
			stateRef.current.phase !== "idle" ||
			stateRef.current.run !== run ||
			player.version() !== current.version;
		const blob = await join(heard, () => !dropped());
		if (!blob || dropped()) return;
		urls.current.forget(JOIN_KEY);
		player.toggle(
			JOIN_KEY,
			DRAMA_TEXT.joinAnnounce,
			urls.current.ensure(JOIN_KEY, blob),
			DRAMA_TEXT.lineNoun,
		);
	}

	// 확인을 지나 시작: 읽기는 첫 줄부터 틀고, 받기는 차례로 준비한다
	function begin(run: number) {
		if (stateRef.current.mode === "save") void collect(run);
		else void playLine(run, 0);
	}

	// ElevenLabs 줄이 있을 때만 모델 배율을 받는다. 받지 못하면 배율 1로 센다(trial-confirm useRate와 같다)
	async function ratesOf(
		requests: readonly TrialRequest[],
	): Promise<TrialModelRate[]> {
		if (!requests.some((request) => request.provider === "elevenlabs"))
			return [];
		try {
			const { rates } = await queryClient.fetchQuery({
				...orpc.trialModels.queryOptions(),
				...QUIET,
				staleTime: RATES_STALE,
			});
			return rates;
		} catch {
			return [];
		}
	}

	// '읽기'·'이 줄부터 읽기'·'받기'. 누른 때의 대본으로 끝까지 읽거나 받는다(확인 창이 그 대본의 비용이라서, 스펙 14.2·16.2).
	// 막는 이유는 막대가 늦춘 줄로 보이고, 막 바꾼 대본은 여기서 다시 거른다(DramaProvider.start와 같다). 걸리면 알림으로 그 이유를 보인다
	// 장면을 만드는 중이면 시작하지 않는다(서버 동시 1건, 수정 회차 1). kind는 받기만이다
	async function open(
		mode: ReadMode,
		fromId: string,
		element: HTMLElement | null,
		kind?: SaveKind,
		only = false,
	) {
		if (
			stateRef.current.phase !== "idle" ||
			!drama.ready ||
			drama.generating !== null ||
			!mounted.current
		)
			return;
		const lines = linesRef.current;
		// 요청(무료 기간)과 확인 창 셈(Gemini 단가·무료 기간)이 같은 시각을 쓴다
		const now = Date.now();
		// 저장된 화자를 넘긴다. readRequests가 usableSpeakers로 거른 뒤에만 성우·설정을 읽는다
		const read = readRequests(
			drama.storedSpeakers,
			lines,
			ctxOf(now),
			fromId,
			only ? 1 : undefined,
		);
		// 막대는 첫 줄부터의 이유만 보이므로, 이 줄 뒤에만 있는 이유는 막대와 같은 글(readBlockOf)로 알린다
		if ("problem" in read) {
			const block = readBlockOf(read.problem, drama.speakers, lines);
			toast.error(block.text, { action: blockActionOf(block, lines) });
			return;
		}
		if (read.lines.length === 0) return;
		// 찾기·확인 창 동안 이어 듣기가 계속 나오지 않게 먼저 멈춘다(브리프 15절 6). 받기는 재생하지 않으므로 멈추지 않는다
		if (mode === "read" && joinPlaying(player.current)) player.stop();
		// 받기는 누른 때의 플레이어 판을 잡는다(받는 사이 다른 소리를 틀었으면 이어 듣기를 틀지 않는다)
		const version = player.version();
		const { run } = send({ type: "start", mode });
		setOpener(element);
		setSummary(null);
		const requests = read.lines.map((line) => line.request);
		try {
			const [found, rates] = await Promise.all([
				client.trialFindMany(requests),
				ratesOf(requests),
			]);
			const latest = stateRef.current;
			if (latest.run !== run || latest.phase !== "finding") return;
			// 이미 받았거나 만드는 중인 서명은 그 약속을 이번 줄의 소리로 정한다(다시 만들지 않는다)
			const ready = new Set(sounds.current.keys());
			const order = new Map(lines.map((line, i) => [line.id, i]));
			const next: Plan = {
				run,
				sceneName: drama.sceneName,
				lines: read.lines.map((line, i) => {
					const signature = comboSignature(line.request);
					return {
						...line,
						index: order.get(line.id) ?? i,
						signature,
						found: found[i] ?? null,
						sound: sounds.current.get(signature),
					};
				}),
				...(kind ? { kind, version } : {}),
			};
			plan.current = next;
			const counted = readSummary(
				requests,
				found,
				rates,
				unknown.current,
				ready,
				now,
			);
			setSummary(counted);
			const after = send({
				type: "found",
				run,
				atId: read.lines[0].id,
				total: read.lines.length,
				confirm: counted.confirm,
			});
			if (after.phase === "reading") begin(run);
		} catch (error) {
			send({
				type: "fail",
				run,
				lineId: read.lines[0].id,
				problem: trialFailureOf(error),
			});
		}
	}

	// 읽는 줄 소리를 틀지 못했다. 그 소리를 버려 다음 읽기가 다시 받게 하고(저장된 결과라 과금 없음) 그 줄에서 멈춘다
	function failPlaying() {
		const { run, atId } = stateRef.current;
		const line = plan.current?.lines.find((item) => item.id === atId);
		if (!line) return;
		if (sounds.current.get(line.signature) === line.sound) {
			sounds.current.delete(line.signature);
			unprepare(line.signature);
		}
		urls.current.forget(line.signature);
		send({ type: "fail", run, lineId: line.id, problem: PLAY_FAILED });
	}

	// 플레이어가 바뀔 때마다 읽기에 끼어들었는지 본다(다른 소리 → 멈춤, 읽는 줄 재생 실패 → 그 줄 실패, 계획 리뷰 L6)
	// biome-ignore lint/correctness/useExhaustiveDependencies: 재생 상태가 바뀔 때만 판정한다. 읽기 상태는 최신 값(stateRef)을 읽는다
	useEffect(() => {
		const before = lastCurrent.current;
		lastCurrent.current = player.current;
		const verdict = interrupted(player.current, stateRef.current, before);
		if (verdict === "stop") halt();
		else if (verdict === "fail") failPlaying();
	}, [player.current]);

	// 받은 줄을 쉼을 넣어 WAV 하나로(공급자 호출 없음, 스펙 15·16절). 잇는 중·읽는 중이면 null.
	// 쉼은 지금 줄의 gap과 기본 쉼(gapRef)이다. 잇지 못하면(지원하지 않는 형식 등) null이고, 화면에 있고 alert()가 참일 때만 알린다('줄마다 받기'는 그대로)
	async function join(
		heard: readonly { lineId: string; blob: Blob }[],
		alert: () => boolean,
	): Promise<Blob | null> {
		if (joiningRef.current || stateRef.current.phase !== "idle") return null;
		joiningRef.current = true;
		setJoining(true);
		try {
			return await joinSounds(
				joinPlan(heard, linesRef.current, gapRef.current),
			);
		} catch {
			if (mounted.current && alert()) toast.error(DRAMA_TEXT.joinFailed);
			return null;
		} finally {
			joiningRef.current = false;
			if (mounted.current) setJoining(false);
		}
	}

	// '받기' 메뉴. 받기는 첫 줄부터 대본 전체다(스펙 16.2 '받는 줄'). 잇는 중이거나 줄이 없으면 아무것도 하지 않는다
	function save(kind: SaveKind, element: HTMLElement | null) {
		if (kind === "play" && joinPlaying(player.current)) {
			player.stop();
			return;
		}
		const first = linesRef.current[0];
		if (joiningRef.current || !first) return;
		void open("save", first.id, element, kind);
	}

	const api: DramaReadApi = {
		state,
		summary,
		joining,
		opener,
		start: (fromId, element, only) =>
			void open("read", fromId, element, undefined, only),
		prepared,
		save,
		// 확인 창 단계에서 한 번만 받는다(빠르게 두 번 눌러도 읽기 시작 1회)
		confirm: () => {
			const before = stateRef.current;
			const after = send({ type: "confirm", run: before.run });
			if (after !== before && after.phase === "reading") begin(after.run);
		},
		cancel: () => {
			send({ type: "cancel", run: stateRef.current.run });
		},
		// '멈춤': 읽는 줄 소리도 멈춘다. 다른 소리는 건드리지 않는다
		stop: () => {
			halt();
			const current = player.current;
			if (current && isReadKey(current.voiceId)) player.stop();
		},
	};
	return (
		<DramaReadContext value={api}>
			<LatestLines into={linesRef} />
			{children}
		</DramaReadContext>
	);
}

export function useDramaRead(): DramaReadApi {
	const read = useContext(DramaReadContext);
	if (!read) throw new Error("useDramaRead는 DramaReadProvider 안에서만 쓴다");
	return read;
}
