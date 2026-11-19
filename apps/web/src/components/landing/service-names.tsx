import { PROVIDERS } from "@/lib/landing-content";

// 글 속 음성 서비스 이름은 번역하지 않고(translate="no") 줄 중간에서 끊기지 않게(whitespace-nowrap) 감싼다.
// 캡처하는 split이라 홀수 칸이 서비스 이름이다
const NAMES = new RegExp(`(${PROVIDERS.join("|")})`);

export function ServiceNames({ text }: { text: string }) {
	return text.split(NAMES).map((part, index) =>
		index % 2 === 1 ? (
			<span key={index} translate="no" className="whitespace-nowrap">
				{part}
			</span>
		) : (
			part
		),
	);
}
