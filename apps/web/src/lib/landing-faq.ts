export type FaqItem = { question: string; answer: string };

// 답은 글자만 쓴다(화면과 FAQPage JSON-LD가 같은 글을 쓴다). 사실은 docs/domain/project.md와 ADR 0003·0009·0011·0013에서 왔다.
export const FAQ_ITEMS: readonly FaqItem[] = [
	{
		question: "공개 서비스인가요?",
		answer:
			"공개 데모는 누구나 로그인 없이 써 볼 수 있습니다. 소유자 본인용 작업실은 별도 주소의 비공개 서비스입니다.",
	},
	{
		question: "어떤 공급자를 쓰나요?",
		answer:
			"Typecast, ElevenLabs, Fish Audio, Airy, Gemini 다섯 곳입니다. 성우 목록을 한곳에서 보고, 담아 둔 성우로 대본을 만듭니다.",
	},
	{
		question: "비용은 어떻게 되나요?",
		answer:
			"공개 데모는 공급자를 부르지 않아 비용이 들지 않습니다. 직접 운영하는 작업실은 공급자마다 자기 계정의 크레딧이 쓰이고, 이 작업실이 결제를 받거나 크레딧을 팔지는 않습니다. 크레딧이 드는 생성은 만들기 전에 확인 창을 거치고, 이미 만든 소리를 다시 듣거나 받을 때는 공급자를 부르지 않습니다.",
	},
	{
		question: "내 목소리 녹음은 어디에 남나요?",
		answer:
			"원본은 브라우저에서 WAV로 바꿔 공급자에 보내는 요청 동안만 서버 메모리에 있고, 데이터베이스나 디스크, 외부 저장소에는 저장하지 않습니다. 공급자 쪽 보관은 각 공급자의 정책을 따릅니다.",
	},
	{
		question: "한국어 숫자는 어떻게 읽나요?",
		answer:
			"대본에서 숫자 표기를 찾아 한글 읽기를 제안하고, 적용할지 원문을 둘지 직접 고칠지 항목마다 정합니다. 제안은 이 작업실의 자체 규칙으로 만들고, 애매한 항목은 ‘확인 필요’로 남깁니다.",
	},
	{
		question: "어떤 기술로 만들었나요?",
		answer:
			"Next.js App Router, oRPC, Better Auth, Drizzle, Neon Postgres로 만들고 Vercel에 올렸습니다. 모노레포이고 자동 테스트가 1,900여 개 있습니다.",
	},
	{
		question: "직접 써 볼 수 있나요?",
		answer:
			"네. 공개 데모 작업실을 로그인 없이 바로 쓸 수 있습니다. 예시 데이터로 채워져 있고 매일 처음 상태로 돌아가며, 만들기는 미리 만든 샘플을 들려줍니다. 한국에서만 접속할 수 있습니다.",
	},
];

export function faqJsonLd(items: readonly FaqItem[]) {
	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: items.map((item) => ({
			"@type": "Question",
			name: item.question,
			acceptedAnswer: { "@type": "Answer", text: item.answer },
		})),
	} as const;
}

// <script> 안에 넣을 JSON. 여는 꺾쇠를 이스케이프해 `</script>`로 태그가 닫히지 않게 한다.
export function jsonLdText(data: unknown): string {
	return JSON.stringify(data).replaceAll("<", "\\u003c");
}
