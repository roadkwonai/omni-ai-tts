import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
	applyCertain,
	type Paragraph,
	spokenOf,
} from "@tts-pilot-app/api/paragraph-script";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type serve, spawnCli, studioWorld, workspace } from "./harness.js";

let w: ReturnType<typeof studioWorld>;
let ws: ReturnType<typeof workspace>;
let server: Awaited<ReturnType<typeof serve>>;
beforeEach(async () => {
	w = studioWorld();
	server = await w.serve();
	ws = workspace(server.origin);
});
afterEach(() => {
	server.close();
	ws.remove();
});
const run = (args: string[], input?: string) =>
	spawnCli(ws.dir, args, input).done;
const json = (result: { out: string }) => {
	expect(result.out.trim().split("\n")).toHaveLength(1);
	return JSON.parse(result.out);
};
const PARAGRAPHS = [
	{ id: "a", text: "사과 3개와 배 2개" },
	{ id: "b", text: "점수는 3-5입니다" },
	{ id: "c", text: "숫자 없음" },
];
const work = (paragraphs: object[] = PARAGRAPHS) =>
	ws.script(
		JSON.stringify({ defaultVoice: null, gap: 0.5, paragraphs }),
		"work.json",
	);
const apply = (...extra: string[]) => [
	...["numbers", "apply", "--work", work(), "--out", ws.path("out.json")],
	...["--json", ...extra],
];
const decisions = (value: unknown) =>
	ws.script(JSON.stringify(value), "decisions.json");
type Item = {
	paragraph: number;
	start: number;
	original: string;
	readings: string[];
	needsCheck: boolean;
	decision: { choice: string } | null;
};

