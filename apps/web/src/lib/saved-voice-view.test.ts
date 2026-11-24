import { describe, expect, it } from "vitest";

import {
	EL_DESCRIPTIVE,
	EL_USE_CASE,
	FISH_CONTENT,
	FISH_MOOD,
} from "./provider-conditions";
import {
	CONTENT_TAGS,
	chipGroups,
	countLine,
	EMPTY_LIBRARY_FILTERS,
	filterSaved,
	filtersFromQuery,
	hasLibraryFilters,
	knownOnly,
	LIBRARY_SORTS,
	LIBRARY_TEXT,
	type LibrarySort,
	linkedNote,
	linkMessage,
	MOOD_TAGS,
	memoAfterSave,
	peopleOptions,
	popularGroups,
	queryFromFilters,
	removedMessage,
	removeQuestion,
	sameName,
	savedKey,
	sortSaved,
	tagKeysOf,
	tagMissingCount,
	tagOptions,
	voiceCountText,
} from "./saved-voice-view";
import { GEMINI_CONTEXT_LABEL, USE_CASE_LABEL } from "./voice-filter";

const item = (
	voiceId: string,
	extra: Partial<{
		provider: "typecast" | "elevenlabs" | "fish_audio" | "airy" | "gemini";
		name: string;
		englishName: string | null;
		favorite: boolean;
		frequent: boolean;
		memo: string | null;
		channelIds: string[];
		classificationIds: string[];
		gender: "female" | "male" | null;
		age: string | null;
		tags: string[];
		useCases: string[];
		descriptives: string[];
		usage: { kind: "chars_1y" | "tasks"; count: number } | null;
		lastUsedAt: string | null;
		useCount: number;
	}> = {},
) => ({
	id: `saved-${voiceId}`,
	voice: {
		provider: extra.provider ?? "typecast",
		voiceId,
		name: extra.name ?? voiceId,
		englishName: extra.englishName ?? null,
		gender: extra.gender ?? null,
		age: extra.age ?? null,
		tags: extra.tags ?? [],
		useCases: extra.useCases ?? [],
		descriptives: extra.descriptives ?? [],
		usage: extra.usage ?? null,
	},
	favorite: extra.favorite ?? false,
	frequent: extra.frequent ?? false,
	memo: extra.memo ?? null,
	channelIds: extra.channelIds ?? [],
	classificationIds: extra.classificationIds ?? [],
	lastUsedAt: extra.lastUsedAt ?? null,
	useCount: extra.useCount ?? 0,
});

describe("savedKey", () => {
	it("출처를 빼고 공급자 + 성우 id다(공개·계정에서 담아도 같은 성우)", () => {
		expect(savedKey({ provider: "elevenlabs", voiceId: "v1" })).toBe(
			"elevenlabs:v1",
		);
	});
});

describe("주소 쿼리 ↔ 필터", () => {
	it("왕복하고 기본값은 쓰지 않는다", () => {
		const f = {
			...EMPTY_LIBRARY_FILTERS,
			q: "민지",
			view: "favorite" as const,
			provider: "fish_audio" as const,
			category: ["c1", "c2"],
		};
		const q = queryFromFilters(f);
		expect(q).toBe(
			"q=%EB%AF%BC%EC%A7%80&view=favorite&provider=fish_audio&category=c1&category=c2",
		);
		expect(filtersFromQuery(new URLSearchParams(q))).toEqual(f);
		expect(queryFromFilters(EMPTY_LIBRARY_FILTERS)).toBe("");
	});
	it("모르는 보기·공급자는 기본값, 같은 id 중복은 하나로", () => {
		expect(
			filtersFromQuery(
				new URLSearchParams("view=x&provider=y&channel=a&channel=a"),
			),
		).toEqual({ ...EMPTY_LIBRARY_FILTERS, channel: ["a"] });
	});
	it("knownOnly는 지워진 분류 id를 버린다", () => {
		expect(
			knownOnly(
				{ ...EMPTY_LIBRARY_FILTERS, channel: ["a", "gone"] },
				new Set(["a"]),
			).channel,
		).toEqual(["a"]);
	});
	it("보관함 공급자 쿼리는 airy를 받는다", () => {
		expect(
			filtersFromQuery(new URLSearchParams("provider=airy")).provider,
		).toBe("airy");
		expect(
			queryFromFilters({ ...EMPTY_LIBRARY_FILTERS, provider: "airy" }),
		).toBe("provider=airy");
	});
	it("보관함 공급자 쿼리는 gemini를 받는다", () => {
		expect(
			filtersFromQuery(new URLSearchParams("provider=gemini")).provider,
		).toBe("gemini");
	});
});

