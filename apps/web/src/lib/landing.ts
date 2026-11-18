import type { OwnerSession } from "@/context";

// 소유자는 랜딩 없이 작업실로 간다(브리프 1절). 그 밖은 공개 랜딩을 그린다.
export function landingRedirect(
	state: OwnerSession["state"],
): "/studio" | null {
	return state === "owner" ? "/studio" : null;
}

// 페이지 맨 아래에 닿았는지(반올림 오차 2px). 태그라인이 트리거 선에 못 닿아도 끝에서는 모든 어절을 켠다.
export function atPageEnd(
	scrollY: number,
	viewportHeight: number,
	scrollHeight: number,
): boolean {
	return scrollY + viewportHeight >= scrollHeight - 2;
}

// 태그라인을 줄(디자인한 줄바꿈)과 어절로 나눈다. 어절마다 스크롤로 진해진다.
export function splitTagline(lines: readonly string[]): string[][] {
	return lines
		.map((line) => line.split(/\s+/).filter(Boolean))
		.filter((words) => words.length > 0);
}