describe("숫자 검수", { timeout: 60_000 }, () => {
	it("글과 작업의 항목을 보이고 서버를 부르지 않는다", async () => {
		const result = await run(["numbers", "check", "--work", work(), "--json"]);
		expect(result.code).toBe(0);
		const { items, unreviewed, needsCheck } = json(result) as {
			items: Item[];
			unreviewed: number;
			needsCheck: number;
		};
		expect(items.map((item) => [item.paragraph, item.original])).toEqual([
			[1, "3개"],
			[1, "2개"],
			[2, "3-5"],
		]);
		expect(items[0]).toMatchObject({
			start: 3,
			kind: "count",
			readings: ["세 개"],
			needsCheck: false,
			decision: null,
		});
		expect(items[2]).toMatchObject({ needsCheck: true });
		expect(unreviewed).toBe(3);
		expect(needsCheck).toBe(1);
		const stdin = await run(
			["numbers", "check", "--input", "-"],
			"사과 3개\n\n배 2개",
		);
		expect(stdin.code).toBe(0);
		expect(stdin.out).toContain("3개");
		expect(stdin.out).toContain("세 개");
		expect(w.calls).toEqual([]);
	});

	it("--certain은 웹 '확실한 것 모두 적용'과 같고 글은 발음용 대본이 된다", async () => {
		expect((await run(apply("--certain"))).code).toBe(0);
		const saved = JSON.parse(readFileSync(ws.path("out.json"), "utf8"));
		expect(saved.paragraphs).toEqual(applyCertain(PARAGRAPHS as Paragraph[]));
		expect(Object.keys(saved).sort()).toEqual([
			"defaultVoice",
			"gap",
			"paragraphs",
		]);
		const raw = "사과 3개와 점수 3-5\r\n\r\n 배 2개 \n";
		const text = await run([
			...["numbers", "apply", "--input", ws.script(raw), "--certain"],
			...["--out", ws.path("out.txt"), "--json"],
		]);
		expect(text.code).toBe(0);
		expect(json(text)).toMatchObject({ decided: 2, unreviewed: 1 });
		const body = readFileSync(ws.path("out.txt"), "utf8");
		expect(body).toBe("사과 세 개와 점수 3-5\r\n\r\n 배 두 개 \n");
		const [p] = applyCertain([{ id: "t", text: raw }]);
		expect(p && spokenOf(p)).toBe(body);
		// 다시 검수하면 결정이 보인다
		const again = json(
			await run(["numbers", "check", "--work", ws.path("out.json"), "--json"]),
		);
		expect(again.items[0].decision).toEqual({
			choice: "apply",
			reading: "세 개",
		});
		expect(again.unreviewed).toBe(1);
		expect(w.calls).toEqual([]);
	});

	it("--decisions는 고른 항목만 바꾸고 --certain과 함께 쓸 수 있다", async () => {
		const result = await run(
			apply(
				"--decisions",
				decisions([
					{ paragraph: 1, start: 3, original: "3개", choice: "keep" },
					{
						paragraph: 2,
						start: 4,
						original: "3-5",
						choice: "manual",
						reading: " 삼 대 오 ",
					},
				]),
				"--certain",
			),
		);
		expect(result.code).toBe(0);
		expect(json(result)).toMatchObject({ decided: 3, added: 3, unreviewed: 0 });
		const { paragraphs } = JSON.parse(
			readFileSync(ws.path("out.json"), "utf8"),
		);
		expect(paragraphs.map(spokenOf)).toEqual([
			"사과 3개와 배 두 개",
			"점수는 삼 대 오입니다",
			"숫자 없음",
		]);
	});

	it.each([
		["배열이 아님", {}],
		[
			"없는 문단",
			[{ paragraph: 4, start: 0, original: "3개", choice: "keep" }],
		],
		[
			"다른 위치",
			[{ paragraph: 1, start: 2, original: "3개", choice: "keep" }],
		],
		["다른 원문", [{ paragraph: 1, start: 3, original: "3", choice: "keep" }]],
		["모르는 선택", [{ paragraph: 1, start: 3, original: "3개", choice: "x" }]],
		[
			"모르는 칸",
			[{ paragraph: 1, start: 3, original: "3개", choice: "keep", x: 1 }],
		],
		[
			"빈 직접 입력",
			[
				{
					paragraph: 1,
					start: 3,
					original: "3개",
					choice: "manual",
					reading: " ",
				},
			],
		],
		[
			"제안에 없는 읽기",
			[
				{
					paragraph: 1,
					start: 3,
					original: "3개",
					choice: "apply",
					reading: "삼 개",
				},
			],
		],
		[
			"원문대로에 읽기",
			[
				{
					paragraph: 1,
					start: 3,
					original: "3개",
					choice: "keep",
					reading: "세 개",
				},
			],
		],
		[
			"같은 항목 두 번",
			[
				{ paragraph: 1, start: 3, original: "3개", choice: "keep" },
				{ paragraph: 1, start: 3, original: "3개", choice: "apply" },
			],
		],
	])("항목과 맞지 않는 결정(%s)은 2이고 파일 0개다", async (_name, value) => {
		const result = await run(apply("--decisions", decisions(value)));
		expect(result.code).toBe(2);
		expect(existsSync(ws.path("out.json"))).toBe(false);
	});

	it("입력과 출력의 조합을 검사한다", async () => {
		const text = ws.script("3개");
		for (const args of [
			["numbers", "check"],
			["numbers", "check", "--input", text, "--work", work()],
			["numbers", "apply", "--input", text, "--out", ws.path("a.txt")],
			[
				...["numbers", "apply", "--input", text, "--certain"],
				...["--out", ws.path("a.json")],
			],
			[
				...["numbers", "apply", "--work", work(), "--certain"],
				...["--out", ws.path("a.txt")],
			],
			["numbers", "check", "--input", ws.script(" \n", "blank.txt")],
		])
			expect((await run(args)).code).toBe(2);
		writeFileSync(ws.path("out.json"), "있음");
		expect((await run(apply("--certain"))).code).toBe(2);
		expect(readFileSync(ws.path("out.json"), "utf8")).toBe("있음");
		expect((await run(apply("--certain", "--overwrite"))).code).toBe(0);
	});

	it("--script-id는 대본만 읽는다", async () => {
		const id = "22222222-2222-4222-8222-222222222222";
		w.scripts = [
			{ id, work: { defaultVoice: null, gap: 0.5, paragraphs: PARAGRAPHS } },
		];
		const result = await run([
			...["numbers", "apply", "--script-id", id, "--certain"],
			...["--out", ws.path("out.json"), "--json"],
		]);
		expect(result.code).toBe(0);
		expect(w.calls).toEqual(["savedVoiceList", "scriptGet"]);
	});
});
