import { ORPCError } from "@orpc/client";
import type {
	ProviderId,
	RemainingQuota,
	Voice,
} from "@tts-pilot-app/api/providers/contract";
import type {
	TrialErrorData,
	TrialFailure,
	TrialItem,
} from "@tts-pilot-app/api/providers/trial-contract";
import {
	AIRY_CREDITS_PER_CHAR,
	AIRY_MODELS,
	type AiryStyle,
	codePoints,
	DEFAULT_SETTINGS,
	ELEVENLABS_MODELS,
	EMOTION_PRESETS,
	type EmotionPreset,
	FISH_MODELS,
	type FishModel,
	fishUsd,
	freeModelOpen,
	GEMINI_CHARS_PER_SECOND,
	GEMINI_MODELS,
	GEMINI_TOKENS_PER_SECOND,
	geminiSeconds,
	geminiUsdPerMillion,
	isFreeModel,
	normalizeText,
	type SettingsOf,
	sentText,
	type TrialRequest,
	TYPECAST_MODELS,
	type TypecastModel,
	type TypecastSettings,
	type Usage,
	usedSettings,
	V21_PRESETS,
} from "@tts-pilot-app/api/providers/trial-options";

import { creditNumber, PROVIDER_LABEL } from "./connection-view";
import { languageName } from "./provider-conditions";
import { problemCopy, retryAtOf } from "./voice-failure";
import { labelOf } from "./voice-filter";
import { agoText, EMOTION_KO, plain, retryTime } from "./voice-view";

// 시험 생성('내 문장 듣기')의 화면 문구와 계산(T5 브리프 12절, 스펙 3·6절). 화면 없이 테스트하는 순수 함수만 둔다.
// 문자열(알림·설명·접근 이름)에는 '▷'를 쓰지 않는다. 화면 글자 사이의 재생 기호는 Play 아이콘(aria-hidden)이다(계획 리뷰 D22)

// 감정 이름은 T4 패널 '모델별 감정'과 한 벌이다(voice-view EMOTION_KO: 기본·기쁨·슬픔·화남·속삭임·높은 톤·낮은 톤)
export const emotionLabel = (preset: string) => labelOf(EMOTION_KO, preset);
export const LANGUAGE_LABEL = { auto: "자동 감지", kor: "한국어" } as const;
// 옵션 이름표(슬라이더·스위치·요약이 함께 쓴다)
export const FIELD_LABEL: Record<string, string> = {
	intensity: "강도",
	tempo: "속도",
	pitch: "음높이",
	volume: "음량",
	stability: "안정성",
	similarity: "유사도",
	style: "스타일",
	speed: "속도",
	speakerBoost: "화자 증폭",
	temperature: "표현력",
	// GLOSSARY '말투 지시'(Gemini). ElevenLabs '스타일'(style)과 다른 설정이다
	direction: "말투 지시",
};
// Airy 말투(GLOSSARY '말투'). ElevenLabs '스타일'(수치 슬라이더, FIELD_LABEL.style)과 다른 설정이다
export const AIRY_STYLE_LABEL: Record<AiryStyle, string> = {
	normal: "보통",
	bright: "밝게",
	calm: "차분하게",
	whisper: "속삭임",
};
// 말투 태그(공식 목록, 계획 '계획에서 정한 것'). 화면에는 한국어 이름과 원문을 함께 보인다
export const ELEVENLABS_TAGS = [
	{ value: "whispers", label: "속삭임" },
	{ value: "sighs", label: "한숨" },
	{ value: "laughs", label: "웃음" },
	{ value: "excited", label: "신남" },
	{ value: "curious", label: "궁금함" },
	{ value: "sarcastic", label: "비꼼" },
	{ value: "crying", label: "울먹임" },
	{ value: "mischievously", label: "장난스럽게" },
	{ value: "exhales", label: "숨 내쉬기" },
];
export const FISH_TAGS = [
	{ value: "happy", label: "기쁨" },
	{ value: "sad", label: "슬픔" },
	{ value: "angry", label: "화남" },
	{ value: "excited", label: "신남" },
	{ value: "calm", label: "차분함" },
	{ value: "nervous", label: "긴장" },
	{ value: "confident", label: "자신감" },
	{ value: "surprised", label: "놀람" },
	{ value: "whispering", label: "속삭임" },
];

