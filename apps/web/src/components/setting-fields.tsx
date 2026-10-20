"use client";

import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	AIRY_LANGUAGES,
	AIRY_STYLES,
	DEFAULT_SETTINGS,
	fieldsOf,
	GEMINI_DIRECTION_MAX,
	RANGES,
	type Range,
	type TrialRequest,
} from "@tts-pilot-app/api/providers/trial-options";
import { Input } from "@tts-pilot-app/ui/components/input";
import { Slider } from "@tts-pilot-app/ui/components/slider";
import { Switch } from "@tts-pilot-app/ui/components/switch";
import { Toggle } from "@tts-pilot-app/ui/components/toggle";
import { ToggleGroup } from "@tts-pilot-app/ui/components/toggle-group";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Fragment, type ReactNode, useId, useState } from "react";

import { languageName } from "@/lib/provider-conditions";
import {
	AIRY_STYLE_LABEL,
	ELEVENLABS_TAGS,
	emotionLabel,
	FIELD_LABEL,
	FISH_TAGS,
	LANGUAGE_LABEL,
	modelOptionsOf,
	presetsOf,
	valueText,
} from "@/lib/trial-view";

import { RadioMenu } from "./voice-conditions";

// 공급자 설정 칸(T5 '내 문장 듣기'에서 옮김, T9). 캐스팅 패널과 작업실 카드가 함께 쓴다.
// 이 파일은 캐스팅 화면 모듈(voice-casting.tsx)을 가져오지 않는다(작업실 번들에 캐스팅 전체가 딸려 오지 않게, 계획 '스펙과 다른 점' 7)

// 출처 전환 칸(브리프 5절): muted 바탕 위 고른 칸은 흰 칸 + 경계선 + 굵은 글자, 나머지는 회색 보통 굵기. 감정 모드 '자동 | 직접'도 쓴다
export const sourceItem =
	"min-h-11 shrink-0 px-4 text-muted-foreground focus-visible:z-10 data-pressed:bg-card data-pressed:font-bold data-pressed:text-foreground data-pressed:ring-1 data-pressed:ring-border";

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

// 말투 지시(GLOSSARY): Gemini에 대본과 따로 보내는 한 줄 자유 문장(100자, 줄바꿈 없음). 비우면 보내지 않는다(문서 권장: 대부분 비워 둔다).
// 글자 수는 서버 검사와 같은 UTF-16 길이(.length, maxLength와 같은 기준)다(계획 리뷰 R6-5)
function DirectionControl({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	const id = useId();
	const hintId = useId();
	const countId = useId();
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center justify-between gap-2 text-sm">
				<label htmlFor={id}>{FIELD_LABEL.direction}</label>
				<span
					id={countId}
					className={cn(
						"text-muted-foreground tabular-nums",
						value.length >= GEMINI_DIRECTION_MAX && "text-warning",
					)}
				>
					{value.length} / {GEMINI_DIRECTION_MAX}자
				</span>
			</div>
			<Input
				id={id}
				aria-describedby={`${hintId} ${countId}`}
				name="trial-direction"
				autoComplete="off"
				placeholder="calm and relaxed"
				value={value}
				maxLength={GEMINI_DIRECTION_MAX}
				// 붙여 넣은 줄바꿈은 공백으로 바꾼다(서버는 줄바꿈을 받지 않는다)
				onChange={(event) =>
					onChange(event.target.value.replace(/[\r\n]+/g, " "))
				}
				className="min-h-11 rounded-xl text-base md:text-sm"
			/>
			<p id={hintId} className="text-muted-foreground text-sm">
				비워 두면 보내지 않아요. {GEMINI_DIRECTION_MAX}자까지 쓸 수 있어요. 예:
				calm and relaxed, speaking slowly
			</p>
		</div>
	);
}

// 그 모델이 받는 옵션만 FIELDS 표 순서로 그린다(fieldsOf). 범위가 있는 필드는 슬라이더 한 줄이고,
// 나머지 일곱(감정 모드·감정·언어·화자 증폭·말투 태그·Airy 말투·Gemini 말투 지시)만 따로 그린다(계획 리뷰 ponytail 2).
// 값을 바꾸면 onChange(바꾼 칸)를 부른다. 캐스팅은 공급자 설정, 작업실은 카드 설정이다(T9). 성우에 맞춘 보정은 요청에서만 한다.
// palette를 주면 Typecast 감정 칸(v30 '감정 모드'·'감정', v21 '감정')을 그 자리의 팔레트 하나로 바꾼다(작업실 감정 팔레트, T9 스펙 2절)
export function Options({
	voice,
	request,
	onChange,
	palette,
}: {
	voice: Voice;
	request: TrialRequest;
	onChange: (patch: Record<string, string | number | boolean>) => void;
	palette?: ReactNode;
}) {
	const speakerBoostId = useId();
	const { provider } = request;
	const values = request.settings as Record<string, string | number | boolean>;
	const defaults = DEFAULT_SETTINGS[provider] as Record<string, unknown>;
	const ranges: Partial<Record<string, Range>> = RANGES[provider];
	const set = (field: string, value: string | number | boolean) =>
		onChange({ [field]: value });
	const fields = fieldsOf(request);
	// 팔레트는 감정 칸 가운데 첫 자리 하나에 둔다(v30이면 '감정 모드' 자리, v21이면 '감정' 자리)
	const paletteAt = palette
		? fields.find((field) => field === "emotion" || field === "preset")
		: undefined;
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
			case "direction":
				return (
					<DirectionControl
						key={field}
						value={String(values.direction)}
						onChange={(direction) => set("direction", direction)}
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
			{fields.map((field) => {
				if (palette && (field === "emotion" || field === "preset"))
					return field === paletteAt ? (
						<Fragment key="palette">{palette}</Fragment>
					) : null;
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
