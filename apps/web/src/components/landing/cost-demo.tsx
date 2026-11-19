"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { useRef, useState } from "react";

import { COST } from "@/lib/landing-content";

import { ConfirmDialog } from "../confirm-dialog";

// 장면 6 비용 재현(브리프 3·5절): 서버를 부르지 않는 가짜 화면. 앱의 ConfirmDialog를 그대로 쓰되 보내기는 로컬 상태만 바꾼다.
// 위의 원장(호출 합계)은 누르기 전부터 '호출 0 · 크레딧 0'으로 보이고, 확인하면 호출 1로 오른다. 같은 문단이 둘이라 첫째는 호출 1(새로 만듦), 둘째는 호출 0(저장된 결과)이다.
// 숫자가 바뀔 때는 투명도·아래에서 살짝 올라오는 진입만 쓴다(key로 다시 그림, 움직임 줄이기에서는 투명도만). '다시 해 보기'로 처음 상태로 돌아간다
type Phase = "idle" | "confirming" | "done";

// 숫자 하나가 바뀌면 새로 올라온다
function Count({ n, className }: { n: number; className?: string }) {
	return (
		<span
			key={n}
			className={cn(
				"fade-in-0 slide-in-from-bottom-1 inline-block animate-in font-bold tabular-nums duration-200 ease-out",
				className,
			)}
		>
			{n}
		</span>
	);
}

export function CostDemo() {
	const [phase, setPhase] = useState<Phase>("idle");
	const buttonRef = useRef<HTMLButtonElement>(null);
	const done = phase === "done";
	const calls = done ? 1 : 0;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-end justify-between gap-4 rounded-2xl bg-card p-4 ring-1 ring-border ring-inset">
				<div className="flex flex-col">
					<span className="text-muted-foreground text-sm">
						{COST.ledgerLabel}
					</span>
					<p className="flex items-baseline gap-2">
						<span className="font-bold text-lg">{COST.callWord}</span>
						<Count n={calls} className="text-5xl" />
					</p>
				</div>
				<p className="text-pretty break-keep text-right text-muted-foreground text-sm">
					{done ? COST.ledgerDone : COST.ledgerIdle}
				</p>
			</div>
			<ol className="flex flex-col gap-3">
				{COST.paragraphs.map((text, index) => (
					<li
						key={index}
						className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border ring-inset"
					>
						<div className="flex items-baseline gap-3">
							<span className="min-w-6 font-bold text-muted-foreground text-sm tabular-nums">
								<span className="sr-only">문단 </span>
								{index + 1}
							</span>
							<p className="text-pretty break-keep">{text}</p>
						</div>
						<div className="min-h-10 pl-9">
							{done ? (
								<p
									className={cn(
										"flex items-baseline gap-2",
										index === 0 ? "text-primary" : "text-success",
									)}
								>
									<span className="font-bold text-sm">{COST.callWord}</span>
									<Count n={index === 0 ? 1 : 0} className="text-3xl" />
									<span className="text-pretty break-keep font-bold text-sm">
										{index === 0 ? COST.fresh : COST.reused}
									</span>
								</p>
							) : null}
						</div>
					</li>
				))}
			</ol>
			<div>
				<Button
					ref={buttonRef}
					size="lg"
					variant={done ? "neutral" : "default"}
					className="landing-press"
					onClick={() => setPhase(done ? "idle" : "confirming")}
				>
					{done ? COST.reset : COST.make}
				</Button>
			</div>
			<p
				role="status"
				className="min-h-5 text-pretty break-keep text-muted-foreground text-sm"
			>
				{done ? COST.doneNote : ""}
			</p>
			{phase === "confirming" ? (
				<ConfirmDialog
					title={COST.confirmTitle}
					description={COST.confirmDescription}
					action={COST.confirmAction}
					pendingText="만드는 중이에요"
					failedText="만들지 못했어요"
					doneText={COST.done}
					pending={false}
					// 서버를 부르지 않는다: 바로 성공으로 돌려준다
					send={({ onSuccess, onSettled }) => {
						onSuccess();
						onSettled();
					}}
					openerRef={buttonRef}
					focusAfterDone={() => buttonRef.current}
					onClose={(ok) => setPhase(ok ? "done" : "idle")}
				/>
			) : null}
		</div>
	);
}
