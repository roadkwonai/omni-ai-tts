import { describe, expect, it } from "vitest";

import {
	type Axis,
	accentOptions,
	axesOf,
	type ChoiceAxis,
	conditionCount,
	firstPage,
	initialList,
	inputOf,
	isInitial,
	type ServerList,
	sortOf,
	withSearch,
} from "./provider-conditions";

const elPublic = initialList("elevenlabs", "public");
// 하나·여럿 고르기 축만 apply가 값 배열을 받는다
const choice = (axes: Axis[], index: number) => axes[index] as ChoiceAxis;
const byKey = (list: ServerList, key: string) =>
	axesOf(list, []).find((axis) => axis.key === key) as ChoiceAxis;

describe("시작 조건", () => {
	it("공개 목록은 한국어로 시작하고, 내 계정은 언어 조건이 없다", () => {
		expect(elPublic.query).toMatchObject({ language: "ko", sort: "trending" });
		expect(initialList("fish_audio", "public").query).toMatchObject({
			language: "ko",
			sort: "score",
		});
		expect(initialList("elevenlabs", "account").query).toMatchObject({
			language: null,
			sort: "created_at_unix",
			direction: "desc",
		});
		expect(initialList("fish_audio", "account").query.language).toBeNull();
	});
});

describe("inputOf", () => {
	it("같은 조건은 같은 입력을 만든다(배열은 정렬, 검색어 앞뒤 공백 제거)", () => {
		const a = {
			...elPublic,
			query: { ...elPublic.query, search: " 지영 ", useCases: ["b", "a"] },
		} as ServerList;
		const b = {
			...elPublic,
			query: { ...elPublic.query, search: "지영", useCases: ["a", "b"] },
		} as ServerList;
		expect(inputOf(a, 0)).toEqual(inputOf(b, 0));
		expect(inputOf(a, 0)).toMatchObject({
			provider: "elevenlabs",
			source: "public",
			page: 0,
		});
	});

	it("Fish Audio 태그는 고른 순서와 상관없이 같은 입력이다(성별→콘텐츠, 콘텐츠→성별)", () => {
		const fish = initialList("fish_audio", "public");
		// 고른 순서대로 tags에 쌓이므로 정렬하지 않으면 ["male", "advertisement"]와 ["advertisement", "male"]로 갈린다
		const genderFirst = byKey(
			byKey(fish, "gender").apply(["male"]),
			"content",
		).apply(["advertisement"]);
		const contentFirst = byKey(
			byKey(fish, "content").apply(["advertisement"]),
			"gender",
		).apply(["male"]);
		expect(genderFirst.query).toMatchObject({
			tags: ["male", "advertisement"],
		});
		expect(contentFirst.query).toMatchObject({
			tags: ["advertisement", "male"],
		});
		expect(inputOf(genderFirst, 1)).toEqual(inputOf(contentFirst, 1));
		expect(inputOf(genderFirst, 1)).toMatchObject({
			query: { tags: ["advertisement", "male"] },
		});
	});

	it("ElevenLabs 분위기(공개)와 콘텐츠(내 계정)도 고른 순서와 상관없이 같은 입력이다", () => {
		const moods = (values: string[]) =>
			byKey(elPublic, "descriptives").apply(values);
		expect(inputOf(moods(["soft", "calm"]), 0)).toEqual(
			inputOf(moods(["calm", "soft"]), 0),
		);
		expect(inputOf(moods(["soft", "calm"]), 0)).toMatchObject({
			query: { descriptives: ["calm", "soft"] },
		});
		const account = initialList("elevenlabs", "account");
		const uses = (values: string[]) => byKey(account, "useCases").apply(values);
		expect(inputOf(uses(["social_media", "conversational"]), null)).toEqual(
			inputOf(uses(["conversational", "social_media"]), null),
		);
		expect(
			inputOf(uses(["social_media", "conversational"]), null),
		).toMatchObject({
			query: { useCases: ["conversational", "social_media"] },
		});
	});

	it("페이지 매개변수: ElevenLabs 공개는 번호, 내 계정은 커서, Fish Audio는 1부터", () => {
		expect(
			inputOf(initialList("elevenlabs", "account"), "tok_2"),
		).toMatchObject({ cursor: "tok_2" });
		expect(inputOf(initialList("elevenlabs", "account"), null)).toMatchObject({
			cursor: null,
		});
		expect(inputOf(initialList("fish_audio", "public"), 3)).toMatchObject({
			page: 3,
		});
	});
});

