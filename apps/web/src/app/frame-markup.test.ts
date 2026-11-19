import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

// web vitest는 @/ 별칭을 풀지 못한다: 같은 모듈을 상대 경로로 돌려주고, 서버·세션은 가짜로 둔다
const h = vi.hoisted(() => ({
	owner: { state: "none" } as
		| { state: "none" }
		| { state: "denied"; email: string }
		| { state: "owner"; userId: string; email: string },
	env: { APP_MODE: "owner", BETTER_AUTH_URL: "http://localhost:3001" },
}));
vi.mock("@/context", () => ({ getOwnerSession: async () => h.owner }));
vi.mock("@/env.server", () => ({ ENV: h.env }));
vi.mock("@/lib/auth-client", () => ({
	signOutToLogin: vi.fn(),
	authClient: {},
}));
vi.mock("@/lib/safe-next", () => import("../lib/safe-next"));
vi.mock("@/lib/landing", () => import("../lib/landing"));
vi.mock("@/lib/landing-content", () => import("../lib/landing-content"));
vi.mock("@/lib/landing-faq", () => import("../lib/landing-faq"));
vi.mock("@/components/app-frame", () => import("../components/app-frame"));
vi.mock("@/components/page-header", () => import("../components/page-header"));
vi.mock("@/components/access-denied", () => ({ AccessDenied: () => null }));
vi.mock("@/components/login-form", () => ({
	LoginForm: () => createElement("form", { "data-login-form": "" }),
}));
vi.mock("next/navigation", async (original) => ({
	...(await original<typeof import("next/navigation")>()),
	usePathname: () => "/studio",
	redirect: (to: string) => {
		throw new Error(`REDIRECT:${to}`);
	},
}));
vi.mock(
	"@/components/landing/built",
	() => import("../components/landing/built"),
);
vi.mock(
	"@/components/landing/deliver-section",
	() => import("../components/landing/deliver-section"),
);
vi.mock(
	"@/components/landing/drama-section",
	() => import("../components/landing/drama-section"),
);
vi.mock(
	"@/components/landing/listen-section",
	() => import("../components/landing/listen-section"),
);
vi.mock(
	"@/components/landing/numbers-section",
	() => import("../components/landing/numbers-section"),
);
vi.mock(
	"@/components/landing/proof-band",
	() => import("../components/landing/proof-band"),
);
vi.mock(
	"@/components/landing/studio-section",
	() => import("../components/landing/studio-section"),
);
vi.mock(
	"@/components/landing/faq-section",
	() => import("../components/landing/faq-section"),
);
vi.mock(
	"@/components/landing/final-cta",
	() => import("../components/landing/final-cta"),
);
vi.mock(
	"@/components/landing/hero",
	() => import("../components/landing/hero"),
);
vi.mock(
	"@/components/landing/landing-bar",
	() => import("../components/landing/landing-bar"),
);
vi.mock(
	"@/components/landing/landing-footer",
	() => import("../components/landing/landing-footer"),
);
vi.mock(
	"@/components/landing/steps",
	() => import("../components/landing/steps"),
);
vi.mock(
	"@/components/landing/tagline",
	() => import("../components/landing/tagline"),
);
vi.mock(
	"@/components/landing/tour-section",
	() => import("../components/landing/tour-section"),
);

const owner = {
	state: "owner",
	userId: "u1",
	email: "me@example.com",
} as const;
const count = (html: string, pattern: RegExp) =>
	html.match(pattern)?.length ?? 0;

beforeEach(() => {
	h.owner = { state: "none" };
	h.env.APP_MODE = "owner";
});

async function render(
	load: () => Promise<{ default: unknown }>,
	props?: object,
) {
	const { default: Page } = await load();
	const element = await (Page as (p?: object) => Promise<React.ReactElement>)(
		props,
	);
	return renderToStaticMarkup(element);
}

async function home() {
	vi.resetModules();
	return render(() => import("./page"));
}

