"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import type {
	ProviderFailure,
	ProviderId,
	VoiceListResult,
} from "@tts-pilot-app/api/providers/contract";
import { Button, buttonVariants } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { KeyRound, SearchX, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { type RefObject, useEffect, useState } from "react";

import { PROVIDER_LABEL } from "@/lib/connection-view";
import { failureOf, problemCopy, retryAtOf } from "@/lib/voice-failure";

export { problemCopy } from "@/lib/voice-failure";

import { latestTime, retryTime } from "@/lib/voice-view";

import { DEMO_TEXT, useDemo } from "./demo";
import { Notice } from "./notice";

// 429 Retry-After로 정한 대기 시각(브리프 8절)
export const cooldownText = (retryAt: string) =>
	`요청이 많아 ${retryTime(retryAt)} 이후 다시 불러올 수 있어요.`;

// 대기 시각이 지금보다 뒤인 동안 그 시각을, 아니면 null. 시각이 지나면 스스로 다시 그려 '다시 불러오기'가 풀린다.
export function useCooldown(retryAt: string | null | undefined): string | null {
	const [now, setNow] = useState(() => Date.now());
	const until = retryAt ? Date.parse(retryAt) : 0;
	const waiting = until > now;
	useEffect(() => {
		if (!waiting) return;
		const id = setTimeout(
			// 타이머가 조금 일찍 깨도 그 시각에 닿은 것으로 본다
			() => setNow(Math.max(Date.now(), until)),
			Math.max(until - Date.now(), 0),
		);
		return () => clearTimeout(id);
	}, [waiting, until]);
	return waiting ? (retryAt ?? null) : null;
}

// focusableWhenDisabled 버튼은 disabled 속성 대신 aria-disabled를 달아 Button 기본 비활성 모양이 안 붙는다.
// 눌리지 않게는 늘 하고, 대기 시각 전(waiting)일 때만 흐리게 한다(진행 중인 버튼은 흐리지 않는다, T2·T3 관례)
export const lockedButton = (waiting: boolean) =>
	cn(
		"aria-disabled:pointer-events-none",
		waiting && "aria-disabled:opacity-50",
	);

export function ReloadButton({
	reloading,
	waiting,
	onReload,
}: {
	reloading: boolean;
	// 대기 시각 전이라 누를 수 없다
	waiting?: boolean;
	onReload: () => void;
}) {
	return (
		<Button
			size="lg"
			focusableWhenDisabled
			disabled={reloading || waiting}
			className={lockedButton(waiting === true)}
			onClick={onReload}
		>
			{reloading ? (
				<Spinner data-icon="inline-start" aria-hidden="true" />
			) : null}
			다시 불러오기
		</Button>
	);
}

// 실패 문구 한 줄과 '다시 불러오기'(성우 보관함, 담기 칸, 분류 붙이기)
export function ReloadRow({
	text,
	reloading,
	onReload,
}: {
	text: string;
	reloading: boolean;
	onReload: () => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-3">
			<p role="status" className="text-muted-foreground text-sm">
				{text}
			</p>
			<ReloadButton reloading={reloading} onReload={onReload} />
		</div>
	);
}

// 사유별 안내. 새로 나타나면 스크린 리더가 읽는다(role="alert").
// compact는 '전체' 탭 묶음용 작은 상자다(아이콘 없음, 문구는 같다).
// 조건이 시작값이 아닐 때 onClear를 받으면 '조건 모두 해제'를 함께 둔다(조건 때문에 느려진 조회에서 빠져나갈 수 있다).
export function Problem({
	provider,
	failure,
	reloading,
	onReload,
	retryAt,
	onClear,
	compact,
}: {
	provider: ProviderId;
	failure: ProviderFailure;
	reloading: boolean;
	onReload: () => void;
	// 요청 제한인데 지난 목록이 없을 때의 다음 호출 가능 시각
	retryAt?: string | null;
	onClear?: () => void;
	compact?: boolean;
}) {
	const demo = useDemo();
	// 공개 데모의 목록 실패는 저장해 둔 목록에 그 조합이 없다는 뜻이다. 연결 상태·다시 불러오기(공급자 호출)는 없다
	const copy = demo
		? {
				title: DEMO_TEXT.listTitle,
				description: DEMO_TEXT.listDescription,
				connections: false,
				reload: false,
			}
		: problemCopy(provider, failure);
	const cooldown = useCooldown(retryAt);
	const description = cooldown ? cooldownText(cooldown) : copy.description;
	const actions = (
		<>
			{copy.connections ? (
				// cn 없이 쓰면 기본 border-transparent가 outline 테두리를 지운다(critique P2)
				<Link
					href="/connections"
					className={cn(buttonVariants({ variant: "neutral", size: "lg" }))}
				>
					연결 상태 보기
				</Link>
			) : null}
			{copy.reload ? (
				<ReloadButton
					reloading={reloading}
					waiting={cooldown !== null}
					onReload={onReload}
				/>
			) : null}
			{onClear ? (
				<Button variant="neutral" size="lg" onClick={onClear}>
					조건 모두 해제
				</Button>
			) : null}
			{/* 다시 불러오는 동안 스크린 리더에 진행을 알린다(첫 로딩과 같은 문구) */}
			{reloading ? (
				<span className="sr-only" role="status">
					성우 목록을 불러오고 있어요
				</span>
			) : null}
		</>
	);
	if (compact) {
		return (
			<div
				role="alert"
				className="flex flex-col items-start gap-3 rounded-xl p-4 ring-1 ring-border ring-inset"
			>
				<h3 className="text-balance font-bold">{copy.title}</h3>
				<p className="text-muted-foreground text-sm">{description}</p>
				<div className="flex flex-wrap gap-2">{actions}</div>
			</div>
		);
	}
	return (
		<Notice
			role="alert"
			icon={failure === "no_key" ? KeyRound : TriangleAlert}
			title={copy.title}
			description={description}
		>
			{actions}
		</Notice>
	);
}

// 공개 성우 0명(브리프 8절). 24시간 캐시된 빈 목록이 그대로 돌아오지 않게 '다시 불러오기'는 서버 캐시를 만료시킨 뒤 다시 받는다('목록 새로 고침'과 같다)
export function EmptyList({
	provider,
	reloading,
	waiting,
	onReload,
}: {
	provider: ProviderId;
	reloading: boolean;
	waiting: boolean;
	onReload: () => void;
}) {
	// 공개 데모는 공급자를 부르지 않아 '다시 불러오기'가 늘 실패한다. 버튼 대신 안내만 둔다(ListStatusBar와 같다)
	const demo = useDemo();
	return (
		<Notice
			role="alert"
			title={`${PROVIDER_LABEL[provider]}에서 받은 공개 성우가 없어요`}
			description={demo ? DEMO_TEXT.listDescription : undefined}
		>
			{demo ? null : (
				<ReloadButton
					reloading={reloading}
					waiting={waiting}
					onReload={onReload}
				/>
			)}
		</Notice>
	);
}

// 조건 결과 0명(브리프 8절). 인원 글자(role="status")가 이미 알리므로 role을 두지 않는다
export function NoMatches({ onClear }: { onClear: () => void }) {
	return (
		<Notice
			icon={SearchX}
			title="조건에 맞는 성우가 없어요"
			description="조건을 줄이거나 검색어를 바꿔 보세요."
		>
			<Button size="lg" variant="neutral" onClick={onClear}>
				조건 모두 해제
			</Button>
		</Notice>
	);
}

// 문제 안내·지난 목록 안내·'다시 불러오기'(브리프 8절). 공급자 탭 목록, Typecast 목록, '전체' 탭 묶음이 함께 쓴다.
// first는 지금 조건의 첫 페이지(Typecast는 목록 하나)이고, 받기 전이거나 앞 조건의 placeholder면 없다.
// refetch는 첫 페이지를 cancelRefetch: false로 다시 받아(두 번 눌러도 공급자 호출 1회) 성공하면 그 페이지를, 실패하면 undefined를 돌려준다.
// 돌려준 페이지가 지난 목록이 아니면 검색 칸으로 포커스를 옮긴다
export function useListRecovery({
	query,
	first,
	blockedUntil,
	refetch,
	searchRef,
}: {
	query: Pick<
		UseQueryResult,
		"error" | "isError" | "isFetching" | "isRefetchError"
	>;
	first: VoiceListResult | undefined;
	// '목록 새로 고침' 응답의 대기 시각
	blockedUntil?: string | null;
	refetch: () => Promise<VoiceListResult | undefined>;
	searchRef: RefObject<HTMLInputElement | null>;
}) {
	// 문제 안내에서 '다시 불러오기'를 누른 때의 사유. 다시 받는 동안 query-core가 오류를 지우므로 들고 있다가 안내와 버튼 포커스를 지킨다
	const [retrying, setRetrying] = useState<{
		failure: ProviderFailure;
		retryAt: string | null;
	} | null>(null);
	const failure = query.isError ? failureOf(query.error) : null;
	// 소유자 없음은 쓰는 쪽이 주소 안내로 바꾼다(unauthorized). 아래 안내에는 넣지 않는다
	const known = failure === "unauthorized" ? null : failure;
	const stale = first?.stale ?? null;
	// 대기 시각(429 Retry-After): 지난 목록의 것, 이 쿼리 오류의 것(첫 조회 실패와 다시 받기 실패 모두), '목록 새로 고침' 응답의 것 중 가장 늦은 시각.
	// 지금보다 뒤면 안내 문구가 되고 '목록 새로 고침'과 '다시 불러오기'를 누를 수 없다
	const retryAt = latestTime(
		stale?.retryAt,
		query.isError ? retryAtOf(query.error) : null,
		blockedUntil,
	);
	const cooldown = useCooldown(retryAt);
	// 문제 안내: 첫 페이지 없이 실패했거나, 그 안내의 '다시 불러오기'로 다시 받는 중이다.
	// 다시 받는 동안 keepPreviousData가 앞 조건의 목록을 끼워 넣어도 retrying이 있으면 안내를 먼저 보인다
	const problem =
		known && !first
			? { failure: known, retryAt }
			: query.isFetching
				? retrying
				: null;
	// 목록은 있는데 다시 받기가 실패했다(예: 만료 뒤 7일이 지난 목록의 새로 고침). 지난 목록 안내로 알린다
	const refetchFailure = query.isRefetchError ? known : null;
	// 지난 목록 안내(지난 목록, 다시 받기 실패, 대기 시각)를 보일 때 그 목록의 받은 시각과 사유
	const notice =
		first && (stale || refetchFailure || cooldown)
			? {
					fetchedAt: first.fetchedAt,
					reason: stale?.reason ?? refetchFailure ?? "rate_limit",
				}
			: null;
	function reload() {
		if (problem) setRetrying(problem);
		void refetch().then((page) => {
			setRetrying(null);
			// 안내의 '다시 불러오기' 버튼이 사라지므로 검색 칸으로 포커스를 옮긴다(T3와 같다)
			if (page && !page.stale) {
				requestAnimationFrame(() => searchRef.current?.focus());
			}
		});
	}
	return {
		unauthorized: failure === "unauthorized",
		// 지금 오류의 사유(소유자 없음은 빼고). '더 보기' 실패 글자가 쓴다
		failure: known,
		problem,
		notice,
		retryAt,
		cooldown,
		reload,
	};
}
