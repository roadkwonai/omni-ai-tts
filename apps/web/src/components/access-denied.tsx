"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { useState } from "react";

import { signOutToLogin } from "@/lib/auth-client";

// 접근 권한 없음 판의 본문(브리프 3절). 판(Card)과 로고는 login/page.tsx가 감싼다.
export function AccessDenied({ email }: { email: string }) {
	const [pending, setPending] = useState(false);
	const [failed, setFailed] = useState(false);

	async function logout() {
		if (pending) return;
		setPending(true);
		setFailed(false);
		try {
			await signOutToLogin();
		} catch {
			setFailed(true);
			setPending(false);
		}
	}

	return (
		<>
			<h2 className="break-keep font-bold text-lg">접근 권한 없음</h2>
			<p className="text-muted-foreground text-sm">
				<b className="break-all font-bold text-foreground">{email}</b> 계정은 이
				작업실을 쓸 수 없어요.
			</p>
			<p className="text-muted-foreground text-sm">
				작업실 주인 계정으로 다시 로그인해 주세요.
			</p>
			{failed ? (
				<p role="alert" className="text-sm text-warning">
					로그아웃하지 못했어요. 다시 시도해 주세요.
				</p>
			) : null}
			<Button
				type="button"
				variant="neutral"
				size="lg"
				className="w-full"
				disabled={pending}
				onClick={logout}
			>
				{pending ? (
					<>
						<Spinner data-icon="inline-start" aria-hidden />
						로그아웃 중…
					</>
				) : (
					"다른 계정으로 로그인"
				)}
			</Button>
		</>
	);
}
