"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@tts-pilot-app/ui/components/dropdown-menu";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useRef, useState, useSyncExternalStore } from "react";

const THEMES = [
	{ value: "system", label: "시스템 설정", icon: Monitor },
	{ value: "light", label: "라이트", icon: Sun },
	{ value: "dark", label: "다크", icon: Moon },
] as const;

// 고른 값은 브라우저(localStorage)에만 있다. 수화가 끝나기 전(서버 렌더와 첫 렌더)에는 false라 둘이 같다.
const noSubscribe = () => () => {};

export function ModeToggle() {
	const { theme, setTheme } = useTheme();
	const hydrated = useSyncExternalStore(
		noSubscribe,
		() => true,
		() => false,
	);
	const current = hydrated
		? THEMES.find((item) => item.value === theme)
		: undefined;
	const Icon = current?.icon;
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger
				render={
					<Button
						ref={triggerRef}
						variant="ghost"
						size="icon-lg"
						aria-label={
							current ? `테마 바꾸기, 현재 ${current.label}` : "테마 바꾸기"
						}
					/>
				}
			>
				{Icon ? (
					<Icon aria-hidden="true" />
				) : (
					<span aria-hidden="true" className="size-4" />
				)}
			</DropdownMenuTrigger>
			{/* Tab·Shift+Tab은 메뉴를 닫고 포커스를 이 버튼에 둔다. Base UI는 Tab으로 닫힐 때 포커스가 이미 밖으로
			    나가 finalFocus가 듣지 않아, 사용자 핸들러가 먼저 불리는 mergeProps 순서를 이용해 직접 처리한다.
			    Esc·선택 뒤 복귀는 Base UI 기본 동작이 맡는다. */}
			<DropdownMenuContent
				align="start"
				onKeyDown={(event) => {
					if (event.key !== "Tab") return;
					event.preventDefault();
					setOpen(false);
					triggerRef.current?.focus();
				}}
			>
				{/* theme은 서버에서만 undefined다. 메뉴는 열 때만 그려지므로 수화 불일치가 없다. */}
				<DropdownMenuRadioGroup
					value={theme}
					onValueChange={(value) => setTheme(String(value))}
				>
					{THEMES.map((item) => (
						<DropdownMenuRadioItem
							key={item.value}
							value={item.value}
							closeOnClick
						>
							{item.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
