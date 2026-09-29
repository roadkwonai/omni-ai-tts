"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@tts-pilot-app/ui/components/dropdown-menu";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

const THEMES = [
	{ value: "system", label: "시스템 설정" },
	{ value: "light", label: "라이트" },
	{ value: "dark", label: "다크" },
] as const;

export function ModeToggle() {
	const { theme, setTheme } = useTheme();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="ghost" size="icon-lg" aria-label="테마 바꾸기" />
				}
			>
				<Sun aria-hidden="true" className="dark:hidden" />
				<Moon aria-hidden="true" className="hidden dark:block" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
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
