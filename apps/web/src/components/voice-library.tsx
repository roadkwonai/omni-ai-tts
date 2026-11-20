"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, buttonVariants } from "@tts-pilot-app/ui/components/button";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { PRESET_TEXT, presetVoiceIds } from "@/lib/preset-view";
import {
	countLine,
	EMPTY_LIBRARY_FILTERS,
	filterSaved,
	filtersFromQuery,
	hasLibraryFilters,
	knownOnly,
	LIBRARY_SORTS,
	LIBRARY_TEXT,
	type LibraryFilters,
	type LibrarySort,
	peopleOptions,
	popularGroups,
	queryFromFilters,
	sortSaved,
	tagMissingCount,
	tagOptions,
} from "@/lib/saved-voice-view";
import { failureOf } from "@/lib/voice-failure";
import { voiceKey } from "@/lib/voice-view";
import { client, OWNED_LIST } from "@/utils/orpc";

import { CastingWorkspace } from "./casting-workspace";
import { EmptyState } from "./empty-state";
import { LibraryFilters as FiltersBar } from "./library-filters";
import { Notice, SignInNotice } from "./notice";
import { usePresetList } from "./presets";
import { SamplePlayerProvider } from "./sample-player";
import { savedListKey, useClassLists, useSavedList } from "./saved-voices";
import { SortMenu } from "./voice-conditions";
import { RowSkeleton } from "./voice-list-parts";
import { NoMatches, ReloadRow } from "./voice-problem";
import { RowList } from "./voice-row";

const SEARCH_DELAY_MS = 500;
const SORT_OPTIONS = [...LIBRARY_SORTS];

// 성우 보관함(T7 스펙 4절). TrialProvider로 감싸지 않으므로 행·패널에 내 문장 듣기가 없다(스펙 2절 '보관함 패널').
// 목록은 저장한 정보로 먼저 보이고, 처음 한 번 이용 가능 확인을 부른 뒤 그 결과 목록으로 바꾼다(확인이 실패해도 목록은 그대로)
export function VoiceLibrary() {
	return (
		<SamplePlayerProvider>
			<Library />
		</SamplePlayerProvider>
	);
}

function writeQuery(filters: LibraryFilters) {
	const query = queryFromFilters(filters);
	// App Router가 useSearchParams와 맞춘다(번들 문서 linking-and-navigating 'Native History API'). 서버 전환을 타지 않는다(계획 리뷰 E7)
	window.history.replaceState(null, "", query ? `/voices?${query}` : "/voices");
}