describe("filterSaved(그룹 안 OR, 그룹끼리 AND)", () => {
	const items = [
		item("a", {
			name: "민지",
			favorite: true,
			channelIds: ["ch1"],
			classificationIds: ["cat1"],
		}),
		item("b", {
			name: "준호",
			frequent: true,
			channelIds: ["ch1"],
			classificationIds: ["cat2"],
		}),
		item("c", {
			name: "Alice",
			provider: "fish_audio",
			memo: "광고용",
			classificationIds: ["cat1", "ty1"],
		}),
	];
	it("'프리셋' 보기는 프리셋에 쓰는 성우만(집합이 없으면 아무도 없다)", () => {
		const only = (presets: ReadonlySet<string>) =>
			filterSaved(
				items,
				{ ...EMPTY_LIBRARY_FILTERS, view: "preset" },
				presets,
			).map((i) => i.voice.voiceId);
		expect(only(new Set(["saved-b"]))).toEqual(["b"]);
		expect(only(new Set())).toEqual([]);
	});
	it("view=preset 쿼리를 읽고 쓴다", () => {
		expect(filtersFromQuery(new URLSearchParams("view=preset")).view).toBe(
			"preset",
		);
		expect(queryFromFilters({ ...EMPTY_LIBRARY_FILTERS, view: "preset" })).toBe(
			"view=preset",
		);
	});
	const ids = (f: Partial<typeof EMPTY_LIBRARY_FILTERS>) =>
		filterSaved(items, { ...EMPTY_LIBRARY_FILTERS, ...f }).map(
			(i) => i.voice.voiceId,
		);

	it("조건이 없으면 전부, 순서는 그대로", () => {
		expect(ids({})).toEqual(["a", "b", "c"]);
	});
	it("보기·공급자", () => {
		expect(ids({ view: "favorite" })).toEqual(["a"]);
		expect(ids({ view: "frequent" })).toEqual(["b"]);
		expect(ids({ provider: "fish_audio" })).toEqual(["c"]);
	});
	it("같은 그룹 안은 하나라도 맞으면, 그룹끼리는 모두 맞아야", () => {
		expect(ids({ category: ["cat1", "cat2"] })).toEqual(["a", "b", "c"]);
		expect(ids({ category: ["cat1"], channel: ["ch1"] })).toEqual(["a"]);
		expect(ids({ category: ["cat1"], type: ["ty1"] })).toEqual(["c"]);
	});
	it("검색은 이름·영문 이름·메모, 대소문자와 NFD를 가리지 않는다", () => {
		expect(ids({ q: "alice" })).toEqual(["c"]);
		expect(ids({ q: "광고" })).toEqual(["c"]);
		expect(ids({ q: "민지".normalize("NFD") })).toEqual(["a"]);
		expect(ids({ q: "  " })).toEqual(["a", "b", "c"]);
	});
});

