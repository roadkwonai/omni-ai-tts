"use client";

import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@tts-pilot-app/ui/components/dropdown-menu";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@tts-pilot-app/ui/components/input-group";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Check, ChevronDown, ListFilter, Search, X } from "lucide-react";
import { type ReactNode, type RefObject, useId, useState } from "react";

import type { Option } from "@/lib/voice-filter";

// 조건 하나(브리프 6절). 하나·여럿 고르기는 값 배열, 토글은 불린이다. 공급자별 조건 표(lib/provider-conditions의 Axis)를 화면이 이 모양으로 바꿔 넘긴다.
type ChoiceView = {
	kind: "single" | "multi";
	options: Option[];
	selected: string[];
	onChange: (values: string[]) => void;
	// 하나 고르기 맨 위 '조건 없음' 항목 이름(기본 '전체')
	emptyLabel?: string;
	// 목록 맨 위 회색 작은 글자(Fish Audio 태그 '모두 포함')
	note?: string;
	// 고를 값이 없는 사유(억양: 언어를 고르기 전, 억양 목록 조회 실패). 있으면 선택지가 비어도 열어서 이 한 줄을 본다
	hint?: string;
	// 선택지가 비었을 때 사유 아래 메뉴 항목(성우 보관함: '채널·분류에서 만들기')
	emptyAction?: ReactNode;
	// 선택지에 없는 값을 값 그대로 쓰지 않고 개수로 쓴다(성우 보관함: 목록을 받기 전의 채널·분류 id)
	countUnknown?: boolean;
	// 값 이름을 번역하지 않는다(공급자 이름, Gemini 페르소나. 항목과 버튼 글자)
	translate?: "no";
};
type ToggleView = {
	kind: "toggle";
	on: boolean;
	onChange: (on: boolean) => void;
};
export type AxisView = (ChoiceView | ToggleView) & {
	key: string;
	label: string;
};
// 조건 버튼(드롭다운, 토글 칩, '조건', 정렬). 고른 값이 있으면 700 굵기와 옅은 청록, 없으면 400 굵기와 옅은 경계(진한 input 경계는 검색 칸에만, 브리프 5절).
// 고른 버튼의 hover는 한 단계 진하다(라이트는 어둡게, 다크는 밝게: DESIGN의 brand hover 방향)
export const conditionButton = (count: number) =>
	cn(
		"bg-card text-foreground hover:bg-muted",
		count > 0
			? "border-primary bg-primary-subtle text-primary hover:bg-primary-subtle hover:brightness-95 dark:hover:brightness-110"
			: // 고른 것이 없으면 열려도 회색이다(outline의 옅은 청록은 '고른 값 있음' 신호와 섞인다)
				"border-border font-normal aria-expanded:bg-muted",
	);
// 고른 값을 접근 이름에 담는다. 고른 것이 없으면 보이는 글자가 이름이다.
const selectedLabel = (label: string, spoken: string | null) =>
	spoken ? `${label}, ${spoken} 선택됨` : undefined;
const menuContent = "w-auto min-w-48 p-1";
// 글자 메뉴 항목: 라디오 항목과 같은 44px·14px·radius-6(프리셋 메뉴·작업실 채널 고르기도 쓴다)
export const menuItem = "min-h-11 rounded-md text-sm";

// 버튼 글자와 접근 이름에 쓰는 고른 값(브리프 5절): 하나면 그 이름, 둘 이상이면 개수. 선택지에 없는 값은 값 그대로(countUnknown이면 개수)
function pickedOf(options: Option[], selected: string[], countUnknown = false) {
	const [first] = selected;
	if (first === undefined) return null;
	const label = options.find((option) => option.value === first)?.label;
	if (selected.length > 1 || (label === undefined && countUnknown)) {
		return { shown: String(selected.length), spoken: `${selected.length}개` };
	}
	const name = label ?? first;
	return { shown: name, spoken: name };
}

