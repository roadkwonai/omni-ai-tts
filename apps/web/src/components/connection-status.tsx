"use client";

import { ORPCError } from "@orpc/client";
import { useQueries } from "@tanstack/react-query";
import type {
	ProviderId,
	ProviderStatusResult,
} from "@tts-pilot-app/api/providers/contract";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@tts-pilot-app/ui/components/empty";
import { Info, Link2 } from "lucide-react";
import { Fragment, useState } from "react";

import { orpc } from "@/utils/orpc";

import {
	PROVIDER_LABEL,
	ProviderStatusCard,
	STATUS_LABEL,
} from "./provider-status-card";

const PROVIDER_ORDER = [
	"typecast",
	"elevenlabs",
	"fish_audio",
] as const satisfies readonly ProviderId[];

type QueryState = {
	data?: ProviderStatusResult;
	isError: boolean;
	errorUpdatedAt: number;
};

// 조회 자체가 실패하면(자체 서버 500, 연결 끊김, CSRF 403) 확인 실패와 같은 모양으로 보인다(스펙 4절).
// 데이터 없이 실패한 조회를 다시 확인하는 동안 query-core(5.103.2 fetchState)는 오류를 지우고 pending으로 돌린다.
// errorUpdatedAt은 남으므로 그때도 확인 실패를 유지한다(첫 확인 중으로 돌아가지 않게, 브리프 6절).
function toView(
	provider: ProviderId,
	query: QueryState,
): ProviderStatusResult | undefined {
	const failed =
		query.isError || (query.data === undefined && query.errorUpdatedAt > 0);
	if (!failed) return query.data;
	return {
		provider,
		status: "check_failed",
		quota: null,
		providerCode: null,
		retryAfterSeconds: null,
		checkedAt: new Date(query.errorUpdatedAt).toISOString(),
	};
}

const isUnauthorized = (error: unknown) =>
	error instanceof ORPCError && error.code === "UNAUTHORIZED";

// 브리프 5절 표. 공급자 이름은 카드 순서(provider)로 고른다. 다시 확인 중에는 이전 결과로 센다.
function SummaryBanner({
	views,
}: {
	views: { provider: ProviderId; view: ProviderStatusResult | undefined }[];
}) {
	const pending = views.some(({ view }) => view === undefined);
	const problems = views.filter(({ view }) => view?.status !== "connected");
	const title = pending
		? "연결 상태를 확인하고 있어요"
		: problems.length === 0
			? `${views.length}개 모두 연결됨`
			: `${views.length}개 중 ${views.length - problems.length}개 연결됨`;
	return (
		<div className="flex items-center gap-3 rounded-xl bg-primary-subtle px-5 py-4">
			<Info
				aria-hidden="true"
				className="size-5 shrink-0 fill-primary text-primary-foreground"
			/>
			<p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<strong className="font-bold text-lg text-primary">{title}</strong>
				{pending || problems.length === 0 ? null : (
					<span className="text-muted-foreground text-sm">
						{problems.map(({ provider, view }, index) => (
							<Fragment key={provider}>
								{index === 0 ? null : " "}
								<span className="whitespace-nowrap">
									{index === 0 ? null : "· "}
									<span translate="no">{PROVIDER_LABEL[provider]}</span>{" "}
									{view ? STATUS_LABEL[view.status] : ""}
								</span>
							</Fragment>
						))}
					</span>
				)}
			</p>
		</div>
	);
}

// 세 공급자의 조회를 한곳에서 든다. 소유자 없음 판단과 스크린 리더 알림을 여기서만 한다.
export function ConnectionStatus() {
	const queries = useQueries({
		queries: PROVIDER_ORDER.map((provider) =>
			orpc.providerStatus.queryOptions({
				input: { provider },
				// 5분 안에 다시 열면 이전 결과를 쓴다. 그 밖의 확인은 '다시 확인하기' 버튼으로만 한다(스펙 2절).
				staleTime: 5 * 60 * 1000,
				// 데이터 없이 실패한 결과(소유자 없음 포함)도 캐시에 있는 동안 다시 열 때 그대로 쓴다(기본값이면 마운트 때 다시 불러 잠깐 확인 실패 카드가 보인다).
				retryOnMount: false,
				// 루프백으로만 붙으니 브라우저 offline 판단으로 조회를 멈추지 않는다(멈추면 버튼과 스켈레톤이 그대로 남는다).
				networkMode: "always",
				retry: false,
				refetchOnWindowFocus: false,
				refetchOnReconnect: false,
				meta: { toast: false },
			}),
		),
	});
	const [announcement, setAnnouncement] = useState("");

	if (queries.some((query) => isUnauthorized(query.error))) {
		return (
			<Empty className="border bg-card">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Link2 aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>이 주소에서는 공급자 연결을 확인할 수 없어요</EmptyTitle>
					<EmptyDescription>
						개발 서버(
						<code translate="no" className="font-mono">
							pnpm dev
						</code>
						)를 127.0.0.1 또는 localhost 주소로 열어 주세요.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	const views = PROVIDER_ORDER.map((provider, index) => ({
		provider,
		view: toView(provider, queries[index]),
	}));

	return (
		<div className="flex flex-col gap-7">
			<SummaryBanner views={views} />
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{views.map(({ provider, view }, index) => {
					const query = queries[index];
					return (
						<ProviderStatusCard
							key={provider}
							provider={provider}
							result={view}
							checking={query.isFetching}
							onRecheck={async () => {
								// 사용자가 누른 확인의 결과만 알린다. 비웠다가 채워 같은 문장도 다시 읽히게 한다.
								setAnnouncement("");
								const next = toView(provider, await query.refetch());
								if (next) {
									setAnnouncement(
										`${PROVIDER_LABEL[provider]}: ${STATUS_LABEL[next.status]}`,
									);
								}
							}}
						/>
					);
				})}
			</div>
			<p role="status" className="sr-only">
				{announcement}
			</p>
		</div>
	);
}
