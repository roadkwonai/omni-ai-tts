import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { atPageEnd, chipPress, landingRedirect, splitTagline } from "./landing";
import * as content from "./landing-content";
import {
	BUILD_POINTS,
	CTA_REPLAY_TEXT,
	CTA_TEXT,
	CTA_TITLE,
	clockText,
	DELIVER,
	DRAMA_SECTION,
	HERO_LISTEN_NOTE,
	HERO_NUMBER_COUNT,
	HERO_ORIGINAL,
	HERO_PICK_HINT,
	HERO_SAMPLES,
	HERO_SOURCE_LEAD,
	HERO_SPOKEN,
	HERO_SUBTITLE,
	HERO_TITLE,
	type HeroPart,
	LISTEN,
	NAV_ITEMS,
	NUMBERS,
	PROOF_TEXT,
	PROVIDERS,
	SPEAKER_CHIPS,
	STEPS,
	STUDIO,
	sampleName,
	sampleNote,
	TAGLINE_LINES,
	TEST_COUNT_TEXT,
	TOUR_TABS,
} from "./landing-content";
import { FAQ_ITEMS, faqJsonLd, jsonLdText } from "./landing-faq";

const PUBLIC = join(__dirname, "../../public");

describe("landingRedirect", () => {
	it("본인용: 소유자는 작업실로, 아니면 로그인으로 보낸다(소개 페이지 없음)", () => {
		expect(landingRedirect("owner", "owner")).toBe("/studio");
		expect(landingRedirect("none", "owner")).toBe("/login");
		expect(landingRedirect("denied", "owner")).toBe("/login");
	});
	it("공개 데모: 예시 소유자여도 소개 페이지를 그린다", () => {
		expect(landingRedirect("owner", "demo")).toBeNull();
		expect(landingRedirect("none", "demo")).toBeNull();
	});
});

describe("splitTagline", () => {
	it("줄은 그대로 두고 줄 안을 어절로 나눈다", () => {
		expect(splitTagline(["다섯 곳의 목소리를", "한 대본에 담는다."])).toEqual([
			["다섯", "곳의", "목소리를"],
			["한", "대본에", "담는다."],
		]);
	});
	it("빈 줄과 겹친 공백은 버린다", () => {
		expect(splitTagline(["  가   나 ", ""])).toEqual([["가", "나"]]);
	});
	it("태그라인은 두 줄 이상이고 브리프 4절 문구다", () => {
		expect(splitTagline(TAGLINE_LINES).length).toBeGreaterThanOrEqual(2);
		expect(TAGLINE_LINES).toEqual([
			"마음에 드는 목소리를 찾을 때까지,",
			"한 대본으로 계속 들어 봅니다.",
		]);
	});
});

describe("atPageEnd(태그라인이 끝까지 켜지는 기준)", () => {
	it("맨 아래에 닿으면 참이고, 반올림 오차 2px까지 봐준다", () => {
		expect(atPageEnd(1000, 900, 1900)).toBe(true);
		expect(atPageEnd(998.5, 900, 1900)).toBe(true);
	});
	it("아직 남았으면 거짓이다", () => {
		expect(atPageEnd(0, 900, 1900)).toBe(false);
		expect(atPageEnd(990, 900, 1900)).toBe(false);
	});
});

describe("문제/해결 섹션 제거(브리프 2번 뺌)", () => {
	it("PROBLEM 상수와 problem.tsx가 없다", () => {
		expect("PROBLEM" in content).toBe(false);
		expect(
			existsSync(join(__dirname, "../components/landing/problem.tsx")),
		).toBe(false);
		expect(
			readFileSync(join(__dirname, "../app/page.tsx"), "utf8"),
		).not.toMatch(/Problem/);
	});
	it("혜택 목록(3판에서 매력 섹션들로 바뀜)은 상수도 파일도 없다", () => {
		expect("BENEFITS" in content).toBe(false);
		expect("BENEFITS_LEAD" in content).toBe(false);
		expect(
			existsSync(join(__dirname, "../components/landing/benefits.tsx")),
		).toBe(false);
	});
});