// 그 성우가 지원하는 Typecast 모델(성우 데이터 models). 정보가 없으면 둘 다
export function typecastModelsOf(voice: Voice): TypecastModel[] {
	const offered = TYPECAST_MODELS.filter((model) =>
		voice.models.some((m) => m.model === model),
	);
	return offered.length > 0 ? offered : [...TYPECAST_MODELS];
}
// 그 성우·모델이 지원하는 프리셋. v21은 넷까지. 정보가 없으면 모델의 전체 목록
export function presetsOf(voice: Voice, model: TypecastModel): EmotionPreset[] {
	const allowed = model === "ssfm-v30" ? EMOTION_PRESETS : V21_PRESETS;
	const emotions = voice.models.find((m) => m.model === model)?.emotions;
	const list = emotions
		? allowed.filter((preset) => emotions.includes(preset))
		: [...allowed];
	return list.length > 0 ? list : ["normal"];
}
// 고를 수 있는 Fish Audio 모델. 무료 기간이 끝나면 유료만
export const fishModelsOf = (now = Date.now()): FishModel[] =>
	freeModelOpen(now) ? [...FISH_MODELS] : ["s2.1-pro"];
// 패널 '모델' 메뉴의 선택지. 무료 모델에는 '무료' 배지(free)
export function modelOptionsOf(
	voice: Voice,
	now = Date.now(),
): { value: string; label: string; free?: true }[] {
	const models =
		voice.provider === "typecast"
			? typecastModelsOf(voice)
			: voice.provider === "elevenlabs"
				? [...ELEVENLABS_MODELS]
				: voice.provider === "airy"
					? [...AIRY_MODELS]
					: voice.provider === "gemini"
						? [...GEMINI_MODELS]
						: fishModelsOf(now);
	return models.map((model) =>
		model === "s2.1-pro-free"
			? { value: model, label: model, free: true }
			: { value: model, label: model },
	);
}

// 공급자 설정은 공급자마다 하나다. 이 성우가 받지 않는 값만 이 요청에서 보정한다(공급자 설정 자체는 바꾸지 않는다)
function typecastFor(
	voice: Voice,
	settings: TypecastSettings,
): TypecastSettings {
	const models = typecastModelsOf(voice);
	const model = models.includes(settings.model)
		? settings.model
		: (models[0] ?? "ssfm-v30");
	const presets = presetsOf(voice, model);
	return {
		...settings,
		model,
		emotion: model === "ssfm-v21" ? "preset" : settings.emotion,
		preset: presets.includes(settings.preset)
			? settings.preset
			: (presets[0] ?? "normal"),
	};
}
export function requestOf(
	voice: Voice,
	text: string,
	settings: SettingsOf,
	now = Date.now(),
): TrialRequest {
	const { voiceId } = voice;
	switch (voice.provider) {
		case "typecast":
			return {
				provider: "typecast",
				voiceId,
				text,
				settings: typecastFor(voice, settings.typecast),
			};
		case "elevenlabs":
			return {
				provider: "elevenlabs",
				voiceId,
				text,
				settings: settings.elevenlabs,
			};
		case "fish_audio": {
			const fish = settings.fish_audio;
			return {
				provider: "fish_audio",
				voiceId,
				text,
				settings: fishModelsOf(now).includes(fish.model)
					? fish
					: { ...fish, model: "s2.1-pro" },
			};
		}
		case "airy":
			return {
				provider: "airy",
				voiceId,
				text,
				settings: settings.airy,
			};
		case "gemini":
			return {
				provider: "gemini",
				voiceId,
				text,
				settings: settings.gemini,
			};
	}
}

