import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { EmptyState } from "./empty-state";

test("빈 상태: 장식 그림(alt 비움) + 제목 h2 + 설명 + 행동, 목록 카드와 같은 경계", () => {
	const html = renderToStaticMarkup(
		createElement(EmptyState, {
			art: "list",
			title: "아직 프리셋이 없어요",
			description: "설명 한 줄",
			children: createElement("a", { href: "/casting" }, "성우 캐스팅으로"),
		}),
	);
	expect(html).toMatch(/<img alt=""[^>]*empty-list\.png/);
	expect(html).toMatch(/<h2[^>]*>아직 프리셋이 없어요<\/h2>/);
	expect(html).toContain("설명 한 줄");
	expect(html).toContain('href="/casting"');
	expect(html).toContain("rounded-2xl");
	expect(html).toContain("ring-1");
});
