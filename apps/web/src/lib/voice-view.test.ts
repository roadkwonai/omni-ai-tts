import type { Voice } from "@tts-pilot-app/api/providers/contract";
import { describe, expect, it } from "vitest";

import {
	agoText,
	badgesOf,
	bundleOf,
	chipsOf,
	compactCount,
	countText,
	emotionLines,
	flattenPages,
	geminiTagline,
	latestTime,
	listEnd,
	metaLine,
	moreCountText,
	nameParts,
	oneListCountText,
	pickSelected,
	pillsOf,
	receivedText,
	retryTime,
	sampleAriaLabel,
	sampleKindOf,
	sampleLabel,
	sampleSubject,
	samplesMissing,
	secondaryLines,
	termLines,
	voiceKey,
} from "./voice-view";

const base: Voice = {
	provider: "elevenlabs",
	source: "public",
	voiceId: "v1",
	name: "Jiyoung",
	englishName: null,
	gender: "female",
	age: "young",
	accent: "seoul",
	pitch: null,
	personas: [],
	useCases: ["narrative_story", "conversational", "advertisement"],
	descriptives: ["calm"],
	tags: [],
	languages: ["ko"],
	category: "professional",
	origin: null,
	description: null,
	models: [],
	previewUrl: "https://storage.googleapis.com/x.mp3",
	samples: [],
	usage: { kind: "chars_1y", count: 2_100_000 },
	terms: {
		freeUsersAllowed: false,
		noticePeriodDays: 730,
		liveModeration: true,
		creditRate: 1.5,
		licensed: false,
		retiring: false,
	},
};
const voice = (overrides: Partial<Voice>): Voice => ({ ...base, ...overrides });
const fish = voice({
	provider: "fish_audio",
	gender: null,
	age: null,
	accent: null,
	useCases: [],
	descriptives: [],
	category: null,
	tags: ["Korean", "female", "middle-aged", "narration", "calm", "weird"],
});

describe("키와 이어 붙이기", () => {
	it("성우 키는 공급자·출처·id다. 다음 페이지의 중복 성우는 뺀다", () => {
		expect(voiceKey(base)).toBe("elevenlabs:public:v1");
		const merged = flattenPages([
			{ voices: [voice({ voiceId: "a" }), voice({ voiceId: "b" })] },
			{
				voices: [
					voice({ voiceId: "b", name: "다시 온 b" }),
					voice({ voiceId: "c" }),
				],
			},
		]);
		expect(merged.map((v) => [v.voiceId, v.name])).toEqual([
			["a", "Jiyoung"],
			["b", "Jiyoung"],
			["c", "Jiyoung"],
		]);
	});

	it("고른 성우가 목록에 있으면 그대로, 없으면 첫 성우, 목록이 비면 null", () => {
		const list = [voice({ voiceId: "a" }), voice({ voiceId: "b" })];
		expect(pickSelected(list, "elevenlabs:public:b")).toBe(
			"elevenlabs:public:b",
		);
		expect(pickSelected(list, "elevenlabs:public:z")).toBe(
			"elevenlabs:public:a",
		);
		expect(pickSelected([], "elevenlabs:public:a")).toBeNull();
	});
});

