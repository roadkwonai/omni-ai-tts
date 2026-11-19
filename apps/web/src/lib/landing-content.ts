// 랜딩 카피와 이미지 경로(docs/briefs/landing.md 3·4절). 글자만 두어 화면 없이 테스트한다. 수치는 사실만 쓴다.

export const HERO_TITLE = "같은 문장을 다섯 성우에게 읽혀 보세요";
export const HERO_SUBTITLE =
	"Typecast, ElevenLabs, Fish Audio, Airy, Gemini의 한국어 성우를 한 작업실에서 들어 보고, 숫자 읽기까지 다듬어 음성 파일로 받아요.";
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

// 재생 단추·줄 이름에 쓰는 이름. Airy는 성우 이름이 없어 'Airy 샘플'이다
export function sampleName(sample: HeroSample): string {
	return `${sample.provider} ${sample.voice ?? "샘플"}`;
}
// 문장이 다른 샘플(Airy) 줄에 늘 보이는 표시(브리프 3절 1번)
export const OTHER_SAMPLE_LABEL = "다른 문장으로 만든 샘플";
export const HERO_LISTEN_NOTE = "듣기는 발음용 대본으로 만든 소리예요";
// 무대 안내와 '모두 이어 듣기' 단추(브리프 4절)
export const HERO_PICK_HINT = "줄을 누르면 하나만 들어요";
export const HERO_PLAY_ALL = "모두 이어 듣기";
export const HERO_PLAY_ALL_STOP = "이어 듣기 멈춤";
export const AUDIO_FAILED_TEXT = "재생할 수 없어요";
// 브라우저가 소리 재생을 막았을 때(실패가 아니라 한 번 더 누르면 된다)
export const AUDIO_BLOCKED_TEXT = "다시 눌러 주세요";
// 출처 줄(무대 아래) 한 줄
export const HERO_SOURCE_LEAD = "모든 목소리는 AI로 만든 음성입니다";
// '데모 작업실 열기'는 예시 대본이 열린 작업실로 간다(브리프 7절). 히어로·막대·마지막 행동이 함께 쓴다
export const DEMO_HREF = "/studio?example=1";
export const DEMO_LABEL = "데모 작업실 열기";

// 새 마스코트 그림(Main이 넣은 투명 PNG. 크기는 파일의 실제 픽셀이다)
export const MASCOTS = {
	director: { src: "/brand/mascot-director.png", width: 640, height: 640 },
	magnifier: { src: "/brand/mascot-magnifier.png", width: 585, height: 640 },
	piggy: { src: "/brand/mascot-piggy.png", width: 585, height: 640 },
} as const;

