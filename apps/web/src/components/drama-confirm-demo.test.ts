import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

// web vitest는 @/ 별칭을 풀지 못한다: 같은 모듈을 상대 경로로 돌려준다(drama-demo.test.ts와 같다)
vi.mock("@/lib/drama-view", () => import("../lib/drama-view"));
vi.mock("@/lib/classes-view", () => import("../lib/classes-view"));
vi.mock("@/lib/studio-view", () => import("../lib/studio-view"));
vi.mock("@/lib/trial-view", () => import("../lib/trial-view"));
vi.mock("@/lib/voice-view", () => import("../lib/voice-view"));

const pending = {
	request: {
		sceneName: "장면",
		model: "s2.1-pro",
		settings: { speed: 1, temperature: 0.7 },
		speakers: [{ name: "지연", voiceId: "f1" }],
		lines: [{ speaker: 0, direction: "", text: "안녕하세요." }],
	},
	requestId: "r1",
	opener: null,
	usage: { unit: "byte", amount: 1000 },
	bytes: 1000,
	unknownSame: false,
};
vi.mock("./drama-provider", () => ({
	useDrama: () => ({
		pending,
		savedVoices: [],
		cancel: () => {},
		confirm: () => {},
	}),
}));

// 서버 렌더에서는 팝업이 포털이라 비어 나온다: 창 부품을 자식만 그리는 껍데기로 바꾼다
vi.mock("@tts-pilot-app/ui/components/alert-dialog", () => {
	const shell = ({ children }: { children?: unknown }) =>
		createElement("div", null, children as never);
	return {
		AlertDialog: shell,
		AlertDialogAction: shell,
		AlertDialogCancel: shell,
		AlertDialogContent: shell,
		AlertDialogDescription: shell,
		AlertDialogFooter: shell,
		AlertDialogHeader: shell,
		AlertDialogTitle: shell,
	};
});

const { DemoProvider } = await import("./demo");
const { DramaConfirm } = await import("./drama-confirm");

const render = (demo: boolean) =>
	renderToStaticMarkup(
		createElement(DemoProvider, {
			demo,
			children: createElement(DramaConfirm),
		}),
	);

// 공개 데모의 장면 확인 창은 '$'·'요금'·'크레딧'이 없다. 본인용은 그대로 있다
test("데모 장면 확인 창에는 돈 말이 없고 본인용에는 있다", () => {
	const demoHtml = render(true);
	expect(demoHtml).toContain("데모 샘플로 만들까요?");
	expect(demoHtml).not.toMatch(/\$|요금|크레딧/);
	const ownHtml = render(false);
	expect(ownHtml).toContain("크레딧");
	expect(ownHtml).toMatch(/\$/);
});
