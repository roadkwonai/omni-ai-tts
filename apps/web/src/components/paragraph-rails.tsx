// apps/web/src/components/paragraph-rails.tsx
"use client";

import { DEFAULT_SETTINGS } from "@tts-pilot-app/api/providers/trial-options";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button } from "@tts-pilot-app/ui/components/button";
import { DialogTrigger } from "@tts-pilot-app/ui/components/dialog";
import { Input } from "@tts-pilot-app/ui/components/input";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@tts-pilot-app/ui/components/sheet";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import {
	ChevronDown,
	Keyboard,
	SlidersHorizontal,
	Trash2,
	TriangleAlert,
	Users,
} from "lucide-react";
import { type ReactNode, useId, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { PROVIDER_LABEL } from "@/lib/connection-view";
import {
	type FoundMap,
	fillOf,
	needsCheck,
	summaryLinkOf,
	summaryOf,
	usageByProvider,
} from "@/lib/make-all";
import {
	PARAGRAPH_GAP_DEFAULT,
	type Paragraph,
	type Speaker,
	setupRequest,
} from "@/lib/paragraph-script";
import { sameSettings } from "@/lib/preset-view";
import { LIBRARY_TEXT } from "@/lib/saved-voice-view";
import { gapText } from "@/lib/sound-join";
import { PARAGRAPH_TEXT } from "@/lib/studio-text";
import { emotionShift, STUDIO_TEXT, savedOf } from "@/lib/studio-view";
import { settingsSummary } from "@/lib/trial-view";

import { fieldClass, isComposingEnter } from "./class-form-dialog";
import { useDemo } from "./demo";
import { GapInput } from "./drama-gap";
import { SpeakerMark } from "./drama-voice-dialog";
import { EmotionPalette } from "./emotion-palette";
import { LockedIconButton } from "./locked-icon-button";
import { NumberReviewButton } from "./number-review";
import { AutoTagButton } from "./paragraph-autotag";
import { VoiceMissingNote, VoiceName, voiceNameOf } from "./paragraph-card";
import { showParagraph, visible } from "./paragraph-focus";
import { ParagraphPasteDialog } from "./paragraph-paste-dialog";
import {
	useParagraphs,
	useShownParagraphs,
	useWork,
} from "./paragraph-provider";
import type { PresetHost } from "./preset-menu";
import { usePresetList } from "./presets";
import { Options } from "./setting-fields";
import { VoicePickerDialog } from "./voice-picker-dialog";
import { lockedButton } from "./voice-problem";

// 문단 작업실 레일(T10 브리프 5.3·5.6): '작업 설정'(기본 성우·문단 뒤 쉼·대본·단축키), 1단 '작업 띠', '작업 요약', 1단 요약 시트.
// 요약·채운 청록은 늦춘 문단(useShownParagraphs)과 lib 순수 함수(summaryOf·summaryLinkOf·usageByProvider·fillOf)만 읽는다(E10).
// 레일과 작업 띠는 같은 화면에 함께 그려지고 컨테이너 쿼리로 한쪽만 보인다(같은 칸이 둘, 숨은 쪽은 Tab·낭독기에 없다)

const SUBHEAD = "font-bold text-muted-foreground text-sm";
const SURFACE = "rounded-2xl bg-card p-4 ring-1 ring-border ring-inset";
const NUMBER = "font-bold text-xl tabular-nums";
const NO_FOUND: FoundMap = new Map();

// 채운 청록 버튼(브리프 4절 우선순위, DN-5). 레일·작업 띠는 paste·default_voice만 보므로 막대 준비 여부는 넘기지 않는다
function useFill() {
	const { work } = useWork();
	const ps = useShownParagraphs();
	return fillOf(ps, { ...work, paragraphs: ps }, false);
}

// 기본 성우와 그 성우가 받는 값으로 맞춘 요청(설정 요약·설정 칸). 보관함에 없으면(목록 실패) 맞추지 않은 값
function useDefaultSetup() {
	const { work, voices, now } = useWork();
	const setup = work.defaultVoice;
	const saved =
		setup && voices ? savedOf(voices, setup.voiceId, setup.provider) : null;
	const request = setup ? setupRequest(setup, voices ?? [], "", now) : null;
	return { setup, saved, request };
}

// 기본 성우 버튼과 성우 고르기 창(대상 '기본 성우'). 프리셋을 고르면 프리셋 불러오기와 같다(host.apply: 불러온 프리셋·설정 칸 다시 그리기)
function DefaultVoicePicker({
	host,
	filled,
	className,
}: {
	host: PresetHost;
	filled: boolean;
	className?: string;
}) {
	const work = useWork();
	const presets = usePresetList();
	const { setup, saved } = useDefaultSetup();
	const badgeId = useId();
	return (
		<>
			<VoicePickerDialog
				target={{ kind: "default" }}
				current={setup}
				onPick={(next, presetId) => {
					const preset = presetId
						? presets.data?.find((item) => item.id === presetId)
						: undefined;
					if (preset) host.apply(preset);
					else work.setDefaultVoice(next);
				}}
				trigger={
					<Button
						// 무채색 + 진한 이름(T9 성우 버튼). 성우가 없을 때만 채움이 4절 우선순위를 따른다
						variant={!setup && filled ? "default" : "neutral"}
						size="lg"
						data-default-voice=""
						aria-describedby={saved?.unavailable ? badgeId : undefined}
						className={cn(
							"min-w-0 max-w-full",
							setup && "justify-start",
							className,
						)}
					>
						{setup ? (
							<>
								<VoiceName saved={saved} load={work.voicesLoad} />
								<span
									className="shrink-0 font-normal text-muted-foreground"
									translate="no"
								>
									· {PROVIDER_LABEL[setup.provider]}
								</span>
							</>
						) : (
							PARAGRAPH_TEXT.pickDefaultVoice
						)}
					</Button>
				}
			/>
			{saved?.unavailable ? (
				<Badge id={badgeId} variant="secondary">
					{LIBRARY_TEXT.unavailable}
				</Badge>
			) : null}
		</>
	);
}

// 담은 성우 목록 실패(첫 로드 실패 판정은 listLoad, 교훈 2026-10-21)와 프리셋 성우 알림. 다시 받는 동안에도 남는다(포커스를 지킨다).
// '다시 불러오기'는 무채색 neutral이다(채운 청록은 4절 우선순위 하나)
function VoiceProblems() {
	const work = useWork();
	return (
		<>
			{work.voicesLoad === "failed" ? (
				<div
					aria-busy={work.voicesFetching || undefined}
					className="flex flex-col items-start gap-2"
				>
					<p className="flex items-center gap-2 text-sm text-warning">
						<TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
						{PARAGRAPH_TEXT.voicesFailed}
					</p>
					<Button
						variant="neutral"
						size="lg"
						focusableWhenDisabled
						disabled={work.voicesFetching}
						className={lockedButton(false)}
						onClick={work.reloadVoices}
					>
						{work.voicesFetching ? (
							<Spinner data-icon="inline-start" aria-hidden="true" />
						) : null}
						{PARAGRAPH_TEXT.reload}
					</Button>
				</div>
			) : null}
			{work.notice ? (
				<p className="flex gap-2 text-sm text-warning">
					<TriangleAlert
						aria-hidden="true"
						className="mt-0.5 size-4 shrink-0"
					/>
					{work.notice}
				</p>
			) : null}
			{/* 늘 그려 두는 알림 칸(새로 붙는 칸은 읽히지 않을 수 있다) */}
			<p role="status" className="sr-only">
				{work.notice ?? ""}
			</p>
		</>
	);
}

// 기본 성우 설정 칸(T9 설정 칸 그대로, 공급자별). Typecast는 감정 칸 자리에 팔레트. settingsKey는 프리셋을 불러올 때마다 올라
// 옵션 칸(글 상태가 있는 칸)을 다시 그린다. '처음 값으로'도 같이 다시 그린다
function DefaultSettings({ settingsKey }: { settingsKey: number }) {
	const work = useWork();
	const { setup, saved, request } = useDefaultSetup();
	const [resets, setResets] = useState(0);
	const pressedRef = useRef<HTMLButtonElement>(null);
	if (!setup)
		return (
			<p className="text-muted-foreground text-sm">
				{STUDIO_TEXT.settingsNeedVoice}
			</p>
		);
	if (!saved || !request) return <VoiceMissingNote load={work.voicesLoad} />;
	// 처음 값과 다르거나 불러온 프리셋이 있으면 켜진다(처음 값과 같은 프리셋도 표시를 지울 수 있게, T5·T8·T9와 같다)
	const changed =
		!sameSettings(
			setup.provider,
			setup.settings,
			DEFAULT_SETTINGS[setup.provider],
		) || work.presetHost.loaded !== null;
	return (
		<div className="flex flex-col gap-3">
			<div key={`${settingsKey}:${resets}`} className="flex flex-col gap-3">
				<Options
					voice={saved.voice}
					request={request}
					onChange={work.setDefaultSettings}
					palette={
						request.provider === "typecast" && setup.provider === "typecast" ? (
							<EmotionPalette
								voice={saved.voice}
								settings={request.settings}
								shift={emotionShift(setup.settings, request.settings)}
								pressedRef={pressedRef}
								onChange={work.setDefaultSettings}
							/>
						) : undefined
					}
				/>
			</div>
			<Button
				variant="ghost"
				size="lg"
				focusableWhenDisabled
				disabled={!changed}
				className={cn(
					"self-start text-muted-foreground",
					lockedButton(!changed),
				)}
				onClick={() => {
					work.resetDefaultSettings();
					setResets((count) => count + 1);
				}}
			>
				{PARAGRAPH_TEXT.reset}
			</Button>
		</div>
	);
}

// 문단 뒤 기본 쉼 칸(드라마 DefaultGap 모양, 0~5초 0.1초). 이름표는 호스트가 htmlFor로 단다(레일은 소제목, 작업 띠는 칸 옆).
// 비우거나 글자면 문단 쉼의 처음 값 0.5초다(DefaultGap은 드라마 처음 값 0.3초라 쓰지 않는다, '스펙과 다른 점' 11)
function GapField({ id }: { id: string }) {
	const work = useWork();
	const helpId = useId();
	const { gap } = work.work;
	return (
		<span className="flex items-center gap-1.5 text-muted-foreground text-sm">
			<GapInput
				id={id}
				name="paragraph-gap-default"
				value={gapText(gap)}
				describedBy={helpId}
				onCommit={(next) => {
					const value = next ?? PARAGRAPH_GAP_DEFAULT;
					if (value !== gap) work.setGap(value);
				}}
			/>
			<span>{PARAGRAPH_TEXT.gapUnit}</span>
			<span id={helpId} className="sr-only">
				{PARAGRAPH_TEXT.gapHelp}
			</span>
		</span>
	);
}

// 화자 한 줄(브리프 16.1): 이름(14px 700)과 문단 수, 아래 성우 버튼, 오른쪽 끝 지우기. 문단이 있는 화자는 지우기가 잠기고 이유를 단다
function SpeakerRow({
	speaker,
	index,
	count,
	onRemove,
}: {
	speaker: Speaker;
	// 화자 목록 순서(0부터). 표식의 번호(index + 1)와 4색 순환 색을 정한다
	index: number;
	count: number;
	onRemove: () => void;
}) {
	const work = useWork();
	const hintId = useId();
	const { name, voice } = speaker;
	const saved =
		voice && work.voices
			? savedOf(work.voices, voice.voiceId, voice.provider)
			: null;
	const busy = count > 0;
	// 성우 목록을 받는 중이면 이름 없이 공급자만(구분점으로 시작하지 않는다, 카드 voiceLabel과 같은 규칙)
	const current = voice
		? PARAGRAPH_TEXT.speakerVoiceNow(
				voiceNameOf(saved, work.voicesLoad),
				PROVIDER_LABEL[voice.provider],
			)
		: PARAGRAPH_TEXT.speakerFollowsDefault;
	// 성우가 없고 이 화자 문단이 있으면 고르면 함께 따른다는 안내
	const hint =
		!voice && count > 0 ? PARAGRAPH_TEXT.speakerPicksFollow(count) : null;
	return (
		<li className="flex items-center gap-1">
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex items-center gap-2 px-3">
					<SpeakerMark index={index} />
					<span title={name} className="min-w-0 truncate font-bold text-sm">
						{name}
					</span>
					<span className="ml-auto shrink-0 text-muted-foreground text-sm tabular-nums">
						{PARAGRAPH_TEXT.speakerParagraphs(count)}
					</span>
				</div>
				<VoicePickerDialog
					target={{ kind: "speaker", name }}
					current={voice}
					onPick={(next) => work.setSpeakerVoice(name, next)}
					onFollowDefault={
						voice ? () => work.setSpeakerVoice(name, null) : undefined
					}
					trigger={
						// 기본 성우 버튼과 같은 변형·크기(neutral lg). 성우가 없으면 '성우 고르기'가 foreground 글자다
						<Button
							variant="neutral"
							size="lg"
							data-speaker-voice={name}
							aria-label={PARAGRAPH_TEXT.speakerVoiceOf(name, current)}
							aria-describedby={hint ? hintId : undefined}
							className="w-full min-w-0 justify-start"
						>
							{voice ? (
								<>
									<VoiceName saved={saved} load={work.voicesLoad} />
									<span
										className="shrink-0 font-normal text-muted-foreground"
										translate="no"
									>
										· {PROVIDER_LABEL[voice.provider]}
									</span>
								</>
							) : (
								STUDIO_TEXT.pickVoice
							)}
						</Button>
					}
				/>
				{hint ? (
					<p id={hintId} className="px-3 text-muted-foreground text-sm">
						{hint}
					</p>
				) : null}
			</div>
			<LockedIconButton
				label={PARAGRAPH_TEXT.speakerRemoveOf(name)}
				tip={PARAGRAPH_TEXT.speakerRemove}
				reason={busy ? PARAGRAPH_TEXT.speakerBusy(count) : undefined}
				onClick={onRemove}
			>
				<Trash2 aria-hidden="true" />
			</LockedIconButton>
		</li>
	);
}

// 화자 줄들(레일 '작업 설정'과 1단 시트가 같이 쓴다, 계획 2.2). 화자 목록은 붙여 넣기가 더하고 여기서는 문단 0개인 화자만 지운다.
// 지우면 "화자를 지웠어요 · 민수" 되돌리기 알림을 띄운다(이름·성우·자리를 되살린다). 알림은 늘 하나라 열린 문단 되돌리기 알림은 이것이 대신한다
// (지운 이름이 되돌리기로 문단에 돌아오지 않게). 포커스는 다음 줄의 성우 버튼, 없으면 앞 줄, 다 지웠으면 기본 성우 버튼으로 옮긴다
function SpeakerRows({ onEmptied }: { onEmptied?: () => void }) {
	const work = useWork();
	const { undoable } = useParagraphs();
	const ps = useShownParagraphs();
	const rootRef = useRef<HTMLUListElement>(null);
	const list = work.work.speakers ?? [];
	// 한 번 훑어 화자별 문단 수를 센다(js-index-maps)
	const counts = useMemo(() => {
		const table = new Map<string, number>();
		for (const p of ps)
			if (p.speaker !== undefined)
				table.set(p.speaker, (table.get(p.speaker) ?? 0) + 1);
		return table;
	}, [ps]);
	function remove(name: string) {
		const at = list.findIndex((s) => s.name === name);
		const gone = list[at];
		const near = list[at + 1]?.name ?? list[at - 1]?.name;
		// 마지막 화자를 지우면 이 칸이 사라지므로 포커스 범위(레일·시트)를 먼저 잡아 둔다
		const scope = rootRef.current?.closest("[data-speaker-scope]") ?? document;
		let removed = false;
		flushSync(() => {
			removed = work.removeSpeaker(name);
		});
		if (!removed || !gone) return;
		undoable(PARAGRAPH_TEXT.speakerRemoved(name), () => {
			flushSync(() => work.restoreSpeaker(gone, at));
			// 알림 단추를 누르면 sonner가 알림에 들어오기 전 칸으로 포커스를 되돌린다. 먼저 놓은 뒤 되살린 줄의 성우 버튼으로 간다(문단 되돌리기와 같다)
			if (document.activeElement instanceof HTMLElement)
				document.activeElement.blur();
			visible(
				document,
				`[data-speaker-voice="${CSS.escape(gone.name)}"]`,
			)?.focus();
		});
		if (near === undefined) {
			onEmptied?.();
			(
				visible(scope, "[data-default-voice]") ??
				visible(document, "[data-default-voice]")
			)?.focus();
			return;
		}
		scope
			.querySelector<HTMLElement>(`[data-speaker-voice="${CSS.escape(near)}"]`)
			?.focus();
	}
	return (
		<ul ref={rootRef} className="flex w-full flex-col gap-2">
			{list.map((speaker, index) => (
				<SpeakerRow
					key={speaker.name}
					speaker={speaker}
					index={index}
					count={counts.get(speaker.name) ?? 0}
					onRemove={() => remove(speaker.name)}
				/>
			))}
		</ul>
	);
}

// 1단 작업 띠 '화자 N명'(neutral, Users). 기본 성우 '설정' 뒤에서 같은 줄 칸을 아래 시트로 연다. 마지막 화자를 지우면 시트를 닫고 기본 성우 버튼으로 돌아간다
function SpeakerSheet({ count }: { count: number }) {
	const [open, setOpen] = useState(false);
	// 마지막 화자를 지워 닫을 때만 돌아갈 단추(이 단추도 사라진다)가 기본 성우 버튼이다
	const emptied = useRef(false);
	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (next) emptied.current = false;
				setOpen(next);
			}}
		>
			<DialogTrigger render={<Button variant="neutral" size="lg" />}>
				<Users data-icon="inline-start" aria-hidden="true" />
				{PARAGRAPH_TEXT.speakersBand(count)}
			</DialogTrigger>
			<SheetContent
				side="bottom"
				finalFocus={() =>
					emptied.current
						? (visible(document, "[data-default-voice]") ?? true)
						: true
				}
			>
				<SheetHeader>
					<SheetTitle>{PARAGRAPH_TEXT.speakers}</SheetTitle>
				</SheetHeader>
				<div data-speaker-scope="" className="px-4 pb-6">
					<SpeakerRows
						onEmptied={() => {
							emptied.current = true;
							setOpen(false);
						}}
					/>
				</div>
			</SheetContent>
		</Sheet>
	);
}

