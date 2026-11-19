// 랜딩 카피와 이미지 경로(docs/briefs/landing.md 3·4절). 글자만 두어 화면 없이 테스트한다. 수치는 사실만 쓴다.

export const HERO_TITLE = "같은 문장을 다섯 성우에게 읽혀 보세요";
export const HERO_SUBTITLE =
	"Typecast, ElevenLabs, Fish Audio, Airy, Gemini의 한국어 성우를 한 작업실에서 들어 보고, 숫자 읽기까지 다듬어 음성 파일로 받습니다.";
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
// 문장이 다른 샘플이면 카드에 한 줄로 알린다(브리프 2절). 칩 아래에 늘 보인다
export function sampleNote(sample: HeroSample): string | null {
	return sample.other
		? `${sample.provider}는 다른 문장을 읽은 샘플이에요`
		: null;
}
export const HERO_LISTEN_NOTE = "듣기는 발음용 대본으로 만든 소리예요";
// 칩 위 안내. 재생한 뒤에도 그대로 둔다(상태에 따라 사라지지 않는다)
export const HERO_PICK_HINT = "성우를 눌러 들어 보세요";
// 출처 줄(카드 아래) 한 줄. 서비스 이름은 증명 띠가 말한다
export const HERO_SOURCE_LEAD = "모든 목소리는 AI로 만든 음성입니다";

// 증명 띠(브리프 3절 2번): 서비스 이름은 PROVIDERS, 글자만
export const PROOF_TEXT = "한 대본으로 한 파일 WAV, 문단별 zip, 자막 SRT까지";

