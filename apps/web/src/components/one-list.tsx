"use client";

import { useQuery } from "@tanstack/react-query";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	type ComponentProps,
	type ReactNode,
	useDeferredValue,
	useEffect,
	useRef,
} from "react";

import { failureOf } from "@/lib/voice-failure";
import {
	EMPTY_GEMINI_FILTERS,
	filterByNameOrId,
	filterGemini,
	filterOptions,
	type GeminiFilters,
	geminiOptions,
	hasConditions,
} from "@/lib/voice-filter";
import {
	oneListCountText,
	plain,
	SAMPLES_MISSING_TEXT,
	samplesMissing,
} from "@/lib/voice-view";
import { orpc } from "@/utils/orpc";

import {
	type Choice,
	ListWorkspace,
	useListRefresh,
} from "./server-voice-list";
import { type AxisView, VoiceConditions } from "./voice-conditions";
import {
	LIST_QUERY,
	ListStatusBar,
	RowSkeleton,
	StaleNotice,
} from "./voice-list-parts";
import {
	EmptyList,
	NoMatches,
	Problem,
	useListRecovery,
} from "./voice-problem";
import { RowList, type Select } from "./voice-row";

type OneListProvider = "typecast" | "airy" | "gemini";

// 한 번에 받아 브라우저에서 거르는 목록의 쿼리(목록 하나). 그 탭, '전체' 탭 묶음, 탭 이름의 인원(enabled false)이 같은 키를 쓴다.
// 사유를 아는 실패는 화면 안에서 보이고 그 밖은 오류 경계((app)/error.tsx)로 던진다
const oneListOptions = (
	input:
		| { provider: "typecast" }
		| { provider: "airy" }
		| { provider: "gemini" },
) =>
	orpc.voiceList.queryOptions({
		input,
		...LIST_QUERY,
		throwOnError: (error) => failureOf(error) === null,
	});
export const typecastListOptions = oneListOptions({ provider: "typecast" });
export const airyListOptions = oneListOptions({ provider: "airy" });
export const geminiListOptions = oneListOptions({ provider: "gemini" });
export const ONE_LIST_OPTIONS = {
	typecast: typecastListOptions,
	airy: airyListOptions,
	gemini: geminiListOptions,
};

export const count = (value: number) => `${plain.format(value)}명`;

// Typecast·Airy·Gemini 탭의 공통 몸통(계획 리뷰 ponytail 1): 조건 줄, 상태 줄, 지난 목록 안내, 목록 칸(문제·뼈대·0명·조건 0명).
// 목록 모양(Typecast 콘텐츠 묶음, 한 목록)은 부르는 쪽이 children으로 그린다. 같은 쿼리를 부르는 쪽(데이터로 거르기)과 여기(회복·새로 고침)가 함께 구독한다
export function OneList({
	provider,
	search,
	axes,
	selectedCount,
	matched,
	filtered,
	extra,
	note,
	shown,
	noMatches,
	onClear,
	searchRef,
	countRef,
	focusRequested,
	onFocusHandled,
	chosen,
	children,
	...choice
}: {
	provider: OneListProvider;
	search: ComponentProps<typeof VoiceConditions>["search"];
	axes: AxisView[];
	selectedCount: number;
	// 조건 결과 수와 조건이 있는지(인원 글자 '전체 중 결과')
	matched: number;
	filtered: boolean;
	// 인원 글자 옆 링크. 목록이 정상이고 성우가 있을 때만 보인다
	extra: ReactNode;
	// 상태 줄 아래 회색 한 줄(Airy 샘플 못 받음). 보이는 조건은 extra와 같다
	note?: ReactNode;
	// 패널에 넘기는 보이는 순서의 성우
	shown: Voice[];
	// 조건 결과 0명
	noMatches: boolean;
	onClear: () => void;
	searchRef: ComponentProps<typeof VoiceConditions>["searchRef"];
	countRef: ComponentProps<typeof ListStatusBar>["countRef"];
	// '전체' 탭 '모두 보기 →'가 이 목록에 포커스를 넘겼다(계획 리뷰 D8). 인원 글자로 옮기고 onFocusHandled로 요청을 지운다(한 번만)
	focusRequested: boolean;
	onFocusHandled: () => void;
	chosen: string | null;
	children: (props: {
		selectedKey: string | null;
		select: Select;
		panelId?: string;
		refreshing: boolean;
	}) => ReactNode;
} & Choice) {
	const voices = useQuery(ONE_LIST_OPTIONS[provider]);
	const { refresh, pending, blockedUntil } = useListRefresh(provider);

	useEffect(() => {
		if (!focusRequested) return;
		countRef.current?.focus();
		onFocusHandled();
	}, [focusRequested, onFocusHandled, countRef]);

	const data = voices.data;
	// 소유자 없음은 페이지(VoiceCasting)가 탭 대신 주소 안내로 바꾼다(같은 쿼리라 여기는 그 안내를 그리지 않는다)
	const { problem, notice, retryAt, cooldown, reload } = useListRecovery({
		query: voices,
		first: data,
		blockedUntil,
		refetch: () =>
			voices
				.refetch({ cancelRefetch: false })
				.then((result) => (result.isError ? undefined : result.data)),
		searchRef,
	});
	const loading = !data && !problem;
	// 목록을 다시 받는 중이거나 '목록 새로 고침' 변경 호출이 진행 중이다(11b와 같다)
	const refreshing = voices.isRefetching || pending;
	const all = data?.voices ?? [];
	// 공개 성우가 0명이면 링크도 없다(고를 것이 없다)
	const usable = data !== undefined && problem === null && all.length > 0;

	return (
		<div className="flex flex-col gap-4">
			<VoiceConditions
				search={search}
				axes={axes}
				// 처음 불러오는 중에만 잠근다(계획 리뷰 D4)
				disabled={!data && voices.isFetching}
				selectedCount={selectedCount}
				searchRef={searchRef}
			/>
			<ListStatusBar
				count={oneListCountText(
					provider,
					data && all.length,
					filtered,
					matched,
				)}
				countRef={countRef}
				busy={voices.isFetching}
				extra={usable ? extra : null}
				fetchedAt={data?.fetchedAt ?? null}
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
			{usable && !notice && note ? note : null}
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
				voices={problem ? [] : shown}
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
							/>
						);
					}
					if (loading) return <RowSkeleton />;
					if (all.length === 0) {
						return (
							<EmptyList
								provider={provider}
								reloading={pending || voices.isFetching}
								waiting={cooldown !== null}
								onReload={refresh}
							/>
						);
					}
					if (noMatches) return <NoMatches onClear={onClear} />;
					return children({ selectedKey, select, panelId, refreshing });
				}}
			</ListWorkspace>
		</div>
	);
}

