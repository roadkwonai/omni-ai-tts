// apps/web/src/components/voice-picker-dialog.tsx
"use client";

import { DEFAULT_SETTINGS } from "@tts-pilot-app/api/providers/trial-options";
import { Button, buttonVariants } from "@tts-pilot-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@tts-pilot-app/ui/components/dialog";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@tts-pilot-app/ui/components/tabs";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import {
	type ReactElement,
	type RefObject,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

import { DRAMA_TEXT } from "@/lib/drama-view";
import type { VoiceSetup } from "@/lib/paragraph-script";
import { PRESET_TEXT } from "@/lib/preset-view";
import { usableDefaultVoice } from "@/lib/studio-draft";
import { PARAGRAPH_TEXT } from "@/lib/studio-text";
import { listLoad, STUDIO_TEXT, savedOf } from "@/lib/studio-view";

import { DialogCloseButton } from "./dialog-close-button";
import {
	FailedRow,
	LoadingRows,
	PresetOption,
	SavedOption,
	TAB_PANEL,
} from "./drama-voice-dialog";
import { useWork } from "./paragraph-provider";
import { usePresetList } from "./presets";
import { usePlayer } from "./sample-player";

// 문단 작업실 성우 고르기 창(T10 브리프 5.8, '스펙과 다른 점' 9): 드라마 창 부품으로 '담은 성우'(다섯 공급자)·'프리셋' 두 탭.
// 대상은 기본 성우 또는 문단 N이다. 담은 성우를 고르면 같은 공급자면 지금 설정을 두고, 다르면 그 공급자 처음 값이다. 프리셋은 성우와 설정을 함께 넘긴다.
// 포커스(T9판 7절): 받는 중이면 '닫기', 아니면 고른 성우, 없으면 '담은 성우' 탭. 고르거나 닫으면 연 버튼(DialogTrigger 기본). 닫히면 창에서 튼 기본 샘플을 멈춘다

// speaker: 화자 성우(고르면 그 화자의 성우), selection: 고르기에서 고른 문단 count개(고르면 모두 자기 성우로 갖는다)
export type PickTarget =
	| { kind: "default" }
	| { kind: "paragraph"; n: number }
	| { kind: "speaker"; name: string }
	| { kind: "selection"; count: number };

// 창 머리 설명(브리프 5.8·16.5)
function targetText(target: PickTarget) {
	switch (target.kind) {
		case "default":
			return PARAGRAPH_TEXT.pickForDefault;
		case "paragraph":
			return PARAGRAPH_TEXT.pickForParagraph(target.n);
		case "speaker":
			return PARAGRAPH_TEXT.pickForSpeaker(target.name);
		case "selection":
			return PARAGRAPH_TEXT.pickForSelection(target.count);
	}
}
type Tab = "saved" | "preset";

type PickerProps = {
	target: PickTarget;
	// 지금 성우(고른 줄 표시). 없으면 null
	current: VoiceSetup | null;
	onPick: (setup: VoiceSetup, presetId?: string) => void;
	// 문단 대상이고 자기 성우일 때만 준다: 목록 위 '기본 따르기(이름)'. 문단이 화자 성우를 따르면 follow·speaker로 '화자 따르기(이름)'.
	// 화자 대상이고 성우를 정했을 때도 준다(목록 위 '비우기(기본 성우 따름)')
	onFollowDefault?: () => void;
	// 문단이 자기 성우를 비우면 따르는 성우와, 그것이 화자 성우이면 그 화자 이름. 안 주면 기본 성우
	follow?: VoiceSetup | null;
	speaker?: string | null;
};

// 바깥은 열림과 트리거만 든다. 목록·프리셋·플레이어 구독과 탭·포커스는 열렸을 때만 붙는 PickerBody가 맡는다
// (문단 카드 200장이 창을 하나씩 들어도 닫힌 창은 작업 컨텍스트를 구독하지 않는다, E10)
export function VoicePickerDialog({
	trigger,
	...props
}: PickerProps & {
	// 창을 여는 버튼(DialogTrigger의 render로 그린다)
	trigger: ReactElement;
}) {
	const [open, setOpen] = useState(false);
	// 첫 포커스 자리. 열린 PickerBody가 채운다
	const firstRef = useRef<HTMLElement | null>(null);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={trigger} />
			{/* 768px 이상은 세로 flex: 창이 최대 높이(알림 자리, MG-14)에 걸리면 창 대신 탭 묶음이 줄어 패널만 스크롤한다(드라마 창과 같다) */}
			<DialogContent
				initialFocus={() => firstRef.current ?? true}
				className="md:flex md:max-w-2xl md:flex-col"
			>
				<PickerBody
					{...props}
					firstRef={firstRef}
					onClose={() => setOpen(false)}
				/>
			</DialogContent>
		</Dialog>
	);
}

