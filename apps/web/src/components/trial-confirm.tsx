"use client";

import { useQuery } from "@tanstack/react-query";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	estimate,
	type TrialRequest,
} from "@tts-pilot-app/api/providers/trial-options";
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
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Coins, Info } from "lucide-react";
import { type RefObject, useRef, useState } from "react";

import { PROVIDER_LABEL } from "@/lib/connection-view";
import {
	costCopy,
	GEMINI_DATA_NOTE,
	remainingLabel,
	remainingLines,
	settingsSummary,
	typecastOverdrawn,
	usageBasis,
	usageText,
} from "@/lib/trial-view";
import { sampleKindOf } from "@/lib/voice-view";
import { orpc } from "@/utils/orpc";

import { useSample } from "./sample-player";
import { SampleButton } from "./voice-row";

// ElevenLabs 모델 배율은 무료 목록에서 읽는다. 실패하면 예상값에 배율 1을 쓴다.
export function useRate(request: TrialRequest) {
	const elevenlabs = request.provider === "elevenlabs";
	const models = useQuery({
		...orpc.trialModels.queryOptions(),
		enabled: elevenlabs,
		staleTime: 60 * 60 * 1000,
		retry: false,
		meta: { toast: false },
	});
	if (!elevenlabs) return { multiplier: null, missing: false };
	const multiplier =
		models.data?.rates.find((rate) => rate.model === request.settings.model)
			?.multiplier ?? null;
	return { multiplier, missing: multiplier === null && !models.isPending };
}

export type TrialPending = {
	voice: Voice;
	request: TrialRequest;
	requestId: string;
	regenerate: boolean;
	opener: HTMLElement | null;
};

export function TrialConfirm({
	pending,
	onClose,
	onConfirm,
}: {
	pending: TrialPending | null;
	onClose: () => void;
	onConfirm: (pending: TrialPending) => void;
}) {
	const cancelRef = useRef<HTMLButtonElement>(null);
	return (
		<AlertDialog
			open={pending !== null}
			onOpenChange={(open) => !open && onClose()}
		>
			{pending ? (
				<AlertDialogContent
					initialFocus={cancelRef}
					finalFocus={pending.opener ? { current: pending.opener } : undefined}
				>
					<ConfirmBody
						pending={pending}
						cancelRef={cancelRef}
						onConfirm={onConfirm}
					/>
				</AlertDialogContent>
			) : null}
		</AlertDialog>
	);
}

