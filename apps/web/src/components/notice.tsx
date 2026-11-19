"use client";

import { buttonVariants } from "@tts-pilot-app/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@tts-pilot-app/ui/components/empty";
import { LogIn, type LucideIcon } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

// 본문 자리의 안내 하나(세션 만료, 오류, 빈 상태). 제목은 h2(AF-05), 아래에 링크·버튼 묶음(children).
// 새로 나타나 알려야 하는 안내(오류 등)는 role="alert"를 넘긴다.
// compact: 행동 없는 안내를 머리 아래 한 줄 띠(primary-subtle)로 보인다(R2 브리프 4절 '연결 상태' 데모 안내). 링크·버튼(children)은 받지 않는다
export function Notice({
	icon: Icon,
	title,
	description,
	children,
	role,
	compact,
}: {
	icon?: LucideIcon;
	title: string;
	description?: ReactNode;
	children?: ReactNode;
	role?: "alert";
	compact?: boolean;
}) {
	if (compact)
		return (
			<div
				role={role}
				className="flex max-w-3xl items-start gap-3 break-keep rounded-xl bg-primary-subtle px-4 py-3 text-sm"
			>
				{Icon ? (
					<Icon
						aria-hidden="true"
						className="mt-0.5 size-4 shrink-0 fill-primary text-primary-foreground"
					/>
				) : null}
				<p>
					<strong className="font-bold">{title}</strong>
					{description ? (
						<>
							{" "}
							<span className="text-muted-foreground">{description}</span>
						</>
					) : null}
				</p>
			</div>
		);
	return (
		<Empty className="border bg-card" role={role}>
			<EmptyHeader>
				{Icon ? (
					<EmptyMedia variant="icon">
						<Icon aria-hidden="true" />
					</EmptyMedia>
				) : null}
				<EmptyTitle className="break-keep">{title}</EmptyTitle>
				{description ? (
					<EmptyDescription>{description}</EmptyDescription>
				) : null}
			</EmptyHeader>
			{children ? (
				<EmptyContent className="flex-row flex-wrap justify-center">
					{children}
				</EmptyContent>
			) : null}
		</Empty>
	);
}

// 세션이 끝나 protectedProcedure가 막은 화면의 안내(failureOf가 unauthorized일 때). 모든 화면이 같은 문구다.
export function SignInNotice() {
	const pathname = usePathname();
	const search = useSearchParams().toString();
	const next = search ? `${pathname}?${search}` : pathname;
	return (
		<Notice
			icon={LogIn}
			title="로그인이 풀렸어요"
			description="다시 로그인하면 이 화면으로 돌아와요."
		>
			{/* 일반 <a>: 전체 이동이어야 루트 layout이 다시 그려져 앱 틀이 남지 않는다 */}
			<a
				href={`/login?next=${encodeURIComponent(next)}`}
				className={buttonVariants({ size: "lg" })}
			>
				다시 로그인
			</a>
		</Notice>
	);
}
