import { Slider } from "@tts-pilot-app/ui/components/slider";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

it("숫자 하나는 이름과 값 설명이 있는 슬라이더 손잡이 하나를 그린다", () => {
	const html = renderToStaticMarkup(
		createElement(Slider, {
			value: 0.5,
			step: 0.05,
			"aria-label": "안정성",
			getAriaValueText: (_, value) => `${value.toFixed(2)} 값`,
		}),
	);
	expect(html.match(/<input\b[^>]*type="range"/g)).toHaveLength(1);
	expect(html).toContain('aria-label="안정성"');
	expect(html).toContain('aria-valuetext="0.50 값"');
});
