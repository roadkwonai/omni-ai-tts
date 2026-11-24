import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

const seen = vi.hoisted(() => ({
	input: undefined as
		| { onChange: (event: unknown) => void; type?: string }
		| undefined,
}));
// DOM 렌더러가 없다: 그린 파일 칸의 props를 잡아 이벤트 처리기를 직접 부른다
vi.mock("react/jsx-dev-runtime", async (original) => {
	const { jsxDEV, ...rest } = await original<{
		jsxDEV: (type: unknown, props: never, ...rest: unknown[]) => unknown;
	}>();
	return {
		...rest,
		jsxDEV: (type: unknown, props: never, ...more: unknown[]) => {
			if (type === "input") seen.input = props;
			return jsxDEV(type, props, ...more);
		},
	};
});
vi.mock("@/lib/clone-audio", () => ({
	// 파일을 아직 푸는 중이다
	toCloneWav: () => new Promise(() => {}),
}));
vi.mock("@/lib/my-voice-text", () => import("../lib/my-voice-text"));
vi.mock("@/lib/my-voice-view", () => import("../lib/my-voice-view"));
vi.mock("@/lib/voice-view", () => import("../lib/voice-view"));
vi.mock("./sample-player", () => ({
	usePlayer: () => ({ stop: () => {}, version: () => 0 }),
	useSample: () => ({ status: "idle", toggle: () => {} }),
}));

const { AudioCapture } = await import("./audio-capture");

const onChange = vi.fn();
beforeEach(() => onChange.mockClear());
function pick(file: { size: number }) {
	renderToStaticMarkup(
		createElement(AudioCapture, {
			kind: "source",
			provider: "fish_audio",
			value: { wav: new Blob([]), seconds: 12 },
			onChange,
		}),
	);
	seen.input?.onChange({ target: { files: [file], value: "b.wav" } });
}

test("다른 파일을 고르면 푸는 동안 앞 원본이 비어 '다음'이 앞 원본을 쓰지 않는다(audit C2)", () => {
	expect(onChange).not.toHaveBeenCalled();
	pick(new Blob(["b"]));
	expect(onChange.mock.calls).toEqual([[null]]);
});

test("파일 고르기를 취소하면 앞 원본을 그대로 둔다", () => {
	pick(undefined as never);
	expect(onChange).not.toHaveBeenCalled();
});