test("공개 데모 `/`: 예시 소유자여도 소개 페이지를 그리고 메뉴·로그인 링크가 없다", async () => {
	h.env.APP_MODE = "demo";
	h.owner = { state: "owner", userId: "u1", email: "" };
	const html = await home();
	expect(html).not.toContain('aria-label="주요 메뉴"');
	expect(html).not.toContain("/login");
	expect(html).toContain("데모 써 보기");
	expect(count(html, /<main[ >]/g)).toBe(1);
	// 막대(header)와 바닥(footer)은 main 밖: banner·contentinfo
	expect(html.indexOf("</header>")).toBeLessThan(html.indexOf("<main"));
	expect(html.indexOf("<footer")).toBeGreaterThan(html.indexOf("</main>"));
	// 섹션 순서(브리프 3절): 앵커가 이 차례로 있고 막대 메뉴 앵커가 모두 실제 섹션 id다
	const order = [
		"listen",
		"studio",
		"drama",
		"how",
		"tour",
		"built",
		"faq",
	].map((id) => html.indexOf(`id="${id}"`));
	expect(order.every((at) => at > 0)).toBe(true);
	expect([...order].sort((a, b) => a - b)).toEqual(order);
	expect(html.indexOf('id="hero-card"')).toBeLessThan(order[0] ?? 0);
	expect(html).toContain("같은 문장을 다섯 성우에게 읽혀 보세요");
	expect(html).not.toContain("다섯 목소리");
});

test("본인용 `/`는 소개 페이지 없이 소유자는 /studio, 아니면 /login으로 보낸다", async () => {
	h.owner = owner;
	await expect(home()).rejects.toThrow("REDIRECT:/studio");
	h.owner = { state: "none" };
	await expect(home()).rejects.toThrow("REDIRECT:/login");
});

async function login() {
	vi.resetModules();
	return render(() => import("./login/page"), {
		searchParams: Promise.resolve({}),
	});
}

test("로그인 판은 main 하나이고 폼을 그린다", async () => {
	const html = await login();
	expect(count(html, /<main[ >]/g)).toBe(1);
	expect(html).toContain('<main id="main-content"');
	expect(html).toContain("data-login-form");
});

test("공개 데모 로그인: 소유자는 /studio로, 소유자가 없으면(닫힘) 리다이렉트 없이 설정 오류 안내만 보인다", async () => {
	h.env.APP_MODE = "demo";
	h.owner = { state: "owner", userId: "u1", email: "" };
	await expect(login()).rejects.toThrow("REDIRECT:/studio");
	h.owner = { state: "none" };
	const html = await login();
	expect(html).toContain("공개 데모 설정 오류");
	expect(html).not.toContain("data-login-form");
	expect(count(html, /<main[ >]/g)).toBe(1);
});

async function notFound() {
	vi.resetModules();
	return render(() => import("./not-found"));
}

test("없는 주소: 소유자가 아니면 메뉴 없이 main 하나", async () => {
	const html = await notFound();
	expect(count(html, /<main[ >]/g)).toBe(1);
	expect(html).not.toContain('aria-label="주요 메뉴"');
	expect(html).toContain("페이지를 찾을 수 없어요");
});

test("없는 주소: 소유자에게는 앱 틀 안에서도 main이 하나(이중 main 없음)이고 이메일을 보인다", async () => {
	h.owner = owner;
	const html = await notFound();
	expect(count(html, /<main[ >]/g)).toBe(1);
	expect(html).toContain('aria-label="주요 메뉴"');
	expect(html).toContain("me@example.com");
	expect(html).not.toContain("공개 데모");
});

test("공개 데모 앱 틀: 머리 띠와 '공개 데모' 계정 줄이 있고 이메일·로그아웃은 없다(이메일을 클라이언트로 넘기지 않는다)", async () => {
	h.env.APP_MODE = "demo";
	// 예시 소유자 이메일이 실수로 들어와도 틀이 지운다
	h.owner = { state: "owner", userId: "u1", email: "demo@example.com" };
	const html = await notFound();
	expect(count(html, /<main[ >]/g)).toBe(1);
	expect(html).toContain("공개 데모 · 예시 데이터는 매일 처음 상태로 돌아가요");
	expect(html).not.toContain("demo@example.com");
	expect(html).not.toContain("로그아웃");
	expect(html).toMatch(/>공개 데모</);
});
