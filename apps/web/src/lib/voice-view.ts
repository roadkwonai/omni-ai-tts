import type { Voice, VoiceSample } from "@tts-pilot-app/api/providers/contract";

import { PROVIDER_LABEL } from "./connection-view";
import {
	ACCENT_KO,
	EL_ACCOUNT_CATEGORY,
	EL_AGE,
	EL_DESCRIPTIVE,
	EL_PUBLIC_CATEGORY,
	EL_USE_CASE,
	FISH_AGE,
	FISH_CONTENT,
	FISH_GENDER,
	FISH_MOOD,
	languageName,
	ORIGIN_TEXT,
} from "./provider-conditions";
import type { SampleStatus } from "./sample-state";
import {
	AGE_LABEL,
	GENDER_LABEL,
	labelOf,
	USE_CASE_LABEL,
} from "./voice-filter";

// 성우 행·패널·묶음에 보이는 문구(T4 브리프 5·6·7·8절). 화면 없이 테스트하는 순수 함수만 둔다.
export const voiceKey = (
	voice: Pick<Voice, "provider" | "source" | "voiceId">,
) => `${voice.provider}:${voice.source}:${voice.voiceId}`;

// 페이지를 이어 붙인다. 순위가 움직이는 정렬은 다음 페이지에 앞 성우가 다시 올 수 있어 처음 것만 남긴다(Review Focus 2)
export function flattenPages(
	pages: readonly { voices: readonly Voice[] }[],
): Voice[] {
	const seen = new Map<string, Voice>();
	for (const page of pages) {
		for (const voice of page.voices) {
			const key = voiceKey(voice);
			if (!seen.has(key)) seen.set(key, voice);
		}
	}
	return [...seen.values()];
}

// 고른 성우가 목록에 없으면 첫 성우다(T4 스펙 AC8). 목록이 비면 null
export function pickSelected(
	voices: readonly Voice[],
	selected: string | null,
): string | null {
	if (
		selected !== null &&
		voices.some((voice) => voiceKey(voice) === selected)
	) {
		return selected;
	}
	const [first] = voices;
	return first ? voiceKey(first) : null;
}

const knownTags = (labels: Map<string, string>, values: readonly string[]) =>
	values.flatMap((value) => {
		const label = labels.get(value);
		return label ? [label] : [];
	});
const FISH_KNOWN = new Set([
	...FISH_GENDER.keys(),
	...FISH_AGE.keys(),
	...FISH_CONTENT.keys(),
	...FISH_MOOD.keys(),
]);

// 성별·연령·억양의 한국어 이름. 공급자가 주지 않으면 null이다(Fish Audio는 성별·연령 태그)
function personOf(voice: Voice) {
	if (voice.provider === "fish_audio") {
		return {
			gender: knownTags(FISH_GENDER, voice.tags)[0] ?? null,
			age: knownTags(FISH_AGE, voice.tags)[0] ?? null,
			accent: null,
		};
	}
	return {
		gender: voice.gender ? labelOf(GENDER_LABEL, voice.gender) : null,
		age: voice.age
			? labelOf(voice.provider === "typecast" ? AGE_LABEL : EL_AGE, voice.age)
			: null,
		accent: voice.accent ? labelOf(ACCENT_KO, voice.accent) : null,
	};
}

// 메타 줄(브리프 6절, 계획 리뷰 U6): 세 공급자 모두 성별·연령이 없으면 '정보 없음'이고 억양은 있을 때만 붙인다
export function metaLine(voice: Voice): string {
	const { gender, age, accent } = personOf(voice);
	return [
		gender ?? "성별 정보 없음",
		age ?? "연령 정보 없음",
		...(accent ? [accent] : []),
	].join(" · ");
}

