"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProviderId, Voice } from "@tts-pilot-app/api/providers/contract";
import type {
	TrialAudio,
	TrialItem,
} from "@tts-pilot-app/api/providers/trial-contract";
import {
	comboSignature,
	DEFAULT_SETTINGS,
	normalizeText,
	type SettingsOf,
	TRIAL_RESULTS_SHOWN,
	type TrialRequest,
} from "@tts-pilot-app/api/providers/trial-options";
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

import { blobUrls } from "@/lib/blob-urls";
import type { Noun } from "@/lib/sample-state";
import {
	needsConfirm,
	requestOf,
	type TrialProblem,
	trialBlock,
	trialFailureOf,
	trialProblemText,
} from "@/lib/trial-view";
import { voiceKey } from "@/lib/voice-view";
import { client, orpc } from "@/utils/orpc";

import { usePlayer } from "./sample-player";
import { TrialConfirm, type TrialPending } from "./trial-confirm";
import { useCooldown } from "./voice-problem";

// 불러온(또는 방금 저장·덮어쓴) 프리셋과 그때의 설정. 공급자마다 하나이고 화면을 떠나면 사라진다(설정과 같다, T8 스펙 4절)
export type LoadedPreset = { id: string; settings: SettingsOf[ProviderId] };

type TrialApi = {
	settings: SettingsOf;
	setSetting: (
		provider: ProviderId,
		patch: Partial<Record<string, string | number | boolean>>,
	) => void;
	resetSettings: (provider: ProviderId) => void;
	loaded: (provider: ProviderId) => LoadedPreset | null;
	// 그 공급자 설정을 프리셋 값으로 바꾸고 기억한다
	loadPreset: (provider: ProviderId, preset: LoadedPreset) => void;
	busy: { key: string; phase: "finding" | "creating" } | null;
	hasSaved: (request: TrialRequest) => boolean;
	// text는 useShownText()의 늦춘 문장
	blockOf: (voice: Voice, text: string) => string | null;
	problem: (key: string) => TrialProblem | null;
	playing: (voice: Voice) => boolean;
	stop: () => void;
	listen: (
		voice: Voice,
		opener: HTMLElement | null,
		options?: { regenerate?: boolean },
	) => void;
	playItem: (voice: Voice, item: TrialItem) => Promise<void>;
	urlOf: (id: string) => string | undefined;
	forget: (id: string) => void;
};

const TrialContext = createContext<TrialApi | null>(null);
const SentenceContext = createContext<{
	text: string;
	setText: (text: string) => void;
} | null>(null);
const ShownTextContext = createContext("");

// 문장은 TrialProvider 아래 이 컴포넌트가 든다. 탭 다섯 개의 행 수백 개가 TrialContext를 읽으므로
// 글자를 쳐도 TrialProvider는 다시 그리지 않고, 입력 칸(SentenceContext)만 바로 그린다.
// 행·패널은 늦춘 문장(ShownTextContext)으로 낮은 우선순위에서 다시 그린다(입력이 끊는다).
function SentenceProvider({
	latest,
	children,
}: {
	latest: RefObject<string>;
	children: ReactNode;
}) {
	const [text, setText] = useState("");
	const shown = useDeferredValue(text);
	const sentence = {
		text,
		setText: (next: string) => {
			latest.current = next;
			setText(next);
		},
	};
	return (
		<SentenceContext value={sentence}>
			<ShownTextContext value={shown}>{children}</ShownTextContext>
		</SentenceContext>
	);
}

