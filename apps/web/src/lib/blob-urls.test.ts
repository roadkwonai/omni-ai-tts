import { describe, expect, it, vi } from "vitest";

import { blobUrls } from "./blob-urls";

describe("blobUrls", () => {
	it("같은 id는 주소 하나, 지우면 해제, 비우면 모두 해제", () => {
		let n = 0;
		const create = vi.fn(() => {
			n += 1;
			return `blob:${n}`;
		});
		const revoke = vi.fn();
		const urls = blobUrls(create, revoke);
		const blob = new Blob(["x"]);
		expect(urls.ensure("a", blob)).toBe("blob:1");
		expect(urls.ensure("a", blob)).toBe("blob:1");
		expect(create).toHaveBeenCalledTimes(1);
		urls.ensure("b", blob);
		expect(revoke).toHaveBeenCalledWith("blob:1");
		expect(urls.get("a")).toBeUndefined();
		urls.forget("a");
		expect(revoke).toHaveBeenCalledWith("blob:1");
		expect(urls.get("a")).toBeUndefined();
		urls.clear();
		expect(revoke).toHaveBeenCalledWith("blob:2");
		expect(revoke).toHaveBeenCalledTimes(2);
	});
});