// 확인 창이 필요한가(스펙 2절: 누를 때마다, Fish Audio 무료 모델은 묻지 않는다)
export const needsConfirm = (request: TrialRequest, now = Date.now()) =>
	!(isFreeModel(request) && freeModelOpen(now));

// '내 문장 듣기'를 막는 이유(브리프 12절 상태 표). 없으면 null. key는 이 버튼의 성우, busyKey는 **만드는 중**인 성우다.
// 저장된 결과를 찾는 동안(0.3초 안팎)은 busyKey를 넘기지 않는다: 다른 버튼을 흐리지 않고 누른 버튼 안 진행 표시만 둔다(계획 리뷰 D10)
export function trialBlock(input: {
	provider: ProviderId;
	text: string;
	busyKey: string | null;
	key: string;
	retryAt: string | null;
	noKey: boolean;
}): string | null {
	if (input.noKey) return `${PROVIDER_LABEL[input.provider]} 키가 없어요`;
	if (normalizeText(input.text) === "") return "문장을 먼저 써 주세요";
	if (input.busyKey !== null && input.busyKey !== input.key)
		return "다른 문장을 만드는 중이에요";
	if (input.retryAt)
		return `${retryTime(input.retryAt)} 이후에 다시 들을 수 있어요`;
	return null;
}

// 비용 문구(critique P2, 사용자 결정 2026-10-13). Gemini는 크레딧이 아니라 요금이고 무료 등급 키는 과금이 없어 '들 수 있어요'다.
// 다른 공급자 문구는 그대로다. 문장 바 공통 안내는 다섯 탭 공통이라 여기 없다
export const costCopy = (provider: ProviderId) =>
	provider === "gemini"
		? {
				title: "요금이 들 수 있어요. 들어 볼까요?",
				action: "만들어 듣기",
				free: "무료로",
				paid: "요금이 들 수 있음",
				saved: "저장된 결과 · 요금 없음",
			}
		: {
				title: "크레딧을 써서 들어 볼까요?",
				action: "크레딧 쓰고 듣기",
				free: "크레딧 없이",
				paid: "크레딧 사용",
				saved: "저장된 결과 · 크레딧 0",
			};

// 작업실 문단 하나 확인 창(T10). Gemini는 크레딧이 아니라 요금이라 전체 만들기 창(PARAGRAPH_TEXT confirmCost·makeCost·unknownRetry)과 같은 '비용' 문법이다.
// 무료 요청(needsConfirm 거짓)은 미확인일 때만 창이 떠 크레딧·비용 말 없이 '만들기'이고 paid가 거짓이다(창이 Coins를 그리지 않는다). 캐스팅은 T5 그대로
export function confirmCopy(
	kind: "trial" | "studio",
	request: TrialRequest,
	now = Date.now(),
) {
	const cost = costCopy(request.provider);
	if (kind === "trial")
		return {
			title: cost.title,
			action: cost.action,
			textLabel: "문장",
			text: request.text,
		};
	const text = normalizeText(request.text);
	const count = codePoints(text);
	const paid = needsConfirm(request, now);
	const fee = request.provider === "gemini";
	return {
		title: !paid
			? "문단을 만들까요?"
			: fee
				? "비용이 드는 음성을 만들까요?"
				: "크레딧을 써서 음성을 만들까요?",
		action: !paid ? "만들기" : fee ? "비용 내고 만들기" : "크레딧 쓰고 만들기",
		textLabel: "대본",
		text: `${[...text].slice(0, 100).join("")}${count > 100 ? "…" : ""} (총 ${plain.format(count)}자)`,
		// 이전 결과에 같은 서명의 미확인 줄이 있을 때 경고 줄(브리프 5.7)
		unknownRetry: `같은 대본·성우·설정의 앞 요청은 처리 여부를 아직 몰라요. ${!paid ? "다시 만들어도 무료예요" : `다시 만들면 ${fee ? "비용이 한 번 더 들" : "크레딧이 한 번 더 쓰일"} 수 있어요`}`,
		paid,
	};
}

