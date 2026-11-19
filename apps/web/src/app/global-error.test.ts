import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("../index.css", () => ({}));

import GlobalError from "./global-error";

// 루트 layout 밖이라 Providers가 없어 ThemeProvider로 다시 감싼다. 그 스크립트가 들어가는지 본다
test("next-themes 스크립트가 들어가 저장된 테마를 html에 입힌다", () => {
	const html = renderToStaticMarkup(
		createElement(GlobalError, {
			error: new Error("x"),
			retry: () => {},
		}),
	);
	expect(html).toContain("<html");
	expect(html).toContain('lang="ko"');
	expect(html).toContain("localStorage.getItem");
	expect(html).toContain("prefers-color-scheme");
});
