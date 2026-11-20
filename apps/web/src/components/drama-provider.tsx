// apps/web/src/components/drama-provider.tsx
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DramaItem } from "@tts-pilot-app/api/drama-contract";
import {
	DRAMA_LINES_MAX,
	DRAMA_MODELS,
	DRAMA_SETTINGS,
	DRAMA_SPEAKERS_MAX,
	type DramaModel,
	type DramaRequest,
	type DramaSettings,
	takeKey,
} from "@tts-pilot-app/api/drama-script";
import type { Preset } from "@tts-pilot-app/api/preset-contract";
import type { ProviderId, Voice } from "@tts-pilot-app/api/providers/contract";
import {
	normalizeText,
	type Usage,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import {
	createContext,
	type ReactNode,
	type RefObject,
	useContext,
	useDeferredValue,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";

import { loadStored, store } from "@/lib/browser";
import { MESSAGES, saveFailure } from "@/lib/classes-view";
import {
	actingOf,
	allFish,
	badgeEdit,
	countLine,
	DRAFT_KEY,
	DRAMA_TEXT,
	type Draft,
	type DraftLine,
	type DraftSpeaker,
	dramaBlock,
	newestOf,
	newSpeaker,
	nextSpeaker,
	nextSpeakerName,
	readDraft,
	refocusAfterReload,
	requestOf,
	restorePicks,
	scriptUndo,
	speakerValue,
	unusableSpeaker,
	usableSpeakers,
	voiceOfSpeaker,
	withoutPicks,
} from "@/lib/drama-view";
import { unlessModal } from "@/lib/modal-action";
import { GAP_DEFAULT } from "@/lib/sound-join";
import {
	createFailureOf,
	fetchAudio,
	type ListLoad,
	listLoad,
	pickableVoices,
	savedOf,
	unknownRefetch,
} from "@/lib/studio-view";
import type { TrialProblem } from "@/lib/trial-view";
import { client, OWNED_LIST, orpc } from "@/utils/orpc";

import { usePresetList } from "./presets";
import { savedListKey, useSavedList, writeBack } from "./saved-voices";

// 드라마 작업실의 초안·데이터·생성 상태(T9.5 계획 Task 8, 브리프 docs/briefs/drama.md).
// 줄 목록은 안쪽 LinesProvider의 작은 컨텍스트에만 둔다(입력 지연, studio ScriptProvider와 같은 뜻). 글자를 쳐도 useDrama만 읽는 쪽은 다시 그리지 않는다.
// 화자 카드(useSpeakerLines)는 줄 수가 바뀔 때만, 무대·이전 테이크(useScriptKey)는 대본 열쇠가 바뀔 때 늦춘 줄로(낮은 우선순위) 다시 그린다.
// 줄을 고치는 모든 길은 changeLines 하나를 지나 최신 줄(linesRef)·저장·줄 컨텍스트를 함께 바꾼다

type Meta = Omit<Draft, "lines">;
type Field = "text" | "direction";
type Focus = { line: string; field: Field; start: number; end: number };
type DramaProblem = TrialProblem & { speaker: string | null };

export type DramaPending = {
	request: DramaRequest;
	requestId: string;
	opener: HTMLElement | null;
	usage: Usage;
	bytes: number;
	unknownSame: boolean;
};

type DramaApi = {
	// 임시 작업을 읽었고, 저장한 성우가 있으면 담은 목록이 '받는 중'이 아니다(목록 실패여도 참)
	ready: boolean;
	sceneName: string;
	// usableSpeakers를 거친 값. 초안에는 성우 id를 그대로 둔다(계획 리뷰 P4)
	speakers: DraftSpeaker[];
	// 저장된 화자(usableSpeakers 전). 읽기가 프리셋 목록 실패 때 저장된 presetId를 보고 막는다(readRequests가 거른 뒤에만 성우·설정을 읽는다)
	storedSpeakers: DraftSpeaker[];
	model: DramaModel;
	settings: DramaSettings;
	setSceneName: (value: string) => void;
	renameSpeaker: (index: number, name: string) => void;
	addSpeaker: () => void;
	removeSpeaker: (index: number) => void;
	// 담은 성우나 프리셋(presetId, 그 프리셋의 성우)을 화자에 붙인다
	setVoice: (
		index: number,
		voice: { provider: ProviderId; voiceId: string },
		presetId: string | null,
	) => void;
	// '전체'에서 고르기(공급자 상관없음). 담지 못했거나 쓸 수 없는 성우면 false(창은 열린 채)
	pickFromAll: (index: number, voice: Voice) => Promise<boolean>;
	setModel: (model: DramaModel) => void;
	// 모델을 바꾸고 알린 뒤 포커스를 막대의 주 버튼으로(막대 402 줄 '무료 모델로 바꾸기', 무대 나누지 못함 안내). 다시 만들기는 사용자가 누른다
	switchModel: (model: DramaModel) => void;
	setSettings: (settings: DramaSettings) => void;
	// 줄 사이 기본 쉼(초, 스펙 15절). 줄 쉼은 setLine(id, { gap })이고 지우기는 { gap: undefined }다
	gap: number;
	// 저장만 한다. 쉼은 장면 요청을 바꾸지 않으므로 오류 줄을 내리지 않는다(계획 리뷰 F4)
	setGap: (gap: number) => void;
	// 담은 성우(모든 공급자, 고르기 창 정렬)
	savedVoices: SavedVoice[];
	// 이용 가능한 성우의 프리셋
	presets: Preset[];
	// 화자의 연기 family·받는 감정·모델(actingOf). 쓰인 화자가 모두 Fish면 Fish 화자는 머리 모델이다
	actingOf: (index: number) => ReturnType<typeof actingOf>;
	// 쓰인 화자가 모두 Fish Audio인가(장면을 만들 수 있다)
	fishOnly: boolean;
	voicesLoad: ListLoad;
	// 다시 받기가 성공해 버튼이 사라지면 focusTarget()의 요소로 포커스를 옮긴다(버튼이 포커스를 쥐고 있었을 때만, WCAG 2.4.3)
	reloadVoices: (focusTarget: () => HTMLElement | null) => void;
	// 프리셋 목록 다시 받기(성우 창 프리셋 탭 실패 줄). 포커스 규칙은 reloadVoices와 같다
	reloadPresets: (focusTarget: () => HTMLElement | null) => void;
	takes: DramaItem[] | undefined;
	takesLoad: ListLoad;
	// 테이크 목록을 받는 중('다시 불러오기' 스피너·aria-busy, 15초 다시 받기 포함)
	takesFetching: boolean;
	reloadTakes: (focusTarget: () => HTMLElement | null) => void;
	shown: DramaItem | null;
	show: (id: string) => void;
	focusStage: () => void;
	// 지금 shown의 takeKey 아래 줄마다 고른 테이크
	picks: Record<number, string>;
	pick: (line: number, takeId: string) => void;
	// 지금 shown의 takeKey 아래 고른 테이크를 비운다(모든 줄이 무대 테이크를 따라간다). 실행 취소 함수를 돌려준다(그 열쇠의 고른 값 그대로)
	clearPicks: () => () => void;
	// 조각을 받아 합친 WAV 바이트. action을 주면 받는 동안 receiving이 그 키다(눌린 버튼의 받는 중 표시, 브리프 5.10)
	sceneAudio: (
		take: DramaItem,
		action?: string,
	) => Promise<Uint8Array<ArrayBuffer>>;
	receiving: string | null;
	generating: { startedAt: number } | null;
	start: (opener: HTMLElement | null) => void;
	pending: DramaPending | null;
	confirm: (pending: DramaPending) => void;
	cancel: () => void;
	problem: DramaProblem | null;
	// 확인 창이 지웠거나 이미 없는 테이크를 무대·받기 기억에서 내린다(T9 forget과 같다. 지우기 호출은 확인 창이 한다)
	removeTake: (id: string) => void;
	// 테이크의 대본으로 바꾸고 실행 취소 함수를 돌려준다(바꾸기 직전 장면 이름·화자·줄 그대로)
	restoreScript: (take: DramaItem) => () => void;
};

type LineEdits = {
	// feel(Typecast 감정·Airy 말투)도 같은 길로 바꾼다
	setLine: (id: string, patch: Partial<Omit<DraftLine, "id">>) => void;
	// 새 줄 id. 50줄이면 null
	addLine: (after?: string) => string | null;
	moveLine: (id: string, by: -1 | 1) => void;
	// 실행 취소 함수(지우기 직전 화자·줄 그대로). 지우지 않았으면(마지막 한 줄, 없는 줄) null
	removeLine: (id: string) => (() => void) | null;
	// 붙여 넣기 '바꾸기'. from[i]는 새 화자 i가 성우를 잇는 지금 화자의 번호(없으면 null, parsePaste).
	// from이 없으면 받은 성우 id 그대로. 실행 취소 함수를 돌려준다(바꾸기 직전 화자·줄 그대로)
	replace: (
		speakers: DraftSpeaker[],
		lines: DraftLine[],
		from?: readonly (number | null)[],
	) => () => void;
};
type LinesApi = LineEdits & {
	lines: DraftLine[];
	noteFocus: (at: Focus) => void;
	applyBadge: (kind: "sound" | "span" | "mood", value: string) => void;
	// 연기 지시를 넣을 줄(마지막 포커스 줄). 없으면 null
	badgeTarget: string | null;
};

const DramaContext = createContext<DramaApi | null>(null);
const LinesContext = createContext<LinesApi | null>(null);
const SpeakerLinesContext = createContext<number[] | null>(null);
const ScriptKeyContext = createContext<string | null>(null);

// 무대 제목(h2 tabIndex=-1)의 id. '무대 보기'·'무대에 올리기'가 여기로 포커스를 옮긴다
export const DRAMA_STAGE_ID = "drama-stage";

// 다시 받기 성공으로 '다시 불러오기' 버튼이 사라지면 포커스가 body로 빠진다. 받는 동안 사용자가 다른 곳을 누르지 않았으면 제목으로 옮긴다. 실패하면 버튼에 남는다
async function reloadThen(
	refetch: () => Promise<{ isSuccess: boolean }>,
	target: () => HTMLElement | null,
) {
	const button = document.activeElement;
	let userMoved = false;
	const onDown = () => {
		userMoved = true;
	};
	document.addEventListener("pointerdown", onDown, { once: true });
	const { isSuccess } = await refetch();
	document.removeEventListener("pointerdown", onDown);
	const now = document.activeElement;
	if (
		refocusAfterReload({
			success: isSuccess,
			activeIsButton: now === button,
			activeIsBody: now === document.body,
			userMoved,
		})
	)
		target()?.focus();
}

// 막대 주 버튼('장면 만들기')의 id. 모델을 바꾼 뒤(switchModel) 포커스가 여기로 간다
export const DRAMA_MAIN_ID = "drama-main";
// 무대 제목, 무대가 없으면(테이크도 만드는 중도 없음) 막대 주 버튼. 무대로 가던 포커스가 모두 이것을 쓴다(계획 리뷰 P5-2)
export const stageOrMain = () =>
	document.getElementById(DRAMA_STAGE_ID) ??
	document.getElementById(DRAMA_MAIN_ID);
// 줄 칸(대사 textarea, 지시 input)의 id. 뱃지 넣기와 막는 이유의 '{n}번 줄로'가 칸을 찾는다
export const dramaFieldId = (line: string, field: Field) =>
	`drama-${field}-${line}`;

const newId = () => crypto.randomUUID();
const NO_PICKS: Record<number, string> = {};
// 읽기 전 고침의 실행 취소(되살릴 것이 없다)
const NO_UNDO = () => undefined;
// 받은 장면 WAV를 기억하는 테이크 수(최대 32MiB씩, E13)
const AUDIO_KEPT = 3;
// 임시 작업을 읽기 전 머리가 쓰는 값. 서버 그리기와 같게 고정 값이다(화자·대본 자리는 뼈대)
const BLANK: Meta = {
	sceneName: "",
	speakers: [],
	model: DRAMA_MODELS[0],
	settings: DRAMA_SETTINGS,
	picks: {},
	gap: GAP_DEFAULT,
};

// 이 브라우저의 임시 작업에 쓴다. 줄 id는 읽을 때 새로 만들므로 빼고 쓴다(client-localstorage-schema).
// 줄 쉼이 없으면(undefined) JSON에서 빠진다
function persist(meta: Meta, lines: readonly DraftLine[]) {
	store(
		DRAFT_KEY,
		JSON.stringify({
			...meta,
			lines: lines.map(({ speaker, direction, text, feel, gap }) => ({
				speaker,
				direction,
				text,
				feel,
				gap,
			})),
		}),
	);
}

// 지금 대본의 열쇠(takeKey). 화자 성우는 저장된 id(성우 없는 화자는 빈 id라 어느 테이크와도 같지 않다, countLine과 같은 자리).
// 무대·이전 테이크의 '같은 대본' 판정(useScriptKey)과 처음 무대가 이 규칙 하나를 쓴다(Ruling 17)
const scriptKey = (speakers: readonly DraftSpeaker[], lines: DraftLine[]) =>
	takeKey({
		speakers: speakers.map(({ name, voiceId }) => ({
			name,
			voiceId: voiceId ?? "",
		})),
		lines,
	});
const fieldElement = (id: string) => {
	const element = document.getElementById(id);
	return element instanceof HTMLTextAreaElement ||
		element instanceof HTMLInputElement
		? element
		: null;
};

// 줄 목록만 드는 작은 컨텍스트. 바깥은 bridge로 줄 상태를 바꾸고(읽기·화자 빼기·되돌리기), 줄 고침은 edits(바깥의 changeLines)를 지난다
function LinesProvider({
	latest,
	bridge,
	edits,
	speakers,
	children,
}: {
	latest: RefObject<DraftLine[]>;
	bridge: RefObject<((lines: DraftLine[]) => void) | null>;
	edits: LineEdits;
	// 저장된 화자(성우 id를 거르지 않은 값)
	speakers: DraftSpeaker[];
	children: ReactNode;
}) {
	const [lines, setLines] = useState<DraftLine[]>([]);
	const [badgeTarget, setBadgeTarget] = useState<string | null>(null);
	// 마지막 포커스 자리. 입력·선택마다 바뀌므로 다시 그리지 않는 ref에 둔다(rerender-use-ref-transient-values)
	const focus = useRef<Focus | null>(null);
	// 대상 줄이 사라졌으면(지움·바꾸기·되돌리기) 대상을 비운다
	useImperativeHandle(
		bridge,
		() => (next: DraftLine[]) => {
			setLines(next);
			const at = focus.current;
			if (at && !next.some((line) => line.id === at.line)) {
				focus.current = null;
				setBadgeTarget(null);
			}
		},
		[],
	);

	// 줄 컨텍스트 값. 늦춘 줄(useDeferredValue)로 다시 그릴 때는 줄·대상·고침이 그대로라 같은 값이다(줄 칸을 다시 그리지 않는다)
	const api = useMemo((): LinesApi => {
		// 칸에 포커스를 주고 바꿀 범위를 고른 뒤 insertText로 넣어 브라우저 되돌리기(Ctrl+Z)에 남긴다(DN-6, 브리프 11절 7).
		// 칸이 없거나 포커스를 받지 못하거나 execCommand가 false면 setLine으로 넣는다(되돌리기 없음).
		// execCommand는 포커스가 있는 칸에 넣으므로 그 칸이 포커스를 받았을 때만 부른다
		function applyBadge(kind: "sound" | "span" | "mood", value: string) {
			const at = focus.current;
			const line = at && latest.current.find((item) => item.id === at.line);
			if (!at || !line) return;
			const field: Field = kind === "mood" ? "direction" : "text";
			const old = line[field];
			const { from, to, text, select } = badgeEdit(kind, old, at, value);
			const id = dramaFieldId(line.id, field);
			const element = fieldElement(id);
			element?.focus();
			let undoable = false;
			if (element && document.activeElement === element) {
				element.setSelectionRange(from, to);
				// 넣는 글: 바뀐 글에서 [from, to) 자리에 들어간 부분. input 이벤트가 칸의 onChange → setLine으로 이어진다
				undoable = document.execCommand(
					"insertText",
					false,
					text.slice(from, text.length - (old.length - to)),
				);
			}
			if (!undoable)
				edits.setLine(
					line.id,
					field === "text" ? { text } : { direction: text },
				);
			focus.current = {
				line: line.id,
				field,
				start: select[0],
				end: select[1],
			};
			setBadgeTarget(line.id);
			// 다시 그린 뒤 커서를 둔다(setLine으로 넣었으면 값이 바뀌며 커서가 끝으로 간다)
			requestAnimationFrame(() => {
				const target = fieldElement(id);
				target?.focus();
				target?.setSelectionRange(select[0], select[1]);
			});
		}
		return {
			...edits,
			lines,
			noteFocus: (at) => {
				focus.current = at;
				setBadgeTarget(at.line);
			},
			applyBadge,
			badgeTarget,
		};
	}, [edits, latest, lines, badgeTarget]);
	// 화자 번호별 줄 수(화자 카드의 빼기 잠김과 removeLocked, Ruling 15). 글자를 쳐도 수가 같으면 같은 배열이라
	// 이것만 읽는 화자 카드는 수가 바뀔 때만 다시 그린다(수를 이은 글자로 기억한다)
	const tally = new Array<number>(speakers.length).fill(0);
	for (const line of lines)
		if (line.speaker < speakers.length) tally[line.speaker] += 1;
	const counts = tally.join(",");
	const speakerLines = useMemo(
		() => (counts ? counts.split(",").map(Number) : []),
		[counts],
	);
	// 지금 대본의 열쇠는 늦춘 줄로 센다(입력이 끊는다). 글자라 값이 같으면 읽는 쪽이 다시 그리지 않는다
	const shownLines = useDeferredValue(lines);
	const key = useMemo(
		() => scriptKey(speakers, shownLines),
		[speakers, shownLines],
	);
	return (
		<SpeakerLinesContext value={speakerLines}>
			<ScriptKeyContext value={key}>
				<LinesContext value={api}>{children}</LinesContext>
			</ScriptKeyContext>
		</SpeakerLinesContext>
	);
}

// 테이크 목록(최근 20, 완료·미확인). 만든 지 6분 안의 미확인이 있으면 15초마다 다시 받아 늦은 결과를 완료로 바꾼다
const useDramaTakes = () =>
	useQuery({
		...orpc.dramaList.queryOptions(OWNED_LIST),
		refetchInterval: (query) => unknownRefetch(query.state.data, Date.now()),
	});

export function DramaProvider({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient();
	const saved = useSavedList();
	const presetList = usePresetList();
	const takesQuery = useDramaTakes();
	const create = useMutation({
		...orpc.dramaCreate.mutationOptions(),
		retry: false,
		// 같은 출처로만 붙으니 브라우저 offline 판단으로 멈추지 않게 한다(utils/orpc.ts QUIET와 같다)
		networkMode: "always",
	});
	// 초안의 줄 밖 칸. null이면 아직 읽지 않았다. metaRef·linesRef는 이벤트가 읽고 쓰는 최신 값이다(렌더는 state를 읽는다)
	const [meta, setMeta] = useState<Meta | null>(null);
	const metaRef = useRef<Meta | null>(null);
	const linesRef = useRef<DraftLine[]>([]);
	const linesBridge = useRef<((lines: DraftLine[]) => void) | null>(null);
	// 무대의 테이크 id. undefined면 아직 정하지 않았다(목록이 오면 정한다)
	const [shownId, setShownId] = useState<string | null | undefined>(undefined);
	const [generating, setGenerating] = useState<{ startedAt: number } | null>(
		null,
	);
	const [pending, setPending] = useState<DramaPending | null>(null);
	const [problem, setProblem] = useState<DramaProblem | null>(null);
	const [receiving, setReceiving] = useState<string | null>(null);
	// 쓰인 화자가 모두 Fish인가. 줄은 이 컴포넌트가 그리지 않으므로 화자·줄을 바꿀 때 셈해 두고, 값이 같으면 다시 그리지 않는다
	const [fishOnly, setFishOnly] = useState(true);
	// 렌더를 기다리지 않고 두 번째 생성을 막는다(서버 선점이 정본이고 이것은 보조, tts-provider)
	const busyRef = useRef(false);
	const mounted = useRef(true);
	const audio = useRef<Map<string, Promise<Uint8Array<ArrayBuffer>>> | null>(
		null,
	);
	const audioCache = () => {
		audio.current ??= new Map();
		return audio.current;
	};
	const receiveTicket = useRef(0);

	const savedVoices = pickableVoices(saved.data ?? []);
	const presets = (presetList.data ?? []).filter(
		(preset) => preset.voice !== null && !preset.unavailable,
	);
	const voicesLoad = listLoad(saved);
	const current = meta ?? BLANK;
	const speakers = usableSpeakers(current.speakers, savedVoices, presets);
	// 저장한 성우·프리셋이 있으면 그 목록의 첫 받기를 기다린다('성우 고르기'가 보였다가 이름으로 바뀌지 않게, 프리셋 설정 없이 읽지 않게).
	// 실패면 기다리지 않는다(T9 restored와 같다)
	const ready =
		meta !== null &&
		!(
			voicesLoad === "loading" &&
			meta.speakers.some((speaker) => speaker.voiceId !== null)
		) &&
		!(
			listLoad(presetList) === "loading" &&
			meta.speakers.some((speaker) => speaker.presetId !== null)
		);
	const takes = takesQuery.data;
	const shown = takes?.find((item) => item.id === shownId) ?? null;
	const picks = shown
		? (current.picks[takeKey(shown.request)] ?? NO_PICKS)
		: NO_PICKS;
	const loaded = meta !== null;

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	// 이 브라우저의 임시 작업을 첫 그리기 뒤에 읽는다(서버 그리기와 맞춘다). 성우 id는 형식만 보고 지우지 않는다(readDraft)
	useEffect(() => {
		const { lines, ...read } = readDraft(loadStored(DRAFT_KEY), newId);
		metaRef.current = read;
		linesRef.current = lines;
		linesBridge.current?.(lines);
		setMeta(read);
		setFishOnly(allFish(read.speakers, lines));
	}, []);

	// 줄 밖 칸을 바꾸고 저장한다. 읽기 전에는 쓰지 않는다(처음 값으로 덮지 않게)
	function changeMeta(patch: Partial<Meta>) {
		const prev = metaRef.current;
		if (!prev) return;
		const next = { ...prev, ...patch };
		metaRef.current = next;
		setMeta(next);
		setFishOnly(allFish(next.speakers, linesRef.current));
		persist(next, linesRef.current);
	}
	// 줄 목록을 바꾸고 저장한다. 줄 컨텍스트만 다시 그린다. 대본이 바뀌었으니 오류 줄을 내린다(브리프 5.8)
	function changeLines(next: DraftLine[]) {
		const meta = metaRef.current;
		if (!meta) return;
		linesRef.current = next;
		linesBridge.current?.(next);
		setFishOnly(allFish(meta.speakers, next));
		persist(meta, next);
		setProblem(null);
	}
	// 요청이 바뀌는 고침(장면 이름·화자·모델·샘플링). 오류 줄을 내린다
	function edit(patch: Partial<Meta>) {
		changeMeta(patch);
		setProblem(null);
	}
	function editSpeaker(index: number, patch: Partial<DraftSpeaker>) {
		const meta = metaRef.current;
		if (meta)
			edit({
				speakers: meta.speakers.map((speaker, i) =>
					i === index ? { ...speaker, ...patch } : speaker,
				),
			});
	}
	// 실행 취소(Ruling 18): 고치기 직전의 저장된 화자·줄(scene이면 장면 이름도)을 잡아 그대로 되살리는 함수(셈은 scriptUndo)
	function snapshot(scene: boolean): () => void {
		const meta = metaRef.current;
		if (!meta) return NO_UNDO;
		const restore = scriptUndo({ ...meta, lines: linesRef.current }, scene);
		return () => {
			const now = metaRef.current;
			if (!now) return;
			const { lines, ...next } = restore({ ...now, lines: linesRef.current });
			edit(next);
			changeLines(lines);
		};
	}
	const refreshTakes = () =>
		queryClient.invalidateQueries({ queryKey: orpc.dramaList.key() });

	// 처음 무대: 목록이 오면 지금 대본과 같은 대본의 가장 새 완료 테이크, 없으면 빈 무대(브리프 5.10, 11절 6).
	// 그때 목록에 없는 대본의 고른 테이크를 지운다(DN-5, 11절 8)
	// biome-ignore lint/correctness/useExhaustiveDependencies: changeMeta는 ref와 setState만 쓴다. 한 번만 정하므로 shownId로 막는다
	useEffect(() => {
		const meta = metaRef.current;
		if (!loaded || !takes || shownId !== undefined || !meta) return;
		const keys = new Set(takes.map((item) => takeKey(item.request)));
		changeMeta({
			picks: Object.fromEntries(
				Object.entries(meta.picks).filter(([key]) => keys.has(key)),
			),
		});
		setShownId(newestOf(takes, scriptKey(meta.speakers, linesRef.current)));
	}, [loaded, takes, shownId]);

	// 무대는 테이크를 올린 다음 그리기에서 생기므로 그린 뒤에 찾는다
	const focusStage = () => {
		requestAnimationFrame(() => stageOrMain()?.focus());
	};

	// 줄 고침(useLines). 최신 줄(linesRef)에서 셈해 changeLines로 쓴다
	const lineEdits: LineEdits = {
		setLine: (id, patch) =>
			changeLines(
				linesRef.current.map((line) =>
					line.id === id ? { ...line, ...patch } : line,
				),
			),
		// 그 줄 바로 뒤(없으면 끝)에 다음 화자의 빈 줄(DN-4 B)
		addLine: (after) => {
			const meta = metaRef.current;
			const lines = linesRef.current;
			if (!meta || lines.length >= DRAMA_LINES_MAX) return null;
			const index = lines.findIndex((line) => line.id === after);
			const at = index < 0 ? lines.length : index + 1;
			const before = lines[at - 1];
			const line: DraftLine = {
				id: newId(),
				speaker: before ? nextSpeaker(before.speaker, meta.speakers.length) : 0,
				direction: "",
				text: "",
			};
			changeLines([...lines.slice(0, at), line, ...lines.slice(at)]);
			return line.id;
		},
		moveLine: (id, by) => {
			const lines = linesRef.current;
			const from = lines.findIndex((line) => line.id === id);
			const to = from + by;
			if (from < 0 || to < 0 || to >= lines.length) return;
			const next = [...lines];
			[next[from], next[to]] = [next[to], next[from]];
			changeLines(next);
		},
		// 줄은 1개 이상이다(lastLine). 지웠으면 실행 취소 함수
		removeLine: (id) => {
			const lines = linesRef.current;
			if (lines.length <= 1 || !lines.some((line) => line.id === id))
				return null;
			const undo = snapshot(false);
			changeLines(lines.filter((line) => line.id !== id));
			return undo;
		},
		// 붙여 넣기 '바꾸기'(브리프 5.6). 보이는 화자와 저장된 화자는 차례·이름이 같고 성우·프리셋만 가려져 있으므로
		// from[i]의 저장된 공급자·성우·프리셋을 그대로 잇는다(목록 받기 실패 중에도 정확하다). from이 없으면 받은 값 그대로
		replace: (next, lines, from) => {
			const meta = metaRef.current;
			if (!meta) return NO_UNDO;
			const undo = snapshot(false);
			edit({
				speakers: from
					? next.map((speaker, i) => {
							const carried = meta.speakers[from[i] ?? -1];
							return carried
								? {
										name: speaker.name,
										provider: carried.provider,
										voiceId: carried.voiceId,
										presetId: carried.presetId,
									}
								: newSpeaker(speaker.name);
						})
					: next,
			});
			changeLines(lines);
			return undo;
		},
	};

	// 받은 장면 바이트를 테이크 id별 약속으로 기억한다. 같은 테이크의 동시 요청은 하나를 함께 쓰고, 실패하면 지우고, 최근 AUDIO_KEPT개만 남긴다(E13).
	// NOT_FOUND(다른 탭에서 지움·만료)는 목록을 다시 받는다. 알림은 부른 쪽이 한다(downloadFailed·notFound)
	function load(take: DramaItem) {
		const cache = audioCache();
		const bytes = fetchAudio(take.bytes, async (part) => {
			// 화면을 떠나면 남은 조각을 받지 않는다(T9 audioOf와 같다)
			if (!mounted.current) throw new Error("unmounted");
			return client.dramaAudio({ id: take.id, part });
		}).then(async (blob) => new Uint8Array(await blob.arrayBuffer()));
		bytes.catch((error: unknown) => {
			if (cache.get(take.id) === bytes) cache.delete(take.id);
			if (saveFailure(error) === "not_found") void refreshTakes();
		});
		return bytes;
	}
	function sceneAudio(take: DramaItem, action?: string) {
		const cache = audioCache();
		const bytes = cache.get(take.id) ?? load(take);
		// 가장 최근으로 옮긴다(Map은 넣은 순서)
		cache.delete(take.id);
		cache.set(take.id, bytes);
		if (cache.size > AUDIO_KEPT) {
			const [oldest] = cache.keys();
			if (oldest !== undefined) cache.delete(oldest);
		}
		if (action) {
			// 끝날 때 그 뒤에 시작한 받기가 있으면 그대로 둔다(T9 receive와 같다)
			const ticket = ++receiveTicket.current;
			setReceiving(action);
			const done = () => {
				if (receiveTicket.current === ticket) setReceiving(null);
			};
			void bytes.then(done, done);
		}
		return bytes;
	}

	// 서버는 voice_unavailable만 준다. 담은 목록을 다시 받아 성우가 없거나 쓸 수 없는 첫 화자를 찾는다('스펙과 다른 점' 7).
	// 다시 받은 목록으로 그 화자의 성우가 렌더에서 비워진다(브리프 6절)
	async function rejectedSpeaker(request: DramaRequest) {
		const { data } = await saved.refetch();
		const index = unusableSpeaker(request.speakers, data ?? []);
		const speaker = index === null ? undefined : request.speakers[index];
		return speaker ? normalizeText(speaker.name) : null;
	}

	// 같은 요청 id로 한 번만 보낸다(재시도 없음, tts-provider). 끝나면 새 테이크를 무대에 올리기만 한다(자동 이동·재생 없음, DN-2)
	async function generate(next: DramaPending) {
		if (busyRef.current) return;
		busyRef.current = true;
		setGenerating({ startedAt: Date.now() });
		setProblem(null);
		try {
			const result = await create.mutateAsync({
				requestId: next.requestId,
				request: next.request,
			});
			// 화자 성우의 사용 이력이 바뀌었다(성우 창 정렬, T9 generate와 같다)
			void queryClient.invalidateQueries({
				queryKey: orpc.savedVoiceList.key(),
			});
			await refreshTakes();
			setShownId(result.id);
			// '무대로'는 모달이 열려 있으면 창 뒤 무대로 포커스를 빼지 않고 알림을 남긴다(MG-11)
			if (mounted.current)
				toast.success(DRAMA_TEXT.made, {
					action: {
						label: DRAMA_TEXT.toStage,
						onClick: unlessModal(focusStage, DRAMA_TEXT.afterCloseStage),
					},
				});
		} catch (error) {
			// 사유 없는 실패는 크레딧이 쓰였을 수 있어 처리 여부 미확인이다(createFailureOf)
			const failure = createFailureOf(error);
			setProblem({
				...failure,
				speaker:
					failure.reason === "voice_unavailable"
						? await rejectedSpeaker(next.request)
						: null,
			});
			// 미확인·실패 기록이 생겼을 수 있다. 목록을 받은 뒤에 버튼을 풀어 바로 다시 눌러도 확인 창이 중복 과금을 알린다(T9와 같다)
			await refreshTakes();
		} finally {
			busyRef.current = false;
			setGenerating(null);
		}
	}

	// '장면 만들기'. 유료 호출은 늘 최신 초안(metaRef·linesRef)으로 만든다. 요청 id는 이 누름 하나에 하나다.
	// 무료는 바로 만들고 유료는 확인 창(pending)을 연다(브리프 5.9)
	function start(opener: HTMLElement | null) {
		const meta = metaRef.current;
		if (busyRef.current || !ready || !meta) return;
		const draft: Draft = {
			...meta,
			speakers: usableSpeakers(meta.speakers, savedVoices, presets),
			lines: linesRef.current,
		};
		// 버튼 잠금은 늦춘 줄로 정하므로 막 바꾼 대본은 여기서 다시 거른다(T9 start와 같다)
		if (
			dramaBlock({
				sceneName: draft.sceneName,
				speakers: draft.speakers,
				lines: draft.lines,
				speed: draft.settings.speed,
			})
		)
			return;
		const request = requestOf(draft);
		if (!request) return;
		const { bytes, usage } = countLine(draft);
		const key = takeKey(request);
		const next: DramaPending = {
			request,
			requestId: crypto.randomUUID(),
			opener,
			usage,
			bytes,
			// 같은 대본의 미확인 테이크가 있으면 확인 창이 중복 과금을 알린다(브리프 5.9)
			unknownSame:
				takes?.some(
					(item) => item.status === "unknown" && takeKey(item.request) === key,
				) ?? false,
		};
		setProblem(null);
		if (usage.unit === "free") void generate(next);
		else setPending(next);
	}

	// '전체'에서 고르기(브리프 5.7, 11절 9, 14절 2). 공급자와 상관없이 이미 담긴 그 공급자 성우면 담지 않고 고르고, 이용 불가면 고르지 않는다.
	// 아니면 담고(writeBack) 고른다. 실패하면 고르지 않는다(P13-2). 고르면 프리셋은 비운다
	async function pickFromAll(index: number, voice: Voice) {
		const pick = () =>
			editSpeaker(index, {
				provider: voice.provider,
				voiceId: voice.voiceId,
				presetId: null,
			});
		const kept = savedOf(saved.data ?? [], voice.voiceId, voice.provider);
		if (kept && !kept.unavailable) {
			pick();
			return true;
		}
		if (kept) {
			toast.error(DRAMA_TEXT.voiceUnusable);
			return false;
		}
		try {
			const item = await client.savedVoiceSave({ voice });
			writeBack(queryClient, item);
			// 목록 캐시가 없으면(받기 실패) writeBack이 쓸 곳이 없어 고른 성우가 렌더에서 비워진다. 다시 받는다
			if (!queryClient.getQueryData(savedListKey)) void saved.refetch();
			if (item.unavailable) {
				toast.error(DRAMA_TEXT.voiceUnusable);
				return false;
			}
			pick();
			toast.success(DRAMA_TEXT.savedToLibrary);
			return true;
		} catch (error) {
			toast.error(
				saveFailure(error) === "not_found"
					? MESSAGES.notFound
					: MESSAGES.saveFailed,
			);
			return false;
		}
	}

	const api: DramaApi = {
		ready,
		sceneName: current.sceneName,
		speakers,
		storedSpeakers: current.speakers,
		model: current.model,
		settings: current.settings,
		setSceneName: (sceneName) => edit({ sceneName }),
		renameSpeaker: (index, name) => editSpeaker(index, { name }),
		addSpeaker: () => {
			const meta = metaRef.current;
			if (!meta || meta.speakers.length >= DRAMA_SPEAKERS_MAX) return;
			edit({
				speakers: [
					...meta.speakers,
					newSpeaker(nextSpeakerName(meta.speakers)),
				],
			});
		},
		// 줄이 있는 화자와 마지막 화자는 빼지 않는다('스펙과 다른 점' 6, removeLast). 빼면 뒤 화자 번호를 하나씩 당긴다
		removeSpeaker: (index) => {
			const meta = metaRef.current;
			const lines = linesRef.current;
			if (
				!meta ||
				meta.speakers.length <= 1 ||
				lines.some((line) => line.speaker === index)
			)
				return;
			edit({ speakers: meta.speakers.filter((_, i) => i !== index) });
			changeLines(
				lines.map((line) =>
					line.speaker > index ? { ...line, speaker: line.speaker - 1 } : line,
				),
			);
		},
		setVoice: (index, { provider, voiceId }, presetId) =>
			editSpeaker(index, { provider, voiceId, presetId }),
		pickFromAll,
		setModel: (model) => edit({ model }),
		switchModel: (model) => {
			edit({ model });
			toast.success(DRAMA_TEXT.modelSwitched(DRAMA_TEXT.modelName[model]));
			document.getElementById(DRAMA_MAIN_ID)?.focus();
		},
		setSettings: (settings) => edit({ settings }),
		gap: current.gap,
		setGap: (gap) => changeMeta({ gap }),
		savedVoices,
		presets,
		// 없는 화자 번호는 성우 없는 Fish 화자로 본다(줄 화자는 늘 범위 안이다)
		actingOf: (index) => {
			const speaker = speakers[index] ?? newSpeaker("");
			return actingOf(
				speaker,
				voiceOfSpeaker(speaker, savedVoices),
				speakerValue(speaker, presets),
				current.model,
				fishOnly,
			);
		},
		fishOnly,
		voicesLoad,
		reloadVoices: (target) => void reloadThen(saved.refetch, target),
		reloadPresets: (target) => void reloadThen(presetList.refetch, target),
		takes,
		takesLoad: listLoad(takesQuery),
		takesFetching: takesQuery.isFetching,
		reloadTakes: (target) => void reloadThen(takesQuery.refetch, target),
		shown,
		show: setShownId,
		focusStage,
		picks,
		pick: (line, takeId) => {
			const meta = metaRef.current;
			if (!meta || !shown) return;
			const key = takeKey(shown.request);
			changeMeta({
				picks: { ...meta.picks, [key]: { ...meta.picks[key], [line]: takeId } },
			});
		},
		clearPicks: () => {
			const meta = metaRef.current;
			if (!meta || !shown) return NO_UNDO;
			const key = takeKey(shown.request);
			const kept = meta.picks[key];
			changeMeta({ picks: withoutPicks(meta.picks, key) });
			// 그 사이 다른 열쇠의 고른 값이 바뀌었어도 이 열쇠만 되살린다
			return () => {
				const now = metaRef.current;
				if (now) changeMeta({ picks: restorePicks(now.picks, key, kept) });
			};
		},
		sceneAudio,
		receiving,
		generating,
		start,
		pending,
		confirm: (next) => {
			setPending(null);
			void generate(next);
		},
		cancel: () => setPending(null),
		problem,
		// 무대에 있던 테이크면 지운 테이크와 같은 대본의 가장 새 테이크 또는 빈 무대로(브리프 5.11)
		removeTake: (id) => {
			audioCache().delete(id);
			const removed = takes?.find((item) => item.id === id);
			if (shownId === id)
				setShownId(
					removed && takes
						? newestOf(takes, takeKey(removed.request), id)
						: null,
				);
			void refreshTakes();
		},
		// 테이크의 대본(장면 이름·화자·줄)으로 바꾼다. 성우는 테이크의 id 그대로이고(replace의 잇기를 거치지 않는다)
		// 렌더할 때 usableSpeakers가 거른다(E16-3). 실행 취소는 돌려준 함수(바꾸기 직전 장면 이름·화자·줄 그대로)
		restoreScript: (take) => {
			const undo = snapshot(true);
			const { sceneName, speakers, lines } = take.request;
			edit({
				sceneName,
				// 장면 테이크의 화자는 Fish Audio 성우다
				speakers: speakers.map(({ name, voiceId }) => ({
					...newSpeaker(name),
					voiceId,
				})),
			});
			changeLines(lines.map((line) => ({ ...line, id: newId() })));
			return undo;
		},
	};
	return (
		<DramaContext value={api}>
			<LinesProvider
				latest={linesRef}
				bridge={linesBridge}
				edits={lineEdits}
				speakers={current.speakers}
			>
				{children}
			</LinesProvider>
		</DramaContext>
	);
}

export function useDrama(): DramaApi {
	const drama = useContext(DramaContext);
	if (!drama) throw new Error("useDrama는 DramaProvider 안에서만 쓴다");
	return drama;
}

// 줄 목록과 줄 고침. 대본 칸·붙여 넣기·도구줄만 읽는다(막대는 useDeferredValue(lines)로 읽는다)
export function useLines(): LinesApi {
	const lines = useContext(LinesContext);
	if (!lines) throw new Error("useLines는 DramaProvider 안에서만 쓴다");
	return lines;
}

// 화자 번호별 줄 수(Task 9 화자 카드). 줄 목록을 읽지 않아 글자를 쳐도 다시 그리지 않는다
export function useSpeakerLines(): number[] {
	const counts = useContext(SpeakerLinesContext);
	if (!counts) throw new Error("useSpeakerLines는 DramaProvider 안에서만 쓴다");
	return counts;
}

// 지금 대본의 열쇠(늦춘 줄, 저장된 성우 id, 성우 없으면 빈 id). 무대·이전 테이크가 takeKey(take.request)와 견줘
// '다른 대본'·'무대에 있음'을 정한다. 글자라 값이 바뀔 때만 다시 그린다(Ruling 17)
export function useScriptKey(): string {
	const key = useContext(ScriptKeyContext);
	if (key === null)
		throw new Error("useScriptKey는 DramaProvider 안에서만 쓴다");
	return key;
}
