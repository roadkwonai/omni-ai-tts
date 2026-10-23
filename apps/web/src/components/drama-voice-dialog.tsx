// apps/web/src/components/drama-voice-dialog.tsx
"use client";

import type { Preset } from "@tts-pilot-app/api/preset-contract";
import type { ProviderId, Voice } from "@tts-pilot-app/api/providers/contract";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button, buttonVariants } from "@tts-pilot-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@tts-pilot-app/ui/components/dialog";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@tts-pilot-app/ui/components/tabs";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { ArrowRight, Check, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { type Ref, useId, useRef, useState } from "react";

import { PROVIDER_IDS, PROVIDER_LABEL } from "@/lib/connection-view";
import {
	DRAMA_TEXT,
	firstEmptySpeaker,
	modelText,
	speakerNameOf,
	speakerVoice,
} from "@/lib/drama-view";
import { PRESET_TEXT } from "@/lib/preset-view";
import {
	initialList,
	type ServerList,
	type ServerProvider,
} from "@/lib/provider-conditions";
import { LIBRARY_TEXT } from "@/lib/saved-voice-view";
import { listLoad, savedOf, usageLine } from "@/lib/studio-view";
import { metaLine, sampleKindOf, voiceKey } from "@/lib/voice-view";

import { DialogCloseButton } from "./dialog-close-button";
import { useDrama, useSpeakerLines } from "./drama-provider";
import {
	AiryVoiceList,
	EMPTY_AIRY,
	EMPTY_GEMINI,
	GeminiVoiceList,
} from "./one-list";
import { usePresetList } from "./presets";
import { usePlayer, useSample } from "./sample-player";
import { useSavedList } from "./saved-voices";
import { ServerVoiceList } from "./server-voice-list";
import { EMPTY_TYPECAST, TypecastVoiceList } from "./typecast-voice-list";
import { RadioMenu } from "./voice-conditions";
import { ReloadButton } from "./voice-problem";
import { SampleButton, type Select } from "./voice-row";

// 화자 원(브리프 9.1·9.2): 20px 원 + 번호. 색만으로 말하지 않게 늘 번호와 이름이 함께 간다.
// 클래스는 번호별 문자열 표로 둔다(Tailwind가 찾을 수 있게). 화자 카드·창 제목이 쓰고 대본 칩·무대 시간축 막대(Task 10·11)도 쓴다
export const SPEAKER_MARK = [
	"bg-speaker-1 text-speaker-1-on",
	"bg-speaker-2 text-speaker-2-on",
	"bg-speaker-3 text-speaker-3-on",
	"bg-speaker-4 text-speaker-4-on",
] as const;
export function SpeakerMark({ index }: { index: number }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"flex size-5 shrink-0 items-center justify-center rounded-full font-bold text-xs tabular-nums",
				SPEAKER_MARK[index],
			)}
		>
			{index + 1}
		</span>
	);
}

// 화자 카드의 이름 칸과 성우 버튼 id. 화자 추가·빼기 뒤 포커스와 막대의 막는 이유 이동 버튼(Task 11)이 칸을 찾는다
export const speakerFieldId = (index: number, field: "name" | "voice") =>
	`drama-speaker-${field}-${index}`;

type Tab = "saved" | "preset" | "all";
// '전체' 탭 맨 위 공급자 고르기(브리프 14절 2). 순서는 화면 전체의 공급자 순서
const PROVIDER_OPTIONS = PROVIDER_IDS.map((value) => ({
	value,
	label: PROVIDER_LABEL[value],
}));
const noop = () => {};

// 담은 성우·프리셋 탭의 받는 중: 줄 높이 뼈대 셋(브리프 5.7)
export function LoadingRows() {
	return (
		<div aria-busy="true" className="flex flex-col gap-2">
			<Skeleton aria-hidden="true" className="h-16 w-full rounded-xl" />
			<Skeleton aria-hidden="true" className="h-16 w-full rounded-xl" />
			<Skeleton aria-hidden="true" className="h-16 w-full rounded-xl" />
		</div>
	);
}

