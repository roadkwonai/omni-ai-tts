import { randomUUID } from "node:crypto";
import { isBlank, splitBlocks } from "@tts-pilot-app/api/paragraph-script";
import type { ScriptWorkValue } from "@tts-pilot-app/api/script-contract";
import { input } from "./client.js";

export type Work = ScriptWorkValue;
type Paragraph = Work["paragraphs"][number];

const hasSetup = ({ gap, voice, speaker, fixes }: Paragraph) =>
	[gap, voice, speaker, fixes].some((value) => value !== undefined);
const created = (text: string): Paragraph => ({ id: randomUUID(), text });

// 비지 않은 문단을 빈 줄로 이은 글
export const workText = ({ paragraphs }: Pick<Work, "paragraphs">) =>
	paragraphs
		.map(({ text }) => text)
		.filter((text) => !isBlank(text))
		.join("\n\n");

export const newWork = (
	raw: string,
	defaultVoice: Work["defaultVoice"],
): Work => ({
	defaultVoice,
	gap: 0.5,
	paragraphs: splitBlocks(raw).map(created),
});

// 글이 같은 문단을 순서대로 가장 많이 잇고 나머지는 새 문단으로 둔다. lost는 잃는 '설정이 있는 문단' 수다.
// shortcut: 문단 수 × 글 조각 수의 표를 만든다. 대본 상한(200문단)에서는 충분하고, 상한이 크게 늘면 Myers diff로 바꾼다
export function mergeText(
	work: Work,
	raw: string,
): { work: Work; lost: number } {
	const blocks = splitBlocks(raw);
	// 문단은 200개까지다(서버). 빈 줄을 품은 문단을 넉넉히 감안한 표의 상한
	if (blocks.length > 20_000)
		throw input("대본이 너무 잘게 나뉩니다. 문단은 200개까지입니다.");
	const kept: { paragraph: Paragraph; pieces: string[] }[] = [];
	// blanks[k]는 k번째 비지 않은 문단 바로 앞의 빈 문단들이다(마지막은 끝의 빈 문단)
	const blanks: Paragraph[][] = [[]];
	for (const paragraph of work.paragraphs)
		if (isBlank(paragraph.text)) blanks.at(-1)?.push(paragraph);
		else {
			// 빈 줄을 품은 문단은 글에서 여러 조각이다
			kept.push({ paragraph, pieces: splitBlocks(paragraph.text) });
			blanks.push([]);
		}
	// best[i][j]: i번째 문단부터와 j번째 조각부터를 이을 때 남는 문단 수
	const best = Array.from(
		{ length: kept.length + 1 },
		() => new Uint16Array(blocks.length + 1),
	);
	const at = (i: number, j: number) => best[i]?.[j] ?? 0;
	const fits = (i: number, j: number) => {
		const pieces = kept[i]?.pieces ?? [];
		return pieces.every((piece, n) => blocks[j + n] === piece)
			? pieces.length
			: 0;
	};
	for (let i = kept.length - 1; i >= 0; i -= 1)
		for (let j = blocks.length - 1; j >= 0; j -= 1) {
			const size = fits(i, j);
			const row = best[i];
			if (row)
				row[j] = Math.max(
					at(i + 1, j),
					at(i, j + 1),
					size ? 1 + at(i + 1, j + size) : 0,
				);
		}
	const paragraphs: Paragraph[] = [];
	// 바로 앞에 이은 문단의 차례. 새 문단 뒤에는 없다
	let last: number | undefined = -1;
	let i = 0;
	let j = 0;
	while (j < blocks.length) {
		const item = kept[i];
		const size = item ? fits(i, j) : 0;
		if (item && size && at(i, j) === 1 + at(i + 1, j + size)) {
			if (last === i - 1) paragraphs.push(...(blanks[i] ?? []));
			paragraphs.push(item.paragraph);
			last = i;
			i += 1;
			j += size;
		} else if (item && at(i, j) === at(i + 1, j)) i += 1;
		else {
			paragraphs.push(created(blocks[j] ?? ""));
			last = undefined;
			j += 1;
		}
	}
	if (last === kept.length - 1) paragraphs.push(...(blanks.at(-1) ?? []));
	const ids = new Set(paragraphs.map(({ id }) => id));
	const lost = work.paragraphs.filter(
		(paragraph) => hasSetup(paragraph) && !ids.has(paragraph.id),
	).length;
	return { work: { ...work, paragraphs }, lost };
}
