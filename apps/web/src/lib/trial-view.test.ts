import { ORPCError } from "@orpc/client";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	DEFAULT_SETTINGS,
	FISH_FREE_UNTIL,
} from "@tts-pilot-app/api/providers/trial-options";
import { describe, expect, it } from "vitest";

import {
	dataNote,
	modelOptionsOf,
	needsConfirm,
	presetsOf,
	remainingLabel,
	remainingLines,
	requestOf,
	resultLine,
	resultSubject,
	resultWhen,
	settingsSummary,
	trialAriaLabel,
	trialBlock,
	trialFailureOf,
	trialProblemText,
	typecastOverdrawn,
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
		// 줄마다 다른 접근 이름(D6): 문장 앞 20자
		expect(resultSubject("Jiyoung", item)).toBe(
			"Jiyoung 저장된 결과 '오늘 소개할 제품은 30초 만에 끝나'",
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
			"크레딧이 부족해요. 기본 샘플은 무료로 들을 수 있어요",
		);
		expect(text("rate_limit")).toBe(
			"요청이 많아 잠시 막혔어요. 잠시 뒤 다시 눌러 주세요",
		);
		expect(
			text("provider_input", { providerCode: "subscription_required" }),
		).toBe("무료 플랜은 라이브러리 성우를 API로 쓸 수 없어요");
		expect(
			text("provider_input", { providerCode: "voice_access_denied" }),
		).toBe("ElevenLabs 웹에서 내 계정에 추가한 뒤 '내 계정'에서 들어 보세요");
		expect(text("provider_input", { providerCode: "audio_too_large" })).toBe(
			"결과 오디오가 너무 커요. 문장을 줄이거나 속도를 올려 주세요",
		);
		expect(text("unknown_outcome")).toMatch(/^처리 여부를 확인하지 못했어요/);
		expect(text("storage")).toBe(
			"지금은 내 문장을 들을 수 없어요. 기본 샘플은 들을 수 있어요",
		);
		// 모르는 사유 문자열(객체 기본 속성 이름 포함)은 switch의 default가 거른다
		expect(text("constructor")).toBe(
			"내 문장을 듣지 못했어요. 잠시 뒤 다시 눌러 주세요",
		);
	});
});