export function trialAriaLabel(
	name: string,
	request: TrialRequest,
	state: "idle" | "saved" | "busy" | "playing",
	now = Date.now(),
): string {
	if (state === "busy") return `${name} 내 문장 만드는 중`;
	if (state === "playing") return `${name} 내 문장 정지`;
	if (state === "saved") return `${name} 저장된 결과 듣기`;
	return `${name} 내 문장 듣기, ${needsConfirm(request, now) ? `새로 만들 때 ${costCopy(request.provider).paid}` : "무료"}`;
}

export function usageText(usage: Usage): string {
	// Gemini 추정 금액(백만분의 1달러). 0.0001달러 단위로 올림해 실제보다 작게 보이지 않게 한다(계획 Review Focus 2)
	if (usage.unit === "usd_micro")
		return `추정 약 $${(Math.ceil(usage.amount / 100) / 10_000).toFixed(4)}`;
	if (usage.unit === "free") return "무료";
	if (usage.unit === "byte")
		return `${plain.format(usage.amount)}바이트 · 약 $${fishUsd(usage.amount).toFixed(4)}`;
	return `약 ${plain.format(usage.amount)}크레딧`;
}

// 확인 창 예상 사용량의 근거(화면이 '<공급자> 요금 기준:'을 붙인다). Airy는 언어별 과금 규칙(T7.5 U4),
// Gemini는 유료 등급 1분 단가와 가정한 길이(T7.6 스펙 5절). 그 밖의 공급자는 없다
export function usageBasis(
	request: TrialRequest,
	now = Date.now(),
): string | null {
	if (request.provider === "gemini") {
		const perMinute =
			(60 *
				GEMINI_TOKENS_PER_SECOND *
				geminiUsdPerMillion(request.settings.model, now)) /
			1_000_000;
		return `유료 등급 1분 $${perMinute.toFixed(4)} · 1초에 ${GEMINI_CHARS_PER_SECOND}글자로 약 ${geminiSeconds(sentText(request))}초 가정`;
	}
	if (request.provider !== "airy") return null;
	const { language } = request.settings;
	return `${languageName(language)} 1글자 ${AIRY_CREDITS_PER_CHAR[language]}크레딧`;
}

// 확인 창의 남은 값(T2 연결 상태 값). 어느 잔액인지 이름으로 알린다(lessons 2026-10-04).
// Fish Audio는 '남은 잔액'으로 API 충전 잔액과(있으면) 웹 플랜 크레딧을 두 줄로 보인다. 어느 잔액에서 빠지는지는 CS-09(사용자 테스트 5번)로 정한다(계획 리뷰 D14)
export const remainingLabel = (provider: ProviderId) =>
	provider === "fish_audio" ? "남은 잔액" : "남은 크레딧";
export function remainingLines(
	provider: ProviderId,
	quota: RemainingQuota | null,
): string[] {
	if (quota === null) return ["확인하지 못했어요"];
	// Airy는 카드와 같은 버림 한 자리(실제보다 크게 보이지 않게, E4·D4)
	if (provider === "airy") return [`${creditNumber(quota.remaining)}크레딧`];
	const remaining = plain.format(Math.max(0, quota.remaining));
	if (provider !== "fish_audio") return [`${remaining}크레딧`];
	const web = quota.webCredit;
	return [
		`API 충전 잔액 ${remaining}`,
		...(web
			? [`웹 플랜 크레딧 ${plain.format(Math.max(0, web.remaining))}`]
			: []),
	];
}
// Typecast 남은 플랜 크레딧이 없다(유료 플랜은 넘어서 청구될 수 있어 막지 않는다, 스펙 4절)
export const typecastOverdrawn = (quota: RemainingQuota | null) =>
	quota !== null && quota.remaining <= 0;

