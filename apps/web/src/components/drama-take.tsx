// apps/web/src/components/drama-take.tsx
"use client";

import type { DramaItem } from "@tts-pilot-app/api/drama-contract";
import { cutWav, type LineSpan } from "@tts-pilot-app/api/drama-script";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@tts-pilot-app/ui/components/dropdown-menu";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	TriangleAlert,
} from "lucide-react";
import {
	type Context,
	createContext,
	type Dispatch,
	type ReactNode,
	type RefObject,
	type SetStateAction,
	type SyntheticEvent,
	useContext,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";

import { saveBlob } from "@/lib/browser";
import { saveFailure } from "@/lib/classes-view";
import { joinPlan } from "@/lib/drama-read";
import {
	chipStateOf,
	DRAMA_TEXT,
	type DraftLine,
	lineFileName,
	pickedTakes,
	sceneFileName,
	speakerNameOf,
	splitOk,
	stageCaption,
	takeGroup,
	takeJoinFileName,
	takeTime,
	zipFileName,
} from "@/lib/drama-view";
import { joinSounds } from "@/lib/sound-join";
import { zipStore } from "@/lib/zip-store";

import { stageOrMain, useDrama } from "./drama-provider";
import { LatestLines } from "./drama-read";
import { showPicksUndo } from "./drama-undo";
import { usePlayer } from "./sample-player";
import { lockedButton } from "./voice-problem";

// 무대 테이크 소리 하나를 무대(시간축)·장면 플레이어·대본 줄(▶·받을 테이크)·막대 받기가 같이 쓴다(스펙 17.2 '장면 플레이어', 17.9).
// 장면 주소(object URL)·플레이어 ref·줄 조각 듣기·받기 넷과 '없어진 테이크' 처리가 여기 있다. 줄 목록과 대본 열쇠를 구독하지 않는다
// (최신 줄은 LatestLines가 ref로, 기본 쉼은 누를 때 읽는다). 재생 위치는 따로 둔 작은 컨텍스트라 시간축만 다시 그린다(계획 리뷰 P5-4·P5-5)

type TakeAudio = {
	// 무대의 테이크(drama.shown)
	take: DramaItem | null;
	// 테이크 모드: Fish 대본이고 무대에 테이크가 있다(스펙 17.2 '막대 모드')
	mode: boolean;
	// 무대 테이크를 대사별로 나눴다
	split: boolean;
	// 나뉘었으면 같은 대본의 나뉜 테이크(오래된 순), 아니면 빈 목록(넘기기·받을 테이크 없음, 재리뷰 R2)
	group: DramaItem[];
	// group 안 무대 테이크 위치, 없으면 -1
	at: number;
	// 나뉘었으면 줄마다 받을 테이크(고른 테이크, 없으면 무대 테이크), 아니면 빈 목록
	picked: DramaItem[];
	// 무대 테이크의 장면 object URL(테이크 모드에서 받은 뒤)
	url: string | null;
	// 장면 소리를 받지 못했다('다시 받기')
	failed: boolean;
	retry: () => void;
	audioRef: RefObject<HTMLAudioElement | null>;
	// 테이크 모드에서만: 그 줄 시작(자른 구간)으로 옮겨 장면을 재생한다
	seekLine: (line: number) => void;
	// 그 줄의 target 조각 듣기. 그 조각이 재생 중이면 toggle일 때만 멈춘다(줄 ▶는 toggle, 받을 테이크 고르기는 아니다)
	play: (line: number, target: DramaItem, toggle: boolean) => void;
	// 받는 중(장면 소리·조각) 또는 대사별 파일·한 파일 받기 진행 중
	busy: boolean;
	// 화면 밖 상태 글(장면 받는 중, 받기 시작·끝). 없으면 ""
	status: string;
	saveScene: () => void;
	// 대사별 파일(zip): 장면 1 + 줄마다 받을 테이크의 대사
	saveAll: () => void;
	saveLine: (line: number) => void;
	// 쉼 넣어 한 파일로(WAV)
	saveJoined: () => void;
	followAll: () => void;
};
// 재생 위치(시간축만 구독한다)
type TakeTime = {
	// 장면 플레이어의 onPlay·onPause·onEnded가 정한다
	playing: boolean;
	// 재생 중인 줄. 멈춤·끝·테이크 바뀜이면 null
	sceneLine: number | null;
};
const TakeAudioContext = createContext<TakeAudio | null>(null);
const TakeTimeContext = createContext<TakeTime | null>(null);
// 장면 플레이어만 쓴다(재생 상태 바꾸기)
const SetTimeContext = createContext<Dispatch<SetStateAction<TakeTime>> | null>(
	null,
);

const WAV = "audio/wav";
const TIME_IDLE: TakeTime = { playing: false, sceneLine: null };
// 받기 끝 알림을 읽힐 시간을 두고 지운다(같은 테이크에서 다시 그려져도, 돌아와도 다시 읽히지 않게)
const STATUS_CLEAR_MS = 3000;

// 줄 듣기의 플레이어 키(받을 테이크 + 줄). 같은 키를 다시 누르면 멈춘다(sample-player pressSample)
export const lineKey = (take: string, line: number) => `drama:${take}:${line}`;
// 그 줄의 화자 이름(이름 뒤에는 조사를 붙이지 않는다, 빈 이름은 번호 이름)
const speakerOf = (take: DramaItem, line: number) =>
	speakerNameOf(take.request.speakers, take.request.lines[line]?.speaker ?? 0);
// 그 시각이 든 줄(자른 구간 기준, 없으면 그 앞에서 가장 가까운 줄)
export function lineAt(segments: readonly LineSpan[], time: number): number {
	let at = 0;
	segments.forEach((segment, i) => {
		if (segment.cutStart <= time) at = i;
	});
	return at;
}

export function TakeAudioProvider({ children }: { children: ReactNode }) {
	const drama = useDrama();
	const player = usePlayer();
	const take = drama.shown;
	const mode = drama.fishOnly && take !== null;
	const split = take !== null && splitOk(take);
	// 나누지 못한 테이크는 takeGroup 밖이다(넘기기·받을 테이크·대사별 파일 없음, 재리뷰 R2)
	const group = take && split ? takeGroup(drama.takes ?? [], take) : [];
	const at = take ? group.findIndex((item) => item.id === take.id) : -1;
	const picked = take && split ? pickedTakes(group, drama.picks, take) : [];
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const linesRef = useRef<DraftLine[]>([]);
	// 받은 장면 오디오 주소(url null이면 받기 실패). id가 무대의 테이크와 다르면 받는 중이다
	const [scene, setScene] = useState<{ id: string; url: string | null } | null>(
		null,
	);
	const [attempt, setAttempt] = useState(0);
	// 대사별 파일·한 파일 받기 진행. 받는 동안 다른 받기를 잠근다
	const [saving, setSaving] = useState(false);
	const [saveStatus, setSaveStatus] = useState("");
	// 줄 듣기 조각의 주소(바꾸거나 떠날 때 푼다)와 마지막 듣기 요청(늦게 온 앞 요청이 뒤 요청을 덮지 않게)
	const lineUrl = useRef<string | null>(null);
	const listenTicket = useRef(0);
	const mounted = useRef(true);
	const loaded = mode && take && scene?.id === take.id ? scene : null;
	const { receiving } = drama;
	const busy = receiving !== null || saving;

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			if (lineUrl.current) URL.revokeObjectURL(lineUrl.current);
		};
	}, []);
	// 테이크 모드에서 장면을 받아 플레이어에 올린다(올리기만, 자동 재생 없음). 같은 테이크의 바이트는 provider가 기억한다.
	// 혼합 대본이면 받지 않는다(무대 테이크를 틀지 않는다, 스펙 17.2 '혼합 대본과 무대 테이크')
	// biome-ignore lint/correctness/useExhaustiveDependencies: 무대의 테이크(id)·테이크 모드가 바뀌거나 '다시 받기'를 누를 때만 받는다. sceneAudio는 렌더마다 새 함수지만 같은 기억을 쓴다
	useEffect(() => {
		// 다른 테이크로 가면 받기 끝 알림을 지운다(돌아와도 옛 알림이 다시 읽히지 않게). 받는 중이면 진행 알림을 그대로 둔다
		if (!saving) setSaveStatus("");
		if (!take || !mode) return;
		let live = true;
		let url: string | null = null;
		const id = take.id;
		drama.sceneAudio(take).then(
			(bytes) => {
				if (!live) return;
				url = URL.createObjectURL(new Blob([bytes], { type: WAV }));
				setScene({ id, url });
			},
			(error: unknown) => {
				if (!live) return;
				setScene({ id, url: null });
				// 찾을 수 없으면 무대를 같은 대본의 가장 새 테이크(없으면 무대 없음)로. 다른 실패는 플레이어 자리의 sceneFailed가 말한다
				if (saveFailure(error) === "not_found") gone(take);
			},
		);
		// 푼 주소·실패를 state에 남기지 않는다(앞뒤로 빠르게 넘겨 같은 테이크로 돌아와도 깨진 플레이어를 그리지 않게)
		return () => {
			live = false;
			if (url) URL.revokeObjectURL(url);
			setScene(null);
		};
	}, [take?.id, mode, attempt]);
	// 받기 끝 알림은 읽힐 시간 뒤에 지운다. 그사이 새 받기가 알림을 바꿨으면 그대로 둔다
	useEffect(() => {
		const done = saveStatus;
		if (done !== DRAMA_TEXT.receivedAll && done !== DRAMA_TEXT.joinTakeSaved)
			return;
		const timer = setTimeout(
			() => setSaveStatus((text) => (text === done ? "" : text)),
			STATUS_CLEAR_MS,
		);
		return () => clearTimeout(timer);
	}, [saveStatus]);

	// 찾을 수 없는 테이크(다른 탭에서 지움·만료): 알리고 무대·받기 기억에서 내린다(무대에 있었으면 같은 대본의 가장 새 테이크로, provider가 목록을 다시 받는다).
	// 누른 곳이 무대·막대·줄 어디든, 그린 뒤 포커스가 빠졌으면(누른 버튼·플레이어가 사라짐) 무대 제목, 무대도 없으면 주 버튼으로 옮긴다.
	// 다른 칸에서 쓰는 중이면 옮기지 않는다(재리뷰 R5-2)
	function gone(target: DramaItem) {
		toast.error(DRAMA_TEXT.notFound);
		drama.removeTake(target.id);
		requestAnimationFrame(() => {
			const active = document.activeElement;
			if (active === null || active === document.body) stageOrMain()?.focus();
		});
	}
	// 받기·듣기 실패: 찾을 수 없으면 gone, 그 밖은 알림(크레딧은 들지 않는다)
	function receiveFailed(error: unknown, target: DramaItem) {
		if (saveFailure(error) === "not_found") gone(target);
		else toast.error(DRAMA_TEXT.downloadFailed);
	}

	// 줄 듣기: 그 줄이 받을 테이크의 조각(cutWav)을 페이지의 플레이어 하나로 재생한다(한 번에 한 오디오).
	// 그 조각이 재생 중이면 toggle이면 멈추고, 아니면(고름 = 듣기) 그대로 둔다
	async function play(line: number, target: DramaItem, toggle: boolean) {
		const key = lineKey(target.id, line);
		const current = player.current;
		if (current?.voiceId === key && current.status !== "failed") {
			if (toggle) player.stop();
			return;
		}
		const span = target.segments?.[line];
		if (!span) return;
		const ticket = ++listenTicket.current;
		try {
			const bytes = await drama.sceneAudio(target, `play:${line}`);
			if (ticket !== listenTicket.current) return;
			const url = URL.createObjectURL(
				new Blob(cutWav(bytes, span), { type: WAV }),
			);
			player.toggle(
				key,
				DRAMA_TEXT.lineName(line + 1, speakerOf(target, line)),
				url,
				DRAMA_TEXT.lineNoun,
			);
			if (lineUrl.current) URL.revokeObjectURL(lineUrl.current);
			lineUrl.current = url;
		} catch (error) {
			receiveFailed(error, target);
		}
	}
	// 테이크 모드에서만: 그 줄의 자른 구간 시작부터 장면을 재생한다(사용자가 누른 재생이다, 자동 재생 아님)
	function seekLine(line: number) {
		const audio = audioRef.current;
		const span = split ? take?.segments?.[line] : undefined;
		if (!mode || !audio || !span) return;
		audio.currentTime = span.cutStart;
		void audio.play().catch(() => {});
	}
	async function saveLine(line: number) {
		const target = picked[line];
		const span = target?.segments?.[line];
		if (!target || !span) return;
		try {
			const bytes = await drama.sceneAudio(target, `save:${line}`);
			saveBlob(
				new Blob(cutWav(bytes, span), { type: WAV }),
				lineFileName(target.request.sceneName, line, speakerOf(target, line)),
			);
		} catch (error) {
			receiveFailed(error, target);
		}
	}
	async function saveScene() {
		if (!take) return;
		try {
			const bytes = await drama.sceneAudio(take, "scene");
			saveBlob(
				new Blob([bytes], { type: WAV }),
				sceneFileName(take.request.sceneName, take.createdAt),
			);
		} catch (error) {
			receiveFailed(error, take);
		}
	}
	// '대사별 파일'(zip, 장면 + 줄마다 받을 테이크의 대사)·'쉼 넣어 한 파일로'(join, 받을 테이크 조각을 줄 쉼으로 이은 WAV, 스펙 17.2).
	// 테이크마다 장면 오디오를 차례로 한 번 받는다(로컬 DB, 공급자 호출 없음). 중간에 실패하면 아무것도 저장하지 않는다(브리프 5.10 받기 진행)
	async function saveTakes(kind: "zip" | "join") {
		if (!take || !split || busy) return;
		// 한 파일로는 누를 때의 최신 줄과 기본 쉼으로 잇는다. 줄 수가 테이크와 다르면(그사이 고침) 하지 않는다(재리뷰 R5-1)
		const lines = linesRef.current;
		const gap = drama.gap;
		if (kind === "join" && lines.length !== picked.length) return;
		setSaving(true);
		setSaveStatus(
			kind === "zip" ? DRAMA_TEXT.receivingAll : DRAMA_TEXT.joinTakeSaving,
		);
		// 받고 있는 테이크(찾을 수 없으면 그 테이크를 내린다)
		let current = take;
		try {
			const audio = new Map<string, Uint8Array<ArrayBuffer>>();
			for (const target of kind === "zip" ? [take, ...picked] : picked) {
				if (audio.has(target.id)) continue;
				current = target;
				audio.set(target.id, await drama.sceneAudio(target, kind));
			}
			const bytesOf = (target: DramaItem) => {
				const bytes = audio.get(target.id);
				if (!bytes) throw new Error("missing take audio");
				return bytes;
			};
			const cuts = picked.map((target, line) => {
				const span = target.segments?.[line];
				if (!span) throw new Error("missing line span");
				return cutWav(bytesOf(target), span);
			});
			if (kind === "zip")
				saveBlob(
					zipStore([
						{
							name: sceneFileName(take.request.sceneName, take.createdAt),
							parts: [bytesOf(take)],
						},
						...cuts.map((parts, line) => ({
							name: lineFileName(
								take.request.sceneName,
								line,
								speakerOf(take, line),
							),
							parts,
						})),
					]),
					zipFileName(take.request.sceneName, take.createdAt),
				);
			else {
				const blob = await joinSounds(
					joinPlan(
						lines.map((line, i) => ({
							lineId: line.id,
							blob: new Blob(cuts[i], { type: WAV }),
						})),
						lines,
						gap,
					),
				);
				// 화면을 떠났으면 저장도 알림도 하지 않는다(drama-read 받기와 같다)
				if (!mounted.current) return;
				saveBlob(
					blob,
					takeJoinFileName(take.request.sceneName, take.createdAt),
				);
			}
			setSaveStatus(
				kind === "zip" ? DRAMA_TEXT.receivedAll : DRAMA_TEXT.joinTakeSaved,
			);
		} catch (error) {
			setSaveStatus("");
			if (mounted.current) receiveFailed(error, current);
		} finally {
			setSaving(false);
		}
	}
	// '모든 줄을 이 테이크로': 이 그룹의 고른 테이크를 비워 모든 줄이 무대 테이크를 따라간다. 버튼이 사라지므로 포커스는 무대 제목.
	// 알림 '실행 취소'(비우기 전 고른 값)는 대본 실행 취소와 다른 칸이라 대본 실행 취소 알림을 닫지 않는다(리뷰 M1)
	function followAll() {
		const undo = drama.clearPicks();
		drama.focusStage();
		showPicksUndo(DRAMA_TEXT.followedAll, undo);
	}

	const audio: TakeAudio = {
		take,
		mode,
		split,
		group,
		at,
		picked,
		url: loaded?.url ?? null,
		failed: loaded !== null && loaded.url === null,
		// 누른 '다시 받기'가 뼈대로 바뀌므로 포커스는 무대 제목(테이크가 있으면 늘 있다)
		retry: () => {
			setScene(null);
			setAttempt((count) => count + 1);
			drama.focusStage();
		},
		audioRef,
		seekLine,
		play: (line, target, toggle) => void play(line, target, toggle),
		busy,
		status: mode && loaded === null ? DRAMA_TEXT.receivingScene : saveStatus,
		saveScene: () => void saveScene(),
		saveAll: () => void saveTakes("zip"),
		saveLine: (line) => void saveLine(line),
		saveJoined: () => void saveTakes("join"),
		followAll,
	};
	return (
		<TakeAudioContext value={audio}>
			<TakeTimeProvider>
				<LatestLines into={linesRef} />
				{children}
			</TakeTimeProvider>
		</TakeAudioContext>
	);
}

