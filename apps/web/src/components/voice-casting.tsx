"use client";

import { useQuery } from "@tanstack/react-query";
import type {
	ProviderFailure,
	Voice,
} from "@tts-pilot-app/api/providers/contract";
import { Button, buttonVariants } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { ArrowRight, KeyRound, SearchX, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useRef, useState } from "react";

import { failureOf } from "@/lib/voice-failure";
import {
	EMPTY_FILTERS,
	filterOptions,
	filterVoices,
	groupByUseCase,
	hasConditions,
	labelOf,
	USE_CASE_LABEL,
	type VoiceFilters,
} from "@/lib/voice-filter";
import { orpc } from "@/utils/orpc";

import { LoopbackNotice, Notice } from "./notice";
import { SamplePlayerProvider } from "./sample-player";
import { VoiceCard } from "./voice-card";
import { VoiceConditions } from "./voice-conditions";

const SHELF_SIZE = 5;
const numberFormat = new Intl.NumberFormat("ko-KR");
const count = (value: number) => `${numberFormat.format(value)}명`;

type ProblemCopy = {
	title: string;
	description: string;
	connections: boolean;
	reload: boolean;
};
// 키 오류와 권한 부족은 같은 안내다(브리프 7절).
const authProblem: ProblemCopy = {
	title: "Typecast 키를 확인해 주세요",
	description: "키가 틀렸거나 쓸 수 없는 키예요.",
	connections: true,
	reload: true,
};
// 브리프 7절 화면 상태표. 공급자 이름은 지금 Typecast뿐이다(T4·T5에서 공급자별로 넓힌다).
const PROBLEM: Record<ProviderFailure, ProblemCopy> = {
	no_key: {
		title: "Typecast 키가 없어요",
		description: "서버 환경변수에 키를 넣고 개발 서버를 다시 켜 주세요.",
		connections: true,
		reload: false,
	},
	provider_auth: authProblem,
	no_permission: authProblem,
	quota: {
		title: "Typecast 사용량이 부족해요",
		description: "남은 크레딧을 연결 상태에서 확인해 주세요.",
		connections: true,
		reload: true,
	},
	rate_limit: {
		title: "요청이 많아 잠시 막혔어요",
		description: "잠시 뒤 다시 불러와 주세요.",
		connections: false,
		reload: true,
	},
	provider_error: {
		title: "Typecast에 문제가 생겼어요",
		description: "잠시 뒤 다시 불러와 주세요.",
		connections: false,
		reload: true,
	},
	unknown_outcome: {
		title: "Typecast가 응답하지 않아요",
		description: "잠시 뒤 다시 불러와 주세요.",
		connections: false,
		reload: true,
	},
};

function ReloadButton({
	reloading,
	onReload,
}: {
	reloading: boolean;
	onReload: () => void;
}) {
	return (
		<Button
			size="lg"
			focusableWhenDisabled
			disabled={reloading}
			className="aria-disabled:pointer-events-none"
			onClick={onReload}
		>
			{reloading ? (
				<Spinner data-icon="inline-start" aria-hidden="true" />
			) : null}
			다시 불러오기
		</Button>
	);
}

// 사유별 안내. 새로 나타나면 스크린 리더가 읽는다(role="alert").
function Problem({
	failure,
	reloading,
	onReload,
}: {
	failure: ProviderFailure;
	reloading: boolean;
	onReload: () => void;
}) {
	const { title, description, connections, reload } = PROBLEM[failure];
	return (
		<Notice
			role="alert"
			icon={failure === "no_key" ? KeyRound : TriangleAlert}
			title={title}
			description={description}
		>
			{connections ? (
				<Link
					href="/connections"
					className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
				>
					연결 상태 보기
				</Link>
			) : null}
			{reload ? (
				<ReloadButton reloading={reloading} onReload={onReload} />
			) : null}
			{/* 다시 불러오는 동안 스크린 리더에 진행을 알린다(첫 로딩과 같은 문구) */}
			{reloading ? (
				<span className="sr-only" role="status">
					성우 목록을 불러오고 있어요
				</span>
			) : null}
		</Notice>
	);
}

