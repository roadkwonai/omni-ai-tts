// 랜딩 카피와 이미지 경로(docs/briefs/landing.md 3·4절). 글자만 두어 화면 없이 테스트한다. 수치는 사실만 쓴다.

export const HERO_TITLE = "같은 문단, 다섯 목소리로 들어 보세요";
export const HERO_SUBTITLE =
	"다섯 공급자 성우를 한 작업실에서 고르고, 한국어 숫자 발음을 검수해 음성 파일로 받습니다.";
export const PROVIDERS = [
	"Typecast",
	"ElevenLabs",
	"Fish Audio",
	"Airy",
	"Gemini",
] as const;

// 히어로 문단 카드(브리프 3·5절). 숫자 부분(num)만 강조한다. 두 글은 같은 문단의 원문과 발음용이다.
export type HeroPart = { text: string; num?: true };
export const HERO_ORIGINAL: readonly HeroPart[] = [
	{ text: "2026년", num: true },
	{ text: " " },
	{ text: "3분기", num: true },
	{ text: " 반도체 수출액은 " },
	{ text: "1,523억 달러", num: true },
	{ text: "로 집계됐습니다." },
];
export const HERO_SPOKEN: readonly HeroPart[] = [
	{ text: "이천이십육 년", num: true },
	{ text: " " },
	{ text: "삼 분기", num: true },
	{ text: " 반도체 수출액은 " },
	{ text: "천오백이십삼억 달러", num: true },
	{ text: "로 집계됐습니다." },
];
export const HERO_NUMBER_COUNT = HERO_ORIGINAL.filter((p) => p.num).length;

// Airy 샘플은 크레딧 문제로 지난 결과물이라 문장이 다르다(other)
export type HeroSample = {
	id: string;
	provider: (typeof PROVIDERS)[number];
	voice: string | null;
	src: string;
	other?: true;
};
export const HERO_SAMPLES: readonly HeroSample[] = [
	{
		id: "typecast",
		provider: "Typecast",
		voice: "포세이돈",
		src: "/samples/typecast.mp3",
	},
	{
		id: "elevenlabs",
		provider: "ElevenLabs",
		voice: "Sarah",
		src: "/samples/elevenlabs.mp3",
	},
	{
		id: "fish_audio",
		provider: "Fish Audio",
		voice: "일반여성2",
		src: "/samples/fish_audio.mp3",
	},
	{
		id: "airy",
		provider: "Airy",
		voice: null,
		src: "/samples/airy.mp3",
		other: true,
	},
	{
		id: "gemini",
		provider: "Gemini",
		voice: "Puck",
		src: "/samples/gemini.wav",
	},
];

// 재생 단추·칩 이름에 쓰는 이름. Airy는 성우 이름이 없어 'Airy 샘플'이다
export function sampleName(sample: HeroSample): string {
	return `${sample.provider} ${sample.voice ?? "샘플"}`;
}
// 문장이 다른 샘플이면 카드에 한 줄로 알린다(브리프 2절)
export function sampleNote(sample: HeroSample): string | null {
	return sample.other
		? `${sample.provider}는 다른 문장을 읽은 샘플이에요`
		: null;
}
export const HERO_LISTEN_NOTE = "듣기는 발음용 대본으로 만든 소리예요";

// 출처 줄(카드 아래). 이름과 도메인만 번역하지 않고, 항목 하나는 줄 끝에서 쪼개지지 않는다
export type HeroSource = { name: string; detail?: string; domain?: string };
export const HERO_SOURCE_LEAD = "모든 목소리는 AI로 만든 음성입니다";
export const HERO_SOURCES: readonly HeroSource[] = [
	{ name: "Typecast", detail: "성우 포세이돈", domain: "typecast.ai" },
	{ name: "ElevenLabs", domain: "elevenlabs.io" },
	{ name: "Fish Audio" },
	{ name: "Airy" },
	{ name: "Gemini" },
];