function ConfirmBody({
	pending,
	cancelRef,
	onConfirm,
}: {
	pending: TrialPending;
	cancelRef: RefObject<HTMLButtonElement | null>;
	onConfirm: (pending: TrialPending) => void;
}) {
	const { voice, request, regenerate } = pending;
	const [sent, setSent] = useState(false);
	const sentRef = useRef(false);
	// Gemini는 잔액 조회 API가 없어 '남은 크레딧' 줄과 그 조회가 없다(T7.6 계획 '스펙과 다른 점' 6)
	const hasBalance = request.provider !== "gemini";
	const status = useQuery({
		...orpc.providerStatus.queryOptions({
			input: { provider: request.provider },
		}),
		enabled: hasBalance,
		staleTime: 0,
		retry: false,
		meta: { toast: false },
	});
	const rate = useRate(request);
	const basis = usageBasis(request);
	const quota = status.data?.quota ?? null;
	const sample = voice.previewUrl;
	const sampleName = sampleKindOf(voice);
	const { status: sampleStatus, toggle } = useSample(sample ?? "");
	const cost = costCopy(request.provider);
	// 말투 지시가 있는 Gemini 설정은 길어 '문장'처럼 이름표 위·값 아래로 쌓는다(critique P3)
	const stacked =
		request.provider === "gemini" && request.settings.direction.trim() !== "";
	return (
		<>
			<AlertDialogHeader>
				<AlertDialogTitle>{cost.title}</AlertDialogTitle>
			</AlertDialogHeader>
			<AlertDialogDescription render={<div />} className="text-foreground">
				<dl className="flex flex-col gap-2 text-sm">
					<div className="flex justify-between gap-4">
						<dt className="text-muted-foreground">성우</dt>
						<dd className="text-right">
							{voice.name} ·{" "}
							<span translate="no">{PROVIDER_LABEL[request.provider]}</span>
						</dd>
					</div>
					<div
						className={
							stacked
								? "flex min-w-0 flex-col gap-1"
								: "flex justify-between gap-4"
						}
					>
						<dt className="text-muted-foreground">설정</dt>
						<dd
							className={cn("wrap-anywhere min-w-0", !stacked && "text-right")}
							translate="no"
						>
							{settingsSummary(request)}
						</dd>
					</div>
					<div className="flex min-w-0 flex-col gap-1">
						<dt className="text-muted-foreground">문장</dt>
						<dd className="wrap-anywhere min-w-0 whitespace-pre-wrap">
							{request.text}
						</dd>
					</div>
					{/* 근거는 금액 아래 별도 줄이다(Airy 포함, 사용자 결정 2026-10-13) */}
					<div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
						<dt className="whitespace-nowrap text-muted-foreground">
							예상 사용량
						</dt>
						<dd className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5 tabular-nums">
							<Coins aria-hidden="true" className="size-4 text-warning" />
							{usageText(estimate(request, rate.multiplier))}
							{rate.missing ? (
								<span className="text-muted-foreground">
									(배율을 확인하지 못했어요)
								</span>
							) : null}
						</dd>
						{basis ? (
							<dd className="basis-full text-left text-muted-foreground md:text-right">
								(<span translate="no">{PROVIDER_LABEL[request.provider]}</span>{" "}
								요금 기준: {basis})
							</dd>
						) : null}
					</div>
					{hasBalance ? (
						<div className="flex justify-between gap-4">
							<dt className="text-muted-foreground">
								{remainingLabel(request.provider)}
							</dt>
							<dd className="flex flex-col items-end tabular-nums">
								{status.isFetching ? (
									<>
										<Spinner aria-hidden="true" />
										<span className="sr-only">확인하는 중</span>
									</>
								) : (
									remainingLines(request.provider, quota).map((line) => (
										<span key={line}>{line}</span>
									))
								)}
							</dd>
						</div>
					) : null}
				</dl>
				{/* 무료 등급 안내는 설명 안이라 창을 열 때 읽힌다. 패널 데이터 안내와 같은 모양(계획 리뷰 R6-4) */}
				{request.provider === "gemini" ? (
					<p className="mt-3 flex gap-2 text-muted-foreground text-sm">
						<Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
						{GEMINI_DATA_NOTE}
					</p>
				) : null}
			</AlertDialogDescription>
			{request.provider === "typecast" && typecastOverdrawn(quota) ? (
				<p className="text-sm text-warning">
					남은 플랜 크레딧이 없어요. 플랜에 따라 추가 청구될 수 있어요
				</p>
			) : null}
			{regenerate ? (
				<p className="text-muted-foreground text-sm">
					같은 설정이어도 소리가 달라질 수 있어요
				</p>
			) : null}
			{sample ? (
				<div className="flex items-center gap-3 rounded-xl bg-muted p-3 text-sm">
					<SampleButton
						status={sampleStatus}
						subject={`${voice.name} ${sampleName}`}
						onToggle={() => toggle(sample, voice.name, sample)}
					/>
					<p className="flex flex-col">
						<span className="font-bold">{sampleName}</span>
						<span>
							{cost.free} 들으려면 {sampleName}을 들어 보세요
						</span>
					</p>
				</div>
			) : null}
			<AlertDialogFooter>
				<AlertDialogCancel ref={cancelRef} size="lg">
					취소
				</AlertDialogCancel>
				<AlertDialogAction
					size="lg"
					disabled={sent}
					onClick={() => {
						if (sentRef.current) return;
						sentRef.current = true;
						setSent(true);
						onConfirm(pending);
					}}
				>
					<Coins data-icon="inline-start" aria-hidden="true" />
					{cost.action}
				</AlertDialogAction>
			</AlertDialogFooter>
		</>
	);
}