describe("FAQ JSON-LD", () => {
	const data = faqJsonLd(FAQ_ITEMS);
	it("FAQPage 구조로 질문마다 답을 담는다", () => {
		expect(data["@context"]).toBe("https://schema.org");
		expect(data["@type"]).toBe("FAQPage");
		expect(data.mainEntity).toHaveLength(FAQ_ITEMS.length);
		const [first] = data.mainEntity;
		expect(first).toEqual({
			"@type": "Question",
			name: FAQ_ITEMS[0]?.question,
			acceptedAnswer: { "@type": "Answer", text: FAQ_ITEMS[0]?.answer },
		});
	});
	it("질문은 6~8개이고 답은 글자만이다", () => {
		expect(FAQ_ITEMS.length).toBeGreaterThanOrEqual(6);
		expect(FAQ_ITEMS.length).toBeLessThanOrEqual(8);
		for (const item of FAQ_ITEMS) {
			expect(item.answer).not.toMatch(/[<>]/);
			expect(item.answer.length).toBeGreaterThan(10);
		}
	});
	it("script 안에서 태그를 닫는 글자를 이스케이프한다", () => {
		const text = jsonLdText({ a: "</script><b>" });
		expect(text).not.toContain("<");
		expect(JSON.parse(text)).toEqual({ a: "</script><b>" });
	});
});