const VISIBLE_PILLS = 2;
export function pillsOf(voice: Voice): {
	shown: string[];
	rest: number;
	all: string[];
} {
	const all =
		voice.provider === "fish_audio"
			? [
					...knownTags(FISH_CONTENT, voice.tags),
					...knownTags(FISH_MOOD, voice.tags),
				]
			: voice.provider === "typecast"
				? voice.useCases.map((value) => labelOf(USE_CASE_LABEL, value))
				: [
						...voice.useCases.map((v) => labelOf(EL_USE_CASE, v)),
						...voice.descriptives.map((v) => labelOf(EL_DESCRIPTIVE, v)),
					];
	return {
		shown: all.slice(0, VISIBLE_PILLS),
		rest: Math.max(0, all.length - VISIBLE_PILLS),
		all,
	};
}

// 패널의 공급자 분류 칩(브리프 5절 패널 1): 아는 성별·연령·억양, 콘텐츠·분위기, 성우 종류. '정보 없음'은 칩으로 만들지 않는다.
// Fish Audio는 표에 없는 태그도 공급자 값 그대로 더한다
export function chipsOf(voice: Voice): string[] {
	const { gender, age, accent } = personOf(voice);
	// Fish Audio는 성별·연령 태그가 여럿이면 전부 칩이다(메타 줄은 첫 값)
	const people =
		voice.provider === "fish_audio"
			? [
					...knownTags(FISH_GENDER, voice.tags),
					...knownTags(FISH_AGE, voice.tags),
				]
			: [gender, age, accent];
	const category = voice.category
		? [
				labelOf(
					voice.source === "account" ? EL_ACCOUNT_CATEGORY : EL_PUBLIC_CATEGORY,
					voice.category,
				),
			]
		: [];
	const otherTags =
		voice.provider === "fish_audio"
			? voice.tags.filter((tag) => !FISH_KNOWN.has(tag))
			: [];
	return [
		...new Set(
			[...people, ...pillsOf(voice).all, ...category, ...otherTags].filter(
				(chip): chip is string => chip !== null,
			),
		),
	];
}

const compact = new Intl.NumberFormat("ko-KR", {
	notation: "compact",
	maximumFractionDigits: 1,
});
// 천만 이상 1억 미만은 소수점 없이("5039만", critique 2026-10-05). 1억 이상은 다시 소수 한 자리("1.2억", 코디네이터 판정).
// Intl compact는 만 단위에 쉼표를 넣지 않는다
const compactWhole = new Intl.NumberFormat("ko-KR", {
	notation: "compact",
	maximumFractionDigits: 0,
});
export const plain = new Intl.NumberFormat("ko-KR");
export const compactCount = (value: number) =>
	value < 10_000
		? plain.format(value)
		: value >= 10_000_000 && value < 100_000_000
			? compactWhole.format(value)
			: compact.format(value);

// 숫자와 단위 사이 공백은 줄을 바꾸지 않는다(nbsp)
const NBSP = "\u00a0";

// 행 오른쪽 칸의 보조 정보 줄들. Typecast는 모델마다 한 줄이다(줄 끝에 구분점이 매달리지 않게, critique 2026-10-05)
export function secondaryLines(voice: Voice): string[] {
	if (voice.provider === "typecast") {
		return voice.models.map(
			(model) => `${model.model} · 감정${NBSP}${model.emotions.length}`,
		);
	}
	if (voice.usage === null) return [];
	return [
		voice.usage.kind === "chars_1y"
			? `최근 1년 ${compactCount(voice.usage.count)}${NBSP}자`
			: `${compactCount(voice.usage.count)}${NBSP}회 사용`,
	];
}

// 행 배지 이름들. 배지는 모두 회색이라 색 구분이 없다. 경고색은 패널 '이용 조건' 줄에만 쓴다(사용자 결정 2026-10-05)
export function badgesOf(voice: Voice): string[] {
	const badges: string[] = [];
	if (voice.terms.freeUsersAllowed === false) badges.push("무료 플랜 불가");
	if (voice.terms.licensed) badges.push("보증 성우");
	if (voice.origin) badges.push(ORIGIN_TEXT[voice.origin]);
	return badges;
}

