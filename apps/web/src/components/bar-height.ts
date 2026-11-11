// apps/web/src/components/bar-height.ts
// 음성 작업실·드라마 하단 막대가 함께 쓰는 막대 도움(지난 초, 기다림 안내 경계, 띠 높이).
// paragraph-bar와 drama-bar가 둘 다 여기서 가져와 드라마 화면이 음성 작업실 모듈(paragraph-bar·paragraph-provider)을 끌어오지 않는다
import { type RefObject, useEffect, useState } from "react";

// 만드는 중 이 초가 지나면 한 줄 칸에 기다림 안내(음성 작업실 브리프 5.6, 드라마 브리프 5.8 waitNote, 디자인 리뷰 D12)
export const WAIT_NOTE_AFTER = 20;

// 만드는 중 지난 시간(초). 공급자가 진행률을 주지 않아 지난 시간만 보인다(가짜 진행률 없음, tts-provider).
// 처음 1초는 0이다(지난 생성의 now가 남아 있어도 since보다 앞이라 0으로 잘린다)
export function useElapsed(since: number | null): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (since === null) return;
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [since]);
	return since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}

// 막대 띠 높이를 <html>의 --studio-bar-height(단위 px)로 둔다(providers.tsx Toaster가 calc() 안에서 쓴다). 떠나면 지운다.
// 음성 작업실·드라마 막대가 같은 변수를 쓴다(열 바닥 여백·scroll-padding·알림 간격·연기 지시 칸 최대 높이).
// 고르기 막대는 위쪽 변수(--studio-select-height)를 이름으로 넘긴다
export function useBarHeight(
	ref: RefObject<HTMLElement | null>,
	variable = "--studio-bar-height",
) {
	useEffect(() => {
		const band = ref.current;
		if (!band) return;
		const root = document.documentElement;
		const observer = new ResizeObserver(() => {
			root.style.setProperty(
				variable,
				`${band.getBoundingClientRect().height}px`,
			);
		});
		observer.observe(band);
		return () => {
			observer.disconnect();
			root.style.removeProperty(variable);
		};
	}, [ref, variable]);
}