function PickerBody({
	target,
	current,
	onPick,
	onFollowDefault,
	follow,
	speaker = null,
	firstRef,
	onClose,
}: PickerProps & {
	firstRef: RefObject<HTMLElement | null>;
	onClose: () => void;
}) {
	const work = useWork();
	const player = usePlayer();
	const presetList = usePresetList();
	// 열 때마다 이 칸이 새로 붙어 '담은 성우' 탭에서 시작한다
	const [tab, setTab] = useState<Tab>("saved");
	// 창을 연 시각('최근 사용 3일 전'의 기준). 렌더 중 new Date()는 쓰지 않는다(교훈 2026-10-21)
	const [now] = useState(() => new Date());
	const chosenRef = useRef<HTMLButtonElement>(null);
	const savedTabRef = useRef<HTMLButtonElement>(null);
	const presetTabRef = useRef<HTMLButtonElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	// '다시 불러오기'로 실패 줄이 사라지면 포커스를 그 탭으로 옮긴다(포커스를 쥔 버튼이 없어지지 않게, T9 QA-1)
	const refocus = useRef<{
		list: "voices" | "presets";
		to: HTMLElement | null;
	} | null>(null);
	const stopRef = useRef(player.stop);

	const voices = work.voices ?? [];
	const { voicesLoad } = work;
	const presetLoad = listLoad(presetList);
	// 기본 성우로 쓸 수 있는 프리셋만(담은 이용 가능 성우, usableDefaultVoice)
	const presets = (presetList.data ?? []).flatMap((preset) => {
		const saved = usableDefaultVoice(preset, voices);
		return saved ? [{ preset, voice: saved.voice }] : [];
	});
	const chosen = current
		? savedOf(voices, current.voiceId, current.provider)
		: null;
	// 자기 성우를 비우면 따르는 성우(카드가 알려 준다. 안 주면 기본 성우)의 이름
	const followVoice = follow === undefined ? work.work.defaultVoice : follow;
	const followName = followVoice
		? (savedOf(voices, followVoice.voiceId, followVoice.provider)?.voice.name ??
			null)
		: null;
	// 화자 대상은 '비우기(기본 성우 따름)'(따르는 성우를 덧붙이지 않는다), 문단 대상은 '화자 따르기'·'기본 따르기'
	const followText =
		target.kind === "speaker"
			? PARAGRAPH_TEXT.clearVoice
			: speaker
				? PARAGRAPH_TEXT.followSpeaker
				: PARAGRAPH_TEXT.followDefault;

	// 첫 포커스(T9판 7절): 받는 중이면 '닫기', 아니면 고른 성우, 없으면 '담은 성우' 탭(바깥 initialFocus가 읽는다)
	useLayoutEffect(() => {
		stopRef.current = player.stop;
		firstRef.current =
			voicesLoad === "loading"
				? closeRef.current
				: (chosenRef.current ?? savedTabRef.current);
	});
	// 창이 닫히면(이 칸이 떨어지면) 창에서 튼 기본 샘플을 멈춘다
	useEffect(() => () => stopRef.current(), []);
	useEffect(() => {
		const wait = refocus.current;
		if (!wait || (wait.list === "voices" ? voicesLoad : presetLoad) !== "ready")
			return;
		refocus.current = null;
		wait.to?.focus();
	}, [voicesLoad, presetLoad]);

	function choose(setup: VoiceSetup, presetId?: string) {
		onPick(setup, presetId);
		onClose();
	}
	function reloadVoices(to: HTMLElement | null) {
		refocus.current = { list: "voices", to };
		work.reloadVoices();
	}

	return (
		<>
			<DialogHeader className="pr-12">
				<DialogTitle>{STUDIO_TEXT.pickVoice}</DialogTitle>
				<DialogDescription>{targetText(target)}</DialogDescription>
			</DialogHeader>
			{onFollowDefault ? (
				<Button
					variant="neutral"
					size="lg"
					// 767px 이하는 grid(justify-self), 768px 이상은 flex(self)라 둘 다 글만큼 너비
					className="justify-self-start md:self-start"
					onClick={() => {
						onFollowDefault();
						onClose();
					}}
				>
					{followName && target.kind !== "speaker"
						? `${followText}(${followName})`
						: followText}
				</Button>
			) : null}
			<Tabs
				value={tab}
				onValueChange={(next) => setTab(next as Tab)}
				className="min-w-0 gap-3 md:min-h-0"
			>
				<TabsList aria-label={DRAMA_TEXT.source}>
					<TabsTrigger ref={savedTabRef} value="saved">
						{DRAMA_TEXT.savedTab}
						{voicesLoad === "ready" ? (
							<span className="font-normal text-muted-foreground tabular-nums">
								{voices.length}
							</span>
						) : null}
					</TabsTrigger>
					<TabsTrigger ref={presetTabRef} value="preset">
						{DRAMA_TEXT.presetTab}
						{presetLoad === "ready" && voicesLoad === "ready" ? (
							<span className="font-normal text-muted-foreground tabular-nums">
								{presets.length}
							</span>
						) : null}
					</TabsTrigger>
				</TabsList>
				{/* 768px 이상은 두 탭이 같은 높이이고 넘치면 패널 안에서 스크롤한다. 767px 이하는 시트만 스크롤한다(이중 스크롤 없음).
					    스크롤 칸이 포커스 윤곽을 잘라 내지 않게 좌우 4px(드라마 창과 같다) */}
				<TabsContent value="saved" tabIndex={-1} className={TAB_PANEL}>
					{voicesLoad === "loading" ? (
						<LoadingRows />
					) : voicesLoad === "failed" ? (
						<FailedRow
							text={PARAGRAPH_TEXT.voicesFailed}
							reloading={work.voicesFetching}
							onReload={() => reloadVoices(savedTabRef.current)}
						/>
					) : voices.length === 0 ? (
						<div className="flex flex-col items-start gap-3">
							<p>{PARAGRAPH_TEXT.noVoices}</p>
							{/* cn 없이 쓰면 기본 border-transparent가 neutral 테두리를 지운다(preset-board와 같다) */}
							<Link
								href="/casting"
								className={cn(
									buttonVariants({ variant: "neutral", size: "lg" }),
								)}
							>
								{PARAGRAPH_TEXT.toCasting}
								<ArrowRight data-icon="inline-end" aria-hidden="true" />
							</Link>
						</div>
					) : (
						<ul className="flex flex-col divide-y divide-border">
							{voices.map((item) => (
								<SavedOption
									key={item.id}
									ref={item.id === chosen?.id ? chosenRef : undefined}
									item={item}
									now={now}
									chosen={item.id === chosen?.id}
									onPick={() =>
										choose({
											provider: item.voice.provider,
											voiceId: item.voice.voiceId,
											settings:
												current?.provider === item.voice.provider
													? current.settings
													: DEFAULT_SETTINGS[item.voice.provider],
										} as VoiceSetup)
									}
								/>
							))}
						</ul>
					)}
				</TabsContent>
				<TabsContent value="preset" tabIndex={-1} className={TAB_PANEL}>
					{/* 프리셋은 담은 성우 목록으로 거른다. 담은 목록이 받는 중·실패면 그 뼈대·실패 줄(드라마 창과 같다) */}
					{presetLoad === "loading" || voicesLoad === "loading" ? (
						<LoadingRows />
					) : presetLoad === "failed" ? (
						<FailedRow
							text={PRESET_TEXT.listFailed}
							reloading={presetList.isFetching}
							onReload={() => {
								refocus.current = {
									list: "presets",
									to: presetTabRef.current,
								};
								void presetList.refetch();
							}}
						/>
					) : voicesLoad === "failed" ? (
						<FailedRow
							text={PARAGRAPH_TEXT.voicesFailed}
							reloading={work.voicesFetching}
							onReload={() => reloadVoices(presetTabRef.current)}
						/>
					) : presets.length === 0 ? (
						<div className="flex flex-col items-start gap-3">
							<p>{PRESET_TEXT.empty}</p>
							<p className="text-muted-foreground text-sm">
								{PRESET_TEXT.emptyDetail}
							</p>
							<Link
								href="/casting"
								className={cn(buttonVariants({ variant: "link", size: "lg" }))}
							>
								{PRESET_TEXT.toCasting}
								<ArrowRight data-icon="inline-end" aria-hidden="true" />
							</Link>
						</div>
					) : (
						<ul className="flex flex-col divide-y divide-border">
							{presets.map(({ preset, voice }) => (
								<PresetOption
									key={preset.id}
									preset={preset}
									voice={voice}
									chosen={false}
									onPick={() =>
										choose(
											{
												provider: preset.provider,
												voiceId: voice.voiceId,
												settings: preset.settings,
											} as VoiceSetup,
											preset.id,
										)
									}
								/>
							))}
						</ul>
					)}
				</TabsContent>
			</Tabs>
			{/* DOM 끝에 둔다: 받는 중 첫 포커스이고, Tab 순서에서 목록보다 뒤다(T9와 같다) */}
			<DialogCloseButton label={STUDIO_TEXT.close} ref={closeRef} />
		</>
	);
}
