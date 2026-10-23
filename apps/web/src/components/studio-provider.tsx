// apps/web/src/components/studio-provider.tsx
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Preset } from "@tts-pilot-app/api/preset-contract";
import {
	comboSignature,
	DEFAULT_SETTINGS,
	type SettingsOf,
	type TypecastSettings,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import type { StudioItem } from "@tts-pilot-app/api/studio-contract";
import {
	createContext,
	type ReactNode,
	type RefObject,
	useContext,
	useDeferredValue,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";

import { loadStored, saveBlob, store } from "@/lib/browser";
import { MESSAGES, saveFailure } from "@/lib/classes-view";
import {
	createFailureOf,
	fetchAudio,
	type ListLoad,
	listLoad,
	pickableVoices,
	type ResultTarget,
	readSetup,
	resultTarget,
	SCRIPT_KEY,
	SETUP_KEY,
	STUDIO_TEXT,
	type StudioProblem,
	sameResult,
	savedOf,
	studioBlock,
	studioLoadView,
	studioRequestOf,
	type TypecastRequest,
	unknownRefetch,
	usablePresetVoice,
	voiceNameOf,
} from "@/lib/studio-view";
import { type TrialProblem, trialFailureOf } from "@/lib/trial-view";
import { client, OWNED_LIST, orpc } from "@/utils/orpc";

import type { PresetHost } from "./preset-menu";
import { useSavedList } from "./saved-voices";
import { TrialConfirm, type TrialPending } from "./trial-confirm";
import type { LoadedPreset } from "./trial-provider";
import { useCooldown } from "./voice-problem";

// 이전 결과(최근 20, 완료·미확인). 막대의 '저장된 결과 열기' 판정과 이전 결과 목록이 같은 키를 쓴다(TanStack 중복 제거).
// 늦은 결과가 보고 있는 화면에서도 완료로 바뀌게 만든 지 6분 안의 미확인 줄이 있으면 15초마다 다시 받는다('스펙과 다른 점' 16)
export const useStudioItems = () =>
	useQuery({
		...orpc.studioList.queryOptions(OWNED_LIST),
		refetchInterval: (query) => unknownRefetch(query.state.data, Date.now()),
	});

type Busy = { phase: "finding" | "creating"; since: number };
// 플레이어에 올린 결과. blob은 내려받기가 다시 받지 않게 둔다. caption은 막대 캡션·접근 이름이다(디자인 리뷰 D3).
// autoplay면 올리자마자 재생한다(이전 결과 '재생')
export type Shown = ResultTarget & {
	url: string;
	blob: Blob;
	autoplay: boolean;
};
// 조각을 받는 중인 결과와 동작(디자인 리뷰 D8: 줄의 받는 중 표시). fresh는 방금 만든 결과를 받는 중이다(막대의 '결과를 받는 중', 줄 재생과 구분)
type Receiving = { id: string; action: "open" | "download"; fresh?: true };

type StudioApi = {
	restored: boolean;
	voices: SavedVoice[];
	// 담은 성우 목록 받기 상태. 카드·성우 창은 관찰자를 따로 붙이지 않고 이것을 읽는다
	// (데이터 없는 실패에 관찰자가 새로 붙으면 그때마다 다시 받는다. TanStack shouldLoadOnMount, QA-1)
	voicesLoad: ListLoad;
	voicesFetching: boolean;
	reloadVoices: () => void;
	voice: SavedVoice | null;
	pickVoice: (voiceId: string) => void;
	settings: SettingsOf;
	setSetting: (
		patch: Partial<Record<string, string | number | boolean>>,
	) => void;
	resetSettings: () => void;
	// 옵션 칸을 다시 그릴 열쇠('처음 값으로'·프리셋 적용)
	resetKey: number;
	channelId: string | null;
	setChannelId: (id: string | null) => void;
	presetHost: PresetHost;
	notice: string | null;
	busy: Busy | null;
	// 마지막 실패와 그 요청의 조합. 막대가 지금 조합과 견주어 보이거나 내린다(liveProblem, critique P1-b)
	problem: StudioProblem | null;
	waiting: string | null;
	receiving: Receiving | null;
	start: (opener: HTMLElement | null) => void;
	open: (item: StudioItem) => void;
	download: (item: StudioItem) => void;
	downloadShown: () => void;
	shown: Shown | null;
	forget: (id: string) => void;
};

const StudioContext = createContext<StudioApi | null>(null);
const ScriptContext = createContext<{
	text: string;
	setText: (text: string) => void;
} | null>(null);
const ShownScriptContext = createContext("");

// 대본은 이 작은 컨텍스트만 든다. 글자를 쳐도 StudioProvider·카드·이전 결과는 다시 그리지 않는다(tasks/lessons.md T7.5).
// 막대는 늦춘 대본(ShownScriptContext)으로 낮은 우선순위에서 다시 그린다. 저장은 입력 처리기에서 한다(rerender-move-effect-to-event)
function ScriptProvider({
	latest,
	children,
}: {
	latest: RefObject<string>;
	children: ReactNode;
}) {
	const [text, setText] = useState("");
	const shown = useDeferredValue(text);
	// 서버 그리기와 맞추려고 첫 그리기 뒤에 이 브라우저의 대본을 읽는다(그때까지 카드는 뼈대다)
	useEffect(() => {
		const restored = loadStored(SCRIPT_KEY) ?? "";
		latest.current = restored;
		setText(restored);
	}, [latest]);
	const script = {
		text,
		setText: (next: string) => {
			latest.current = next;
			setText(next);
			store(SCRIPT_KEY, next);
		},
	};
	return (
		<ScriptContext value={script}>
			<ShownScriptContext value={shown}>{children}</ShownScriptContext>
		</ScriptContext>
	);
}

// 음성 작업실의 성우·설정·채널·생성·결과 상태 하나(T9 스펙 4절). 유료 호출은 늘 입력 칸의 최신 대본(latestText)으로 만든다.
// 화면을 떠나면 플레이어의 blob 주소를 푼다(tts-provider 화면 절)
export function StudioProvider({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient();
	const saved = useSavedList();
	const items = useStudioItems();
	const create = useMutation({
		...orpc.studioCreate.mutationOptions(),
		retry: false,
		// 루프백으로만 붙으니 브라우저 offline 판단으로 멈추지 않게 한다(utils/orpc.ts QUIET와 같다)
		networkMode: "always",
	});
	const latestText = useRef("");
	const [setupRead, setSetupRead] = useState(false);
	const [voiceId, setVoiceId] = useState<string | null>(null);
	const [channelId, setChannelId] = useState<string | null>(null);
	const [settings, setSettings] = useState<SettingsOf>(DEFAULT_SETTINGS);
	const [loaded, setLoaded] = useState<LoadedPreset | null>(null);
	const [resetKey, setResetKey] = useState(0);
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState<Busy | null>(null);
	const [problem, setProblem] = useState<StudioProblem | null>(null);
	const [retryAt, setRetryAt] = useState<string | null>(null);
	const [pending, setPending] = useState<TrialPending | null>(null);
	const [shown, setShown] = useState<Shown | null>(null);
	const [receiving, setReceiving] = useState<Receiving | null>(null);
	const shownRef = useRef<Shown | null>(null);
	// 렌더를 기다리지 않고 두 번째 누름을 막는다(서버 선점이 정본이고 이것은 보조, tts-provider)
	const busyRef = useRef(false);
	const mounted = useRef(true);
	const openTicket = useRef(0);
	const waiting = useCooldown(retryAt);
	const voices = pickableVoices(saved.data ?? []);
	const voice = savedOf(voices, voiceId);
	const voicesLoad = listLoad(saved);
	// 저장해 둔 성우가 있으면 담은 성우 목록의 첫 받기가 끝날 때까지 기다린다('성우 고르기'가 보였다가 이름으로 바뀌지 않게, 디자인 리뷰 D7).
	// 실패 뒤 다시 받는 동안은 기다리지 않는다(isPending으로 보면 카드가 뼈대로 돌아갔다가 다시 붙으며 반복된다, QA-1)
	const restored = setupRead && !(voiceId !== null && voicesLoad === "loading");

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			openTicket.current += 1;
			if (shownRef.current) URL.revokeObjectURL(shownRef.current.url);
			shownRef.current = null;
			// 상태를 지키며 다시 붙는 경우(StrictMode, Activity)에 푼 주소가 남지 않게
			setShown(null);
		};
	}, []);
	// 이 브라우저의 임시 작업(성우·설정·채널)을 첫 그리기 뒤에 읽는다. 성우는 담은 Typecast 성우 목록에 있을 때만 쓴다(savedOf, 렌더 중 계산)
	useEffect(() => {
		const setup = readSetup(loadStored(SETUP_KEY));
		setVoiceId(setup.voiceId);
		setChannelId(setup.channelId);
		setSettings((all) => ({ ...all, typecast: setup.settings }));
		setSetupRead(true);
	}, []);
	// 바뀔 때마다 쓴다. 읽기 전에는 쓰지 않는다(처음 값으로 덮지 않게)
	useEffect(() => {
		if (setupRead)
			store(
				SETUP_KEY,
				JSON.stringify({ voiceId, channelId, settings: settings.typecast }),
			);
	}, [setupRead, voiceId, channelId, settings]);

	const refreshItems = () =>
		queryClient.invalidateQueries({ queryKey: orpc.studioList.key() });
	function fail(next: TrialProblem, signature: string) {
		if (!mounted.current) return;
		if (next.reason === "rate_limit" && next.retryAt) setRetryAt(next.retryAt);
		setProblem({ ...next, signature });
	}
	// 조각 받기 실패. 다른 탭에서 지웠거나 만료된 결과(NOT_FOUND)는 스펙 문구로 알리고 목록을 다시 받는다(스펙 5절 S14).
	// 그 밖의 실패는 생성 오류 줄과 따로 알림으로만 보인다('스펙과 다른 점' 17)
	function missing(error: unknown) {
		if (saveFailure(error) === "not_found") {
			toast.error(MESSAGES.notFound);
			void refreshItems();
			return;
		}
		toast.error(STUDIO_TEXT.receiveFailed);
	}
	// 플레이어에 올린 결과를 바꾼다. 바뀌는 blob 주소는 푼다(setState 갱신 함수 밖에서 한다. StrictMode는 갱신 함수를 두 번 부른다)
	function show(next: Shown | null) {
		const old = shownRef.current;
		if (old && old.url !== next?.url) URL.revokeObjectURL(old.url);
		shownRef.current = next;
		setShown(next);
	}
	// alive가 거짓이면 다음 조각을 받지 않고 멈춘다(화면을 떠난 뒤 받기)
	const audioOf = (target: ResultTarget, alive = () => true) =>
		fetchAudio(target.bytes, async (part) => {
			if (!alive()) throw new Error("unmounted");
			return client.studioAudio({ id: target.id, part });
		});
	const targetOf = (item: StudioItem) =>
		resultTarget(item, voiceNameOf(voices, item.request.voiceId), item.request);
	// 받는 중 표시를 켜고 끈다. 끝날 때 그 뒤에 시작한 받기(같은 결과·동작이어도)가 있으면 그대로 둔다
	function receive(id: string, action: Receiving["action"], fresh?: true) {
		const mark: Receiving = { id, action, fresh };
		setReceiving(mark);
		return () => setReceiving((current) => (current === mark ? null : current));
	}

	// 결과를 플레이어에 올린다(조각을 받아 합친다). 받는 사이 다른 결과를 고르면 앞의 것은 버린다
	async function open(
		target: ResultTarget,
		message: string | null,
		autoplay: boolean,
		fresh?: true,
	) {
		const ticket = ++openTicket.current;
		const old = shownRef.current;
		const done = receive(target.id, "open", fresh);
		try {
			// 다른 결과를 고르거나 화면을 떠나면(정리가 openTicket을 올린다) 앞 받기는 다음 조각을 받지 않는다
			const blob =
				old?.id === target.id
					? old.blob
					: await audioOf(target, () => ticket === openTicket.current);
			if (!mounted.current || ticket !== openTicket.current) return;
			show(
				old?.id === target.id
					? { ...old, autoplay }
					: { ...target, url: URL.createObjectURL(blob), blob, autoplay },
			);
			if (message) toast.success(message);
		} catch (error) {
			if (mounted.current && ticket === openTicket.current) missing(error);
		} finally {
			if (mounted.current) done();
		}
	}

	async function download(target: ResultTarget) {
		const done = receive(target.id, "download");
		try {
			const old = shownRef.current;
			saveBlob(
				old?.id === target.id ? old.blob : await audioOf(target),
				target.fileName,
			);
		} catch (error) {
			if (mounted.current) missing(error);
		} finally {
			if (mounted.current) done();
		}
	}

	// '음성 만들기'. 같은 조합의 저장된 결과가 있으면 그것을 연다(공급자 0회, 스펙 4절). 없으면 확인 창을 연다.
	// 같은 조합 '새로 만들기'는 두지 않는다(브리프 DN-6 A). 같은 조합의 미확인 줄이 있으면 확인 창이 중복 과금을 알린다(브리프 5.7)
	async function start(opener: HTMLElement | null) {
		const text = latestText.current;
		// 버튼 잠금은 늦춘 대본으로 정하므로 막 지우거나 넘긴 대본은 여기서 거른다
		if (
			busyRef.current ||
			!voice ||
			studioBlock({ voice, text, retryAt: waiting })
		)
			return;
		const request = studioRequestOf(voice.voice, text, settings);
		const signature = comboSignature(request);
		busyRef.current = true;
		setBusy({ phase: "finding", since: Date.now() });
		setProblem(null);
		try {
			const found =
				sameResult(items.data, signature, "done") ??
				(await client.studioFind(request));
			if (!mounted.current) return;
			if (found) {
				await open(
					resultTarget(found, voice.voice.name, request),
					STUDIO_TEXT.opened,
					false,
				);
				return;
			}
			setPending({
				voice: voice.voice,
				request,
				requestId: crypto.randomUUID(),
				regenerate: false,
				opener,
				unknownSame: sameResult(items.data, signature, "unknown") !== null,
			});
		} catch (error) {
			// 찾기는 유료가 아니다. 사유 없는 실패는 '만들지 못했어요'다
			fail(trialFailureOf(error), signature);
		} finally {
			busyRef.current = false;
			if (mounted.current) setBusy(null);
		}
	}

	// 확인 창 '크레딧 쓰고 만들기'. 같은 요청 id로 한 번만 보낸다. 끝나면 결과를 올리기만 한다(자동 재생 없음, 스펙 4절)
	async function generate(current: TrialPending) {
		if (busyRef.current) return;
		busyRef.current = true;
		setBusy({ phase: "creating", since: Date.now() });
		setProblem(null);
		const request = current.request as TypecastRequest;
		try {
			const result = await create.mutateAsync({
				requestId: current.requestId,
				request,
			});
			// 사용 이력이 바뀌었다(성우 고르기 창 정렬)
			void queryClient.invalidateQueries({
				queryKey: orpc.savedVoiceList.key(),
			});
			await refreshItems();
			// 조각 받기가 실패하면 open이 알림으로 알린다(생성은 성공했다)
			await open(
				resultTarget(result, current.voice.name, request),
				STUDIO_TEXT.made,
				false,
				true,
			);
		} catch (error) {
			// 사유 없는 실패는 크레딧이 쓰였을 수 있어 처리 여부 미확인 문구다(스펙 5절, 계획 리뷰 E1)
			fail(createFailureOf(error), comboSignature(request));
			// 미확인·실패 기록이 생겼을 수 있다(이전 결과의 미확인 줄). 목록을 받은 뒤에 버튼을 풀어
			// 바로 다시 눌러도 확인 창이 같은 조합의 미확인 줄을 보고 중복 과금을 알린다(브리프 5.7)
			await refreshItems();
		} finally {
			busyRef.current = false;
			if (mounted.current) setBusy(null);
		}
	}

	// 작업실 프리셋: 성우와 설정을 함께 불러온다(스펙 2절). 성우를 쓸 수 없으면 비우고 알린다(자동 대체 없음)
	const presetHost: PresetHost = {
		provider: "typecast",
		voice: voice?.voice ?? null,
		settings,
		loaded,
		apply: (preset: Preset) => {
			const target = usablePresetVoice(preset);
			setSettings((all) => ({
				...all,
				typecast: preset.settings as TypecastSettings,
			}));
			setLoaded({ id: preset.id, settings: preset.settings });
			setVoiceId(target?.voiceId ?? null);
			setNotice(target ? null : STUDIO_TEXT.presetVoiceUnusable);
			setProblem(null);
			setResetKey((key) => key + 1);
		},
		loadView: (preset) =>
			studioLoadView(voice?.voice ?? null, settings, preset),
		loadedMessage: STUDIO_TEXT.presetLoaded,
	};

	const api: StudioApi = {
		restored,
		voices,
		voicesLoad,
		voicesFetching: saved.isFetching,
		reloadVoices: () => void saved.refetch(),
		voice,
		pickVoice: (id) => {
			setVoiceId(id);
			setNotice(null);
			setProblem(null);
		},
		settings,
		setSetting: (patch) =>
			setSettings((all) => ({
				...all,
				typecast: { ...all.typecast, ...patch } as TypecastSettings,
			})),
		// '처음 값으로'는 불러온 프리셋 표시도 지운다(T8과 같다)
		resetSettings: () => {
			setSettings((all) => ({ ...all, typecast: DEFAULT_SETTINGS.typecast }));
			setLoaded(null);
			setResetKey((key) => key + 1);
		},
		resetKey,
		channelId,
		setChannelId,
		presetHost,
		notice,
		busy,
		problem,
		waiting,
		receiving,
		start: (opener) => void start(opener),
		open: (item) => void open(targetOf(item), null, true),
		download: (item) => void download(targetOf(item)),
		downloadShown: () => {
			const current = shownRef.current;
			if (current) saveBlob(current.blob, current.fileName);
		},
		shown,
		forget: (id) => {
			if (shownRef.current?.id === id) show(null);
		},
	};
	return (
		<StudioContext value={api}>
			<ScriptProvider latest={latestText}>{children}</ScriptProvider>
			<TrialConfirm
				kind="studio"
				pending={pending}
				onClose={() => setPending(null)}
				onConfirm={(current) => {
					setPending(null);
					void generate(current);
				}}
			/>
		</StudioContext>
	);
}

export function useStudio(): StudioApi {
	const studio = useContext(StudioContext);
	if (!studio) throw new Error("useStudio는 StudioProvider 안에서만 쓴다");
	return studio;
}

// 대본 칸 전용(최신 값)
export function useScript() {
	const script = useContext(ScriptContext);
	if (!script) throw new Error("useScript는 StudioProvider 안에서만 쓴다");
	return script;
}

// 막대가 읽는 늦춘 대본
export function useShownScript(): string {
	return useContext(ShownScriptContext);
}