// 담은 성우·프리셋 탭의 목록 실패 줄(브리프 5.7): 경고색 사유 + '다시 불러오기'.
// 다시 받는 동안에도 남는다(포커스를 쥔 버튼이 사라지지 않게, T9 QA-1)
export function FailedRow({
	text,
	reloading,
	onReload,
}: {
	text: string;
	reloading: boolean;
	onReload: () => void;
}) {
	return (
		<div
			aria-busy={reloading || undefined}
			className="flex flex-col items-start gap-3"
		>
			<p className="flex items-center gap-2 text-sm text-warning">
				<TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
				{text}
			</p>
			<ReloadButton reloading={reloading} onReload={onReload} />
		</div>
	);
}

// '담은 성우' 탭의 성우 한 줄. 문단 작업실 성우 창(voice-picker-dialog)과 함께 쓴다.
// 다른 화자가 같은 성우를 쓰면 이름 뒤 회색 배지 usedBy를 더한다(막지 않는다, 브리프 5.7).
export function SavedOption({
	item,
	now,
	chosen,
	usedBy,
	onPick,
	ref,
}: {
	item: SavedVoice;
	now: Date;
	chosen: boolean;
	// 이 성우를 쓰는 다른 화자 이름들. 없거나 주지 않으면 배지를 그리지 않는다
	usedBy?: string | null;
	onPick: () => void;
	// 창이 열릴 때 첫 포커스(브리프 7절)
	ref?: Ref<HTMLButtonElement>;
}) {
	const sample = item.voice.previewUrl;
	const { status, toggle } = useSample(sample ?? "");
	const reasonId = useId();
	const usage = usageLine(item, now);
	const off = item.unavailable;
	return (
		<li className="flex items-center gap-3 py-2">
			<SampleButton
				status={sample ? status : "none"}
				subject={`${item.voice.name} ${sampleKindOf(item.voice)}`}
				onToggle={
					sample ? () => toggle(sample, item.voice.name, sample) : undefined
				}
			/>
			<button
				ref={ref}
				type="button"
				aria-disabled={off || undefined}
				aria-current={chosen ? "true" : undefined}
				aria-describedby={off ? reasonId : undefined}
				onClick={off ? undefined : onPick}
				className={cn(
					"flex min-h-11 min-w-0 flex-1 flex-col items-start rounded-md px-2 py-1 text-left outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring",
					chosen ? "bg-primary-subtle" : !off && "hover:bg-muted",
				)}
			>
				<span className="flex w-full min-w-0 items-center gap-2">
					<span
						className={cn(
							"min-w-0 truncate font-bold text-base",
							off && "opacity-50",
						)}
					>
						{item.voice.name}
					</span>
					{chosen ? (
						<Check
							aria-hidden="true"
							className="size-4 shrink-0 text-primary"
						/>
					) : null}
					{usedBy ? (
						<Badge variant="secondary" className="min-w-0 shrink font-normal">
							<span className="truncate">{DRAMA_TEXT.usedBy(usedBy)}</span>
						</Badge>
					) : null}
					{off ? (
						// 이름에 섞이지 않게 숨기고 aria-describedby로만 읽힌다(숨긴 요소도 설명으로 잇는다)
						<Badge id={reasonId} aria-hidden="true" variant="secondary">
							{LIBRARY_TEXT.unavailable}
						</Badge>
					) : null}
				</span>
				{/* 담은 성우는 공급자로 묶지 않으므로 메타 줄 앞에 공급자 이름을 붙인다(브리프 14절 2) */}
				<span
					className={cn(
						"max-w-full truncate text-muted-foreground text-sm",
						off && "opacity-50",
					)}
				>
					<span translate="no">{PROVIDER_LABEL[item.voice.provider]}</span>
					{` · ${metaLine(item.voice)}`}
				</span>
				{usage ? (
					<span
						className={cn(
							"text-muted-foreground text-sm tabular-nums",
							off && "opacity-50",
						)}
					>
						{usage}
					</span>
				) : null}
			</button>
		</li>
	);
}

