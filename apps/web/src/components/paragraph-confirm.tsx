// apps/web/src/components/paragraph-confirm.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import type { ProviderId } from "@tts-pilot-app/api/providers/contract";
import type { GeminiModel } from "@tts-pilot-app/api/providers/trial-options";
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
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { CircleAlert, Coins, Info, TriangleAlert } from "lucide-react";
import { type RefObject, useId, useRef, useState } from "react";

import { PROVIDER_LABEL } from "@/lib/connection-view";
import { unreviewedList } from "@/lib/paragraph-script";
import { NUMBER_TEXT, PARAGRAPH_TEXT } from "@/lib/studio-text";
import {
	GEMINI_DATA_NOTE,
	remainingLabel,
	remainingLines,
	typecastOverdrawn,
	usageBasis,
	usageText,
} from "@/lib/trial-view";
import { orpc } from "@/utils/orpc";

import type { Confirming } from "./paragraph-make";
import { useParagraphs, useWork } from "./paragraph-provider";

type AllConfirming = Extract<NonNullable<Confirming>, { kind: "all" }>;
type UsageRow = AllConfirming["usage"][number];

// 전체 만들기 확인 창(브리프 5.8, T5 TrialConfirm 문법). 유료이거나 미확인 문단이 있으면 runMakeAll 전에 뜬다(리듀서 confirm 단계).
// 첫 포커스 '취소', 닫히면 finalFocus(막대 주 버튼, 만드는 중이면 같은 자리의 '멈추기'). 바깥 누르기로는 닫히지 않는다(AlertDialog).
// 두 번 눌림은 렌더를 기다리지 않는 sentRef로 막는다(리듀서도 한 번만 받는다). 사용량은 계획을 세운 때 rates 표로 셈한 값이다(E20)
export function ParagraphMakeConfirm({
	finalFocus,
}: {
	finalFocus: () => HTMLElement | boolean;
}) {
	const work = useWork();
	const cancelRef = useRef<HTMLButtonElement>(null);
	// '검수하기'로 닫을 때는 포커스를 돌리지 않는다(숫자 검수 창이 가져간다)
	const toReview = useRef(false);
	const confirming = work.confirming?.kind === "all" ? work.confirming : null;
	return (
		<AlertDialog
			open={confirming !== null}
			onOpenChange={(open) => !open && work.cancel()}
		>
			{confirming ? (
				<AlertDialogContent
					initialFocus={cancelRef}
					finalFocus={() => {
						if (!toReview.current) return finalFocus();
						toReview.current = false;
						return false;
					}}
				>
					<ConfirmBody
						confirming={confirming}
						now={work.now}
						ratesLoading={work.ratesLoading}
						cancelRef={cancelRef}
						onConfirm={work.confirm}
						// 만들기를 취소하고 숫자 검수 창을 첫 미검수 항목에서 연다. 닫으면 포커스는 이 확인 창을 연 주 버튼으로 돌아간다
						onReview={() => {
							toReview.current = true;
							work.cancel();
							work.openReview(null, confirming.opener);
						}}
					/>
				</AlertDialogContent>
			) : null}
		</AlertDialog>
	);
}

