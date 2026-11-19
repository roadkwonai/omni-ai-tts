import { ORPCError } from "@orpc/client";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	DEFAULT_SETTINGS,
	FISH_FREE_UNTIL,
	GEMINI_PRICE_UP_AT,
	type GeminiSettings,
	type TrialRequest,
} from "@tts-pilot-app/api/providers/trial-options";
import { describe, expect, it } from "vitest";

import {
	AIRY_STYLE_LABEL,
	confirmCopy,
	costCopy,
	dataNote,
	modelOptionsOf,
	needsConfirm,
	optionText,
	presetsOf,
	remainingLabel,
	remainingLines,
	requestOf,
	resultLine,
	resultSubject,
	resultWhen,
	settingsSummary,
	type TrialProblem,
	trialAriaLabel,
	trialBlock,
	trialFailureOf,
	trialFallback,
	trialProblemText,
	typecastOverdrawn,
	usageBasis,
	usageText,
} from "./trial-view";

const voice = (over: Partial<Voice>): Voice =>
	({
		provider: "typecast",
		source: "public",
		voiceId: "tc_1",
		name: "민지",
		models: [],
		...over,
	}) as Voice;

const AIRY_CALM = AIRY_STYLE_LABEL.calm;

describe("optionText(옵션 이름·값 글자)", () => {
	it("모델·감정 모드·감정·태그·말투 지시·언어·Airy 말투·슬라이더", () => {
		expect(optionText("typecast", "model", "ssfm-v21")).toEqual({
			label: "모델",
			value: "ssfm-v21",
		});
		expect(optionText("typecast", "emotion", "smart").value).toBe("자동");
		expect(optionText("typecast", "preset", "happy")).toEqual({
			label: "감정",
			value: "기쁨",
		});
		expect(optionText("elevenlabs", "tag", "")).toEqual({
			label: "말투 태그",
			value: "없음",
		});
		expect(optionText("fish_audio", "tag", "excited").value).toBe("[excited]");
		expect(optionText("gemini", "direction", "")).toEqual({
			label: "말투 지시",
			value: "없음",
		});
		expect(optionText("typecast", "language", "kor").value).toBe("한국어");
		expect(optionText("airy", "style", "calm")).toEqual({
			label: "말투",
			value: AIRY_CALM,
		});
		expect(optionText("elevenlabs", "style", 0.3)).toEqual({
			label: "스타일",
			value: "0.30",
		});
		expect(optionText("typecast", "tempo", 1.1)).toEqual({
			label: "속도",
			value: "1.10배",
		});
	});
});

describe("requestOf", () => {
	it("Typecast 성우가 지원하지 않는 모델·프리셋은 그 성우의 첫 지원 값으로 보정한다", () => {
		const v21Only = voice({
			models: [{ model: "ssfm-v21", emotions: ["normal", "sad"] }],
		});
		const r = requestOf(v21Only, "안녕", {
			...DEFAULT_SETTINGS,
			typecast: {
				...DEFAULT_SETTINGS.typecast,
				emotion: "preset",
				preset: "whisper",
			},
		});
		expect(r.settings).toMatchObject({
			model: "ssfm-v21",
			emotion: "preset",
			preset: "normal",
		});
		expect(
			presetsOf(
				voice({ models: [{ model: "ssfm-v30", emotions: ["happy", "sad"] }] }),
				"ssfm-v30",
			),
		).toEqual(["happy", "sad"]);
	});
	it("Fish Audio 무료 기간이 끝나면 유료 모델로 바꿔 확인 창을 거친다", () => {
		const r = requestOf(
			voice({ provider: "fish_audio", voiceId: "f1" }),
			"안녕",
			DEFAULT_SETTINGS,
			FISH_FREE_UNTIL,
		);
		expect(r.settings.model).toBe("s2.1-pro");
		expect(needsConfirm(r, FISH_FREE_UNTIL)).toBe(true);
		const free = requestOf(
			voice({ provider: "fish_audio", voiceId: "f1" }),
			"안녕",
			DEFAULT_SETTINGS,
			0,
		);
		expect(needsConfirm(free, 0)).toBe(false);
	});
	it("모델 선택지: Typecast는 성우 지원 모델, Fish Audio 무료 모델에는 무료 표시", () => {
		expect(
			modelOptionsOf(voice({ models: [{ model: "ssfm-v21", emotions: [] }] })),
		).toEqual([{ value: "ssfm-v21", label: "ssfm-v21" }]);
		expect(
			modelOptionsOf(voice({ provider: "fish_audio", voiceId: "f1" }), 0),
		).toEqual([
			{ value: "s2.1-pro-free", label: "s2.1-pro-free", free: true },
			{ value: "s2.1-pro", label: "s2.1-pro" },
		]);
	});
	it("Airy: 공급자 설정 그대로, 모델 선택지는 airy-tts-v1 하나(무료 표시 없음)", () => {
		const v = voice({ provider: "airy", voiceId: "a597bb7a98fc9ec1" });
		const settings = {
			...DEFAULT_SETTINGS,
			airy: { ...DEFAULT_SETTINGS.airy, style: "calm" as const },
		};
		expect(requestOf(v, "안녕", settings)).toEqual({
			provider: "airy",
			voiceId: "a597bb7a98fc9ec1",
			text: "안녕",
			settings: { model: "airy-tts-v1", language: "ko", style: "calm" },
		});
		expect(modelOptionsOf(v)).toEqual([
			{ value: "airy-tts-v1", label: "airy-tts-v1" },
		]);
		expect(needsConfirm(requestOf(v, "안녕", DEFAULT_SETTINGS))).toBe(true);
	});
});

