import { createAuthClient } from "better-auth/react";

// 같은 출처의 /api/auth를 쓴다
export const authClient = createAuthClient();

// 전체 이동이라 layout이 세션을 다시 판정한다
export async function signOutToLogin(): Promise<void> {
	const { error } = await authClient.signOut();
	if (error) throw new Error("sign-out failed");
	window.location.assign("/login");
}
