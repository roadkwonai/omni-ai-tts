import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

// 창을 그리는 도구가 없어 소스로 본다(studio-layout.test.ts와 같은 방식). 글 칸과 창을 한 파일에 두는 입력 창이 대상이다
const here = new URL("./", import.meta.url);
const sources = readdirSync(here)
	.filter((name) => name.endsWith(".tsx"))
	.map((name) => ({ name, src: readFileSync(new URL(name, here), "utf8") }))
	.filter(({ src }) => src.includes("<Textarea") && /<Dialog\s/.test(src));

test("여러 줄 글을 쓰는 창은 글이 있으면 바깥 누르기로 닫히지 않는다(DESIGN.md 입력 창)", () => {
	expect(sources.map(({ name }) => name)).toEqual(
		expect.arrayContaining([
			"drama-paste-dialog.tsx",
			"paragraph-paste-dialog.tsx",
		]),
	);
	// 글이 없을 때는 닫혀야 하므로 값은 상수가 아니라 조건식이다
	const loses = sources
		.filter(({ src }) => !/disablePointerDismissal=\{(?!true|false)/.test(src))
		.map(({ name }) => name);
	expect(loses).toEqual([]);
});
