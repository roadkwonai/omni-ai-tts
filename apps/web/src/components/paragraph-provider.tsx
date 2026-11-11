// apps/web/src/components/paragraph-provider.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import {
	DEFAULT_SETTINGS,
	PARAGRAPHS_MAX,
	type SettingsOf,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import type { StudioRequest } from "@tts-pilot-app/api/studio-contract";
import {
	createContext,
	type ReactNode,
	type RefObject,
	useContext,
	useDeferredValue,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { loadStored, saveBlob, store } from "@/lib/browser";
import { MESSAGES, saveFailure } from "@/lib/classes-view";
import { soundExt } from "@/lib/drama-read";
import {
	type Found,
	type FoundMap,
	findTargets,
	forgetFound,
	joinKeyOf,
	type LiveMap,
	type MakeState,
	madeOf,
	mergeFound,
	type ParagraphStatus,
	paragraphStatus,
	pruneFound,
	receivePlan,
} from "@/lib/make-all";
import {
	paragraphFileName,
	srtOf,
	stripTags,
	workFileName,
} from "@/lib/paragraph-files";
import {
	PARAGRAPH_GAP_DEFAULT,
	type Paragraph,
	paragraphRequest,
	type Speaker,
	speakerParagraphCount,
	speakerRestore,
	type VoiceSetup,
	type Work,
} from "@/lib/paragraph-script";
import { joinTimeline } from "@/lib/sound-join";
import {
	checkedWork,
	droppedVoices,
	migrateV1,
	readWork,
	usableDefaultVoice,
	WORK_KEY,
	workLoadView,
	writeWork,
} from "@/lib/studio-draft";
import { PARAGRAPH_TEXT } from "@/lib/studio-text";
import {
	fetchAudio,
	type ListLoad,
	listLoad,
	pickableVoices,
	SCRIPT_KEY,
	SETUP_KEY,
	STUDIO_TEXT,
	savedOf,
	unknownRefetch,
} from "@/lib/studio-view";
import { zipStore } from "@/lib/zip-store";
import { client, orpc, QUIET } from "@/utils/orpc";

import { focusText } from "./paragraph-focus";
import { type Confirming, useMakeAll } from "./paragraph-make";
import type { PresetHost } from "./preset-menu";
import { usePlayer } from "./sample-player";
import { useSavedList } from "./saved-voices";
import type { LoadedPreset } from "./trial-provider";

// 문단 작업실의 상태와 데이터 흐름(T10 계획 Task 10). 문단 배열은 안쪽 ParagraphsProvider의 작은 컨텍스트에만 둔다(E10).
// 글자를 쳐도 useWork만 읽는 쪽은 다시 그리지 않는다. 작업(기본 성우·쉼·채널)·저장된 결과 표·전체 만들기·듣기·받기는 WorkProvider가 맡고,
// 이벤트와 await 뒤에는 ref의 최신 값을 읽는다. 판단(상태·찾기 대상·계획·받기 목록)은 lib의 순수 함수만 부른다

// 작업에서 문단을 뺀 칸(문단은 useParagraphs)
export type WorkMeta = Omit<Work, "paragraphs">;
export type FindState = "first" | "ok" | "failed";
export type ReceiveKind = "wav" | "zip" | "srt" | "play";
// 막대 플레이어에 올린 소리. 캡션은 막대가 짓는다(브리프 4절 "문단 3 · Rachel · …", "이어 듣기 · 31분 12초")
export type Shown = { url: string } & (
	| {
			kind: "paragraph";
			id: string;
			n: number;
			voiceName: string;
			text: string;
	  }
	// 이어 듣기: ids·spans는 한 파일에 든 문단(빈 문단은 빠짐)의 id와 구간, key는 잇기 키(joinKeyOf, 낡음 판정에 쓴다)
	| {
			kind: "join";
			seconds: number;
			ids: string[];
			spans: { start: number; end: number }[];
			key: string;
	  }
);
type Receiving = { phase: "fetch" | "join"; done: number; total: number };

type ParagraphsApi = {
	paragraphs: Paragraph[];
	// fn은 최신 배열을 받아 새 배열을 돌려준다(바뀌지 않은 문단은 같은 객체). undo면 '되돌리기' 알림이 직전 배열로 돌린다(한 단계)
	edit: (
		fn: (ps: Paragraph[]) => Paragraph[],
		undo?: { message: string },
	) => void;
	setText: (id: string, text: string) => void;
	// 되돌리기 알림을 띄운다(10초). 열린 알림은 닫는다(알림은 늘 하나, 되돌리기는 한 단계). 화자 지우기가 쓴다:
	// 이름이 사라진 화자의 문단 되돌리기 알림이 남아 목록에 없는 이름이 문단에 돌아오지 않게 이 알림이 앞 알림을 대신한다(계획 2.2, 브리프 16.8)
	undoable: (message: string, onUndo: () => void) => void;
};

type WorkApi = {
	// 임시 작업을 읽었고, 그 작업에 성우가 있으면 담은 성우 목록이 '받는 중'이 아니다(목록 실패여도 참, T9 restored와 같다)
	restored: boolean;
	// 담은 성우(다섯 공급자, 최근 사용 순). 목록을 아직 받지 못했거나 실패면 null(문단은 '확인 중')
	voices: SavedVoice[] | null;
	voicesLoad: ListLoad;
	voicesFetching: boolean;
	reloadVoices: () => void;
	work: WorkMeta;
	setDefaultVoice: (setup: VoiceSetup | null) => void;
	// 기본 성우의 공급자 설정 칸을 바꾼다. 기본 성우가 없으면 그대로
	setDefaultSettings: (
		patch: Partial<Record<string, string | number | boolean>>,
	) => void;
	// 레일 '처음 값으로': 기본 성우 설정을 그 공급자 처음 값으로 하고 불러온 프리셋 표시도 지운다(T8·T9와 같다)
	resetDefaultSettings: () => void;
	setGap: (gap: number) => void;
	setChannelId: (id: string | null) => void;
	// 화자 목록을 바꾼다(붙여 넣기가 없는 이름을 더한다, 계획 2.2). 되돌리기 알림은 띄우지 않는다(기본 성우 바꾸기와 같다)
	setSpeakers: (speakers: Speaker[]) => void;
	// 화자 성우를 정하거나(null이면 비워 기본 성우를 따른다) 화자를 지운다. 둘 다 되돌리기 알림이 없다(changeMeta).
	// 지우기는 문단이 0개인 화자만 하고 지웠는지를 돌려준다(막힌 단추를 거친 호출도 지금 문단으로 한 번 더 막는다)
	setSpeakerVoice: (name: string, voice: VoiceSetup | null) => void;
	removeSpeaker: (name: string) => boolean;
	// 지운 화자를 이름·성우·자리 그대로 되살린다(화자 지우기 되돌리기)
	restoreSpeaker: (speaker: Speaker, at: number) => void;
	// 기본 성우가 대상인 프리셋 메뉴(provider null = 다섯 공급자, Task 9)
	presetHost: PresetHost;
	notice: string | null;
	// 서명 → 저장된 결과(키 없음 = 아직 찾지 않음, null = 없음)
	found: FoundMap;
	// 배경 찾기: 복원 뒤 첫 찾기 전 first, 마지막 찾기가 실패면 failed(막대 '다시 확인' = refind)
	findState: FindState;
	refind: () => void;
	live: LiveMap;
	// 문단 객체별로 기억한 요청·상태(E10: 바뀌지 않은 문단은 글자마다 다시 셈하지 않는다)
	requestOf: (p: Paragraph) => StudioRequest | null;
	statusOf: (p: Paragraph) => ParagraphStatus;
	make: MakeState;
	confirming: Confirming;
	makeAll: (opener: HTMLElement | null) => void;
	makeOne: (id: string, opener: HTMLElement | null) => void;
	stop: () => void;
	confirm: () => void;
	cancel: () => void;
	// 만든 문단의 결과를 받아 막대 플레이어에서 튼다
	listen: (id: string) => void;
	receive: (kind: ReceiveKind) => void;
	receiving: Receiving | null;
	shown: Shown | null;
	// ElevenLabs 모델 배율(orpc.trialModels, E20). 모르면 null(usageByProvider가 rateMissing으로 센다)
	rates: (request: StudioRequest) => number | null;
	// 배율 표를 받는 중(그동안 null은 '모름'이 아니다. 확인 창이 "배율을 확인하지 못했어요"를 숨긴다)
	ratesLoading: boolean;
	// 렌더가 쓰는 시각. 1분마다와 만들기 누를 때 바뀐다(렌더 중 Date.now() 금지)
	now: number;
};

const ParagraphsContext = createContext<ParagraphsApi | null>(null);
const ShownParagraphsContext = createContext<Paragraph[]>([]);
const WorkContext = createContext<WorkApi | null>(null);

// 입력이 멈춘 뒤 찾기·저장까지 기다리는 시간('스펙과 다른 점' 7, E10)
const FIND_DELAY = 600;
const SAVE_DELAY = 300;
const MINUTE = 60_000;
// ElevenLabs 배율은 무료 목록 조회다. 한 시간 기억한다(trial-confirm useRate와 같다)
const RATES_STALE = 60 * 60 * 1000;
const BLANK_META: WorkMeta = {
	defaultVoice: null,
	gap: PARAGRAPH_GAP_DEFAULT,
	channelId: null,
};
// 순수 함수는 work.paragraphs를 읽지 않는다(문단은 따로 넘긴다). 문단 없이 셈할 때 쓴다
const NO_PARAGRAPHS: Paragraph[] = [];
const asWork = (meta: WorkMeta, paragraphs = NO_PARAGRAPHS): Work => ({
	...meta,
	paragraphs,
});

// T9 임시 작업 키를 지운다(옮긴 뒤, 스펙 2절). 저장소를 쓸 수 없으면 조용히 넘긴다(lib/browser와 같다)
function unstore(key: string) {
	try {
		window.localStorage.removeItem(key);
	} catch {
		// 남아도 v2 키가 있으면 다시 옮기지 않는다
	}
}
// 이 브라우저의 임시 작업 글(readWork에 넘긴다). v2 키가 있으면(깨졌어도) 그것만 읽는다. 없을 때만 T9 작업을 옮겨 바로 쓰고, 쓴 것을 확인한 뒤 v1 두 키를 지운다
// (v1 키가 남아 있으면 깨진 v2 뒤에 옛 대본이 되살아난다, Task 8 리뷰)
function readStored(): string | null {
	let raw = loadStored(WORK_KEY);
	if (raw === null) {
		const v1 = migrateV1(loadStored(SCRIPT_KEY), loadStored(SETUP_KEY));
		if (v1) {
			raw = writeWork(v1);
			store(WORK_KEY, raw);
			if (loadStored(WORK_KEY) === raw) {
				unstore(SCRIPT_KEY);
				unstore(SETUP_KEY);
			}
		}
	}
	return raw;
}
const blankWork = (): Work => ({
	...BLANK_META,
	paragraphs: [{ id: crypto.randomUUID(), text: "" }],
});

// 문단 배열만 드는 작은 컨텍스트. 바깥(WorkProvider)은 latest로 최신 배열을 읽고 bridge로 바꾼다(복원·성우 다시 보기).
// 고친 뒤에는 onChange(저장 300ms·찾기 0.6초 예약)를 부른다. 고침 함수는 문단이 바뀌어도 같은 함수다(카드 props, E10)
function ParagraphsProvider({
	latest,
	bridge,
	onChange,
	children,
}: {
	latest: RefObject<Paragraph[]>;
	bridge: RefObject<((ps: Paragraph[]) => void) | null>;
	onChange: () => void;
	children: ReactNode;
}) {
	const [paragraphs, setParagraphs] = useState<Paragraph[]>(NO_PARAGRAPHS);
	// 요약·막대는 늦춘 배열을 읽는다(rerender-use-deferred-value)
	const shown = useDeferredValue(paragraphs);
	const changed = useRef(onChange);
	useLayoutEffect(() => {
		changed.current = onChange;
	});
	const undoToast = useRef<string | number | null>(null);
	useImperativeHandle(bridge, () => setParagraphs, []);
	// 화면을 떠나면 되돌리기 알림을 닫는다(되돌릴 배열이 없다)
	useEffect(
		() => () => {
			if (undoToast.current !== null) toast.dismiss(undoToast.current);
		},
		[],
	);
	const edits = useMemo(() => {
		function change(next: Paragraph[]) {
			latest.current = next;
			setParagraphs(next);
			changed.current();
		}
		// 되돌리고 되살아난 첫 문단(지금 배열과 처음 다른 자리, 없으면 끝 문단)의 대본 칸으로 간다(브리프 7절). 곧바로 그려 바로 옮긴다.
		// 알림 단추를 누르면 sonner가 알림에 들어오기 전 칸을 기억했다가 포커스가 알림을 떠날 때 그 칸으로 되돌린다(ol onBlur).
		// 먼저 단추에서 포커스를 놓아 그 되돌림을 끝낸 뒤 옮긴다(F12-2)
		function restore(before: Paragraph[]) {
			const now = latest.current;
			flushSync(() => change(before));
			const back = before.find((p, i) => p !== now[i]) ?? before.at(-1);
			if (!back) return;
			if (document.activeElement instanceof HTMLElement)
				document.activeElement.blur();
			focusText(back.id);
		}
		// 되돌리기는 한 단계다. 새로 띄우면 앞 알림을 닫는다(drama-lines useOwnToast와 같다).
		// 지우기·합치기·나누기·붙여 넣기 모두 10초 남긴다(되돌릴 틈, critique 반영)
		function undoable(message: string, onUndo: () => void) {
			if (undoToast.current !== null) toast.dismiss(undoToast.current);
			undoToast.current = toast(message, {
				duration: 10_000,
				action: { label: PARAGRAPH_TEXT.undo, onClick: onUndo },
			});
		}
		function edit(
			fn: (ps: Paragraph[]) => Paragraph[],
			undo?: { message: string },
		) {
			const before = latest.current;
			const next = fn(before);
			if (next === before) return;
			change(next);
			if (undo) undoable(undo.message, () => restore(before));
		}
		return {
			edit,
			setText: (id: string, text: string) =>
				edit((ps) => ps.map((p) => (p.id === id ? { ...p, text } : p))),
			undoable,
		};
	}, [latest]);
	const api = useMemo(() => ({ paragraphs, ...edits }), [paragraphs, edits]);
	return (
		<ParagraphsContext value={api}>
			<ShownParagraphsContext value={shown}>{children}</ShownParagraphsContext>
		</ParagraphsContext>
	);
}

export function WorkProvider({ children }: { children: ReactNode }) {
	const saved = useSavedList();
	const player = usePlayer();
	const models = useQuery({
		...orpc.trialModels.queryOptions(),
		...QUIET,
		staleTime: RATES_STALE,
	});
	// 성공한 목록만. 정렬한 새 배열이라 기억해 두어야 아래 표(WeakMap)가 렌더마다 새로 생기지 않는다
	const voices = useMemo(
		() => (saved.data ? pickableVoices(saved.data) : null),
		[saved.data],
	);
	const voicesLoad = listLoad(saved);
	const [read, setRead] = useState(false);
	const [hasVoice, setHasVoice] = useState(false);
	const [meta, setMeta] = useState<WorkMeta>(BLANK_META);
	const [found, setFound] = useState<FoundMap>(() => new Map());
	const [findState, setFindState] = useState<FindState>("first");
	// 서버 그리기와 같게 0으로 시작하고 복원할 때 정한다(렌더 중 Date.now() 금지)
	const [now, setNow] = useState(0);
	const [notice, setNotice] = useState<string | null>(null);
	const [loaded, setLoaded] = useState<LoadedPreset | null>(null);
	const [shown, setShown] = useState<Shown | null>(null);
	const [receiving, setReceiving] = useState<Receiving | null>(null);
	// 이벤트·await 뒤에 읽는 최신 값(렌더는 state를 읽는다)
	const readRef = useRef(false);
	const metaRef = useRef<WorkMeta>(BLANK_META);
	const paragraphsRef = useRef<Paragraph[]>(NO_PARAGRAPHS);
	const voicesRef = useRef<SavedVoice[] | null>(null);
	const foundRef = useRef<FoundMap>(found);
	const nowRef = useRef(0);
	const shownRef = useRef<Shown | null>(null);
	const bridge = useRef<((ps: Paragraph[]) => void) | null>(null);
	// 성우 목록 없이 읽었다(목록이 오면 그때 성우를 다시 본다, Task 8 리뷰 b)
	const unchecked = useRef(false);
	// 보관함에 없어 비운 성우를 알렸다(첫 읽기·늦게 온 목록·StrictMode로 다시 붙어도 한 번)
	const droppedTold = useRef(false);
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const findTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const findTicket = useRef(0);
	const listenTicket = useRef(0);
	// 결과 id → 받은 오디오. 같은 결과를 다시 받지 않는다(스펙 5.1 '이미 받은 조각은 다시 받지 않는다')
	// shortcut: 듣기만 한 결과도 받기 전까지 남는다(문단 200개 × 수 MB). 받기가 그때 문단의 결과만 남긴다. 메모리가 문제면 듣기에도 같은 정리를 둔다
	const audio = useRef(new Map<string, Promise<Blob>>());
	// 마지막 잇기 결과 하나. 키(문단 id·결과 id·쉼)가 같으면 WAV·SRT·이어 듣기가 다시 잇지 않는다('스펙과 다른 점' 25)
	const lastJoin = useRef<{
		key: string;
		blob: Blob;
		spans: { start: number; end: number }[];
	} | null>(null);
	const receivingRef = useRef(false);
	const mounted = useRef(true);

	const restored = read && !(voicesLoad === "loading" && hasVoice);

	function tick() {
		const at = Date.now();
		nowRef.current = at;
		setNow(at);
		return at;
	}
	function changeFound(fn: (table: FoundMap) => FoundMap) {
		const next = fn(foundRef.current);
		if (next === foundRef.current) return;
		foundRef.current = next;
		setFound(next);
	}
	function persist() {
		if (saveTimer.current) clearTimeout(saveTimer.current);
		saveTimer.current = null;
		if (readRef.current)
			store(
				WORK_KEY,
				writeWork(asWork(metaRef.current, paragraphsRef.current)),
			);
	}
	function saveSoon() {
		if (saveTimer.current) clearTimeout(saveTimer.current);
		saveTimer.current = setTimeout(persist, SAVE_DELAY);
	}
	// 그 문단들의 요청 가운데 표에 없는 것(all이면 모두)을 200개씩 찾아 합친다. 공급자는 부르지 않는다(studioFindMany)
	async function fetchFound(
		ps: Paragraph[],
		work: Work,
		list: SavedVoice[],
		at: number,
		all: boolean,
	) {
		const targets = findTargets(ps, work, list, foundRef.current, all, at);
		for (let i = 0; i < targets.length; i += PARAGRAPHS_MAX) {
			const chunk = targets.slice(i, i + PARAGRAPHS_MAX);
			const results = await client.studioFindMany(chunk);
			changeFound((table) => mergeFound(table, chunk, results));
		}
	}
	// 배경 찾기('스펙과 다른 점' 7·27). 지금 문단에 없는 null 항목을 버리고 찾는다. 마지막으로 시작한 찾기만 findState를 바꾼다
	async function findNow(all: boolean) {
		const list = voicesRef.current;
		if (!readRef.current || !list) return;
		const ps = paragraphsRef.current;
		const at = nowRef.current;
		const work = asWork(metaRef.current, ps);
		const ticket = ++findTicket.current;
		changeFound((table) => pruneFound(table, ps, work, list, at));
		try {
			await fetchFound(ps, work, list, at, all);
			if (mounted.current && ticket === findTicket.current) setFindState("ok");
		} catch {
			if (mounted.current && ticket === findTicket.current)
				setFindState("failed");
		}
	}
	function findSoon(delay = FIND_DELAY) {
		if (findTimer.current) clearTimeout(findTimer.current);
		findTimer.current = setTimeout(() => {
			findTimer.current = null;
			void findNow(false);
		}, delay);
	}
	// 문단을 고쳤다(ParagraphsProvider가 부른다)
	function changedParagraphs() {
		saveSoon();
		findSoon();
	}
	function changeMeta(patch: Partial<WorkMeta>) {
		const next = { ...metaRef.current, ...patch };
		metaRef.current = next;
		setMeta(next);
		saveSoon();
		findSoon();
	}
	// 문단 배열을 바깥에서 바꾼다(복원·성우 다시 보기). 편집이 아니라 되돌리기 알림이 없다
	function replaceParagraphs(next: Paragraph[]) {
		paragraphsRef.current = next;
		bridge.current?.(next);
	}
	function restore(work: Work) {
		const { paragraphs, ...rest } = work;
		metaRef.current = rest;
		setMeta(rest);
		replaceParagraphs(paragraphs);
	}
	// 목록으로 맞추며 비운 성우가 있으면 이유를 한 번 알리고 참(스펙 11절 Q15, F30-2). 비우는 규칙은 readWork 그대로다.
	// 되돌리기 알림과 같은 10초(두 문장이다)
	function tellDropped(raw: string | null, list: readonly SavedVoice[]) {
		const lost = droppedVoices(raw, list);
		if (!lost.defaultVoice && lost.paragraphs === 0 && lost.speakers === 0)
			return false;
		if (!droppedTold.current)
			toast(
				PARAGRAPH_TEXT.voicesDropped(
					lost.defaultVoice,
					lost.paragraphs,
					lost.speakers,
				),
				{ duration: 10_000 },
			);
		droppedTold.current = true;
		return true;
	}

	// 성우 목록이 오거나 바뀌면 최신 값을 두고, 목록 없이 읽은 작업이면 그때 성우를 다시 본다(readWork에 성공한 목록만, Task 8 리뷰 b).
	// 바뀐 것이 없으면 문단을 그대로 둔다(카드를 다시 그리지 않게). 그리고 찾는다
	// biome-ignore lint/correctness/useExhaustiveDependencies: 목록이 바뀔 때만 돈다. 작업·문단은 최신 값(ref)을 읽는다
	useEffect(() => {
		voicesRef.current = voices;
		if (!voices || !readRef.current) return;
		if (unchecked.current) {
			unchecked.current = false;
			const raw = writeWork(asWork(metaRef.current, paragraphsRef.current));
			const checked = checkedWork(raw, voices);
			if (checked) {
				restore(checked);
				saveSoon();
			}
			tellDropped(raw, voices);
		}
		findSoon(0);
	}, [voices]);

	// 첫 그리기 뒤에 임시 작업을 읽는다(서버 그리기와 맞춘다). 저장은 마지막 편집 300ms 뒤와 탭을 떠날 때·화면을 떠날 때(E10).
	// 시각은 1분마다 바꾸고 그때 찾는다(Fish 무료 모델 종료처럼 시각이 요청을 바꾼다)
	// biome-ignore lint/correctness/useExhaustiveDependencies: 한 번만 돈다. 함수들은 ref와 setState만 쓴다
	useEffect(() => {
		mounted.current = true;
		const list = voicesRef.current;
		const raw = readStored();
		const work = readWork(raw, list) ?? blankWork();
		unchecked.current = list === null;
		readRef.current = true;
		tick();
		restore(work);
		// 비운 작업을 저장한다(늦은 목록 길과 같다). 저장하지 않으면 다시 열 때마다 같은 성우를 비우고 또 알린다
		if (list && tellDropped(raw, list)) saveSoon();
		setHasVoice(
			work.defaultVoice !== null ||
				work.paragraphs.some((p) => p.voice) ||
				(work.speakers?.some((s) => s.voice) ?? false),
		);
		setRead(true);
		findSoon(0);
		const clock = setInterval(() => {
			tick();
			findSoon(0);
		}, MINUTE);
		const flush = () => {
			if (saveTimer.current) persist();
		};
		window.addEventListener("pagehide", flush);
		const cache = audio.current;
		return () => {
			mounted.current = false;
			clearInterval(clock);
			window.removeEventListener("pagehide", flush);
			flush();
			if (findTimer.current) clearTimeout(findTimer.current);
			findTicket.current += 1;
			listenTicket.current += 1;
			cache.clear();
			lastJoin.current = null;
			if (shownRef.current) URL.revokeObjectURL(shownRef.current.url);
			shownRef.current = null;
			// 상태를 지키며 다시 붙는 경우(StrictMode)에 푼 주소가 남지 않게(T9와 같다)
			setShown(null);
		};
	}, []);

	// 처리 여부 미확인이 있으면 만든 지 6분까지 15초마다 다시 찾는다(T9 unknownRefetch 규칙, 스펙 5.1 '미확인').
	// 간격은 표가 바뀔 때마다 다시 시작하지 않는다(만드는 동안 표가 자주 바뀌어도 다시 찾기가 밀리지 않게). 6분은 1분마다 바뀌는 now로 잰다
	const poll = unknownRefetch(
		[...found.values()].filter((value): value is Found => value !== null),
		now,
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: 간격이 바뀔 때만 다시 건다. 찾기는 최신 값(ref)을 읽는다
	useEffect(() => {
		if (poll === false) return;
		const timer = setInterval(() => void findNow(true), poll);
		return () => clearInterval(timer);
	}, [poll]);

	const rates = (request: StudioRequest) =>
		request.provider === "elevenlabs"
			? (models.data?.rates.find(
					(rate) => rate.model === request.settings.model,
				)?.multiplier ?? null)
			: null;
	const makeApi = useMakeAll({
		paragraphs: paragraphsRef,
		meta: metaRef,
		voices: voicesRef,
		found: foundRef,
		changeFound,
		find: (ps, work, list, at) => fetchFound(ps, work, list, at, true),
		recheck: () => void findNow(true),
		tick,
		rates,
		now,
	});
	const { live } = makeApi;

	// 문단 객체별 요청·상태. 작업·성우 목록·시각(상태는 표·진행도)이 바뀌면 새 표다(E10)
	const requestOf = useMemo(() => {
		const table = new WeakMap<Paragraph, StudioRequest | null>();
		const work = asWork(meta);
		return (p: Paragraph) => {
			if (!table.has(p)) table.set(p, paragraphRequest(p, work, voices, now));
			return table.get(p) ?? null;
		};
	}, [meta, voices, now]);
	const statusOf = useMemo(() => {
		const table = new WeakMap<Paragraph, ParagraphStatus>();
		const work = asWork(meta);
		return (p: Paragraph) => {
			let status = table.get(p);
			if (status === undefined) {
				status = paragraphStatus(p, work, voices, found, live, now);
				table.set(p, status);
			}
			return status;
		};
	}, [meta, voices, found, live, now]);

	// 플레이어에 올린 소리를 바꾼다. 바뀌는 blob 주소는 푼다(setState 갱신 함수 밖에서, T9 show와 같다)
	function show(next: Shown | null) {
		const old = shownRef.current;
		if (old && old.url !== next?.url) URL.revokeObjectURL(old.url);
		shownRef.current = next;
		setShown(next);
	}
	// 결과 오디오를 조각으로 받는다. 같은 결과는 한 약속을 함께 쓰고 실패하면 지운다. 화면을 떠나면 다음 조각을 받지 않는다
	function audioOf(result: Found) {
		const cache = audio.current;
		const known = cache.get(result.id);
		if (known) return known;
		const blob = fetchAudio(result.bytes, async (part) => {
			if (!mounted.current) throw new Error("unmounted");
			return client.studioAudio({ id: result.id, part });
		});
		cache.set(result.id, blob);
		blob.catch(() => {
			if (cache.get(result.id) === blob) cache.delete(result.id);
		});
		return blob;
	}
	// 조각 받기 실패. 만료·다른 곳에서 지운 결과(NOT_FOUND)면 그 결과 항목을 지우고 다시 찾아 그 문단을 '안 만듦'으로 돌린다
	// (지우지 않으면 mergeFound가 완료 키를 null로 내리지 않아 '만듦'에 갇힌다, E22)
	function missing(error: unknown, resultId: string) {
		if (saveFailure(error) === "not_found") {
			toast.error(MESSAGES.notFound);
			changeFound((table) => forgetFound(table, resultId));
			void findNow(true);
			return;
		}
		toast.error(PARAGRAPH_TEXT.receiveFailed);
	}

	// 카드 ▶: 그 문단의 저장된 결과를 받아 막대에서 튼다. 받는 사이 다른 문단·이어 듣기를 누르면 앞의 것은 버린다. 소리는 한 번에 하나(REQ-03)
	async function listen(id: string) {
		const ps = paragraphsRef.current;
		const index = ps.findIndex((p) => p.id === id);
		const p = ps[index];
		const made =
			p &&
			madeOf(
				p,
				asWork(metaRef.current, ps),
				voicesRef.current,
				foundRef.current,
				nowRef.current,
			);
		if (!made) return;
		const ticket = ++listenTicket.current;
		try {
			const blob = await audioOf(made.found);
			if (!mounted.current || ticket !== listenTicket.current) return;
			player.stop();
			show({
				kind: "paragraph",
				url: URL.createObjectURL(blob),
				id,
				n: index + 1,
				voiceName: made.voiceName,
				text: p.text,
			});
		} catch (error) {
			if (mounted.current && ticket === listenTicket.current)
				missing(error, made.found.id);
		}
	}

	// 받은 문단을 쉼을 넣어 한 WAV로 잇는다(공급자 호출 없음). 키가 같으면 마지막 결과를 쓴다. 잇지 못하면 알리고 null
	async function joinOf(
		items: { id: string; found: Found; gap: number }[],
		blobs: Blob[],
	) {
		const key = joinKeyOf(items);
		if (lastJoin.current?.key === key) return lastJoin.current;
		setReceiving({ phase: "join", done: items.length, total: items.length });
		try {
			const joined = await joinTimeline(
				items.map((item, i) => ({ blob: blobs[i], gap: item.gap })),
			);
			lastJoin.current = { key, ...joined };
			return lastJoin.current;
		} catch {
			if (mounted.current) toast.error(PARAGRAPH_TEXT.joinFailed);
			return null;
		}
	}

	// '받기' 메뉴(스펙 5.1). 누른 때의 문단·결과·쉼으로 고정하고(receivePlan) 차례로 받는다. 받기는 생성을 부르지 않는다(REQ-10)
	async function receive(kind: ReceiveKind) {
		const list = voicesRef.current;
		if (receivingRef.current || !list) return;
		const ps = paragraphsRef.current;
		const plan = receivePlan(
			ps,
			asWork(metaRef.current, ps),
			list,
			foundRef.current,
			nowRef.current,
		);
		if (!plan.ok) return;
		const { items } = plan;
		receivingRef.current = true;
		// 이어 듣기는 카드 듣기와 같은 차례를 쓴다(늦게 온 쪽이 나중에 누른 소리를 덮지 않게)
		const ticket = kind === "play" ? ++listenTicket.current : 0;
		// 그때 문단의 결과가 아닌 받은 오디오는 버린다(고쳐서 바뀐 결과)
		const keep = new Set(items.map((item) => item.found.id));
		for (const id of audio.current.keys())
			if (!keep.has(id)) audio.current.delete(id);
		// 지금 받는 결과(실패하면 그 항목을 표에서 지운다)
		let resultId = "";
		try {
			const blobs: Blob[] = [];
			for (const item of items) {
				setReceiving({
					phase: "fetch",
					done: blobs.length,
					total: items.length,
				});
				resultId = item.found.id;
				blobs.push(await audioOf(item.found));
			}
			if (!mounted.current) return;
			setReceiving({ phase: "fetch", done: items.length, total: items.length });
			const at = new Date();
			const first = items[0].text;
			if (kind === "zip") {
				const files = await Promise.all(
					items.map(async (item, i) => ({
						name: paragraphFileName(
							item.n,
							item.voiceName,
							item.text,
							soundExt(blobs[i].type),
						),
						parts: [new Uint8Array(await blobs[i].arrayBuffer())],
					})),
				);
				if (mounted.current)
					saveBlob(zipStore(files), workFileName(first, at, "zip"));
				return;
			}
			const joined = await joinOf(items, blobs);
			if (!joined || !mounted.current) return;
			if (kind === "wav") saveBlob(joined.blob, workFileName(first, at, "wav"));
			else if (kind === "srt")
				saveBlob(
					new Blob(
						[
							srtOf(
								items.map((item, i) => ({
									...joined.spans[i],
									text: stripTags(item.text),
								})),
							),
						],
						{ type: "application/x-subrip" },
					),
					workFileName(first, at, "srt"),
				);
			else if (ticket === listenTicket.current) {
				player.stop();
				show({
					kind: "join",
					url: URL.createObjectURL(joined.blob),
					seconds: joined.spans.at(-1)?.end ?? 0,
					ids: items.map((item) => item.id),
					spans: joined.spans,
					key: joined.key,
				});
			}
		} catch (error) {
			if (mounted.current) missing(error, resultId);
		} finally {
			receivingRef.current = false;
			if (mounted.current) setReceiving(null);
		}
	}

	const setup = meta.defaultVoice;
	const presetHost: PresetHost = {
		provider: null,
		voice:
			(setup &&
				voices &&
				savedOf(voices, setup.voiceId, setup.provider)?.voice) ||
			null,
		settings: setup
			? ({
					...DEFAULT_SETTINGS,
					[setup.provider]: setup.settings,
				} as SettingsOf)
			: DEFAULT_SETTINGS,
		loaded,
		// 프리셋의 성우를 기본 성우로 쓸 수 없으면 기본 성우를 비우고 알린다(자동 대체 없음, Task 8 리뷰 d).
		// 성우 목록이 없으면 쓸 수 있는지 모르므로 불러오지 않고 목록 실패를 알린다(목록 없이 성우를 지우지 않는다, 계약 5b)
		apply: (preset) => {
			const list = voicesRef.current;
			if (!list) {
				setNotice(PARAGRAPH_TEXT.voicesFailed);
				// 불러오지 않았다(usePresetLoad가 성공 알림을 띄우지 않는다)
				return false;
			}
			const target = usableDefaultVoice(preset, list);
			changeMeta({
				defaultVoice: target
					? ({
							provider: preset.provider,
							voiceId: target.voice.voiceId,
							settings: preset.settings,
						} as VoiceSetup)
					: null,
			});
			setLoaded({ id: preset.id, settings: preset.settings });
			setNotice(target ? null : STUDIO_TEXT.presetVoiceUnusable);
		},
		loadView: (preset) =>
			voices
				? workLoadView(preset, meta, voices, now)
				: {
						lead: null,
						changes: [],
						notes: [{ text: PARAGRAPH_TEXT.voicesFailed, warn: true }],
					},
		loadedMessage: STUDIO_TEXT.presetLoaded,
	};

	const api: WorkApi = {
		restored,
		voices,
		voicesLoad,
		voicesFetching: saved.isFetching,
		reloadVoices: () => void saved.refetch(),
		work: meta,
		setDefaultVoice: (next) => {
			changeMeta({ defaultVoice: next });
			setNotice(null);
		},
		setDefaultSettings: (patch) => {
			const current = metaRef.current.defaultVoice;
			if (current)
				changeMeta({
					defaultVoice: {
						...current,
						settings: { ...current.settings, ...patch },
					} as VoiceSetup,
				});
		},
		resetDefaultSettings: () => {
			const current = metaRef.current.defaultVoice;
			if (!current) return;
			changeMeta({
				defaultVoice: {
					...current,
					settings: DEFAULT_SETTINGS[current.provider],
				} as VoiceSetup,
			});
			setLoaded(null);
		},
		setGap: (gap) => changeMeta({ gap }),
		setChannelId: (channelId) => changeMeta({ channelId }),
		setSpeakers: (speakers) => changeMeta({ speakers }),
		setSpeakerVoice: (name, voice) =>
			changeMeta({
				speakers: (metaRef.current.speakers ?? []).map((s) =>
					s.name === name ? { ...s, voice } : s,
				),
			}),
		removeSpeaker: (name) => {
			const list = metaRef.current.speakers ?? [];
			if (
				!list.some((s) => s.name === name) ||
				speakerParagraphCount(paragraphsRef.current, name) > 0
			)
				return false;
			changeMeta({ speakers: list.filter((s) => s.name !== name) });
			return true;
		},
		restoreSpeaker: (speaker, at) =>
			changeMeta({
				speakers: speakerRestore(metaRef.current.speakers ?? [], speaker, at),
			}),
		presetHost,
		notice,
		found,
		findState,
		refind: () => void findNow(false),
		live,
		requestOf,
		statusOf,
		make: makeApi.make,
		confirming: makeApi.confirming,
		makeAll: makeApi.makeAll,
		makeOne: makeApi.makeOne,
		stop: makeApi.stop,
		confirm: makeApi.confirm,
		cancel: makeApi.cancel,
		listen: (id) => void listen(id),
		receive: (kind) => void receive(kind),
		receiving,
		shown,
		rates,
		ratesLoading: models.isPending,
		now,
	};
	return (
		<WorkContext value={api}>
			<ParagraphsProvider
				latest={paragraphsRef}
				bridge={bridge}
				onChange={changedParagraphs}
			>
				{children}
			</ParagraphsProvider>
		</WorkContext>
	);
}

export function useWork(): WorkApi {
	const work = useContext(WorkContext);
	if (!work) throw new Error("useWork는 WorkProvider 안에서만 쓴다");
	return work;
}

// 문단 배열과 고침(카드 목록·대본 칸·붙여 넣기). 글자마다 바뀐다
export function useParagraphs(): ParagraphsApi {
	const paragraphs = useContext(ParagraphsContext);
	if (!paragraphs)
		throw new Error("useParagraphs는 WorkProvider 안에서만 쓴다");
	return paragraphs;
}

// 요약·막대가 읽는 늦춘 문단 배열(낮은 우선순위로 다시 그린다, E10)
export function useShownParagraphs(): Paragraph[] {
	return useContext(ShownParagraphsContext);
}