// 검색어·성별은 부모가 든다('전체' 탭 '모두 보기 →'가 검색어를 넘긴다)
export type AiryState = { query: string; genders: string[] };
export const EMPTY_AIRY: AiryState = { query: "", genders: [] };

// Airy 탭(T7.5 스펙 4절, 브리프 13절). 한 번에 받아 브라우저에서 이름·성우 id·성별로 거른다. 묶음 없이 한 목록이다.
// 캐스팅은 onChoose, 드라마 성우 창 '전체'는 pick(행 누름 = 고르고 담기)
export function AiryVoiceList({
	state,
	onStateChange,
	chosen,
	focusRequested,
	onFocusHandled,
	...choice
}: {
	state: AiryState;
	onStateChange: (state: AiryState) => void;
	chosen: string | null;
	focusRequested: boolean;
	onFocusHandled: () => void;
} & Choice) {
	const { data } = useQuery(airyListOptions);
	const searchRef = useRef<HTMLInputElement>(null);
	const countRef = useRef<HTMLParagraphElement>(null);
	// 입력은 바로 바뀌고 목록 그리기는 뒤따른다(rerender-use-deferred-value)
	const deferred = useDeferredValue(state);
	const all = data?.voices ?? [];
	const active = hasConditions(state.query, { genders: state.genders });
	const filtered = hasConditions(deferred.query, {
		genders: deferred.genders,
	});
	const results = filterByNameOrId(all, deferred.query, deferred.genders);

	function clearAll() {
		onStateChange(EMPTY_AIRY);
		searchRef.current?.focus();
	}

	return (
		<OneList
			provider="airy"
			search={{
				value: state.query,
				placeholder: "이름이나 성우 id로 찾기",
				label: "Airy 성우 이름이나 성우 id로 찾기",
				onChange: (query) => onStateChange({ ...state, query }),
			}}
			// 공급자가 주는 조건은 성별뿐이다(언어는 모두 ko·en, 스펙 2절)
			axes={[
				{
					kind: "multi",
					key: "genders",
					label: "성별",
					options: filterOptions(all).genders,
					selected: state.genders,
					onChange: (genders: string[]) => onStateChange({ ...state, genders }),
				},
			]}
			selectedCount={state.genders.length}
			matched={results.length}
			filtered={filtered}
			extra={
				active ? (
					<Button variant="link" size="lg" onClick={clearAll}>
						조건 모두 해제
					</Button>
				) : null
			}
			// 카탈로그를 못 받은 목록(U1). 목록은 정상이라 '목록 새로 고침'은 숨기지 않는다. 지난 목록 안내가 뜨는 동안은 이 줄도 숨는다
			note={
				samplesMissing(all) ? (
					<p className="text-muted-foreground text-sm">
						{SAMPLES_MISSING_TEXT}
					</p>
				) : null
			}
			shown={results}
			noMatches={results.length === 0}
			onClear={clearAll}
			searchRef={searchRef}
			countRef={countRef}
			focusRequested={focusRequested}
			onFocusHandled={onFocusHandled}
			chosen={chosen}
			{...choice}
		>
			{({ selectedKey, select, panelId, refreshing }) => (
				<RowList
					voices={results}
					label="Airy 성우 목록"
					selectedKey={selectedKey}
					select={select}
					panelId={panelId}
					refreshing={refreshing}
					busyKey={choice.busyKey}
				/>
			)}
		</OneList>
	);
}