// 콘텐츠 선반 하나(브리프 5절). '콘텐츠 정보 없음' 선반은 onShowAll이 없고, 인원이 SHELF_SIZE 이하면 전원이 보이므로 '모두 보기 →'를 숨긴다.
function Shelf({
	title,
	total,
	voices,
	onShowAll,
}: {
	title: string;
	total: number;
	voices: Voice[];
	onShowAll: (() => void) | null;
}) {
	return (
		<section className="flex flex-col gap-1">
			<div className="flex items-center gap-2">
				{/* 선반 제목 20px(768 이상 24px), 카드 이름 18px(크기 단계) */}
				<h2 className="font-bold text-xl tracking-tight md:text-2xl">
					{title}
				</h2>
				<span className="text-muted-foreground text-sm tabular-nums">
					{count(total)}
				</span>
				{onShowAll && total > SHELF_SIZE ? (
					<Button
						variant="link"
						size="lg"
						// 화살표 끝을 카드 열의 오른쪽 끝에 맞춘다(누르는 영역은 그대로)
						className="-mr-2 ml-auto px-2 has-data-[icon=inline-end]:pr-2"
						aria-label={`${title} 모두 보기`}
						onClick={onShowAll}
					>
						모두 보기
						<ArrowRight data-icon="inline-end" aria-hidden="true" />
					</Button>
				) : null}
			</div>
			{/* 1439px 이하: 줄 안에서만 가로로 넘긴다(페이지는 넘치지 않게 본문 여백만큼 바깥으로 편다). 1440px 이상: 5열 */}
			<ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 md:-mx-11 md:scroll-px-11 md:px-11 2xl:mx-0 2xl:grid 2xl:grid-cols-5 2xl:overflow-visible 2xl:px-0 2xl:pb-0">
				{voices.map((voice) => (
					<li
						key={voice.voiceId}
						className="w-4/5 shrink-0 snap-start md:w-60 2xl:w-auto"
					>
						<VoiceCard voice={voice} />
					</li>
				))}
			</ul>
		</section>
	);
}

