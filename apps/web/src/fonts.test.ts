import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

// vitest는 apps/web에서 돈다. 글꼴 CSS와 public 파일을 문자열로 확인한다.
const css = readFileSync(join(__dirname, "fonts.css"), "utf8");
const faces = css.match(/@font-face\s*{[^}]*}/g) ?? [];
const subsets = faces.filter((f) => f.includes("Pretendard Variable"));

test("Pretendard 서브셋 @font-face 92개가 unicode-range·swap·가변 굵기를 가진다", () => {
	expect(subsets).toHaveLength(92);
	for (const f of subsets) {
		expect(f).toMatch(/unicode-range:\s*U\+/);
		expect(f).toContain("font-display: swap");
		expect(f).toContain("font-weight: 45 920");
	}
});

test("서브셋 src는 /fonts/pretendard/ 0~91번 파일이고 파일이 실제로 있다", () => {
	for (let n = 0; n < 92; n++) {
		const name = `PretendardVariable.subset.${n}.woff2`;
		expect(css).toContain(`url(/fonts/pretendard/${name})`);
		expect(
			existsSync(join(__dirname, "../public/fonts/pretendard", name)),
		).toBe(true);
	}
});

test("폴백 @font-face와 --font-pretendard 선언이 있다", () => {
	expect(css).toContain('font-family: "Pretendard Fallback"');
	expect(css).toContain("size-adjust: 101.55%");
	expect(css).toMatch(
		/--font-pretendard:\s*"Pretendard Variable",\s*"Pretendard Fallback"/,
	);
});

test("글꼴을 index.css가 싣고 layout·global-error는 next/font를 쓰지 않는다", () => {
	expect(readFileSync(join(__dirname, "index.css"), "utf8")).toContain(
		'@import "./fonts.css"',
	);
	for (const f of ["layout.tsx", "global-error.tsx"]) {
		expect(readFileSync(join(__dirname, "app", f), "utf8")).not.toContain(
			"next/font",
		);
	}
});