describe("버튼 상태와 이름", () => {
	it("막는 이유: 키 없음 → 빈 문장 → 다른 문장 만드는 중 → 대기 시각", () => {
		const base = {
			provider: "elevenlabs",
			text: "안녕",
			busyKey: null,
			key: "k",
			retryAt: null,
			noKey: false,
		} as const;
		expect(trialBlock(base)).toBeNull();
		expect(trialBlock({ ...base, text: "   " })).toBe("문장을 먼저 써 주세요");
		expect(trialBlock({ ...base, busyKey: "other" })).toBe(
			"다른 문장을 만드는 중이에요",
		);
		expect(trialBlock({ ...base, busyKey: "k" })).toBeNull();
		expect(trialBlock({ ...base, noKey: true })).toBe("ElevenLabs 키가 없어요");
		expect(
			trialBlock({ ...base, retryAt: "2026-10-05T08:43:22.000Z" }),
		).toMatch(/이후에 다시 들을 수 있어요$/);
	});
	it("접근 이름에 성우 이름·동작·크레딧 여부가 들어가고, 재생 중이면 정지다(AC18, U8)", () => {
		const r = requestOf(
			voice({ provider: "elevenlabs", voiceId: "e1", name: "Jiyoung" }),
			"안녕",
			DEFAULT_SETTINGS,
		);
		expect(trialAriaLabel("Jiyoung", r, "idle")).toBe(
			"Jiyoung 내 문장 듣기, 새로 만들 때 크레딧 사용",
		);
		expect(trialAriaLabel("Jiyoung", r, "saved")).toBe(
			"Jiyoung 저장된 결과 듣기",
		);
		expect(trialAriaLabel("Jiyoung", r, "busy")).toBe(
			"Jiyoung 내 문장 만드는 중",
		);
		expect(trialAriaLabel("Jiyoung", r, "playing")).toBe(
			"Jiyoung 내 문장 정지",
		);
		const f = requestOf(
			voice({ provider: "fish_audio", voiceId: "f1", name: "Mina" }),
			"안녕",
			DEFAULT_SETTINGS,
			0,
		);
		// 날짜에 기대지 않게 시각을 넘긴다(무료 종료 뒤에도 테스트가 그대로)
		expect(trialAriaLabel("Mina", f, "idle", 0)).toBe(
			"Mina 내 문장 듣기, 무료",
		);
	});
});