// 샘플 버튼의 접근 이름(브리프 7절). subject는 행 "{이름} 기본 샘플", 패널 "{이름} {이름표}"다. 보이는 상태 이름을 이름에 담는다(WCAG 2.5.3, 계획 리뷰 D20)
export function sampleAriaLabel(
	status: SampleStatus | "none",
	subject: string,
): string {
	switch (status) {
		case "playing":
			return `${subject} 정지`;
		case "loading":
			return `${subject} 듣기 취소`;
		case "failed":
			return `${subject} 다시 듣기`;
		case "none":
			return `${subject} 없음`;
		case "idle":
			return `${subject} 듣기`;
	}
}

// kind: 아이콘을 고르는 표지. 보증 성우 줄만 있다(문구가 바뀌어도 아이콘이 따라가게 문구로 고르지 않는다)
export type TermLine = {
	tone: "warning" | "info";
	text: string;
	kind?: "licensed";
};
// 패널 이용 조건(브리프 5절 4). 공급자가 준 값만, 공식 문구 그대로.
// 공개 성우마다 늘 붙는 공통 문장은 정보이고, 이 성우에만 해당하는 제약이 경고다(재확인 critique 2026-10-05)
export function termLines(voice: Voice): TermLine[] {
	const lines: TermLine[] = [];
	const { terms } = voice;
	if (voice.provider === "elevenlabs" && voice.source === "public") {
		lines.push({
			tone: "info",
			text: "ElevenLabs 무료 플랜은 라이브러리 성우를 API로 쓸 수 없어요",
		});
	}
	if (voice.provider === "elevenlabs" && voice.origin === "premade") {
		lines.push({
			tone: "warning",
			text: "ElevenLabs 제공 성우는 2026-12-31에 종료돼요",
		});
	}
	if (terms.freeUsersAllowed === false) {
		lines.push({
			tone: "warning",
			text: "이 성우는 무료 플랜 사용자에게 열려 있지 않아요",
		});
	}
	if (terms.noticePeriodDays !== null) {
		lines.push({
			tone: "info",
			text: `공유가 끝나도 ${plain.format(terms.noticePeriodDays)}일 동안 계속 쓸 수 있어요`,
		});
	}
	if (terms.liveModeration) {
		lines.push({
			tone: "info",
			text: "실시간 검수 성우라 응답이 늦을 수 있어요",
		});
	}
	if (terms.creditRate !== null && terms.creditRate !== 1) {
		lines.push({
			tone: "info",
			text: `크레딧 배율 ${terms.creditRate}배(공급자 값)`,
		});
	}
	if (terms.licensed) {
		lines.push({
			tone: "info",
			kind: "licensed",
			text: "Fish Audio가 권리를 확보한 보증 성우예요",
		});
	}
	if (terms.retiring) {
		lines.push({ tone: "warning", text: "공급자가 공개를 끝내는 중이에요" });
	}
	return lines;
}

// Typecast 감정 이름(브리프 5절 패널 4 예시 "ssfm-v30: 기본, 기쁨, 슬픔 …", 공급자 값은 typecast-api-options 감정 프리셋). 표에 없는 값은 공급자 값 그대로다
export const EMOTION_KO = new Map([
	["normal", "기본"],
	["happy", "기쁨"],
	["sad", "슬픔"],
	["angry", "화남"],
	["whisper", "속삭임"],
	["toneup", "높은 톤"],
	["tonedown", "낮은 톤"],
]);
// 패널 '모델별 감정'의 줄들. 감정이 없는 모델은 줄을 만들지 않는다
export const emotionLines = (voice: Voice): string[] =>
	voice.models.flatMap((model) =>
		model.emotions.length > 0
			? [
					`${model.model}: ${model.emotions.map((emotion) => labelOf(EMOTION_KO, emotion)).join(", ")}`,
				]
			: [],
	);

export function sampleLabel(sample: VoiceSample): string {
	if (sample.language) return `${languageName(sample.language)} 샘플`;
	return sample.title ?? "기본 샘플";
}

// 알림에 읽힐 이름. 알림이 "{이름} 샘플 재생 중"·"{이름} 샘플을 멈췄어요"로 '샘플'을 붙이므로 이름표의 끝 '샘플'은 뺀다(브리프 9절)
export function sampleSubject(name: string, sample: VoiceSample): string {
	if (sample.language) return `${name} ${languageName(sample.language)}`;
	return `${name} ${sample.title ?? "기본"}`;
}

