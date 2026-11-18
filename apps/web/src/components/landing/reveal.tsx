"use client";

import { type ReactNode, useEffect, useRef } from "react";

// 화면 아래 섹션만 숨겼다가 보일 때 한 번 올라오게 한다(스크롤 reveal, 브리프 6절).
// 이미 화면 안이면 건드리지 않아 첫 화면이 깜빡이지 않고, JS가 없으면 처음부터 보인다.
// 상태는 data-reveal을 DOM에 직접 쓴다(re-render 없음, rerender-use-ref-transient-values). 움직임 CSS는 landing.css.
export function Reveal({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el || el.getBoundingClientRect().top < window.innerHeight) return;
		el.dataset.reveal = "hidden";
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry?.isIntersecting) return;
				el.dataset.reveal = "shown";
				observer.disconnect();
			},
			{ rootMargin: "0px 0px -10% 0px" },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return (
		<div ref={ref} className={className}>
			{children}
		</div>
	);
}
