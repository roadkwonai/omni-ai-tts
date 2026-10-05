"use client";

import type {
	ProviderFailure,
	ProviderId,
} from "@tts-pilot-app/api/providers/contract";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { ArrowRight, RefreshCw } from "lucide-react";
import {
	type ReactNode,
	type RefObject,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

import { PROVIDER_LABEL } from "@/lib/connection-view";
import { agoText, receivedText } from "@/lib/voice-view";

import {
	cooldownText,
	lockedButton,
	problemCopy,
	useCooldown,
} from "./voice-problem";

export const LIST_QUERY = {
	// 받은 목록은 탭을 닫을 때까지 쓴다. 서버 목록 캐시(24시간)가 따로 있어 새로 고침해도 공급자를 부르지 않는다(AC11)
	staleTime: Number.POSITIVE_INFINITY,
	gcTime: Number.POSITIVE_INFINITY,
	retry: false,
	retryOnMount: false,
	refetchOnWindowFocus: false,
	refetchOnReconnect: false,
	networkMode: "always",
	meta: { toast: false },
} as const;

// 검색어 보내기(스펙 6절 6): 입력이 0.5초 멈추거나 Enter(submit)일 때 onCommit을 부른다.
// 밖에서 값이 바뀌면('모두 보기 →', 조건 모두 해제) 칸도 따라간다
export function useSearchCommit(
	value: string,
	onCommit: (value: string) => void,
) {
	const [draft, setDraft] = useState(value);
	const [synced, setSynced] = useState(value);
	if (synced !== value) {
		setSynced(value);
		setDraft(value);
	}
	useEffect(() => {
		if (draft === value) return;
		const id = setTimeout(() => onCommit(draft), 500);
		return () => clearTimeout(id);
	}, [draft, value, onCommit]);
	return {
		draft,
		setDraft,
		submit: () => {
			if (draft !== value) onCommit(draft);
		},
	};
}

const SKELETON_ROWS = [1, 2, 3, 4, 5];

// 행 자리 뼈대 5줄과 화면 밖 알림(브리프 8절 '처음 불러오는 중', '전체' 탭 묶음 받는 중).
// '전체' 탭은 묶음 셋이 함께 받으므로 묶음은 알리지 않고(announce false) AllProviders가 한 번만 알린다
export function RowSkeleton({ announce = true }: { announce?: boolean }) {
	return (
		<>
			<div
				aria-hidden="true"
				className="divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-border ring-inset"
			>
				{SKELETON_ROWS.map((row) => (
					<Skeleton key={row} className="h-17 rounded-none" />
				))}
			</div>
			{announce ? (
				<span className="sr-only" role="status">
					성우 목록을 불러오고 있어요
				</span>
			) : null}
		</>
	);
}

// 묶음(Typecast 콘텐츠별 묶음, '전체' 탭 공급자 묶음): h2 이름, 회색 인원(받는 중이면 작은 진행 표시), 오른쪽 끝 '모두 보기 →', 그 아래 행 목록
export function VoiceShelf({
	title,
	countLabel,
	busy,
	showAllLabel,
	onShowAll,
	children,
}: {
	title: string;
	countLabel: string | null;
	busy?: boolean;
	showAllLabel?: string;
	onShowAll?: () => void;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-3">
			<div className="flex flex-wrap items-baseline gap-x-2">
				<h2 className="font-bold text-xl">{title}</h2>
				{busy ? (
					<Spinner aria-hidden="true" className="size-4 self-center" />
				) : null}
				{countLabel ? (
					<span className="text-muted-foreground text-sm tabular-nums">
						{countLabel}
					</span>
				) : null}
				{onShowAll ? (
					<Button
						variant="link"
						size="lg"
						className="ml-auto"
						aria-label={showAllLabel}
						onClick={onShowAll}
					>
						모두 보기 <ArrowRight data-icon="inline-end" aria-hidden="true" />
					</Button>
				) : null}
			</div>
			{children}
		</section>
	);
}

type Refresh = { onRefresh: () => void; disabled: boolean };

// '목록 새로 고침'(브리프 5절): 새로 고침 아이콘이 붙은 조용한 텍스트 버튼(회색 보통 굵기, hover에서 진한 글자, 사용자 결정 2026-10-05).
// 누른 뒤 문제·지난 목록 안내가 떠 포커스를 가진 채 사라지면 인원 글자로 포커스를 옮긴다.
// React는 지우는 컴포넌트의 layout 정리를 그 DOM을 빼기 전에 부르므로 이때 버튼은 아직 포커스를 갖고 있다
function RefreshButton({
	refresh,
	busy,
	fallback,
}: {
	refresh: Refresh;
	busy: boolean;
	fallback: RefObject<HTMLParagraphElement | null>;
}) {
	const ref = useRef<HTMLButtonElement>(null);
	useLayoutEffect(() => {
		const button = ref.current;
		return () => {
			if (button !== null && document.activeElement === button) {
				fallback.current?.focus();
			}
		};
	}, [fallback]);
	return (
		<Button
			ref={ref}
			variant="link"
			size="lg"
			// 받는 중(busy)에는 흐리지 않고, 그 밖에 잠겼으면(대기 시각 전) 흐리게 한다
			className={cn(
				"font-normal text-muted-foreground hover:text-foreground",
				lockedButton(refresh.disabled && !busy),
			)}
			focusableWhenDisabled
			disabled={refresh.disabled}
			onClick={refresh.onRefresh}
		>
			<RefreshCw data-icon="inline-start" aria-hidden="true" />
			목록 새로 고침
		</Button>
	);
}

// 상태 줄(브리프 5절, 계획 리뷰 D3·D9·D17): 왼쪽 인원 글자(받는 중이면 작은 진행 표시)와 덧붙일 링크,
// 오른쪽 정렬(있으면)·'목록 새로 고침'·받은 시각. 키보드 순서도 이 순서다(사용자 결정 2026-10-05).
// 받는 중에도 늘 그린다(버튼과 포커스가 사라지지 않는다. '모두 보기 →' 뒤 포커스가 인원 글자로 온다).
// 문제·지난 목록 안내가 보이는 동안은 refresh를 null로 받아 '목록 새로 고침'을 숨긴다. 그때는 안내 안의 '다시 불러오기'가 회복 버튼 하나다
export function ListStatusBar({
	count,
	countRef,
	busy,
	extra,
	sort,
	fetchedAt,
	refresh,
}: {
	count: string;
	countRef: RefObject<HTMLParagraphElement | null>;
	busy: boolean;
	extra?: ReactNode;
	sort?: ReactNode;
	fetchedAt: string | null;
	refresh: Refresh | null;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
			<div className="flex flex-wrap items-center gap-x-3">
				{busy ? <Spinner aria-hidden="true" className="size-4" /> : null}
				<p
					ref={countRef}
					role="status"
					tabIndex={-1}
					// '모두 보기 →' 뒤 스크립트로 포커스를 받는다. 키보드로 왔으면 다른 컨트롤과 같은 2px 윤곽선을 보인다
					className="text-muted-foreground tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid focus-visible:outline-offset-2"
				>
					{count}
				</p>
				{extra}
			</div>
			<div className="flex flex-wrap items-center gap-x-2">
				{sort}
				{refresh ? (
					<RefreshButton refresh={refresh} busy={busy} fallback={countRef} />
				) : null}
				{fetchedAt ? (
					<span className="text-muted-foreground text-sm tabular-nums">
						{receivedText(fetchedAt, new Date())}
					</span>
				) : null}
			</div>
		</div>
	);
}

// 안내 줄(브리프 8절): 지난 목록이면 받은 시각과 사유, 대기 시각이 지금보다 뒤면 대기 문구. '다시 불러오기'는 대기 시각까지 누를 수 없다
// 호출 쪽 규칙: 지난 목록 없이 대기만 있는 경우(reason은 rate_limit)는 props로 구분할 수 없다. 대기가 끝나면 아래 지난 목록 문구가
// 거짓이 되므로, 그 경우 호출 쪽이 useCooldown(retryAt) !== null일 때만 그린다(지난 목록이 있으면 대기가 끝나도 그린다).
export function StaleNotice({
	provider,
	fetchedAt,
	reason,
	retryAt,
	reloading,
	onReload,
}: {
	provider: ProviderId;
	fetchedAt: string;
	reason: ProviderFailure;
	retryAt: string | null;
	reloading: boolean;
	onReload: () => void;
}) {
	const cooldown = useCooldown(retryAt);
	const text = cooldown
		? cooldownText(cooldown)
		: `${PROVIDER_LABEL[provider]}에 연결하지 못해 ${agoText(fetchedAt, new Date())} 전에 받은 목록을 보여 드려요. ${problemCopy(provider, reason).description}`;
	return (
		<div
			role="status"
			className="flex flex-wrap items-center gap-3 rounded-xl bg-warning-subtle px-4 py-3 text-warning"
		>
			<p className="flex-1">{text}</p>
			<Button
				variant="outline"
				size="lg"
				focusableWhenDisabled
				disabled={reloading || cooldown !== null}
				className={lockedButton(cooldown !== null)}
				onClick={onReload}
			>
				다시 불러오기
			</Button>
		</div>
	);
}