function ConfirmBody({
	confirming,
	now,
	ratesLoading,
	cancelRef,
	onConfirm,
	onReview,
}: {
	confirming: AllConfirming;
	now: number;
	ratesLoading: boolean;
	cancelRef: RefObject<HTMLButtonElement | null>;
	onConfirm: () => void;
	onReview: () => void;
}) {
	const { plan, usage } = confirming;
	const warnId = useId();
	const reviewId = useId();
	const [sent, setSent] = useState(false);
	const sentRef = useRef(false);
	const count = plan.make.length;
	// 모두 무료인데 미확인이 있어 뜬 창(22)은 크레딧·비용 말이 없다. Gemini는 크레딧이 아니라 요금이라 '비용'이다
	const free = plan.free;
	const cost = usage.some((row) => row.provider === "gemini");
	// 근거는 문단 설정을 따르고 문단마다 다를 수 있어 서로 다른 값만 잇는다. Airy는 언어별 요율, Gemini는 모델별 1분 단가
	const airy = new Set<string>();
	const gemini = new Set<GeminiModel>();
	for (const { request } of plan.make) {
		const basis = request.provider === "airy" && usageBasis(request, now);
		if (basis) airy.add(basis);
		if (request.provider === "gemini") gemini.add(request.settings.model);
	}
	const basisOf = (provider: ProviderId) =>
		provider === "airy" && airy.size > 0
			? PARAGRAPH_TEXT.airyBasis([...airy].join(" · "))
			: provider === "gemini" && gemini.size > 0
				? PARAGRAPH_TEXT.geminiBasis([...gemini], now)
				: null;
	const unknown = plan.unknown.length > 0;
	const unreviewed = plan.unreviewed > 0;
	// 검수 안 한 숫자의 원문 표기 나열(만들 문단만, 최대 3개)
	const { paragraphs } = useParagraphs();
	const list = unreviewed
		? unreviewedList(
				plan.make.flatMap(
					({ id }) => paragraphs.find((p) => p.id === id) ?? [],
				),
			)
		: "";
	return (
		<>
			<AlertDialogHeader>
				<AlertDialogTitle>
					{free
						? PARAGRAPH_TEXT.confirmFree(count)
						: cost
							? PARAGRAPH_TEXT.confirmCost(count)
							: PARAGRAPH_TEXT.confirmCredit(count)}
				</AlertDialogTitle>
			</AlertDialogHeader>
			<AlertDialogDescription render={<div />} className="text-foreground">
				<dl className="flex flex-col gap-2 text-sm">
					<div className="flex justify-between gap-4">
						<dt className="text-muted-foreground">
							{PARAGRAPH_TEXT.confirmNew}
						</dt>
						<dd className="text-right tabular-nums">
							{PARAGRAPH_TEXT.confirmCount(count, plan.reused)}
						</dd>
					</div>
					{usage.map((row) => (
						<ProviderRow
							key={row.provider}
							row={row}
							basis={basisOf(row.provider)}
							// 배율 표를 받는 중이면 아직 '모름'이 아니다
							rateMissing={row.rateMissing && !ratesLoading}
						/>
					))}
				</dl>
				{/* Gemini 무료 등급 약관(T5 확인 창과 같은 모양) */}
				{cost ? (
					<p className="mt-3 flex gap-2 text-muted-foreground text-sm">
						<Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
						{GEMINI_DATA_NOTE}
					</p>
				) : null}
				{/* 중복 과금 경고는 설명 안이라 창을 열 때 읽힌다(T5 audit F1). 미확인이면 무료여도 이 창이 뜬다('스펙과 다른 점' 22) */}
				{unknown ? (
					<p id={warnId} className="mt-3 flex gap-2 text-sm text-warning">
						<TriangleAlert
							aria-hidden="true"
							className="mt-0.5 size-4 shrink-0"
						/>
						{free
							? PARAGRAPH_TEXT.unknownFree
							: PARAGRAPH_TEXT.unknownRetry(cost)}
					</p>
				) : null}
				{/* 검수 안 한 숫자(T11, 브리프 17.4). 무료이고 미확인이 없어도 이 창이 뜬다 */}
				{unreviewed ? (
					<p id={reviewId} className="mt-3 flex gap-2 text-sm text-warning">
						<CircleAlert
							aria-hidden="true"
							className="mt-0.5 size-4 shrink-0"
						/>
						<span>
							{NUMBER_TEXT.unreviewedHead(plan.unreviewed)}(
							<span translate="no">{list}</span>). {NUMBER_TEXT.unreviewedTail}
						</span>
					</p>
				) : null}
			</AlertDialogDescription>
			<AlertDialogFooter>
				<AlertDialogCancel ref={cancelRef} variant="neutral" size="lg">
					{PARAGRAPH_TEXT.cancel}
				</AlertDialogCancel>
				{unreviewed ? (
					<Button variant="neutral" size="lg" onClick={onReview}>
						{NUMBER_TEXT.review}
					</Button>
				) : null}
				<AlertDialogAction
					size="lg"
					// 유료 버튼에 닿을 때 경고를 한 번 더 읽는다(WCAG 3.3.4)
					aria-describedby={
						[unknown ? warnId : null, unreviewed ? reviewId : null]
							.filter((id) => id !== null)
							.join(" ") || undefined
					}
					disabled={sent}
					onClick={() => {
						if (sentRef.current) return;
						sentRef.current = true;
						setSent(true);
						onConfirm();
					}}
				>
					{/* 채운 청록 버튼 안의 유료 표식은 글자색이다(DESIGN.md). 무료면 붙이지 않는다 */}
					{free ? null : <Coins data-icon="inline-start" aria-hidden="true" />}
					{unreviewed
						? NUMBER_TEXT.asIs
						: free
							? PARAGRAPH_TEXT.make
							: cost
								? PARAGRAPH_TEXT.makeCost
								: PARAGRAPH_TEXT.makeCredit}
				</AlertDialogAction>
			</AlertDialogFooter>
		</>
	);
}