export function VoiceCasting() {
	const voices = useQuery(
		orpc.voiceList.queryOptions({
			input: { provider: "typecast" },
			// 받은 목록은 탭을 닫거나 새로 고칠 때까지 쓴다. 다시 받는 것은 '다시 불러오기'뿐이다(스펙 2절).
			staleTime: Number.POSITIVE_INFINITY,
			gcTime: Number.POSITIVE_INFINITY,
			retry: false,
			// 실패한 목록도 다른 화면에 갔다 와서 다시 부르지 않는다(스펙 3절·AC4). 오류 경계의 '다시 시도하기'는 error.tsx가 실패한 쿼리를 초기화해 다시 부른다.
			retryOnMount: false,
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
			// 루프백으로만 붙으니 브라우저 offline 판단으로 조회를 멈추지 않는다(T2와 같다).
			networkMode: "always",
			meta: { toast: false },
			// 사유를 아는 실패는 화면 안에서 보이고 그 밖은 오류 경계((app)/error.tsx)로 던진다.
			throwOnError: (error) => failureOf(error) === null,
		}),
	);
	const [query, setQuery] = useState("");
	const [filters, setFilters] = useState<VoiceFilters>(EMPTY_FILTERS);
	// 조건 없이 상단 '전체 보기'로 전체 격자를 보는 중
	const [showAll, setShowAll] = useState(false);
	// '다시 불러오기'를 누른 때의 사유. 다시 부르는 동안 query-core가 오류를 지우므로(lib/connection-view.ts toView 주석) 들고 있다가 문제 화면과 버튼 포커스를 지킨다.
	const [retrying, setRetrying] = useState<ProviderFailure | null>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const countRef = useRef<HTMLParagraphElement>(null);
	// 입력은 바로 바뀌고 목록 그리기는 뒤따른다(rerender-use-deferred-value). 상단 '전체 보기'의 전체 그리기도 클릭 응답을 막지 않게 미룬다.
	const deferredQuery = useDeferredValue(query);
	const deferredFilters = useDeferredValue(filters);
	const deferredShowAll = useDeferredValue(showAll);

	const failure = failureOf(voices.error);
	if (failure === "unauthorized") {
		return (
			<LoopbackNotice title="이 주소에서는 성우 목록을 불러올 수 없어요" />
		);
	}

	// 지금 보일 사유. 다시 부르는 동안에는 누른 때의 사유를 그대로 보인다.
	const shown = failure ?? (voices.isFetching ? retrying : null);
	const all = voices.data?.voices ?? [];
	// 공개 성우가 0명이면 고를 것이 없으므로 조건 줄도 잠근다.
	const usable = voices.data !== undefined && shown === null && all.length > 0;
	const active = hasConditions(query, filters);
	const filtered = hasConditions(deferredQuery, deferredFilters);
	const grid = filtered || deferredShowAll;
	const results = grid ? filterVoices(all, deferredQuery, deferredFilters) : [];

	function reload() {
		// 지금 보이는 사유(누를 수 있을 때는 failure와 같다)를 들고 있는다.
		setRetrying(shown);
		// 두 번 눌러도 진행 중인 요청을 끊고 새로 보내지 않는다(AC5, 공급자 호출 1회).
		void voices.refetch({ cancelRefetch: false }).then((result) => {
			setRetrying(null);
			// 다시 받았으면 사라진 버튼 대신 검색 칸으로 포커스를 옮긴다(브리프 8절의 선반 복귀와 같은 자리).
			if (result.data) requestAnimationFrame(() => searchRef.current?.focus());
		});
	}
	function clearAll() {
		setQuery("");
		setFilters(EMPTY_FILTERS);
		setShowAll(false);
		searchRef.current?.focus();
	}
	function showUseCase(useCase: string) {
		setQuery("");
		setFilters({ ...EMPTY_FILTERS, useCases: [useCase] });
		countRef.current?.focus();
	}
	function showEverything() {
		setShowAll(true);
		countRef.current?.focus();
	}

	// 인원 글자 옆 링크 버튼 하나: 조건이 있으면 '조건 모두 해제', 조건 없이 '전체 보기'로 왔으면 '콘텐츠별로 보기', 그 밖은 '전체 보기'.
	const link: { label: string; ariaLabel?: string; onClick: () => void } =
		active
			? { label: "조건 모두 해제", onClick: clearAll }
			: showAll
				? { label: "콘텐츠별로 보기", onClick: clearAll }
				: {
						label: "전체 보기",
						// 선반의 '모두 보기 →'와 구별한다(보이는 글자 포함)
						ariaLabel: "Typecast 성우 전체 보기",
						onClick: showEverything,
					};
	const summary = usable ? (
		<>
			<p
				ref={countRef}
				tabIndex={-1}
				role="status"
				className="rounded-sm text-muted-foreground tabular-nums outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
			>
				{filtered
					? `Typecast 성우 ${count(all.length)} 중 ${count(results.length)}`
					: `Typecast 성우 ${count(all.length)}`}
			</p>
			<Button
				variant="link"
				size="lg"
				className="px-2"
				aria-label={link.ariaLabel}
				onClick={link.onClick}
			>
				{link.label}
			</Button>
		</>
	) : null;

	let body: React.ReactNode;
	if (shown !== null) {
		body = (
			<Problem
				failure={shown}
				reloading={voices.isFetching}
				onReload={reload}
			/>
		);
	} else if (voices.data === undefined) {
		body = (
			<div
				role="status"
				className="flex items-center justify-center gap-2 py-14 text-muted-foreground"
			>
				<Spinner aria-hidden="true" />
				성우 목록을 불러오고 있어요
			</div>
		);
	} else if (all.length === 0) {
		body = (
			<Notice role="alert" title="Typecast가 준 공개 성우가 없어요">
				<ReloadButton reloading={voices.isFetching} onReload={reload} />
			</Notice>
		);
	} else if (grid && results.length === 0) {
		// 인원 글자(role="status")가 "614명 중 0명"을 이미 알리므로 role을 두지 않는다.
		body = (
			<Notice
				icon={SearchX}
				title="조건에 맞는 성우가 없어요"
				description="조건을 줄이거나 검색어를 바꿔 보세요."
			>
				<Button size="lg" variant="outline" onClick={clearAll}>
					조건 모두 해제
				</Button>
			</Notice>
		);
	} else if (grid) {
		body = (
			<section>
				<h2 className="sr-only">성우 목록</h2>
				<ul className="grid grid-cols-1 gap-4 md:grid-cols-cards 2xl:grid-cols-5">
					{results.map((voice) => (
						// 화면 밖 카드는 그리기를 미룬다(index.css .voice-card, 격자에만)
						<li key={voice.voiceId} className="voice-card">
							<VoiceCard voice={voice} />
						</li>
					))}
				</ul>
			</section>
		);
	} else {
		body = groupByUseCase(all).map(({ useCase, voices: members }) => (
			<Shelf
				key={useCase ?? "none"}
				title={
					useCase === null
						? "콘텐츠 정보 없음"
						: labelOf(USE_CASE_LABEL, useCase)
				}
				total={members.length}
				voices={useCase === null ? members : members.slice(0, SHELF_SIZE)}
				onShowAll={useCase === null ? null : () => showUseCase(useCase)}
			/>
		));
	}

	return (
		<SamplePlayerProvider>
			<div className="flex flex-col gap-10">
				<VoiceConditions
					query={query}
					onQueryChange={setQuery}
					filters={filters}
					onFiltersChange={setFilters}
					options={filterOptions(all)}
					disabled={!usable}
					searchRef={searchRef}
					summary={summary}
				/>
				{body}
			</div>
		</SamplePlayerProvider>
	);
}
