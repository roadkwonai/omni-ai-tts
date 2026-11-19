"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import { Input } from "@tts-pilot-app/ui/components/input";
import { Label } from "@tts-pilot-app/ui/components/label";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { type FormEvent, useId, useRef, useState } from "react";

import { authClient } from "@/lib/auth-client";

import { fieldClass } from "./class-form-dialog";

const LABEL = "font-bold text-sm";

// 실패 상태 → 문구(스펙 5.1). 401·400은 계정이 있는지 드러내지 않는 같은 문구다.
function problemOf(status: number | undefined, origin: string): string {
	if (status === 401 || status === 400) {
		return "이메일이나 비밀번호가 맞지 않아요";
	}
	if (status === 429) return "잠시 뒤 다시 시도해 주세요";
	if (status === 403) {
		return `이 주소에서는 로그인할 수 없어요. ${origin}로 열어 주세요.`;
	}
	return "로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
}

// 로그인 판의 본문(브리프 3절). 판(Card)과 로고는 login/page.tsx가 감싼다.
// origin은 BETTER_AUTH_URL의 출처(비밀값 아님)로, 개발 주소가 다를 때의 안내에 쓴다.
export function LoginForm({ next, origin }: { next: string; origin: string }) {
	const [pending, setPending] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);
	const passwordRef = useRef<HTMLInputElement>(null);
	const problemId = useId();
	const invalidProps = problem
		? { "aria-invalid": true, "aria-describedby": problemId }
		: {};

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (pending) return;
		const form = new FormData(event.currentTarget);
		setPending(true);
		setProblem(null);
		let status: number | undefined;
		try {
			const { error } = await authClient.signIn.email({
				email: String(form.get("email") ?? "").trim(),
				password: String(form.get("password") ?? ""),
			});
			if (!error) {
				// 전체 이동이라 layout이 새 세션으로 다시 판정한다
				window.location.assign(next);
				return;
			}
			status = error.status;
		} catch {
			// 네트워크 오류 등: 일반 문구
		}
		setProblem(problemOf(status, origin));
		setPending(false);
		if (passwordRef.current) {
			passwordRef.current.value = "";
			passwordRef.current.focus();
		}
	}

	return (
		<form onSubmit={submit} className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<Label htmlFor="login-email" className={LABEL}>
					이메일
				</Label>
				<Input
					id="login-email"
					name="email"
					type="email"
					autoComplete="username"
					autoFocus
					spellCheck={false}
					required
					className={fieldClass}
					{...invalidProps}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="login-password" className={LABEL}>
					비밀번호
				</Label>
				<Input
					ref={passwordRef}
					id="login-password"
					name="password"
					type="password"
					autoComplete="current-password"
					required
					className={fieldClass}
					{...invalidProps}
				/>
			</div>
			{problem ? (
				<p
					id={problemId}
					role="alert"
					className="break-keep text-sm text-warning"
				>
					{problem}
				</p>
			) : null}
			{/* bg-clip-border: 투명 1px 테두리까지 채워 입력과 바깥 폭을 맞춘다 */}
			<Button
				type="submit"
				size="lg"
				className="w-full bg-clip-border"
				disabled={pending}
			>
				{pending ? (
					<>
						<Spinner data-icon="inline-start" aria-hidden />
						로그인 중…
					</>
				) : (
					"로그인"
				)}
			</Button>
		</form>
	);
}