describe("행 문구", () => {
	it("메타 줄은 성별·연령(없으면 '정보 없음')과 있으면 억양이다(세 공급자 같음)", () => {
		expect(metaLine(base)).toBe("여성 · 청년 · 서울 억양");
		expect(metaLine(voice({ gender: null, accent: null }))).toBe(
			"성별 정보 없음 · 청년",
		);
		expect(metaLine(fish)).toBe("여성 · 중년");
		expect(
			metaLine(
				voice({
					provider: "fish_audio",
					gender: null,
					age: null,
					accent: null,
					tags: ["narration"],
				}),
			),
		).toBe("성별 정보 없음 · 연령 정보 없음");
	});

	it("알약은 콘텐츠·분위기 최대 둘과 +N. Fish Audio는 콘텐츠·분위기 태그이고 모르는 태그는 알약에 넣지 않는다", () => {
		expect(pillsOf(base)).toEqual({
			shown: ["이야기·내레이션", "대화"],
			rest: 2,
			all: ["이야기·내레이션", "대화", "광고", "차분함"],
		});
		expect(pillsOf(fish).all).toEqual(["내레이션", "차분함"]);
	});

	it("Typecast는 성별·연령이 없으면 '정보 없음'이고 보조 정보는 모델마다 한 줄의 모델·감정 수다", () => {
		const tc = voice({
			provider: "typecast",
			gender: null,
			age: "young_adult",
			accent: null,
			useCases: ["Game"],
			descriptives: [],
			category: null,
			models: [{ model: "ssfm-v30", emotions: ["a", "b"] }],
			usage: null,
		});
		expect(metaLine(tc)).toBe("성별 정보 없음 · 청년");
		expect(secondaryLines(tc)).toEqual(["ssfm-v30 · 감정\u00a02"]);
		// 줄 끝에 구분점이 매달리지 않게 모델마다 한 줄이다(critique 2026-10-05)
		expect(
			secondaryLines({
				...tc,
				models: [
					{ model: "ssfm-v30", emotions: ["a", "b", "c"] },
					{ model: "ssfm-v21", emotions: ["a"] },
				],
			}),
		).toEqual(["ssfm-v30 · 감정\u00a03", "ssfm-v21 · 감정\u00a01"]);
		expect(secondaryLines({ ...tc, models: [] })).toEqual([]);
	});

	it("사용량은 한국어 단위로 줄이고 숫자와 단위 사이는 줄을 바꾸지 않는다", () => {
		expect(secondaryLines(base)).toEqual(["최근 1년 210만\u00a0자"]);
		expect(
			secondaryLines(voice({ usage: { kind: "tasks", count: 377_693 } })),
		).toEqual(["37.8만\u00a0회 사용"]);
		expect(secondaryLines(voice({ usage: null }))).toEqual([]);
		expect(compactCount(5953)).toBe("5,953");
		expect(compactCount(268_000)).toBe("26.8만");
		expect(compactCount(9_950_000)).toBe("995만");
		// 천만 이상 1억 미만은 소수점 없이(Intl compact는 만 단위에 쉼표를 넣지 않는다, node 24 실행 확인)
		expect(compactCount(50_385_000)).toBe("5039만");
		expect(compactCount(99_990_000)).toBe("9999만");
		// 1억 경계: 반올림해 1억이 되면 억 단위다. 1억 이상은 다시 소수 한 자리(코디네이터 판정 2026-10-05)
		expect(compactCount(99_999_999)).toBe("1억");
		expect(compactCount(123_456_789)).toBe("1.2억");
		expect(compactCount(1_234_567_890)).toBe("12.3억");
	});

	it("배지: 무료 플랜 불가, 보증 성우, 계정 성우의 출처", () => {
		// 행의 배지는 모두 회색이라 이름만 돌려준다. 경고색은 패널 이용 조건 줄에만 쓴다(사용자 결정 2026-10-05)
		expect(badgesOf(base)).toEqual(["무료 플랜 불가"]);
		expect(
			badgesOf(
				voice({
					provider: "fish_audio",
					terms: { ...base.terms, freeUsersAllowed: null, licensed: true },
				}),
			),
		).toEqual(["보증 성우"]);
		expect(
			badgesOf(
				voice({
					source: "account",
					origin: "premade",
					terms: { ...base.terms, freeUsersAllowed: null },
				}),
			),
		).toEqual(["제공 성우"]);
		expect(
			badgesOf(
				voice({
					source: "account",
					origin: "own",
					terms: { ...base.terms, freeUsersAllowed: null },
				}),
			),
		).toEqual(["내가 만든 성우"]);
	});

	it("샘플 버튼 접근 이름은 보이는 상태 이름을 담는다(브리프 7절, WCAG 2.5.3)", () => {
		expect(sampleAriaLabel("idle", "Jiyoung 기본 샘플")).toBe(
			"Jiyoung 기본 샘플 듣기",
		);
		expect(sampleAriaLabel("loading", "Jiyoung 기본 샘플")).toBe(
			"Jiyoung 기본 샘플 듣기 취소",
		);
		expect(sampleAriaLabel("playing", "Jiyoung 한국어 샘플")).toBe(
			"Jiyoung 한국어 샘플 정지",
		);
		expect(sampleAriaLabel("failed", "Jiyoung 한국어 샘플")).toBe(
			"Jiyoung 한국어 샘플 다시 듣기",
		);
		expect(sampleAriaLabel("none", "Jiyoung 기본 샘플")).toBe(
			"Jiyoung 기본 샘플 없음",
		);
	});
});