// 옵션 값 글자(브리프 12절: "0.50", "1.00배", "+2반음", "100"). 슬라이더의 aria-valuetext이기도 하다(계획 리뷰 D17)
export function valueText(
	field: string,
	value: string | number | boolean,
): string {
	if (typeof value === "boolean") return value ? "켬" : "끔";
	if (typeof value === "string") return value;
	switch (field) {
		case "tempo":
		case "speed":
			return `${value.toFixed(2)}배`;
		case "pitch":
			return `${value > 0 ? "+" : ""}${value}반음`;
		case "volume":
			return String(value);
		case "intensity":
			return value.toFixed(1);
		default:
			return value.toFixed(2);
	}
}
// 옵션 한 칸의 이름과 값 글자. 설정 요약과 프리셋 비교(T8)가 같은 말을 쓴다
export function optionText(
	provider: ProviderId,
	field: string,
	value: string | number | boolean,
): { label: string; value: string } {
	if (field === "model") return { label: "모델", value: String(value) };
	if (field === "emotion")
		return { label: "감정 모드", value: value === "smart" ? "자동" : "직접" };
	if (field === "preset")
		return { label: "감정", value: emotionLabel(String(value)) };
	if (field === "tag")
		return { label: "말투 태그", value: value === "" ? "없음" : `[${value}]` };
	if (field === "direction")
		return {
			label: FIELD_LABEL.direction,
			value: value === "" ? "없음" : String(value),
		};
	if (field === "language")
		return {
			label: "언어",
			value:
				provider === "airy"
					? languageName(String(value))
					: LANGUAGE_LABEL[value as "auto" | "kor"],
		};
	if (provider === "airy" && field === "style")
		return { label: "말투", value: AIRY_STYLE_LABEL[value as AiryStyle] };
	return { label: FIELD_LABEL[field] ?? field, value: valueText(field, value) };
}

// 결과 줄·확인 창의 설정 요약: 모델 + 기본값에서 벗어난 옵션. Typecast 직접 감정은 늘 보인다(계획 '계획에서 정한 것')
export function settingsParts(request: TrialRequest): string[] {
	const used = usedSettings(request);
	const defaults = DEFAULT_SETTINGS[request.provider] as Record<
		string,
		unknown
	>;
	const parts = [String(used.model)];
	for (const [field, value] of Object.entries(used)) {
		if (field === "model" || field === "emotion") continue;
		// Airy 언어는 과금 기준이라 기본값(ko)이어도 늘 보인다
		const airyLanguage = request.provider === "airy" && field === "language";
		if (
			field !== "preset" &&
			((value === defaults[field] && !airyLanguage) || value === "")
		)
			continue;
		const text = optionText(request.provider, field, value);
		// 태그·언어는 값만으로 뜻이 보인다
		parts.push(
			field === "tag" || field === "language"
				? text.value
				: `${text.label} ${text.value}`,
		);
	}
	return parts;
}

export const settingsSummary = (request: TrialRequest): string =>
	settingsParts(request).join(" · ");

export const resultWhen = (createdAt: string, now: Date) => {
	const ago = agoText(createdAt, now);
	return ago === "방금" ? "방금" : `${ago} 전`;
};
// 결과 줄 둘째 줄. 잘려도 언제·사용량이 남게 앞에 둔다(계획 리뷰 D2). 화면은 두 줄까지 감는다(line-clamp-2)
export const resultLine = (item: TrialItem, now: Date, withUsage = true) =>
	`${resultWhen(item.createdAt, now)} · ${withUsage ? `${usageText(item.usage)} · ` : ""}${settingsSummary(item.request)}`;