describe("문구", () => {
	it("예상 사용량", () => {
		expect(usageText({ unit: "credit", amount: 1234 })).toBe("약 1,234크레딧");
		expect(usageText({ unit: "byte", amount: 93 })).toBe(
			"93바이트 · 약 $0.0014",
		);
		expect(usageText({ unit: "free", amount: 0 })).toBe("무료");
	});
	it("남은 값: Fish Audio는 '남은 잔액'과 두 잔액, 나머지는 '남은 크레딧'(D14), Typecast 초과 경고", () => {
		const quota = {
			remaining: 9412,
			total: 10000,
			plan: "free",
			resetAt: null,
			overageAllowed: false,
		};
		expect(remainingLabel("elevenlabs")).toBe("남은 크레딧");
		expect(remainingLines("elevenlabs", quota)).toEqual(["9,412크레딧"]);
		expect(remainingLabel("fish_audio")).toBe("남은 잔액");
		expect(
			remainingLines("fish_audio", {
				...quota,
				remaining: 3,
				webCredit: { plan: "Plus", remaining: 1234, total: 2000 },
			}),
		).toEqual(["API 충전 잔액 3", "웹 플랜 크레딧 1,234"]);
		expect(remainingLines("typecast", null)).toEqual(["확인하지 못했어요"]);
		expect(typecastOverdrawn({ ...quota, remaining: 0 })).toBe(true);
	});
	it("설정 요약은 모델과 기본값에서 벗어난 옵션, Typecast 직접 감정은 늘(감정 이름은 T4 패널과 같다)", () => {
		const el = requestOf(
			voice({ provider: "elevenlabs", voiceId: "e1" }),
			"안녕",
			{
				...DEFAULT_SETTINGS,
				elevenlabs: {
					...DEFAULT_SETTINGS.elevenlabs,
					stability: 0.65,
					tag: "whispers",
				},
			},
		);
		expect(settingsSummary(el)).toBe("eleven_v4 · 안정성 0.65 · [whispers]");
		const tc = requestOf(voice({}), "안녕", {
			...DEFAULT_SETTINGS,
			typecast: {
				...DEFAULT_SETTINGS.typecast,
				emotion: "preset",
				preset: "toneup",
				pitch: 2,
			},
		});
		expect(settingsSummary(tc)).toBe("ssfm-v30 · 감정 높은 톤 · 음높이 +2반음");
	});
	it("언제와 결과 줄: 잘려도 언제·사용량이 남게 앞에 둔다(D2)", () => {
		const now = new Date("2026-10-05T10:00:00.000Z");
		expect(resultWhen("2026-10-05T09:59:40.000Z", now)).toBe("방금");
		expect(resultWhen("2026-10-02T10:00:00.000Z", now)).toBe("3일 전");
		const item = {
			id: "00000000-0000-4000-8000-000000000000",
			createdAt: "2026-10-05T09:59:40.000Z",
			usage: { unit: "credit", amount: 31 },
			request: requestOf(
				voice({ provider: "elevenlabs", voiceId: "e1" }),
				"오늘 소개할 제품은 30초 만에 끝나는 아침 루틴입니다",
				DEFAULT_SETTINGS,
			),
		} as const;
		expect(resultLine(item, now)).toBe("방금 · 약 31크레딧 · eleven_v4");
		// 공개 데모는 사용량 조각만 뺀다
		expect(resultLine(item, now, false)).toBe("방금 · eleven_v4");
		// 줄마다 다른 접근 이름(D6): 문장 앞 20자
		expect(resultSubject("Jiyoung", item)).toBe(
			"Jiyoung 저장된 결과 ‘오늘 소개할 제품은 30초 만에 끝나’",
		);
	});
	it("데이터 안내는 약관 문구가 있는 공급자만", () => {
		expect(dataNote(requestOf(voice({}), "안녕", DEFAULT_SETTINGS))).toBe(
			"보낸 문장이 Typecast 서비스 개선에 쓰일 수 있어요",
		);
		expect(
			dataNote(
				requestOf(
					voice({ provider: "elevenlabs", voiceId: "e" }),
					"안녕",
					DEFAULT_SETTINGS,
				),
			),
		).toBeNull();
	});
	it("설정 요약: Airy 언어·말투는 한국어 이름, ElevenLabs 스타일과 태그는 그대로(Review Focus 4)", () => {
		const airy = (settings: Partial<typeof DEFAULT_SETTINGS.airy>) =>
			({
				provider: "airy",
				voiceId: "a597bb7a98fc9ec1",
				text: "안녕",
				settings: { ...DEFAULT_SETTINGS.airy, ...settings },
			}) as const;
		expect(settingsSummary(airy({}))).toBe("airy-tts-v1 · 한국어");
		expect(settingsSummary(airy({ language: "en", style: "bright" }))).toBe(
			"airy-tts-v1 · 영어 · 말투 밝게",
		);
		expect(
			settingsSummary({
				provider: "elevenlabs",
				voiceId: "el0001",
				text: "안녕",
				settings: {
					...DEFAULT_SETTINGS.elevenlabs,
					model: "eleven_multilingual_v2",
					style: 0.3,
				},
			}),
		).toBe("eleven_multilingual_v2 · 스타일 0.30");
		expect(
			settingsSummary({
				provider: "elevenlabs",
				voiceId: "el0001",
				text: "안녕",
				settings: { ...DEFAULT_SETTINGS.elevenlabs, tag: "whispers" },
			}),
		).toBe("eleven_v4 · [whispers]");
	});
	it("예상 사용량 근거는 Airy만, 언어에 따라. 남은 크레딧은 카드와 같은 버림 한 자리(E4·D4)", () => {
		const airy = (language: "ko" | "en") =>
			({
				provider: "airy",
				voiceId: "a597bb7a98fc9ec1",
				text: "안녕",
				settings: { ...DEFAULT_SETTINGS.airy, language },
			}) as const;
		expect(usageBasis(airy("ko"))).toBe("한국어 1글자 1.5크레딧");
		expect(usageBasis(airy("en"))).toBe("영어 1글자 1크레딧");
		expect(
			usageBasis({
				provider: "typecast",
				voiceId: "tc_1",
				text: "안녕",
				settings: DEFAULT_SETTINGS.typecast,
			}),
		).toBeNull();
		const quota = (remaining: number) => ({
			remaining,
			total: null,
			plan: "plan_a",
			resetAt: null,
			overageAllowed: false,
		});
		expect(remainingLabel("airy")).toBe("남은 크레딧");
		expect(remainingLines("airy", quota(12.56))).toEqual(["12.5크레딧"]);
		expect(remainingLines("airy", quota(9.9996))).toEqual(["9.9크레딧"]);
	});
});