// 재생 시간 m:ss. 길이를 모르면 0:00이다(`--:--`은 비활성이나 고장처럼 보여 0:00으로 보인다)
export function clockText(seconds: number): string {
	const total =
		Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
// 막대 메뉴(브리프 3절 0번): 이름과 앵커만 둔다. 앵커는 page.tsx 섹션 id와 같다
export const NAV_ITEMS = [
	{ href: "#listen", label: "들어 보기" },
	{ href: "#try", label: "해 보기" },
	{ href: "#drama", label: "드라마" },
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

// 2 숫자 놀이터 `#try`(브리프 3·4절). 입력은 서버를 부르지 않고 브라우저에서 읽기 엔진을 돌린다
export const TRY = {
	title: "숫자가 든 문장을 넣어 보세요",
	body: "한국어 음성이 가장 자주 틀리는 곳이 숫자예요. 이 작업실은 읽는 방식을 먼저 정한 뒤 만들어요.",
	inputLabel: "읽어 볼 문장",
	resultHead: "이렇게 읽어요",
	emptyResult: "문장을 넣으면 한글 읽기가 나와요",
	noNumber: "숫자가 없어서 그대로 읽어요",
	checkHead: "확인 필요:",
	chipsLabel: "예시 문장",
	max: 200,
	// 스크린 리더용 한 줄(결과 전체를 키 입력마다 읽지 않는다)
	summary: (count: number, checks: number) =>
		`숫자 ${count}곳을 한글로 읽었어요${checks > 0 ? `, 확인 필요 ${checks}곳` : ""}`,
	// 확인 필요가 없는 문장(처음 보는 사람이 오류로 읽지 않게). '2026년 3분기' 칩을 누르면 확인 필요가 보인다
	example:
		"2026년 수출액은 1,523억 달러로 3.5% 늘었고, 발표는 오전 10:30에 해요",
	chips: [
		"2026년 3분기",
		"1,523억 달러",
		"3.5%",
		"오전 10:30",
		"010-1234-5678",
	],
} as const;
// 확인 필요 이유 문구. 작업실 숫자 검수 창(studio-text NUMBER_TEXT.reasons)과 같은 말이다(그 모듈은 서버·오류 코드까지 끌어와 랜딩 번들에 넣지 않고 여기 둔다. 같은 글인지는 테스트가 본다)
export const CHECK_REASON_TEXT = {
	range: "범위는 어떻게 읽을지 정해 주세요",
	fraction: "분수·날짜·점수 가운데 무엇인지 정해 주세요",
	product: "제품명·버전은 숫자 규칙으로 바꾸지 않아요",
	negative: "영하인지 마이너스인지 정해 주세요",
	unit: "단위를 어떻게 읽을지 정해 주세요",
	list: "쉼표로 이은 수는 어떻게 읽을지 정해 주세요",
	time: "시각인지 비율·점수인지 정해 주세요",
	large: "아주 큰 수나 긴 소수는 직접 정해 주세요",
	precision: "아주 큰 수나 긴 소수는 직접 정해 주세요",
	leading_zero: "앞이 0인 수는 어떻게 읽을지 정해 주세요",
	unit_join: "단위인지 단어의 일부인지 정해 주세요",
} as const;

// 3 연기 비교(브리프 3·4절): 같은 문장을 Fish Audio 효정2가 태그만 바꿔 읽은 샘플 넷(s2.1-pro-free로 만든 실제 소리). id는 파형 키(landing-waveforms)다
export const ACTING = {
	title: "태그 하나로 연기가 바뀌어요",
	body: "같은 문단에 연기 태그만 바꿔 붙였어요. 작업실에서는 자동 태그가 문단마다 어울리는 연기를 추천해요.",
	script: "오늘 회의는 여기까지예요. 다들 정말 수고 많으셨어요.",
	chipsLabel: "연기 고르기",
	hint: "칩을 누르면 그 연기로 들려줘요",
	source: "Fish Audio 효정2 · 같은 문장에 태그만 바꿨어요",
	takes: [
		{
			id: "act_plain",
			label: "기본",
			tag: null,
			src: "/samples/landing/act-plain.mp3",
			face: "/brand/mascot-face-plain.png",
		},
		{
			id: "act_whisper",
			label: "속삭이며",
			tag: "[속삭이며]",
			src: "/samples/landing/act-whisper.mp3",
			face: "/brand/mascot-face-whisper.png",
		},
		{
			id: "act_laugh",
			label: "웃으며",
			tag: "[웃으며]",
			src: "/samples/landing/act-laugh.mp3",
			face: "/brand/mascot-face-laugh.png",
		},
		{
			id: "act_sigh",
			label: "한숨 쉬며",
			tag: "[한숨 쉬며]",
			src: "/samples/landing/act-sigh.mp3",
			face: "/brand/mascot-face-sigh.png",
		},
	],
	// 표정 그림은 모두 192×192 정사각 투명 PNG다(칩 아이콘)
	faceSize: 192,
} as const;

// 5 작업 흐름: 4단 스트립. 보관함은 크롭이 없어 투어 화면(1440×900, 휴대폰 390×844)을 쓴다
export const FLOW = {
	title: "고르고, 나누고, 다듬고, 받기",
	steps: [
		{
			id: "casting",
			name: "성우 캐스팅",
			text: "다섯 음성 서비스의 성우를 들어 보고 골라요.",
			shot: crop(
				"casting",
				2210,
				888,
				{ width: 1170, height: 1020 },
				"성우 캐스팅 화면의 일부. 왼쪽에 Typecast 성우 목록이 재생 버튼과 별 버튼, 내 문장 듣기 버튼과 함께 있고, 오른쪽 패널에 고른 성우의 기본 샘플과 내 문장 듣기 설정이 있다",
			),
		},
		{
			id: "library",
			name: "보관함",
			text: "마음에 든 성우는 별을 눌러 담아 둬요.",
			shot: {
				light: "/screenshots/voices.png",
				dark: "/screenshots/voices-dark.png",
				width: 1440,
				height: 900,
				alt: "성우 보관함 화면. 담은 성우 여섯 명의 목록과 보기·서비스·분류 조건, 오른쪽에 고른 성우의 상세 패널이 있다",
				mobile: {
					light: "/screenshots/voices-mobile.png",
					dark: "/screenshots/voices-mobile-dark.png",
					width: 390,
					height: 844,
				},
			} satisfies Shot,
		},
		{
			id: "studio",
			name: "문단 작업실",
			text: "대본을 문단으로 나누고 문단마다 성우를 붙여요.",
			shot: crop(
				"paragraphs",
				1272,
				760,
				{ width: 1074, height: 846 },
				"음성 작업실의 문단 카드 둘. 카드마다 성우 이름과 만들기 버튼, 대본, 숫자 검수 안내가 있고 카드 사이에 문단 뒤 쉼 0.5초가 보인다",
			),
		},
		{
			id: "export",
			name: "받기",
			text: "한 파일 WAV, 문단별 zip, 자막 SRT로 받아요.",
			shot: crop(
				"makebar",
				1272,
				240,
				{ width: 1170, height: 222 },
				"작업실 아래쪽 막대. 받기 메뉴와 이어 듣기, 전체 만들기 버튼이 한 줄에 있다",
			),
		},
	],
} as const;

// 6 돈 걱정 없는 설계: 서버를 부르지 않는 재현(브리프 3·4절)
export const COST = {
	title: "크레딧은 확인한 뒤에만 써요",
	paragraphs: [
		"2026년 3분기 반도체 수출액은 1,523억 달러로 집계됐어요",
		"2026년 3분기 반도체 수출액은 1,523억 달러로 집계됐어요",
	],
	make: "만들기",
	confirmTitle: "크레딧이 들어요. 만들까요?",
	confirmDescription:
		"이 재현은 음성 서비스를 부르지 않아요. 실제 작업실도 만들기 전에 이 창을 거쳐요.",
	confirmAction: "만들기",
	done: "만들었어요",
	fresh: "새로 만듦",
	reused: "저장된 결과",
	reset: "다시 해 보기",
	// 원장: 누르기 전부터 보이는 합계(서버를 부르지 않는 재현이라 값은 로컬 상태다)
	ledgerLabel: "호출 합계",
	callWord: "호출",
	ledgerIdle: "크레딧 0",
	ledgerDone: "크레딧은 확인한 한 번만",
	doneNote: "첫 문단만 새로 만들고, 같은 둘째 문단은 저장된 결과를 써요",
	points: [
		"유료 호출은 늘 확인 창을 거쳐요",
		"같은 문단은 다시 만들지 않아요",
		"응답이 늦어도 끝까지 받아 저장해요",
	],
} as const;

// 4 드라마 장면 `#drama`(브리프 3·4절): Fish Audio s2.1-pro-free 한 번 요청으로 만든 두 사람 장면(10.83초). 줄 시각(초)은 생성 때 받은 단어 시각으로 정한 상수다.
// 화자 번호는 화자 색 토큰(speaker-1·2)이고 색만으로 말하지 않게 이름이 함께 간다
export type DramaLine = {
	speaker: 1 | 2;
	// 연기 지시. 화면에는 작은 회색 괄호로 보인다
	direction: string | null;
	text: string;
	start: number;
	end: number;
};
export const DRAMA = {
	title: "두 사람의 대화를 한 장면으로",
	body: "화자를 네 명까지 두고 줄마다 연기를 적으면 장면 하나로 만들어요. 대사별 파일과 자막 SRT로 나눠 받아요.",
	id: "drama_scene",
	src: "/samples/landing/drama-scene.mp3",
	total: 10.83,
	play: "장면 듣기",
	stop: "장면 멈춤",
	linesLabel: "대사",
	speakers: [
		{ n: 1, name: "민수", voice: "Fish Audio 보이스1" },
		{ n: 2, name: "지연", voice: "Fish Audio 효정2" },
	],
	lines: [
		{
			speaker: 1,
			direction: "놀라며",
			text: "지연 씨, 벌써 다 녹음했어요?",
			start: 0,
			end: 1.76,
		},
		{
			speaker: 2,
			direction: "웃으며",
			text: "네, 문단마다 성우를 따로 붙였더니 금방 끝났어요.",
			start: 1.76,
			end: 5.68,
		},
		{
			speaker: 1,
			direction: null,
			text: "숫자는요? 1,523억 달러 같은 거요.",
			start: 5.68,
			end: 8.38,
		},
		{
			speaker: 2,
			direction: "속삭이며",
			text: "그것도 미리 검수해 뒀죠.",
			start: 8.38,
			end: 10.83,
		},
	] as readonly DramaLine[],
	lineHint: "줄을 누르면 그 줄부터 들어요",
	numberNote: "3번 줄의 숫자는 한글 읽기로 바꿔 보냈어요",
	source: "Fish Audio에 한 번 요청해 만든 장면",
	// 분해 도해(정적): 장면 파형 하나가 줄별 조각으로 갈라진다
	splitCaption: "대사별 파일 4개와 자막 SRT로 받아요",
	splitFile: (n: number) => `대사 ${n}.wav`,
	srtFile: "자막.srt",
	clone: {
		title: "내 목소리도 성우처럼",
		body: "녹음이나 파일로 Fish Audio·Gemini에 내 목소리를 만들어요. 원본 녹음은 서버에 남기지 않아요.",
		mascot: {
			src: "/brand/mascot-feature-clone.png",
			width: 584,
			height: 640,
		} satisfies Mascot,
	},
} as const;

// 재생 시각(초)에 해당하는 줄 번호. 줄은 [start, end)이고 장면 밖(음수, 끝 이후)은 null이다
export function dramaLineAt(seconds: number): number | null {
	const index = DRAMA.lines.findIndex(
		(line) => seconds >= line.start && seconds < line.end,
	);
	return index < 0 ? null : index;
}

// 태그라인 문구(tagline.tsx는 다른 세션 파일이라 컴포넌트와 이 상수를 그대로 두고, 4판 페이지에서는 쓰지 않는다)
export const TAGLINE_LINES = [
	"마음에 드는 목소리를 찾을 때까지,",
	"한 대본으로 계속 들어 봅니다.",
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
			"화자마다 성우를 붙인 줄 단위 대본을 한 장면으로 연기하게 합니다. 장면 파일과 대사별 파일로 받습니다.",
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
			"별을 눌러 담은 성우를 즐겨찾기, 자주 사용, 채널, 분류로 다시 찾습니다. 용도별로 나눠 둔 성우를 한 번에 모아 봅니다.",
		alt: "성우 보관함 화면. 담은 성우 여섯 명의 목록과 보기·서비스·분류 조건, 오른쪽에 고른 성우의 상세 패널이 있다",
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

export const REPO_URL = "https://github.com/roadkwonai/omni-ai-tts";
export const REPO_LINK_TEXT = "에서 코드 보기";
export const CTA_TITLE = "이제 직접 들어 보세요";
export const CTA_TEXT =
	"가입 없이 공개 데모 작업실을 바로 써 볼 수 있어요. 예시 데이터로 채워져 있고, 만들기는 미리 준비한 샘플을 들려줘요.";
export const CTA_REPLAY_TEXT = "처음으로 돌아가 다시 듣기";
export const CTA_STACK_TEXT =
	"Next.js · oRPC · Better Auth · Drizzle · Neon · Vercel";
export const FOOTER_TEXT =
	"Omni AI TTS · © 2026 · Typecast, ElevenLabs, Fish Audio, Airy, Gemini는 각 회사의 상표입니다.";
