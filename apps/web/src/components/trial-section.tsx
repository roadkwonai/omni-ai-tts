"use client";

import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	AIRY_LANGUAGES,
	AIRY_STYLES,
	comboSignature,
	DEFAULT_SETTINGS,
	estimate,
	fieldsOf,
	RANGES,
	type Range,
	type TrialRequest,
} from "@tts-pilot-app/api/providers/trial-options";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Input } from "@tts-pilot-app/ui/components/input";
import { Slider } from "@tts-pilot-app/ui/components/slider";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { Switch } from "@tts-pilot-app/ui/components/switch";
import { Toggle } from "@tts-pilot-app/ui/components/toggle";
import { ToggleGroup } from "@tts-pilot-app/ui/components/toggle-group";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Coins, Info, Square } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { languageName } from "@/lib/provider-conditions";
import {
	AIRY_STYLE_LABEL,
	dataNote,
	ELEVENLABS_TAGS,
	emotionLabel,
	FIELD_LABEL,
	FISH_TAGS,
	LANGUAGE_LABEL,
	modelOptionsOf,
	presetsOf,
	requestOf,
	trialAriaLabel,
	trialProblemText,
	usageText,
	valueText,
} from "@/lib/trial-view";
import { voiceKey } from "@/lib/voice-view";

import { useRate } from "./trial-confirm";
import { useShownText, useTrial } from "./trial-provider";
import { useTrialItems } from "./trial-results";
import { sourceItem } from "./voice-casting";
import { RadioMenu } from "./voice-conditions";
import { lockedButton } from "./voice-problem";

// 슬라이더 한 줄: 왼쪽 이름표, 오른쪽 값 글자(기본값에서 벗어나면 굵게). 누르는 자리 44px.
// 손잡이의 값 글자는 늘 valueText다("1.00배", "+2반음", 계획 리뷰 D17). 채움 색은 무채색이다(Task 7, 사용자 결정 U7)
function SliderRow({
	field,
	value,
	range,
	onChange,
}: {
	field: string;
	value: number;
	range: Range;
	onChange: (value: number) => void;
}) {
	const id = useId();
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center justify-between text-sm">
				<span id={id}>{FIELD_LABEL[field] ?? field}</span>
				<span
					className={cn("tabular-nums", value !== range.default && "font-bold")}
				>
					{valueText(field, value)}
				</span>
			</div>
			<Slider
				aria-labelledby={id}
				getAriaValueText={(_formatted, next) => valueText(field, next)}
				className="min-h-11"
				min={range.min}
				max={range.max}
				step={range.step}
				value={value}
				onValueChange={(next) =>
					onChange(Array.isArray(next) ? (next[0] ?? value) : (next as number))
				}
			/>
		</div>
	);
}

const CUSTOM = "__custom";
// 말투 태그: 공식 목록 + '직접 쓰기…'(30자, 대괄호는 앱이 붙인다). "효과는 들어 봐야 알아요"는 태그를 골랐을 때만(계획 리뷰 D30)
function TagControl({
	tags,
	value,
	onChange,
}: {
	tags: { value: string; label: string }[];
	value: string;
	onChange: (value: string) => void;
}) {
	const [custom, setCustom] = useState(
		value !== "" && !tags.some((tag) => tag.value === value),
	);
	const id = useId();
	return (
		<div className="flex flex-col gap-2">
			<RadioMenu
				label="말투 태그"
				value={custom ? CUSTOM : value}
				strong={value !== ""}
				options={[
					{ value: "", label: "없음" },
					...tags.map((tag) => ({
						value: tag.value,
						label: `${tag.label} [${tag.value}]`,
					})),
					{ value: CUSTOM, label: "직접 쓰기…" },
				]}
				onChange={(next) => {
					setCustom(next === CUSTOM);
					onChange(next === CUSTOM ? "" : next);
				}}
			/>
			{custom ? (
				<Input
					aria-label="말투 태그 직접 쓰기"
					aria-describedby={id}
					name="trial-tag"
					autoComplete="off"
					value={value}
					maxLength={30}
					onChange={(event) =>
						onChange(event.target.value.replace(/[[\]\r\n]/g, ""))
					}
					className="min-h-11 rounded-xl text-base md:text-sm"
				/>
			) : null}
			{custom || value !== "" ? (
				<p id={id} className="text-muted-foreground text-sm">
					효과는 들어 봐야 알아요
				</p>
			) : null}
		</div>
	);
}

