import { MutationObserver, onlineManager } from "@tanstack/react-query";
import { afterEach, expect, test, vi } from "vitest";

import { getQueryClient } from "./orpc";

afterEach(() => {
	onlineManager.setOnline(true);
});

// 유료·상태 변경 요청이 오프라인에서 대기했다가 나중에 저절로 나가면 안 된다(T9-11)
test("오프라인에서 누른 변경은 바로 실패하고, 화면을 떠난 뒤 연결이 돌아와도 나가지 않는다", async () => {
	const send = vi.fn(async () => {
		throw new TypeError("Failed to fetch");
	});
	const queryClient = getQueryClient();
	queryClient.mount();
	onlineManager.setOnline(false);
	const observer = new MutationObserver(queryClient, { mutationFn: send });
	const leave = observer.subscribe(() => {});
	const settled = vi.fn();
	observer.mutate().then(settled, settled);
	await vi.waitFor(() => expect(settled).toHaveBeenCalledOnce());
	leave();
	const sent = send.mock.calls.length;
	onlineManager.setOnline(true);
	await queryClient.resumePausedMutations();
	expect(send).toHaveBeenCalledTimes(sent);
	queryClient.unmount();
});
