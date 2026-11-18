import type { Database } from "@tts-pilot-app/db";
import {
	channel,
	classification,
} from "@tts-pilot-app/db/schema/classification";
import { myVoice } from "@tts-pilot-app/db/schema/my-voice";
import { voicePreset } from "@tts-pilot-app/db/schema/preset";
import { providerListCache } from "@tts-pilot-app/db/schema/provider-cache";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { script } from "@tts-pilot-app/db/schema/script";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { eq } from "drizzle-orm";

// 소유자 계정 만들기 스크립트(pnpm owner:create)의 핵심 함수(T14 스펙 6절). 가입은 막혀 있어 better-auth 내부 길로 만든다.

// 로그인 전(로컬 관리자 모드) 소유자 id. 앱 코드에서 이 문자열은 여기에만 둔다.
export const LEGACY_OWNER_ID = "local-admin";

// 계정은 로컬 DB에서만 만든다. 주소 값은 돌려주지도 찍지도 않는다.
export function isLocalDatabaseUrl(url: string): boolean {
	try {
		const u = new URL(url);
		// pg-connection-string은 쿼리의 host·hostaddr로 실제 접속 호스트를 바꾼다.
		if (u.searchParams.has("host") || u.searchParams.has("hostaddr"))
			return false;
		return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(u.hostname);
	} catch {
		return false;
	}
}

export function passwordProblem(a: string, b: string): string | null {
	if (a.length < 12) return "비밀번호는 12자 이상이어야 해요.";
	if (a.length > 128) return "비밀번호는 128자 이하여야 해요.";
	if (a !== b) return "두 번 입력한 비밀번호가 달라요.";
	return null;
}

// local-admin 소유 행을 새 계정 id로 옮기고 목록 캐시는 지운다. 한 트랜잭션이라 어느 표에서 실패해도 아무것도 바뀌지 않는다.
export function moveLocalAdminData(db: Database, userId: string) {
	return db.transaction(async (tx) => {
		const move = async (
			t:
				| typeof channel
				| typeof classification
				| typeof savedVoice
				| typeof voicePreset
				| typeof script
				| typeof trialGeneration
				| typeof myVoice,
		) =>
			(
				await tx
					.update(t)
					.set({ ownerId: userId })
					.where(eq(t.ownerId, LEGACY_OWNER_ID))
			).rowCount ?? 0;
		return {
			channel: await move(channel),
			classification: await move(classification),
			savedVoice: await move(savedVoice),
			voicePreset: await move(voicePreset),
			script: await move(script),
			trialGeneration: await move(trialGeneration),
			myVoice: await move(myVoice),
			providerListCacheDeleted:
				(
					await tx
						.delete(providerListCache)
						.where(eq(providerListCache.ownerId, LEGACY_OWNER_ID))
				).rowCount ?? 0,
		};
	});
}

// better-auth `await auth.$context`에서 쓰는 부분만. 테스트가 실패를 주입할 수 있다.
export type OwnerAuthContext = {
	password: { hash: (password: string) => Promise<string> };
	internalAdapter: {
		createUser: (
			user: { email: string; name: string; emailVerified: boolean },
			source: { method: "email-password" },
		) => Promise<{ id: string }>;
		linkAccount: (account: {
			userId: string;
			providerId: string;
			accountId: string;
			password: string;
		}) => Promise<unknown>;
		deleteUser: (userId: string) => Promise<void>;
	};
};

// 만든 계정을 지우지 못했다. 스크립트가 복구 절차(docs/owner-account.md)를 가리킨다.
export class OwnerCleanupError extends Error {
	readonly cleanupFailed = true;
	constructor(
		cause: unknown,
		readonly cleanupError: unknown,
	) {
		super(cause instanceof Error ? cause.message : String(cause), { cause });
		this.name = "OwnerCleanupError";
	}
}

// 가입 핸들러와 같은 순서(hash → createUser → linkAccount, better-auth 1.7.5 sign-up.mjs) 뒤에 이전. 계정과 이전은 함께 성공하거나 함께 실패한다.
// 이메일 형식·소유자 이메일·비밀번호 길이 검사는 부르는 쪽(스크립트)이 먼저 한다.
export async function createOwnerAccount(
	ctx: OwnerAuthContext,
	db: Database,
	input: { email: string; name: string; password: string },
) {
	const hash = await ctx.password.hash(input.password);
	const created = await ctx.internalAdapter.createUser(
		{ email: input.email, name: input.name, emailVerified: false },
		{ method: "email-password" },
	);
	try {
		await ctx.internalAdapter.linkAccount({
			userId: created.id,
			providerId: "credential",
			accountId: created.id,
			password: hash,
		});
		const moved = await moveLocalAdminData(db, created.id);
		return { userId: created.id, moved };
	} catch (error) {
		try {
			await ctx.internalAdapter.deleteUser(created.id);
		} catch (cleanupError) {
			throw new OwnerCleanupError(error, cleanupError);
		}
		throw error;
	}
}
