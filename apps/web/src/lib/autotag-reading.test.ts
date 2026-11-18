import { afterEach, describe, expect, it, vi } from "vitest";

// AutoTag 참고 후보(T11 스펙 4절, 계획 결정 6). 패키지는 창을 열 때만 동적으로 불러오므로 모듈 mock으로 세 경우를 본다
const load = async () => (await import("./autotag-reading")).autoTagReadings;

afterEach(() => {
	vi.doUnmock("@neosapience/typecast-autotag");
	vi.resetModules();
});

describe("autoTagReadings", () => {
	it("성공: 항목마다 AutoTag 읽기를 돌려주고 원문과 같거나 빈 글이면 null", async () => {
		vi.doMock("@neosapience/typecast-autotag", () => ({
			autoTag: (text: string, options?: { language?: string }) => {
				expect(options?.language).toBe("ko");
				return text === "12,500원"
					? " 일만오천원 "
					: text === "010"
						? ""
						: text;
			},
		}));
		const autoTagReadings = await load();
		expect(await autoTagReadings(["12,500원", "3개", "010"])).toEqual([
			"일만오천원",
			null,
			null,
		]);
	});
	it("한 항목이 던지면 그 항목만 null이다", async () => {
		vi.doMock("@neosapience/typecast-autotag", () => ({
			autoTag: (text: string) => {
				if (text === "bad") throw new Error("boom");
				return `읽기 ${text}`;
			},
		}));
		const autoTagReadings = await load();
		expect(await autoTagReadings(["a1", "bad", "b2"])).toEqual([
			"읽기 a1",
			null,
			"읽기 b2",
		]);
	});
	it("같은 원문은 한 번만 변환하고 순서대로 돌려준다", async () => {
		const autoTag = vi.fn((text: string) => `읽기 ${text}`);
		vi.doMock("@neosapience/typecast-autotag", () => ({ autoTag }));
		const autoTagReadings = await load();
		expect(await autoTagReadings(["3개", "5분", "3개", "3개"])).toEqual([
			"읽기 3개",
			"읽기 5분",
			"읽기 3개",
			"읽기 3개",
		]);
		expect(autoTag).toHaveBeenCalledTimes(2);
	});
	it("불러오기 실패: 모두 null이고 앱이 console.error를 부르지 않는다", async () => {
		vi.doMock("@neosapience/typecast-autotag", () => {
			throw new Error("chunk failed");
		});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const autoTagReadings = await load();
		expect(await autoTagReadings(["1", "2"])).toEqual([null, null]);
		expect(error).not.toHaveBeenCalled();
		error.mockRestore();
	});
	it("항목이 없으면 패키지를 불러오지 않는다", async () => {
		const factory = vi.fn(() => ({ autoTag: (text: string) => text }));
		vi.doMock("@neosapience/typecast-autotag", factory);
		const autoTagReadings = await load();
		expect(await autoTagReadings([])).toEqual([]);
		expect(factory).not.toHaveBeenCalled();
	});
});
