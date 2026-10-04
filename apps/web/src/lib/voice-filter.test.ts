import type { Voice } from "@tts-pilot-app/api/providers/contract";
import { describe, expect, it } from "vitest";

import {
	EMPTY_FILTERS,
	filterOptions,
	filterVoices,
	groupByUseCase,
	hasConditions,
} from "./voice-filter";

const voice = (voiceId: string, overrides: Partial<Voice> = {}): Voice => ({
	provider: "typecast",
	voiceId,
	name: "민지",
	englishName: "Minji",
	gender: "female",
	age: "young_adult",
	useCases: ["Ads/Promotion"],
	models: [{ model: "ssfm-v30", emotions: ["normal"] }],
	previewUrl: null,
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
