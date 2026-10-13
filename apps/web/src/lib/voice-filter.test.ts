import type { Voice } from "@tts-pilot-app/api/providers/contract";
import { describe, expect, it } from "vitest";

import {
	EMPTY_FILTERS,
	EMPTY_GEMINI_FILTERS,
	filterByNameOrId,
	filterGemini,
	filterOptions,
	filterVoices,
	type GeminiFilters,
	geminiOptions,
	groupByUseCase,
	hasConditions,
} from "./voice-filter";
import { bundleOf } from "./voice-view";

const voice = (voiceId: string, overrides: Partial<Voice> = {}): Voice => ({
	provider: "typecast",
	source: "public",
	voiceId,
	name: "민지",
	englishName: "Minji",
	gender: "female",
	age: "young_adult",
	accent: null,
	pitch: null,
	personas: [],
	useCases: ["Ads/Promotion"],
	descriptives: [],
	tags: [],
	languages: [],
	category: null,
	origin: null,
	description: null,
	models: [{ model: "ssfm-v30", emotions: ["normal"] }],
	previewUrl: null,
	samples: [],
	usage: null,
	terms: {
		freeUsersAllowed: null,
		noticePeriodDays: null,
		liveModeration: false,
		creditRate: null,
		licensed: false,
		retiring: false,
	},
	...overrides,
});
const minji = voice("a");
const junho = voice("b", {
	name: "준호",
	englishName: "Junho",
	gender: "male",
	age: "middle_age",
	useCases: ["Game", "Ads/Promotion"],
	models: [{ model: "ssfm-v21", emotions: [] }],
});
const sora = voice("c", {
	name: "소라",
	englishName: null,
	gender: null,
	age: null,
	useCases: [],
	models: [
		{ model: "ssfm-v30", emotions: [] },
		{ model: "ssfm-v21", emotions: [] },
	],
});
const all = [minji, junho, sora];
const ids = (list: readonly Voice[]) => list.map((item) => item.voiceId);
const only = (filters: Partial<typeof EMPTY_FILTERS>) => ({
	...EMPTY_FILTERS,
	...filters,
});

describe("filterVoices", () => {
	it("조건이 없으면 전체를 받은 순서대로 돌려준다", () => {
		expect(ids(filterVoices(all, "", EMPTY_FILTERS))).toEqual(["a", "b", "c"]);
	});

	it("한글·영문 이름 부분 일치이고 대소문자와 앞뒤 공백을 가리지 않는다", () => {
		expect(ids(filterVoices(all, "준", EMPTY_FILTERS))).toEqual(["b"]);
		expect(ids(filterVoices(all, "  JUN ", EMPTY_FILTERS))).toEqual(["b"]);
		expect(ids(filterVoices(all, "minji", EMPTY_FILTERS))).toEqual(["a"]);
		expect(ids(filterVoices(all, "없는이름", EMPTY_FILTERS))).toEqual([]);
	});

	it("NFD로 들어온 한글도 찾는다", () => {
		expect(
			ids(filterVoices(all, "민".normalize("NFD"), EMPTY_FILTERS)),
		).toEqual(["a"]);
	});

	it("같은 축은 OR이고 값이 없는 성우는 그 축을 고르면 빠진다", () => {
		expect(
			ids(filterVoices(all, "", only({ genders: ["female", "male"] }))),
		).toEqual(["a", "b"]);
		expect(
			ids(filterVoices(all, "", only({ ages: ["young_adult", "middle_age"] }))),
		).toEqual(["a", "b"]);
	});

	it("다른 축은 AND다", () => {
		expect(
			ids(
				filterVoices(
					all,
					"",
					only({ genders: ["male"], useCases: ["Ads/Promotion"] }),
				),
			),
		).toEqual(["b"]);
		expect(
			ids(
				filterVoices(
					all,
					"",
					only({ genders: ["female"], useCases: ["Game"] }),
				),
			),
		).toEqual([]);
	});

	it("모델은 성우가 가진 모델 가운데 하나라도 맞으면 남는다", () => {
		expect(ids(filterVoices(all, "", only({ models: ["ssfm-v21"] })))).toEqual([
			"b",
			"c",
		]);
	});

	it("검색과 필터를 함께 건다", () => {
		expect(
			ids(filterVoices(all, "소", only({ models: ["ssfm-v30"] }))),
		).toEqual(["c"]);
	});
});

describe("hasConditions", () => {
	it("공백뿐인 검색어는 조건이 아니다", () => {
		expect(hasConditions("", EMPTY_FILTERS)).toBe(false);
		expect(hasConditions("  ", EMPTY_FILTERS)).toBe(false);
		expect(hasConditions("민", EMPTY_FILTERS)).toBe(true);
		expect(hasConditions("", only({ ages: ["elder"] }))).toBe(true);
	});
});

