// apps/web/src/components/tag-tools.tsx
"use client";

import type { Tag } from "@tts-pilot-app/api/drama-acting";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@tts-pilot-app/ui/components/dropdown-menu";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import {
	type KeyboardEvent,
	type MouseEvent,
	type ReactNode,
	useRef,
	useState,
} from "react";

import { nextCell } from "@/lib/roving";
import { TAG_TEXT, type TagGroup, type TagKind } from "@/lib/tag-view";

import { menuItem } from "./voice-conditions";

// 태그 알약 도구줄(드라마 브리프 17절 6, T10 스펙 15.1). 드라마 줄 도구줄과 문단 카드 도구줄이 함께 쓴다.
// 첫 묶음 앞 다섯 알약 + 묶음마다 메뉴 알약이고, 알약은 무채색 하나다(색은 쓰지 않는다). 넣기는 부르는 쪽(onPick)이 한다

export type { TagGroup, TagKind };

// 첫 묶음에서 바로 보이는 알약 수. 나머지는 '… 더 보기' 메뉴 알약이 담는다
const PILLS = 5;

// 뱃지 접근 이름 뒤에 붙는 넣는 글("한숨, [sighs]"). 소리 값은 태그 전체 글이다
const insertedOf = (kind: TagKind, value: string) =>
	kind === "span" ? `<${value}>…</${value}>` : value;
// 알약을 누를 때 포커스를 빼앗지 않는다(칸의 커서가 그대로라 소리 알약이 커서 자리에 넣는다).
// 메뉴 알약에는 달지 않는다: Base UI 트리거는 누른 뒤 포커스가 트리거에 온 다음 프레임에 연다. 미룬 넣기는 onPick이 칸과 고른 자리를 되살린다
const keepFocus = (event: MouseEvent) => event.preventDefault();

// 도구줄 한 줄: 768px 이상은 넘치면 줄을 바꾸고, 767px 이하는 한 줄 가로 넘김(스크롤바 대신 오른쪽 흐림, index.css tabs-overflow-fade).
// 위아래 4px는 알약의 눌림 영역과 포커스 링이 넘김 칸에 잘리지 않게 둔다(767px 이하는 양옆도). 바뀐 줄 사이 8px라 눌림 영역이 겹치지 않는다
export const TAG_ROW =
	"flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-2 py-1 max-md:basis-full max-md:flex-nowrap max-md:overflow-x-auto max-md:px-1 max-md:tabs-overflow-fade";
// 알약(시안 .pill): 높이 36px. 버튼의 1px 투명 테두리 때문에 after의 기준 상자가 34px라 위아래 5px·양옆 1px를 더해 눌림 영역 44px, 한 글자 알약(헉·쉼)도 너비 44px. 메뉴 알약은 회색 글과 ▾(시안 .pill.menu)
// 눌림 영역은 알약 바깥으로 위아래 4px씩이고 바뀐 줄 사이는 8px(TAG_ROW gap-y-2)라 겹치지 않는다
const TAG_PILL =
	"relative h-9 min-w-11 gap-1 rounded-full bg-card px-3 font-normal ring-1 ring-border ring-inset after:absolute after:-inset-x-px after:-inset-y-1.25";

