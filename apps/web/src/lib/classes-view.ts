import { ORPCError } from "@orpc/client";
import {
	type ClassificationKind,
	type FieldProblem,
	MEMO_MAX,
	NAME_MAX,
	URL_CONTROL,
	URL_MAX,
} from "@tts-pilot-app/api/classification-rules";

// '채널·분류' 화면의 세 묶음. 채널은 channel 표, 카테고리·타입은 classification 표의 kind다(T6 스펙 3절)
export type Group = "channel" | ClassificationKind;
export const GROUPS = ["channel", "category", "type"] as const;
export type Named = { id: string; name: string };

// 채널 목록과 분류 목록(카테고리·타입이 섞임)을 그룹별로 나눈다
export const groupLists = (
	channels: readonly Named[],
	classes: readonly (Named & { kind: ClassificationKind })[],
): Record<Group, readonly Named[]> => ({
	channel: channels,
	category: classes.filter((entry) => entry.kind === "category"),
	type: classes.filter((entry) => entry.kind === "type"),
});

// 그룹 이름과 조사. 받침 유무가 그룹마다 달라 붙인 꼴을 둔다. 예시는 브리프 5절의 빈 상태 둘째 줄이다
export const GROUP_TEXT: Record<
	Group,
	{ label: string; subject: string; object: string; example: string }
> = {
	channel: {
		label: "채널",
		subject: "채널이",
		object: "채널을",
		example: "예: 경제 한 입, 주말 레터",
	},
	category: {
		label: "카테고리",
		subject: "카테고리가",
		object: "카테고리를",
		example: "예: 쇼핑, 지식, 뉴스, 사연, 교육",
	},
	type: {
		label: "타입",
		subject: "타입이",
		object: "타입을",
		example: "예: 차분함, 활기참, 신뢰감, 캐릭터형",
	},
};

const collator = new Intl.Collator("ko", { numeric: true });

// 이름순(가나다, '2화' < '10화'). DB 정렬(콜레이션)에 기대지 않는다(스펙 3절)
export function byName<T extends { name: string }>(items: readonly T[]): T[] {
	return [...items].sort((a, b) => collator.compare(a.name, b.name));
}

export type Field = "name" | "memo" | "url";
const FIELD_MAX: Record<Field, number> = {
	name: NAME_MAX,
	memo: MEMO_MAX,
	url: URL_MAX,
};

export function fieldMessage(field: Field, problem: FieldProblem): string {
	if (problem === "empty") return "이름을 입력해 주세요";
	if (problem === "bad_url")
		return "http:// 또는 https://로 시작하는 주소를 넣어 주세요";
	return `${FIELD_MAX[field]}자까지 쓸 수 있어요`;
}

// 저장·삭제 실패의 종류. 같은 이름은 이름 칸에, 없어진 항목은 창을 닫고 알림으로, 나머지는 창 안에 보인다(스펙 5절)
export type SaveFailure = "duplicate" | "not_found" | "failed";
export function saveFailure(error: unknown): SaveFailure {
	if (error instanceof ORPCError) {
		if (error.code === "CONFLICT") return "duplicate";
		if (error.code === "NOT_FOUND") return "not_found";
	}
	return "failed";
}

// 지운 뒤 포커스를 옮길 행: 다음 행 → 이전 행 → 없음(null이면 묶음의 '만들기'). 사용자 결정 2026-10-06, T5 결과 목록과 같다
export function neighborId(
	ids: readonly string[],
	removedId: string,
): string | null {
	const index = ids.indexOf(removedId);
	if (index === -1) return null;
	return ids[index + 1] ?? ids[index - 1] ?? null;
}

export const MESSAGES = {
	notFound: "이미 지워졌거나 찾을 수 없어요",
	saveFailed: "저장하지 못했어요. 잠시 뒤 다시 해 주세요.",
	deleteFailed: "지우지 못했어요. 잠시 뒤 다시 해 주세요.",
} as const;

export function duplicateMessage(group: Group): string {
	return `같은 이름의 ${GROUP_TEXT[group].subject} 이미 있어요`;
}

const DONE = { create: "만들었어요", update: "고쳤어요", delete: "지웠어요" };
export function doneMessage(
	group: Group,
	name: string,
	action: keyof typeof DONE,
): string {
	return `‘${name}’ ${GROUP_TEXT[group].object} ${DONE[action]}.`;
}

// 한 줄 상태라 마침표가 없다(브리프 6절)
export function emptyMessage(group: Group): string {
	return `아직 ${GROUP_TEXT[group].subject} 없어요`;
}

export function listFailedMessage(group: Group): string {
	return `${GROUP_TEXT[group].label} 목록을 불러오지 못했어요`;
}

export function deleteQuestion(group: Group, name: string): string {
	return `‘${name}’ ${GROUP_TEXT[group].object} 지울까요?`;
}

// 끝에 마침표가 없다: 뒤에 붙는 linkedNote가 앞 마침표를 가지고 온다
export function deleteDetail(group: Group): string {
	return group === "channel"
		? "메모와 채널 주소도 함께 지워지고 되돌릴 수 없어요. 프리셋과 대본의 채널 연결, 기본 프리셋 지정도 풀려요"
		: "메모도 함께 지워지고 되돌릴 수 없어요. 대본에 붙인 연결도 풀려요";
}

// 양방향 제어문자(U+202A~202E, U+2066~2069)와 U+200B. 서버 규칙은 URL에서 이 글자를 거르지 않는다
const HIDDEN = /[\u200B\u202A-\u202E\u2066-\u2069]/gu;

// 퍼센트 글자를 푼 주소(크롬에서 복사한 한글 핸들은 퍼센트 인코딩이다, 계획 리뷰 P9 기각). 고치기 창도 이 꼴로 채운다(critique P1).
// 퍼센트로 숨긴 양방향 제어문자가 풀려 되살아나므로 푼 뒤에 지운다. 깨진 퍼센트 글자는 그대로 둔다.
// 고치기 창에서 이 값이 그대로 저장되므로 풀면 다른 주소가 되는 경우는 원문을 둔다:
// %25(풀면 '%'가 되어 'a%2520b'가 'a%20b'로 바뀐다), %5C(\\)는 URL 파서가 /로 읽는다, 앞뒤 공백(서버 trim이 지운다), 제어 문자(서버 URL_CONTROL이 bad_url로 막는다)
export function readableUrl(url: string): string {
	if (/%25|%5C/i.test(url)) return url;
	let shown = url;
	try {
		shown = decodeURI(url);
	} catch {
		// 깨진 퍼센트 글자는 그대로 보인다
	}
	if (URL_CONTROL.test(shown) || shown !== shown.trim()) return url;
	return shown.replace(HIDDEN, "");
}

// 목록에 보일 줄인 주소: 스킴·www·끝 '/'를 빼고 퍼센트 글자를 푼다. 전체 주소는 title로 준다
export function shortUrl(url: string): string {
	const { host, pathname, search } = new URL(url);
	const path = `${pathname === "/" ? "" : pathname}${search}`;
	return `${host.replace(/^www\./, "")}${readableUrl(path)}`;
}
