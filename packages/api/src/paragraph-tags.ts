import {
	ACTING,
	type ActingFamily,
	type Feel,
	feelOf,
	feelValues,
	freePhraseOk,
	replySchemaOf,
	type Suggestion,
	snapIntensity,
	TYPECAST_INTENSITIES,
	tagsOf,
} from "./drama-acting";
import { TAGS } from "./drama-script";
import { codePoints, normalizeText } from "./providers/trial-options";

// 문단 작업실(T10 스펙 15절)의 태그 값과 순수 함수다. 화면과 서버가 함께 쓴다.
// zod·node:*·Buffer를 쓰지 않는다(화면 번들). 값은 드라마와 같은 ACTING 카탈로그다

// 자동 태그 추천 한 번(묶음)의 상한. 텍스트 호출은 OpenAI(실패하면 Gemini)로 묶음당 최대 4회(ADR 0008)
export const PARAGRAPH_TAG_TOTAL_MAX = 2000;
export const PARAGRAPH_TAG_ITEMS_MAX = 50;

// 문단 작업실이 태그로 보는 모양(스펙 15.2 '태그의 모양'). 한글·줄바꿈이 든 괄호와 떨어진 부등호는 대본 글이다.
// 전역(g) 식이라 replace·matchAll(new RegExp로 복사)만 쓰고 test·exec를 부르지 않는다(drama-script TAGS와 같다)
// 캡처 그룹을 넣지 않는다: SPACED가 이 식을 그룹 하나로 감싸고, sendText의 replacer가 (match, tag, at) 차례로 받는다
export const SEND_TAGS =
	/\[[A-Za-z][A-Za-z0-9 ,'-]{0,59}\]|<\/?[A-Za-z][A-Za-z ]{0,29}>/g;
// 태그와 바로 뒤 공백 한 칸(sendText가 태그 앞이 공백·글 처음일 때만 함께 뺀다)
const SPACED = new RegExp(`(${SEND_TAGS.source}) ?`, "g");
const GEMINI_SOUND = ACTING.gemini.sound.map((t) => t.value);

// 태그 하나가 그 family로 갈 때 태그로 남는가. 드라마 tagSent와 달리 Fish는 쌍 태그도 뺀다(S2.1은 쌍 태그를 읽지 않는다)
export function paragraphTagSent(family: ActingFamily, tag: string): boolean {
	switch (family) {
		case "fish_s2":
		case "fish_drama":
		case "elevenlabs_tags":
			return tag.startsWith("[");
		case "gemini":
			return GEMINI_SOUND.includes(tag);
		default:
			return false;
	}
}

// 보낼 글: 받지 않는 태그를 뺀다. 태그 앞이 공백이거나 글 처음이면 바로 뒤 공백 한 칸도 빼고, 단어 바로 뒤 태그('그래[sighs] 네가')는 태그만 뺀다(두 단어가 붙지 않게).
// 받지 않는 태그가 없으면 같은 글이라 저장된 결과의 조합 키가 그대로다
export const sendText = (family: ActingFamily, text: string) =>
	text.replace(SPACED, (match, tag: string, at: number) =>
		paragraphTagSent(family, tag)
			? match
			: at === 0 || /\s/.test(text[at - 1] ?? "")
				? ""
				: match.slice(tag.length),
	);

export const unsentCount = (family: ActingFamily, text: string) =>
	[...text.matchAll(new RegExp(SEND_TAGS))].filter(
		([tag]) => !paragraphTagSent(family, tag),
	).length;

// 대본 안에 넣는 태그: 소리 값, Fish S2·Fish Drama·ElevenLabs v3·v4는 분위기 값을 [값]으로 더한다
export function inlineTags(family: ActingFamily): string[] {
	const { front, sound } = ACTING[family];
	const mood =
		family === "fish_s2" ||
		family === "fish_drama" ||
		family === "elevenlabs_tags"
			? front.map((t) => `[${t.value}]`)
			: [];
	return [...sound.map((t) => t.value), ...mood];
}

// 문단 하나에 새로 넣을 수 있는 태그 수: max(2, ⌈태그 뺀 글자 수 ÷ 100⌉)
export const newTagMax = (text: string) =>
	Math.max(
		2,
		Math.ceil(codePoints(normalizeText(text.replace(SEND_TAGS, ""))) / 100),
	);

export type ParagraphTagItem = {
	family: ActingFamily;
	emotions: readonly string[] | null;
	max: number;
	text: string;
	direction: string;
	feel?: Feel;
};

// 줄을 지키는 비교 글: 넓은 TAGS를 지우고 공백은 한 칸, 줄바꿈 둘레 공백은 지운다(드라마 bare는 줄바꿈까지 지운다)
const bareLines = (text: string) =>
	text
		.replace(TAGS, "")
		.replace(/[ \t]+/g, " ")
		.replace(/ ?\n ?/g, "\n")
		.trim();

function textOk(item: ParagraphTagItem, suggested: string): boolean {
	if (suggested.includes("<|")) return false;
	if (bareLines(suggested) !== bareLines(item.text)) return false;
	// 원래 태그(넓은 TAGS라 <삼국지> 같은 글도)는 하나도 빼지 않는다
	const old = tagsOf(item.text);
	const added = tagsOf(suggested).filter((tag) => {
		const at = old.indexOf(tag);
		if (at >= 0) old.splice(at, 1);
		return at < 0;
	});
	if (old.length > 0) return false;
	const allowed = inlineTags(item.family);
	if (!added.every((tag) => allowed.includes(tag))) return false;
	// 새 태그가 없는 제안(공백만 바꿈·태그 옮김)은 받지 않는다. 받으면 글만 달라져 저장된 결과가 '안 만듦'이 된다
	if (added.length === 0 || added.length > newTagMax(item.text)) return false;
	// 화면의 길이 상한과 같은 기준(대본 칸 글 그대로)이라 적용 뒤 '길이 초과'로 막히지 않는다
	return codePoints(normalizeText(suggested)) <= item.max;
}

// Typecast 강도는 제안처럼 0.5 눈금으로 맞춰 견준다(지금 1.3에 같은 감정을 되풀이한 제안은 바뀐 값이 아니다)
const snapped = (feel?: Feel) =>
	feel?.typecast && snapIntensity(feel.typecast.intensity);
const sameFeel = (a?: Feel, b?: Feel) =>
	a?.typecast?.emotion === b?.typecast?.emotion &&
	snapped(a) === snapped(b) &&
	a?.airy?.style === b?.airy?.style;

// 모델이 낸 제안에서 허용한 부분만 받는다. 어긴 칸(대본·지시·감정)은 따로 원래 값으로 둔다
export function checkParagraph(
	item: ParagraphTagItem,
	suggested: Suggestion,
): { text: string; direction: string; feel?: Feel } {
	const phrase = suggested.direction.trim();
	// 말투 지시는 Gemini 문단만 받는다(Fish·ElevenLabs 분위기는 대본 안 [값]이다)
	const direction =
		item.family === "gemini" &&
		(ACTING.gemini.front.some((t) => t.value === phrase) ||
			freePhraseOk(phrase))
			? phrase
			: item.direction;
	const text = textOk(item, suggested.text) ? suggested.text : item.text;
	const suggestedFeel = feelOf(item.family, item.emotions, item, suggested);
	// 지금 값과 같은 제안은 원래 객체로 돌려준다(화면이 바뀐 문단으로 세지 않게)
	const feel = sameFeel(suggestedFeel, item.feel) ? item.feel : suggestedFeel;
	return feel ? { text, direction, feel } : { text, direction };
}

// 묶음(family·성우 감정) 하나에 허용한 값을 한 줄 글로 만든다
function allowedOf(
	family: ActingFamily,
	emotions: readonly string[] | null,
): string {
	const parts: string[] = [];
	if (family === "gemini")
		parts.push(
			`direction (one of: ${ACTING.gemini.front.map((t) => `"${t.value}"`).join(", ")}; or your own short English phrase of letters, digits, spaces, commas, apostrophes and hyphens, at most 60 characters)`,
		);
	const tags = inlineTags(family);
	if (tags.length) parts.push(`tags in the text: ${tags.join(" ")}`);
	const feel = feelValues(family, emotions);
	if (feel.length)
		parts.push(
			`emotion (one of: ${feel.join(", ")})${family.startsWith("typecast") ? `, intensity one of ${TYPECAST_INTENSITIES.join(", ")}` : ""}`,
		);
	return parts.length
		? parts.join("; ")
		: "no tags allowed (return the paragraph unchanged)";
}

// 자동 태그 추천 요청 글(OpenAI, 실패하면 Gemini 텍스트 모델). 규칙은 드라마 autoTagPrompt와 같고 새 태그 수·지시·분위기만 다르다
export function paragraphTagPrompt(items: readonly ParagraphTagItem[]): {
	system: string;
	input: string;
	schema: Record<string, unknown>;
} {
	// 허용 목록은 묶음마다 한 줄이고 문단은 묶음 번호를 가리킨다(긴 목록을 문단마다 되풀이하지 않는다)
	const keys: string[] = [];
	const groups: ParagraphTagItem[] = [];
	const groupOf = items.map((item) => {
		const key = JSON.stringify([item.family, item.emotions]);
		let at = keys.indexOf(key);
		if (at < 0) {
			at = keys.push(key) - 1;
			groups.push(item);
		}
		return at;
	});
	const system = [
		"You add delivery tags to Korean narration paragraphs for text-to-speech.",
		"- Never change, add, remove, translate or re-space the paragraph characters or line breaks. Only insert allowed tags.",
		"- Tags are about the voice only (delivery, sounds, pauses). No music, sound effects, body movements or sensitive topics.",
		"- Put a tag right before the words it affects. Add at most maxNewTags new tags inside each paragraph. Mood values also go inside the text as [value] tags.",
		"- Only groups that list a direction may set one; otherwise return the given direction.",
		"- Keep tags already in the paragraph. Write tags in English. Never write <|...|> tokens.",
		"- If unsure, leave direction and emotion empty and the text unchanged.",
		"- Reply with JSON only: one item per input paragraph, same index.",
		"Each group may use only these values:",
		...groups.map(
			(g, i) => `- ${i} (${g.family}): ${allowedOf(g.family, g.emotions)}`,
		),
	].join("\n");
	const input = JSON.stringify(
		items.map((item, index) => ({
			index,
			group: groupOf[index],
			direction: item.direction,
			emotion: item.feel?.typecast?.emotion ?? item.feel?.airy?.style ?? "",
			intensity: item.feel?.typecast?.intensity ?? null,
			maxNewTags: newTagMax(item.text),
			text: item.text,
		})),
	);
	return { system, input, schema: replySchemaOf("paragraphs", items.length) };
}
