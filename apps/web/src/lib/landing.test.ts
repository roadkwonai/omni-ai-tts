import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { atPageEnd, landingRedirect, splitTagline } from "./landing";
import * as content from "./landing-content";
import {
	ACTING,
	BUILT,
	CHECK_REASON_TEXT,
	COST,
	CTA_REPLAY_TEXT,
	CTA_TEXT,
	CTA_TITLE,
	clockText,
	DEMO_HREF,
	DEMO_LABEL,
	DRAMA,
	dramaLineAt,
	FLOW,
	HERO_LISTEN_NOTE,
	HERO_NUMBER_COUNT,
	HERO_ORIGINAL,
	HERO_PICK_HINT,
	HERO_PLAY_ALL,
	HERO_SAMPLES,
	HERO_SOURCE_LEAD,
	HERO_SPOKEN,
	HERO_SUBTITLE,
	HERO_TITLE,
	type HeroPart,
	MASCOTS,
	NAV_ITEMS,
	OTHER_SAMPLE_LABEL,
	PROVIDERS,
	sampleName,
	TAGLINE_LINES,
	TOUR_TABS,
	TRY,
} from "./landing-content";
import { FAQ_ITEMS, faqJsonLd, jsonLdText } from "./landing-faq";
import { WAVEFORMS } from "./landing-waveforms";

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
	it("4판 구성: 작업 흐름 4단, 비용 점 셋, 숫자 띠 넷, 칩 다섯, 연기 넷, 화자 둘·대사 넷, 투어 탭 6개", () => {
		expect(FLOW.steps.map((s) => s.id)).toEqual([
			"casting",
			"library",
			"studio",
			"export",
		]);
		expect(COST.points).toHaveLength(3);
		expect(COST.paragraphs).toHaveLength(2);
		expect(BUILT.stats.map((s) => s.id)).toEqual([
			"code",
			"tests",
			"adr",
			"weeks",
		]);
		expect(TRY.chips).toHaveLength(5);
		expect(ACTING.takes.map((t) => t.label)).toEqual([
			"기본",
			"속삭이며",
			"웃으며",
			"한숨 쉬며",
		]);
		expect(DRAMA.speakers.map((s) => s.name)).toEqual(["민수", "지연"]);
		expect(DRAMA.lines).toHaveLength(4);
		expect(TOUR_TABS).toHaveLength(6);
	});
	it("쓰는 이미지·소리가 모두 public에 있다(크롭은 라이트·다크 쌍, 마스코트 크기는 파일 픽셀)", () => {
		const shots = FLOW.steps.map((step) => step.shot);
		const files = [
			...TOUR_TABS.flatMap((tab) => [tab.light, tab.mobile]),
			...TOUR_TABS.flatMap((tab) => [tab.dark, tab.mobileDark]),
			...HERO_SAMPLES.map((sample) => sample.src),
			...ACTING.takes.flatMap((take) => [take.src, take.face]),
			DRAMA.src,
			DRAMA.clone.mascot.src,
			...shots.flatMap((shot) => [shot.light, shot.dark]),
			...shots.flatMap((shot) => [shot.mobile.light, shot.mobile.dark]),
			...Object.values(MASCOTS).map((mascot) => mascot.src),
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
	it("파형: 소리마다(히어로 다섯·연기 넷·드라마 장면) 막대 64개(0~1, 소수 2자리)와 길이가 있고 소리가 난다", () => {
		const ids = [
			...HERO_SAMPLES.map((s) => s.id),
			...ACTING.takes.map((t) => t.id),
			DRAMA.id,
		];
		for (const id of ids) {
			const wave = WAVEFORMS[id];
			expect(wave?.bars, id).toHaveLength(64);
			expect(wave?.seconds, id).toBeGreaterThan(0);
			for (const value of wave?.bars ?? []) {
				expect(value).toBeGreaterThanOrEqual(0);
				expect(value).toBeLessThanOrEqual(1);
				expect(Math.round(value * 100) / 100).toBe(value);
			}
			expect(Math.max(...(wave?.bars ?? [])), id).toBe(1);
		}
		expect(Object.keys(WAVEFORMS).sort()).toEqual([...ids].sort());
		// 장면 길이 상수는 파형 길이(0.1초 단위)와 같다
		expect(WAVEFORMS[DRAMA.id]?.seconds).toBeCloseTo(DRAMA.total, 1);
	});
	it("드라마 줄: 0초에서 끝까지 빈틈없이 이어지고 화자·지시·대사가 브리프 그대로다", () => {
		const { lines } = DRAMA;
		expect(lines[0]?.start).toBe(0);
		expect(lines.at(-1)?.end).toBe(DRAMA.total);
		lines.forEach((line, index) => {
			expect(line.end, `줄 ${index + 1}`).toBeGreaterThan(line.start);
			if (index > 0) expect(line.start).toBe(lines[index - 1]?.end);
		});
		expect(lines.map((l) => [l.speaker, l.direction])).toEqual([
			[1, "놀라며"],
			[2, "웃으며"],
			[1, null],
			[2, "속삭이며"],
		]);
		expect(lines[2]?.text).toBe("숫자는요? 1,523억 달러 같은 거요.");
	});
	it("dramaLineAt: 줄 경계(0, 1.76, 5.68, 8.38)에서 다음 줄로 넘어가고 장면 밖은 null이다", () => {
		expect(dramaLineAt(0)).toBe(0);
		expect(dramaLineAt(1.75)).toBe(0);
		expect(dramaLineAt(1.76)).toBe(1);
		expect(dramaLineAt(5.67)).toBe(1);
		expect(dramaLineAt(5.68)).toBe(2);
		expect(dramaLineAt(8.38)).toBe(3);
		expect(dramaLineAt(10.82)).toBe(3);
		expect(dramaLineAt(10.83)).toBeNull();
		expect(dramaLineAt(30)).toBeNull();
		expect(dramaLineAt(-0.1)).toBeNull();
	});
	it("연기 비교: 같은 문장에 태그만 다르고(기본은 태그 없음) 샘플 경로·표정 그림 이름이 짝이다", () => {
		expect(ACTING.takes.map((t) => t.tag)).toEqual([
			null,
			"[속삭이며]",
			"[웃으며]",
			"[한숨 쉬며]",
		]);
		for (const take of ACTING.takes) {
			expect(take.src).toBe(
				`/samples/landing/${take.id.replace("_", "-")}.mp3`,
			);
			expect(take.face).toMatch(/^\/brand\/mascot-face-[a-z]+\.png$/);
		}
		expect(ACTING.source).toBe(
			"Fish Audio 효정2 · 같은 문장에 태그만 바꿨어요",
		);
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
			"Typecast, ElevenLabs, Fish Audio, Airy, Gemini의 한국어 성우를 한 작업실에서 들어 보고, 숫자 읽기까지 다듬어 음성 파일로 받아요.",
		);
		expect(HERO_PICK_HINT).toBe("줄을 누르면 하나만 들어요");
		expect(HERO_PLAY_ALL).toBe("모두 이어 듣기");
		expect(OTHER_SAMPLE_LABEL).toBe("다른 문장으로 만든 샘플");
		expect(HERO_SOURCE_LEAD).toBe("모든 목소리는 AI로 만든 음성입니다");
		expect(DEMO_LABEL).toBe("데모 작업실 열기");
		expect(DEMO_HREF).toBe("/studio?example=1");
		expect(CTA_TITLE).toBe("이제 직접 들어 보세요");
		expect(CTA_TEXT).toBe(
			"가입 없이 공개 데모 작업실을 바로 써 볼 수 있어요. 예시 데이터로 채워져 있고, 만들기는 미리 준비한 샘플을 들려줘요.",
		);
		expect(CTA_REPLAY_TEXT).toBe("처음으로 돌아가 다시 듣기");
		expect(TRY.title).toBe("숫자가 든 문장을 넣어 보세요");
		expect(TRY.resultHead).toBe("이렇게 읽어요");
		expect(TRY.checkHead).toBe("확인 필요:");
		expect(TRY.chips).toEqual([
			"2026년 3분기",
			"1,523억 달러",
			"3.5%",
			"오전 10:30",
			"010-1234-5678",
		]);
		expect(ACTING.title).toBe("태그 하나로 연기가 바뀌어요");
		expect(FLOW.title).toBe("고르고, 나누고, 다듬고, 받기");
		expect(COST.title).toBe("크레딧은 확인한 뒤에만 써요");
		expect(COST.confirmTitle).toBe("크레딧이 들어요. 만들까요?");
		expect(COST.reused).toBe("저장된 결과");
		expect(COST.ledgerIdle).toBe("크레딧 0");
		expect(COST.points).toEqual([
			"유료 호출은 늘 확인 창을 거쳐요",
			"같은 문단은 다시 만들지 않아요",
			"응답이 늦어도 끝까지 받아 저장해요",
		]);
		expect(DRAMA.source).toBe("Fish Audio에 한 번 요청해 만든 장면");
		expect(BUILT.arch.demoNotes).toContain("음성 서비스 키 없음");
		expect(BUILT.arch.ownNotes).toContain("허용한 계정 하나만");
		expect(TRY.summary(3, 0)).toBe("숫자 3곳을 한글로 읽었어요");
		expect(TRY.summary(2, 1)).toBe("숫자 2곳을 한글로 읽었어요, 확인 필요 1곳");
		expect(BUILT.title).toBe("혼자 8주 동안 만든 것");
		expect(BUILT.stats.map((s) => `${s.value}${s.unit}`)).toEqual([
			"약 5.8만줄",
			"2,000여개",
			"15개",
			"약 8주",
		]);
	});
	it("확인 필요 이유 문구는 11가지 이유를 모두 말한다", () => {
		expect(Object.keys(CHECK_REASON_TEXT)).toHaveLength(11);
	});
	it("공개 데모 FAQ는 로그인 없는 데모와 음성 서비스를 부르지 않는 비용을 말한다", () => {
		const own = FAQ_ITEMS.find((i) => i.question === "직접 써 볼 수 있나요?");
		const cost = FAQ_ITEMS.find((i) => i.question === "비용은 어떻게 되나요?");
		expect(own?.answer).toContain("로그인 없이");
		expect(own?.answer).toContain("한국에서만");
		expect(cost?.answer).toContain("만들기 요청을 보내지 않아");
	});
	it("화면 이미지마다 대체 글이 있다(장식 마스코트는 alt를 비운다)", () => {
		for (const tab of TOUR_TABS) expect(tab.alt.length).toBeGreaterThan(5);
	});
	it("투어 탭 값은 겹치지 않는다", () => {
		const values = TOUR_TABS.map((tab) => tab.value);
		expect(new Set(values).size).toBe(values.length);
	});
	it("막대 메뉴: 들어 보기 · 해 보기 · 드라마 · 만든 방법 · FAQ(섹션 앵커)", () => {
		expect(NAV_ITEMS.map((i) => [i.label, i.href])).toEqual([
			["들어 보기", "#listen"],
			["해 보기", "#try"],
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
	it("샘플 이름: Airy는 성우 이름이 없어 'Airy 샘플'이고 다른 문장 표시도 Airy만", () => {
		const names = HERO_SAMPLES.map(sampleName);
		expect(names[0]).toBe("Typecast 포세이돈");
		expect(names[3]).toBe("Airy 샘플");
		expect(HERO_SAMPLES.filter((s) => s.other).map((s) => s.id)).toEqual([
			"airy",
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
	});
	it("막대 링크는 같은 페이지 앵커뿐이다(만들지 않는 페이지로 가지 않는다)", () => {
		for (const item of NAV_ITEMS) expect(item.href).toMatch(/^#[a-z-]+$/);
	});
	it("금지어와 꾸민 수치가 없다(브리프 4절)", () => {
		const all = JSON.stringify([
			TRY,
			ACTING,
			FLOW,
			COST,
			BUILT,
			DRAMA,
			TOUR_TABS,
			FAQ_ITEMS,
		]);
		for (const word of ["혁신", "강력한", "손쉽게", "획기적", "최고의"]) {
			expect(all, word).not.toContain(word);
		}
	});
	it("용어: '다섯 목소리'류와 '공급자'는 본문·FAQ·만든 방법 어디에도 없다('음성 서비스'로 쓴다)", () => {
		const body = JSON.stringify([
			FAQ_ITEMS,
			HERO_TITLE,
			HERO_SUBTITLE,
			TAGLINE_LINES,
			TRY,
			ACTING,
			FLOW,
			COST,
			BUILT,
			DRAMA,
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