// '프리셋' 탭의 한 줄(브리프 14절 2): 공용 샘플 → 고르기 버튼 '프리셋 이름 · 성우 이름 · 공급자'. 목록은 이용 가능한 성우의 프리셋만이다
export function PresetOption({
	preset,
	voice,
	chosen,
	onPick,
	ref,
}: {
	preset: Preset;
	// 프리셋의 성우(preset.voice를 좁힌 값)
	voice: Voice;
	chosen: boolean;
	onPick: () => void;
	ref?: Ref<HTMLButtonElement>;
}) {
	const sample = voice.previewUrl;
	const { status, toggle } = useSample(sample ?? "");
	return (
		<li className="flex items-center gap-3 py-2">
			<SampleButton
				status={sample ? status : "none"}
				subject={`${voice.name} ${sampleKindOf(voice)}`}
				onToggle={sample ? () => toggle(sample, voice.name, sample) : undefined}
			/>
			<button
				ref={ref}
				type="button"
				aria-current={chosen ? "true" : undefined}
				onClick={onPick}
				className={cn(
					"flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring",
					chosen ? "bg-primary-subtle" : "hover:bg-muted",
				)}
			>
				<span className="min-w-0 truncate">
					<span className="font-bold">{preset.name}</span>
					<span className="text-muted-foreground">
						{` · ${voice.name} · `}
						<span translate="no">{PROVIDER_LABEL[preset.provider]}</span>
					</span>
				</span>
				{chosen ? (
					<Check aria-hidden="true" className="size-4 shrink-0 text-primary" />
				) : null}
			</button>
		</li>
	);
}

