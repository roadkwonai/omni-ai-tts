// apps/web/src/lib/paragraph-autotag.ts
// 구현은 CLI와 함께 쓰는 공용 모듈에 있다(T20)
export {
	type AutoTagAsked,
	type AutoTagChange,
	type AutoTagTarget,
	applyAutoTag,
	autoTagAsked,
	autoTagBatches,
	autoTagChanges,
	autoTagGrew,
	autoTagInputOf,
	autoTagTargets,
	excerptMarks,
	hasAutoTagTarget,
	newTagMarks,
	type TagMark,
} from "@tts-pilot-app/api/paragraph-autotag";
