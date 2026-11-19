"use client";

import type { ProviderId } from "@tts-pilot-app/api/providers/contract";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button } from "@tts-pilot-app/ui/components/button";
import { DropdownMenuItem } from "@tts-pilot-app/ui/components/dropdown-menu";
import { Toggle } from "@tts-pilot-app/ui/components/toggle";
import { ToggleGroup } from "@tts-pilot-app/ui/components/toggle-group";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { ListFilter, X } from "lucide-react";
import Link from "next/link";
import { type RefObject, useId, useState } from "react";

import {
	byName,
	emptyMessage,
	GROUP_TEXT,
	GROUPS,
	groupLists,
	type Named,
} from "@/lib/classes-view";
import { PROVIDER_LABEL } from "@/lib/connection-view";
import {
	type LibraryFilters as Filters,
	LIBRARY_TEXT,
	type LibraryView,
} from "@/lib/saved-voice-view";

import {
	type AxisView,
	ChoiceMenu,
	conditionButton,
	SearchField,
} from "./voice-conditions";

// setting-fields.tsx의 sourceItem(출처 전환 칸)을 옮겨 적었다. 안쪽 여백이 달라(px-4 → px-3 md:px-4, 보기 칸 넷이 좁은 폭에 들어가게, 브리프 7절 D9) 가져오지 않는다
const viewItem =
	"min-h-11 shrink-0 px-3 md:px-4 text-muted-foreground focus-visible:z-10 data-pressed:bg-card data-pressed:font-bold data-pressed:text-foreground data-pressed:ring-1 data-pressed:ring-border";

const VIEWS: { value: LibraryView; label: string }[] = [
	{ value: "all", label: "전체" },
	{ value: "favorite", label: "즐겨찾기" },
	{ value: "frequent", label: "자주 사용" },
	{ value: "preset", label: "프리셋" },
];
const PROVIDER_OPTIONS = Object.entries(PROVIDER_LABEL).map(
	([value, label]) => ({ value, label }),
);

type Choice = Extract<AxisView, { kind: "single" | "multi" }>;