describe("성별·연령(공통 키, 브리프 B4)", () => {
	const items = [
		item("t", { gender: "female", age: "middle_age" }),
		item("e", { provider: "elevenlabs", gender: "male", age: "young" }),
		item("f", { provider: "fish_audio", tags: ["female", "young"] }),
		item("n"),
	];
	const ids = (f: Partial<typeof EMPTY_LIBRARY_FILTERS>) =>
		filterSaved(items, { ...EMPTY_LIBRARY_FILTERS, ...f }).map(
			(i) => i.voice.voiceId,
		);
	it("각각 하나만 고르고 두 축은 AND, 값이 없는 성우는 그 축을 고르면 빠진다", () => {
		expect(ids({})).toEqual(["t", "e", "f", "n"]);
		expect(ids({ gender: "female" })).toEqual(["t", "f"]);
		expect(ids({ age: "young" })).toEqual(["e", "f"]);
		expect(ids({ gender: "female", age: "young" })).toEqual(["f"]);
	});
	it("주소 쿼리 gender·age는 값 하나다(여럿이면 첫 아는 값, 모르는 값은 버린다)", () => {
		const f = { ...EMPTY_LIBRARY_FILTERS, gender: "male", age: "old" };
		expect(queryFromFilters(f)).toBe("gender=male&age=old");
		expect(filtersFromQuery(new URLSearchParams(queryFromFilters(f)))).toEqual(
			f,
		);
		expect(
			filtersFromQuery(
				new URLSearchParams(
					"gender=x&gender=female&gender=male&age=young_adult",
				),
			),
		).toEqual({ ...EMPTY_LIBRARY_FILTERS, gender: "female" });
		expect(hasLibraryFilters({ ...EMPTY_LIBRARY_FILTERS, age: "old" })).toBe(
			true,
		);
		expect(hasLibraryFilters(EMPTY_LIBRARY_FILTERS)).toBe(false);
	});
	it("선택지는 담은 성우에 있는 값만 공통 키 순서로(고른 값은 남긴다)", () => {
		const options = peopleOptions(items, EMPTY_LIBRARY_FILTERS);
		expect(options.gender).toEqual([
			{ value: "female", label: "여성" },
			{ value: "male", label: "남성" },
		]);
		expect(options.age.map((o) => o.label)).toEqual(["청년", "중년"]);
		expect(
			peopleOptions(items, { ...EMPTY_LIBRARY_FILTERS, age: "old" }).age.map(
				(o) => o.value,
			),
		).toEqual(["young", "middle", "old"]);
	});
});

describe("칩·이름", () => {
	it("그룹 순서(채널→카테고리→타입), 그룹 안 이름순, 모르는 id는 뺀다", () => {
		const groups = chipGroups(
			{ channelIds: ["c2", "c1"], classificationIds: ["t1", "k1", "gone"] },
			[
				{ id: "c1", name: "주말" },
				{ id: "c2", name: "경제" },
			],
			[
				{ id: "k1", kind: "category", name: "뉴스" },
				{ id: "t1", kind: "type", name: "차분함" },
			],
		);
		expect(groups.map((g) => [g.group, g.items.map((i) => i.name)])).toEqual([
			["channel", ["경제", "주말"]],
			["category", ["뉴스"]],
			["type", ["차분함"]],
		]);
	});
	it("sameName은 서버 중복 규칙(정리·대소문자 무시)으로 찾는다", () => {
		const list = [{ name: "News" }, { name: "경제 한 입" }];
		expect(sameName(list, " news ")).toBe(list[0]);
		expect(sameName(list, "경제　한  입")).toBe(list[1]);
		expect(sameName(list, "경제")).toBeUndefined();
	});
	it("연결 수 문구", () => {
		expect(voiceCountText(0)).toBeNull();
		expect(voiceCountText(3)).toBe("성우 3명");
		expect(linkedNote(0, "category")).toBe("");
		expect(linkedNote(2, "category")).toBe(
			". 연결된 성우 2명은 보관함에 그대로 남고, 이 카테고리 연결만 풀려요.",
		);
	});
	it("상태 줄과 알림 문구", () => {
		expect(countLine(40, 40)).toBe("담은 성우 40명");
		expect(countLine(40, 12)).toBe("담은 성우 40명 중 12명");
		expect(linkMessage("뉴스", "category", true)).toBe(
			"‘뉴스’ 카테고리를 붙였어요.",
		);
		expect(linkMessage("경제", "channel", false)).toBe("‘경제’ 채널을 뗐어요.");
		expect(removeQuestion("Alice")).toBe("‘Alice’ 성우를 보관함에서 뺄까요?");
		expect(removedMessage("민지")).toBe("‘민지’ 성우를 보관함에서 뺐어요");
	});
});

