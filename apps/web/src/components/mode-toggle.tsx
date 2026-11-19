"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tts-pilot-app/ui/components/tooltip";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useState, useSyncExternalStore } from "react";

// 누를 때마다 이 순서로 바뀐다(2026-10-04 사용자 선택: 버튼 하나, 아이콘만).
const THEMES = [
	{ value: "system", label: "시스템 설정", icon: Monitor },
	{ value: "light", label: "라이트", icon: Sun },
	{ value: "dark", label: "다크", icon: Moon },
] as const;

// 고른 값은 브라우저(localStorage)에만 있다. 수화가 끝나기 전(서버 렌더와 첫 렌더)에는 false라 둘이 같다.
const noSubscribe = () => () => {};

// tooltipSide: 화면 맨 위 막대(랜딩)에서는 위쪽 툴팁이 잘려 bottom을 준다
export function ModeToggle({
	tooltipSide = "top",
}: {
	tooltipSide?: "top" | "bottom";
}) {
	const { theme, setTheme } = useTheme();
	const hydrated = useSyncExternalStore(
		noSubscribe,
		() => true,
		() => false,
	);
	const found = THEMES.findIndex((item) => item.value === theme);
	const index = Math.max(found, 0);
	const current = THEMES[index];
	const next = THEMES[(index + 1) % THEMES.length];
	const Icon = current.icon;
	// 아이콘만 보이므로 이름은 툴팁과 접근 이름으로 준다. 수화 전이나 목록 밖 값이면 지금 값을 모른다.
	const label =
		hydrated && found >= 0
			? `테마: ${current.label}, 누르면 ${next.label}`
			: "테마 바꾸기";
	// 누른 뒤에만 채워 새 테마를 스크린 리더에 알린다(처음부터 채우면 페이지마다 읽힌다).
	const [announcement, setAnnouncement] = useState("");

	return (
		<Tooltip>
			{/* closeOnClick false: 마우스로 눌러도 툴팁이 남아 새 값으로 바뀐다(키보드와 같게) */}
			<TooltipTrigger
				closeOnClick={false}
				render={
					<Button
						variant="ghost"
						size="icon-lg"
						aria-label={label}
						onClick={() => {
							setTheme(next.value);
							setAnnouncement(`테마: ${next.label}`);
						}}
					/>
				}
			>
				{hydrated ? (
					<Icon aria-hidden="true" />
				) : (
					<span aria-hidden="true" className="size-4" />
				)}
			</TooltipTrigger>
			<TooltipContent side={tooltipSide}>{label}</TooltipContent>
			<span role="status" className="sr-only">
				{announcement}
			</span>
		</Tooltip>
	);
}