// 보관함 조건 줄(R2 브리프 4절): 한 줄은 검색 + 보기 네 칸 + '조건' 버튼이고, 공급자·채널·카테고리·타입은 '조건'을 눌러 펼친다
// (대본 보관함·휴대폰과 같은 방식). 고른 조건은 목록 위 칩이고 칩을 누르면 그 조건이 풀린다.
// 채널·분류 목록을 받는 중이면 그 드롭다운은 잠기고(선택지도 사유도 없음), 실패면 사유 한 줄, 비었으면 안내와 '채널·분류에서 만들기'
export function LibraryFilters({
	filters,
	query,
	onQuery,
	onChange,
	channels,
	classes,
	loaded,
	failed,
	searchRef,
}: {
	filters: Filters;
	query: string;
	onQuery: (q: string) => void;
	onChange: (next: Filters) => void;
	channels: Named[];
	classes: (Named & { kind: "category" | "type" })[];
	loaded: boolean;
	failed: boolean;
	searchRef: RefObject<HTMLInputElement | null>;
}) {
	const [open, setOpen] = useState(false);
	const menusId = useId();
	const itemsOf = groupLists(channels, classes);
	const axes: Choice[] = [
		{
			key: "provider",
			label: "서비스",
			kind: "single",
			options: PROVIDER_OPTIONS,
			selected: filters.provider ? [filters.provider] : [],
			onChange: ([value]) =>
				onChange({ ...filters, provider: (value as ProviderId) ?? null }),
			translate: "no",
		},
		...GROUPS.map((group): Choice => {
			const options = byName(itemsOf[group]).map((item) => ({
				value: item.id,
				label: item.name,
			}));
			// 사유는 선택지가 비었을 때만(있으면 목록 위에 보인다)
			const empty = options.length === 0;
			return {
				key: group,
				label: GROUP_TEXT[group].label,
				kind: "multi",
				options,
				selected: filters[group],
				onChange: (ids) => onChange({ ...filters, [group]: ids }),
				hint: !empty
					? undefined
					: loaded
						? emptyMessage(group)
						: failed
							? LIBRARY_TEXT.classesFailed
							: undefined,
				emptyAction: loaded ? (
					<DropdownMenuItem
						className="min-h-11 rounded-md text-sm"
						render={<Link href="/classes" />}
					>
						채널·분류에서 만들기
					</DropdownMenuItem>
				) : null,
				countUnknown: true,
			};
		}),
	];
	// 보기 칸은 한 줄에 늘 보이므로 조건 수에 넣지 않는다
	const selectedCount =
		(filters.provider ? 1 : 0) +
		filters.channel.length +
		filters.category.length +
		filters.type.length;
	// 이름을 아는 값만 칩이 된다(목록을 받기 전의 id는 개수로만 보인다)
	const chips = axes.flatMap((axis) =>
		axis.selected.flatMap((value) => {
			const name = axis.options.find((option) => option.value === value)?.label;
			return name === undefined ? [] : [{ axis, value, name }];
		}),
	);
	return (
		<div className="flex flex-col gap-2">
			<search
				aria-label="보관함에서 찾기"
				className="flex flex-wrap items-center gap-2"
			>
				{/* 검색 칸은 좁은 폭에서 줄 하나를 쓰고, 넓으면 남는 폭을 채운다 */}
				<div className="flex w-full md:w-auto md:min-w-48 md:flex-1">
					<SearchField
						search={{
							value: query,
							// 검색은 메모도 찾는다(filterSaved, critique P3)
							placeholder: "이름·메모로 찾기",
							label: "보관함에서 찾기",
							onChange: onQuery,
						}}
						searchRef={searchRef}
					/>
				</div>
				<ToggleGroup
					value={[filters.view]}
					// 하나 고르기. 고른 칸을 다시 눌러 비우는 것은 막는다(voice-casting 출처 전환과 같다)
					onValueChange={(value) => {
						const view = value[0] as LibraryView | undefined;
						if (view) onChange({ ...filters, view });
					}}
					aria-label="보기"
					className="max-w-full flex-wrap bg-muted p-1"
				>
					{VIEWS.map((view) => (
						<Toggle key={view.value} value={view.value} className={viewItem}>
							{view.label}
						</Toggle>
					))}
				</ToggleGroup>
				<Button
					variant="outline"
					size="lg"
					className={conditionButton(selectedCount)}
					aria-label={
						selectedCount > 0 ? `조건, ${selectedCount}개 선택됨` : undefined
					}
					aria-expanded={open}
					aria-controls={menusId}
					onClick={() => setOpen((value) => !value)}
				>
					<ListFilter data-icon="inline-start" aria-hidden="true" />
					조건
					{selectedCount > 0 ? (
						<Badge
							variant="solid"
							className="min-h-5 rounded-full px-1.5 py-0 text-xs tabular-nums"
						>
							{selectedCount}
						</Badge>
					) : null}
				</Button>
			</search>
			<div id={menusId} className={open ? "flex flex-wrap gap-2" : "hidden"}>
				{axes.map((axis) => (
					<ChoiceMenu key={axis.key} axis={axis} disabled={false} />
				))}
			</div>
			{chips.length > 0 ? (
				<ul aria-label="고른 조건" className="flex flex-wrap gap-2">
					{chips.map(({ axis, value, name }) => (
						<li key={`${axis.key}:${value}`}>
							{/* 고른 상태를 보이는 칩이라 청록 테두리(outline)를 쓴다 */}
							<Button
								variant="outline"
								size="lg"
								className={cn("max-w-full", conditionButton(1))}
								aria-label={`${axis.label}, ${name} 조건 풀기`}
								onClick={() =>
									axis.onChange(axis.selected.filter((item) => item !== value))
								}
							>
								{/* 긴 이름은 잘리고 마우스를 올리면 전체가 보인다(조건 메뉴 버튼과 같다) */}
								<span
									translate={axis.translate}
									className="flex min-w-0 items-center"
								>
									{axis.label}
									<span className="whitespace-pre">{" · "}</span>
									<span className="max-w-40 truncate" title={name}>
										{name}
									</span>
								</span>
								<X data-icon="inline-end" aria-hidden="true" />
							</Button>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