// 검색어·조건은 부모가 든다('전체' 탭 '모두 보기 →'가 검색어를 넘긴다)
export type GeminiState = { query: string; filters: GeminiFilters };
export const EMPTY_GEMINI: GeminiState = {
	query: "",
	filters: EMPTY_GEMINI_FILTERS,
};
// 공급자가 주는 조건 전부(T7.6 스펙 2절). 순서가 조건 줄 순서다. 페르소나는 공급자 영어 원문이라 번역하지 않는다(계획 리뷰 R4-6)
const GEMINI_AXES: {
	key: keyof GeminiFilters;
	label: string;
	translate?: "no";
}[] = [
	{ key: "kinds", label: "구분" },
	{ key: "genders", label: "성별" },
	{ key: "pitches", label: "피치" },
	{ key: "accents", label: "억양" },
	{ key: "contexts", label: "콘텐츠" },
	{ key: "personas", label: "페르소나", translate: "no" as const },
];

// Gemini 탭(T7.6 스펙 5절, 브리프 14절). 한 번에 받아 브라우저에서 거른다. 대표 성우 먼저, 검색어가 있으면 일치 순서(filterGemini 정렬, 서버 순서와 다름).
// 캐스팅은 onChoose, 드라마 성우 창 '전체'는 pick(행 누름 = 고르고 담기)
export function GeminiVoiceList({
	state,
	onStateChange,
	chosen,
	focusRequested,
	onFocusHandled,
	...choice
}: {
	state: GeminiState;
	onStateChange: (state: GeminiState) => void;
	chosen: string | null;
	focusRequested: boolean;
	onFocusHandled: () => void;
} & Choice) {
	const { data } = useQuery(geminiListOptions);
	const searchRef = useRef<HTMLInputElement>(null);
	const countRef = useRef<HTMLParagraphElement>(null);
	// 입력은 바로 바뀌고 목록 그리기는 뒤따른다(rerender-use-deferred-value)
	const deferred = useDeferredValue(state);
	const all = data?.voices ?? [];
	const options = geminiOptions(all);
	const active = hasConditions(state.query, state.filters);
	const filtered = hasConditions(deferred.query, deferred.filters);
	const results = filterGemini(all, deferred.query, deferred.filters);
	const selectedCount = Object.values(state.filters).reduce(
		(sum, values) => sum + values.length,
		0,
	);

	function clearAll() {
		onStateChange(EMPTY_GEMINI);
		searchRef.current?.focus();
	}

	return (
		<OneList
			provider="gemini"
			search={{
				value: state.query,
				placeholder: "이름·성우 id·설명으로 찾기",
				label: "Gemini 성우 이름·성우 id·설명으로 찾기",
				onChange: (query) => onStateChange({ ...state, query }),
			}}
			axes={GEMINI_AXES.map(({ key, label, translate }) => ({
				kind: "multi" as const,
				key,
				label,
				translate,
				options: options[key],
				selected: state.filters[key],
				onChange: (values: string[]) =>
					onStateChange({
						...state,
						filters: { ...state.filters, [key]: values },
					}),
			}))}
			selectedCount={selectedCount}
			matched={results.length}
			filtered={filtered}
			extra={
				active ? (
					<Button variant="link" size="lg" onClick={clearAll}>
						조건 모두 해제
					</Button>
				) : null
			}
			shown={results}
			noMatches={results.length === 0}
			onClear={clearAll}
			searchRef={searchRef}
			countRef={countRef}
			focusRequested={focusRequested}
			onFocusHandled={onFocusHandled}
			chosen={chosen}
			{...choice}
		>
			{({ selectedKey, select, panelId, refreshing }) => (
				<RowList
					voices={results}
					label="Gemini 성우 목록"
					selectedKey={selectedKey}
					select={select}
					panelId={panelId}
					refreshing={refreshing}
					busyKey={choice.busyKey}
				/>
			)}
		</OneList>
	);
}
