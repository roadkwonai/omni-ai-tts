import { describe, expect, it } from "vitest";

import {
	chipGroups,
	countLine,
	EMPTY_LIBRARY_FILTERS,
	filterSaved,
	filtersFromQuery,
	hasLibraryFilters,
	knownOnly,
	linkedNote,
	linkMessage,
	queryFromFilters,
	removedMessage,
	removeQuestion,
	sameName,
	savedKey,
	voiceCountText,
} from "./saved-voice-view";

const item = (
	voiceId: string,
	extra: Partial<{
		provider: "typecast" | "elevenlabs" | "fish_audio";
		name: string;
		englishName: string | null;
		favorite: boolean;
		frequent: boolean;
		memo: string | null;
		channelIds: string[];
		classificationIds: string[];
	}> = {},
) => ({
	id: `saved-${voiceId}`,
	voice: {
		provider: extra.provider ?? "typecast",
		voiceId,
		name: extra.name ?? voiceId,
		englishName: extra.englishName ?? null,
	},
	favorite: extra.favorite ?? false,
	frequent: extra.frequent ?? false,
	memo: extra.memo ?? null,
	channelIds: extra.channelIds ?? [],
	classificationIds: extra.classificationIds ?? [],
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

describe("주소 쿼리 필터링", () => {
	it("공백만 있는 q는 조건으로 세지 않는다", () => {
		expect(hasLibraryFilters({ ...EMPTY_LIBRARY_FILTERS, q: "  " })).toBe(
			false,
		);
	});
});
