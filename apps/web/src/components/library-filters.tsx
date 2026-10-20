"use client";

import type { ProviderId } from "@tts-pilot-app/api/providers/contract";
import { DropdownMenuItem } from "@tts-pilot-app/ui/components/dropdown-menu";
import { Toggle } from "@tts-pilot-app/ui/components/toggle";
import { ToggleGroup } from "@tts-pilot-app/ui/components/toggle-group";
import Link from "next/link";
import type { RefObject } from "react";

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

import { type AxisView, VoiceConditions } from "./voice-conditions";

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

// 보관함 조건 줄(브리프 B4): 캐스팅 조건 줄(VoiceConditions) 그대로 검색 → 보기 네 칸 → 공급자(하나) → 채널·카테고리·타입(여럿, 이름순).
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
	const itemsOf = groupLists(channels, classes);
	const axes: AxisView[] = [
		{
			key: "provider",
			label: "공급자",
			kind: "single",
			options: PROVIDER_OPTIONS,
			selected: filters.provider ? [filters.provider] : [],
			onChange: ([value]) =>
				onChange({ ...filters, provider: (value as ProviderId) ?? null }),
			translate: "no",
		},
		...GROUPS.map((group): AxisView => {
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
	const selectedCount =
		(filters.view === "all" ? 0 : 1) +
		(filters.provider ? 1 : 0) +
		filters.channel.length +
		filters.category.length +
		filters.type.length;
	return (
		<VoiceConditions
			search={{
				value: query,
				// 검색은 메모도 찾는다(filterSaved, critique P3)
				placeholder: "이름·메모로 찾기",
				label: "보관함에서 찾기",
				onChange: onQuery,
			}}
			axes={axes}
			disabled={false}
			selectedCount={selectedCount}
			searchRef={searchRef}
			leading={
				<ToggleGroup
					value={[filters.view]}
					// 하나 고르기. 고른 칸을 다시 눌러 비우는 것은 막는다(voice-casting 출처 전환과 같다)
					onValueChange={(value) => {
						const view = value[0] as LibraryView | undefined;
						if (view) onChange({ ...filters, view });
					}}
					aria-label="보기"
					className="bg-muted p-1"
				>
					{VIEWS.map((view) => (
						<Toggle key={view.value} value={view.value} className={viewItem}>
							{view.label}
						</Toggle>
					))}
				</ToggleGroup>
			}
		/>
	);
}
