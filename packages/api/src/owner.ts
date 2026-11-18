// 소유자는 세션 사용자 중 이메일이 OWNER_EMAILS의 이메일 한 개와 같은 계정이다(T14, ADR 0012). 클라이언트 입력으로 받지 않는다.
const normalize = (email: string) => email.trim().toLowerCase();

// 쉼표로 나누고 정리한 뒤 정확히 하나만 소유자 이메일이다. 비면 없음, 서로 다른 둘 이상이면 모두 거부(tooMany).
export function ownerEmailFrom(raw?: string): {
	email: string | null;
	tooMany: boolean;
} {
	const emails = [
		...new Set((raw ?? "").split(",").map(normalize).filter(Boolean)),
	];
	if (emails.length > 1) return { email: null, tooMany: true };
	return { email: emails[0] ?? null, tooMany: false };
}

export function ownerIdOf(
	user: { id: string; email: string } | null | undefined,
	raw: string | undefined,
): string | null {
	const { email } = ownerEmailFrom(raw);
	return user && email && normalize(user.email) === email ? user.id : null;
}