describe("axesOf", () => {
	it("ElevenLabs 공개 조건 줄: 언어·억양·성별·연령·콘텐츠·분위기·성우 종류·추천 성우만", () => {
		const axes = axesOf(elPublic, [{ value: "seoul", label: "서울 억양" }]);
		expect(axes.map((axis) => [axis.label, axis.kind])).toEqual([
			["언어", "single"],
			["억양", "single"],
			["성별", "single"],
			["연령", "single"],
			["콘텐츠", "multi"],
			["분위기", "multi"],
			["성우 종류", "single"],
			["추천 성우만", "toggle"],
		]);
	});

	it("언어를 바꾸면 억양 조건이 풀리고, 모든 언어(null)에서는 억양을 열면 고를 값 없이 안내 한 줄이다", () => {
		const seoul = [{ value: "seoul", label: "서울 억양" }];
		const withAccent = {
			...elPublic,
			query: { ...elPublic.query, accent: "seoul" },
		} as ServerList;
		const language = choice(axesOf(withAccent, seoul), 0);
		expect(language.apply(["en"]).query).toMatchObject({
			language: "en",
			accent: null,
		});
		const all = language.apply([]);
		expect(all.query).toMatchObject({ language: null });
		// 캐시에 남은 다른 언어의 억양 선택지를 받아도 보이지 않는다
		const accent = choice(axesOf(all, seoul), 1);
		expect(accent).toMatchObject({
			options: [],
			hint: "언어를 먼저 고르면 억양을 고를 수 있어요",
		});
		expect(accent).not.toHaveProperty("disabled");
		// 언어를 고르면 지금처럼 억양 선택지가 나오고 안내는 없다
		const ko = choice(axesOf(elPublic, seoul), 1);
		expect(ko.options).toEqual(seoul);
		expect(ko.hint).toBeUndefined();
	});

	it("내 계정은 언어 시작값이 '전체'라 억양을 열면 안내 한 줄이다", () => {
		const account = initialList("elevenlabs", "account");
		const accent = byKey(account, "accent");
		expect(accent).toMatchObject({
			options: [],
			hint: "언어를 먼저 고르면 억양을 고를 수 있어요",
		});
		expect(accent).not.toHaveProperty("disabled");
	});

	it("한국어 억양 선택지는 ACCENT_KO 표 순서(표준·서울 먼저)이고, 표에 없는 값은 뒤에 공급자 순서다", () => {
		const accents = [
			{ value: "gyeongsang", name: "Gyeongsang" },
			{ value: "busan", name: "Busan" },
			{ value: "seoul", name: "Seoul" },
			{ value: "jeju", name: "Jeju" },
			{ value: "standard", name: "Standard" },
		];
		expect(accentOptions(accents, "ko")).toEqual([
			{ value: "standard", label: "표준 억양" },
			{ value: "seoul", label: "서울 억양" },
			{ value: "gyeongsang", label: "경상 억양" },
			{ value: "busan", label: "Busan" },
			{ value: "jeju", label: "Jeju" },
		]);
		// 다른 언어는 공급자 이름과 순서 그대로다
		expect(accentOptions(accents, "en").map((option) => option.label)).toEqual([
			"Gyeongsang",
			"Busan",
			"Seoul",
			"Jeju",
			"Standard",
		]);
	});

	it("토글은 켜고 끄는 불린이다", () => {
		const featured = axesOf(elPublic, []).find(
			(axis) => axis.kind === "toggle",
		);
		expect(featured?.kind === "toggle" && featured.on).toBe(false);
		const on = featured?.kind === "toggle" ? featured.apply(true) : elPublic;
		expect(on.query).toMatchObject({ featured: true });
	});

	it("Fish Audio 태그 드롭다운 넷은 query.tags 하나에 쓰고 자기 묶음만 바꾼다. 머리 글자는 '모두 포함'이다", () => {
		const fish = initialList("fish_audio", "public");
		const axes = axesOf(fish, []);
		expect(axes.map((axis) => axis.label)).toEqual([
			"언어",
			"성별",
			"연령",
			"콘텐츠",
			"분위기",
			"보증 성우만",
		]);
		expect(choice(axes, 1).note).toBe("모두 포함");
		const step1 = choice(axes, 1).apply(["female"]);
		const step2 = choice(axesOf(step1, []), 3).apply([
			"narration",
			"storytelling",
		]);
		expect(step2.query).toMatchObject({
			tags: ["female", "narration", "storytelling"],
		});
		expect(choice(axesOf(step2, []), 1).selected).toEqual(["female"]);
		expect(choice(axes, 3).options.length).toBeGreaterThan(0);
	});

	it("Fish Audio 내 계정에는 '보증 성우만'이 없다", () => {
		expect(
			axesOf(initialList("fish_audio", "account"), []).map((a) => a.label),
		).not.toContain("보증 성우만");
	});
});