// 레일 '작업 설정'(브리프 5.3, 3단 왼쪽·2단 요약 아래): 기본 성우(버튼 · 설정 요약 · '설정' 펼침) → 문단 뒤 쉼 → 대본 → 단축키
export function WorkSettings({
	host,
	settingsKey,
}: {
	host: PresetHost;
	settingsKey: number;
}) {
	const fill = useFill();
	const { request } = useDefaultSetup();
	const [open, setOpen] = useState(false);
	const [keysOpen, setKeysOpen] = useState(false);
	const settingsId = useId();
	const keysId = useId();
	const gapId = useId();
	const speakers = useWork().work.speakers ?? [];
	return (
		<div data-speaker-scope="" className="flex flex-col gap-6">
			<div className="flex flex-col items-start gap-2">
				<h2 className={SUBHEAD}>{PARAGRAPH_TEXT.defaultVoice}</h2>
				<DefaultVoicePicker
					host={host}
					filled={fill === "default_voice"}
					className="w-full"
				/>
				{request ? (
					<p className="text-muted-foreground text-sm">
						{settingsSummary(request)}
					</p>
				) : null}
				<VoiceProblems />
				<Button
					variant="ghost"
					size="lg"
					aria-expanded={open}
					aria-controls={settingsId}
					onClick={() => setOpen((current) => !current)}
				>
					{STUDIO_TEXT.settings}
					<ChevronDown
						data-icon="inline-end"
						aria-hidden="true"
						className={cn(open && "rotate-180")}
					/>
				</Button>
				{/* 늘 그려 aria-controls가 있는 id를 가리킨다. 접혀 있으면 안을 그리지 않는다 */}
				<div
					id={settingsId}
					hidden={!open}
					className="w-full border-border border-t pt-3"
				>
					{open ? <DefaultSettings settingsKey={settingsKey} /> : null}
				</div>
			</div>
			{/* 화자 칸: 기본 성우 바로 아래, 화자가 0명이면 칸이 없다(자리 표시 없음, 브리프 16.1) */}
			{speakers.length > 0 ? (
				<div className="flex flex-col items-start gap-2">
					<h2 className={SUBHEAD}>
						{PARAGRAPH_TEXT.speakers}
						<span className="font-normal tabular-nums">
							{" · "}
							{PARAGRAPH_TEXT.speakersCount(speakers.length)}
						</span>
					</h2>
					<SpeakerRows />
				</div>
			) : null}
			<div className="flex flex-col items-start gap-2">
				<h2 className={SUBHEAD}>
					<label htmlFor={gapId}>{PARAGRAPH_TEXT.gap}</label>
				</h2>
				<GapField id={gapId} />
			</div>
			<div className="flex flex-col items-start gap-2">
				<h2 className={SUBHEAD}>{PARAGRAPH_TEXT.script}</h2>
				{/* 좁으면 '자동 태그'가 다음 줄로 감기고, 잠긴 이유는 맨 아래 한 줄이다(order-last basis-full) */}
				<div className="flex flex-wrap items-center gap-2">
					{/* 빈 상태 카드의 주 행동과 같은 '대본 붙여 넣기'라 그동안 접는다 */}
					<span className="contents group-data-empty/studio:hidden">
						<ParagraphPasteDialog filled={fill === "paste"} />
					</span>
					<AutoTagButton />
					<NumberReviewButton />
				</div>
			</div>
			<div className="flex flex-col items-start gap-2">
				<h2>
					<Button
						variant="ghost"
						size="lg"
						aria-expanded={keysOpen}
						aria-controls={keysId}
						className="text-muted-foreground"
						onClick={() => setKeysOpen((current) => !current)}
					>
						<Keyboard data-icon="inline-start" aria-hidden="true" />
						{PARAGRAPH_TEXT.shortcuts}
						<ChevronDown
							data-icon="inline-end"
							aria-hidden="true"
							className={cn(keysOpen && "rotate-180")}
						/>
					</Button>
				</h2>
				<ul id={keysId} hidden={!keysOpen} className="flex flex-col gap-3">
					{PARAGRAPH_TEXT.shortcutLines.map(({ key, note }) => (
						<li key={key} className="flex flex-col items-start gap-1 text-sm">
							<kbd className="rounded-md bg-muted px-1.5 font-bold font-sans text-foreground">
								{key}
							</kbd>
							<span className="text-muted-foreground">{note}</span>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}

// 1단 '작업 띠'(브리프 5.3·15.2): 기본 성우 · '설정'(아래 시트, DN-4) · 문단 뒤 쉼 · '대본 붙여 넣기' · '자동 태그'. 넘치면 감긴다. 단축키는 없다(터치)
export function WorkBand({
	host,
	settingsKey,
	tail,
}: {
	host: PresetHost;
	settingsKey: number;
	// 띠 끝에 붙는 단추('고르기', 호스트가 상태를 들고 있어 조각으로 받는다)
	tail?: ReactNode;
}) {
	const fill = useFill();
	const { defaultVoice, speakers } = useWork().work;
	const voiced = defaultVoice !== null;
	const gapId = useId();
	return (
		<div className="flex flex-col items-start gap-2 pb-4">
			{/* w-full: 폭이 정해져야 기본 성우 버튼의 max-w-full이 듣는다(글자 200%에서 넘치지 않게) */}
			<div className="flex w-full flex-wrap items-center gap-2">
				<DefaultVoicePicker host={host} filled={fill === "default_voice"} />
				<Sheet>
					<DialogTrigger render={<Button variant="ghost" size="lg" />}>
						<SlidersHorizontal data-icon="inline-start" aria-hidden="true" />
						{STUDIO_TEXT.settings}
					</DialogTrigger>
					<SheetContent side="bottom">
						<SheetHeader>
							<SheetTitle>{PARAGRAPH_TEXT.defaultSettings}</SheetTitle>
						</SheetHeader>
						{/* 기본 성우가 없으면 안내 아래 '기본 성우 고르기'(시트가 막다른 길이 되지 않게). 고른 뒤에도 같은 자리(둘째 칸)에 남아
						    설정 칸 위에서 고른 성우를 보이고, 성우 창이 이 버튼으로 포커스를 돌려준다(사라지면 포커스가 body로 빠진다) */}
						<div className="flex flex-col items-start gap-3 px-4 pb-6">
							{voiced ? null : <DefaultSettings settingsKey={settingsKey} />}
							<DefaultVoicePicker
								host={host}
								filled={false}
								className="w-full"
							/>
							{voiced ? (
								<div className="w-full">
									<DefaultSettings settingsKey={settingsKey} />
								</div>
							) : null}
						</div>
					</SheetContent>
				</Sheet>
				{speakers && speakers.length > 0 ? (
					<SpeakerSheet count={speakers.length} />
				) : null}
				<span className="flex items-center gap-1.5 text-muted-foreground text-sm">
					<label htmlFor={gapId}>{PARAGRAPH_TEXT.gap}</label>
					<GapField id={gapId} />
				</span>
				{/* 빈 상태 카드의 주 행동과 같은 '대본 붙여 넣기'라 그동안 접는다(레일과 같다) */}
				<span className="contents group-data-empty/studio:hidden">
					<ParagraphPasteDialog filled={fill === "paste"} />
				</span>
				<AutoTagButton />
				<NumberReviewButton />
				{tail}
			</div>
			<VoiceProblems />
		</div>
	);
}

// 문단 번호로 가기(DN-7): 숫자 칸(쉼 칸 모양) + '이동'(neutral). Enter도 이동한다. 1~문단 수 밖이면 칸 아래 경고
function JumpField({
	paragraphs,
	onShow,
}: {
	paragraphs: readonly Paragraph[];
	onShow: (id: string) => void;
}) {
	const [value, setValue] = useState("");
	const [wrong, setWrong] = useState(false);
	const id = useId();
	const warnId = useId();
	function jump() {
		const no = Number(value);
		const target = Number.isInteger(no) ? paragraphs[no - 1] : undefined;
		setWrong(!target);
		if (target) onShow(target.id);
	}
	return (
		<div className="flex flex-col gap-1">
			<div className="flex flex-wrap items-center gap-2">
				<label htmlFor={id} className="text-muted-foreground text-sm">
					{PARAGRAPH_TEXT.jumpLabel}
				</label>
				<Input
					id={id}
					name="paragraph-jump"
					type="number"
					inputMode="numeric"
					min={1}
					max={paragraphs.length}
					step={1}
					autoComplete="off"
					value={value}
					onChange={(event) => {
						setValue(event.target.value);
						setWrong(false);
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !isComposingEnter(event)) jump();
					}}
					aria-invalid={wrong || undefined}
					aria-describedby={warnId}
					className={cn(
						fieldClass,
						"drama-gap-number w-16 text-center text-foreground tabular-nums",
					)}
				/>
				<Button variant="neutral" size="lg" onClick={jump}>
					{PARAGRAPH_TEXT.jump}
				</Button>
			</div>
			{/* 늘 그려 두어 경고가 생길 때 읽힌다 */}
			<p id={warnId} aria-live="polite" className="text-sm text-warning">
				{wrong ? PARAGRAPH_TEXT.jumpRange(paragraphs.length) : null}
			</p>
		</div>
	);
}

// 요약 내용(브리프 5.6): 만든 문단 N/M + 진행 막대(무채색) + 링크 하나 → 예상 길이 → 글자 → 문단 번호로 가기, 그 아래 공급자별 예상 사용량.
// 비지 않은 문단이 없으면 숫자는 "—"이고 막대·링크가 없다. 사용량은 막힌 문단을 뺀 새 문단으로 세고(plan.estimate) 뺀 수를 아래에 적는다.
// onShow는 레일이면 바로 이동, 1단 시트면 시트를 닫고 이동한다
function SummaryBody({ onShow }: { onShow: (id: string) => void }) {
	const { work, voices, found, now, make, statusOf, rates, ratesLoading } =
		useWork();
	const ps = useShownParagraphs();
	const usageId = useId();
	const demo = useDemo();
	const { summary, link, usage, blocked } = useMemo(() => {
		const all = { ...work, paragraphs: ps };
		const { plan, link } = summaryLinkOf(
			ps,
			all,
			voices,
			found,
			now,
			make,
			statusOf,
		);
		return {
			summary: summaryOf(ps, all, voices, found, now),
			link,
			usage: plan ? usageByProvider(plan.estimate, rates, now) : [],
			blocked: plan?.blockedCount ?? 0,
		};
	}, [ps, work, voices, found, now, make, statusOf, rates]);
	const none = summary.paragraphs === 0;
	const linkText =
		link &&
		(link.kind === "stopped"
			? PARAGRAPH_TEXT.showStopped(link.n)
			: link.kind === "blocked"
				? PARAGRAPH_TEXT.showBlocked(link.n)
				: PARAGRAPH_TEXT.showUnmade(link.n));
	return (
		<div className="flex flex-col gap-6">
			<div className={cn(SURFACE, "flex flex-col gap-4")}>
				<dl className="flex flex-col gap-3">
					<div className="flex flex-col gap-1">
						<dt className="text-muted-foreground text-sm">
							{PARAGRAPH_TEXT.madeLabel}
						</dt>
						<dd className="flex flex-col items-start gap-2">
							<span className={NUMBER}>
								{none
									? PARAGRAPH_TEXT.none
									: PARAGRAPH_TEXT.madeOf(summary.made, summary.total)}
							</span>
							{none ? null : (
								<span
									aria-hidden="true"
									className="block h-1 w-full overflow-hidden rounded-full bg-muted"
								>
									<span
										className="block h-full rounded-full bg-foreground"
										style={{
											width: `${(summary.made / summary.total) * 100}%`,
										}}
									/>
								</span>
							)}
							{linkText && link && !none ? (
								<Button
									variant="link"
									size="lg"
									className="h-auto min-h-11 whitespace-normal text-left"
									onClick={() => onShow(link.id)}
								>
									{linkText}
								</Button>
							) : null}
						</dd>
					</div>
					<div className="flex flex-col gap-1">
						<dt className="text-muted-foreground text-sm">
							{PARAGRAPH_TEXT.lengthLabel}
						</dt>
						<dd className="flex items-baseline gap-2">
							<span className={NUMBER}>
								{none
									? PARAGRAPH_TEXT.none
									: PARAGRAPH_TEXT.aboutLength(summary.seconds)}
							</span>
							{none ? null : (
								<span className="text-muted-foreground text-sm">
									{PARAGRAPH_TEXT.estimated}
								</span>
							)}
						</dd>
					</div>
					<div className="flex flex-col gap-1">
						<dt className="text-muted-foreground text-sm">
							{PARAGRAPH_TEXT.charsLabel}
						</dt>
						<dd className="flex flex-col gap-0.5">
							<span className={NUMBER}>
								{none
									? PARAGRAPH_TEXT.none
									: PARAGRAPH_TEXT.chars(summary.chars)}
							</span>
							{!none && summary.empty > 0 ? (
								<span className="text-muted-foreground text-sm">
									{PARAGRAPH_TEXT.emptyExcluded(summary.empty)}
								</span>
							) : null}
						</dd>
					</div>
				</dl>
				<JumpField paragraphs={ps} onShow={onShow} />
			</div>
			{/* 공개 데모는 공급자를 부르지 않아 예상 사용량 칸을 숨긴다 */}
			<section
				aria-labelledby={usageId}
				className={demo ? "hidden" : "flex flex-col gap-2"}
			>
				<h3 id={usageId} className={SUBHEAD}>
					{PARAGRAPH_TEXT.estimate}
				</h3>
				<div className={cn(SURFACE, "flex flex-col gap-3")}>
					{usage.length === 0 ? (
						// 셀 문단이 없는데 막힌 문단이 있고 기본 성우가 없을 때만 성우를 고르라고 한다(모두 만들었으면 "—")
						!work.defaultVoice && blocked > 0 ? (
							<p className="text-muted-foreground text-sm">
								{PARAGRAPH_TEXT.estimateNeedsVoice}
							</p>
						) : (
							<p className={NUMBER}>{PARAGRAPH_TEXT.none}</p>
						)
					) : (
						<ul className="flex flex-col gap-2 text-sm">
							{usage.map((row) => (
								<li
									key={row.provider}
									className="flex flex-wrap items-center gap-x-2 gap-y-1"
								>
									{/* 공급자 이름은 번역하지 않는다(확인 창 ProviderRow와 같다) */}
									<span className="tabular-nums">
										<span translate="no">{PROVIDER_LABEL[row.provider]}</span>
										{" · "}
										{PARAGRAPH_TEXT.usageRow(
											row.count,
											row.usage.unit === "free" ? null : row.usage,
										)}
									</span>
									{row.usage.unit === "free" ? (
										<Badge variant="success">{PARAGRAPH_TEXT.free}</Badge>
									) : null}
									{/* 배율 표를 받는 중이면 아직 '모름'이 아니다(확인 창과 같은 규칙) */}
									{row.rateMissing && !ratesLoading ? (
										<span className="text-muted-foreground">
											{PARAGRAPH_TEXT.rateUnknown}
										</span>
									) : null}
								</li>
							))}
						</ul>
					)}
					{blocked > 0 ? (
						<p className="text-muted-foreground text-sm">
							{PARAGRAPH_TEXT.blockedExcluded(blocked)}
						</p>
					) : null}
					<p className="text-muted-foreground text-sm">
						{PARAGRAPH_TEXT.usageNote}
					</p>
				</div>
			</section>
		</div>
	);
}

// 레일 '작업 요약'(브리프 5.6, 3단 오른쪽에서만 보인다. 2단·1단은 막대의 SummarySheet, MG-06)
export function WorkSummary() {
	const headId = useId();
	return (
		<section aria-labelledby={headId} className="flex flex-col gap-2">
			<h2 id={headId} className={SUBHEAD}>
				{PARAGRAPH_TEXT.summary}
			</h2>
			<SummaryBody onShow={showParagraph} />
		</section>
	);
}

// 1단·2단 막대의 요약 칩("12/40 · 약 31분", neutral lg)과 아래 시트(브리프 5.6). 시트의 링크·'이동'은 시트를 먼저 닫고
// 다음 프레임에 카드 숨은 제목으로 간다. 그때는 시트가 칩으로 포커스를 돌려주지 않는다(D21).
// 멈춘 문단이나 막힌 문단이 있으면 칩에 경고 점과 접근 이름 '확인할 문단 있음'이 붙는다(요약 레일의 링크와 같은 판정)
export function SummarySheet() {
	const { work, voices, found, now, make, statusOf } = useWork();
	const ps = useShownParagraphs();
	const [open, setOpen] = useState(false);
	const jumping = useRef(false);
	// 첫 포커스는 제목이다. 입력(문단 번호)으로 가면 확인만 하려는 사람이 방해받고 휴대폰 키보드가 시트를 가린다
	const titleRef = useRef<HTMLHeadingElement>(null);
	const { summary, check } = useMemo(() => {
		const all = { ...work, paragraphs: ps };
		const { link } = summaryLinkOf(ps, all, voices, found, now, make, statusOf);
		return {
			summary: summaryOf(ps, all, voices, found, now),
			check: needsCheck(link),
		};
	}, [ps, work, voices, found, now, make, statusOf]);
	const chip =
		summary.paragraphs === 0
			? PARAGRAPH_TEXT.none
			: PARAGRAPH_TEXT.summaryChip(
					summary.made,
					summary.total,
					summary.seconds,
				);
	// '12/40 · 약 31분'은 첫 공백에서 앞(12/40)과 뒤(· 약 31분)로 가른다. 없으면(—) 통째로 앞이다
	const split = chip.indexOf(" ");
	const chipFraction = split < 0 ? chip : chip.slice(0, split);
	const chipRest = split < 0 ? "" : chip.slice(split);
	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (next) jumping.current = false;
				setOpen(next);
			}}
		>
			<DialogTrigger
				render={
					<Button
						variant="neutral"
						size="lg"
						aria-label={`${PARAGRAPH_TEXT.summary} · ${chip}${check ? ` · ${PARAGRAPH_TEXT.summaryChipCheck}` : ""}`}
						className="tabular-nums max-md:px-3"
					/>
				}
			>
				{/* 767px 이하는 막대가 한 줄이라 '12/40'만 보인다(예상 길이는 시트에 있고 접근 이름에는 전체가 있다) */}
				{chipFraction}
				{chipRest ? <span className="max-md:hidden">{chipRest}</span> : null}
				{check ? (
					<span
						aria-hidden="true"
						className="size-2 shrink-0 rounded-full bg-warning"
					/>
				) : null}
			</DialogTrigger>
			{/* 2단·큰 화면에서는 막대 폭 밖까지 퍼지지 않게 가운데에 상한을 둔다 */}
			<SheetContent
				initialFocus={titleRef}
				finalFocus={() => !jumping.current}
				side="bottom"
				className="md:mx-auto md:max-w-xl"
			>
				<SheetHeader>
					<SheetTitle
						ref={titleRef}
						tabIndex={-1}
						className="rounded-md outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
					>
						{PARAGRAPH_TEXT.summary}
					</SheetTitle>
				</SheetHeader>
				<div className="px-4 pb-6">
					<SummaryBody
						onShow={(id) => {
							jumping.current = true;
							setOpen(false);
							requestAnimationFrame(() => showParagraph(id));
						}}
					/>
				</div>
			</SheetContent>
		</Sheet>
	);
}

// 머리 오른쪽 끝(3단·2단) "문단 40 · 9,120자". 글자 수만 세므로 성우·결과 없이 summaryOf를 부른다(서명을 만들지 않는다)
export function ParagraphCount() {
	const { work, restored } = useWork();
	const ps = useShownParagraphs();
	if (!restored) return null;
	const { paragraphs, chars } = summaryOf(
		ps,
		{ ...work, paragraphs: ps },
		null,
		NO_FOUND,
		0,
	);
	return (
		<p className="ml-auto @4xl:block hidden text-muted-foreground text-sm tabular-nums">
			{PARAGRAPH_TEXT.headerCount(paragraphs, chars)}
		</p>
	);
}
