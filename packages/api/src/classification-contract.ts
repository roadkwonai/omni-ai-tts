// packages/api/src/classification-contract.ts
import { z } from "zod";

import {
	CLASSIFICATION_KINDS,
	cleanMemo,
	cleanText,
	cleanUrl,
	memoProblem,
	nameProblem,
	urlProblem,
} from "./classification-rules";

// 채널·분류 프로시저의 입력·출력(T6 스펙 3절). 원문이 1,000자를 넘으면 규칙을 보기 전에 거절하고, 통과하면 정리한 값으로 바꿔 넘긴다.
// 모르는 키(ownerId 등)는 버려진다. 그래도 라우터는 소유자를 값의 마지막에 둔다(계획 리뷰 E8)
const RAW_MAX = 1000;
const nameSchema = z
	.string()
	.max(RAW_MAX)
	.refine((value) => nameProblem(value) === null, { message: "name" })
	.transform(cleanText);
export const memoSchema = z
	.string()
	.max(RAW_MAX)
	.refine((value) => memoProblem(value) === null, { message: "memo" })
	.transform(cleanMemo);
const urlSchema = z
	.string()
	.max(RAW_MAX)
	.refine((value) => urlProblem(value) === null, { message: "url" })
	.transform(cleanUrl);

const classificationKindSchema = z.enum(CLASSIFICATION_KINDS);

export const channelInputSchema = z.object({
	name: nameSchema,
	memo: memoSchema,
	url: urlSchema,
});
export const channelUpdateInputSchema = channelInputSchema.extend({
	id: z.uuid(),
});
export const classificationCreateInputSchema = z.object({
	kind: classificationKindSchema,
	name: nameSchema,
	memo: memoSchema,
});
// kind는 바꾸지 않는다(카테고리를 타입으로 옮기기 없음, 스펙 3절)
export const classificationUpdateInputSchema = z.object({
	id: z.uuid(),
	name: nameSchema,
	memo: memoSchema,
});
export const deleteInputSchema = z.object({ id: z.uuid() });

export const channelSchema = z.object({
	id: z.uuid(),
	name: z.string(),
	memo: z.string().nullable(),
	url: z.string().nullable(),
});
export const classificationSchema = z.object({
	id: z.uuid(),
	kind: classificationKindSchema,
	name: z.string(),
	memo: z.string().nullable(),
});
export const deletedSchema = z.object({ deleted: z.literal(true) });

// 목록 항목은 연결된 성우 수가 더 있다(T7). 만들기·고치기 결과에는 없다(화면은 결과의 이름만 쓰고 목록을 다시 받는다)
export const channelListItemSchema = channelSchema.extend({
	voiceCount: z.number().int().nonnegative(),
});
export const classificationListItemSchema = classificationSchema.extend({
	voiceCount: z.number().int().nonnegative(),
});
