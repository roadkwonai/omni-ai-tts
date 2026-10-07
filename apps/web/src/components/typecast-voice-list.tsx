"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@tts-pilot-app/ui/components/button";
import { useDeferredValue, useRef } from "react";

import {
	EMPTY_FILTERS,
	type FilterAxis,
	filterOptions,
	filterVoices,
	groupByUseCase,
	hasConditions,
	labelOf,
	USE_CASE_LABEL,
	type VoiceFilters,
} from "@/lib/voice-filter";
import { flattenPages } from "@/lib/voice-view";

import { count, OneList, typecastListOptions } from "./one-list";
import type { AxisView } from "./voice-conditions";
import { VoiceShelf } from "./voice-list-parts";
import { RowList } from "./voice-row";

const SHELF_SIZE = 5;
// T3 조건 넷. 모두 여럿 고르기다
const AXES: { key: FilterAxis; label: string }[] = [
	{ key: "models", label: "모델" },
	{ key: "genders", label: "성별" },
	{ key: "ages", label: "연령" },
	{ key: "useCases", label: "콘텐츠" },
];

// 검색어·조건·'한 목록으로 보기'는 부모가 든다('전체' 탭 '모두 보기 →'가 검색어를 넘긴다)
export type TypecastState = {
	query: string;
	filters: VoiceFilters;
	// 조건 없이 상태 줄 '한 목록으로 보기'로 한 목록을 보는 중
	showAll: boolean;
};

// Typecast 탭(브리프 5절). 목록 하나를 받아 브라우저에서 거른다. 동작은 T3 그대로이고 몸통은 OneList(Airy와 공통), 콘텐츠 묶음은 Typecast만이다
export function TypecastVoiceList({
	state,
	onStateChange,
	chosen,
	onChoose,
	focusRequested,
	onFocusHandled,
}: {
	state: TypecastState;
	onStateChange: (state: TypecastState) => void;
	chosen: string | null;
	onChoose: (key: string) => void;
	// '전체' 탭 '모두 보기 →'가 이 목록에 포커스를 넘겼다(계획 리뷰 D8)
	focusRequested: boolean;
	onFocusHandled: () => void;
}) {
	const { data } = useQuery(typecastListOptions);
	const searchRef = useRef<HTMLInputElement>(null);
	const countRef = useRef<HTMLParagraphElement>(null);
	// 입력은 바로 바뀌고 목록 그리기는 뒤따른다(rerender-use-deferred-value). '한 목록으로 보기'의 전체 그리기도 클릭 응답을 막지 않게 미룬다.
	const deferredQuery = useDeferredValue(state.query);
	const deferredFilters = useDeferredValue(state.filters);
	const deferredShowAll = useDeferredValue(state.showAll);

	const all = data?.voices ?? [];
	const active = hasConditions(state.query, state.filters);
	const filtered = hasConditions(deferredQuery, deferredFilters);
	const grid = filtered || deferredShowAll;
	const results = grid ? filterVoices(all, deferredQuery, deferredFilters) : [];
	// 콘텐츠별 묶음. '콘텐츠 정보 없음' 묶음은 전원, 그 밖은 앞 SHELF_SIZE명이다
	const shelves = grid
		? []
		: groupByUseCase(all).map(({ useCase, voices: members }) => ({
				useCase,
				total: members.length,
				voices: useCase === null ? members : members.slice(0, SHELF_SIZE),
			}));

	function clearAll() {
		onStateChange({ query: "", filters: EMPTY_FILTERS, showAll: false });
		searchRef.current?.focus();
	}
	function showUseCase(useCase: string) {
		onStateChange({
			...state,
			query: "",
			filters: { ...EMPTY_FILTERS, useCases: [useCase] },
		});
		countRef.current?.focus();
	}
	function showEverything() {
		onStateChange({ ...state, showAll: true });
		countRef.current?.focus();
	}

	const options = filterOptions(all);
	const axes: AxisView[] = AXES.map(({ key, label }) => ({
		kind: "multi",
		key,
		label,
		options: options[key],
		selected: [...state.filters[key]],
		onChange: (values: string[]) =>
			onStateChange({
				...state,
				filters: { ...state.filters, [key]: values },
			}),
	}));
	const selectedCount = Object.values(state.filters).reduce(
		(sum, values) => sum + values.length,
		0,
	);

	// 인원 글자 옆 링크 버튼 하나: 조건이 있으면 '조건 모두 해제', 조건 없이 '한 목록으로 보기'로 왔으면 '콘텐츠별로 보기', 그 밖은 '한 목록으로 보기'.
	// 탭 '전체'(네 공급자)와 겹치지 않는 이름이다(재확인 critique 2026-10-05)
	const link: { label: string; ariaLabel?: string; onClick: () => void } =
		active
			? { label: "조건 모두 해제", onClick: clearAll }
			: state.showAll
				? { label: "콘텐츠별로 보기", onClick: clearAll }
				: {
						label: "한 목록으로 보기",
						// 묶음의 '모두 보기 →'와 구별한다(보이는 글자 포함)
						ariaLabel: "Typecast 성우 한 목록으로 보기",
						onClick: showEverything,
					};

	return (
		<OneList
			provider="typecast"
			search={{
				value: state.query,
				placeholder: "이름으로 찾기",
				label: "성우 이름으로 찾기",
				onChange: (query) => onStateChange({ ...state, query }),
			}}
			axes={axes}
			selectedCount={selectedCount}
			countText={
				data === undefined
					? "Typecast 성우"
					: filtered
						? `Typecast 성우 ${count(all.length)} 중 ${count(results.length)}`
						: `Typecast 성우 ${count(all.length)}`
			}
			extra={
				<Button
					variant="link"
					size="lg"
					aria-label={link.ariaLabel}
					onClick={link.onClick}
				>
					{link.label}
				</Button>
			}
			// 패널에 넘기는 보이는 순서의 성우. 여러 묶음에 든 성우는 처음 것만이다
			shown={grid ? results : flattenPages(shelves)}
			noMatches={grid && results.length === 0}
			onClear={clearAll}
			searchRef={searchRef}
			countRef={countRef}
			focusRequested={focusRequested}
			onFocusHandled={onFocusHandled}
			chosen={chosen}
			onChoose={onChoose}
		>
			{({ selectedKey, select, panelId, refreshing }) =>
				grid ? (
					<RowList
						voices={results}
						label="Typecast 성우 목록"
						selectedKey={selectedKey}
						select={select}
						panelId={panelId}
						refreshing={refreshing}
					/>
				) : (
					<div className="flex flex-col gap-10">
						{shelves.map(({ useCase, total, voices: members }) => {
							const title =
								useCase === null
									? "콘텐츠 정보 없음"
									: labelOf(USE_CASE_LABEL, useCase);
							return (
								<VoiceShelf
									key={useCase ?? "none"}
									title={title}
									countLabel={count(total)}
									showAllLabel={`${title} 모두 보기`}
									// '콘텐츠 정보 없음'은 전원이 보이고, SHELF_SIZE명 이하면 모두 보이므로 숨긴다
									onShowAll={
										useCase !== null && total > SHELF_SIZE
											? () => showUseCase(useCase)
											: undefined
									}
								>
									<RowList
										voices={members}
										selectedKey={selectedKey}
										select={select}
										panelId={panelId}
										refreshing={refreshing}
									/>
								</VoiceShelf>
							);
						})}
					</div>
				)
			}
		</OneList>
	);
}