describe("패널 문구", () => {
	it("칩: 아는 값만이고 '정보 없음'은 칩이 아니다. Fish Audio의 모르는 태그는 공급자 값 그대로", () => {
		expect(chipsOf(base)).toEqual([
			"여성",
			"청년",
			"서울 억양",
			"이야기·내레이션",
			"대화",
			"광고",
			"차분함",
			"전문 클론",
		]);
		expect(
			chipsOf(
				voice({
					gender: null,
					accent: null,
					useCases: [],
					descriptives: [],
					category: null,
				}),
			),
		).toEqual(["청년"]);
		expect(chipsOf(fish)).toEqual([
			"여성",
			"중년",
			"내레이션",
			"차분함",
			"Korean",
			"weird",
		]);
	});

	it("Fish Audio 성별·연령 태그가 둘 이상이면 칩에 전부 나온다(메타 줄은 첫 값)", () => {
		const both = voice({
			provider: "fish_audio",
			gender: null,
			age: null,
			accent: null,
			useCases: [],
			descriptives: [],
			category: null,
			tags: ["female", "male", "young", "middle-aged"],
		});
		expect(chipsOf(both)).toEqual(["여성", "남성", "청년", "중년"]);
		expect(metaLine(both)).toBe("여성 · 청년");
	});

	it("억양 표에 없는 값은 공급자 값 그대로다", () => {
		expect(metaLine(voice({ accent: "busan" }))).toBe("여성 · 청년 · busan");
		expect(chipsOf(voice({ accent: "busan" }))).toContain("busan");
	});

	it("ElevenLabs 공개 성우의 이용 조건(브리프 5절). 늘 붙는 공통 문장은 정보, 성우별 무료 플랜 불가는 경고다", () => {
		expect(termLines(base)).toEqual([
			{
				tone: "info",
				text: "ElevenLabs 무료 플랜은 라이브러리 성우를 API로 쓸 수 없어요",
			},
			{
				tone: "warning",
				text: "이 성우는 무료 플랜 사용자에게 열려 있지 않아요",
			},
			{ tone: "info", text: "공유가 끝나도 730일 동안 계속 쓸 수 있어요" },
			{ tone: "info", text: "실시간 검수 성우라 응답이 늦을 수 있어요" },
			{ tone: "info", text: "크레딧 배율 1.5배(음성 서비스 값)" },
		]);
	});

	it("제공 성우 종료, Fish Audio 보증·공개 종료 중, 배율 1은 보이지 않는다", () => {
		expect(
			termLines(
				voice({
					source: "account",
					origin: "premade",
					terms: {
						...base.terms,
						freeUsersAllowed: null,
						noticePeriodDays: null,
						liveModeration: false,
						creditRate: 1,
					},
				}),
			),
		).toEqual([
			{ tone: "warning", text: "ElevenLabs 제공 성우는 2026-12-31에 종료돼요" },
		]);
		expect(
			termLines(
				voice({
					provider: "fish_audio",
					terms: {
						freeUsersAllowed: null,
						noticePeriodDays: null,
						liveModeration: false,
						creditRate: null,
						licensed: true,
						retiring: true,
					},
				}),
			),
		).toEqual([
			{
				tone: "info",
				kind: "licensed",
				text: "Fish Audio가 권리를 확보한 보증 성우예요",
			},
			{ tone: "warning", text: "음성 서비스가 공개를 끝내는 중이에요" },
		]);
	});

	it("Typecast 모델별 감정은 한국어 이름이고, 모르는 값은 공급자 값 그대로다", () => {
		expect(
			emotionLines(
				voice({
					provider: "typecast",
					models: [
						{
							model: "ssfm-v30",
							emotions: [
								"normal",
								"happy",
								"sad",
								"angry",
								"whisper",
								"toneup",
								"tonedown",
							],
						},
						{ model: "ssfm-v21", emotions: ["normal", "cheerful"] },
					],
				}),
			),
		).toEqual([
			"ssfm-v30: 기본, 기쁨, 슬픔, 화남, 속삭임, 높은 톤, 낮은 톤",
			"ssfm-v21: 기본, cheerful",
		]);
	});

	it("감정이 없는 모델은 줄을 만들지 않고, 모델이 없으면 빈 목록이다", () => {
		expect(
			emotionLines(
				voice({
					provider: "typecast",
					models: [
						{ model: "ssfm-v30", emotions: [] },
						{ model: "ssfm-v21", emotions: ["happy"] },
					],
				}),
			),
		).toEqual(["ssfm-v21: 기쁨"]);
		expect(emotionLines(voice({ provider: "typecast", models: [] }))).toEqual(
			[],
		);
	});

	it("샘플 이름표: 언어 이름, 공급자 제목, 없으면 기본 샘플", () => {
		expect(
			sampleLabel({
				language: "ko",
				title: null,
				url: "https://x.fish.audio/a.mp3",
			}),
		).toBe("한국어 샘플");
		expect(
			sampleLabel({
				language: null,
				title: "밝게",
				url: "https://x.fish.audio/a.mp3",
			}),
		).toBe("밝게");
		expect(
			sampleLabel({
				language: null,
				title: null,
				url: "https://x.fish.audio/a.mp3",
			}),
		).toBe("기본 샘플");
	});

	// 알림은 "{이름} 샘플 재생 중"·"{이름} 샘플을 멈췄어요"라서 '샘플'은 알림이 붙인다(브리프 9절)
	it("알림에 읽힐 이름: 이름 뒤에 언어 이름, 공급자 제목, 없으면 '기본'(끝의 '샘플'은 뺀다)", () => {
		const url = "https://x.fish.audio/a.mp3";
		expect(sampleSubject("홍길동", { language: "ko", title: null, url })).toBe(
			"홍길동 한국어",
		);
		expect(
			sampleSubject("홍길동", { language: null, title: "기본 대사", url }),
		).toBe("홍길동 기본 대사");
		expect(sampleSubject("홍길동", { language: null, title: null, url })).toBe(
			"홍길동 기본",
		);
	});
});

