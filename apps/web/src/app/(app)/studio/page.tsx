import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@tts-pilot-app/ui/components/card";
import { ChevronRight } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "음성 작업실" };

// 열리지 않은 단계는 '준비 중'(사이트맵 "예외"). 단계를 여는 TASK가 href를 더한다.
const STEPS: { name: string; text: string; href?: Route }[] = [
	{ name: "채널", text: "영상 채널과 분류를 정해요", href: "/classes" },
	{ name: "성우", text: "공급자 성우를 듣고 골라요", href: "/casting" },
	{ name: "대본", text: "원문과 발음용 대본을 써요" },
	{ name: "검수", text: "생성 전에 숫자 발음을 확인해요" },
	{ name: "생성", text: "음성을 만들고 내려받아요" },
];

export default function StudioPage() {
	return (
		<>
			<PageHeader
				title="음성 작업실"
				description="대본과 성우를 골라 한국어 음성을 만들 곳이에요."
			/>
			<div className="flex flex-col gap-5 px-4 pb-10 md:px-11">
				<Card>
					<CardHeader>
						<CardTitle>
							<h2>음성을 만드는 순서</h2>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<ol className="flex flex-col gap-2 xl:flex-row">
							{STEPS.map((step, index) => {
								const body = (
									<>
										<p className="flex items-center gap-2 font-bold">
											<span className="tabular-nums">{index + 1}</span>
											<span className="group-hover:underline">{step.name}</span>
											{step.href ? null : (
												<span className="ml-auto font-normal text-muted-foreground text-xs">
													준비 중
												</span>
											)}
										</p>
										<p className="mt-1 text-muted-foreground text-sm">
											{step.text}
										</p>
									</>
								);
								return (
									<li
										key={step.name}
										className="flex flex-col gap-2 xl:flex-1 xl:flex-row xl:items-stretch"
									>
										{step.href ? (
											<Link
												href={step.href}
												className="group flex-1 rounded-xl bg-primary-subtle p-4 text-primary outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
											>
												{body}
											</Link>
										) : (
											<div className="flex-1 rounded-xl bg-muted p-4">
												{body}
											</div>
										)}
										{/* 순서는 번호 목록이 알린다. 화살표는 장식이다 */}
										{index < STEPS.length - 1 ? (
											<ChevronRight
												aria-hidden="true"
												className="size-4 shrink-0 rotate-90 self-center text-muted-foreground xl:rotate-0"
											/>
										) : null}
									</li>
								);
							})}
						</ol>
					</CardContent>
				</Card>
				<p className="text-muted-foreground">
					공급자 연결은{" "}
					<Link
						href="/connections"
						className="rounded-sm font-bold text-primary underline underline-offset-4 outline-offset-2 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-ring"
					>
						연결 상태
					</Link>
					에서 확인할 수 있어요.
				</p>
			</div>
		</>
	);
}
