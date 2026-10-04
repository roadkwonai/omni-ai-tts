"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuTrigger,
} from "@tts-pilot-app/ui/components/dropdown-menu";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@tts-pilot-app/ui/components/input-group";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { ChevronDown, ListFilter, Search, X } from "lucide-react";
import { type ReactNode, type RefObject, useState } from "react";

import type {
	FilterAxis,
	FilterOption,
	VoiceFilters,
} from "@/lib/voice-filter";

const AXES: { axis: FilterAxis; label: string }[] = [
	{ axis: "models", label: "모델" },
	{ axis: "genders", label: "성별" },
	{ axis: "ages", label: "연령" },
	{ axis: "useCases", label: "콘텐츠" },
];

const countBadge =
	"rounded-full bg-primary px-1.5 text-primary-foreground text-xs tabular-nums";
// 조건 버튼(드롭다운 넷과 '조건'). 고른 값이 있으면 옅은 청록으로 칠한다(브리프 5절).
const conditionButton = (count: number) =>
	cn(
		"border-input bg-card text-foreground hover:bg-muted",
		count > 0
			? "border-primary bg-primary-subtle text-primary hover:bg-primary-subtle"
			: // 고른 것이 없으면 열려도 회색이다(outline의 옅은 청록은 '고른 값 있음' 신호와 섞인다)
				"aria-expanded:bg-muted",
	);
// 고른 수를 접근 이름에 담는다. 고른 것이 없으면 보이는 글자가 이름이다.
const selectedLabel = (label: string, count: number) =>
	count > 0 ? `${label}, ${count}개 선택됨` : undefined;

// 여러 개를 고르는 체크 목록(같은 축 OR). 항목을 눌러도 닫히지 않는다(Base UI CheckboxItem closeOnClick 기본 false).
// 잠김은 Trigger에 건다(Base UI Menu.Trigger가 disabled를 받아 렌더한 Button에 넘긴다).
function FilterMenu({
	label,
	options,
	selected,
	disabled,
	onChange,
}: {
	label: string;
	options: FilterOption[];
	selected: readonly string[];
	disabled: boolean;
	onChange: (values: string[]) => void;
}) {
	const count = selected.length;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				disabled={disabled}
				render={
					<Button
						variant="outline"
						size="lg"
						aria-label={selectedLabel(label, count)}
						className={conditionButton(count)}
					/>
				}
			>
				{label}
				{count > 0 ? <span className={countBadge}>{count}</span> : null}
				<ChevronDown data-icon="inline-end" aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-auto min-w-48 p-1">
				<DropdownMenuGroup>
					{options.map((option) => (
						<DropdownMenuCheckboxItem
							key={option.value}
							className="min-h-11 rounded-md text-sm"
							checked={selected.includes(option.value)}
							onCheckedChange={(checked) =>
								onChange(
									checked
										? [...selected, option.value]
										: selected.filter((value) => value !== option.value),
								)
							}
						>
							{option.label}
						</DropdownMenuCheckboxItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// 브리프 5·8절 조건 줄: 검색 칸, 드롭다운 넷, 끝에 인원 글자(summary).
// 모든 너비에서 줄을 바꿀 수 있다. 넓으면 한 줄이고, 넘치면 인원 글자 묶음이 다음 줄 오른쪽으로 내려간다.
// 768px 이상 드롭다운 넷은 묶음 안에서 꺾이지 않는다. 767px 이하는 검색 칸 + '조건' 버튼, 드롭다운은 펼칠 때만.
export function VoiceConditions({
	query,
	onQueryChange,
	filters,
	onFiltersChange,
	options,
	disabled,
	searchRef,
	summary,
}: {
	query: string;
	onQueryChange: (query: string) => void;
	filters: VoiceFilters;
	onFiltersChange: (filters: VoiceFilters) => void;
	options: Record<FilterAxis, FilterOption[]>;
	disabled: boolean;
	searchRef: RefObject<HTMLInputElement | null>;
	summary: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const selectedCount = Object.values(filters).reduce(
		(sum, values) => sum + values.length,
		0,
	);
	return (
		<search
			aria-label="성우 찾기"
			className="flex flex-wrap items-center gap-2"
		>
			<div className="flex w-full gap-2 xl:w-auto">
				{/* 포커스 표시는 다른 컨트롤과 같은 바깥 2px 윤곽선이다. 그림자는 쓰지 않는다(DESIGN) */}
				<InputGroup className="h-11 flex-1 rounded-lg bg-card shadow-none has-[[data-slot=input-group-control]:focus-visible]:outline-2 has-[[data-slot=input-group-control]:focus-visible]:outline-ring has-[[data-slot=input-group-control]:focus-visible]:outline-solid has-[[data-slot=input-group-control]:focus-visible]:outline-offset-2 has-[[data-slot=input-group-control]:focus-visible]:ring-0 xl:w-90 xl:flex-none dark:bg-card">
					<InputGroupAddon>
						<Search aria-hidden="true" />
					</InputGroupAddon>
					<InputGroupInput
						ref={searchRef}
						value={query}
						onChange={(event) => onQueryChange(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Escape") onQueryChange("");
						}}
						placeholder="이름으로 찾기"
						aria-label="성우 이름으로 찾기"
						enterKeyHint="search"
						autoComplete="off"
						spellCheck={false}
						disabled={disabled}
						// Input 기본값의 md:text-xs까지 덮어야 768px 이상에서도 16px이다. h-full은 상자 어디를 눌러도 입력에 포커스가 가게 한다.
						className="h-full text-base md:text-base"
					/>
					{query ? (
						<InputGroupAddon align="inline-end" className="py-0 pr-0.5">
							{/* 보이는 40px이 44px 상자 안에 들어가고, after로 누르는 영역은 48px이다 */}
							<InputGroupButton
								size="icon-sm"
								className="relative size-10 rounded-md after:absolute after:-inset-1"
								aria-label="검색어 지우기"
								onClick={() => {
									onQueryChange("");
									// 버튼이 사라져도 포커스가 검색 칸에 남는다
									searchRef.current?.focus();
								}}
							>
								<X aria-hidden="true" />
							</InputGroupButton>
						</InputGroupAddon>
					) : null}
				</InputGroup>
				<Button
					variant="outline"
					size="lg"
					className={cn(conditionButton(selectedCount), "md:hidden")}
					aria-label={selectedLabel("조건", selectedCount)}
					aria-expanded={open}
					aria-controls="voice-filter-menus"
					disabled={disabled}
					onClick={() => setOpen((value) => !value)}
				>
					<ListFilter data-icon="inline-start" aria-hidden="true" />
					조건
					{selectedCount > 0 ? (
						<span className={countBadge}>{selectedCount}</span>
					) : null}
				</Button>
			</div>
			<div
				id="voice-filter-menus"
				className={cn(
					open ? "flex" : "hidden",
					"flex-wrap gap-2 md:flex md:shrink-0 md:flex-nowrap",
				)}
			>
				{AXES.map(({ axis, label }) => (
					<FilterMenu
						key={axis}
						label={label}
						options={options[axis]}
						selected={filters[axis]}
						disabled={disabled}
						onChange={(values) =>
							onFiltersChange({ ...filters, [axis]: values })
						}
					/>
				))}
			</div>
			{/* 인원 글자가 없을 때(불러오는 중, 오류, 0명) 빈 줄을 만들지 않는다 */}
			{summary ? (
				<div className="flex w-full flex-wrap items-center gap-x-3 md:ml-auto md:w-auto">
					{summary}
				</div>
			) : null}
		</search>
	);
}
