// packages/api/src/drama-request.test.ts
import { describe, expect, it } from "vitest";

import {
	type DraftSpeaker,
	findReadLines,
	parsePaste,
	readRequests,
} from "./drama-request";
import type { Preset } from "./preset-contract";
import {
	DEFAULT_SETTINGS,
	FISH_FREE_UNTIL,
	type TrialRequest,
} from "./providers/trial-options";
import type { SavedVoice } from "./saved-voice-contract";

const speaker = (name: string, presetId: string | null = null) =>
	({ name, provider: "fish_audio", voiceId: "fa1", presetId }) as DraftSpeaker;

describe("parsePaste의 제로폭 글자", () => {
	const paste = (raw: string) => {
		let n = 0;
		const result = parsePaste(raw, [speaker("화자 1")], () => `l${++n}`);
		if ("error" in result) throw new Error(result.error);
		return {
			names: result.speakers.map((s) => s.name),
			texts: result.lines.map((line) => line.text),
		};
	};
	it.each(["\u{200b}", "\u{2060}", "\u{feff}"])(
		"%j만 있는 줄은 빈 줄이고 화자 이름 앞에서는 무시한다",
		(z) => {
			expect(paste(`민수: 안녕\n${z}\n영희: 응\n${z}민수: 가자`)).toEqual({
				names: ["민수", "영희"],
				texts: ["안녕", "응", "가자"],
			});
		},
	);
	it("보이지 않는 글자뿐이면 빈 대본이다", () => {
		expect(parsePaste("\u{200b}\n\u{2060}", [], () => "l")).toEqual({
			error: "empty",
		});
	});
	it("이모지를 잇는 U+200D(ZWJ)는 남긴다", () => {
		const family = "👨\u{200d}👩\u{200d}👧";
		expect(paste(`민수: ${family}`).texts).toEqual([family]);
	});
});

// Fish Audio 무료 모델이 끝난 뒤에도 끝나기 전에 무료로 만든 줄(보관 30일)을 다시 쓴다
describe("무료 모델 종료 뒤 줄 찾기", () => {
	const voice = {
		provider: "fish_audio",
		voiceId: "fa1",
		name: "지연",
		models: [],
	};
	const saved = [
		{ id: "s1", unavailable: false, voice },
	] as unknown as SavedVoice[];
	const paidPreset = {
		id: "paid",
		unavailable: false,
		voice,
		provider: "fish_audio",
		settings: { ...DEFAULT_SETTINGS.fish_audio, model: "s2.1-pro" },
	} as unknown as Preset;
	const LINES = ["하나", "둘", "셋"].map((text, i) => ({
		id: `l${i + 1}`,
		speaker: i === 2 ? 1 : 0,
		direction: "",
		text,
	}));
	const read = (now: number) => {
		const result = readRequests(
			[speaker("지연"), speaker("민수", "paid")],
			LINES,
			{ saved, presets: [paidPreset], headerModel: "s2.1-pro-free", now },
			"l1",
		);
		if ("problem" in result) throw new Error(result.problem.kind);
		return result.lines;
	};
	// 서버가 가진 결과. 키는 "모델 글"
	const server = (...done: string[]) => {
		const calls: string[][] = [];
		const find = async (requests: TrialRequest[]) => {
			const keys = requests.map((r) => `${r.settings.model} ${r.text}`);
			calls.push(keys);
			return keys.map((key) => (done.includes(key) ? { id: key } : null));
		};
		return { calls, find };
	};

	it("보이지 않는 글자뿐인 줄은 빈 줄이라 읽지 않는다", () => {
		expect(
			readRequests(
				[speaker("지연")],
				[{ id: "l1", speaker: 0, direction: "", text: "\u{200b}" }],
				{ saved, presets: [], headerModel: "s2.1-pro", now: 0 },
				"l1",
			),
		).toEqual({ problem: { kind: "empty", lineId: "l1", speaker: null } });
	});
	it("새로 만들 요청은 유료 모델이다", () => {
		expect(read(FISH_FREE_UNTIL).map((l) => l.request.settings.model)).toEqual([
			"s2.1-pro",
			"s2.1-pro",
			"s2.1-pro",
		]);
	});
	it("종료 전 무료 결과를 먼저 찾고, 없는 줄만 유료 요청으로 다시 찾는다", async () => {
		const { calls, find } = server("s2.1-pro-free 하나", "s2.1-pro 둘");
		expect(await findReadLines(read(FISH_FREE_UNTIL), find)).toEqual([
			{ id: "s2.1-pro-free 하나" },
			{ id: "s2.1-pro 둘" },
			null,
		]);
		expect(calls).toEqual([
			["s2.1-pro-free 하나", "s2.1-pro-free 둘", "s2.1-pro 셋"],
			["s2.1-pro 둘"],
		]);
	});
	it("처음부터 유료 모델을 고른 화자는 무료 결과를 쓰지 않는다", async () => {
		const { find } = server("s2.1-pro-free 셋");
		expect((await findReadLines(read(FISH_FREE_UNTIL), find))[2]).toBeNull();
	});
	it("종료 전에는 보낼 요청 그대로 한 번만 찾는다", async () => {
		const { calls, find } = server();
		await findReadLines(read(FISH_FREE_UNTIL - 1), find);
		expect(calls).toEqual([
			["s2.1-pro-free 하나", "s2.1-pro-free 둘", "s2.1-pro 셋"],
		]);
	});
});