// 재생 시간 m:ss. 길이를 모르면(불러오기 전) 0:00
export function clockText(seconds: number): string {
	const total =
		Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
// api 954 + web 975 근처의 어림수. 빌드 때 세지 않고, 크게 어긋나면 이 한 곳을 고친다.
export const TEST_COUNT_TEXT = "자동 테스트 1,900여 개";

export const NAV_ITEMS = [
	{ href: "#features", label: "할 수 있는 일" },
	{ href: "#how", label: "작동 방식" },
	{ href: "#built", label: "만든 방법" },
	{ href: "#faq", label: "FAQ" },
] as const;

// 혜택 제목 아래 한 문장: 공급자 사이트를 오가던 일을 한 작업실에서 한다(문제/해결 섹션을 뺀 자리)
export const BENEFITS_LEAD =
	"공급자 사이트를 오가며 하던 일을 한 작업실에서 고르고, 검수하고, 한 파일로 받습니다.";

export const BENEFITS = [
	{
		id: "voices",
		title: "다섯 공급자 성우를 한 목록에서",
		detail:
			"탭 하나로 공급자를 바꿔 가며 성우를 찾고, 기본 샘플을 바로 듣고, 마음에 들면 별을 눌러 담아 둡니다.",
	},
	{
		id: "paragraphs",
		title: "문단마다 다른 성우",
		detail:
			"문단 카드마다 성우와 설정을 따로 붙입니다. 이미 만든 문단은 다시 만들지 않고 저장된 소리를 씁니다.",
	},
	{
		id: "numbers",
		title: "한국어 숫자 발음 검수",
		detail:
			"“1,523억 달러” 같은 숫자 표기를 찾아 한글 읽기를 제안하고, 적용할지 원문을 둘지 항목마다 정합니다.",
	},
	{
		id: "drama",
		title: "두 사람 이상의 드라마 장면",
		detail:
			"화자 최대 네 명에게 Fish Audio 성우를 붙여 줄 단위 대본을 한 장면으로 연기시키고, 대사별 파일로 받습니다.",
	},
	{
		id: "clone",
		title: "내 목소리 클론",
		detail:
			"녹음이나 파일로 Fish Audio·Gemini 클론 성우를 만들고, 만든 성우를 다른 성우처럼 대본에 붙입니다.",
	},
] as const;

export const TAGLINE_LINES = [
	"다섯 곳의 목소리를",
	"한 대본에 담는다.",
] as const;

export const STEPS = [
	{
		id: "voices",
		title: "성우 고르기",
		detail:
			"다섯 공급자의 성우를 미리 듣고 담아 두면 문단마다 붙일 성우가 모입니다.",
		image: "/brand/mascot-step-voices.png",
		alt: "헤드폰을 쓴 마이크 마스코트가 대본을 들고 성우 샘플 세 개를 비교해 듣는 모습",
	},
	{
		id: "review",
		title: "대본 쓰고 숫자 검수",
		detail:
			"대본을 문단으로 나누고, 숫자 표기의 읽기를 확인해 원문을 지키거나 고칩니다.",
		image: "/brand/mascot-step-review.png",
		alt: "마이크 마스코트가 돋보기로 대본의 숫자 123을 꼼꼼히 확인하는 모습",
	},
	{
		id: "export",
		title: "만들고 받기",
		detail:
			"문단을 만들어 들어 보고, 한 파일(WAV)·문단별(zip)·자막(SRT)으로 받습니다.",
		image: "/brand/mascot-step-export.png",
		alt: "마이크 마스코트가 음성 파일을 안고 내려받기 아이콘 옆에서 기뻐하는 모습",
	},
] as const;

// 화면마다 라이트·다크 × 데스크톱·휴대폰(390px) 네 장(브리프 3절 5번)
export type TourTab = {
	value: string;
	label: string;
	detail: string;
	alt: string;
	light: string;
	dark: string;
	mobile: string;
	mobileDark: string;
};

export const TOUR_TABS: readonly TourTab[] = [
	{
		value: "studio",
		label: "음성 작업실",
		detail:
			"대본을 문단 카드로 나누고 문단마다 성우를 붙입니다. 숫자 검수와 전체 만들기, 받기까지 한 화면에서 합니다.",
		alt: "음성 작업실 화면. 왼쪽에 기본 성우와 문단 뒤 쉼, 가운데에 성우가 붙은 문단 카드와 숫자 검수 안내, 오른쪽에 만든 문단 수와 예상 길이, 아래에 전체 만들기 막대가 있다",
		light: "/screenshots/studio.png",
		dark: "/screenshots/studio-dark.png",
		mobile: "/screenshots/studio-mobile.png",
		mobileDark: "/screenshots/studio-mobile-dark.png",
	},
	{
		value: "casting",
		label: "성우 캐스팅",
		detail:
			"다섯 공급자 성우를 탭으로 찾고 기본 샘플을 듣습니다. 크레딧이 드는 내 문장 듣기는 확인 창을 거칩니다.",
		alt: "성우 캐스팅 화면. 공급자 탭과 조건 줄 아래 성우 목록, 내 문장 입력 칸, 오른쪽에 고른 성우의 기본 샘플과 담기 패널이 있다",
		light: "/screenshots/casting.png",
		dark: "/screenshots/casting-dark.png",
		mobile: "/screenshots/casting-mobile.png",
		mobileDark: "/screenshots/casting-mobile-dark.png",
	},
	{
		value: "drama",
		label: "드라마 작업실",
		detail:
			"화자마다 성우를 붙인 줄 단위 대본을 한 장면으로 연기시킵니다. 장면 파일과 대사별 파일로 받습니다.",
		alt: "드라마 작업실 화면. 화자 두 명에게 성우가 붙어 있고, 화자 칩이 달린 대본 네 줄과 줄 사이 쉼, 아래에 받기와 읽기 막대가 있다",
		light: "/screenshots/drama.png",
		dark: "/screenshots/drama-dark.png",
		mobile: "/screenshots/drama-mobile.png",
		mobileDark: "/screenshots/drama-mobile-dark.png",
	},
	{
		value: "scripts",
		label: "대본 보관함",
		detail:
			"저장한 대본과 최근 만든 대본을 제목과 본문으로 찾아 작업실에서 다시 엽니다.",
		alt: "대본 보관함 화면. 검색 칸과 채널·카테고리·타입 조건 아래 저장한 대본 목록이 제목, 미리 보기, 문단 수, 분류 칩과 함께 보인다",
		light: "/screenshots/scripts.png",
		dark: "/screenshots/scripts-dark.png",
		mobile: "/screenshots/scripts-mobile.png",
		mobileDark: "/screenshots/scripts-mobile-dark.png",
	},
	{
		value: "voices",
		label: "성우 보관함",
		detail:
			"별을 눌러 담은 성우를 즐겨찾기, 자주 사용, 채널, 분류로 다시 찾습니다.",
		alt: "성우 보관함 화면. 담은 성우 여섯 명의 목록과 보기·공급자·분류 조건, 오른쪽에 고른 성우의 담기 패널이 있다",
		light: "/screenshots/voices.png",
		dark: "/screenshots/voices-dark.png",
		mobile: "/screenshots/voices-mobile.png",
		mobileDark: "/screenshots/voices-mobile-dark.png",
	},
	{
		value: "presets",
		label: "프리셋",
		detail:
			"자주 쓰는 성우와 듣기 설정을 이름 붙여 두고 성우 캐스팅에서 불러옵니다.",
		alt: "프리셋 화면. 프리셋 두 개가 성우, 채널, 모델과 속도·표현력 설정 요약과 함께 줄마다 고치기·복제·지우기 버튼을 갖고 있다",
		light: "/screenshots/presets.png",
		dark: "/screenshots/presets-dark.png",
		mobile: "/screenshots/presets-mobile.png",
		mobileDark: "/screenshots/presets-mobile-dark.png",
	},
];

export const STACK = [
	"Next.js App Router",
	"oRPC",
	"Better Auth",
	"Drizzle",
	"Neon",
	"Vercel",
] as const;

export const BUILD_POINTS = [
	{
		title: "본인용 작업실은 소유자 전용 세션",
		text: "본인용 작업실은 로그인한 이메일이 서버 설정의 소유자 하나와 같을 때만 소유자로 인정하고, 유료 호출은 호출마다 세션에서 소유자를 확인합니다. 가입은 서버에서 막혀 있어, 누구나 쓰는 쪽은 공개 데모입니다.",
	},
	{
		title: "유료 호출 전 확인",
		text: "크레딧이 드는 생성은 만들기 전에 확인 창을 거칩니다. 이미 만든 소리를 다시 듣고 받을 때는 공급자를 부르지 않습니다.",
	},
	{
		title: "공급자 키 없는 공개 데모",
		text: "공개 데모는 공급자 키가 없는 별도 배포입니다. 예시 데이터로 움직이고 공급자를 부르지 않습니다.",
	},
	{
		title: "늦은 결과 저장",
		text: "공급자 응답이 늦어도 응답 뒤 작업으로 결과를 저장해, 다시 열었을 때 이어서 들을 수 있습니다.",
	},
	{
		title: "Postgres 캐시",
		text: "성우 목록은 24시간 Postgres에 두고, 서명이 같은 문단은 저장된 소리를 찾아 공급자를 부르지 않습니다.",
	},
] as const;

export const REPO_URL = "https://github.com/roadkwonai/omni-ai-tts";
export const REPO_LINK_TEXT = "에서 코드와 설계 문서 보기";
export const CTA_TITLE = "성우 고르기부터 받기까지, 여기까지입니다";
export const CTA_TEXT =
	"가입 없이 공개 데모 작업실을 바로 써 볼 수 있고, 위로 올라가 화면을 다시 볼 수도 있습니다.";
export const CTA_STACK_TEXT =
	"Next.js · oRPC · Better Auth · Drizzle · Neon · Vercel";
export const FOOTER_TEXT =
	"Omni AI TTS · © 2026 · Typecast, ElevenLabs, Fish Audio, Airy, Gemini는 각 회사의 상표입니다.";