// 캐스팅 화면의 문장·설정·생성 상태 하나. 화면을 떠나면 결과 오디오 주소를 해제한다.
// 유료 호출은 늘 입력 칸의 최신 문장(latestText)으로 만든다.
export function TrialProvider({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient();
	const player = usePlayer();
	const create = useMutation({
		...orpc.trialCreate.mutationOptions(),
		retry: false,
	});
	const latestText = useRef("");
	const [settings, setSettings] = useState<SettingsOf>(DEFAULT_SETTINGS);
	const [loadedPresets, setLoadedPresets] = useState<
		Partial<Record<ProviderId, LoadedPreset>>
	>({});
	const [busy, setBusy] = useState<TrialApi["busy"]>(null);
	const [retryAts, setRetryAts] = useState<Partial<Record<ProviderId, string>>>(
		{},
	);
	const [noKeys, setNoKeys] = useState<Partial<Record<ProviderId, true>>>({});
	const [problems, setProblems] = useState<Record<string, TrialProblem>>({});
	const [unknownSignatures, setUnknownSignatures] = useState<
		Record<string, string>
	>({});
	const [pending, setPending] = useState<TrialPending | null>(null);
	const [announcement, setAnnouncement] = useState("");
	const [savedReceipts, setSavedReceipts] = useState<Map<string, string>>(
		() => new Map(),
	);
	const [currentAudio, setCurrentAudio] = useState<{
		id: string;
		url: string;
	} | null>(null);
	const urls = useRef(blobUrls());
	const mounted = useRef(true);
	const creating = useRef(false);
	const findTicket = useRef(0);
	const audioTicket = useRef(0);
	const waiting: Record<ProviderId, string | null> = {
		typecast: useCooldown(retryAts.typecast),
		elevenlabs: useCooldown(retryAts.elevenlabs),
		fish_audio: useCooldown(retryAts.fish_audio),
		airy: useCooldown(retryAts.airy),
		gemini: useCooldown(retryAts.gemini),
	};

	useEffect(() => {
		mounted.current = true;
		const store = urls.current;
		return () => {
			mounted.current = false;
			findTicket.current += 1;
			audioTicket.current += 1;
			store.clear();
		};
	}, []);

	function rememberSaved(request: TrialRequest, id: string) {
		const signature = comboSignature(request);
		setSavedReceipts((current) => {
			const next = new Map(current);
			next.delete(signature);
			next.set(signature, id);
			// ponytail: 세션 영수증은 20개로 제한한다. 초과한 오래된 목록 밖 조합은 다시 찾을 수 있다.
			if (next.size > TRIAL_RESULTS_SHOWN) {
				const oldest = next.keys().next().value;
				if (oldest !== undefined) next.delete(oldest);
			}
			return next;
		});
	}

	// 기본 샘플로 옮기면 이전 생성 결과의 blob 주소를 바로 해제한다.
	useEffect(() => {
		if (player.current?.owner === null) {
			urls.current.clear();
			setCurrentAudio(null);
		}
	}, [player.current]);

	function play(voice: Voice, audio: TrialAudio, noun: Noun) {
		if (!mounted.current) return;
		const url = urls.current.ensure(audio.id, audio.audio);
		player.toggle(url, voice.name, url, noun, voiceKey(voice));
		setCurrentAudio({ id: audio.id, url });
		setAnnouncement("");
	}

	function fail(voice: Voice, request: TrialRequest, error: unknown) {
		if (!mounted.current) return;
		const problem = trialFailureOf(error);
		if (problem.reason === "rate_limit" && problem.retryAt) {
			const retryAt = problem.retryAt;
			setRetryAts((all) => ({ ...all, [request.provider]: retryAt }));
		}
		if (problem.reason === "no_key")
			setNoKeys((all) => ({ ...all, [request.provider]: true }));
		setProblems((all) => ({ ...all, [voiceKey(voice)]: problem }));
		setUnknownSignatures((all) => {
			const key = voiceKey(voice);
			if (problem.reason === "unknown_outcome")
				return { ...all, [key]: comboSignature(request) };
			const { [key]: _removed, ...rest } = all;
			return rest;
		});
		setAnnouncement(
			`${voice.name}: ${trialProblemText(request.provider, problem).text}`,
		);
	}

	// 결과 목록은 요청 당시 공급자·성우의 키로만 갱신한다.
	const refreshList = (request: TrialRequest) =>
		queryClient.invalidateQueries({
			queryKey: orpc.trialList.key({
				input: { provider: request.provider, voiceId: request.voiceId },
			}),
		});

	async function make(voice: Voice, request: TrialRequest, requestId: string) {
		if (creating.current) return;
		creating.current = true;
		findTicket.current += 1;
		const key = voiceKey(voice);
		setBusy({ key, phase: "creating" });
		setAnnouncement(`${voice.name} 내 문장을 만드는 중이에요`);
		try {
			const result = await create.mutateAsync({ requestId, request });
			await refreshList(request);
			if (!mounted.current) return;
			if (player.idle()) play(voice, result, "내 문장");
			else setAnnouncement(`${voice.name} 내 문장을 만들었어요`);
		} catch (error) {
			fail(voice, request, error);
		} finally {
			creating.current = false;
			if (mounted.current) setBusy(null);
		}
	}

	async function listen(
		voice: Voice,
		opener: HTMLElement | null,
		options: { regenerate?: boolean } = {},
	) {
		// 버튼 막힘은 늦춘 문장으로 정하므로, 막 지운 문장은 여기서 거른다
		if (
			creating.current ||
			!mounted.current ||
			normalizeText(latestText.current) === ""
		)
			return;
		const ticket = ++findTicket.current;
		audioTicket.current += 1;
		const key = voiceKey(voice);
		const request = requestOf(voice, latestText.current, settings);
		const signature = comboSignature(request);
		const retryUnknown =
			problems[key]?.reason === "unknown_outcome" &&
			unknownSignatures[key] === signature;
		setProblems(({ [key]: _removed, ...rest }) => rest);
		setPending(null);
		setBusy(null);
		if (!options.regenerate) {
			setBusy({ key, phase: "finding" });
			const playerVersion = player.version();
			try {
				const saved = await client.trialFind(request);
				if (
					!mounted.current ||
					ticket !== findTicket.current ||
					playerVersion !== player.version()
				)
					return;
				if (saved) {
					rememberSaved(request, saved.id);
					play(voice, saved, "저장된 결과");
					return;
				}
				setSavedReceipts((current) => {
					if (!current.has(signature)) return current;
					const next = new Map(current);
					next.delete(signature);
					return next;
				});
			} catch (error) {
				if (
					mounted.current &&
					ticket === findTicket.current &&
					playerVersion === player.version()
				)
					fail(voice, request, error);
				return;
			} finally {
				if (
					mounted.current &&
					ticket === findTicket.current &&
					!creating.current
				)
					setBusy(null);
			}
		}
		if (!mounted.current || ticket !== findTicket.current || creating.current)
			return;
		if (!needsConfirm(request) && !retryUnknown) {
			await make(voice, request, crypto.randomUUID());
			return;
		}
		setPending({
			voice,
			request,
			requestId: crypto.randomUUID(),
			regenerate: options.regenerate === true,
			opener,
		});
	}

	async function playItem(voice: Voice, item: TrialItem) {
		if (!mounted.current) return;
		findTicket.current += 1;
		setBusy((current) => (current?.phase === "finding" ? null : current));
		const known = urls.current.get(item.id);
		if (
			known &&
			player.current?.voiceId === known &&
			player.current.status !== "failed"
		) {
			player.toggle(known, voice.name, known, "저장된 결과", voiceKey(voice));
			return;
		}
		const ticket = ++audioTicket.current;
		const playerVersion = player.version();
		try {
			// 저장본을 들을 때마다 서버가 만료일을 30일 연장한다.
			const audio = await client.trialAudio({ id: item.id });
			if (
				!mounted.current ||
				ticket !== audioTicket.current ||
				playerVersion !== player.version()
			)
				return;
			rememberSaved(item.request, audio.id);
			play(voice, audio, "저장된 결과");
		} catch (error) {
			if (
				!mounted.current ||
				ticket !== audioTicket.current ||
				playerVersion !== player.version()
			)
				return;
			fail(voice, item.request, error);
			await refreshList(item.request);
		}
	}

	function stop() {
		const current = player.current;
		if (current)
			player.toggle(
				current.voiceId,
				current.name,
				current.voiceId,
				current.noun,
				current.owner,
			);
	}
	function forget(id: string) {
		setSavedReceipts((current) => {
			const matches = [...current].filter(([, savedId]) => savedId === id);
			if (matches.length === 0) return current;
			const next = new Map(current);
			for (const [signature] of matches) next.delete(signature);
			return next;
		});
		const url = urls.current.get(id);
		if (url && player.current?.voiceId === url) stop();
		urls.current.forget(id);
		setCurrentAudio((current) => (current?.id === id ? null : current));
	}

	const api: TrialApi = {
		settings,
		setSetting: (provider, patch) =>
			setSettings(
				(all) =>
					({
						...all,
						[provider]: { ...all[provider], ...patch },
					}) as SettingsOf,
			),
		// '처음 값으로'는 불러온 프리셋 표시도 지운다
		resetSettings: (provider) => {
			setSettings((all) => ({
				...all,
				[provider]: DEFAULT_SETTINGS[provider],
			}));
			setLoadedPresets(({ [provider]: _gone, ...rest }) => rest);
		},
		loaded: (provider) => loadedPresets[provider] ?? null,
		loadPreset: (provider, preset) => {
			setSettings(
				(all) => ({ ...all, [provider]: preset.settings }) as SettingsOf,
			);
			setLoadedPresets((all) => ({ ...all, [provider]: preset }));
		},
		busy,
		hasSaved: (request) => savedReceipts.has(comboSignature(request)),
		blockOf: (voice, text) =>
			trialBlock({
				provider: voice.provider,
				text,
				busyKey: busy?.phase === "creating" ? busy.key : null,
				key: voiceKey(voice),
				retryAt: waiting[voice.provider],
				noKey: noKeys[voice.provider] === true,
			}),
		problem: (key) => problems[key] ?? null,
		playing: (voice) => {
			const current = player.current;
			return (
				current !== null &&
				current.owner === voiceKey(voice) &&
				current.status !== "failed"
			);
		},
		stop,
		listen: (voice, opener, options) => void listen(voice, opener, options),
		playItem,
		urlOf: (id) => (currentAudio?.id === id ? currentAudio.url : undefined),
		forget,
	};
	return (
		<TrialContext value={api}>
			<SentenceProvider latest={latestText}>{children}</SentenceProvider>
			<TrialConfirm
				pending={pending}
				onClose={() => setPending(null)}
				onConfirm={(current) => {
					setPending(null);
					void make(current.voice, current.request, current.requestId);
				}}
			/>
			<p role="status" className="sr-only">
				{announcement}
			</p>
		</TrialContext>
	);
}

// TrialProvider 밖(성우 보관함)에서는 null이다. 내 문장 듣기 UI는 이것이 있을 때만 그린다(T7 스펙 2절 '보관함 패널')
export function useOptionalTrial(): TrialApi | null {
	return useContext(TrialContext);
}

// 행·패널이 읽는 늦춘 문장
export function useShownText(): string {
	return useContext(ShownTextContext);
}

// 문장 입력 칸 전용(최신 값)
export function useSentence() {
	const sentence = useContext(SentenceContext);
	if (!sentence) throw new Error("useSentence는 TrialProvider 안에서만 쓴다");
	return sentence;
}

export function useTrial(): TrialApi {
	const trial = useOptionalTrial();
	if (!trial) throw new Error("useTrial은 TrialProvider 안에서만 쓴다");
	return trial;
}