describe("정렬(브리프 B4-2)", () => {
	const order = (items: ReturnType<typeof item>[], sort: LibrarySort) =>
		sortSaved(items, sort).map((i) => i.voice.voiceId);
	it("recent는 서버가 준 담은 순서 그대로", () => {
		const items = [item("a"), item("b"), item("c")];
		expect(order(items, "recent")).toEqual(["a", "b", "c"]);
	});
	it("used는 lastUsedAt 큰 순, 쓴 적 없으면 뒤, 같으면 담은 순서", () => {
		const items = [
			item("never1"),
			item("old", { lastUsedAt: "2026-11-01T00:00:00.000Z" }),
			item("new", { lastUsedAt: "2026-11-19T00:00:00.000Z" }),
			item("never2"),
			item("old2", { lastUsedAt: "2026-11-01T00:00:00.000Z" }),
		];
		expect(order(items, "used")).toEqual([
			"new",
			"old",
			"old2",
			"never1",
			"never2",
		]);
	});
	it("count는 useCount 큰 순, 같으면 담은 순서", () => {
		const items = [
			item("a", { useCount: 1 }),
			item("b", { useCount: 5 }),
			item("c", { useCount: 1 }),
		];
		expect(order(items, "count")).toEqual(["b", "a", "c"]);
	});
	it("name은 한글 이름 가나다 → 그 밖 ABC", () => {
		const items = [
			item("1", { name: "Bob" }),
			item("2", { name: "하늘" }),
			item("3", { name: "alice" }),
			item("4", { name: "가람" }),
			item("5", { name: "7번" }),
			item("6", { name: "나래" }),
		];
		expect(sortSaved(items, "name").map((i) => i.voice.name)).toEqual([
			"가람",
			"나래",
			"하늘",
			"7번",
			"alice",
			"Bob",
		]);
	});
	it("name은 앞뒤 공백을 빼고 비교한다", () => {
		const items = [
			item("1", { name: "나래" }),
			item("2", { name: " 하늘" }),
			item("3", { name: "가람" }),
		];
		expect(sortSaved(items, "name").map((i) => i.voice.voiceId)).toEqual([
			"3",
			"1",
			"2",
		]);
	});
	it("popular는 ElevenLabs 묶음 → Fish Audio 묶음(각각 큰 순) → 수치 없는 성우 담은 순서", () => {
		const items = [
			item("none1"),
			item("f1", {
				provider: "fish_audio",
				usage: { kind: "tasks", count: 10 },
			}),
			item("e1", {
				provider: "elevenlabs",
				usage: { kind: "chars_1y", count: 5 },
			}),
			item("none2", { provider: "airy" }),
			item("f2", {
				provider: "fish_audio",
				usage: { kind: "tasks", count: 99 },
			}),
			item("e2", {
				provider: "elevenlabs",
				usage: { kind: "chars_1y", count: 500 },
			}),
		];
		expect(order(items, "popular")).toEqual([
			"e2",
			"e1",
			"f2",
			"f1",
			"none1",
			"none2",
		]);
	});
	it("서비스 인기순 묶음 머리: 행이 있는 묶음만 sortSaved와 같은 기준으로", () => {
		const items = [
			item("f", { provider: "fish_audio", usage: { kind: "tasks", count: 3 } }),
			item("n"),
		];
		const groups = popularGroups(sortSaved(items, "popular"));
		expect(
			groups.map((g) => [g.label, g.items.map((i) => i.voice.voiceId)]),
		).toEqual([
			["Fish Audio · 사용 횟수", ["f"]],
			["인기 수치 없음", ["n"]],
		]);
		expect(
			popularGroups([
				item("e", {
					provider: "elevenlabs",
					usage: { kind: "chars_1y", count: 1 },
				}),
			]).map((g) => g.label),
		).toEqual(["ElevenLabs · 최근 1년 글자 수"]);
	});
	it("정렬 이름(화면 글은 '서비스')", () => {
		expect(LIBRARY_SORTS.map((s) => s.label)).toEqual([
			"최근 담은 순",
			"최근 쓴 순",
			"사용 횟수순",
			"이름순",
			"서비스 인기순",
		]);
	});
	it("주소 sort: 기본값은 쓰지 않고 모르는 값은 기본, 조건이 아니다", () => {
		const f = { ...EMPTY_LIBRARY_FILTERS, sort: "name" as const };
		expect(queryFromFilters(f)).toBe("sort=name");
		expect(filtersFromQuery(new URLSearchParams("sort=name"))).toEqual(f);
		expect(filtersFromQuery(new URLSearchParams("sort=x")).sort).toBe("recent");
		expect(queryFromFilters(EMPTY_LIBRARY_FILTERS)).toBe("");
		expect(hasLibraryFilters(f)).toBe(false);
	});
});