describe("오류", () => {
	const error = (reason: string, extra: object = {}) =>
		new ORPCError("BAD_REQUEST", {
			data: { provider: "elevenlabs", reason, ...extra },
		});
	it("사유·대기 시각·공급자 오류 코드를 읽고, 사유 없는 오류는 unexpected", () => {
		expect(
			trialFailureOf(
				error("provider_input", { providerCode: "voice_access_denied" }),
			),
		).toEqual({
			reason: "provider_input",
			retryAt: null,
			providerCode: "voice_access_denied",
		});
		expect(trialFailureOf(new Error("x")).reason).toBe("unexpected");
	});
	it("스펙 6절 문구(문자열에는 ▷를 쓰지 않는다, D22). 키 문제는 T4 사유 안내와 같은 글자(D24)", () => {
		const text = (reason: string, extra: object = {}) =>
			trialProblemText("elevenlabs", trialFailureOf(error(reason, extra))).text;
		expect(text("no_key")).toBe(
			"ElevenLabs 키가 없어요. 서버 환경변수에 키를 넣고 개발 서버를 다시 켜 주세요.",
		);
		expect(text("provider_auth")).toBe(
			"ElevenLabs 키를 확인해 주세요. 키가 틀렸거나 쓸 수 없는 키예요.",
		);
		expect(text("quota")).toBe(
			"크레딧이 부족해요. 기본 샘플은 무료로 들을 수 있어요.",
		);
		expect(text("rate_limit")).toBe(
			"요청이 많아 잠시 막혔어요. 잠시 뒤 다시 눌러 주세요.",
		);
		expect(
			text("provider_input", { providerCode: "subscription_required" }),
		).toBe("무료 플랜은 라이브러리 성우를 API로 쓸 수 없어요");
		expect(
			text("provider_input", { providerCode: "voice_access_denied" }),
		).toBe("ElevenLabs 웹에서 내 계정에 추가한 뒤 ‘내 계정’에서 들어 보세요");
		expect(text("provider_input", { providerCode: "audio_too_large" })).toBe(
			"결과 오디오가 너무 커요. 문장을 줄이거나 속도를 올려 주세요.",
		);
		expect(text("unknown_outcome")).toMatch(/^처리 여부를 확인하지 못했어요/);
		expect(text("storage")).toBe(
			"지금은 내 문장을 들을 수 없어요. 기본 샘플은 들을 수 있어요.",
		);
		// 모르는 사유 문자열(객체 기본 속성 이름 포함)은 switch의 default가 거른다
		expect(text("constructor")).toBe(
			"내 문장을 듣지 못했어요. 잠시 뒤 다시 눌러 주세요.",
		);
	});
	it("trialFallback은 그 공급자의 그 밖 사유 문구(맥락이 다른 화면이 이 문구만 바꾼다)", () => {
		expect(trialFallback("elevenlabs")).toBe(
			"내 문장을 듣지 못했어요. 잠시 뒤 다시 눌러 주세요.",
		);
		expect(trialFallback("gemini")).toBe(
			trialProblemText("gemini", {
				reason: "unexpected",
				retryAt: null,
				providerCode: null,
			}).text,
		);
	});
	it("Airy 입력 거절은 공급자 코드 없이 고칠 방법을 말한다(D7)", () => {
		const text = (providerCode: string) =>
			trialProblemText(
				"airy",
				trialFailureOf(error("provider_input", { providerCode })),
			).text;
		expect(text("unsupported_characters")).toBe(
			"Airy가 읽지 못하는 글자가 있어요. 문장이나 언어 설정을 확인해 주세요.",
		);
		expect(text("invalid_value")).toBe(
			"Airy가 이 설정을 받지 않았어요. 언어와 말투를 확인해 주세요.",
		);
		expect(text("not_found")).toBe(
			"Airy가 이 문장을 받지 않았어요. 문장이나 언어 설정을 확인해 주세요.",
		);
		expect(text("audio_too_large")).toBe(
			"결과 오디오가 너무 커요. 문장을 줄이거나 속도를 올려 주세요.",
		);
	});
});