// 화자 카드의 성우 버튼과 성우 고르기 창(브리프 5.3·5.7·14절, 7절 포커스).
// 성우 버튼은 두 줄이다: 성우 이름(프리셋이면 '프리셋 이름 · 성우 이름') / 공급자 · 모델 짧은 이름(actingOf의 모델).
// 탭 '담은 성우'(다섯 공급자, 최근 사용 → 즐겨찾기 → 담은 순, 행에 공급자), '프리셋'(이용 가능한 성우의 프리셋), '전체'(공급자 고르기 → 그 목록 pick, 행 누름 = 고르고 담기).
// 처음 탭: 프리셋 화자면 '프리셋', 담은 성우가 없다고 알면 '전체', 그 밖은 '담은 성우'. 고르면 닫고 포커스는 이 버튼으로 돌아온다(DialogTrigger 기본).
// 전체에서 담지 못했거나 쓸 수 없는 성우면(pickFromAll false) 창과 포커스가 그대로다. 창이 닫히면 창에서 튼 기본 샘플을 멈춘다
export function DramaVoicePicker({ index }: { index: number }) {
	const drama = useDrama();
	const lineCounts = useSpeakerLines();
	const player = usePlayer();
	// 담은 목록을 다시 받는 중(실패 줄의 '다시 불러오기' 스피너). 같은 쿼리를 함께 쓴다
	const savedList = useSavedList();
	// 프리셋 탭의 받는 중·실패(drama.presets와 같은 쿼리)
	const presetList = usePresetList();
	const [open, setOpen] = useState(false);
	const [tab, setTab] = useState<Tab>("saved");
	// 전체 탭의 공급자와 공급자마다의 검색·조건(캐스팅 voice-casting과 같은 처음 값, 공개 목록·한국어로 시작). 창을 닫아도 남는다
	const [provider, setProvider] = useState<ProviderId>("fish_audio");
	const [lists, setLists] = useState<Record<ServerProvider, ServerList>>(
		() => ({
			fish_audio: initialList("fish_audio", "public"),
			elevenlabs: initialList("elevenlabs", "public"),
		}),
	);
	const [typecast, setTypecast] = useState(EMPTY_TYPECAST);
	const [airy, setAiry] = useState(EMPTY_AIRY);
	const [gemini, setGemini] = useState(EMPTY_GEMINI);
	// 창을 연 시각('최근 사용 3일 전'의 기준, T9 VoicePicker와 같다)
	const [now, setNow] = useState(() => new Date());
	const chosenRef = useRef<HTMLButtonElement>(null);
	const savedTabRef = useRef<HTMLButtonElement>(null);
	const presetTabRef = useRef<HTMLButtonElement>(null);
	const allTabRef = useRef<HTMLButtonElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	// 전체 탭에서 담는 중. ref는 렌더를 기다리지 않고 두 번째 누름을 막고, busyKey는 그 행에 스피너·aria-busy를 보인다(브리프 5.7)
	const saving = useRef(false);
	const [busyKey, setBusyKey] = useState<string | null>(null);

	const { speakers, savedVoices, presets, voicesLoad } = drama;
	const presetLoad = listLoad(presetList);
	const speaker = speakers[index];
	if (!speaker) return null;
	// 화자 공급자로 담은 성우(Task 16 리뷰 Minor 3: Fish만 거르지 않는다)
	const current = speakerVoice(speaker, savedVoices, presets);
	// 담은 성우 탭에서 고른 줄: 프리셋 없이 성우만 붙인 화자. 프리셋 화자는 프리셋 탭의 줄이 고른 줄이다
	const chosenSaved = speaker.presetId
		? null
		: savedOf(savedVoices, speaker.voiceId, speaker.provider);
	const firstEmpty = firstEmptySpeaker(speakers, lineCounts);
	// 채운 청록은 하나다(브리프 3절): 대본에 쓰인 화자 중 성우 없는 첫 화자만. 목록을 받지 못하면 알림 줄의 '다시 불러오기'가 채운 버튼이다(T9와 같다)
	const filled = !current && index === firstEmpty && voicesLoad !== "failed";
	const name = speakerNameOf(speakers, index);
	// 처음 탭: 프리셋 화자면 '프리셋', 담은 성우가 없다고 알 때만 '전체'(받는 중·실패는 '담은 성우'의 뼈대·실패 줄)
	const startTab: Tab = speaker.presetId
		? "preset"
		: voicesLoad === "ready" && savedVoices.length === 0
			? "all"
			: "saved";
	const startTabRef =
		startTab === "all"
			? allTabRef
			: startTab === "preset"
				? presetTabRef
				: savedTabRef;
	const startProvider = speaker.provider;

	function changeOpen(next: boolean) {
		setOpen(next);
		if (next) {
			setNow(new Date());
			setTab(startTab);
			// '전체'는 화자 공급자 목록으로 연다. 새 화자는 Fish Audio다(newSpeaker, 브리프 14절 2 처음 값)
			setProvider(startProvider);
		} else player.stop();
	}
	// 첫 포커스(브리프 7절): 목록 받는 중이면 '닫기', 아니면 고른 성우·프리셋의 고르기 버튼, 없으면 처음 탭
	function firstFocus() {
		if (voicesLoad === "loading") return closeRef.current ?? true;
		return chosenRef.current ?? startTabRef.current ?? true;
	}
	// 담은 성우·프리셋 고르기. 전체에서 담는 중이면 무시한다(늦게 끝난 pickFromAll이 이 선택을 덮어쓰지 않게, 리뷰 Minor 5)
	function chooseVoice(
		voice: { provider: ProviderId; voiceId: string },
		presetId: string | null,
	) {
		if (saving.current) return;
		drama.setVoice(index, voice, presetId);
		changeOpen(false);
	}
	const pick: Select = async (voice) => {
		if (saving.current) return;
		saving.current = true;
		setBusyKey(voiceKey(voice));
		try {
			if (await drama.pickFromAll(index, voice)) changeOpen(false);
		} finally {
			saving.current = false;
			setBusyKey(null);
		}
	};
	// 다른 화자가 이 성우(같은 공급자·id)를 쓰면 그 이름들(브리프 5.7 usedBy)
	const usedBy = (voice: Voice) => {
		const names = speakers.flatMap((item, i) =>
			i !== index &&
			item.provider === voice.provider &&
			item.voiceId === voice.voiceId
				? [speakerNameOf(speakers, i)]
				: [],
		);
		return names.length > 0 ? names.join("·") : null;
	};
	// 전체 탭 목록들이 함께 받는 고르기 모드(행 누름 = 고르고 담기, 옆 패널 없음). 고른 행은 프리셋 없이 붙인 성우다
	const allChoice = {
		chosen: chosenSaved ? voiceKey(chosenSaved.voice) : null,
		pick,
		busyKey,
		focusRequested: false,
		onFocusHandled: noop,
	};

	return (
		<Dialog open={open} onOpenChange={changeOpen}>
			<DialogTrigger
				render={
					<Button
						id={speakerFieldId(index, "voice")}
						variant={current ? "ghost" : filled ? "default" : "outline"}
						size="lg"
						className={cn(
							"min-w-0 flex-1",
							// 고른 성우는 띠 안 ghost 한 줄(브리프 17절 2): 굵은 이름 + 회색 '공급자 · 모델', 넘치면 자른다. 다른 '성우 고르기'는 그대로
							current &&
								"max-w-65 flex-none justify-start gap-1.5 text-foreground hover:bg-muted aria-expanded:bg-muted max-md:max-w-none max-md:flex-1",
						)}
					/>
				}
			>
				{current ? (
					<>
						{/* 768px 이상은 이름이 4/5까지만 차지해 공급자 글이 최소 폭(min-w-8)과 말줄임으로 남는다('E'처럼 잘리지 않게) */}
						<span className="max-w-full shrink-0 truncate font-bold text-base md:max-w-4/5">
							{current.name}
						</span>
						{/* 두 글이 접근 이름에서 붙어 읽히지 않게 쉼표를 둔다 */}
						<span className="sr-only">, </span>
						<span
							className="min-w-8 truncate font-normal text-muted-foreground text-sm max-md:hidden"
							translate="no"
						>
							{`${PROVIDER_LABEL[speaker.provider]} · ${modelText(drama.actingOf(index).model)}`}
						</span>
					</>
				) : (
					<span className="truncate">{DRAMA_TEXT.pickVoice}</span>
				)}
			</DialogTrigger>
			<DialogContent initialFocus={firstFocus} className="md:max-w-2xl">
				{/* 오른쪽 위 '닫기'(44px + 12px)와 제목이 겹치지 않게 오른쪽을 비운다 */}
				<DialogHeader className="pr-12">
					<DialogTitle className="flex items-center gap-2">
						<SpeakerMark index={index} />
						{DRAMA_TEXT.pickerTitle(name)}
					</DialogTitle>
					<DialogDescription>{DRAMA_TEXT.pickerDescription}</DialogDescription>
				</DialogHeader>
				<Tabs value={tab} onValueChange={setTab} className="min-w-0 gap-3">
					<TabsList aria-label={DRAMA_TEXT.source}>
						<TabsTrigger ref={savedTabRef} value="saved">
							{DRAMA_TEXT.savedTab}
							{voicesLoad === "ready" ? (
								<span className="font-normal text-muted-foreground tabular-nums">
									{savedVoices.length}
								</span>
							) : null}
						</TabsTrigger>
						<TabsTrigger ref={presetTabRef} value="preset">
							{DRAMA_TEXT.presetTab}
							{presetLoad === "ready" ? (
								<span className="font-normal text-muted-foreground tabular-nums">
									{presets.length}
								</span>
							) : null}
						</TabsTrigger>
						<TabsTrigger ref={allTabRef} value="all">
							{DRAMA_TEXT.allTab}
						</TabsTrigger>
					</TabsList>
					{/* 768px 이상은 세 탭이 같은 높이이고 넘치면 패널 안에서 스크롤한다(끝에서 뒤 페이지로 이어지지 않는다).
					    767px 이하는 시트만 스크롤한다(이중 스크롤 없음). 패널은 Tab 정지가 아니다(안의 버튼이 정지다).
					    스크롤 칸이 포커스 윤곽을 잘라 내지 않게 좌우 4px */}
					<TabsContent
						value="saved"
						tabIndex={-1}
						className="overscroll-contain md:h-112 md:overflow-y-auto md:px-1"
					>
						{voicesLoad === "loading" ? (
							<LoadingRows />
						) : voicesLoad === "failed" ? (
							<FailedRow
								text={DRAMA_TEXT.voicesFailed}
								reloading={savedList.isFetching}
								onReload={() => drama.reloadVoices(() => savedTabRef.current)}
							/>
						) : savedVoices.length === 0 ? (
							<div className="flex flex-col items-start gap-3">
								{/* 다섯 공급자를 담는 탭이라 성우 보관함의 빈 문구를 그대로 쓴다 */}
								<p>{LIBRARY_TEXT.empty}</p>
								<Button
									variant="outline"
									size="lg"
									onClick={() => {
										setTab("all");
										allTabRef.current?.focus();
									}}
								>
									{DRAMA_TEXT.toAll}
								</Button>
								<Link
									href="/casting"
									className={cn(
										buttonVariants({ variant: "link", size: "lg" }),
									)}
								>
									{DRAMA_TEXT.toCasting}
									<ArrowRight data-icon="inline-end" aria-hidden="true" />
								</Link>
							</div>
						) : (
							<ul className="flex flex-col divide-y divide-border">
								{savedVoices.map((item) => (
									<SavedOption
										key={item.id}
										ref={item.id === chosenSaved?.id ? chosenRef : undefined}
										item={item}
										now={now}
										chosen={item.id === chosenSaved?.id}
										usedBy={usedBy(item.voice)}
										onPick={() => chooseVoice(item.voice, null)}
									/>
								))}
							</ul>
						)}
					</TabsContent>
					<TabsContent
						value="preset"
						tabIndex={-1}
						className="overscroll-contain md:h-112 md:overflow-y-auto md:px-1"
					>
						{/* 프리셋 성우는 담은 성우 목록으로 화자에 붙는다(usableSpeakers). 담은 목록이 받는 중·실패면 프리셋을 골라도 카드가 비므로
						    줄 대신 뼈대·담은 성우 실패 줄을 보인다(리뷰 Minor 4) */}
						{presetLoad === "loading" || voicesLoad === "loading" ? (
							<LoadingRows />
						) : presetLoad === "failed" ? (
							<FailedRow
								text={PRESET_TEXT.listFailed}
								reloading={presetList.isFetching}
								// 성공해 실패 줄이 사라지면 포커스를 프리셋 탭으로(브리프 7절, 담은 성우 다시 받기와 같다)
								onReload={() => drama.reloadPresets(() => presetTabRef.current)}
							/>
						) : voicesLoad === "failed" ? (
							<FailedRow
								text={DRAMA_TEXT.voicesFailed}
								reloading={savedList.isFetching}
								onReload={() => drama.reloadVoices(() => presetTabRef.current)}
							/>
						) : presets.length === 0 ? (
							<div className="flex flex-col items-start gap-3">
								<p>{PRESET_TEXT.empty}</p>
								<p className="text-muted-foreground text-sm">
									{PRESET_TEXT.emptyDetail}
								</p>
								<Link
									href="/casting"
									className={cn(
										buttonVariants({ variant: "link", size: "lg" }),
									)}
								>
									{PRESET_TEXT.toCasting}
									<ArrowRight data-icon="inline-end" aria-hidden="true" />
								</Link>
							</div>
						) : (
							<ul className="flex flex-col divide-y divide-border">
								{presets.map((preset) => {
									// drama.presets는 성우가 있는 프리셋만 거른다. 타입을 좁힌다
									const voice = preset.voice;
									if (!voice) return null;
									const chosen = preset.id === speaker.presetId;
									return (
										<PresetOption
											key={preset.id}
											ref={chosen ? chosenRef : undefined}
											preset={preset}
											voice={voice}
											chosen={chosen}
											onPick={() =>
												chooseVoice(
													{ provider: preset.provider, voiceId: voice.voiceId },
													preset.id,
												)
											}
										/>
									);
								})}
							</ul>
						)}
					</TabsContent>
					<TabsContent
						value="all"
						tabIndex={-1}
						className="overscroll-contain md:h-112 md:overflow-y-auto md:px-1"
					>
						<div className="flex flex-col gap-4">
							<RadioMenu<ProviderId>
								label={DRAMA_TEXT.providerPick}
								value={provider}
								options={PROVIDER_OPTIONS}
								onChange={setProvider}
								align="start"
								className="self-start"
							/>
							{/* 공급자마다 목록 컴포넌트가 다르다. ElevenLabs·Fish Audio는 같은 컴포넌트라 공급자로 다시 마운트한다(검색 칸 상태가 섞이지 않게) */}
							{provider === "typecast" ? (
								<TypecastVoiceList
									state={typecast}
									onStateChange={setTypecast}
									{...allChoice}
								/>
							) : provider === "airy" ? (
								<AiryVoiceList
									state={airy}
									onStateChange={setAiry}
									{...allChoice}
								/>
							) : provider === "gemini" ? (
								<GeminiVoiceList
									state={gemini}
									onStateChange={setGemini}
									{...allChoice}
								/>
							) : (
								<ServerVoiceList
									key={provider}
									list={lists[provider]}
									onListChange={(list) =>
										setLists((all) => ({ ...all, [provider]: list }))
									}
									{...allChoice}
								/>
							)}
						</div>
					</TabsContent>
				</Tabs>
				{/* DOM 끝에 둔다: 받는 중 첫 포커스이고, Tab 순서에서 목록보다 뒤다(T9와 같다) */}
				<DialogCloseButton label={DRAMA_TEXT.close} ref={closeRef} />
			</DialogContent>
		</Dialog>
	);
}
