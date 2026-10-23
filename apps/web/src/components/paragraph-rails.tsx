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
	TriangleAlert,
} from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

import { PROVIDER_LABEL } from "@/lib/connection-view";
import {
	type FoundMap,
	fillOf,
	firstLink,
	makePlan,
	summaryOf,
	usageByProvider,
} from "@/lib/make-all";
import {
	PARAGRAPH_GAP_DEFAULT,
	type Paragraph,
	setupRequest,
} from "@/lib/paragraph-script";
import { sameSettings } from "@/lib/preset-view";
import { LIBRARY_TEXT } from "@/lib/saved-voice-view";
import { gapText } from "@/lib/sound-join";
import { PARAGRAPH_TEXT } from "@/lib/studio-text";
import { emotionShift, STUDIO_TEXT, savedOf } from "@/lib/studio-view";
import { settingsSummary } from "@/lib/trial-view";

import { fieldClass, isComposingEnter } from "./class-form-dialog";
import { GapInput } from "./drama-gap";
import { EmotionPalette } from "./emotion-palette";
import { AutoTagButton } from "./paragraph-autotag";
import { VoiceMissingNote, VoiceName } from "./paragraph-card";
import { showParagraph } from "./paragraph-focus";
import { ParagraphPasteDialog } from "./paragraph-paste-dialog";
import { useShownParagraphs, useWork } from "./paragraph-provider";
import type { PresetHost } from "./preset-menu";
import { usePresetList } from "./presets";
import { Options } from "./setting-fields";
import { VoicePickerDialog } from "./voice-picker-dialog";
import { lockedButton } from "./voice-problem";

// 문단 작업실 레일(T10 브리프 5.3·5.6): '작업 설정'(기본 성우·문단 뒤 쉼·대본·단축키), 1단 '작업 띠', '작업 요약', 1단 요약 시트.
// 요약·채운 청록은 늦춘 문단(useShownParagraphs)과 lib 순수 함수(summaryOf·makePlan·usageByProvider·firstLink·fillOf)만 읽는다(E10).
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
	return (
		<div className="flex flex-col gap-6">
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
					<ParagraphPasteDialog filled={fill === "paste"} />
					<AutoTagButton />
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
}: {
	host: PresetHost;
	settingsKey: number;
}) {
	const fill = useFill();
	const voiced = useWork().work.defaultVoice !== null;
	const gapId = useId();
	return (
		<div className="flex flex-col items-start gap-2 pb-4">
			<div className="flex flex-wrap items-center gap-2">
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
				<span className="flex items-center gap-1.5 text-muted-foreground text-sm">
					<label htmlFor={gapId}>{PARAGRAPH_TEXT.gap}</label>
					<GapField id={gapId} />
				</span>
				<ParagraphPasteDialog filled={fill === "paste"} />
				<AutoTagButton />
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
	const { summary, link, usage, blocked } = useMemo(() => {
		const all = { ...work, paragraphs: ps };
		const plan = voices ? makePlan(ps, all, voices, found, now) : null;
		return {
			summary: summaryOf(ps, all, voices, found, now),
			link: firstLink(
				make,
				plan ?? { firstBlocked: null },
				ps.map((p, i) => ({ id: p.id, n: i + 1, status: statusOf(p) })),
			),
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
			<section aria-labelledby={usageId} className="flex flex-col gap-2">
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

// 레일 '작업 요약'(브리프 5.6, 3단 오른쪽·2단 오른쪽 맨 위, DN-3)
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

// 1단 막대의 요약 칩("12/40 · 약 31분", neutral lg)과 아래 시트(브리프 5.6). 시트의 링크·'이동'은 시트를 먼저 닫고
// 다음 프레임에 카드 숨은 제목으로 간다. 그때는 시트가 칩으로 포커스를 돌려주지 않는다(D21)
export function SummarySheet() {
	const { work, voices, found, now } = useWork();
	const ps = useShownParagraphs();
	const [open, setOpen] = useState(false);
	const jumping = useRef(false);
	const summary = useMemo(
		() => summaryOf(ps, { ...work, paragraphs: ps }, voices, found, now),
		[ps, work, voices, found, now],
	);
	const chip =
		summary.paragraphs === 0
			? PARAGRAPH_TEXT.none
			: PARAGRAPH_TEXT.summaryChip(
					summary.made,
					summary.total,
					summary.seconds,
				);
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
						aria-label={`${PARAGRAPH_TEXT.summary} · ${chip}`}
						className="tabular-nums"
					/>
				}
			>
				{chip}
			</DialogTrigger>
			<SheetContent finalFocus={() => !jumping.current} side="bottom">
				<SheetHeader>
					<SheetTitle>{PARAGRAPH_TEXT.summary}</SheetTitle>
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