// 결과 줄 버튼의 대상 이름. 줄마다 다르게 문장 앞 20자를 넣는다(계획 리뷰 D6)
export const resultSubject = (name: string, item: TrialItem) =>
	`${name} 저장된 결과 ‘${[...normalizeText(item.request.text)].slice(0, 20).join("")}’`;

// Gemini 무료 등급 약관(research 10절). 키 등급을 알 API가 없어 늘 보인다(T7.6 스펙 2절). 패널 데이터 안내와 확인 창이 함께 쓴다
export const GEMINI_DATA_NOTE =
	"무료 등급 키는 과금이 없지만 보낸 문장이 Google 제품 개선에 쓰이고 사람이 검토할 수 있어요";

// 공급자 약관에 문장 이용 문구가 있으면 한 줄(스펙 3절)
export function dataNote(request: TrialRequest): string | null {
	if (request.provider === "gemini") return GEMINI_DATA_NOTE;
	if (request.provider === "typecast")
		return "보낸 문장이 Typecast 서비스 개선에 쓰일 수 있어요";
	if (isFreeModel(request))
		return "보낸 문장이 Fish Audio 모델 개선에 쓰일 수 있어요";
	return null;
}

// 화면이 읽는 실패. 사유 없는 오류(500 등)는 unexpected. 모르는 사유 문자열은 trialProblemText의 default가 거른다
// (조회 표가 없어 객체 기본 속성 이름에 속을 곳이 없다, 계획 리뷰 ponytail 7)
export type TrialProblem = {
	reason: TrialFailure | "unexpected";
	retryAt: string | null;
	providerCode: string | null;
};
export function trialFailureOf(error: unknown): TrialProblem {
	const data =
		error instanceof ORPCError
			? (error.data as Partial<TrialErrorData> | undefined)
			: undefined;
	return {
		reason: typeof data?.reason === "string" ? data.reason : "unexpected",
		retryAt: retryAtOf(error),
		providerCode:
			typeof data?.providerCode === "string" ? data.providerCode : null,
	};
}

// 행의 짧은 실패 글자(1199px 이하에서도 행에 보인다, 계획 리뷰 D4). 전체 문구는 설명과 패널에 있다
export const TRIAL_SHORT_PROBLEM = "내 문장을 듣지 못했어요";

