import { describe, expect, test } from "vitest";
import {
	dramaAudioInputSchema,
	dramaCreateInputSchema,
	dramaItemSchema,
	dramaRequestSchema,
	dramaResultSchema,
} from "./drama-contract";
import {
	DRAMA_DIRECTION_MAX,
	DRAMA_LINE_MAX,
	DRAMA_SCENE_NAME_MAX,
	DRAMA_SETTINGS,
} from "./drama-script";

const base = {
	sceneName: "첫 장면",
	speakers: [
		{ name: "민지", voiceId: "aaaa1111" },
		{ name: "준호", voiceId: "bbbb2222" },
	],
	lines: [
		{ speaker: 0, direction: "", text: "안녕" },
		{ speaker: 1, direction: "작게", text: "응" },
	],
	model: "s2.1-pro-free" as const,
	settings: { speed: 1, temperature: 0.7 },
};
const make = (patch: Record<string, unknown>) => ({ ...base, ...patch });
const line = (text: string, direction = "", speaker = 0) => ({
	speaker,
	direction,
	text,
});
const spk = (n: number) =>
	Array.from({ length: n }, (_, i) => ({ name: `화자${i}`, voiceId: "v1" }));
const ok = (v: unknown) => dramaRequestSchema.safeParse(v).success;

describe("드라마 요청", () => {
	test.each([
		["화자 0명", { speakers: [] }],
		["화자 5명", { speakers: spk(5) }],
		[
			"이름 중복(NFC 뒤)",
			{
				speakers: [
					{ name: "한".normalize("NFD"), voiceId: "v1" },
					{ name: "한", voiceId: "v2" },
				],
			},
		],
		["이름 21자", { speakers: [{ name: "가".repeat(21), voiceId: "v1" }] }],
		["빈 이름", { speakers: [{ name: " ", voiceId: "v1" }] }],
		["줄 0개", { lines: [] }],
		["줄 51개", { lines: Array.from({ length: 51 }, () => line("가")) }],
		["대사 301자", { lines: [line("가".repeat(DRAMA_LINE_MAX + 1))] }],
		["빈 대사(공백만)", { lines: [line("   ")] }],
		[
			"지시 61자(대괄호 뺀 뒤)",
			{ lines: [line("가", `[${"나".repeat(DRAMA_DIRECTION_MAX + 1)}]`)] },
		],
		[
			"합계 2,001자",
			{
				lines: [
					...Array.from({ length: 6 }, () => line("가".repeat(300))),
					line("가".repeat(201)),
				],
			},
		],
		[
			"속도 0.5에 1,001자",
			{
				settings: { speed: 0.5, temperature: 0.7 },
				lines: [
					...Array.from({ length: 3 }, () => line("가".repeat(300))),
					line("가".repeat(101)),
				],
			},
		],
		["대사에 <|", { lines: [line("<|speaker:1|>안녕")] }],
		["지시에 <|", { lines: [line("가", "<|speaker:1|>")] }],
		["없는 화자 번호", { lines: [line("가", "", 2)] }],
		["모델 s1", { model: "s1" }],
		["속도 2.5", { settings: { speed: 2.5, temperature: 0.7 } }],
		["장면 이름 41자", { sceneName: "가".repeat(DRAMA_SCENE_NAME_MAX + 1) }],
		["잘못된 성우 id", { speakers: [{ name: "민지", voiceId: "a/b" }] }],
		["대사 원문 상한 × 4 초과", { lines: [line(`가${" ".repeat(1200)}`)] }],
	])("%s → 거절", (_name, patch) => {
		expect(ok(make(patch))).toBe(false);
	});

	test("경계는 받는다", () => {
		expect(ok(make({ speakers: spk(1), lines: [line("가")] }))).toBe(true);
		expect(ok(make({ speakers: spk(4) }))).toBe(true);
		expect(
			ok(
				make({
					lines: Array.from({ length: 50 }, () => line("가")),
				}),
			),
		).toBe(true);
		expect(ok(make({ lines: [line("가".repeat(DRAMA_LINE_MAX))] }))).toBe(true);
		expect(
			ok(make({ lines: [line("가", "나".repeat(DRAMA_DIRECTION_MAX))] })),
		).toBe(true);
		expect(ok(make({ sceneName: "가".repeat(DRAMA_SCENE_NAME_MAX) }))).toBe(
			true,
		);
		expect(ok(make({ sceneName: "" }))).toBe(true);
		// 합계 정확히 2,000자: NFD 입력도 정리 뒤 기준
		const nfd = "한".normalize("NFD");
		expect(
			ok(
				make({
					lines: [
						...Array.from({ length: 6 }, () => line(nfd.repeat(300))),
						line("가".repeat(200)),
					],
				}),
			),
		).toBe(true);
		expect(
			ok(
				make({
					settings: { speed: 0.5, temperature: 0.7 },
					lines: [
						...Array.from({ length: 3 }, () => line("가".repeat(300))),
						line("가".repeat(100)),
					],
				}),
			),
		).toBe(true);
	});

	test("정리", () => {
		const { sceneName: _omit, settings: _s, ...rest } = base;
		const out = dramaRequestSchema.parse({
			...rest,
			speakers: [{ name: " 민지 ", voiceId: "v1" }],
			lines: [{ speaker: 0, direction: "[작게] 한숨", text: " 안녕 " }],
		});
		expect(out.lines[0]).toEqual({
			speaker: 0,
			direction: "작게 한숨",
			text: "안녕",
		});
		expect(out.speakers[0]?.name).toBe("민지");
		expect(out.sceneName).toBe("");
		expect(out.settings).toEqual(DRAMA_SETTINGS);
	});
});

describe("나머지 계약", () => {
	const id = "7d9f3a52-6c1e-4d0b-9a57-3b2f8e1c4a60";
	test("만들기 입력은 요청 id가 uuid", () => {
		expect(
			dramaCreateInputSchema.safeParse({ requestId: id, request: base })
				.success,
		).toBe(true);
		expect(
			dramaCreateInputSchema.safeParse({ requestId: "x", request: base })
				.success,
		).toBe(false);
	});
	test("결과·목록·조각 입력", () => {
		const result = {
			id,
			createdAt: "2026-10-22T00:00:00.000Z",
			usage: { unit: "free" as const, amount: 0 },
			bytes: 10,
			segments: null,
		};
		expect(dramaResultSchema.safeParse(result).success).toBe(true);
		expect(
			dramaResultSchema.safeParse({
				...result,
				segments: [{ start: 0, end: 1, cutStart: 0, cutEnd: 1 }],
			}).success,
		).toBe(true);
		expect(
			dramaResultSchema.safeParse({
				...result,
				segments: [{ start: -1, end: 1, cutStart: 0, cutEnd: 1 }],
			}).success,
		).toBe(false);
		expect(
			dramaItemSchema.safeParse({ ...result, status: "done", request: base })
				.success,
		).toBe(true);
		expect(
			dramaItemSchema.safeParse({ ...result, status: "x", request: base })
				.success,
		).toBe(false);
		expect(dramaAudioInputSchema.safeParse({ id, part: 10 }).success).toBe(
			true,
		);
		expect(dramaAudioInputSchema.safeParse({ id, part: 11 }).success).toBe(
			false,
		);
	});
});
