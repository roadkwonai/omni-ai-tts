// apps/web/src/components/drama-read-confirm.tsx
"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@tts-pilot-app/ui/components/alert-dialog";
import { Coins } from "lucide-react";
import { type RefObject, useRef, useState } from "react";

import type { ReadSummary } from "@/lib/drama-read";
import { DRAMA_TEXT } from "@/lib/drama-view";

import { useDramaRead } from "./drama-read";

// 읽기 확인 창(브리프 14절, 스펙 14.2 '확인'). 새로 만들 줄 중 유료이거나 미확인으로 끝났던 줄이 있으면 읽기·받기가 confirm 단계에서 연다.
// 모양은 드라마 확인 창(drama-confirm)과 같다: 첫 포커스 '취소', 바깥 누르기로 닫히지 않음. 닫히면(취소·Esc·확인) 연 버튼(opener)으로 돌아간다.
// 받기도 같은 창·같은 셈이고 확인 버튼 글만 '받기'다(브리프 16절 4)
// 확인은 리듀서가 confirm 단계에서 한 번만 받는다. 버튼도 누른 뒤 잠근다(렌더를 기다리지 않는 sentRef)
export function DramaReadConfirm() {
	const read = useDramaRead();
	const cancelRef = useRef<HTMLButtonElement>(null);
	const { summary, opener } = read;
	return (
		<AlertDialog
			open={read.state.phase === "confirm" && summary !== null}
			onOpenChange={(open) => {
				if (!open) read.cancel();
			}}
		>
			{summary ? (
				<AlertDialogContent
					initialFocus={cancelRef}
					finalFocus={() => opener ?? true}
				>
					{/* 읽기마다 새로 그린다(누른 상태를 다음 읽기로 넘기지 않는다) */}
					<ConfirmBody
						key={read.state.run}
						summary={summary}
						go={
							read.state.mode === "save"
								? DRAMA_TEXT.saveConfirmGo
								: DRAMA_TEXT.readConfirmGo
						}
						cancelRef={cancelRef}
						onConfirm={read.confirm}
					/>
				</AlertDialogContent>
			) : null}
		</AlertDialog>
	);
}

function ConfirmBody({
	summary,
	go,
	cancelRef,
	onConfirm,
}: {
	summary: ReadSummary;
	go: string;
	cancelRef: RefObject<HTMLButtonElement | null>;
	onConfirm: () => void;
}) {
	const [sent, setSent] = useState(false);
	const sentRef = useRef(false);
	const paid = summary.paid.length > 0;
	return (
		<>
			<AlertDialogHeader>
				<AlertDialogTitle>{DRAMA_TEXT.readConfirmTitle}</AlertDialogTitle>
			</AlertDialogHeader>
			{/* 설명 안이라 창을 열 때 공급자별 줄도 함께 읽힌다(drama-confirm과 같다) */}
			<AlertDialogDescription
				render={<div />}
				className="flex flex-col gap-3 text-foreground"
			>
				<p className="text-muted-foreground">
					{DRAMA_TEXT.readConfirmBody(summary.make, summary.reuse)}
				</p>
				{paid ? (
					<ul className="flex flex-col gap-2 text-sm tabular-nums">
						{summary.paid.map((row) => (
							<li key={row.provider} className="flex gap-1.5">
								<Coins
									aria-hidden="true"
									className="mt-0.5 size-4 shrink-0 text-warning"
								/>
								<span className="wrap-anywhere min-w-0">
									{DRAMA_TEXT.readConfirmRow(
										row.provider,
										row.lines,
										row.chars,
										row.usage,
									)}
									{/* T5 확인 창(trial-confirm)과 같은 글: 배율을 받지 못해 1로 셌다 */}
									{row.rateMissing ? (
										<span className="text-muted-foreground">
											{" "}
											(배율을 확인하지 못했어요)
										</span>
									) : null}
								</span>
							</li>
						))}
					</ul>
				) : null}
			</AlertDialogDescription>
			<AlertDialogFooter>
				<AlertDialogCancel ref={cancelRef} size="lg">
					{DRAMA_TEXT.cancel}
				</AlertDialogCancel>
				<AlertDialogAction
					size="lg"
					disabled={sent}
					onClick={() => {
						if (sentRef.current) return;
						sentRef.current = true;
						setSent(true);
						onConfirm();
					}}
				>
					{/* 유료 줄이 있을 때만 표식(미확인 무료 줄만이면 크레딧이 들지 않는다). 채운 청록 버튼 안은 글자색(DESIGN.md) */}
					{paid ? <Coins data-icon="inline-start" aria-hidden="true" /> : null}
					{go}
				</AlertDialogAction>
			</AlertDialogFooter>
		</>
	);
}