// ElevenLabs 입력 거절 코드별 문구. 잠정 표: 공식 문서에 상황별 대응이 없어 사용자 테스트 3번(승인된 실제 1회)의 코드로 맞춘다(스펙 6절)
const FREE_PLAN_CODES = new Set([
	"subscription_required",
	"feature_not_available",
]);
const NOT_IN_ACCOUNT_CODES = new Set([
	"voice_access_denied",
	"voice_not_found",
]);
// 스펙 6절 문구. connections가 참이면 '연결 상태 보기' 링크 버튼을 함께 둔다.
// 키 없음·키 문제는 T4 사유 안내와 같은 글자다(problemCopy, 계획 리뷰 ponytail 11·D24)
export function trialProblemText(
	provider: ProviderId,
	problem: TrialProblem,
): { text: string; connections: boolean } {
	const name = PROVIDER_LABEL[provider];
	switch (problem.reason) {
		case "no_key":
		case "provider_auth":
		case "no_permission": {
			const copy = problemCopy(provider, problem.reason);
			return { text: `${copy.title}. ${copy.description}.`, connections: true };
		}
		case "quota":
			return {
				text:
					provider === "gemini"
						? "Gemini 결제나 한도 조건에 걸렸어요. Google AI Studio에서 확인해 주세요."
						: "크레딧이 부족해요. 기본 샘플은 무료로 들을 수 있어요.",
				connections: false,
			};
		case "rate_limit":
			return {
				text: problem.retryAt
					? `${retryTime(problem.retryAt)} 이후에 다시 들을 수 있어요`
					: "요청이 많아 잠시 막혔어요. 잠시 뒤 다시 눌러 주세요.",
				connections: false,
			};
		case "provider_input": {
			const code = problem.providerCode;
			if (code === "audio_too_large")
				return {
					// Gemini에는 속도 설정이 없다(계획 리뷰 R6-1)
					text:
						provider === "gemini"
							? "결과 오디오가 너무 커요. 문장을 줄이거나 말투 지시를 바꿔 주세요."
							: "결과 오디오가 너무 커요. 문장을 줄이거나 속도를 올려 주세요.",
					connections: false,
				};
			// Airy 입력 거절(400). 공급자 코드는 보이지 않는다(D7, 새 문구는 사용자 테스트에서 확인)
			if (provider === "airy")
				return {
					text:
						code === "unsupported_characters"
							? "Airy가 읽지 못하는 글자가 있어요. 문장이나 언어 설정을 확인해 주세요."
							: code === "invalid_value"
								? "Airy가 이 설정을 받지 않았어요. 언어와 말투를 확인해 주세요."
								: "Airy가 이 문장을 받지 않았어요. 문장이나 언어 설정을 확인해 주세요.",
					connections: false,
				};
			// Gemini 입력 거절(400·404·정책 차단). 공급자 코드는 보이지 않는다(새 문구, 사용자 테스트에서 확인)
			if (provider === "gemini")
				return {
					text: "Gemini가 이 문장을 받지 않았어요. 문장이나 말투 지시를 확인해 주세요.",
					connections: false,
				};
			if (provider === "elevenlabs" && code && FREE_PLAN_CODES.has(code))
				return {
					text: "무료 플랜은 라이브러리 성우를 API로 쓸 수 없어요",
					connections: false,
				};
			if (provider === "elevenlabs" && code && NOT_IN_ACCOUNT_CODES.has(code))
				return {
					text: "ElevenLabs 웹에서 내 계정에 추가한 뒤 ‘내 계정’에서 들어 보세요",
					connections: false,
				};
			return {
				text: `${name}가 이 요청을 받지 않았어요.${code ? ` ${code}` : ""}`,
				connections: false,
			};
		}
		case "provider_error":
			return {
				text: "음성 서비스 쪽 오류예요. 잠시 뒤 다시 눌러 주세요.",
				connections: false,
			};
		case "unknown_outcome":
			return {
				// Gemini는 크레딧이 아니라 요금이고 사용량은 Google AI Studio에서 본다(계획 리뷰 R6-2)
				text:
					provider === "gemini"
						? "처리 여부를 확인하지 못했어요. 요금이 들었을 수 있으니 Google AI Studio 사용량을 확인한 뒤 다시 눌러 주세요."
						: "처리 여부를 확인하지 못했어요. 크레딧이 쓰였을 수 있으니 음성 서비스 사용 기록을 확인한 뒤 다시 눌러 주세요.",
				connections: false,
			};
		case "in_progress":
			return {
				text: "다른 문장을 만드는 중이에요. 끝난 뒤 다시 눌러 주세요.",
				connections: false,
			};
		case "free_ended":
			return {
				text: "Fish Audio 무료 모델 기간이 끝났어요. 유료 모델로 바꿔 들어 보세요.",
				connections: false,
			};
		case "request_mismatch":
			return { text: "다시 눌러 주세요", connections: false };
		case "storage":
			return {
				text: "지금은 내 문장을 들을 수 없어요. 기본 샘플은 들을 수 있어요.",
				connections: false,
			};
		default:
			return {
				text: "내 문장을 듣지 못했어요. 잠시 뒤 다시 눌러 주세요.",
				connections: false,
			};
	}
}
// T5 기본 실패 문구(trialProblemText의 그 밖 사유). 맥락이 다른 화면(드라마 읽기·자동 태그)이 이 문구만 바꾼다
export const trialFallback = (provider: ProviderId) =>
	trialProblemText(provider, {
		reason: "unexpected",
		retryAt: null,
		providerCode: null,
	}).text;
