import {
	Card,
	CardContent,
	CardHeader,
} from "@tts-pilot-app/ui/components/card";
import type { Metadata, Route } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/access-denied";
import { LoginForm } from "@/components/login-form";
import { getOwnerSession } from "@/context";
import { ENV } from "@/env.server";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "로그인" };

// 로그인 판과 접근 권한 없음 판(스펙 5.1·5.3). 메뉴 없는 빈 바탕 위 판 하나이고, 두 판의 겉모양(Card + 글자 로고)은 여기서 감싼다.
export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ next?: string | string[] }>;
}) {
	const [owner, { next: rawNext }] = await Promise.all([
		getOwnerSession(),
		searchParams,
	]);
	const next = safeNext(rawNext);
	// safeNext가 앱 안 경로만 돌려주므로 typedRoutes의 Route로 좁혀도 안전하다
	if (owner.state === "owner") redirect(next as Route);
	// 공개 데모인데 소유자가 없다 = 키가 남아 데모가 닫힌 상태. 리다이렉트하면 /studio와 서로 보내 반복하므로 고정 안내만 보인다
	const demoClosed = ENV.APP_MODE === "demo";

	return (
		// 390px는 위쪽에 붙고(키보드가 올라와도 버튼이 가려지지 않게), 넓은 화면은 가운데보다 조금 위
		<main
			id="main-content"
			className="flex min-h-svh justify-center px-4 pt-16 pb-10 md:items-center md:pt-10 md:pb-32"
		>
			<Card className="h-fit w-full max-w-90 rounded-2xl">
				<CardHeader>
					<h1
						translate="no"
						className="flex items-center gap-3 font-bold text-2xl tracking-tight"
					>
						<Image
							src="/brand/logo-symbol.png"
							alt=""
							width={40}
							height={40}
							className="size-10 rounded-lg dark:bg-foreground"
						/>
						Omni AI TTS
					</h1>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{demoClosed ? (
						<>
							<p className="break-keep font-bold">공개 데모 설정 오류</p>
							<p className="break-keep text-muted-foreground text-sm">
								지금은 데모를 열 수 없어요. 잠시 뒤 다시 와 주세요.
							</p>
						</>
					) : owner.state === "denied" ? (
						<AccessDenied email={owner.email} />
					) : (
						<>
							<p className="text-muted-foreground text-sm">
								본인 계정으로 로그인해 주세요.
							</p>
							<LoginForm
								next={next}
								origin={new URL(ENV.BETTER_AUTH_URL).origin}
							/>
						</>
					)}
				</CardContent>
			</Card>
		</main>
	);
}
