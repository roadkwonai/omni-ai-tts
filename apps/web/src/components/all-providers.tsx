"use client";

import {
	type UseQueryResult,
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type {
	ProviderId,
	Voice,
	VoiceListResult,
} from "@tts-pilot-app/api/providers/contract";
import { type ReactNode, type RefObject, useRef } from "react";

import { PROVIDER_LABEL } from "@/lib/connection-view";
import { keepFirstPage } from "@/lib/list-query";
import {
	initialList,
	type ServerProvider,
	withSearch,
} from "@/lib/provider-conditions";
import {
	EMPTY_FILTERS,
	EMPTY_GEMINI_FILTERS,
	filterByNameOrId,
	filterGemini,
	filterVoices,
} from "@/lib/voice-filter";
import { bundleOf } from "@/lib/voice-view";

import { CastingWorkspace } from "./casting-workspace";
import { SignInNotice } from "./notice";
import { ONE_LIST_OPTIONS } from "./one-list";
import { serverListOptions } from "./server-voice-list";
import { VoiceConditions } from "./voice-conditions";
import {
	RowSkeleton,
	StaleNotice,
	useSearchCommit,
	VoiceShelf,
} from "./voice-list-parts";
import { Problem, useListRecovery } from "./voice-problem";
import { RowList, type Select } from "./voice-row";

// 묶음 하나(브리프 5·8절 '전체' 탭)
type Bundle = {
	provider: ProviderId;
	query: Pick<
		UseQueryResult,
		"error" | "isError" | "isFetching" | "isRefetching" | "isRefetchError"
	>;
	// 지금 검색어의 첫 페이지(Typecast는 목록 하나). 받기 전이면 없다
	first: VoiceListResult | undefined;
	// 받는 중(공급자 탭이 같은 키로 받는 다음 페이지는 빼고)
	busy: boolean;
	voices: Voice[];
	countLabel: string | null;
	// 첫 페이지를 다시 받는다. 성공하면 그 페이지, 실패하면 undefined
	reload: () => Promise<VoiceListResult | undefined>;
};

// Typecast·Airy·Gemini 탭과 같은 쿼리(목록 하나)를 브라우저에서 검색어로 거른다. 검색은 그 탭과 같다
// (Typecast 이름, Airy 이름·성우 id, Gemini 이름·성우 id·설명. 묶음 인원과 '모두 보기 →' 뒤 탭 인원이 같다, 계획 리뷰 R4-5)
function useOneListBundle(
	provider: "typecast" | "airy" | "gemini",
	search: string,
): Bundle {
	const query = useQuery(ONE_LIST_OPTIONS[provider]);
	const all = query.data?.voices ?? [];
	const found =
		provider === "typecast"
			? filterVoices(all, search, EMPTY_FILTERS)
			: provider === "gemini"
				? filterGemini(all, search, EMPTY_GEMINI_FILTERS)
				: filterByNameOrId(all, search, []);
	return {
		provider,
		query,
		first: query.data,
		busy: query.isFetching,
		...bundleOf(found, {
			total: query.data ? found.length : null,
			totalExact: true,
			of: search === "" ? undefined : all.length,
		}),
		reload: () =>
			query
				.refetch({ cancelRefetch: false })
				.then((result) => (result.isError ? undefined : result.data)),
	};
}

// 공급자 탭의 시작 조건(공개·한국어·기본 정렬) + 검색어와 같은 쿼리 인자라 브라우저 키가 같다(계획 리뷰 E15). 첫 페이지만 보인다
function useServerBundle(provider: ServerProvider, search: string): Bundle {
	const queryClient = useQueryClient();
	const options = serverListOptions(
		withSearch(initialList(provider, "public"), search),
	);
	// 검색어를 바꿔 받는 동안 앞 검색어의 묶음을 끼우지 않고 뼈대를 보인다(브리프 8절).
	// placeholderData는 관찰자 옵션이라 끄더라도 키는 공급자 탭과 같다
	const query = useInfiniteQuery({ ...options, placeholderData: undefined });
	const first = query.data?.pages[0];
	return {
		provider,
		query,
		first,
		busy: query.isFetching && !query.isFetchingNextPage,
		...bundleOf(first?.voices ?? [], {
			total: first?.total ?? null,
			totalExact: first?.totalExact ?? true,
		}),
		reload: () => {
			// 공급자 탭이 같은 키에 이어 붙인 페이지를 모두 다시 부르지 않는다(첫 페이지만)
			keepFirstPage(queryClient, { queryKey: options.queryKey, exact: true });
			return query
				.refetch({ cancelRefetch: false })
				.then((result) => (result.isError ? undefined : result.data?.pages[0]));
		},
	};
}

// 묶음 하나: 지난 목록이면 묶음 위 안내 줄, 머리(이름·인원·'모두 보기 →')는 늘, 본문은 사유 안내·뼈대·0명 한 줄·앞 5명 행 중 하나.
// 한 묶음의 상태가 다른 묶음을 바꾸지 않는다(AC2, REQ-02)
function ProviderBundle({
	bundle,
	onShowAll,
	searchRef,
	selectedKey,
	select,
	panelId,
}: {
	bundle: Bundle;
	onShowAll: () => void;
	searchRef: RefObject<HTMLInputElement | null>;
	selectedKey: string | null;
	select: Select;
	panelId?: string;
}) {
	const { provider, query, first } = bundle;
	const label = PROVIDER_LABEL[provider];
	const { unauthorized, problem, notice, retryAt, reload } = useListRecovery({
		query,
		first,
		refetch: bundle.reload,
		searchRef,
	});

	const shelf = (body: ReactNode) => (
		<VoiceShelf
			title={label}
			countLabel={bundle.countLabel}
			busy={bundle.busy}
			showAllLabel={`${label} 모두 보기`}
			onShowAll={onShowAll}
		>
			{body}
		</VoiceShelf>
	);
	// 세션 만료는 페이지가 탭 대신 로그인 안내로 바꾼다(Typecast 쿼리). 그 전에 이 묶음이 먼저 받으면 같은 안내를 본문에 보인다
	if (unauthorized) return shelf(<SignInNotice />);

	return (
		<div className="flex flex-col gap-3">
			{notice ? (
				<StaleNotice
					provider={provider}
					fetchedAt={notice.fetchedAt}
					reason={notice.reason}
					retryAt={retryAt}
					reloading={query.isFetching}
					onReload={reload}
				/>
			) : null}
			{shelf(
				problem ? (
					<Problem
						compact
						provider={provider}
						failure={problem.failure}
						reloading={query.isFetching}
						onReload={reload}
						retryAt={problem.retryAt}
					/>
				) : !first ? (
					<RowSkeleton announce={false} />
				) : bundle.voices.length === 0 ? (
					// 검색 칸의 ×가 해제 수단이라 '조건 모두 해제'가 없다
					<p className="text-muted-foreground">조건에 맞는 성우가 없어요</p>
				) : (
					<RowList
						voices={bundle.voices}
						selectedKey={selectedKey}
						select={select}
						panelId={panelId}
						// 같은 키를 다시 받는 동안 지금 행은 흐리게 두고 누를 수 없다(브리프 8절)
						refreshing={query.isRefetching}
					/>
				),
			)}
		</div>
	);
}

// '전체' 탭(브리프 5·8절, 스펙 AC2): 검색 칸 하나와 공급자 묶음 다섯(Typecast → ElevenLabs → Fish Audio → Airy → Gemini), 오른쪽 패널.
// 검색어는 부모가 든다('모두 보기 →'가 그 공급자 탭으로 가져간다)
export function AllProviders({
	search,
	onSearchChange,
	onShowProvider,
	chosen,
	onChoose,
}: {
	search: string;
	onSearchChange: (search: string) => void;
	onShowProvider: (provider: ProviderId) => void;
	chosen: string | null;
	onChoose: (key: string) => void;
}) {
	const searchRef = useRef<HTMLInputElement>(null);
	const draft = useSearchCommit(search, onSearchChange);
	const typecast = useOneListBundle("typecast", search);
	const elevenlabs = useServerBundle("elevenlabs", search);
	const fishAudio = useServerBundle("fish_audio", search);
	const airy = useOneListBundle("airy", search);
	const gemini = useOneListBundle("gemini", search);
	const bundles = [typecast, elevenlabs, fishAudio, airy, gemini];
	// 받기 전인 묶음이 있다(사유 안내가 뜬 묶음은 빼고). 묶음 뼈대는 알리지 않고 여기서 한 번만 알린다(첫 로딩이 다섯 번 읽히지 않게)
	const pending = bundles.some(
		(bundle) => !bundle.first && !bundle.query.isError,
	);

	return (
		<div className="flex flex-col gap-4">
			{pending ? (
				<span className="sr-only" role="status">
					성우 목록을 불러오고 있어요
				</span>
			) : null}
			<VoiceConditions
				search={{
					value: draft.draft,
					placeholder: "이름으로 찾기",
					label: "모든 음성 서비스의 성우 이름으로 찾기",
					onChange: draft.setDraft,
					onSubmit: draft.submit,
				}}
				axes={[]}
				// 처음 불러오는 중에만 잠근다(계획 리뷰 D4). 기준은 키가 바뀌지 않는 Typecast 목록이다.
				// 서버 묶음은 검색어마다 새 키라 받는 중을 기준으로 삼으면 입력 중에 칸이 잠긴다
				disabled={!typecast.first && typecast.query.isFetching}
				selectedCount={0}
				searchRef={searchRef}
			/>
			<CastingWorkspace
				// 다섯 묶음의 앞 5명을 보이는 순서대로 잇는다
				voices={bundles.flatMap((bundle) => bundle.voices)}
				chosen={chosen}
				onChoose={onChoose}
				pending={pending}
			>
				{({ selectedKey, select, panelId }) => (
					<div className="flex flex-col gap-10">
						{bundles.map((bundle) => (
							<ProviderBundle
								key={bundle.provider}
								bundle={bundle}
								onShowAll={() => onShowProvider(bundle.provider)}
								searchRef={searchRef}
								selectedKey={selectedKey}
								select={select}
								panelId={panelId}
							/>
						))}
					</div>
				)}
			</CastingWorkspace>
		</div>
	);
}