// 하나 또는 여럿 고르기. 여럿은 체크 목록(눌러도 닫히지 않음, Base UI CheckboxItem closeOnClick 기본 false),
// 하나는 라디오 목록(맨 위 '조건 없음', 고르면 닫힘: RadioItem은 closeOnClick을 켠다).
// 잠김은 Trigger에 건다(Base UI Menu.Trigger가 disabled를 받아 렌더한 Button에 넘긴다).
// 고를 값이 없고 사유(hint)가 있으면 열어서 사유 한 줄만 본다('전체' 항목도 없다).
function ChoiceMenu({
	axis,
	disabled,
}: {
	axis: Extract<AxisView, { kind: "single" | "multi" }>;
	disabled: boolean;
}) {
	const {
		label,
		options,
		selected,
		onChange,
		emptyLabel,
		note,
		hint,
		emptyAction,
		countUnknown,
		translate,
	} = axis;
	const hintId = useId();
	const picked = pickedOf(options, selected, countUnknown);
	const empty = options.length === 0;
	// 선택지가 비고 사유도 없으면(억양을 받는 중) 누를 수 없다
	const locked = disabled || (empty && !hint);
	// 안내는 그룹 이름(role=group의 aria-labelledby)이라 보조기기에 전달된다. 둘 다 있으면 둘 다 보인다.
	// DropdownMenuLabel 기본 모양(회색 작은 글자)에서 위아래 간격만 줄인다
	const notes = (
		<>
			{note ? (
				<DropdownMenuLabel className="py-1.5">{note}</DropdownMenuLabel>
			) : null}
			{hint ? (
				<DropdownMenuLabel id={hintId} className="py-1.5">
					{hint}
				</DropdownMenuLabel>
			) : null}
		</>
	);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				disabled={locked}
				render={
					<Button
						variant="outline"
						size="lg"
						aria-label={selectedLabel(label, picked?.spoken ?? null)}
						className={conditionButton(selected.length)}
					/>
				}
			>
				<span className="flex min-w-0 items-center">
					{label}
					{picked ? (
						<>
							<span className="whitespace-pre">{" · "}</span>
							{/* 잘리면 마우스를 올려 전체 값을 본다(행 이름과 같다) */}
							<span
								className="max-w-40 truncate"
								title={picked.shown}
								translate={translate}
							>
								{picked.shown}
							</span>
						</>
					) : null}
				</span>
				<ChevronDown data-icon="inline-end" aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				// 번역하지 않는 값(Gemini 페르소나)은 100자 가까이 길어 폭 상한을 두고 항목 글자를 줄바꿈한다(audit N4)
				className={cn(
					menuContent,
					translate && "max-w-[min(24rem,calc(100vw-2rem))]",
				)}
				// 항목이 없으면 그룹 이름이 읽히지 않으므로(이름표는 aria-hidden) 포커스를 받는 메뉴의 설명으로 잇는다
				aria-describedby={empty ? hintId : undefined}
			>
				{empty ? (
					<DropdownMenuGroup>
						{notes}
						{emptyAction}
					</DropdownMenuGroup>
				) : axis.kind === "multi" ? (
					<DropdownMenuGroup>
						{notes}
						{options.map((option) => (
							<DropdownMenuCheckboxItem
								key={option.value}
								className={menuItem}
								checked={selected.includes(option.value)}
								onCheckedChange={(checked) =>
									onChange(
										checked
											? [...selected, option.value]
											: selected.filter((value) => value !== option.value),
									)
								}
							>
								{translate ? (
									<span translate={translate}>{option.label}</span>
								) : (
									option.label
								)}
							</DropdownMenuCheckboxItem>
						))}
					</DropdownMenuGroup>
				) : (
					<DropdownMenuRadioGroup
						value={selected[0] ?? ""}
						onValueChange={(value) => onChange(value ? [value] : [])}
					>
						{notes}
						<DropdownMenuRadioItem value="" closeOnClick>
							{emptyLabel ?? "전체"}
						</DropdownMenuRadioItem>
						{options.map((option) => (
							<DropdownMenuRadioItem
								key={option.value}
								value={option.value}
								closeOnClick
							>
								{translate ? (
									<span translate={translate}>{option.label}</span>
								) : (
									option.label
								)}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// 켜고 끄는 조건('추천 성우만', '보증 성우만'): 44px 테두리 칩. 켜지면 체크 아이콘과 같은 옅은 청록 칠(색만으로 구분하지 않는다)
function ToggleChip({
	axis,
	disabled,
}: {
	axis: Extract<AxisView, { kind: "toggle" }>;
	disabled: boolean;
}) {
	return (
		<Button
			variant="outline"
			size="lg"
			aria-pressed={axis.on}
			disabled={disabled}
			className={conditionButton(axis.on ? 1 : 0)}
			onClick={() => axis.onChange(!axis.on)}
		>
			{axis.on ? <Check data-icon="inline-start" aria-hidden="true" /> : null}
			{axis.label}
		</Button>
	);
}

// 정렬: 하나 고르기이고 '전체' 항목이 없다. 칠은 늘 기본(정렬은 조건 수에 넣지 않는다).
// 조건 줄이 아니라 상태 줄 오른쪽 묶음('목록 새로 고침' 앞)에 둔다(ListStatusBar의 sort, 사용자 결정 2026-10-05)
export function SortMenu({
	sort,
	disabled,
}: {
	sort: { options: Option[]; value: string; onChange: (value: string) => void };
	disabled: boolean;
}) {
	return (
		<RadioMenu
			label="정렬"
			separator=": "
			value={sort.value}
			options={sort.options}
			onChange={sort.onChange}
			disabled={disabled}
			align="end"
		/>
	);
}

// 한 번에 하나를 고르는 공용 메뉴. 정렬과 패널의 시험 생성 옵션이 함께 쓴다.
export function RadioMenu<T extends string>({
	label,
	value,
	options,
	onChange,
	disabled = false,
	align,
	separator = " · ",
	strong = false,
	className,
	footer,
}: {
	label: string;
	value: T;
	// note: 항목 이름 아래 회색 둘째 줄(드라마 모델의 결과 차이). 트리거 글자와 접근 이름에는 넣지 않는다
	options: readonly { value: T; label: string; free?: true; note?: string }[];
	onChange: (value: T) => void;
	disabled?: boolean;
	align?: "start" | "end";
	separator?: string;
	strong?: boolean;
	// 버튼 클래스에 더한다(프리셋 창의 채널 칸이 창 폭을 채운다)
	className?: string;
	// 선택지 아래 메뉴 항목(작업실 채널: 채널이 없을 때 '채널·분류에서 만들기' → /classes, T9)
	footer?: ReactNode;
}) {
	const shown =
		options.find((option) => option.value === value)?.label ?? value;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				disabled={disabled}
				render={
					<Button
						variant="outline"
						size="lg"
						aria-label={`${label}, ${shown} 선택됨`}
						className={cn(conditionButton(0), className)}
					/>
				}
			>
				<span className="flex min-w-0 items-center">
					{label}
					<span className="whitespace-pre">{separator}</span>
					<span className={cn("max-w-40 truncate", strong && "font-bold")}>
						{shown}
					</span>
				</span>
				<ChevronDown data-icon="inline-end" aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent className={menuContent} align={align}>
				<DropdownMenuRadioGroup
					value={value}
					onValueChange={(next) => onChange(next as T)}
				>
					{options.map((option) => (
						<DropdownMenuRadioItem
							key={option.value}
							value={option.value}
							closeOnClick
						>
							{option.note ? (
								<span className="flex flex-col gap-0.5">
									<span className="flex items-center gap-2">
										{option.label}
										{option.free ? <Badge variant="success">무료</Badge> : null}
									</span>
									<span className="text-muted-foreground">{option.note}</span>
								</span>
							) : (
								<>
									{option.label}
									{option.free ? <Badge variant="success">무료</Badge> : null}
								</>
							)}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
				{footer ? (
					<>
						<DropdownMenuSeparator />
						{footer}
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// 브리프 5·6절 조건 줄: 검색 칸과 공급자·출처마다 다른 조건들(axes). 정렬은 상태 줄에 있다(SortMenu).
// 조건 묶음은 768px 이상에서도 넘치면 줄을 바꾼다(ElevenLabs 공개 목록은 드롭다운 7 + 토글 1). 767px 이하는 검색 칸 + '조건' 버튼, 조건은 펼칠 때만.
// 인원 글자는 여기 없다(상태 줄 ListStatusBar가 맡는다). 잠금(disabled)은 처음 불러오는 중에만 넘긴다.
export function VoiceConditions({
	search,
	axes,
	disabled,
	selectedCount,
	searchRef,
	leading,
}: {
	search: {
		value: string;
		placeholder: string;
		label: string;
		onChange: (value: string) => void;
		// Enter를 누르면 부른다(서버 목록은 입력이 멈추길 기다리지 않고 바로 보낸다)
		onSubmit?: () => void;
	};
	axes: AxisView[];
	disabled: boolean;
	selectedCount: number;
	searchRef: RefObject<HTMLInputElement | null>;
	// 조건 묶음 맨 앞(검색 칸 뒤)에 붙는 컨트롤. 767px 이하에서는 조건과 함께 접힌다(성우 보관함의 '보기' 세 칸)
	leading?: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	// 탭 내용을 숨긴 채 남기므로 조건 줄이 여럿 동시에 있다. id가 겹치지 않게 한다
	const menusId = useId();
	const hasMenus = axes.length > 0;
	return (
		<search
			aria-label="성우 찾기"
			className="flex flex-wrap items-center gap-2"
		>
			{/* 1200px 이상은 검색 칸이 192~288px 사이에서 줄어든다. 줄 바꿈은 192px로 정하고 남는 자리만큼 288px까지 늘어 조건이 한 줄에 들어갈 여지를 만든다(재확인 critique 2026-10-05) */}
			<div className="flex w-full gap-2 xl:w-auto xl:min-w-48 xl:max-w-72 xl:flex-1">
				{/* 포커스 표시는 다른 컨트롤과 같은 바깥 2px 윤곽선이다. 그림자는 쓰지 않는다(DESIGN) */}
				<InputGroup className="h-11 flex-1 rounded-lg bg-card shadow-none has-[[data-slot=input-group-control]:focus-visible]:outline-2 has-[[data-slot=input-group-control]:focus-visible]:outline-ring has-[[data-slot=input-group-control]:focus-visible]:outline-solid has-[[data-slot=input-group-control]:focus-visible]:outline-offset-2 has-[[data-slot=input-group-control]:focus-visible]:ring-0 dark:bg-card">
					<InputGroupAddon>
						<Search aria-hidden="true" />
					</InputGroupAddon>
					<InputGroupInput
						ref={searchRef}
						value={search.value}
						onChange={(event) => search.onChange(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Escape") search.onChange("");
							else if (event.key === "Enter") search.onSubmit?.();
						}}
						placeholder={search.placeholder}
						aria-label={search.label}
						name="voice-search"
						enterKeyHint="search"
						autoComplete="off"
						spellCheck={false}
						disabled={disabled}
						// Input 기본값의 md:text-xs까지 덮어야 768px 이상에서도 16px이다. h-full은 상자 어디를 눌러도 입력에 포커스가 가게 한다.
						className="h-full text-base md:text-base"
					/>
					{search.value ? (
						<InputGroupAddon align="inline-end" className="py-0 pr-0.5">
							{/* 보이는 40px이 44px 상자 안에 들어가고, after로 누르는 영역은 48px이다 */}
							<InputGroupButton
								size="icon-sm"
								className="relative size-10 rounded-md after:absolute after:-inset-1"
								aria-label="검색어 지우기"
								onClick={() => {
									search.onChange("");
									// 버튼이 사라져도 포커스가 검색 칸에 남는다
									searchRef.current?.focus();
								}}
							>
								<X aria-hidden="true" />
							</InputGroupButton>
						</InputGroupAddon>
					) : null}
				</InputGroup>
				{hasMenus ? (
					<Button
						variant="outline"
						size="lg"
						className={cn(conditionButton(selectedCount), "md:hidden")}
						aria-label={selectedLabel(
							"조건",
							selectedCount > 0 ? `${selectedCount}개` : null,
						)}
						aria-expanded={open}
						aria-controls={menusId}
						disabled={disabled}
						onClick={() => setOpen((value) => !value)}
					>
						<ListFilter data-icon="inline-start" aria-hidden="true" />
						조건
						{selectedCount > 0 ? (
							<span className="rounded-full bg-primary px-1.5 text-primary-foreground text-xs tabular-nums">
								{selectedCount}
							</span>
						) : null}
					</Button>
				) : null}
			</div>
			{hasMenus ? (
				// 768px 이상은 묶음 상자 없이 조건이 검색 줄에 이어 붙는다(contents)
				<div
					id={menusId}
					className={cn(
						open ? "flex" : "hidden",
						"flex-wrap gap-2 md:contents",
					)}
				>
					{leading}
					{axes.map((axis) =>
						axis.kind === "toggle" ? (
							<ToggleChip key={axis.key} axis={axis} disabled={disabled} />
						) : (
							<ChoiceMenu key={axis.key} axis={axis} disabled={disabled} />
						),
					)}
				</div>
			) : null}
		</search>
	);
}
