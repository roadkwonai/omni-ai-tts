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
import { Button } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { CircleAlert, Coins, Info, TriangleAlert } from "lucide-react";
import { type RefObject, useId, useRef, useState } from "react";

import { PROVIDER_LABEL } from "@/lib/connection-view";
import { NUMBER_TEXT } from "@/lib/studio-text";
import {
	confirmCopy,
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

import { DEMO_TEXT, useDemo } from "./demo";
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
	// 작업실: 이전 결과에 같은 서명의 처리 여부 미확인 줄이 있다(중복 과금을 알고 누르게, 브리프 5.7). 캐스팅은 넘기지 않는다
	unknownSame?: boolean;
	// 작업실(T11): 이 문단의 검수 안 한 숫자 수. 0보다 크면 경고 줄과 '검수하기'가 더해지고 확인 버튼이 '원문대로 만들기'가 된다. 캐스팅은 넘기지 않는다
	unreviewed?: number;
};

export function TrialConfirm({
	pending,
	onClose,
	onConfirm,
	onReview,
	unreviewedList = "",
	kind = "trial",
	finalFocus,
}: {
	pending: TrialPending | null;
	onClose: () => void;
	onConfirm: (pending: TrialPending) => void;
	// 검수 안 한 숫자가 있을 때 '검수하기'(작업실만 넘긴다). 확인 창을 닫는 일은 부른 쪽이 한다
	onReview?: (pending: TrialPending) => void;
	// 검수 안 한 숫자의 원문 표기 나열(작업실, lib unreviewedList). 경고 줄에 괄호로 든다
	unreviewedList?: string;
	// 작업실은 대본 앞 100자·총 글자 수와 '만들기' 문구다(T9 스펙 4절). boolean 대신 값 하나(patterns-explicit-variants)
	kind?: "trial" | "studio";
	// 닫힐 때 갈 곳(문단 작업실: 연 단추가 빠지면 그 카드 숨은 제목). 없으면 연 단추(캐스팅 그대로)
	finalFocus?: () => HTMLElement | boolean;
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
					finalFocus={
						finalFocus ??
						(pending.opener ? { current: pending.opener } : undefined)
					}
				>
					<ConfirmBody
						pending={pending}
						kind={kind}
						cancelRef={cancelRef}
						onConfirm={onConfirm}
						onReview={onReview}
						unreviewedList={unreviewedList}
					/>
				</AlertDialogContent>
			) : null}
		</AlertDialog>
	);
}

