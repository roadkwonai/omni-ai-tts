// packages/api/src/script-contract.ts
import { z } from "zod";

import { cleanText } from "./classification-rules";
import { providerIdSchema } from "./providers/contract";
import { codePoints, PARAGRAPHS_MAX } from "./providers/trial-options";
import {
	SCRIPT_LINKS_MAX,
	SCRIPT_TEXT_MAX,
	SCRIPT_TITLE_MAX,
	scriptWorkProblem,
} from "./script-rules";

// 대본 보관함 프로시저의 입력·출력(T12 계획 2.2). 작업 모양은 화면 Work(apps/web lib/paragraph-script.ts)에서 id·linked·channelId를 뺀 것이다.
// 서버는 모양과 상한만 본다. 값의 정규화(태그 공백, 쉼 0.1초, 보관함에 없는 성우)는 화면이 열 때 readWork가 한다.
// 모르는 키(ownerId 등)는 버려진다

// readWork와 같은 문단 id 규칙(studio-view VOICE_ID). 서버가 받은 id를 readWork가 바꿔 끼우지 않게 같은 규칙을 쓴다(리뷰 R2-4)
const PARAGRAPH_ID = /^[A-Za-z0-9_-]{1,100}$/;
const SPEAKERS_MAX = 20;
const SPEAKER_NAME_MAX = 20;
const DECISIONS_MAX = 500;
const GAP_MAX = 5;
// 글은 코드 포인트로 scriptWorkProblem이 센다. 여기의 max는 그 앞에서 UTF-16 길이로 거르는 상한이다(코드 포인트 10,000 ≤ UTF-16 20,000)
const rawText = z.string().max(SCRIPT_TEXT_MAX * 2);

const voiceSetupSchema = z.object({
	provider: providerIdSchema,
	voiceId: z.string().min(1).max(200),
	// 공급자별 설정 칸은 화면 readWork가 그 공급자 규칙으로 다시 읽는다. 크기는 작업 2 MB 상한이 막는다
	settings: z.record(z.string(), z.unknown()),
});
const gapSchema = z.number().min(0).max(GAP_MAX);
const speakerNameSchema = z.string().min(1).max(SPEAKER_NAME_MAX);
const decisionSchema = z.object({
	start: z.number().int(),
	end: z.number().int(),
	original: z.string().min(1).max(100),
	choice: z.enum(["apply", "keep", "manual"]),
	reading: z.string().max(200).optional(),
});
const paragraphSchema = z.object({
	id: z.string().regex(PARAGRAPH_ID),
	text: rawText,
	gap: gapSchema.optional(),
	voice: voiceSetupSchema.optional(),
	speaker: speakerNameSchema.optional(),
	fixes: z
		.object({
			text: rawText,
			decisions: z.array(decisionSchema).max(DECISIONS_MAX),
		})
		.optional(),
});

// 작업의 모양(상한 검사 앞까지). CLI가 로컬 작업 JSON을 검사할 때 쓴다(T20)
export const scriptWorkShapeSchema = z.object({
	defaultVoice: voiceSetupSchema.nullable(),
	gap: gapSchema,
	paragraphs: z
		.array(paragraphSchema)
		.min(1)
		.max(PARAGRAPHS_MAX)
		.refine((ps) => new Set(ps.map((p) => p.id)).size === ps.length, {
			message: "paragraph_id",
		}),
	speakers: z
		.array(
			z.object({
				name: speakerNameSchema,
				voice: voiceSetupSchema.nullable(),
			}),
		)
		.max(SPEAKERS_MAX)
		.optional(),
});
export const scriptWorkSchema = scriptWorkShapeSchema
	// 비지 않은 문단 1개 이상, 글 10,000자, UTF-8 2 MB, NUL 없음(script-rules, 화면 잠금과 같은 규칙)
	.refine((work) => scriptWorkProblem(work) === null, { message: "work" });
export type ScriptWorkValue = z.output<typeof scriptWorkSchema>;

// 제목: 원문 1,000자 상한, T6 이름 정리(cleanText) 뒤 1~100 코드 포인트
const RAW_MAX = 1000;
export const titleSchema = z
	.string()
	.max(RAW_MAX)
	.refine(
		(value) => {
			const title = cleanText(value);
			return title !== "" && codePoints(title) <= SCRIPT_TITLE_MAX;
		},
		{ message: "title" },
	)
	.transform(cleanText);

const idsSchema = z
	.array(z.uuid())
	.max(SCRIPT_LINKS_MAX)
	.transform((ids) => [...new Set(ids)]);
const kindSchema = z.enum(["saved", "recent"]);
const cursorSchema = z.object({ at: z.iso.datetime(), id: z.uuid() });

// 목록. 거르기·검색·커서는 저장한 대본에만 쓴다(최근 대본은 최대 20개를 한 번에). 검색어는 앞뒤 공백을 빼고 비면 없는 것으로 본다
export const scriptListInputSchema = z.object({
	kind: kindSchema,
	q: z.string().trim().max(100).optional(),
	channel: z.union([z.uuid(), z.literal("none")]).optional(),
	category: z.array(z.uuid()).max(SCRIPT_LINKS_MAX).optional(),
	type: z.array(z.uuid()).max(SCRIPT_LINKS_MAX).optional(),
	cursor: cursorSchema.optional(),
});
// 목록 한 줄. 작업 JSON(work)과 소유자는 없다(스펙 5절)
export const scriptSummarySchema = z.object({
	id: z.uuid(),
	kind: kindSchema,
	title: z.string().nullable(),
	// 원문 앞 160자
	preview: z.string(),
	paragraphCount: z.number().int().nonnegative(),
	charCount: z.number().int().nonnegative(),
	channelId: z.uuid().nullable(),
	classificationIds: z.array(z.uuid()),
	version: z.number().int().positive(),
	updatedAt: z.iso.datetime(),
});
export type ScriptSummary = z.output<typeof scriptSummarySchema>;
export const scriptListSchema = z.object({
	items: z.array(scriptSummarySchema),
	next: cursorSchema.nullable(),
});

export const scriptSchema = z.object({
	id: z.uuid(),
	kind: kindSchema,
	title: z.string().nullable(),
	channelId: z.uuid().nullable(),
	classificationIds: z.array(z.uuid()),
	version: z.number().int().positive(),
	workId: z.uuid().nullable(),
	work: scriptWorkSchema,
});
export type Script = z.output<typeof scriptSchema>;

export const scriptCreateInputSchema = z.object({
	title: titleSchema,
	channelId: z.uuid().nullable(),
	classificationIds: idsSchema,
	work: scriptWorkSchema,
});
export const scriptCreatedSchema = z.object({
	id: z.uuid(),
	title: z.string(),
	version: z.number().int().positive(),
});
// force면 판 조건 없이 덮어쓴다(충돌 창 '덮어쓰기')
export const scriptSaveInputSchema = z.object({
	id: z.uuid(),
	version: z.number().int().positive(),
	force: z.boolean().optional(),
	channelId: z.uuid().nullable(),
	work: scriptWorkSchema,
});
// 주지 않은 칸은 그대로. 판은 올리지 않는다(스펙 4.4)
export const scriptUpdateInputSchema = z.object({
	id: z.uuid(),
	title: titleSchema.optional(),
	channelId: z.uuid().nullable().optional(),
	classificationIds: idsSchema.optional(),
});
export const scriptRecordRecentInputSchema = z.object({
	workId: z.uuid(),
	channelId: z.uuid().nullable(),
	work: scriptWorkSchema,
});