describe("filterOptions", () => {
	it("받은 목록에 있는 값만, 아는 값은 정한 순서로, 콘텐츠는 인원 많은 순으로 만든다", () => {
		expect(filterOptions(all)).toEqual({
			models: [
				{ value: "ssfm-v30", label: "ssfm-v30" },
				{ value: "ssfm-v21", label: "ssfm-v21" },
			],
			genders: [
				{ value: "female", label: "여성" },
				{ value: "male", label: "남성" },
			],
			ages: [
				{ value: "young_adult", label: "청년" },
				{ value: "middle_age", label: "중년" },
			],
			useCases: [
				{ value: "Ads/Promotion", label: "광고·홍보" },
				{ value: "Game", label: "게임" },
			],
		});
	});

	it("모르는 값은 공급자 값 그대로 아는 값 뒤에 둔다", () => {
		const options = filterOptions([
			...all,
			voice("d", { age: "senior", useCases: ["Podcast Intro"] }),
		]);
		expect(options.ages.at(-1)).toEqual({ value: "senior", label: "senior" });
		expect(options.useCases).toContainEqual({
			value: "Podcast Intro",
			label: "Podcast Intro",
		});
	});

	it("모델은 새 판이 먼저다", () => {
		const options = filterOptions([
			voice("x", { models: [{ model: "ssfm-v21", emotions: [] }] }),
			voice("y", { models: [{ model: "ssfm-v30", emotions: [] }] }),
			voice("z", { models: [{ model: "ssfm-v31", emotions: [] }] }),
		]);
		expect(options.models.map((option) => option.value)).toEqual([
			"ssfm-v31",
			"ssfm-v30",
			"ssfm-v21",
		]);
	});
	it("성별·연령 선택지 순서는 받은 순서가 아니라 표 순서다(콘텐츠 순서는 groupByUseCase 테스트가 덮는다)", () => {
		const options = filterOptions([
			voice("m", { gender: "male", age: "middle_age" }),
			voice("f", { gender: "female", age: "young_adult" }),
		]);
		expect(options.genders.map((option) => option.value)).toEqual([
			"female",
			"male",
		]);
		expect(options.ages.map((option) => option.value)).toEqual([
			"young_adult",
			"middle_age",
		]);
	});
});

describe("groupByUseCase", () => {
	it("인원 많은 순이고 콘텐츠가 없는 성우는 마지막 묶음(null)이다", () => {
		expect(
			groupByUseCase(all).map((group) => [group.useCase, ids(group.voices)]),
		).toEqual([
			["Ads/Promotion", ["a", "b"]],
			["Game", ["b"]],
			[null, ["c"]],
		]);
	});

	it("먼저 나온 성우의 콘텐츠가 아니라 인원이 많은 콘텐츠가 앞선다", () => {
		const groups = groupByUseCase([
			voice("g1", { useCases: ["Game"] }),
			voice("a1", { useCases: ["Anime"] }),
			voice("a2", { useCases: ["Anime"] }),
		]);
		expect(groups.map((group) => group.useCase)).toEqual(["Anime", "Game"]);
	});

	it("인원이 같으면 처음 나온 순이고, 한 성우의 같은 콘텐츠는 한 번만 센다", () => {
		const groups = groupByUseCase([
			voice("p", { useCases: ["Anime", "Anime"] }),
			voice("q", { useCases: ["Rapper"] }),
		]);
		expect(groups.map((group) => [group.useCase, group.voices.length])).toEqual(
			[
				["Anime", 1],
				["Rapper", 1],
			],
		);
	});
});

describe("filterByNameOrId (Airy 탭)", () => {
	const airy = (voiceId: string, name: string, gender: Voice["gender"]) =>
		voice(voiceId, {
			provider: "airy",
			name,
			englishName: null,
			gender,
			age: null,
			useCases: [],
			models: [],
		});
	const list = [
		airy("a597bb7a98fc9ec1", "Silvia", "female"),
		airy("0123456789abcdef", "Mark", "male"),
	];
	it("이름·성우 id 부분 일치(대소문자 무시), 성별은 여럿이면 OR", () => {
		expect(filterByNameOrId(list, "silv", []).map((v) => v.name)).toEqual([
			"Silvia",
		]);
		expect(filterByNameOrId(list, "89AB", []).map((v) => v.name)).toEqual([
			"Mark",
		]);
		expect(filterByNameOrId(list, "", ["male"]).map((v) => v.name)).toEqual([
			"Mark",
		]);
		expect(filterByNameOrId(list, "", ["female", "male"])).toHaveLength(2);
		expect(filterByNameOrId(list, "silv", ["male"])).toEqual([]);
	});
});