// 그 모델이 받는 옵션만 FIELDS 표 순서로 그린다(fieldsOf). 범위가 있는 필드는 슬라이더 한 줄이고,
// 나머지 여섯(감정 모드·감정·언어·화자 증폭·말투 태그·Airy 말투)만 따로 그린다(계획 리뷰 ponytail 2).
// 값은 공급자 설정을 고치고(setSetting), 성우에 맞춘 보정은 요청에서만 한다
function Options({ voice, request }: { voice: Voice; request: TrialRequest }) {
	const { setSetting } = useTrial();
	const speakerBoostId = useId();
	const { provider } = request;
	const values = request.settings as Record<string, string | number | boolean>;
	const defaults = DEFAULT_SETTINGS[provider] as Record<string, unknown>;
	const ranges: Partial<Record<string, Range>> = RANGES[provider];
	const set = (field: string, value: string | number | boolean) =>
		setSetting(provider, { [field]: value });
	const special = (field: string) => {
		switch (field) {
			case "emotion":
				// '자동 | 직접'(용어집 '감정 모드', T8 '프리셋'과 겹치지 않게, 사용자 결정 U6)
				return (
					<ToggleGroup
						key={field}
						value={[String(values.emotion)]}
						onValueChange={(next) => {
							if (next[0]) set("emotion", next[0]);
						}}
						aria-label="감정 모드"
						className="bg-muted p-1"
					>
						<Toggle value="smart" className={sourceItem}>
							자동
						</Toggle>
						<Toggle value="preset" className={sourceItem}>
							직접
						</Toggle>
					</ToggleGroup>
				);
			case "preset":
				return request.provider === "typecast" ? (
					<RadioMenu
						key={field}
						label="감정"
						value={request.settings.preset}
						strong={request.settings.preset !== defaults.preset}
						options={presetsOf(voice, request.settings.model).map((preset) => ({
							value: preset,
							label: emotionLabel(preset),
						}))}
						onChange={(preset) => set("preset", preset)}
					/>
				) : null;
			case "language":
				// Typecast는 자동 감지·한국어, Airy는 한국어·영어(T7.5 스펙 2절)
				return (
					<RadioMenu
						key={field}
						label="언어"
						value={String(values.language)}
						strong={values.language !== defaults.language}
						options={
							request.provider === "airy"
								? AIRY_LANGUAGES.map((language) => ({
										value: language,
										label: languageName(language),
									}))
								: (["auto", "kor"] as const).map((language) => ({
										value: language,
										label: LANGUAGE_LABEL[language],
									}))
						}
						onChange={(language) => set("language", language)}
					/>
				);
			case "style":
				// Airy 말투. ElevenLabs 스타일은 범위가 있어 위 슬라이더로 그려지고 여기 오지 않는다(Review Focus 4)
				return request.provider === "airy" ? (
					<RadioMenu
						key={field}
						label="말투"
						value={request.settings.style}
						strong={request.settings.style !== DEFAULT_SETTINGS.airy.style}
						options={AIRY_STYLES.map((style) => ({
							value: style,
							label: AIRY_STYLE_LABEL[style],
						}))}
						onChange={(style) => set("style", style)}
					/>
				) : null;
			case "speakerBoost":
				return (
					<div
						key={field}
						className="flex min-h-11 items-center justify-between gap-3 text-sm"
					>
						<span id={speakerBoostId}>{FIELD_LABEL.speakerBoost}</span>
						<Switch
							aria-labelledby={speakerBoostId}
							checked={values.speakerBoost === true}
							onCheckedChange={(on) => set("speakerBoost", on)}
						/>
					</div>
				);
			case "tag":
				return (
					<TagControl
						key={field}
						tags={provider === "elevenlabs" ? ELEVENLABS_TAGS : FISH_TAGS}
						value={String(values.tag)}
						onChange={(tag) => set("tag", tag)}
					/>
				);
			default:
				return null;
		}
	};
	return (
		<>
			<RadioMenu
				label="모델"
				value={String(values.model)}
				strong={values.model !== defaults.model}
				options={modelOptionsOf(voice)}
				onChange={(model) => set("model", model)}
			/>
			{fieldsOf(request).map((field) => {
				const range = ranges[field];
				return range ? (
					<SliderRow
						key={field}
						field={field}
						value={Number(values[field])}
						range={range}
						onChange={(value) => set(field, value)}
					/>
				) : (
					special(field)
				);
			})}
		</>
	);
}