describe("Gemini 요청과 모델 선택지(T7.6)", () => {
	const gemini = voice({ provider: "gemini", voiceId: "kore", name: "Kore" });
	it("요청은 Gemini 공급자 설정을 그대로 쓴다", () => {
		const settings = {
			...DEFAULT_SETTINGS,
			gemini: {
				model: "gemini-3.8-flash-lite-tts" as const,
				direction: "calm",
			},
		};
		expect(requestOf(gemini, "안녕", settings)).toEqual({
			provider: "gemini",
			voiceId: "kore",
			text: "안녕",
			settings: { model: "gemini-3.8-flash-lite-tts", direction: "calm" },
		});
	});
	it("모델 선택지는 두 Gemini 모델이다(무료 배지 없음)", () => {
		expect(modelOptionsOf(gemini)).toEqual([
			{ value: "gemini-3.8-flash-tts", label: "gemini-3.8-flash-tts" },
			{
				value: "gemini-3.8-flash-lite-tts",
				label: "gemini-3.8-flash-lite-tts",
			},
		]);
	});
});

describe("Gemini 내 문장 듣기 문구(T7.6)", () => {
	const gemini = (
		over: Partial<GeminiSettings> = {},
		text = "가나다라마바",
	): TrialRequest => ({
		provider: "gemini",
		voiceId: "kore",
		text,
		settings: { ...DEFAULT_SETTINGS.gemini, ...over },
	});
	const before = GEMINI_PRICE_UP_AT - 1;

	it("추정 금액 글자는 0.0001달러 단위로 올림한다(실제보다 작게 보이지 않게)", () => {
		expect(usageText({ unit: "usd_micro", amount: 225 })).toBe(
			"추정 약 $0.0003",
		);
		expect(usageText({ unit: "usd_micro", amount: 450 })).toBe(
			"추정 약 $0.0005",
		);
		expect(usageText({ unit: "usd_micro", amount: 9000 })).toBe(
			"추정 약 $0.0090",
		);
		// 경계: 정확히 0.0001달러 단위면 올리지 않고, 1이라도 넘으면 올린다
		expect(usageText({ unit: "usd_micro", amount: 100 })).toBe(
			"추정 약 $0.0001",
		);
		expect(usageText({ unit: "usd_micro", amount: 101 })).toBe(
			"추정 약 $0.0002",
		);
		// 다른 단위는 그대로
		expect(usageText({ unit: "credit", amount: 1234 })).toBe("약 1,234크레딧");
	});

	it("근거: 유료 등급 1분 단가와 가정한 길이(모델·날짜를 따른다)", () => {
		expect(usageBasis(gemini(), before)).toBe(
			"유료 등급 1분 $0.0135 · 1초에 5글자로 약 2초 가정",
		);
		expect(
			usageBasis(
				gemini({ model: "gemini-3.8-flash-lite-tts" }),
				GEMINI_PRICE_UP_AT,
			),
		).toBe("유료 등급 1분 $0.0180 · 1초에 5글자로 약 2초 가정");
		expect(
			usageBasis({
				provider: "airy",
				voiceId: "a597bb7a98fc9ec1",
				text: "가",
				settings: DEFAULT_SETTINGS.airy,
			}),
		).toBe("한국어 1글자 1.5크레딧");
	});

	it("비용 문구: Gemini만 '요금'이고 다른 공급자는 '크레딧' 그대로다(critique P2, 사용자 결정 2026-10-13)", () => {
		expect(costCopy("gemini")).toEqual({
			title: "요금이 들 수 있어요. 들어 볼까요?",
			action: "만들어 듣기",
			free: "무료로",
			paid: "요금이 들 수 있음",
			saved: "저장된 결과 · 요금 없음",
		});
		expect(costCopy("airy")).toEqual({
			title: "크레딧을 써서 들어 볼까요?",
			action: "크레딧 쓰고 듣기",
			free: "크레딧 없이",
			paid: "크레딧 사용",
			saved: "저장된 결과 · 크레딧 0",
		});
		expect(trialAriaLabel("Kore", gemini(), "idle")).toBe(
			"Kore 내 문장 듣기, 새로 만들 때 요금이 들 수 있음",
		);
	});

	it("설정 요약: Gemini 말투 지시는 '말투 지시 …'이고 비면 없다. ElevenLabs 스타일과 Airy 말투는 그대로다", () => {
		expect(settingsSummary(gemini({ direction: "calm and relaxed" }))).toBe(
			"gemini-3.8-flash-tts · 말투 지시 calm and relaxed",
		);
		expect(settingsSummary(gemini())).toBe("gemini-3.8-flash-tts");
		expect(
			settingsSummary({
				provider: "airy",
				voiceId: "a597bb7a98fc9ec1",
				text: "가",
				settings: { ...DEFAULT_SETTINGS.airy, style: "bright" },
			}),
		).toBe("airy-tts-v1 · 한국어 · 말투 밝게");
		expect(
			settingsSummary({
				provider: "elevenlabs",
				voiceId: "v1",
				text: "가",
				settings: {
					...DEFAULT_SETTINGS.elevenlabs,
					model: "eleven_multilingual_v2",
					style: 0.3,
				},
			}),
		).toBe("eleven_multilingual_v2 · 스타일 0.30");
	});

	it("데이터 안내와 오류 문구", () => {
		expect(dataNote(gemini())).toBe(
			"무료 등급 키는 과금이 없지만 보낸 문장이 Google 제품 개선에 쓰이고 사람이 검토할 수 있어요",
		);
		const text = (
			reason: TrialProblem["reason"],
			providerCode = null as string | null,
		) =>
			trialProblemText("gemini", { reason, retryAt: null, providerCode }).text;
		expect(text("provider_input", "INVALID_ARGUMENT")).toBe(
			"Gemini가 이 문장을 받지 않았어요. 문장이나 말투 지시를 확인해 주세요.",
		);
		expect(text("quota")).toBe(
			"Gemini 결제나 한도 조건에 걸렸어요. Google AI Studio에서 확인해 주세요.",
		);
		expect(text("provider_input", "audio_too_large")).toBe(
			"결과 오디오가 너무 커요. 문장을 줄이거나 말투 지시를 바꿔 주세요.",
		);
		expect(text("unknown_outcome")).toBe(
			"처리 여부를 확인하지 못했어요. 요금이 들었을 수 있으니 Google AI Studio 사용량을 확인한 뒤 다시 눌러 주세요.",
		);
		// 다른 공급자의 한도·미확인 문구는 그대로
		const airy = (reason: TrialProblem["reason"]) =>
			trialProblemText("airy", { reason, retryAt: null, providerCode: null })
				.text;
		expect(airy("quota")).toBe(
			"크레딧이 부족해요. 기본 샘플은 무료로 들을 수 있어요.",
		);
		expect(airy("unknown_outcome")).toBe(
			"처리 여부를 확인하지 못했어요. 크레딧이 쓰였을 수 있으니 음성 서비스 사용 기록을 확인한 뒤 다시 눌러 주세요.",
		);
	});
});