// 재생 시간 m:ss. 길이를 모르면 0:00이다(`--:--`은 비활성이나 고장처럼 보여 0:00으로 보인다)
export function clockText(seconds: number): string {
	const total =
		Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
// api 954 + web 975 근처의 어림수. 빌드 때 세지 않고, 크게 어긋나면 이 한 곳을 고친다.
export const TEST_COUNT_TEXT = "자동 테스트 1,900여 개";

// 막대 메뉴(브리프 3절 0번): 이름과 앵커만 둔다. 앵커는 page.tsx 섹션 id와 같다
export const NAV_ITEMS = [
	{ href: "#listen", label: "들어 보기" },
	{ href: "#studio", label: "작업실" },
	{ href: "#drama", label: "드라마" },
	{ href: "#built", label: "만든 방법" },
	{ href: "#faq", label: "FAQ" },
] as const;

// 화면 크롭(브리프 6절): 공개 데모에서 찍은 라이트·다크 한 쌍. 이름 `<이름>.png`·`<이름>-dark.png`, 크기는 파일의 실제 픽셀이다.
// 휴대폰(390, 배율 3)은 글자가 읽히게 핵심 영역만 따로 찍은 `<이름>-mobile.png`·`<이름>-mobile-dark.png`를 쓴다
export type ShotFile = {
	light: string;
	dark: string;
	width: number;
	height: number;
};
export type Shot = ShotFile & { alt: string; mobile: ShotFile };
function crop(
	name: string,
	width: number,
	height: number,
	mobile: { width: number; height: number },
	alt: string,
): Shot {
	return {
		light: `/screenshots/crops/${name}.png`,
		dark: `/screenshots/crops/${name}-dark.png`,
		width,
		height,
		alt,
		mobile: {
			light: `/screenshots/crops/${name}-mobile.png`,
			dark: `/screenshots/crops/${name}-mobile-dark.png`,
			...mobile,
		},
	};
}
// 장식 마스코트: 곁의 제목이 뜻을 말하므로 화면에서는 alt=""로 그린다
export type Mascot = {
	src: string;
	width: number;
	height: number;
};

// 3 들어 보고 고른다 `#listen`
export const LISTEN = {
	title: "성우 고르는 시간을 줄여 줍니다",
	body: "다섯 서비스의 성우를 한 목록에서 찾고 기본 샘플을 바로 들어 봅니다. 내 문장으로 들어 보려면 크레딧이 들기 전에 확인 창이 먼저 뜹니다. 마음에 든 성우는 별을 눌러 저장하고 채널과 분류로 나눠 두면 다음에 바로 찾습니다.",
	// 크롭 위 재생 표시는 그림이 아니라 글로 알린다
	note: "기본 샘플은 무료로 들어요",
	shot: crop(
		"casting",
		2210,
		888,
		{ width: 1170, height: 1020 },
		"성우 캐스팅 화면의 일부. 왼쪽에 Typecast 성우 목록이 재생 단추와 별 단추, 내 문장 듣기 단추와 함께 있고, 오른쪽 패널에 고른 성우의 기본 샘플과 내 문장 듣기 설정이 있다",
	),
} as const;

// 5 문단마다 다르게 `#studio`: 본문 세 문장을 크롭 셋에 나눠 쓴다
export const STUDIO = {
	title: "문단마다 성우와 연기를 따로 붙입니다",
	mascot: {
		src: "/brand/mascot-feature-direct.png",
		width: 584,
		height: 640,
	} satisfies Mascot,
	items: [
		{
			id: "cards",
			name: "문단 카드",
			text: "대본을 문단 카드로 나누고 카드마다 성우와 설정을 고릅니다.",
			shot: crop(
				"paragraphs",
				1272,
				760,
				{ width: 1074, height: 846 },
				"음성 작업실의 문단 카드 둘. 카드마다 성우 이름과 만들기 단추, 대본, 숫자 검수 안내가 있고 카드 사이에 문단 뒤 쉼 0.5초가 보인다",
			),
		},
		{
			id: "tags",
			name: "자동 태그와 감정 팔레트",
			text: "자동 태그가 문단에 어울리는 감정과 말투를 제안하고, 감정 팔레트에서 직접 고를 수도 있습니다.",
			shot: crop(
				"tags",
				1272,
				444,
				{ width: 978, height: 273 },
				"문단 카드 하나. 대본 아래에 한숨, 웃음, 피식, 헉, 쉼 소리 태그 단추와 소리 더 보기, 분위기 메뉴 단추가 한 줄로 있다",
			),
		},
		{
			id: "make",
			name: "이어 듣기와 받기",
			text: "이미 만든 문단은 저장된 소리를 다시 쓰고, 이어 듣기로 처음부터 끝까지 확인합니다.",
			shot: crop(
				"makebar",
				1272,
				240,
				{ width: 1170, height: 222 },
				"작업실 아래쪽 막대. 받기 메뉴와 이어 듣기, 전체 만들기 단추가 한 줄에 있다",
			),
		},
	],
} as const;

// 6 숫자를 제대로 읽는다(짧은 섹션)
export const NUMBERS = {
	title: "“1,523억 달러”도 제대로 읽습니다",
	body: "숫자 표기를 찾아 한글 읽기를 제안하고, 적용할지 원문을 둘지 항목마다 정합니다. 애매한 항목은 ‘확인 필요’로 남기고, 검수하지 않은 채 만들려 하면 한 번 더 묻습니다.",
	shot: crop(
		"numbers",
		1344,
		1418,
		{ width: 1170, height: 1300 },
		"숫자 검수 창. 왼쪽에 문단별 숫자 열 개의 목록, 오른쪽에 ‘2026년’에 대한 추천 읽기 ‘이천이십육 년’과 원문 유지, 직접 입력 선택지가 있다",
	),
} as const;

// 7 대화 장면과 내 목소리 `#drama`: 짝 카드. 화자 칩은 화자 색 토큰(speaker-1~4)이고 번호와 이름이 함께 간다
export const SPEAKER_CHIPS = [1, 2, 3, 4] as const;
export const DRAMA_SECTION = {
	heading: "대화 장면과 내 목소리",
	cards: [
		{
			id: "drama",
			title: "두 사람 이상의 대화도 한 장면으로",
			body: "화자를 네 명까지 두고 줄 단위로 대본을 쓰면, 장면 파일 하나와 대사별 파일로 받습니다. 줄 사이 쉼도 조절합니다.",
			mascot: {
				src: "/brand/mascot-feature-drama.png",
				width: 640,
				height: 426,
			} satisfies Mascot,
		},
		{
			id: "clone",
			title: "내 목소리도 성우처럼",
			body: "녹음하거나 파일을 올려 Fish Audio나 Gemini에서 내 목소리를 만들고, 다른 성우처럼 대본에 붙입니다. 원본 녹음은 서버에 남기지 않습니다.",
			mascot: {
				src: "/brand/mascot-feature-clone.png",
				width: 584,
				height: 640,
			} satisfies Mascot,
		},
	],
} as const;

// 8 받기와 안심(3열)
export const DELIVER = {
	heading: "받기와 안심",
	items: [
		{
			id: "files",
			title: "파일 셋으로 받기",
			detail: "한 파일 WAV, 문단별 zip, 자막 SRT 가운데 골라 받습니다.",
		},
		{
			id: "credit",
			title: "크레딧은 확인한 뒤에만",
			detail:
				"크레딧이 드는 생성은 늘 확인 창을 거치고, 같은 문단은 다시 만들지 않습니다.",
		},
		{
			id: "usage",
			title: "남은 사용량을 한 화면에",
			detail:
				"연결 상태와 남은 사용량을 한곳에서 봅니다. Gemini는 조회 API가 없어 안내만 합니다.",
		},
	],
} as const;

export const TAGLINE_LINES = [
	"마음에 드는 목소리를 찾을 때까지,",
	"한 대본으로 계속 들어 봅니다.",
] as const;

export const STEPS = [
	{
		id: "voices",
		title: "성우 고르기",
		detail:
			"다섯 서비스의 성우를 미리 듣고 별로 저장해 두면 문단마다 붙일 성우가 모입니다.",
		image: "/brand/mascot-step-voices.png",
	},
	{
		id: "review",
		title: "대본 쓰고 숫자 검수",
		detail:
			"대본을 문단으로 나누고, 숫자 표기의 읽기를 확인해 원문을 지키거나 고칩니다.",
		image: "/brand/mascot-step-review.png",
	},
	{
		id: "export",
		title: "만들고 받기",
		detail:
			"문단을 만들어 들어 보고, 한 파일(WAV)·문단별(zip)·자막(SRT)으로 받습니다.",
		image: "/brand/mascot-step-export.png",
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
			"다섯 서비스의 성우를 탭으로 찾고 기본 샘플을 듣습니다. 크레딧이 드는 내 문장 듣기는 확인 창을 거칩니다.",
		alt: "성우 캐스팅 화면. 서비스 탭과 조건 줄 아래 성우 목록, 내 문장 입력 칸, 오른쪽에 고른 성우의 기본 샘플과 내 문장 듣기 설정이 있다",
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
			"저장한 대본과 최근 만든 대본을 제목과 본문으로 찾아 작업실에서 다시 엽니다. 채널과 분류 조건으로 좁혀 볼 수도 있습니다.",
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
			"별을 눌러 저장한 성우를 즐겨찾기, 자주 사용, 채널, 분류로 다시 찾습니다. 용도별로 나눠 둔 성우를 한 번에 모아 봅니다.",
		alt: "성우 보관함 화면. 저장한 성우 여섯 명의 목록과 보기·서비스·분류 조건, 오른쪽에 고른 성우의 상세 패널이 있다",
		light: "/screenshots/voices.png",
		dark: "/screenshots/voices-dark.png",
		mobile: "/screenshots/voices-mobile.png",
		mobileDark: "/screenshots/voices-mobile-dark.png",
	},
	{
		value: "presets",
		label: "프리셋",
		detail:
			"자주 쓰는 성우와 듣기 설정을 이름 붙여 두고 성우 캐스팅에서 불러옵니다. 복제해 조금만 고친 설정도 따로 둘 수 있습니다.",
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
		text: "크레딧이 드는 생성은 만들기 전에 확인 창을 거칩니다. 이미 만든 소리를 다시 듣고 받을 때는 음성 서비스를 부르지 않습니다.",
	},
	{
		title: "서비스 키 없는 공개 데모",
		text: "공개 데모는 음성 서비스 키가 없는 별도 배포입니다. 예시 데이터로 움직이고 음성 서비스를 부르지 않습니다.",
	},
	{
		title: "늦은 결과 저장",
		text: "음성 서비스의 응답이 늦어도 화면에 먼저 답한 뒤 결과를 마저 저장해서, 다시 열면 이어서 들을 수 있습니다.",
	},
	{
		title: "Postgres 캐시",
		text: "성우 목록은 Postgres에 24시간 보관하고, 서명이 같은 문단은 저장된 소리를 찾아 음성 서비스를 부르지 않습니다.",
	},
] as const;

export const REPO_URL = "https://github.com/roadkwonai/omni-ai-tts";
export const REPO_LINK_TEXT = "에서 코드와 설계 문서 보기";
export const CTA_TITLE = "이제 직접 들어 보세요";
export const CTA_TEXT =
	"가입 없이 공개 데모 작업실을 바로 써 볼 수 있습니다. 예시 데이터로 채워져 있고, 만들기는 미리 준비한 샘플을 들려줍니다.";
export const CTA_REPLAY_TEXT = "처음으로 돌아가 다시 듣기";
export const CTA_STACK_TEXT =
	"Next.js · oRPC · Better Auth · Drizzle · Neon · Vercel";
export const FOOTER_TEXT =
	"Omni AI TTS · © 2026 · Typecast, ElevenLabs, Fish Audio, Airy, Gemini는 각 회사의 상표입니다.";
