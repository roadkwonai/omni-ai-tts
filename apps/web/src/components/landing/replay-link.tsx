"use client";

import type { ReactNode } from "react";

// 마지막 보조 행동: 오디션 무대로 돌아가 '모두 이어 듣기'에 포커스한다(브리프 5절). JS가 없으면 앵커(#audition-stage)로 이동만 한다.
// 포커스는 스크롤을 다시 일으키지 않게 preventScroll로 준다. 자동 재생은 하지 않는다.
export function ReplayLink({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		// biome-ignore lint/a11y/useValidAnchor: 진짜 같은 페이지 앵커(JS 없이도 #audition-stage로 간다)이고 onClick은 단추 포커스만 더한다
		<a
			href="#audition-stage"
			className={className}
			onClick={(event) => {
				// 새 탭·창으로 여는 클릭(수정 키·가운데 버튼)은 브라우저 기본 동작에 맡긴다
				if (
					event.metaKey ||
					event.ctrlKey ||
					event.shiftKey ||
					event.altKey ||
					event.button !== 0
				)
					return;
				const stage = document.getElementById("audition-stage");
				if (!stage) return;
				event.preventDefault();
				stage.scrollIntoView({ block: "center" });
				history.replaceState(null, "", "#audition-stage");
				document
					.getElementById("audition-play-all")
					?.focus({ preventScroll: true });
			}}
		>
			{children}
		</a>
	);
}