// 재생 위치만 드는 그릇. 바뀌면 이 그릇과 재생 위치를 읽는 쪽만 다시 그린다(테이크 소리 값과 children은 그대로다).
// React Compiler가 try/finally 때문에 TakeAudioProvider를 건너뛰어도 값이 새로 생기지 않게 따로 둔다(계획 리뷰 P5-4·P5-5)
function TakeTimeProvider({ children }: { children: ReactNode }) {
	const [time, setTime] = useState<TakeTime>(TIME_IDLE);
	return (
		<SetTimeContext value={setTime}>
			<TakeTimeContext value={time}>{children}</TakeTimeContext>
		</SetTimeContext>
	);
}

export function useTakeAudio(): TakeAudio {
	const audio = useContext(TakeAudioContext);
	if (!audio) throw new Error("useTakeAudio는 TakeAudioProvider 안에서만 쓴다");
	return audio;
}

// 재생 위치. 시간축만 읽는다(장면 재생 중 줄이 바뀔 때만 다시 그린다)
export function useTakeTime(): TakeTime {
	const time = useContext(TakeTimeContext);
	if (!time) throw new Error("useTakeTime은 TakeAudioProvider 안에서만 쓴다");
	return time;
}

function usePrivate<T>(context: Context<T | null>): T {
	const value = useContext(context);
	if (!value) throw new Error("TakeAudioProvider 안에서만 쓴다");
	return value;
}

