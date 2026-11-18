import type { Database } from "@tts-pilot-app/db";
import { user } from "@tts-pilot-app/db/schema/auth";
import { eq } from "drizzle-orm";

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

// 공개 데모(APP_MODE=demo, T15-a2)의 소유자: 세션 없이 OWNER_EMAILS 한 명의 user 행. 이메일은 서버 환경 값에서만 온다.
// 공급자·OpenAI 키가 하나라도 있으면 본인용에 데모 모드가 잘못 켜진 것으로 보고 닫는다(실제 데이터가 로그인 없이 열리지 않게).
export async function demoOwner(
	db: Database,
	raw: string | undefined,
	hasProviderKey: boolean,
): Promise<{ userId: string; email: string } | null> {
	if (hasProviderKey) return null;
	const { email } = ownerEmailFrom(raw);
	if (!email) return null;
	// Better Auth는 이메일을 소문자로 저장한다(owner:create도 정리한 값으로 만든다)
	const [row] = await db
		.select({ userId: user.id, email: user.email })
		.from(user)
		.where(eq(user.email, email))
		.limit(1);
	return row ?? null;
}