describe("상태 줄과 묶음 문구", () => {
	const now = new Date("2026-10-05T12:00:00.000Z");
	it("받은 시각", () => {
		expect(receivedText("2026-10-05T11:59:30.000Z", now)).toBe("방금 받음");
		expect(receivedText("2026-10-05T11:48:00.000Z", now)).toBe(
			"12분 전에 받음",
		);
		expect(receivedText("2026-10-05T09:00:00.000Z", now)).toBe(
			"3시간 전에 받음",
		);
		expect(agoText("2026-10-03T12:00:00.000Z", now)).toBe("2일");
	});

	it("한 목록 탭(Typecast·Airy·Gemini) 인원 글자", () => {
		expect(oneListCountText("typecast", undefined, false, 0)).toBe(
			"Typecast 성우",
		);
		expect(oneListCountText("airy", 1234, false, 5)).toBe("Airy 성우 1,234명");
		expect(oneListCountText("gemini", 147, true, 12)).toBe(
			"Gemini 성우 147명 중 12명",
		);
	});

	it("인원 글자", () => {
		expect(
			countText({
				provider: "elevenlabs",
				source: "public",
				language: "ko",
				total: 5953,
				totalExact: true,
			}),
		).toBe("ElevenLabs 한국어 라이브러리 5,953명");
		expect(
			countText({
				provider: "fish_audio",
				source: "public",
				language: "ko",
				total: 1000,
				totalExact: false,
			}),
		).toBe("Fish Audio 한국어 공개 성우 1,000명 이상");
		expect(
			countText({
				provider: "elevenlabs",
				source: "account",
				language: null,
				total: 31,
				totalExact: true,
			}),
		).toBe("ElevenLabs 계정 성우 31명");
		expect(
			countText({
				provider: "elevenlabs",
				source: "public",
				language: null,
				total: null,
				totalExact: false,
			}),
		).toBe("ElevenLabs 라이브러리");
	});

	it("'더 보기' 옆 글자: 보인 수 / 전체 수(전체 수가 없으면 보인 수만, 정확하지 않으면 '이상')", () => {
		expect(moreCountText(100, 5953, true)).toBe("100 / 5,953명");
		expect(moreCountText(100, 1000, false)).toBe("100 / 1,000명 이상");
		expect(moreCountText(100, null, false)).toBe("100명");
		expect(moreCountText(1200, null, true)).toBe("1,200명");
	});

	it("대기 시각 후보 중 가장 늦은 것을 고른다(없는 값은 건너뛰고, 밀리초 유무와 상관없이 시각으로 비교한다)", () => {
		expect(latestTime()).toBeNull();
		expect(latestTime(null, undefined)).toBeNull();
		expect(latestTime("2026-10-05T12:00:00Z", null)).toBe(
			"2026-10-05T12:00:00Z",
		);
		expect(
			latestTime("2026-10-05T12:00:00.000Z", "2026-10-05T12:05:00Z", null),
		).toBe("2026-10-05T12:05:00Z");
		// 글자 순서로는 'Z'가 '.'보다 뒤지만 시각은 .123초가 더 늦다
		expect(latestTime("2026-10-05T12:00:00Z", "2026-10-05T12:00:00.123Z")).toBe(
			"2026-10-05T12:00:00.123Z",
		);
	});

	it("대기 시각은 시:분 형식이다(시간대는 실행 환경을 따른다)", () => {
		expect(retryTime("2026-10-05T00:00:30.000Z")).toMatch(/\d{1,2}:\d{2}/);
	});

	it("대기 시각은 초나 밀리초가 있으면 다음 분으로 올려 보이고, 정각이면 그 분을 보인다(버튼이 풀리는 시각보다 이르게 보이지 않는다)", () => {
		// 시간대에 따라 글자가 달라 같은 형식으로 기대값을 만든다
		const clock = new Intl.DateTimeFormat("ko-KR", {
			hour: "numeric",
			minute: "2-digit",
		});
		const shown = (iso: string) => clock.format(new Date(iso));
		expect(retryTime("2026-10-05T08:43:22.000Z")).toBe(
			shown("2026-10-05T08:44:00.000Z"),
		);
		expect(retryTime("2026-10-05T08:43:00.500Z")).toBe(
			shown("2026-10-05T08:44:00.000Z"),
		);
		expect(retryTime("2026-10-05T08:43:00.000Z")).toBe(
			shown("2026-10-05T08:43:00.000Z"),
		);
		// 59초는 시도 넘긴다
		expect(retryTime("2026-10-05T08:59:59.000Z")).toBe(
			shown("2026-10-05T09:00:00.000Z"),
		);
	});

	it("목록 끝: 다음이 있으면 more, Fish Audio 상한이면 limit, 아니면 end", () => {
		expect(listEnd({ next: 2, windowLimited: true })).toBe("more");
		expect(listEnd({ next: null, windowLimited: true })).toBe("limit");
		expect(listEnd({ next: null, windowLimited: false })).toBe("end");
	});

	it("'전체' 탭 묶음: 앞 5명과 머리 인원(공급자 전체 수, 정확하지 않으면 '이상', Typecast 검색이면 '{전체}명 중 {n}명')", () => {
		const many = Array.from({ length: 7 }, (_, i) =>
			voice({ voiceId: `v${i}` }),
		);
		expect(
			bundleOf(many, { total: 5953, totalExact: true }).voices.map(
				(v) => v.voiceId,
			),
		).toEqual(["v0", "v1", "v2", "v3", "v4"]);
		expect(bundleOf(many, { total: 5953, totalExact: true }).countLabel).toBe(
			"5,953명",
		);
		expect(bundleOf([], { total: 1000, totalExact: false }).countLabel).toBe(
			"1,000명 이상",
		);
		expect(
			bundleOf(many, { total: 7, totalExact: true, of: 614 }).countLabel,
		).toBe("614명 중 7명");
		expect(
			bundleOf(many, { total: 614, totalExact: true, of: 614 }).countLabel,
		).toBe("614명");
		expect(
			bundleOf([], { total: null, totalExact: false }).countLabel,
		).toBeNull();
	});
});

