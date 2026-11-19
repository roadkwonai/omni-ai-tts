import { describe, expect, it } from "vitest";

import { isCurrentItem, playErrorKind } from "./use-sample-player";

const dom = (name: string) => new DOMException("x", name);

describe("playErrorKind(play() 거절 분류)", () => {
	it("다른 줄을 눌러 끊긴 로드(AbortError)는 실패가 아니다", () => {
		expect(playErrorKind(dom("AbortError"))).toBe("abort");
	});
	it("자동 재생 차단(NotAllowedError)은 실패가 아니라 '다시 눌러 주세요'다", () => {
		expect(playErrorKind(dom("NotAllowedError"))).toBe("blocked");
	});
	it("소리를 못 읽는 경우(NotSupportedError)는 error 이벤트가 알리므로 여기서 세지 않는다(이중 실패 방지)", () => {
		expect(playErrorKind(dom("NotSupportedError"))).toBe("unsupported");
	});
	it("그 밖의 오류는 실패로 센다", () => {
		expect(playErrorKind(dom("EncodingError"))).toBe("failed");
		expect(playErrorKind(new Error("x"))).toBe("failed");
	});
});

describe("isCurrentItem(늦게 온 실패 알림)", () => {
	const items = [
		{ id: "a", src: "/a.mp3" },
		{ id: "b", src: "/b.mp3" },
	];
	it("지금 재생 중인 줄의 실패만 센다", () => {
		expect(isCurrentItem(items[0], "a")).toBe(true);
	});
	it("이미 다음 줄로 넘어갔으면 앞 줄의 늦은 실패는 무시한다(다음 줄까지 실패 처리하지 않는다)", () => {
		expect(isCurrentItem(items[1], "a")).toBe(false);
		expect(isCurrentItem(undefined, "a")).toBe(false);
	});
});