describe("Gemini 탭 거르기(T7.6 스펙 2·5절)", () => {
	const ko = (id: string, over: Partial<Voice> = {}) =>
		voice(id, {
			provider: "gemini",
			name: `Advisor ${id}`,
			englishName: null,
			gender: "male",
			age: null,
			pitch: "low",
			accent: "Seoul Korean",
			useCases: ["Enterprise Agent"],
			personas: ["High-Trust Advisor"],
			languages: ["ko-KR"],
			models: [],
			description: "Lawyer from Seoul.",
			...over,
		});
	const classic = (id: string, over: Partial<Voice> = {}) =>
		ko(id, {
			name: id,
			gender: "female",
			pitch: "high",
			accent: "Northwest",
			useCases: ["Content & Media"],
			personas: ["Storyteller & Narrator"],
			languages: ["en-US"],
			description: "Soft voice.",
			...over,
		});
	const all = [
		ko("ko-kr-advisor-1"),
		ko("ko-kr-advisor-2", {
			gender: "female",
			pitch: "medium",
			accent: "Busan Korean",
			useCases: ["Enterprise Agent", "Conversational / Edu"],
		}),
		classic("kore"),
	];
	const ids = (filters: Partial<GeminiFilters>, query = "") =>
		filterGemini(all, query, { ...EMPTY_GEMINI_FILTERS, ...filters }).map(
			(v) => v.voiceId,
		);

	it("같은 축은 OR, 다른 축은 AND, 검색은 이름·성우 id·설명(대소문자 무시)", () => {
		expect(ids({ kinds: ["classic"] })).toEqual(["kore"]);
		expect(ids({ accents: ["Busan Korean"] })).toEqual(["ko-kr-advisor-2"]);
		// 대표 성우가 앞이다(아래 정렬 테스트)
		expect(ids({ pitches: ["low", "high"] })).toEqual([
			"kore",
			"ko-kr-advisor-1",
		]);
		expect(
			ids({ contexts: ["Conversational / Edu"], genders: ["female"] }),
		).toEqual(["ko-kr-advisor-2"]);
		expect(ids({ personas: ["Storyteller & Narrator"] })).toEqual(["kore"]);
		expect(ids({}, "KORE")).toEqual(["kore"]);
		expect(ids({}, "advisor-2")).toEqual(["ko-kr-advisor-2"]);
		expect(ids({}, "soft")).toEqual(["kore"]);
	});

	it("정렬: 검색이 없으면 대표 성우가 앞, 한국어 성우가 뒤이고 각자 원래 순서다", () => {
		expect(ids({})).toEqual(["kore", "ko-kr-advisor-1", "ko-kr-advisor-2"]);
	});

	it("정렬: 검색어가 있으면 이름 전체 일치 → 이름 시작 → 이름 포함 → 성우 id → 설명 순이고, 인원은 설명 일치까지 센다", () => {
		const list = [
			ko("ko-kr-advisor-1", {
				description: "38-year-old Lawyer from Seoul, South Korea. Speaks …",
			}),
			ko("ko-kr-advisor-2", { name: "Koreana Host 2" }),
			classic("aoede", { name: "Akore" }),
			ko("ko-kr-kore-3", { name: "Calm Host 3" }),
			classic("kore", { name: "Kore" }),
			classic("korean", { name: "Koreana" }),
		];
		const found = filterGemini(list, "Kore", EMPTY_GEMINI_FILTERS).map(
			(v) => v.voiceId,
		);
		expect(found).toEqual([
			"kore",
			// 같은 등급(이름 시작)이면 대표 성우가 앞
			"korean",
			"ko-kr-advisor-2",
			"aoede",
			"ko-kr-kore-3",
			"ko-kr-advisor-1",
		]);
	});

	it("'전체' 묶음(같은 함수 결과의 처음 5명)은 서버가 한국어 성우를 앞에 두어도 대표 성우다", () => {
		const server = [
			...["1", "2", "3", "4", "5", "6"].map((n) => ko(`ko-kr-advisor-${n}`)),
			...["kore", "puck", "zephyr", "charon", "fenrir"].map((id) =>
				classic(id),
			),
		];
		const { voices } = bundleOf(
			filterGemini(server, "", EMPTY_GEMINI_FILTERS),
			{ total: server.length, totalExact: true },
		);
		expect(voices.map((v) => v.voiceId)).toEqual([
			"kore",
			"puck",
			"zephyr",
			"charon",
			"fenrir",
		]);
	});

	it("선택지: 아는 값은 한국어 이름, 억양은 한국어 성우 값만, 페르소나는 원문 알파벳순", () => {
		const options = geminiOptions(all);
		expect(options.kinds).toEqual([
			{ value: "korean", label: "한국어 성우" },
			{ value: "classic", label: "대표 성우" },
		]);
		expect(options.pitches.map((o) => o.label)).toEqual([
			"낮음",
			"중간",
			"높음",
		]);
		expect(options.accents).toEqual([
			{ value: "Seoul Korean", label: "서울" },
			{ value: "Busan Korean", label: "부산" },
		]);
		expect(options.contexts.map((o) => o.label)).toEqual([
			"콘텐츠·미디어",
			"대화·교육",
			"기업 상담",
		]);
		expect(options.personas.map((o) => o.value)).toEqual([
			"High-Trust Advisor",
			"Storyteller & Narrator",
		]);
	});
});
