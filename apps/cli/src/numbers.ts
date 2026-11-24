import { resolve } from "node:path";
import {
	applyCertain,
	decide,
	type Paragraph,
	reviewOf,
	spokenOf,
	type Work,
} from "@tts-pilot-app/api/paragraph-script";
import type { Args } from "./cli.js";
import { connect, input } from "./client.js";
import { checkOut, readInput, readJson, saveOr7 } from "./files.js";
import { clean, print, table } from "./output.js";
import { WORK_BYTES_MAX } from "./scripts.js";
import { resolveWork, sourceOf, workJson } from "./work.js";

// 글은 문단 하나로 본다(줄바꿈과 앞뒤 공백을 그대로 둔다). 작업은 문단 그대로다
async function load(args: Args): Promise<{ work: Work; text: boolean }> {
	const file = args.text("input");
	if (file === undefined) {
		const source = await sourceOf(args);
		const { work } =
			"work" in source
				? source
				: await resolveWork(source, await connect(args.url));
		return { work: { ...work, channelId: null } as Work, text: false };
	}
	if (args.text("work") !== undefined || args.text("script-id") !== undefined)
		throw input("--input, --work, --script-id 중 하나를 선택해 주세요.");
	const text = await readInput(file, WORK_BYTES_MAX);
	if (!text.trim()) throw input("대본이 비어 있습니다.");
	const paragraphs = [{ id: "input", text }];
	return {
		work: { defaultVoice: null, gap: 0, channelId: null, paragraphs },
		text: true,
	};
}

const itemsOf = (paragraphs: readonly Paragraph[]) =>
	paragraphs.flatMap((p, i) =>
		reviewOf(p).pairs.map(({ item, decision }) => ({
			paragraph: i + 1,
			...item,
			decision: decision && {
				choice: decision.choice,
				...(decision.reading === undefined
					? {}
					: { reading: decision.reading }),
			},
		})),
	);
const CHOICE_TEXT = { apply: "적용", keep: "원문대로", manual: "직접 입력" };

export async function numbersCheck(args: Args) {
	const { work } = await load(args);
	const items = itemsOf(work.paragraphs);
	const open = items.filter((item) => !item.decision);
	print(
		args.json,
		{
			items,
			unreviewed: open.length,
			needsCheck: open.filter((item) => item.needsCheck).length,
		},
		items.length
			? table(
					["문단", "위치", "원문", "종류", "제안", "확인 필요", "결정"],
					items.map((item) => [
						item.paragraph,
						item.start,
						item.original,
						item.kind,
						item.readings.join(" / ") || "없음",
						item.needsCheck ? `예(${item.reason ?? ""})` : "아니요",
						item.decision
							? `${CHOICE_TEXT[item.decision.choice]}${item.decision.reading ? ` ${item.decision.reading}` : ""}`
							: "없음",
					]),
				)
			: "검수할 숫자가 없습니다.",
	);
}

type Entry = {
	paragraph: number;
	start: number;
	original: string;
	choice: "apply" | "keep" | "manual";
	reading?: string;
};
const isEntry = (value: unknown): value is Entry => {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const { paragraph, start, original, choice, reading, ...rest } =
		value as Record<string, unknown>;
	return (
		Object.keys(rest).length === 0 &&
		Number.isInteger(paragraph) &&
		Number.isInteger(start) &&
		typeof original === "string" &&
		["apply", "keep", "manual"].includes(String(choice)) &&
		(reading === undefined || typeof reading === "string")
	);
};
// 결정 파일을 항목과 맞춘다. 하나라도 맞지 않으면 아무것도 바꾸지 않는다
function decided(paragraphs: readonly Paragraph[], value: unknown) {
	if (!Array.isArray(value))
		throw input("--decisions는 결정의 JSON 배열이어야 합니다.");
	const next = [...paragraphs];
	const seen = new Set<string>();
	const bad = value.flatMap((entry: unknown, i) => {
		if (!isEntry(entry)) return [`${i + 1}번째(모양)`];
		const { paragraph, start, original, choice, reading } = entry;
		const p = next[paragraph - 1];
		const item =
			p &&
			reviewOf(p).pairs.find(
				({ item }) => item.start === start && item.original === original,
			)?.item;
		const key = `${paragraph}:${start}`;
		const fits =
			choice === "keep"
				? reading === undefined
				: choice === "manual"
					? Boolean(reading?.trim())
					: item !== undefined &&
						item.readings.length > 0 &&
						(reading === undefined || item.readings.includes(reading));
		if (!p || !item || !fits || seen.has(key))
			return [`${i + 1}번째(문단 ${paragraph}의 ${start})`];
		seen.add(key);
		next[paragraph - 1] = decide(p, item, {
			choice,
			reading: choice === "apply" ? (reading ?? item.readings[0]) : reading,
		});
		return [];
	});
	if (bad.length)
		throw input(`항목과 맞지 않는 결정이 있습니다: ${bad.join(", ")}`);
	return next;
}

export async function numbersApply(args: Args) {
	const { json, text, flag } = args;
	const out = text("out") ?? "";
	const file = text("decisions");
	const certain = flag("certain");
	const overwrite = flag("overwrite");
	if (!certain && file === undefined)
		throw input("--certain이나 --decisions가 필요합니다.");
	checkOut(out, overwrite, [text("input") === undefined ? ".json" : ".txt"]);
	const { work, text: plain } = await load(args);
	const before = itemsOf(work.paragraphs).filter((item) => item.decision);
	let { paragraphs } = work;
	if (file !== undefined)
		paragraphs = decided(paragraphs, await readJson(file));
	if (certain) paragraphs = applyCertain(paragraphs);
	const items = itemsOf(paragraphs);
	const body = plain
		? Buffer.from(paragraphs.map(spokenOf).join(""))
		: workJson({ ...work, paragraphs });
	saveOr7(out, overwrite, body, "결과를 저장하지 못했습니다.");
	const count = items.filter((item) => item.decision).length;
	print(
		json,
		{
			out: resolve(out),
			decided: count,
			added: count - before.length,
			unreviewed: items.length - count,
		},
		`저장 ${clean(resolve(out))}\n결정한 숫자 ${count}개\n검수하지 않은 숫자 ${items.length - count}개`,
	);
}