describe("확인 창 글(T9)", () => {
	const typecast = (text: string): TrialRequest => ({
		provider: "typecast",
		voiceId: "tc_1",
		text,
		settings: DEFAULT_SETTINGS.typecast,
	});
	it("캐스팅은 T5 그대로: 공급자 비용 문구와 문장 전체", () => {
		expect(confirmCopy("trial", typecast(" 안녕하세요 "))).toEqual({
			title: costCopy("typecast").title,
			action: costCopy("typecast").action,
			textLabel: "문장",
			text: " 안녕하세요 ",
		});
		const gemini = {
			provider: "gemini",
			voiceId: "kore",
			text: "가",
			settings: DEFAULT_SETTINGS.gemini,
		} as TrialRequest;
		expect(confirmCopy("trial", gemini)).toMatchObject({
			title: costCopy("gemini").title,
			action: costCopy("gemini").action,
		});
	});
	it("작업실은 대본 앞 100자와 총 글자 수, '크레딧 쓰고 만들기'(스펙 4절)", () => {
		expect(confirmCopy("studio", typecast(`  ${"가".repeat(150)} `))).toEqual({
			title: "크레딧을 써서 음성을 만들까요?",
			action: "크레딧 쓰고 만들기",
			textLabel: "대본",
			text: `${"가".repeat(100)}… (총 150자)`,
			// 같은 서명의 미확인 줄이 있을 때 경고 줄(브리프 5.7)
			unknownRetry:
				"같은 대본·성우·설정의 앞 요청은 처리 여부를 아직 몰라요. 다시 만들면 크레딧이 한 번 더 쓰일 수 있어요",
			paid: true,
		});
		expect(confirmCopy("studio", typecast("짧은 대본")).text).toBe(
			"짧은 대본 (총 5자)",
		);
	});
	it("작업실 Gemini 문단은 크레딧이 아니라 비용이다(전체 만들기 창과 같은 문법)", () => {
		const gemini = {
			provider: "gemini",
			voiceId: "kore",
			text: "짧은 대본",
			settings: DEFAULT_SETTINGS.gemini,
		} as TrialRequest;
		expect(confirmCopy("studio", gemini)).toEqual({
			title: "비용이 드는 음성을 만들까요?",
			action: "비용 내고 만들기",
			textLabel: "대본",
			text: "짧은 대본 (총 5자)",
			unknownRetry:
				"같은 대본·성우·설정의 앞 요청은 처리 여부를 아직 몰라요. 다시 만들면 비용이 한 번 더 들 수 있어요",
			paid: true,
		});
	});
	it("작업실 무료 요청(미확인이라 창이 뜬다)은 크레딧·비용 말 없이 '만들기', 무료 기간이 끝나면 유료 문구", () => {
		const fish = {
			provider: "fish_audio",
			voiceId: "fa_1",
			text: "짧은 대본",
			settings: { ...DEFAULT_SETTINGS.fish_audio, model: "s2.1-pro-free" },
		} as TrialRequest;
		expect(confirmCopy("studio", fish, FISH_FREE_UNTIL - 1)).toEqual({
			title: "문단을 만들까요?",
			action: "만들기",
			textLabel: "대본",
			text: "짧은 대본 (총 5자)",
			unknownRetry:
				"같은 대본·성우·설정의 앞 요청은 처리 여부를 아직 몰라요. 다시 만들어도 무료예요",
			paid: false,
		});
		expect(confirmCopy("studio", fish, FISH_FREE_UNTIL)).toMatchObject({
			action: "크레딧 쓰고 만들기",
			paid: true,
		});
	});
});