// 공급자 한 줄: 문단 수 · 예상 사용량(무료면 success '무료'), 배율 모름, 요율 근거(Airy·Gemini), 남은 크레딧(조회되는 공급자만)
function ProviderRow({
	row,
	basis,
	rateMissing,
}: {
	row: UsageRow;
	basis: string | null;
	rateMissing: boolean;
}) {
	const free = row.usage.unit === "free";
	return (
		<div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
			<dt className="text-muted-foreground" translate="no">
				{PROVIDER_LABEL[row.provider]}
			</dt>
			<dd className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5 tabular-nums">
				{free ? null : (
					<Coins aria-hidden="true" className="size-4 text-warning" />
				)}
				{free
					? PARAGRAPH_TEXT.confirmCount(row.count, 0)
					: `${PARAGRAPH_TEXT.confirmCount(row.count, 0)} · ${usageText(row.usage)}`}
				{free ? <Badge variant="success">{PARAGRAPH_TEXT.free}</Badge> : null}
				{rateMissing ? (
					<span className="text-muted-foreground">
						({PARAGRAPH_TEXT.rateUnknown})
					</span>
				) : null}
			</dd>
			{basis ? (
				<dd className="basis-full text-muted-foreground md:text-right">
					{basis}
				</dd>
			) : null}
			{/* Gemini는 잔액 조회 API가 없다. 무료 줄은 잔액을 쓰지 않는다 */}
			{free || row.provider === "gemini" ? null : (
				<Remaining provider={row.provider} />
			)}
		</div>
	);
}

// 남은 크레딧(T2 연결 상태 값, 창을 열 때마다 새로). 무료 조회다(TrialConfirm과 같다).
// Typecast 남은 플랜 크레딧이 없으면 초과 청구 경고(유료 플랜은 넘어서 청구될 수 있어 막지 않는다, T5와 같은 판정)
function Remaining({ provider }: { provider: ProviderId }) {
	const status = useQuery({
		...orpc.providerStatus.queryOptions({ input: { provider } }),
		staleTime: 0,
		retry: false,
		meta: { toast: false },
	});
	const quota = status.data?.quota ?? null;
	return (
		<>
			<dd className="flex basis-full flex-wrap items-center justify-end gap-x-2 text-muted-foreground tabular-nums">
				<span>{remainingLabel(provider)}</span>
				{status.isFetching ? (
					<>
						<Spinner aria-hidden="true" />
						<span className="sr-only">{PARAGRAPH_TEXT.checking}</span>
					</>
				) : (
					remainingLines(provider, quota).map((line) => (
						<span key={line} className="text-foreground">
							{line}
						</span>
					))
				)}
			</dd>
			{provider === "typecast" && typecastOverdrawn(quota) ? (
				<dd className="basis-full text-sm text-warning md:text-right">
					{PARAGRAPH_TEXT.typecastOverdrawn}
				</dd>
			) : null}
		</>
	);
}
