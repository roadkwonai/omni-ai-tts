"use client";

import { useEffect, useRef } from "react";

import { atPageEnd, splitTagline } from "@/lib/landing";

// 태그라인 단어 등장(B11): 어절마다 트리거 선(화면 아래에서 35%)을 넘을 때 opacity 0.71 → 1로 진해진다. 페이지 끝에 닿으면 남은 어절도 모두 켠다.
// 화면 아래에 있을 때만 data-armed로 흐리게 만들고(JS가 없거나 이미 지나갔으면 처음부터 진하다), 어절은 한 번만 켠다.
// 읽는 쪽은 어절 span이 이어진 한 문장으로 듣는다.
// 휴대폰·터치·움직임 줄이기에서는 스크롤 연동 모션을 쓰지 않는다(landing.css의 @media와 같은 조건).
const SCROLL_FILL =
	"(min-width: 768px) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

export function Tagline({ lines }: { lines: readonly string[] }) {
	const ref = useRef<HTMLParagraphElement>(null);

	useEffect(() => {
		const root = ref.current;
		if (!root || !window.matchMedia(SCROLL_FILL).matches) return;
		if (root.getBoundingClientRect().top < window.innerHeight) return;
		root.dataset.armed = "";
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const passed = entry.boundingClientRect.top < 0;
					if (!entry.isIntersecting && !passed) continue;
					(entry.target as HTMLElement).dataset.on = "";
					observer.unobserve(entry.target);
				}
			},
			{ rootMargin: "0px 0px -35% 0px" },
		);
		const words = root.querySelectorAll<HTMLElement>(".landing-word");
		for (const word of words) observer.observe(word);
		// 페이지 끝에서는 트리거 선에 닿지 못한 어절도 모두 켠다(B11)
		const lightAllAtEnd = () => {
			const { scrollHeight } = document.documentElement;
			if (!atPageEnd(window.scrollY, window.innerHeight, scrollHeight)) return;
			for (const word of words) word.dataset.on = "";
			observer.disconnect();
			window.removeEventListener("scroll", lightAllAtEnd);
		};
		window.addEventListener("scroll", lightAllAtEnd, { passive: true });
		lightAllAtEnd();
		return () => {
			observer.disconnect();
			window.removeEventListener("scroll", lightAllAtEnd);
		};
	}, []);

	return (
		<p
			ref={ref}
			className="landing-tagline mx-auto max-w-hero text-balance break-keep text-center font-bold text-3xl tracking-tight md:text-5xl"
		>
			{splitTagline(lines).map((words) => (
				<span key={words.join(" ")} className="block">
					{words.map((word, index) => (
						<span
							key={`${words.slice(0, index).join(" ")}|${word}`}
							className="landing-word"
						>
							{index > 0 ? " " : ""}
							{word}
						</span>
					))}
				</span>
			))}
		</p>
	);
}
