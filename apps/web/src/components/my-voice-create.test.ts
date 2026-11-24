import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

const seen = vi.hoisted(() => ({
	dialog: undefined as
		| {
				open: boolean;
				disablePointerDismissal?: boolean;
				onOpenChange: (open: boolean) => void;
		  }
		| undefined,
}));
vi.mock("@tts-pilot-app/ui/components/dialog", () => {
	const pass = ({ children }: { children?: ReactNode }) => children;
	return {
		Dialog: (props: never) => {
			seen.dialog = props;
			return pass(props);
		},
		DialogContent: pass,
		DialogHeader: pass,
		DialogFooter: pass,
		DialogTitle: pass,
	};
});
vi.mock("@tanstack/react-query", () => ({
	useMutation: () => ({ isPending: false, mutate: () => {} }),
	useQueryClient: () => ({}),
}));
vi.mock("@/lib/connection-view", () => import("../lib/connection-view"));
vi.mock("@/lib/my-voice-text", () => import("../lib/my-voice-text"));
vi.mock("@/lib/my-voice-view", () => import("../lib/my-voice-view"));
vi.mock("@/lib/trial-view", () => import("../lib/trial-view"));
vi.mock("@/lib/voice-view", () => import("../lib/voice-view"));
vi.mock("@/utils/orpc", () => ({
	orpc: { myVoiceCreate: { mutationOptions: () => ({}) } },
}));
vi.mock("./audio-capture", () => ({ AudioCapture: () => null }));
vi.mock("./class-form-dialog", () => ({
	fieldClass: "",
	isComposingEnter: () => false,
}));
vi.mock("./dialog-close-button", () => ({
	DialogCloseButton: ({ label }: { label: string }) =>
		createElement("button", { type: "button" }, label),
}));
vi.mock("./voice-problem", () => ({
	lockedButton: () => "",
	useCooldown: () => null,
}));

const { MyVoiceCreate } = await import("./my-voice-create");

test("만들기 창은 바깥을 눌러도 닫히지 않아 녹음이 남는다(audit C6, T15b-07)", () => {
	const onOpenChange = vi.fn();
	const html = renderToStaticMarkup(
		createElement(MyVoiceCreate, {
			open: true,
			onOpenChange,
			providers: { fish_audio: true, gemini: true },
		}),
	);
	expect(seen.dialog?.disablePointerDismissal).toBe(true);
	// 닫기 버튼과 Esc(창이 부르는 onOpenChange)는 그대로다
	expect(html).toContain(">닫기</button>");
	seen.dialog?.onOpenChange(false);
	expect(onOpenChange).toHaveBeenCalledWith(false);
});