describe("Airy 행", () => {
	const airy = {
		...base,
		provider: "airy",
		gender: "female",
		age: null,
		accent: null,
		languages: ["en", "ko", "ko"],
	} as Voice;
	it("메타 줄은 성별과 언어(한국어 먼저, 중복 없이)이고 연령 자리는 없다", () => {
		expect(metaLine(airy)).toBe("여성 · 한국어·영어");
		expect(metaLine({ ...airy, gender: null, languages: [] })).toBe(
			"성별 정보 없음",
		);
	});
	it("목록의 모든 성우에 샘플이 없을 때만 샘플 못 받음이다(빈 목록은 아니다, U1)", () => {
		const sample = {
			language: "ko",
			title: null,
			url: "https://assets.airy.so/a.opus",
		};
		expect(samplesMissing([airy, airy])).toBe(true);
		expect(samplesMissing([airy, { ...airy, samples: [sample] }])).toBe(false);
		expect(samplesMissing([])).toBe(false);
	});
});

describe("Gemini 메타 줄·알약·칩(T7.6 계획에서 정한 것 9·10, 계획 리뷰 R4-1)", () => {
	const ko = voice({
		provider: "gemini",
		voiceId: "ko-kr-advisor-1",
		gender: "male",
		age: null,
		accent: "Seoul Korean",
		pitch: "low",
		useCases: ["Enterprise Agent", "Conversational / Edu"],
		descriptives: [],
		personas: ["High-Trust Advisor / Authoritative Advisor (Lawyer)"],
		languages: ["ko-KR"],
		category: null,
		usage: null,
		previewUrl: null,
	});
	const kore = voice({
		...ko,
		voiceId: "kore",
		gender: "female",
		accent: "Northwest",
		pitch: "high",
		useCases: ["Content & Media"],
		personas: ["Storyteller & Narrator"],
		languages: ["en-US"],
		previewUrl: "https://storage.googleapis.com/kore.wav",
	});

	it("메타 줄: 한국어 성우는 'OO 억양', 대표 성우는 '대표 성우'", () => {
		expect(metaLine(ko)).toBe("남성 · 피치 낮음 · 서울 억양");
		expect(metaLine(kore)).toBe("여성 · 피치 높음 · 대표 성우");
		expect(metaLine({ ...ko, gender: null, pitch: null, accent: null })).toBe(
			"성별 정보 없음",
		);
	});

	it("알약은 콘텐츠(맥락) 한국어 이름, 칩은 성별·억양·피치·콘텐츠·페르소나(대표 성우 영어 억양은 원문)", () => {
		expect(pillsOf(ko).all).toEqual(["기업 상담", "대화·교육"]);
		expect(chipsOf(ko)).toEqual([
			"남성",
			"서울 억양",
			"피치 낮음",
			"기업 상담",
			"대화·교육",
			"High-Trust Advisor / Authoritative Advisor (Lawyer)",
		]);
		expect(chipsOf(kore)).toEqual([
			"여성",
			"Northwest",
			"피치 높음",
			"콘텐츠·미디어",
			"Storyteller & Narrator",
		]);
	});

	it("설명의 첫 마디(critique P1): 첫 문장을 끝 마침표 없이, 마침표가 없으면 그대로, 다른 공급자는 null", () => {
		expect(
			geminiTagline({
				...ko,
				description:
					"38-year-old Lawyer from Seoul, South Korea. Speaks with a calm, steady tone.",
			}),
		).toBe("38-year-old Lawyer from Seoul, South Korea");
		expect(geminiTagline({ ...kore, description: "Soft voice" })).toBe(
			"Soft voice",
		);
		expect(
			geminiTagline({ ...base, description: "Calm narrator. Warm." }),
		).toBe(null);
		// 끝 마침표만 있는 설명, 설명 없음
		expect(geminiTagline({ ...ko, description: "Lawyer from Seoul." })).toBe(
			"Lawyer from Seoul",
		);
		expect(geminiTagline({ ...ko, description: null })).toBe(null);
	});

	it("이름 끝 번호는 본문과 나눈다(공백 뒤 숫자로 끝나는 이름만, 공급자 무관)", () => {
		expect(nameParts("Authoritative Advisor 12")).toEqual({
			body: "Authoritative Advisor",
			number: "12",
		});
		expect(nameParts("민지")).toBe(null);
		expect(nameParts("Kore2")).toBe(null);
		expect(nameParts("12")).toBe(null);
	});

	it("샘플 칸 이름: Gemini 대표 성우는 '참고 음성', 한국어 Gemini 성우·다른 공급자는 '기본 샘플'", () => {
		expect(sampleKindOf(kore)).toBe("참고 음성");
		expect([sampleKindOf(ko), sampleKindOf(base)]).toEqual([
			"기본 샘플",
			"기본 샘플",
		]);
	});
});
