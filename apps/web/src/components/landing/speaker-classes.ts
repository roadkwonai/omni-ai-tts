// 화자 색 토큰(speaker-1·2)의 클래스. 클래스는 정적 글자라야 Tailwind가 만든다. 색만으로 말하지 않고 번호 원과 이름이 함께 간다.
// 서버 그림(분해 도해)과 클라이언트(장면)가 함께 써서 'use client' 없는 모듈에 둔다
export const SPEAKER_CLASSES = {
	1: { chip: "bg-speaker-1-subtle", dot: "bg-speaker-1 text-speaker-1-on" },
	2: { chip: "bg-speaker-2-subtle", dot: "bg-speaker-2 text-speaker-2-on" },
} as const;
