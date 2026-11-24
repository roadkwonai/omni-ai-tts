import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const read = (path: string) =>
	readFileSync(new URL(path, import.meta.url), "utf8");
// 움직임 줄이기 블록만 잘라 본다(CSS라 문자열로 규칙 존재를 확인한다)
const reduced = (css: string) =>
	(
		css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g) ?? []
	).join("\n");

test("전역 움직임 줄이기는 전환을 투명도·색으로 거르고 진입·퇴장 이동·확대를 0으로 둔다", () => {
	const css = reduced(read("../../../../packages/ui/src/styles/globals.css"));
	expect(css).toMatch(
		/transition-property:\s*opacity, color, background-color/,
	);
	// 시간을 0.01ms로 강제하면 투명도 전환까지 지워진다
	expect(css).not.toContain("0.01ms");
	for (const name of ["enter", "exit"]) {
		expect(css).toContain(`--tw-${name}-translate-x: 0`);
		expect(css).toContain(`--tw-${name}-translate-y: 0`);
		expect(css).toContain(`--tw-${name}-scale: 1`);
	}
	for (const name of ["spin", "pulse", "ping", "bounce"])
		expect(css).toContain(`.animate-${name}`);
	expect(css).toContain("animation: none");
});

test("랜딩 움직임 줄이기는 이동 키프레임을 멈추고 투명도 크로스페이드(투어·reveal)를 지우지 않는다", () => {
	const css = reduced(read("./landing/landing.css"));
	expect(css).toContain(".landing-hero-in");
	expect(css).toContain("animation: none");
	// 숨김 상태를 풀지 않는다
	expect(css).not.toMatch(/opacity:\s*1/);
	expect(css).toContain("transition: opacity");
});