describe("공통 태그(콘텐츠·분위기, 브리프 B4-2)", () => {
	it("변환표의 모든 원래 값은 그 공급자 이름표에 있다", () => {
		const labels = {
			typecast: USE_CASE_LABEL,
			elevenlabs: EL_USE_CASE,
			fish_audio: FISH_CONTENT,
			gemini: GEMINI_CONTEXT_LABEL,
		};
		for (const row of CONTENT_TAGS)
			for (const provider of Object.keys(labels) as (keyof typeof labels)[])
				for (const value of row[provider])
					expect(labels[provider].has(value), `${provider} ${value}`).toBe(
						true,
					);
	});
	it("분위기 묶음은 두 이름표의 모든 값을 덮고, 같은 이름은 한 묶음, 밝음 넷은 '밝고 경쾌함'", () => {
		const values = (provider: "elevenlabs" | "fish_audio") =>
			MOOD_TAGS.flatMap((row) => row[provider]);
		expect(new Set(values("elevenlabs"))).toEqual(
			new Set(EL_DESCRIPTIVE.keys()),
		);
		expect(new Set(values("fish_audio"))).toEqual(new Set(FISH_MOOD.keys()));
		const labels = MOOD_TAGS.map((row) => row.label);
		expect(new Set(labels).size).toBe(labels.length);
		const crisp = MOOD_TAGS.find((row) => row.label === "또렷함");
		expect(crisp).toMatchObject({
			elevenlabs: ["crisp"],
			fish_audio: ["clear"],
		});
		const bright = MOOD_TAGS.find((row) => row.label === "밝고 경쾌함");
		expect(bright).toMatchObject({
			elevenlabs: ["upbeat"],
			fish_audio: ["energetic", "bright", "cheerful"],
		});
		for (const name of ["밝음", "명랑함", "활기참", "경쾌함"])
			expect(labels).not.toContain(name);
		// ElevenLabs 표 순서 뒤에 Fish Audio에만 있는 이름
		expect(labels[0]).toBe("차분함");
		expect(labels.indexOf("친근함")).toBeGreaterThan(labels.indexOf("성숙함"));
	});

	const items = [
		item("t", { useCases: ["Audiobook/Storytelling", "Unknown"] }),
		item("e", {
			provider: "elevenlabs",
			useCases: ["advertisement"],
			descriptives: ["calm", "upbeat"],
		}),
		item("f", {
			provider: "fish_audio",
			tags: ["female", "narration", "bright", "calm"],
		}),
		item("g", { provider: "gemini", useCases: ["Conversational / Edu"] }),
		item("a", { provider: "airy", useCases: ["narration"] }),
	];
	const ids = (f: Partial<typeof EMPTY_LIBRARY_FILTERS>) =>
		filterSaved(items, { ...EMPTY_LIBRARY_FILTERS, ...f }).map(
			(i) => i.voice.voiceId,
		);
	it("공급자별 출처로 공통 키를 붙인다(Gemini 대화·교육은 둘, Airy는 없음)", () => {
		expect(tagKeysOf(items[0].voice, "content")).toEqual(["narration"]);
		expect(tagKeysOf(items[1].voice, "mood")).toEqual(["calm", "upbeat"]);
		expect(tagKeysOf(items[2].voice, "content")).toEqual(["narration"]);
		// 표 순서로, 같은 묶음은 한 번
		expect(tagKeysOf(items[2].voice, "mood")).toEqual(["calm", "upbeat"]);
		expect(tagKeysOf(items[3].voice, "content")).toEqual([
			"conversation",
			"education",
		]);
		expect(tagKeysOf(items[4].voice, "content")).toEqual([]);
	});
	it("같은 축 OR, 다른 축 AND, 태그 없는 성우는 그 축을 고르면 빠진다", () => {
		expect(ids({ content: ["narration"] })).toEqual(["t", "f"]);
		expect(ids({ content: ["narration", "education"] })).toEqual([
			"t",
			"f",
			"g",
		]);
		expect(ids({ mood: ["upbeat"] })).toEqual(["e", "f"]);
		expect(ids({ content: ["narration"], mood: ["upbeat"] })).toEqual(["f"]);
	});
	it("주소 content·mood는 공통 키만(모르는 키 버림, 중복 하나로), 조건이다", () => {
		const f = {
			...EMPTY_LIBRARY_FILTERS,
			content: ["ads", "news"],
			mood: ["calm"],
		};
		expect(queryFromFilters(f)).toBe("content=ads&content=news&mood=calm");
		expect(filtersFromQuery(new URLSearchParams(queryFromFilters(f)))).toEqual(
			f,
		);
		expect(
			filtersFromQuery(
				new URLSearchParams("content=x&content=ads&content=ads&mood=bright"),
			),
		).toEqual({ ...EMPTY_LIBRARY_FILTERS, content: ["ads"] });
		expect(
			hasLibraryFilters({ ...EMPTY_LIBRARY_FILTERS, mood: ["calm"] }),
		).toBe(true);
	});
	it("태그 정보가 없어 빠진 성우 수: 다른 조건은 통과했고 고른 태그 축에 값이 없어서만 빠진 수", () => {
		const missing = (f: Partial<typeof EMPTY_LIBRARY_FILTERS>) =>
			tagMissingCount(items, { ...EMPTY_LIBRARY_FILTERS, ...f });
		// 태그 축을 고르지 않으면 0
		expect(missing({ provider: "airy" })).toBe(0);
		// 콘텐츠: Airy만 값이 없다(e·g는 값이 있는데 맞지 않아 빠짐)
		expect(missing({ content: ["narration"] })).toBe(1);
		// 분위기: t·g·a가 값이 없다(e·f는 값이 있다)
		expect(missing({ mood: ["calm"] })).toBe(3);
		// 다른 조건(서비스)으로 빠진 성우는 세지 않는다
		expect(missing({ mood: ["calm"], provider: "gemini" })).toBe(1);
		// 두 축: t(콘텐츠 맞음·분위기 없음)와 a(둘 다 없음)를 센다. g는 콘텐츠가 안 맞아 세지 않는다
		expect(missing({ content: ["narration"], mood: ["calm"] })).toBe(2);
		expect(LIBRARY_TEXT.tagMissing(3)).toBe(
			"태그 정보가 없는 성우 3명은 빠졌어요",
		);
	});
	it("선택지는 담은 성우에 있는 묶음만 표 순서로, 고른 키는 남긴다", () => {
		const options = tagOptions(items, EMPTY_LIBRARY_FILTERS);
		expect(options.content.map((o) => o.value)).toEqual([
			"narration",
			"conversation",
			"education",
			"ads",
		]);
		expect(options.content[0].label).toBe("내레이션·오디오북");
		expect(options.mood.map((o) => o.label)).toEqual(["차분함", "밝고 경쾌함"]);
		expect(
			tagOptions(items, {
				...EMPTY_LIBRARY_FILTERS,
				content: ["podcast"],
			}).content.map((o) => o.value),
		).toContain("podcast");
	});
});

describe("memoAfterSave", () => {
	it("저장하는 동안 이어 쓴 메모는 응답이 지우지 않는다(audit C5)", () => {
		expect(
			memoAfterSave("뉴스에 좋음 / 쇼핑은 별로", "뉴스에 좋음", "뉴스에 좋음"),
		).toBe("뉴스에 좋음 / 쇼핑은 별로");
		// 저장하는 동안 다 지운 것도 이어 쓴 것이다
		expect(memoAfterSave("", "뉴스에 좋음", "뉴스에 좋음")).toBe("");
	});
	it("그사이 손대지 않았으면 서버가 정리한 값으로 맞춘다", () => {
		expect(memoAfterSave("  뉴스  ", "  뉴스  ", "뉴스")).toBe("뉴스");
		expect(memoAfterSave("   ", "   ", null)).toBe("");
	});
});

describe("주소 쿼리 필터링", () => {
	it("공백만 있는 q는 조건으로 세지 않는다", () => {
		expect(hasLibraryFilters({ ...EMPTY_LIBRARY_FILTERS, q: "  " })).toBe(
			false,
		);
	});
});