// 장면 소리 하나(주소마다 새로 그린다). 한 번에 한 오디오: 재생하면 줄 듣기·기본 샘플·읽기를 멈추고, 그것들이 재생되면 장면을 멈춘다.
// 재생 상태와 재생 중인 줄(useTakeTime)은 시간축이 읽는다. 멈추거나 끝나거나 소리가 사라지면 내린다
function SceneAudio({
	take,
	url,
	label,
}: {
	take: DramaItem;
	url: string;
	label: string;
}) {
	const player = usePlayer();
	const { audioRef } = useTakeAudio();
	const setTime = usePrivate(SetTimeContext);
	const segments = splitOk(take) ? (take.segments ?? []) : [];
	const sampling =
		player.current !== null && player.current.status !== "failed";
	useEffect(() => {
		if (sampling) audioRef.current?.pause();
	}, [sampling, audioRef]);
	// 테이크가 바뀌거나 받기 실패·혼합 대본으로 플레이어가 사라지면 재생 표시를 내린다(사라진 소리는 pause를 알리지 않는다)
	useEffect(() => () => setTime(TIME_IDLE), [setTime]);
	const stopped = () => setTime(TIME_IDLE);
	const mark = (event: SyntheticEvent<HTMLAudioElement>) => {
		const audio = event.currentTarget;
		// 멈춘 채 옮긴 위치는 재생 중인 줄이 아니다(멈추면 null)
		const line =
			audio.paused || segments.length === 0
				? null
				: lineAt(segments, audio.currentTime);
		setTime((now) =>
			now.sceneLine === line ? now : { ...now, sceneLine: line },
		);
	};
	return (
		// biome-ignore lint/a11y/useMediaCaption: 대사 글은 대본에 있다(생성 오디오에는 자막 트랙이 없다)
		<audio
			ref={audioRef}
			controls
			preload="metadata"
			src={url}
			aria-label={label}
			className="min-w-0 flex-1"
			onPlay={() => {
				player.stop();
				setTime((now) => (now.playing ? now : { ...now, playing: true }));
			}}
			// 끝나도 pause가 오지만 ended도 같이 받는다
			onPause={stopped}
			onEnded={stopped}
			onSeeked={mark}
			onTimeUpdate={mark}
		/>
	);
}

