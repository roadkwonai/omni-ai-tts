const HOME = "/studio";

// 로그인 뒤 이동 주소는 앱 안 경로만 받는다(열린 리다이렉트 방지). 아니면 /studio.
export function safeNext(raw: string | string[] | undefined): string {
	if (typeof raw !== "string" || !raw.startsWith("/")) return HOME;
	if (raw.startsWith("//") || raw.startsWith("/\\")) return HOME;
	if (raw.startsWith("/login")) return HOME;
	for (let i = 0; i < raw.length; i++) {
		const code = raw.charCodeAt(i);
		if (code < 0x20 || code === 0x7f) return HOME;
	}
	return raw;
}