const MINUTE = 60_000;
// "12분", "3시간", "2일"(1분 미만은 null)
function ago(fetchedAt: string, now: Date): string | null {
	const minutes = Math.floor((now.getTime() - Date.parse(fetchedAt)) / MINUTE);
	if (minutes < 1) return null;
	if (minutes < 60) return `${minutes}분`;
	if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}시간`;
	return `${Math.floor(minutes / (60 * 24))}일`;
}
// 그릴 때의 시각으로 계산한다(1분마다 다시 그리지 않는다, ponytail)
export const receivedText = (fetchedAt: string, now: Date) => {
	const a = ago(fetchedAt, now);
	return a ? `${a} 전에 받음` : "방금 받음";
};
// 지난 목록 안내의 "{N분/N시간/N일} 전에 받은 목록"
export const agoText = (fetchedAt: string, now: Date) =>
	ago(fetchedAt, now) ?? "방금";

const clock = new Intl.DateTimeFormat("ko-KR", {
	hour: "numeric",
	minute: "2-digit",
});
// 초·밀리초가 있으면 다음 분으로 올려 보인다. 버튼은 그 시각에 풀리므로 내려 보이면 풀리기 전에 "이후"로 읽힌다
export const retryTime = (iso: string) =>
	clock.format(new Date(Math.ceil(Date.parse(iso) / MINUTE) * MINUTE));

// 대기 시각 후보 중 가장 늦은 것. 지난 시각이 더 늦은 새 대기 시각을 가리지 않는다(없는 값은 건너뛴다)
export const latestTime = (...times: (string | null | undefined)[]) =>
	times.reduce<string | null>(
		(best, time) =>
			time && (best === null || Date.parse(time) > Date.parse(best))
				? time
				: best,
		null,
	);

export function countText(input: {
	provider: "elevenlabs" | "fish_audio";
	source: Voice["source"];
	language: string | null;
	total: number | null;
	totalExact: boolean;
}): string {
	const name = PROVIDER_LABEL[input.provider];
	const language = input.language ? `${languageName(input.language)} ` : "";
	const what =
		input.source === "account"
			? "계정 성우"
			: input.provider === "elevenlabs"
				? `${language}라이브러리`
				: `${language}공개 성우`;
	if (input.total === null) return `${name} ${what}`;
	return `${name} ${what} ${plain.format(input.total)}명${input.totalExact ? "" : " 이상"}`;
}

// '더 보기' 옆 글자: 보인 수 / 전체 수. 전체 수를 모르면 보인 수만, 정확하지 않으면 '이상'
export const moreCountText = (
	shown: number,
	total: number | null,
	totalExact: boolean,
) =>
	total === null
		? `${plain.format(shown)}명`
		: `${plain.format(shown)} / ${plain.format(total)}명${totalExact ? "" : " 이상"}`;

export function listEnd(page: {
	next: number | string | null;
	windowLimited: boolean;
}): "more" | "limit" | "end" {
	if (page.next !== null) return "more";
	return page.windowLimited ? "limit" : "end";
}

// '전체' 탭 묶음(브리프 5절, 스펙 AC2): 앞 5명과 머리의 인원 글자. Typecast는 검색어가 있으면 "{전체}명 중 {n}명"이다(of: 전체 수)
export const BUNDLE_SIZE = 5;
export function bundleOf(
	voices: readonly Voice[],
	count: { total: number | null; totalExact: boolean; of?: number },
): { voices: Voice[]; countLabel: string | null } {
	const countLabel =
		count.total === null
			? null
			: count.of !== undefined && count.of !== count.total
				? `${plain.format(count.of)}명 중 ${plain.format(count.total)}명`
				: `${plain.format(count.total)}명${count.totalExact ? "" : " 이상"}`;
	return { voices: voices.slice(0, BUNDLE_SIZE), countLabel };
}
