"use client";

import {
	keepPreviousData,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { ProviderId } from "@tts-pilot-app/api/providers/contract";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import {
	type ComponentProps,
	type MouseEvent,
	useEffect,
	useRef,
	useState,
} from "react";

import { PROVIDER_LABEL } from "@/lib/connection-view";
import { keepFirstPage } from "@/lib/list-query";
import {
	accentOptions,
	axesOf,
	conditionCount,
	firstPage,
	initialList,
	inputOf,
	isInitial,
	type ServerList,
	sortOf,
	withSearch,
} from "@/lib/provider-conditions";
import { failureOf } from "@/lib/voice-failure";
import {
	countText,
	flattenPages,
	listEnd,
	moreCountText,
} from "@/lib/voice-view";
import { orpc } from "@/utils/orpc";

import { CastingWorkspace } from "./casting-workspace";
import { Notice, SignInNotice } from "./notice";
import { type AxisView, SortMenu, VoiceConditions } from "./voice-conditions";
import {
	LIST_QUERY,
	ListStatusBar,
	RowSkeleton,
	StaleNotice,
	useSearchCommit,
} from "./voice-list-parts";
import {
	EmptyList,
	lockedButton,
	NoMatches,
	Problem,
	problemCopy,
	useListRecovery,
} from "./voice-problem";
import { RowList, type Select } from "./voice-row";

// 캐스팅은 행을 골라 옆 패널에 보이고(onChoose), 드라마 성우 고르기 창은 행 누름이 고르기다(pick, 옆 패널 없음, T9.5 계획 '스펙과 다른 점' 8).
// 모드 둘이라 판별 유니온으로 가른다. 다섯 공급자 목록(OneList 포함)이 같은 유니온을 받는다. 세 번째 모드가 생기면 목록 몸통을 빼서 변형 컴포넌트로 나눈다(계획 재사용 표)
export type Choice =
	| { onChoose: (key: string) => void; pick?: never; busyKey?: never }
	// busyKey: 고른 성우를 담는 중인 행(행에 스피너, 브리프 5.7)
	| { pick: Select; busyKey?: string | null; onChoose?: never };

export function ListWorkspace(
	props: Omit<ComponentProps<typeof CastingWorkspace>, "onChoose"> & Choice,
) {
	if (props.pick)
		return props.children({ selectedKey: props.chosen, select: props.pick });
	return <CastingWorkspace {...props} />;
}

// 목록 쿼리 인자. '전체' 탭 묶음이 같은 인자를 써서 브라우저 키가 같다(계획 리뷰 E15).
// 키에 첫 페이지 입력(조건 전부)이 들어가므로 조건마다 쿼리가 따로 있고 늦은 응답이 다른 조건의 목록을 덮지 않는다(Review Focus 1)
export const serverListOptions = (list: ServerList) =>
	orpc.voiceList.infiniteOptions({
		input: (page: number | string | null) => inputOf(list, page),
		initialPageParam: firstPage(list) as number | string | null,
		getNextPageParam: (last) => last.next,
		// 조건을 바꿔 다시 받는 동안 지금 목록을 흐리게 둔다(브리프 8절)
		placeholderData: keepPreviousData,
		...LIST_QUERY,
		throwOnError: (error) => failureOf(error) === null,
	});

// '목록 새로 고침'(스펙 5절, 계획 리뷰 D3·E14): 서버가 그 공급자 캐시를 만료로 바꾸면, 그 공급자의 브라우저 목록을 첫 페이지만 남기고 무효로 한다.
// 보고 있는 목록은 첫 페이지만 다시 받는 동안 그대로 보인다('다시 받는 중'). 억양 쿼리는 입력에 공급자가 없어 건드리지 않는다.
export function useListRefresh(provider: ProviderId) {
	const queryClient = useQueryClient();
	// 탭 내용이 남아 있으므로(keepMounted) 탭을 오가도 대기 시각이 남는다(계획 리뷰 D14)
	const [blockedUntil, setBlockedUntil] = useState<string | null>(null);
	const mutation = useMutation(
		orpc.voiceListRefresh.mutationOptions({
			onSuccess: ({ retryAt }) => {
				setBlockedUntil(retryAt);
				// 429 대기 중이면 서버가 만료로 바꾸지 않았다. 목록은 그대로 둔다
				if (retryAt) return;
				const queryKey = orpc.voiceList.key({ input: { provider } });
				keepFirstPage(queryClient, { queryKey });
				void queryClient.invalidateQueries({ queryKey });
			},
		}),
	);
	return {
		refresh: () => mutation.mutate({ provider }),
		pending: mutation.isPending,
		blockedUntil,
	};
}

export function ServerVoiceList({
	list,
	onListChange,
	chosen,
	focusRequested,
	onFocusHandled,
	...choice
}: {
	list: ServerList;
	onListChange: (list: ServerList) => void;
	chosen: string | null;
	// '전체' 탭 '모두 보기 →'가 이 목록에 포커스를 넘겼다(계획 리뷰 D8). 마운트·갱신 때 인원 글자로 옮기고 onFocusHandled로 요청을 지운다.
	// 한 번 쓰고 없어지는 요청이라 출처를 바꿔 목록이 다시 마운트돼도 포커스를 가져가지 않는다
	focusRequested: boolean;
	onFocusHandled: () => void;
} & Choice) {
	const { provider, source } = list;
	const label = PROVIDER_LABEL[provider];
	const queryClient = useQueryClient();
	const searchRef = useRef<HTMLInputElement>(null);
	const countRef = useRef<HTMLParagraphElement>(null);
	const listRef = useRef<HTMLUListElement>(null);
	// '더 보기'를 누른 때의 행 수·페이지 수·그 버튼. 새 페이지가 그려지면 그 첫 행으로 포커스를 옮긴다
	const focusAfter = useRef<{
		rows: number;
		pages: number;
		button: HTMLButtonElement;
	} | null>(null);

	useEffect(() => {
		if (!focusRequested) return;
		countRef.current?.focus();
		onFocusHandled();
	}, [focusRequested, onFocusHandled]);
	const search = useSearchCommit(list.query.search, (value) =>
		onListChange(withSearch(list, value)),
	);
	const options = serverListOptions(list);
	const voices = useInfiniteQuery(options);
	const language = list.query.language;
	const accents = useQuery(
		orpc.voiceAccents.queryOptions({
			input: { language: language ?? "ko" },
			enabled: provider === "elevenlabs" && language !== null,
			...LIST_QUERY,
		}),
	);
	const { refresh, pending, blockedUntil } = useListRefresh(provider);

	const pages = voices.data?.pages;
	const rows = flattenPages(pages ?? []);
	const pageCount = pages?.length ?? 0;
	// 지금 조건의 첫 페이지. 조건을 바꿔 받는 중(placeholder)에는 앞 조건의 목록이라 없는 것으로 본다
	const current = voices.isPlaceholderData ? undefined : pages?.[0];
	const last = pages?.at(-1);
	const { unauthorized, failure, problem, notice, retryAt, cooldown, reload } =
		useListRecovery({
			query: voices,
			first: current,
			blockedUntil,
			refetch: () => {
				// 이어 붙인 페이지를 모두 다시 부르지 않는다. 이 쿼리만 첫 페이지로 잘라 다시 받는다
				keepFirstPage(queryClient, { queryKey: options.queryKey, exact: true });
				return voices
					.refetch({ cancelRefetch: false })
					.then((result) =>
						result.isError ? undefined : result.data?.pages[0],
					);
			},
			searchRef,
		});

	useEffect(() => {
		const after = focusAfter.current;
		if (after === null || pageCount <= after.pages) return;
		focusAfter.current = null;
		// 그동안 사용자가 다른 곳으로 옮겼으면 가져오지 않는다. 눌렀던 버튼이 목록 끝에서 사라져 포커스가 body로 빠졌으면 옮긴다
		const active = document.activeElement;
		if (
			active !== after.button &&
			active !== document.body &&
			active !== null
		) {
			return;
		}
		listRef.current?.children[after.rows]
			?.querySelector<HTMLElement>("[data-select]")
			?.focus();
	}, [pageCount]);

	// 세션 만료. 탭과 조건 줄 대신 로그인 안내 하나다(Task 12a가 페이지 전체를 바꾼다)
	if (unauthorized) return <SignInNotice />;

	// 억양 목록을 받지 못하면 억양 드롭다운 안에 사유를 보인다(계획 리뷰 D23)
	const accentFailure = accents.isError ? failureOf(accents.error) : null;
	const accentHint = accents.isError
		? problemCopy(
				"elevenlabs",
				accentFailure === null || accentFailure === "unauthorized"
					? "provider_error"
					: accentFailure,
			).description
		: undefined;
	const axes: AxisView[] = axesOf(
		list,
		accentOptions(accents.data?.accents ?? [], language),
	).map((axis) =>
		axis.kind === "toggle"
			? {
					...axis,
					onChange: (on: boolean) => onListChange(axis.apply(on)),
				}
			: {
					...axis,
					// 언어를 고르기 전 안내(axis.hint)가 억양 목록 실패 사유보다 앞선다
					hint: axis.hint ?? (axis.key === "accent" ? accentHint : undefined),
					onChange: (values: string[]) => onListChange(axis.apply(values)),
				},
	);
	const sort = sortOf(list);

	// 앞 조건의 결과가 0명이면 그 빈 페이지가 placeholder가 된다. 새 조건을 받는 동안 빈 상태 안내를 보이지 않고 뼈대를 보인다
	const loading =
		!problem && (!pages || (voices.isPlaceholderData && rows.length === 0));
	// 첫 페이지를 다시 받는 중(새로 고침, 다시 불러오기, 조건 바꿈)이거나 '목록 새로 고침' 변경 호출이 진행 중이다. 다음 페이지 받기는 빠진다(query-core isRefetching).
	// 이 동안 목록은 흐리고 누를 수 없으며 '더 보기'도 막는다(브리프 8절)
	const refreshing = voices.isRefetching || pending;
	// 처음 불러오는 중에만 조건 줄과 정렬을 잠근다. 오류가 나도 열어 두어 조건을 바꿔 빠져나갈 수 있다(계획 리뷰 D4)
	const locked = !pages && voices.isFetching;

	function clearAll() {
		onListChange(initialList(provider, source));
		searchRef.current?.focus();
	}
	function showMore(event: MouseEvent<HTMLButtonElement>) {
		focusAfter.current = {
			rows: rows.length,
			pages: pageCount,
			button: event.currentTarget,
		};
		// 다시 받는 중에 눌러도 그 요청을 끊지 않는다(같은 틱에 두 번 눌러도 한 번만 나간다)
		void voices.fetchNextPage({ cancelRefetch: false }).then((result) => {
			if (result.isError) focusAfter.current = null;
		});
	}

	const end = last ? listEnd(last) : "end";
	// '더 보기' 옆 인원도 상태 줄과 같은 첫 페이지 값을 쓴다(공급자 total이 페이지 사이에 바뀌어도 두 인원이 어긋나지 않는다). 조건을 바꿔 다시 받는 중에는 current가 없어 last 값이다
	const totalPage = current ?? last;
	const total = totalPage?.total ?? null;
	const nextFailure = voices.isFetchNextPageError ? failure : null;

	return (
		<div className="flex flex-col gap-4">
			<VoiceConditions
				search={{
					value: search.draft,
					placeholder:
						provider === "elevenlabs" ? "이름·설명으로 찾기" : "제목으로 찾기",
					label:
						provider === "elevenlabs"
							? "성우 이름·설명으로 찾기"
							: "성우 제목으로 찾기",
					onChange: search.setDraft,
					onSubmit: search.submit,
				}}
				axes={axes}
				disabled={locked}
				selectedCount={conditionCount(list)}
				searchRef={searchRef}
			/>
			<ListStatusBar
				count={countText({
					provider,
					source,
					language,
					total: current?.total ?? null,
					totalExact: current?.totalExact ?? true,
				})}
				countRef={countRef}
				busy={voices.isFetching && !voices.isFetchingNextPage}
				extra={
					// 조건이 시작값이 아니면 Typecast와 같은 링크(사용자 결정 2026-10-05). 문제 안내에는 같은 버튼이 따로 있다
					!isInitial(list) && !problem ? (
						<Button variant="link" size="lg" onClick={clearAll}>
							조건 모두 해제
						</Button>
					) : null
				}
				sort={
					<SortMenu
						sort={{
							options: sort.options,
							value: sort.value,
							onChange: (value) => onListChange(sort.apply(value)),
						}}
						disabled={locked}
					/>
				}
				fetchedAt={current?.fetchedAt ?? null}
				// 문제·지난 목록 안내가 보이는 동안은 숨긴다. 안내의 '다시 불러오기'가 회복 버튼 하나다(사용자 결정 2026-10-05)
				refresh={
					problem || notice
						? null
						: {
								onRefresh: refresh,
								disabled: pending || voices.isFetching || cooldown !== null,
							}
				}
			/>
			{notice ? (
				<StaleNotice
					provider={provider}
					fetchedAt={notice.fetchedAt}
					reason={notice.reason}
					retryAt={retryAt}
					reloading={voices.isFetching}
					onReload={reload}
				/>
			) : null}
			<ListWorkspace
				voices={problem ? [] : rows}
				provider={provider}
				chosen={chosen}
				{...choice}
				pending={loading}
			>
				{({ selectedKey, select, panelId }) => {
					if (problem) {
						return (
							<Problem
								provider={provider}
								failure={problem.failure}
								reloading={voices.isFetching}
								onReload={reload}
								retryAt={problem.retryAt}
								onClear={isInitial(list) ? undefined : clearAll}
							/>
						);
					}
					if (loading) return <RowSkeleton />;
					// 빈 상태는 지금 조건의 결과일 때만 그린다(placeholder의 빈 페이지는 위 loading이 가린다)
					if (rows.length === 0) {
						if (!isInitial(list)) return <NoMatches onClear={clearAll} />;
						return source === "public" ? (
							<EmptyList
								provider={provider}
								reloading={pending || voices.isFetching}
								waiting={cooldown !== null}
								onReload={refresh}
							/>
						) : (
							<Notice
								title={`${label} 계정에 성우가 없어요`}
								description={`${label} 웹에서 만들거나 저장한 성우가 여기에 보여요.`}
							/>
						);
					}
					return (
						<>
							<RowList
								ref={listRef}
								voices={rows}
								label={`${label} 성우 목록`}
								selectedKey={selectedKey}
								select={select}
								panelId={panelId}
								// 첫 페이지를 다시 받는 동안 지금 목록은 흐리게 두고 누를 수 없다
								refreshing={refreshing}
								busyKey={choice.busyKey}
							/>
							{end === "more" ? (
								<div className="mt-4 flex flex-col items-center gap-2">
									{nextFailure && !voices.isFetchingNextPage ? (
										<p role="alert" className="text-sm text-warning">
											다음 성우를 불러오지 못했어요.{" "}
											{problemCopy(provider, nextFailure).description}
										</p>
									) : null}
									<div className="flex flex-wrap items-center justify-center gap-3">
										<Button
											variant="outline"
											size="lg"
											// 받는 중에도 포커스를 지킨다(계획 리뷰 E13)
											focusableWhenDisabled
											disabled={voices.isFetchingNextPage || refreshing}
											className={lockedButton(refreshing)}
											onClick={showMore}
										>
											{voices.isFetchingNextPage ? (
												<Spinner data-icon="inline-start" aria-hidden="true" />
											) : null}
											더 보기
										</Button>
										<span className="text-muted-foreground text-sm tabular-nums">
											{moreCountText(
												rows.length,
												total,
												totalPage?.totalExact === true,
											)}
										</span>
									</div>
								</div>
							) : null}
							{end === "limit" ? (
								<p className="mt-4 text-center text-muted-foreground text-sm">
									Fish Audio는 조건마다 처음 1,000명까지만 보여 줘요. 조건을
									좁혀 보세요.
								</p>
							) : null}
						</>
					);
				}}
			</ListWorkspace>
		</div>
	);
}