// 장면 플레이어(스펙 17.2 '장면 플레이어'·'테이크 넘기기'). 테이크 모드일 때만 그린다: [‹][테이크 n / m][›](같은 대본 테이크가 둘 이상) + <audio controls>.
// 접근 이름은 무대 캡션이다. 넘기기는 누른 버튼에 포커스가 남는다(테이크가 바뀌어도 이 그릇은 그대로다).
// 받는 중이면 플레이어 자리 뼈대, 받지 못하면 경고와 '다시 받기'다
export function TakePlayer() {
	const drama = useDrama();
	const { take, mode, group, at, url, failed, retry } = useTakeAudio();
	const atId = useId();
	if (!mode || !take) return null;
	const nav = group.length > 1 && at >= 0;
	return (
		<div className="flex min-w-0 items-center gap-1">
			{nav ? (
				<div className="flex shrink-0 items-center">
					<Button
						variant="ghost"
						size="icon-lg"
						aria-label={DRAMA_TEXT.prevTake}
						focusableWhenDisabled
						disabled={at === 0}
						// 끝이라 잠긴 이유는 넘기기 글('테이크 1 / 3')이 말한다(브리프 9.1)
						aria-describedby={at === 0 ? atId : undefined}
						className={lockedButton(true)}
						onClick={() => {
							const prev = group[at - 1];
							if (prev) drama.show(prev.id);
						}}
					>
						<ChevronLeft aria-hidden="true" />
					</Button>
					<span
						id={atId}
						className="whitespace-nowrap px-1 font-bold text-sm tabular-nums"
					>
						{DRAMA_TEXT.takeAt(at + 1, group.length)}
					</span>
					<Button
						variant="ghost"
						size="icon-lg"
						aria-label={DRAMA_TEXT.nextTake}
						focusableWhenDisabled
						disabled={at === group.length - 1}
						aria-describedby={at === group.length - 1 ? atId : undefined}
						className={lockedButton(true)}
						onClick={() => {
							const next = group[at + 1];
							if (next) drama.show(next.id);
						}}
					>
						<ChevronRight aria-hidden="true" />
					</Button>
				</div>
			) : null}
			{failed ? (
				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
					<p role="alert" className="flex gap-2 text-sm text-warning">
						<TriangleAlert
							aria-hidden="true"
							className="mt-0.5 size-4 shrink-0"
						/>
						{DRAMA_TEXT.sceneFailed}
					</p>
					<Button variant="outline" size="lg" onClick={retry}>
						{DRAMA_TEXT.retryReceive}
					</Button>
				</div>
			) : url === null ? (
				// 받는 중: 플레이어 자리 뼈대(화면 밖 알림은 status가 말한다)
				<Skeleton
					aria-hidden="true"
					className="h-12 min-w-0 flex-1 rounded-full"
				/>
			) : (
				<SceneAudio
					key={url}
					take={take}
					url={url}
					label={stageCaption(take, group)}
				/>
			)}
		</div>
	);
}