function ConfirmBody({
	pending,
	kind,
	cancelRef,
	onConfirm,
	onReview,
	unreviewedList,
}: {
	pending: TrialPending;
	kind: "trial" | "studio";
	cancelRef: RefObject<HTMLButtonElement | null>;
	onConfirm: (pending: TrialPending) => void;
	onReview?: (pending: TrialPending) => void;
	unreviewedList: string;
}) {
	const { voice, request, regenerate, unknownSame, unreviewed = 0 } = pending;
	const unknownId = useId();
	const reviewId = useId();
	const [sent, setSent] = useState(false);
	const sentRef = useRef(false);
	// Gemini는 잔액 조회 API가 없어 '남은 크레딧' 줄과 그 조회가 없다(T7.6 계획 '스펙과 다른 점' 6)
	// 공개 데모는 공급자를 부르지 않아 잔액·예상 사용량·돈 표시가 없다
	const demo = useDemo();
	const hasBalance = !demo && request.provider !== "gemini";
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
	const copy = confirmCopy(kind, request);
	// 돈이 드는 제목·버튼만 데모 문구로 바꾼다
	const demoCopy =
		demo && (kind === "trial" || ("paid" in copy && copy.paid))
			? kind === "trial"
				? { title: DEMO_TEXT.listenTitle, action: DEMO_TEXT.listenAction }
				: { title: DEMO_TEXT.makeTitle, action: DEMO_TEXT.makeAction }
			: null;
	// 작업실 무료 요청(미확인이라 뜬 창)에는 돈 표식이 없다. 캐스팅 창은 늘 유료라 그대로 붙는다
	const coins = !demo && (!("paid" in copy) || copy.paid);
	// 말투 지시가 있는 Gemini 설정은 길어 '문장'처럼 이름표 위·값 아래로 쌓는다(critique P3)
	const stacked =
		request.provider === "gemini" && request.settings.direction.trim() !== "";
	return (
		<>
			<AlertDialogHeader>
				<AlertDialogTitle>{(demoCopy ?? copy).title}</AlertDialogTitle>
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
						<dt className="text-muted-foreground">{copy.textLabel}</dt>
						<dd className="wrap-anywhere min-w-0 whitespace-pre-wrap">
							{copy.text}
						</dd>
					</div>
					{/* 근거는 금액 아래 별도 줄이다(Airy 포함, 사용자 결정 2026-10-13) */}
					<div
						className={
							demo ? "hidden" : "flex flex-wrap justify-between gap-x-4 gap-y-1"
						}
					>
						<dt className="whitespace-nowrap text-muted-foreground">
							예상 사용량
						</dt>
						<dd className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5 tabular-nums">
							{coins ? (
								<Coins aria-hidden="true" className="size-4 text-warning" />
							) : null}
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
				{request.provider === "gemini" && !demo ? (
					<p className="mt-3 flex gap-2 text-muted-foreground text-sm">
						<Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
						{GEMINI_DATA_NOTE}
					</p>
				) : null}
				{/* 작업실 중복 과금 경고(브리프 5.7)도 설명 안이라 창을 열 때 읽힌다(audit F1). 캐스팅은 unknownSame을 넘기지 않는다 */}
				{unknownSame && "unknownRetry" in copy ? (
					<p id={unknownId} className="mt-3 flex gap-2 text-sm text-warning">
						<TriangleAlert
							aria-hidden="true"
							className="mt-0.5 size-4 shrink-0"
						/>
						{copy.unknownRetry}
					</p>
				) : null}
				{/* 검수 안 한 숫자(T11, 브리프 17.4). 설명 안이라 창을 열 때 읽힌다 */}
				{unreviewed > 0 ? (
					<p id={reviewId} className="mt-3 flex gap-2 text-sm text-warning">
						<CircleAlert
							aria-hidden="true"
							className="mt-0.5 size-4 shrink-0"
						/>
						<span>
							{NUMBER_TEXT.unreviewedHead(unreviewed)}(
							<span translate="no">{unreviewedList}</span>).{" "}
							{NUMBER_TEXT.unreviewedTail}
						</span>
					</p>
				) : null}
			</AlertDialogDescription>
			{request.provider === "typecast" && typecastOverdrawn(quota) ? (
				<p className="text-sm text-warning">
					남은 플랜 크레딧이 없어요. 플랜에 따라 추가 청구될 수 있어요.
				</p>
			) : null}
			{regenerate ? (
				<p className="text-muted-foreground text-sm">
					같은 설정이어도 소리가 달라질 수 있어요
				</p>
			) : null}
			{/* 기본 샘플 상자는 캐스팅만. 작업실은 성우 고르기 창에서 이미 들었다(critique P2-5) */}
			{sample && kind === "trial" ? (
				<div className="flex items-center gap-3 rounded-xl bg-muted p-3 text-sm">
					<SampleButton
						status={sampleStatus}
						subject={`${voice.name} ${sampleName}`}
						onToggle={() => toggle(sample, voice.name, sample)}
					/>
					<p className="flex flex-col">
						<span className="font-bold">{sampleName}</span>
						<span>
							{demo
								? DEMO_TEXT.voiceNote(sampleName)
								: `${cost.free} 들으려면 ${sampleName}을 들어 보세요`}
						</span>
					</p>
				</div>
			) : null}
			<AlertDialogFooter>
				<AlertDialogCancel ref={cancelRef} size="lg">
					취소
				</AlertDialogCancel>
				{unreviewed > 0 && onReview ? (
					<Button variant="neutral" size="lg" onClick={() => onReview(pending)}>
						{NUMBER_TEXT.review}
					</Button>
				) : null}
				<AlertDialogAction
					size="lg"
					// 유료 버튼에 닿을 때 중복 과금 경고를 한 번 더 읽는다(창 설명에도 있다, WCAG 3.3.4)
					aria-describedby={
						[unknownSame ? unknownId : null, unreviewed > 0 ? reviewId : null]
							.filter((id) => id !== null)
							.join(" ") || undefined
					}
					disabled={sent}
					onClick={() => {
						if (sentRef.current) return;
						sentRef.current = true;
						setSent(true);
						onConfirm(pending);
					}}
				>
					{coins ? <Coins data-icon="inline-start" aria-hidden="true" /> : null}
					{unreviewed > 0 ? NUMBER_TEXT.asIs : (demoCopy ?? copy).action}
				</AlertDialogAction>
			</AlertDialogFooter>
		</>
	);
}