describe("sortOf", () => {
	it("ElevenLabs 내 계정은 정렬과 방향을 선택 하나(네 항목)로 묶는다", () => {
		const sort = sortOf(initialList("elevenlabs", "account"));
		expect(sort.options.map((option) => option.label)).toEqual([
			"최근 만든 순",
			"오래된 순",
			"이름순",
			"이름 역순",
		]);
		expect(sort.apply("name:asc").query).toMatchObject({
			sort: "name",
			direction: "asc",
		});
	});
});

describe("조건 수와 시작값", () => {
	it("시작값과 다른 조건만 센다(검색어·정렬 제외)", () => {
		expect(conditionCount(elPublic)).toBe(0);
		expect(isInitial(elPublic)).toBe(true);
		const changed = {
			...elPublic,
			query: {
				...elPublic.query,
				language: "en",
				useCases: ["a", "b"],
				featured: true,
				sort: "created_date",
			},
		} as ServerList;
		// 언어 1 + 콘텐츠 2 + 추천 1
		expect(conditionCount(changed)).toBe(4);
		expect(isInitial(withSearch(elPublic, "지영"))).toBe(false);
	});
});

describe("firstPage", () => {
	it("첫 페이지 매개변수: ElevenLabs 공개 0, 내 계정 커서 null, Fish Audio 1", () => {
		expect(firstPage(initialList("elevenlabs", "public"))).toBe(0);
		expect(firstPage(initialList("elevenlabs", "account"))).toBeNull();
		expect(firstPage(initialList("fish_audio", "public"))).toBe(1);
		expect(firstPage(initialList("fish_audio", "account"))).toBe(1);
	});
});

describe("조건 수와 시작값(더)", () => {
	it("Fish Audio 태그는 하나마다 센다", () => {
		const fish = initialList("fish_audio", "public");
		const two = byKey(byKey(fish, "gender").apply(["female"]), "content").apply(
			["narration"],
		);
		expect(conditionCount(two)).toBe(2);
	});

	it("정렬만 바꾸면 시작값이 아니다(조건 수는 그대로 0)", () => {
		const sortedByNew = sortOf(elPublic).apply("created_date");
		expect(conditionCount(sortedByNew)).toBe(0);
		expect(isInitial(sortedByNew)).toBe(false);
		expect(isInitial(sortOf(sortedByNew).apply("trending"))).toBe(true);
	});
});