function Library() {
	const params = useSearchParams();
	const queryClient = useQueryClient();
	const list = useSavedList();
	const { channels, classes, loaded, failed } = useClassLists();
	const presets = usePresetList();
	const presetVoices = presetVoiceIds(presets.data ?? []);
	const searchRef = useRef<HTMLInputElement>(null);
	const statusRef = useRef<HTMLParagraphElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const raw = filtersFromQuery(new URLSearchParams(params.toString()));
	const [query, setQuery] = useState(raw.q);
	// 주소의 검색어가 밖에서 바뀌면(같은 화면에서 메뉴로 /voices를 다시 열기) 칸도 따라간다. 이 화면이 쓴 주소는 칸 값과 같아 그대로다
	const [seenQ, setSeenQ] = useState(raw.q);
	if (seenQ !== raw.q) {
		setSeenQ(raw.q);
		setQuery(raw.q);
	}
	const [announced, setAnnounced] = useState("");
	const [chosen, setChosen] = useState<string | null>(null);
	// 화면을 열 때 한 번(서버가 24시간·40명 규칙으로 거른다). 창 포커스·재연결로 다시 부르지 않는다. 결과 목록으로 캐시를 바꾼다(계획 리뷰 P2)
	const check = useQuery({
		...OWNED_LIST,
		queryKey: ["savedVoiceCheck"],
		queryFn: async () => {
			const fresh = await client.savedVoiceCheck();
			// 진행 중인 담기·연결이 있으면 그 낙관적 갱신을 덮지 않고, 끝난 뒤 값으로 다시 받게 한다
			if (queryClient.isMutating({ mutationKey: ["savedVoice"] }) === 0)
				queryClient.setQueryData(savedListKey, fresh);
			else void queryClient.invalidateQueries({ queryKey: savedListKey });
			return true;
		},
		enabled: list.isSuccess,
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});

	// 지워진 채널·분류의 id는 두 목록이 다 온 뒤에만 버린다(계획 리뷰 E12)
	const known = new Set([...channels, ...classes].map((entry) => entry.id));
	const filters = { ...(loaded ? knownOnly(raw, known) : raw), q: query };
	const items = list.data ?? [];
	// 정렬은 거른 뒤 보이는 목록에만(인원은 그대로, 브리프 B4-2)
	const shown = sortSaved(
		filterSaved(items, filters, presetVoices),
		filters.sort,
	);
	const tagMissing = tagMissingCount(items, filters, presetVoices);
	const voices = shown.map((item) => item.voice);
	const keys = voices.map(voiceKey);
	const unavailable = items.filter((item) => item.unavailable).length;
	// '프리셋' 보기의 결과 0명 원인(브리프 7절): 받아 둔 목록 없이 실패 → 다시 받기, 받는 중 → 안내 없음(상태 줄 덧붙임만),
	// 프리셋에 쓰는 성우가 없음 → 전용 빈 상태. 그 밖(프리셋 성우가 있는데 검색·조건으로 0명)은 기존 '조건 결과 0명'이다
	const presetEmpty =
		filters.view !== "preset"
			? null
			: !presets.data
				? presets.isError
					? "failed"
					: "loading"
				: presetVoices.size === 0
					? "none"
					: null;

	// 고른 성우가 조건에서 빠지면(별·자주 사용 해제, 빼기) 다음 행 → 이전 행을 고르고, 포커스가 사라졌으면 그 행으로(계획 리뷰 D8).
	// 바깥 변화(캐시 갱신)에 DOM 포커스를 맞추는 일이라 effect다. 이전 목록은 effect 안에서만 ref에 적는다
	const prevKeys = useRef<string[]>([]);
	const keysText = keys.join("\n");
	useEffect(() => {
		const before = prevKeys.current;
		const now = keysText === "" ? [] : keysText.split("\n");
		prevKeys.current = now;
		// 넓은 화면은 고르지 않아도 첫 행이 패널에 보이므로 그 성우를 지금 성우로 본다
		const current = chosen ?? before[0] ?? null;
		if (current === null || now.includes(current)) return;
		const at = before.indexOf(current);
		if (at === -1) return;
		const next = now[at] ?? now[at - 1] ?? null;
		setChosen(next);
		const active = document.activeElement;
		if (active && active !== document.body && active.isConnected) return;
		const rows =
			listRef.current?.querySelectorAll<HTMLButtonElement>("[data-select]");
		const target = next === null ? null : rows?.[now.indexOf(next)];
		(target ?? statusRef.current)?.focus();
	}, [keysText, chosen]);
	// 대기 중인 검색 타이머를 지운다: 화면을 떠난 뒤 다른 화면 주소를 /voices로 바꾸지 않게, 주소의 검색어가 밖에서 바뀌면(메뉴로 다시 열기) 옛 칸 값으로 되돌리지 않게.
	// 렌더 중(위 seenQ 분기)에는 ref를 건드릴 수 없어(React Compiler) 검색어가 바뀔 때의 정리 함수로 한다
	// biome-ignore lint/correctness/useExhaustiveDependencies: raw.q가 바뀔 때마다 정리 함수가 돌아야 한다
	useEffect(
		() => () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		},
		[raw.q],
	);

	if (failureOf(list.error) === "unauthorized") return <SignInNotice />;

	// 주소에 쓰고, 바뀐 결과 인원을 검색과 같은 문구로 화면 밖 status에 알린다(audit P1-2). 목록을 받기 전·실패면 알리지 않는다('0명'이 아니다)
	function commit(next: LibraryFilters) {
		writeQuery(next);
		if (!list.data) return;
		// 태그 정보가 없어 빠진 성우 안내 줄도 함께 읽는다(보이는 줄은 role이 없다)
		const missing = tagMissingCount(items, next, presetVoices);
		setAnnounced(
			countLine(items.length, filterSaved(items, next, presetVoices).length) +
				(missing > 0 ? ` · ${LIBRARY_TEXT.tagMissing(missing)}` : ""),
		);
	}
	// 대기 중인 검색 타이머는 지운다(누른 때의 조건으로 주소를 덮지 않게). 최신 검색어를 함께 쓴다
	function setFilters(next: LibraryFilters) {
		if (timerRef.current) clearTimeout(timerRef.current);
		commit({ ...next, q: query });
	}
	function onQuery(q: string) {
		setQuery(q);
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(
			() => commit({ ...filters, q }),
			SEARCH_DELAY_MS,
		);
	}
	function clearAll() {
		if (timerRef.current) clearTimeout(timerRef.current);
		setQuery("");
		// 정렬은 조건이 아니라 풀지 않는다(브리프 B4-2)
		commit({ ...EMPTY_LIBRARY_FILTERS, sort: filters.sort });
		searchRef.current?.focus();
	}

	return (
		<div className="flex flex-col gap-4">
			<FiltersBar
				filters={filters}
				query={query}
				onQuery={onQuery}
				onChange={setFilters}
				channels={channels}
				classes={classes}
				loaded={loaded}
				failed={failed}
				searchRef={searchRef}
				people={peopleOptions(items, filters)}
				tags={tagOptions(items, filters)}
			/>
			{/* 보이는 줄에는 role을 두지 않는다. 개수는 검색어 0.5초 뒤·조건을 바꾼 바로 뒤 화면 밖 status가 알린다(계획 리뷰 D19, audit P1-2) */}
			<div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1">
				<p
					ref={statusRef}
					tabIndex={-1}
					className="text-muted-foreground tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid focus-visible:outline-offset-2"
				>
					{list.data ? countLine(items.length, shown.length) : null}
					{unavailable > 0
						? ` · ${LIBRARY_TEXT.unavailable} ${unavailable}명`
						: null}
					{check.isFetching ? ` · ${LIBRARY_TEXT.checking}` : null}
					{filters.view === "preset" && presets.isPending
						? ` · ${PRESET_TEXT.loading}`
						: null}
					{filters.view === "preset" && presets.isError
						? ` · ${PRESET_TEXT.listFailed}`
						: null}
				</p>
				{hasLibraryFilters(filters) ? (
					<Button variant="link" size="lg" onClick={clearAll}>
						조건 모두 해제
					</Button>
				) : null}
				<p role="status" className="sr-only">
					{announced}
				</p>
				{/* 상태 줄 오른쪽(공급자 탭 ListStatusBar와 같은 자리). 좁으면 다음 줄로 내려간다 */}
				<div className="ml-auto">
					<SortMenu
						sort={{
							options: SORT_OPTIONS,
							value: filters.sort,
							onChange: (sort) =>
								setFilters({ ...filters, sort: sort as LibrarySort }),
						}}
						disabled={items.length === 0}
					/>
				</div>
				{/* 상태 줄 아래 한 줄(w-full로 줄을 바꾼다). 콘텐츠·분위기를 고르면 태그가 없는 성우가 빠진다는 것을 알린다(브리프 B4-2, 0명이면 숨김) */}
				{tagMissing > 0 ? (
					<p className="w-full text-muted-foreground text-sm tabular-nums">
						{LIBRARY_TEXT.tagMissing(tagMissing)}
					</p>
				) : null}
			</div>
			<CastingWorkspace
				voices={voices}
				chosen={chosen}
				onChoose={setChosen}
				pending={list.isPending}
			>
				{({ selectedKey, select, panelId }) =>
					list.isLoadingError ? (
						<ReloadRow
							text={LIBRARY_TEXT.listFailed}
							reloading={list.isFetching}
							onReload={() => void list.refetch()}
						/>
					) : list.isPending ? (
						<div aria-busy="true">
							<RowSkeleton announce={false} />
							<span className="sr-only" role="status">
								{LIBRARY_TEXT.loading}
							</span>
						</div>
					) : items.length === 0 ? (
						<EmptyState
							art="list"
							title={LIBRARY_TEXT.empty}
							description={LIBRARY_TEXT.emptyDetail}
						>
							<Link
								href="/casting"
								className={cn(
									buttonVariants({ variant: "neutral", size: "lg" }),
								)}
							>
								{LIBRARY_TEXT.toCasting}
								<ArrowRight data-icon="inline-end" aria-hidden="true" />
							</Link>
						</EmptyState>
					) : shown.length > 0 ? (
						<div ref={listRef}>
							{filters.sort === "popular" ? (
								// 서비스 인기순만 묶음 머리를 둔다(브리프 B4-2). 묶음마다 행 목록 하나(Typecast 선반과 같은 구조)
								<div className="flex flex-col gap-6">
									{popularGroups(shown).map((group) => (
										<section key={group.label} className="flex flex-col gap-2">
											<h2 className="text-muted-foreground text-sm">
												{group.label}
											</h2>
											<RowList
												voices={group.items.map((item) => item.voice)}
												label={group.label}
												selectedKey={selectedKey}
												select={select}
												panelId={panelId}
												refreshing={false}
											/>
										</section>
									))}
								</div>
							) : (
								<RowList
									voices={voices}
									label="담은 성우"
									selectedKey={selectedKey}
									select={select}
									panelId={panelId}
									refreshing={false}
								/>
							)}
						</div>
					) : presetEmpty === "failed" ? (
						<ReloadRow
							text={PRESET_TEXT.listFailed}
							reloading={presets.isFetching}
							onReload={() => void presets.refetch()}
						/>
					) : presetEmpty === "loading" ? null : presetEmpty === "none" ? (
						// '조건 모두 해제'는 두지 않는다(누르면 '전체' 보기로 돌아가 이 보기를 잃는다)
						<Notice
							title={PRESET_TEXT.noPresetVoices}
							description={PRESET_TEXT.noPresetVoicesDetail}
						>
							<Link
								href="/casting"
								className={cn(
									buttonVariants({ variant: "neutral", size: "lg" }),
								)}
							>
								{PRESET_TEXT.toCasting}
								<ArrowRight data-icon="inline-end" aria-hidden="true" />
							</Link>
						</Notice>
					) : (
						<NoMatches onClear={clearAll} />
					)
				}
			</CastingWorkspace>
		</div>
	);
}