describe("랜딩 내용(브리프 4·6·9절)", () => {
	it("3판 구성: 작업실 크롭 셋, 드라마·내 보이스 짝 카드, 받기와 안심 셋, 화자 칩 넷, 3단계, 투어 탭 6개", () => {
		expect(STUDIO.items).toHaveLength(3);
		expect(DRAMA_SECTION.cards.map((c) => c.id)).toEqual(["drama", "clone"]);
		expect(DELIVER.items).toHaveLength(3);
		expect(SPEAKER_CHIPS).toHaveLength(4);
		expect(STEPS).toHaveLength(3);
		expect(TOUR_TABS).toHaveLength(6);
	});
	it("쓰는 이미지가 모두 public에 있다(크롭은 라이트·다크 쌍)", () => {
		const shots = [
			LISTEN.shot,
			...STUDIO.items.map((item) => item.shot),
			NUMBERS.shot,
		];
		const files = [
			...STEPS.map((step) => step.image),
			...TOUR_TABS.flatMap((tab) => [tab.light, tab.mobile]),
			...TOUR_TABS.flatMap((tab) => [tab.dark, tab.mobileDark]),
			...HERO_SAMPLES.map((sample) => sample.src),
			...shots.flatMap((shot) => [shot.light, shot.dark]),
			...shots.flatMap((shot) => [shot.mobile.light, shot.mobile.dark]),
			STUDIO.mascot.src,
			...DRAMA_SECTION.cards.map((card) => card.mascot.src),
		].filter((src): src is string => Boolean(src));
		for (const shot of shots) {
			expect(shot.dark).toBe(shot.light.replace(".png", "-dark.png"));
			expect(shot.mobile.light).toBe(shot.light.replace(".png", "-mobile.png"));
			expect(shot.mobile.dark).toBe(
				shot.light.replace(".png", "-mobile-dark.png"),
			);
			expect(shot.alt.length).toBeGreaterThan(5);
		}
		for (const src of files) {
			expect(existsSync(join(PUBLIC, src)), src).toBe(true);
		}
	});
	it("투어 다크 판은 `<이름>-dark.png` 경로로 연결한다(파일은 따로 넣는다)", () => {
		const dark = TOUR_TABS.filter((tab) => tab.dark);
		expect(dark.map((tab) => tab.value)).toEqual([
			"studio",
			"casting",
			"drama",
			"scripts",
			"voices",
			"presets",
		]);
		for (const tab of dark)
			expect(tab.dark).toBe(tab.light.replace(".png", "-dark.png"));
	});
	it("히어로 카드: 원문·발음용 숫자 강조 셋, 샘플 다섯(Airy만 다른 문장)", () => {
		const text = (parts: readonly HeroPart[]) =>
			parts.map((p) => p.text).join("");
		expect(text(HERO_ORIGINAL)).toBe(
			"2026년 3분기 반도체 수출액은 1,523억 달러로 집계됐습니다.",
		);
		expect(text(HERO_SPOKEN)).toBe(
			"이천이십육 년 삼 분기 반도체 수출액은 천오백이십삼억 달러로 집계됐습니다.",
		);
		expect(HERO_NUMBER_COUNT).toBe(3);
		expect(HERO_SPOKEN.filter((p) => p.num)).toHaveLength(3);
		expect(HERO_SAMPLES.map((s) => s.provider)).toEqual([...PROVIDERS]);
		expect(HERO_SAMPLES.filter((s) => s.other).map((s) => s.id)).toEqual([
			"airy",
		]);
	});
	it("재생 시간은 m:ss, 모르면 0:00", () => {
		expect(clockText(0)).toBe("0:00");
		expect(clockText(Number.NaN)).toBe("0:00");
		expect(clockText(7.9)).toBe("0:07");
		expect(clockText(65)).toBe("1:05");
	});
	it("헤드라인·부제·안내·마지막 행동은 브리프 4절 문구다", () => {
		expect(HERO_TITLE).toBe("같은 문장을 다섯 성우에게 읽혀 보세요");
		expect(HERO_SUBTITLE).toBe(
			"Typecast, ElevenLabs, Fish Audio, Airy, Gemini의 한국어 성우를 한 작업실에서 들어 보고, 숫자 읽기까지 다듬어 음성 파일로 받습니다.",
		);
		expect(HERO_PICK_HINT).toBe("성우를 눌러 들어 보세요");
		expect(HERO_SOURCE_LEAD).toBe("모든 목소리는 AI로 만든 음성입니다");
		expect(PROOF_TEXT).toBe(
			"한 대본으로 한 파일 WAV, 문단별 zip, 자막 SRT까지",
		);
		expect(CTA_TITLE).toBe("이제 직접 들어 보세요");
		expect(CTA_TEXT).toBe(
			"가입 없이 공개 데모 작업실을 바로 써 볼 수 있습니다. 예시 데이터로 채워져 있고, 만들기는 미리 준비한 샘플을 들려줍니다.",
		);
		expect(CTA_REPLAY_TEXT).toBe("처음으로 돌아가 다시 듣기");
		expect(LISTEN.title).toBe("성우 고르는 시간을 줄여 줍니다");
		expect(STUDIO.title).toBe("문단마다 성우와 연기를 따로 붙입니다");
		expect(NUMBERS.title).toBe("“1,523억 달러”도 제대로 읽습니다");
		expect(LISTEN.note).toBe("기본 샘플은 무료로 들어요");
	});
	it("공개 데모 FAQ는 로그인 없는 데모와 음성 서비스를 부르지 않는 비용을 말한다", () => {
		const own = FAQ_ITEMS.find((i) => i.question === "직접 써 볼 수 있나요?");
		const cost = FAQ_ITEMS.find((i) => i.question === "비용은 어떻게 되나요?");
		expect(own?.answer).toContain("로그인 없이");
		expect(own?.answer).toContain("한국에서만");
		expect(cost?.answer).toContain("음성 서비스를 부르지 않아");
		expect(
			BUILD_POINTS.some((p) =>
				p.text.includes("음성 서비스 키가 없는 별도 배포"),
			),
		).toBe(true);
	});
	it("화면 이미지마다 대체 글이 있다(장식 마스코트는 alt를 비운다)", () => {
		for (const tab of TOUR_TABS) expect(tab.alt.length).toBeGreaterThan(5);
	});
	it("투어 탭 값은 겹치지 않는다", () => {
		const values = TOUR_TABS.map((tab) => tab.value);
		expect(new Set(values).size).toBe(values.length);
	});
	it("막대 메뉴: 들어 보기 · 작업실 · 드라마 · 만든 방법 · FAQ(섹션 앵커)", () => {
		expect(NAV_ITEMS.map((i) => [i.label, i.href])).toEqual([
			["들어 보기", "#listen"],
			["작업실", "#studio"],
			["드라마", "#drama"],
			["만든 방법", "#built"],
			["FAQ", "#faq"],
		]);
	});
	it("FAQ 순서(브리프 3절 12번)", () => {
		expect(FAQ_ITEMS.map((i) => i.question)).toEqual([
			"직접 써 볼 수 있나요?",
			"비용은 어떻게 되나요?",
			"어떤 음성 서비스를 쓰나요?",
			"한국어 숫자는 어떻게 읽나요?",
			"내 목소리 녹음은 어디에 남나요?",
			"공개 서비스인가요?",
			"어떤 기술로 만들었나요?",
		]);
	});
	it("안 쓰는 히어로 크롭과 data-step 2·3 규칙은 지웠다", () => {
		for (const name of ["studio-hero.png", "studio-hero-dark.png"])
			expect(existsSync(join(PUBLIC, "screenshots", name)), name).toBe(false);
		const css = readFileSync(
			join(__dirname, "../components/landing/landing.css"),
			"utf8",
		);
		expect(css).not.toContain('data-step="2"');
		expect(css).not.toContain('data-step="3"');
	});
	it("투어 휴대폰 판: 여섯 탭 모두 `<이름>-mobile(-dark).png`가 public에 있다", () => {
		for (const tab of TOUR_TABS) {
			expect(tab.mobile).toBe(`/screenshots/${tab.value}-mobile.png`);
			expect(tab.mobileDark).toBe(`/screenshots/${tab.value}-mobile-dark.png`);
			expect(existsSync(join(PUBLIC, tab.mobileDark)), tab.mobileDark).toBe(
				true,
			);
		}
	});
	it("칩 누름: 고른 칩은 재생·멈춤, 다른 칩은 고르고 재생한다", () => {
		expect(chipPress(2, 2)).toBe("toggle");
		expect(chipPress(0, 3)).toBe("play");
	});
	it("샘플 이름: Airy는 성우 이름이 없어 'Airy 샘플', 다른 문장 한 줄은 Airy만", () => {
		const names = HERO_SAMPLES.map(sampleName);
		expect(names[0]).toBe("Typecast 포세이돈");
		expect(names[3]).toBe("Airy 샘플");
		expect(HERO_SAMPLES.map(sampleNote)).toEqual([
			null,
			null,
			null,
			"Airy는 다른 문장을 읽은 샘플이에요",
			null,
		]);
		expect(HERO_LISTEN_NOTE).toBe("듣기는 발음용 대본으로 만든 소리예요");
	});
	it("'공개 서비스인가요?'는 공개 데모와 본인용 비공개 서비스를 구분하고 JSON-LD와 같은 글이다", () => {
		const index = FAQ_ITEMS.findIndex(
			(i) => i.question === "공개 서비스인가요?",
		);
		const first = FAQ_ITEMS[index];
		expect(first?.question).toBe("공개 서비스인가요?");
		expect(first?.answer).toBe(
			"공개 데모는 누구나 로그인 없이 써 볼 수 있습니다. 소유자 본인용 작업실은 별도 주소의 비공개 서비스입니다.",
		);
		expect(faqJsonLd(FAQ_ITEMS).mainEntity[index]?.acceptedAnswer.text).toBe(
			first?.answer,
		);
		expect(BUILD_POINTS[0]?.text).toContain("공개 데모");
	});
	it("막대 링크는 같은 페이지 앵커뿐이다(만들지 않는 페이지로 가지 않는다)", () => {
		for (const item of NAV_ITEMS) expect(item.href).toMatch(/^#[a-z-]+$/);
	});
	it("증거 한 줄의 테스트 수는 어림수로 적는다", () => {
		expect(TEST_COUNT_TEXT).toBe("자동 테스트 1,900여 개");
		expect(BUILD_POINTS.length).toBeGreaterThanOrEqual(3);
	});
	it("금지어와 꾸민 수치가 없다(브리프 4절)", () => {
		const all = JSON.stringify([
			LISTEN,
			STUDIO,
			NUMBERS,
			DRAMA_SECTION,
			DELIVER,
			STEPS,
			TOUR_TABS,
			BUILD_POINTS,
			FAQ_ITEMS,
		]);
		for (const word of ["혁신", "강력한", "손쉽게", "획기적", "최고의"]) {
			expect(all, word).not.toContain(word);
		}
	});
	it("용어: '다섯 목소리'류와 '공급자'는 본문·FAQ·만든 방법 어디에도 없다('음성 서비스'로 쓴다)", () => {
		const body = JSON.stringify([
			FAQ_ITEMS,
			BUILD_POINTS,
			HERO_TITLE,
			HERO_SUBTITLE,
			TAGLINE_LINES,
			LISTEN,
			STUDIO,
			NUMBERS,
			DRAMA_SECTION,
			DELIVER,
			STEPS,
			TOUR_TABS,
			CTA_TITLE,
			CTA_TEXT,
			content.FOOTER_TEXT,
		]);
		for (const word of ["다섯 목소리", "다섯 곳의 목소리", "공급자", "담는"]) {
			expect(body, word).not.toContain(word);
		}
	});
});
