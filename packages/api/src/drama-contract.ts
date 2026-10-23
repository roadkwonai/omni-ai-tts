import { z } from "zod";

import {
	cleanDirection,
	DRAMA_DIRECTION_MAX,
	DRAMA_LINE_MAX,
	DRAMA_LINES_MAX,
	DRAMA_MODELS,
	DRAMA_NAME_MAX,
	DRAMA_SCENE_MAX,
	DRAMA_SCENE_NAME_MAX,
	DRAMA_SETTINGS,
	DRAMA_SPEAKERS_MAX,
	type DramaRequest,
	sceneChars,
	sceneLimit,
} from "./drama-script";
import { providerIdSchema } from "./providers/contract";
import { feelSchema, voiceIdSchema } from "./providers/trial-contract";
import { codePoints, normalizeText, RANGES } from "./providers/trial-options";
import { studioAudioInputSchema, studioResultSchema } from "./studio-contract";

// 드라마 작업실 프로시저의 입력·출력(T9.5 스펙). 서버가 검증하고 화면은 타입만 가져간다(import type). 값은 drama-script.ts

// 글: textSchemaOf와 같은 모양(원문 max × 4 → 정리 → 코드 포인트 max). 장면 이름만 빈 값을 받는다
const trimmedOf = (max: number, min: 0 | 1) =>
	z
		.string()
		.max(max * 4)
		.transform(normalizeText)
		.pipe(
			z
				.string()
				.min(min)
				.refine((text) => codePoints(text) <= max),
		);
// 화자 표식(<|speaker)을 글 속에 심어 다른 화자로 속이는 것을 막는다
const noMarker = (text: string) => !text.includes("<|");

const textSchema = trimmedOf(DRAMA_LINE_MAX, 1).refine(noMarker);
const directionSchema = z
	.string()
	.max(DRAMA_DIRECTION_MAX * 4)
	.transform(cleanDirection)
	.pipe(
		z
			.string()
			.refine((text) => codePoints(text) <= DRAMA_DIRECTION_MAX)
			.refine(noMarker),
	);

const fish = RANGES.fish_audio;
const settingsSchema = z
	.object({
		speed: z
			.number()
			.min(fish.speed.min)
			.max(fish.speed.max)
			.default(fish.speed.default),
		temperature: z
			.number()
			.min(fish.temperature.min)
			.max(fish.temperature.max)
			.default(fish.temperature.default),
	})
	.default(DRAMA_SETTINGS);

export const dramaRequestSchema = z
	.object({
		sceneName: trimmedOf(DRAMA_SCENE_NAME_MAX, 0).default(""),
		speakers: z
			.array(
				z.object({
					name: trimmedOf(DRAMA_NAME_MAX, 1),
					voiceId: voiceIdSchema,
				}),
			)
			.min(1)
			.max(DRAMA_SPEAKERS_MAX),
		lines: z
			.array(
				z.object({
					speaker: z.number().int().min(0),
					direction: directionSchema,
					text: textSchema,
				}),
			)
			.min(1)
			.max(DRAMA_LINES_MAX),
		model: z.enum(DRAMA_MODELS),
		settings: settingsSchema,
	})
	.superRefine((req, ctx) => {
		const names = req.speakers.map((s) => s.name);
		if (new Set(names).size !== names.length)
			ctx.addIssue({ code: "custom", path: ["speakers"], message: "name" });
		// sceneText가 없는 화자 번호를 조용히 빈 id로 바꾸므로 계약에서 막는다
		req.lines.forEach((line, i) => {
			if (line.speaker >= req.speakers.length)
				ctx.addIssue({ code: "custom", path: ["lines", i, "speaker"] });
		});
		if (sceneChars(req.lines) > sceneLimit(req.settings.speed))
			ctx.addIssue({ code: "custom", path: ["lines"], message: "scene" });
	});
// 계약과 drama-script의 요청 타입이 어긋나면 타입 검사가 잡는다
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _sameRequest: Same<
	z.output<typeof dramaRequestSchema>,
	DramaRequest
> = true;
void _sameRequest;

export const dramaCreateInputSchema = z.object({
	requestId: z.uuid(),
	request: dramaRequestSchema,
});

// 줄 구간(초). 나누지 못한 장면은 null
const segmentsSchema = z
	.array(
		z.object({
			start: z.number().nonnegative(),
			end: z.number().nonnegative(),
			cutStart: z.number().nonnegative(),
			cutEnd: z.number().nonnegative(),
		}),
	)
	.nullable();

export const dramaResultSchema = studioResultSchema.extend({
	segments: segmentsSchema,
});

export const dramaItemSchema = dramaResultSchema.extend({
	status: z.enum(["done", "unknown"]),
	request: dramaRequestSchema,
});
export type DramaItem = z.output<typeof dramaItemSchema>;
export type DramaItemInput = z.input<typeof dramaItemSchema>;

export const dramaAudioInputSchema = studioAudioInputSchema;

// 전체 자동 태그(T9.5 스펙 14.5). 상한은 드라마 계약과 같고 대본 합계도 2,000자다(계획 '스펙과 다른 점' 20).
// mode는 태그를 넣은 줄의 상한(장면 300자, 읽기 200자)을 고른다. emotions는 Typecast 성우가 가진 감정이고 제안을 좁히는 데만 쓴다
export const dramaAutoTagInputSchema = z
	.object({
		mode: z.enum(["scene", "read"]),
		speakers: z
			.array(
				z.object({
					name: trimmedOf(DRAMA_NAME_MAX, 1),
					provider: providerIdSchema,
					model: z.string().min(1).max(64),
					emotions: z.array(z.string().max(32)).max(20).nullable(),
				}),
			)
			.min(1)
			.max(DRAMA_SPEAKERS_MAX),
		lines: z
			.array(
				z.object({
					speaker: z.number().int().min(0),
					direction: directionSchema,
					text: textSchema,
					feel: feelSchema.optional(),
				}),
			)
			.min(1)
			.max(DRAMA_LINES_MAX),
	})
	.superRefine((req, ctx) => {
		// 이름이 같으면 프롬프트의 화자를 구별하지 못한다(dramaRequestSchema와 같다)
		const names = req.speakers.map((s) => s.name);
		if (new Set(names).size !== names.length)
			ctx.addIssue({ code: "custom", path: ["speakers"], message: "name" });
		req.lines.forEach((line, i) => {
			if (line.speaker >= req.speakers.length)
				ctx.addIssue({ code: "custom", path: ["lines", i, "speaker"] });
		});
		// 긴 대본은 답 JSON이 출력 상한에서 잘려 돈만 쓴다(계획 리뷰 M4)
		if (sceneChars(req.lines) > DRAMA_SCENE_MAX)
			ctx.addIssue({ code: "custom", path: ["lines"], message: "scene" });
	});

// 입력과 같은 줄 수. 검사를 통과하지 못한 값은 원래 값이다. skipped는 태그를 받지 않는 줄 수
export const dramaAutoTagOutputSchema = z.object({
	lines: z.array(
		z.object({
			direction: z.string(),
			text: z.string(),
			feel: feelSchema.optional(),
		}),
	),
	skipped: z.number().int(),
});