// 줄마다 받을 테이크(스펙 17.2 '받을 테이크 ▾', 브리프 17절 10). 무대 TakeChoice의 메뉴를 옮긴 하나 고르기 메뉴다.
// 보이는 글은 그 줄이 받을 테이크 번호 T{k}이고 고른 값이 있으면 청록 글자다. 무대를 따라가면 접근 이름과 그 항목 끝에 '무대 따라감'(WCAG 2.5.3, 계획 리뷰 P5-11).
// 고르면 그 줄을 그 테이크로 바로 듣는다(고름 = 듣기). 받는 중이거나 그 조각이 이미 재생 중이면 고르기만 한다(P5-12).
// 무대를 따라가는 줄에서 지금 테이크를 고르면 그 테이크로 고정한다(audit P3)
export function TakePick({ line }: { line: number }) {
	const drama = useDrama();
	const { group, picked, busy, play } = useTakeAudio();
	const target = picked[line];
	if (!target) return null;
	const chip = (take: DramaItem, i: number) =>
		DRAMA_TEXT.takeChip(
			i + 1,
			takeTime(take.createdAt),
			DRAMA_TEXT.modelName[take.request.model],
		);
	const shown = `T${group.findIndex((take) => take.id === target.id) + 1}`;
	// 고른 값이 없거나 그룹에 없으면(지움·다른 대본) 무대 테이크를 따라간다
	const follows =
		chipStateOf(target.id, drama.picks[line], target.id) === "follows";
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="lg"
						aria-label={DRAMA_TEXT.takeMenuLabel(
							line + 1,
							follows ? DRAMA_TEXT.follows(shown) : shown,
						)}
						className={cn(
							"gap-0.5 pl-2.5 tabular-nums has-data-[icon=inline-end]:pr-1.5",
							follows
								? "text-muted-foreground"
								: "text-primary hover:text-primary aria-expanded:text-primary",
						)}
					/>
				}
			>
				{shown}
				<ChevronDown data-icon="inline-end" aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-auto min-w-48 p-1" align="end">
				<DropdownMenuRadioGroup
					value={target.id}
					onValueChange={(next) => {
						if (typeof next !== "string" || (next === target.id && !follows))
							return;
						drama.pick(line, next);
						const chosen = group.find((take) => take.id === next);
						if (chosen && !busy) play(line, chosen, false);
					}}
				>
					{group.map((take, i) => (
						<DropdownMenuRadioItem key={take.id} value={take.id} closeOnClick>
							{take.id === target.id && follows
								? DRAMA_TEXT.follows(chip(take, i))
								: chip(take, i)}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