// 묶음 하나를 담은 메뉴 알약. 항목을 고르면 넣기를 미뤄 두고 메뉴가 닫힌 뒤(onOpenChangeComplete) 넣는다:
// 칸에 포커스가 있어야 execCommand로 넣어 Ctrl+Z가 남는다. 미룬 넣기가 있으면 닫을 때 포커스를 이 알약으로 돌리지 않는다(넣기가 칸으로 옮긴다)
function MenuPill({
	name,
	group,
	items,
	tabIndex,
	onFocus,
	onPick,
}: {
	name: string;
	group: TagGroup;
	items: readonly Tag[];
	tabIndex: number;
	onFocus: () => void;
	onPick: (kind: TagKind, value: string) => void;
}) {
	// 메뉴가 닫힌 뒤 할 넣기. 다시 열 때 비운다(닫힐 때 비우면 그 뒤 정하는 finalFocus가 넣기를 보지 못한다)
	const pending = useRef<(() => void) | null>(null);
	return (
		<DropdownMenu
			onOpenChange={(open) => {
				if (open) pending.current = null;
			}}
			onOpenChangeComplete={(open) => {
				if (!open) pending.current?.();
			}}
		>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						tabIndex={tabIndex}
						onFocus={onFocus}
						className={cn(
							TAG_PILL,
							"text-muted-foreground aria-expanded:text-foreground",
						)}
					/>
				}
			>
				{name}
				<ChevronDown data-icon="inline-end" aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				className="w-auto min-w-48 p-1"
				finalFocus={() => pending.current === null}
			>
				<DropdownMenuGroup>
					<DropdownMenuLabel className="py-1.5">
						{group.title}
					</DropdownMenuLabel>
					{items.map((badge) => (
						<DropdownMenuItem
							key={badge.value}
							className={menuItem}
							aria-label={TAG_TEXT.badgeName(
								badge.label,
								insertedOf(group.kind, badge.value),
							)}
							onClick={() => {
								pending.current = () => onPick(group.kind, badge.value);
							}}
						>
							{badge.label}
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// 태그 도구줄(Tab 정지 하나, ←→↑↓·Home·End로 옮긴다)과 그 뒤에 붙는 것(after, 드라마 '지시 쓰는 법').
// 차례는 보이는 알약 → 메뉴 알약이다(메뉴 항목은 팝업이라 도구줄 DOM 밖). 메뉴 알약의 ↑↓는 메뉴가 먼저 받아 연다
export function TagTools({
	id,
	label,
	first,
	rest,
	onPick,
	after,
}: {
	id: string;
	label: string;
	first: TagGroup;
	rest: readonly TagGroup[];
	onPick: (kind: TagKind, value: string) => void;
	after?: ReactNode;
}) {
	const pills = first.items.slice(0, PILLS);
	const menus = [
		...(first.items.length > PILLS
			? [
					{
						name: TAG_TEXT.moreOf(first.short),
						group: first,
						items: first.items.slice(PILLS),
					},
				]
			: []),
		...rest.map((group) => ({ name: group.short, group, items: group.items })),
	];
	const count = pills.length + menus.length;
	const [active, setActive] = useState(0);
	// 화자·성우가 바뀌어 차례가 줄면 Tab 정지가 사라지지 않게 마지막 단추로 당긴다
	const stop = Math.min(active, count - 1);
	function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		// 메뉴 팝업(포털)의 키도 React 트리로 여기까지 올라온다. 도구줄 DOM 안의 키만 다룬다
		if (!event.currentTarget.contains(event.target as Node)) return;
		// 한 줄 차례라 ←→도 ↑↓처럼 앞뒤 단추다(nextCell의 행 = 단추 차례, 끝에서는 머문다)
		const key =
			event.key === "ArrowLeft"
				? "ArrowUp"
				: event.key === "ArrowRight"
					? "ArrowDown"
					: event.key;
		const to = nextCell(key, { row: stop, col: 0 }, count, 0);
		if (!to) return;
		event.preventDefault();
		setActive(to.row);
		event.currentTarget.querySelectorAll("button")[to.row]?.focus();
	}
	return (
		<>
			<div
				id={id}
				role="toolbar"
				aria-label={label}
				aria-orientation="horizontal"
				onKeyDown={onKeyDown}
				className={TAG_ROW}
			>
				{/* 첫 묶음 이름(시안 .lbl). 767px 이하는 숨긴다 */}
				<span className="mr-0.5 text-muted-foreground text-sm max-md:hidden">
					{first.short}
				</span>
				{pills.map((badge, i) => (
					<Button
						key={badge.value}
						variant="ghost"
						tabIndex={i === stop ? 0 : -1}
						aria-label={TAG_TEXT.badgeName(
							badge.label,
							insertedOf(first.kind, badge.value),
						)}
						onMouseDown={keepFocus}
						onFocus={() => setActive(i)}
						onClick={() => onPick(first.kind, badge.value)}
						className={TAG_PILL}
					>
						{badge.label}
					</Button>
				))}
				{menus.map((menu, j) => (
					<MenuPill
						key={menu.group.kind}
						name={menu.name}
						group={menu.group}
						items={menu.items}
						tabIndex={pills.length + j === stop ? 0 : -1}
						onFocus={() => setActive(pills.length + j)}
						onPick={onPick}
					/>
				))}
			</div>
			{after}
		</>
	);
}