// 패널 '내 문장 듣기' 구역(브리프 12절). 자리는 이용 조건 뒤, 결과 목록 앞이다(사용자 결정 U5).
// 머리('처음 값으로'는 늘 그리고 기본값이면 흐림, D12) → 옵션 → 데이터 안내 → 바닥에 붙는 줄(예상 사용량·버튼·새로 만들기·이유·오류, U3).
// 바닥 줄은 패널(칸은 voice-panel-sticky, 서랍은 본문)의 스크롤 칸 바닥에 붙고, 제자리가 보이면 풀린다
export function TrialSection({ voice }: { voice: Voice }) {
	const trial = useTrial();
	const text = useShownText();
	const request = requestOf(voice, text, trial.settings);
	const key = voiceKey(voice);
	const rate = useRate(request);
	const items = useTrialItems(voice);
	const signature = comboSignature(request);
	const saved =
		trial.hasSaved(request) ||
		items.data?.some((item) => comboSignature(item.request) === signature) ===
			true;
	const block = trial.blockOf(voice, text);
	const mine = trial.busy?.key === key;
	const creating = mine && trial.busy?.phase === "creating";
	const playing = trial.playing(voice);
	const usage = estimate(request, rate.multiplier);
	const note = dataNote(request);
	const problem = trial.problem(key);
	const problemText = problem
		? trialProblemText(voice.provider, problem)
		: null;
	const changed =
		JSON.stringify(trial.settings[voice.provider]) !==
		JSON.stringify(DEFAULT_SETTINGS[voice.provider]);
	const [resetKey, setResetKey] = useState(0);
	const headingId = useId();
	const reasonId = useId();
	const problemId = useId();
	// 빈 문장이면 예상 사용량 줄을 숨긴다(D9). 오류 줄이 있으면 막는 이유 줄은 숨기고 버튼 설명을 오류 줄로 돌린다(D11)
	const empty = block === "문장을 먼저 써 주세요";
	const describedBy = problemText ? problemId : block ? reasonId : undefined;
	return (
		<section aria-labelledby={headingId} className="flex flex-col gap-3">
			<div className="flex min-h-11 items-center justify-between gap-2">
				<h3 id={headingId} className="font-bold">
					내 문장 듣기
				</h3>
				<Button
					variant="ghost"
					size="lg"
					focusableWhenDisabled
					className={cn("text-muted-foreground", lockedButton(!changed))}
					disabled={!changed}
					onClick={() => {
						trial.resetSettings(voice.provider);
						setResetKey((current) => current + 1);
					}}
				>
					처음 값으로
				</Button>
			</div>
			<div
				key={`${voice.provider}:${resetKey}`}
				className="flex flex-col gap-3"
			>
				<Options voice={voice} request={request} />
			</div>
			{note ? (
				<p className="flex gap-2 text-muted-foreground text-sm">
					<Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
					{note}
				</p>
			) : null}
			<div className="sticky bottom-0 z-10 flex flex-col gap-2 border-border border-t pt-3 pb-1 max-xl:bg-popover xl:bg-card">
				{empty ? null : (
					<p className="flex flex-wrap items-center gap-1.5 text-sm tabular-nums">
						{saved ? (
							"저장된 결과 · 크레딧 0"
						) : usage.unit === "free" ? (
							<Badge variant="success">무료</Badge>
						) : (
							<>
								<Coins aria-hidden="true" className="size-4 text-warning" />
								새로 만들 때 {usageText(usage)}
							</>
						)}
						{!saved && rate.missing ? (
							<span className="text-muted-foreground">
								(배율을 확인하지 못했어요)
							</span>
						) : null}
					</p>
				)}
				<Button
					size="lg"
					className={cn("w-full", lockedButton(!playing && block !== null))}
					focusableWhenDisabled
					disabled={!playing && (block !== null || mine)}
					aria-label={trialAriaLabel(
						voice.name,
						request,
						playing ? "playing" : creating ? "busy" : saved ? "saved" : "idle",
					)}
					aria-describedby={describedBy}
					onClick={(event) =>
						playing ? trial.stop() : trial.listen(voice, event.currentTarget)
					}
				>
					{playing ? (
						<Square
							data-icon="inline-start"
							aria-hidden="true"
							className="fill-current"
						/>
					) : mine ? (
						<Spinner data-icon="inline-start" aria-hidden="true" />
					) : saved ? null : usage.unit === "free" ? (
						<Badge variant="success">무료</Badge>
					) : (
						// 채운 청록 버튼 안의 유료 표식은 글자색이다(Global Constraints)
						<Coins data-icon="inline-start" aria-hidden="true" />
					)}
					{playing
						? "정지"
						: creating
							? "만드는 중…"
							: saved
								? "저장된 결과 듣기"
								: "내 문장 듣기"}
				</Button>
				{/* 같은 조합을 다시 만들기(유료). 결과 줄이 아니라 여기 하나만 둔다(사용자 결정 U4) */}
				{saved && !playing ? (
					<Button
						variant="outline"
						size="lg"
						className={cn("w-full", lockedButton(block !== null))}
						focusableWhenDisabled
						disabled={block !== null || mine}
						aria-label={`${voice.name} 새로 만들기, ${usage.unit === "free" ? "무료" : "크레딧 사용"}`}
						aria-describedby={describedBy}
						onClick={(event) =>
							trial.listen(voice, event.currentTarget, { regenerate: true })
						}
					>
						{usage.unit === "free" ? (
							<Badge data-icon="inline-start" variant="success">
								무료
							</Badge>
						) : (
							<Coins
								data-icon="inline-start"
								aria-hidden="true"
								className="text-warning"
							/>
						)}
						새로 만들기
					</Button>
				) : null}
				{problemText ? (
					<div
						id={problemId}
						className="flex flex-col items-start text-sm text-warning"
					>
						<p>{problemText.text}</p>
						{problemText.connections ? (
							// T4 사유 안내와 같은 44px 링크 버튼(계획 리뷰 D25)
							<Button
								variant="link"
								size="lg"
								nativeButton={false}
								className="px-0"
								render={<Link href="/connections" />}
							>
								연결 상태 보기
							</Button>
						) : null}
					</div>
				) : block ? (
					<p id={reasonId} className="text-muted-foreground text-sm">
						{block}
					</p>
				) : null}
			</div>
		</section>
	);
}
