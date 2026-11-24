import type { OwnerSession } from "@/context";

// 소개 페이지는 공개 데모에만 있다(예시 소유자여도 그린다). 본인용은 소개 페이지 없이 소유자는 작업실로, 아니면 로그인으로 간다.
export function landingRedirect(
	state: OwnerSession["state"],
	mode: "owner" | "demo",
): "/studio" | "/login" | null {
	if (mode === "demo") return null;
	return state === "owner" ? "/studio" : "/login";
}
