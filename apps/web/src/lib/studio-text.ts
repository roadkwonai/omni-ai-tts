// apps/web/src/lib/studio-text.ts
import { ACTING, type ActingFamily } from "@tts-pilot-app/api/drama-acting";
import type { ProviderId } from "@tts-pilot-app/api/providers/contract";
import {
	DEFAULT_SETTINGS,
	GEMINI_CHARS_PER_SECOND,
	GEMINI_TOKENS_PER_SECOND,
	type GeminiModel,
	geminiUsdPerMillion,
	PARAGRAPHS_MAX,
	type TrialRequest,
	type Usage,
	usedSettings,
} from "@tts-pilot-app/api/providers/trial-options";

import { PROVIDER_LABEL } from "./connection-view";
import type { CheckReason, ReadingKind } from "./number-reading";
import {
	type ParagraphBlock,
	SPEAKERS_MAX,
	type VoiceSetup,
} from "./paragraph-script";
import { TAG_TEXT, type TagGroup } from "./tag-view";
import {
	optionText,
	type TrialProblem,
	trialProblemText,
	usageText,
} from "./trial-view";
import { plain, retryTime } from "./voice-view";

// 문단 작업실(T10)의 화면 문구. 정본은 브리프 docs/briefs/studio.md 9절(상태 이름은 6절)이다.
// 숫자와 이름 뒤에 받침 따라 바뀌는 조사를 붙이지 않는다. 문장은 마침표, 한 줄 상태는 마침표 없이. 크레딧이 쓰였을 수 있으면 "다시 해 주세요"라고 하지 않는다

const n = (value: number) => plain.format(value);
const FREE_TAIL = "· 무료";
// 예상 길이(작업 요약·요약 칩): 1분 미만은 초, 그 위는 반올림한 분
const aboutLength = (seconds: number) =>
	seconds < 60 ? `약 ${n(seconds)}초` : `약 ${n(Math.round(seconds / 60))}분`;
const savedFree = (count: number) => `저장된 결과 ${n(count)}개는 크레딧 0`;
// Gemini 유료 등급 1분 단가(달러 소수 넷째 자리, usageBasis와 같은 셈: 1초 25토큰 × 100만 토큰당 단가)
const usd4 = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 4,
	maximumFractionDigits: 4,
});
// 자동 태그 확인 창 금액(달러 소수 둘)
const usd2 = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 2,
});
const geminiPerMinute = (model: GeminiModel, now: number) =>
	usd4.format(
		(60 * GEMINI_TOKENS_PER_SECOND * geminiUsdPerMillion(model, now)) /
			1_000_000,
	);

// 작업실 알림 공통 문구. closeModalFirst: 창이 열린 채 알림의 이동 행동(…번 줄로·무대로 등)을 눌렀을 때의 안내(MG-11, modal-action)
export const TOAST_TEXT = {
	closeModalFirst: "창을 닫은 뒤 다시 눌러요",
};

export const PARAGRAPH_TEXT = {
	description:
		"대본을 문단으로 나눠 다섯 서비스의 성우로 음성을 만들고, 한 파일·문단별 파일·자막으로 받아요",
	paragraphN: (no: number) => `문단 ${n(no)}`,
	// 레일 소제목
	defaultVoice: "기본 성우",
	gap: "문단 뒤 쉼",
	script: "대본",
	shortcuts: "단축키",
	summary: "작업 요약",
	estimate: "새로 만들 문단 예상 사용량",
	// 작업 설정 aside 이름(작업 요약 aside는 summary를 쓴다)
	settingsLabel: "작업 설정",
	// 건너뛰기 링크
	toList: "문단 목록으로",
	toBar: "만들기와 받기로",
	placeholder: "대본을 써 주세요. 긴 대본은 ‘대본 붙여 넣기’로 한 번에 넣어요.",
	// 주 버튼
	// 모두 무료면 '· 무료' 꼬리(막대는 꼬리를 줄지 않는 조각으로 따로 그린다, MG-03)
	makeAll: (count: number, free: boolean) =>
		`전체 만들기 · ${n(count)}개${free ? ` ${FREE_TAIL}` : ""}`,
	makeRest: (count: number, free: boolean) =>
		`이어서 만들기 · ${n(count)}개${free ? ` ${FREE_TAIL}` : ""}`,
	freeTail: FREE_TAIL,
	// 잠긴 주 버튼(만들 수를 모를 때·막혔을 때)은 개수 없이
	makeAllPlain: "전체 만들기",
	makeRestPlain: "이어서 만들기",
	stop: "멈추기",
	receive: "받기",
	// 카드
	make: "만들기",
	// 카드 '만들기' 접근 이름. 보이는 글(무료면 '무료' 배지까지)을 그대로 담는다(2.5.3)
	makeOf: (no: number, free = false) =>
		`문단 ${n(no)} 만들기${free ? " 무료" : ""}`,
	free: "무료",
	listen: (no: number) => `문단 ${n(no)} 듣기`,
	followDefault: "기본 따르기",
	// 문단이 화자 성우를 따를 때의 같은 단추(브리프 16.5)
	followSpeaker: "화자 따르기",
	reset: "처음 값으로",
	checking: "확인 중",
	afterMakeAll: "전체 만들기가 끝난 뒤 만들 수 있어요",
	// 카드 단추·칸의 접근 이름에는 문단 번호를 넣는다(200장에서 같은 이름이 줄지 않게). 툴팁은 번호 없이
	scriptOf: (no: number) => `문단 ${n(no)} 대본`,
	count: (count: number, max: number) => `${n(count)} / ${n(max)}자`,
	settingsOf: (no: number) => `문단 ${n(no)} 설정`,
	menu: "문단 메뉴",
	menuOf: (no: number) => `문단 ${n(no)} 메뉴`,
	// 실패 상태 칸의 짧은 글(failShortOf의 나머지 갈래). 전체 이유는 머리줄 아래 한 줄이 말한다
	failed: "만들지 못했어요",
	// 성우 단추 접근 이름(200장에서 가르게 문단 번호를 넣는다). 목록 전이면 이름 없이
	voiceLabel: (
		no: number,
		name: string | null,
		provider: ProviderId,
		follows: boolean,
		// 따르는 성우가 화자 것이면 그 화자 이름
		speaker: string | null = null,
	) =>
		`문단 ${n(no)} 성우: ${name ? `${name}, ` : ""}${PROVIDER_LABEL[provider]}${follows ? (speaker ? `, 화자 ${speaker}의 성우를 따름` : ", 기본을 따름") : ""}`,
	pickVoiceOf: (no: number) => `문단 ${n(no)} 성우 고르기`,
	notSaved: "보관함에 없는 성우",
	voicesLoading: "성우 목록을 불러오고 있어요",
	// 차이 칩(브리프 5.4). 넷째 자리는 남은 칩 수
	chipAction: (chip: string) => `${chip} 바꾸기`,
	moreChips: (count: number) => `+${n(count)}`,
	moreChipsLabel: (count: number) => `+${n(count)} 바꾼 설정 더 보기`,
	// ⋯ 메뉴(브리프 5.4)와 꺼진 항목의 둘째 줄
	moveUp: "위로",
	moveDown: "아래로",
	insertBelow: "아래에 문단 추가",
	splitHere: "여기서 나누기",
	mergePrev: "앞 문단과 합치기",
	mergeNextItem: "다음 문단과 합치기",
	remove: "지우기",
	firstOne: "첫 문단이에요",
	lastOne: "마지막 문단이에요",
	// 가름선(브리프 5.5, 드라마 LineGap 문구 모양). 설명은 목록에 하나 둔다
	gapName: (no: number) => `문단 ${n(no)} 뒤 쉼(초)`,
	gapReset: "기본으로",
	gapResetOf: (no: number) => `기본으로, 문단 ${n(no)} 뒤 쉼`,
	gapLineHelp: (seconds: string) =>
		`0~5초, 0.1초 단위. 비우면 기본 ${seconds}초`,
	// 카드 상태(브리프 6.2)
	empty: "빈 문단 · 만들지 않아요",
	making: (seconds: number) => `만드는 중 · ${n(seconds)}초`,
	made: "만듦",
	unknown: "처리 여부 미확인",
	// 이동
	show: (no: number) => `문단 ${n(no)} 보기`,
	// 요약 링크(MG-02): 숫자는 개수가 아니라 첫 문단 번호라 'N번부터'
	showStopped: (no: number) => `멈춘 문단 보기 · ${n(no)}번부터`,
	showBlocked: (no: number) => `막힌 문단 보기 · ${n(no)}번부터`,
	showUnmade: (no: number) => `안 만든 문단 보기 · ${n(no)}번부터`,
	jumpLabel: "문단 번호",
	jump: "이동",
	jumpRange: (total: number) => `1~${n(total)} 사이 번호를 넣어 주세요`,
	// 문단 번호 칸의 범위 안내(placeholder)
	jumpPlaceholder: (total: number) => `1~${n(total)}`,
	// 작업 설정(브리프 5.3). 단축키 네 줄은 8절
	pickDefaultVoice: "기본 성우 고르기",
	defaultSettings: "기본 성우 설정",
	gapUnit: "초",
	gapHelp: "0~5초, 0.1초 단위. 한 파일로 받을 때 문단 사이에 넣어요",
	shortcutLines: [
		{ key: "↑ ↓", note: "대본 칸 맨 앞·맨 끝에서 앞뒤 문단으로 가요" },
		{ key: "Alt+Enter", note: "커서에서 문단을 나눠요(macOS Option+Enter)" },
		{
			key: "Backspace",
			note: "맨 앞에서 앞 문단과 합쳐요. 두 문단의 성우와 설정이 같을 때만이에요.",
		},
		// sonner 알림 목록 단축키(Toaster hotkey 기본값 altKey+KeyT). 창이 열려 있어도 닿는다(MG-11)
		{
			key: "Alt+T",
			note: "알림으로 포커스를 옮겨요. Tab으로 '되돌리기' 같은 버튼에 닿아요(macOS Option+T).",
		},
	],
	// 작업 요약(브리프 5.6). 예상 길이는 1초 5자 추정
	madeLabel: "만든 문단",
	madeOf: (made: number, total: number) => `${n(made)} / ${n(total)}`,
	lengthLabel: "예상 길이",
	estimated: "추정",
	charsLabel: "글자",
	chars: (count: number) => `${n(count)}자`,
	emptyExcluded: (count: number) => `빈 문단 ${n(count)}개 제외`,
	// 예상 사용량 아래(막힌 문단은 빼고 센다), 셀 문단이 없고 기본 성우도 없을 때
	blockedExcluded: (count: number) => `막힌 문단 ${n(count)}개 제외`,
	estimateNeedsVoice: "성우를 고르면 셈해요",
	none: "—",
	aboutLength,
	// 사용량 줄 공급자 이름 뒤. 이름은 화면이 translate="no"로 앞에 붙인다. usage가 null이면(무료) 금액 없이 화면이 '무료' 배지를 붙인다.
	// 아래 usageNote가 추정이라 Gemini 금액 앞 '추정'은 뺀다
	usageRow: (count: number, usage: Usage | null) =>
		`${n(count)}개${usage ? ` · ${usageText(usage).replace(/^추정 /, "")}` : ""}`,
	usageNote:
		"추정이에요. 실제 사용량은 음성 서비스의 사용 기록에서 확인해 주세요.",
	// 1단·2단 막대 요약 칩(3단은 요약 레일), 머리 오른쪽 끝(3단·2단)은 headerCount
	summaryChip: (made: number, total: number, seconds: number) =>
		`${n(made)}/${n(total)} · ${aboutLength(seconds)}`,
	// 칩의 접근 이름 끝. 멈춘 문단이나 막힌 문단이 있을 때만 붙고 칩에 경고 점이 함께 보인다
	summaryChipCheck: "확인할 문단 있음",
	headerCount: (paragraphs: number, chars: number) =>
		`문단 ${n(paragraphs)} · ${n(chars)}자`,
	// 막대(브리프 4·5.7). 한 줄 칸의 공급자별 금액, 결과 칸 안내와 플레이어 캡션
	barLabel: "만들기와 받기",
	waitNote: "음성 서비스 응답을 기다리고 있어요. 다시 누르지 않아도 돼요.",
	freeLine: "Fish Audio 무료 모델이라 확인 없이 만들어요",
	pasteHint: "대본을 붙여 넣으면 문단으로 나눠요",
	allMadeHint: "모든 문단을 만들었어요",
	resultHint: "문단을 만들면 여기서 들을 수 있어요",
	listenHint: "문단의 듣기를 누르면 여기서 들려요",
	listenCaption: (no: number, name: string, text: string) => {
		const chars = [...text.replace(/\s+/g, " ").trim()];
		return `문단 ${n(no)} · ${name} · ${chars.slice(0, 20).join("")}${chars.length > 20 ? "…" : ""}`;
	},
	joinCaption: (seconds: number) => {
		const total = Math.round(seconds);
		const m = Math.floor(total / 60);
		return `이어 듣기 · ${m > 0 ? `${n(m)}분 ` : ""}${n(total % 60)}초`;
	},
	// 성우 고르기 창 머리 설명(브리프 5.8)
	pickForDefault: "기본 성우를 골라요",
	pickForParagraph: (no: number) => `문단 ${n(no)}의 성우를 골라요`,
	// 임시 작업을 읽으며 보관함에 없는 성우를 비웠다(알림, F30-2). 문단 성우만 비우면 그 문단은 기본 성우를 따른다
	// 화자 성우(speakers)는 화자 이름은 남고 성우만 비운다. 그 화자의 문단은 기본 성우를 따른다
	voicesDropped: (defaultVoice: boolean, paragraphs: number, speakers = 0) => {
		if (!defaultVoice && paragraphs === 0 && speakers > 0)
			return `보관함에 없는 화자 성우 ${n(speakers)}개를 비웠어요. 그 화자의 문단은 기본 성우를 따라요.`;
		const base = !defaultVoice
			? `보관함에 없는 성우를 쓰던 문단 ${n(paragraphs)}개는 기본 성우를 따라요`
			: `${paragraphs > 0 ? `기본 성우와 문단 ${n(paragraphs)}개의 성우가` : "기본 성우가"} 보관함에 없어 비웠어요. 기본 성우를 다시 골라 주세요`;
		if (speakers > 0)
			return `${base}. 화자 성우 ${n(speakers)}개도 보관함에 없어 비웠어요.`;
		return defaultVoice ? `${base}.` : base;
	},
	// 확인 중·불러오기
	finding: "저장된 결과를 확인하고 있어요",
	voicesFailed: "성우 목록을 불러오지 못했어요",
	reload: "다시 불러오기",
	findFailed: "저장된 결과를 확인하지 못했어요",
	refind: "다시 확인",
	// 막는 이유. 막대는 blockedAt으로 문단 번호를 붙이고 카드는 그대로(길이는 tooLongShort)
	blockedAt: (no: number, reason: string) => `문단 ${n(no)}: ${reason}`,
	noVoice: "성우를 골라 주세요",
	// 원문 UTF-16만 상한 × 4를 넘으면 정리 뒤 글자는 상한 안이다(tooLongOf). 그때는 지금 글자 수를 보이지 않는다
	tooLong: (length: number, max: number) =>
		`${n(max)}자 이하로 줄여 주세요${length > max ? ` (지금 ${n(length)}자)` : ""}`,
	tooLongShort: (max: number) => `${n(max)}자를 넘었어요`,
	unavailable: "이 성우는 지금 쓸 수 없어요",
	nothingToMake: "만들 문단이 없어요",
	retryAfter: (iso: string) =>
		`요청 한도에 걸렸어요 · ${retryTime(iso)} 이후에 이어서 만들 수 있어요`,
	// 시작하지 않음
	nothingNew: "새로 만들 문단이 없어요",
	notStarted:
		"저장된 결과를 확인하지 못해 시작하지 않았어요. 다시 눌러 주세요.",
	// 멈춤
	stoppedAt: (no: number, reason: string) =>
		`문단 ${n(no)}에서 멈췄어요 · ${reason}`,
	stoppedLeft: (count: number) => `멈췄어요 · 남은 문단 ${n(count)}개`,
	stopping: "지금 문단이 끝나면 멈춰요",
	inProgress: "다른 음성을 만드는 중이에요. 끝난 뒤 이어서 만들어 주세요.",
	voiceRejected:
		"이 성우는 보관함에 없거나 ‘현재 이용 불가’ 상태예요. 성우를 다시 골라 주세요.",
	editedSkipped: (count: number) =>
		`만드는 동안 고친 문단 ${n(count)}개는 만들지 않았어요`,
	// 미확인
	// Gemini는 크레딧이 아니라 요금이고 사용량은 Google AI Studio에서 본다(T5 계획 리뷰 R6-2, 브리프 9절보다 우선)
	unknownOutcome: (provider: ProviderId) =>
		provider === "gemini"
			? "처리 여부를 확인하지 못했어요. 요금이 들었을 수 있으니 Google AI Studio 사용량을 확인한 뒤 이어서 만들어 주세요."
			: `처리 여부를 확인하지 못했어요. 크레딧이 쓰였을 수 있으니 ${PROVIDER_LABEL[provider]} 사용 기록을 확인한 뒤 이어서 만들어 주세요.`,
	// 받기
	receiveWav: "한 파일로 받기 (WAV)",
	receiveZip: "문단마다 받기 (zip)",
	receiveSrt: "자막 받기 (SRT)",
	playAll: "이어 듣기",
	// 받기 메뉴 항목 둘째 줄(브리프 5.7)
	receiveWavNote: "문단 사이 쉼을 넣어 이어요",
	receiveZipNote: (count: number) =>
		count > 0 ? `번호순 파일 ${n(count)}개` : "번호순 파일",
	receiveSrtNote: "한 파일과 시각이 맞아요",
	unmadeLeft: (count: number) => `만들지 않은 문단이 ${n(count)}개 있어요`,
	nothingToReceive: "받을 문단이 없어요",
	receiveFree: "받기는 크레딧 0",
	receivingAt: (at: number, total: number) =>
		`${n(total)}개 중 ${n(at)}번째 받는 중`,
	joining: "한 파일로 잇는 중",
	cantStop: "받는 중에는 멈출 수 없어요",
	joinFailed: "한 파일로 잇지 못했어요. 문단마다 받기는 쓸 수 있어요.",
	// 조각 받기 실패(T9 receiveFailed의 '이전 결과'는 이 화면에 없다). 공급자마다 크레딧·요금이 달라 '비용'
	receiveFailed:
		"결과를 받지 못했어요. 잠시 뒤 다시 받아 주세요. 다시 받아도 비용은 들지 않아요.",
	// 붙여 넣기
	paste: "대본 붙여 넣기",
	replaceAll: "전체 바꾸기",
	append: "이어 넣기",
	// '전체 바꾸기' 미리 보기 위 경고. own은 성우나 설정을 따로 바꾼 문단 수(p.voice)
	replaceWarning: (count: number, own: number) =>
		`지금 문단 ${n(count)}개를 모두 바꿔요${own > 0 ? ` · 성우나 설정을 바꾼 문단 ${n(own)}개도 사라져요` : ""}`,
	splitsInto: (count: number) => `문단 ${n(count)}개로 나뉘어요`,
	// 미리 보기에서 찾은 화자(`참고:` 같은 줄이 화자로 읽혔는지 넣기 전에 본다). 둘까지 이름을 적고 나머지는 수로
	// (화면은 이름마다 화자 표식을 붙여 그린다)
	pasteSpeakersHead: (count: number) => `화자 ${n(count)}명:`,
	pasteSpeakersShown: (names: readonly string[]) =>
		names.length > 3 ? names.slice(0, 2) : names,
	pasteSpeakersMore: (names: readonly string[]) =>
		names.length > 3 ? `외 ${n(names.length - 2)}명` : null,
	// 화자 상한(20명)을 넘어 붙여 넣지 않는다. idle은 문단이 없어 지울 수 있는 화자 수(0이면 앞 문장만)
	speakersMax: (idle: number) =>
		`화자는 ${n(SPEAKERS_MAX)}명까지예요${idle > 0 ? `. 문단이 없는 화자 ${n(idle)}명을 지우면 넣을 수 있어요` : ""}`,
	// 화자 칸(레일 '작업 설정'·1단 시트, 브리프 16.1). 소제목 '화자' 옆 회색 'N명', 1단 작업 띠 단추는 '화자 N명'
	speakers: "화자",
	speakersCount: (count: number) => `${n(count)}명`,
	speakersBand: (count: number) => `화자 ${n(count)}명`,
	speakerParagraphs: (count: number) => `문단 ${n(count)}`,
	speakerFollowsDefault: "기본 성우 따름",
	speakerRemove: "화자 지우기",
	speakerRemoveOf: (name: string) => `화자 지우기, ${name}`,
	// 화자 칸 성우 버튼 접근 이름. current는 '성우 · 공급자' 또는 '기본 성우 따름'
	speakerVoiceOf: (name: string, current: string) =>
		`화자 ${name} 성우: ${current}`,
	// 성우 목록을 받는 중이라 이름이 없어도 구분점으로 시작하지 않는다
	speakerVoiceNow: (name: string | null, provider: string) =>
		name ? `${name} · ${provider}` : provider,
	speakerBusy: (count: number) => `문단 ${n(count)}개가 이 화자예요`,
	// 화자 지우기 되돌리기 알림(뒤에 undo)과 성우 없는 화자 줄의 회색 안내
	speakerRemoved: (name: string) => `화자를 지웠어요 · ${name}`,
	speakerPicksFollow: (count: number) =>
		`고르면 이 화자 문단 ${n(count)}개가 함께 따라요`,
	// 성우 고르기 창 대상과 '비우기'
	pickForSpeaker: (name: string) => `화자 ${name}의 성우를 골라요`,
	pickForSelection: (count: number) =>
		`고른 문단 ${n(count)}개의 성우를 골라요`,
	clearVoice: "비우기(기본 성우 따름)",
	// 카드(⋯ 메뉴 하위 항목, 고르기 체크, 이어 듣기 표식)
	speaker: "화자",
	noSpeaker: "화자 없음",
	pickOf: (no: number) => `문단 ${n(no)} 고르기`,
	playing: "듣는 중",
	// 고르기 막대(브리프 16.2)
	select: "고르기",
	selectAll: "모두 고르기",
	selectedOf: (count: number, total: number) =>
		`${n(count)}/${n(total)}개 고름`,
	selectVoice: "성우",
	selectGap: "쉼",
	selectFollow: "따르기",
	selectNone: "문단을 골라 주세요",
	selectLocked: "전체 만들기가 끝난 뒤 바꿀 수 있어요",
	selectEnd: "끝내기",
	selectBarLabel: "고른 문단 고치기",
	batchGapTitle: (count: number) => `고른 문단 ${n(count)}개의 문단 뒤 쉼`,
	apply: "적용",
	// 되돌리기 알림(브리프 16.5, 뒤에 undo)
	batchVoiceDone: (count: number) => `문단 ${n(count)}개의 성우를 바꿨어요`,
	batchFollowDone: (count: number) =>
		`문단 ${n(count)}개가 성우를 따르게 했어요`,
	batchSpeakerDone: (count: number) => `문단 ${n(count)}개의 화자를 바꿨어요`,
	batchGapDone: (count: number) => `문단 ${n(count)}개의 쉼을 바꿨어요`,
	batchRemoveDone: (count: number) => `문단 ${n(count)}개를 지웠어요`,
	// 이어 듣기 강조(브리프 16.3). '마지막 문단이에요'는 lastOne
	prevParagraph: "이전 문단",
	nextParagraph: "다음 문단",
	playingAt: (no: number) => `문단 ${n(no)} 재생 중`,
	// 카드에 화자 한 줄을 붙여 넣어 화자만 정했다
	speakerSet: (name: string) => `화자를 정했어요 · ${name}`,
	overLimit: (extra: number) =>
		`${n(PARAGRAPHS_MAX)}개까지만 넣어요. 나머지 ${n(extra)}개는 넣지 않아요.`,
	insert: "넣기",
	// 붙여 넣기 창(브리프 5.8)
	pasteDescription: (max: number) =>
		`빈 줄을 기준으로 문단을 나눠요. ${n(max)}자를 넘는 덩어리는 문장 끝에서 더 나눠요.`,
	pasteLabel: "붙여 넣을 대본",
	pasteMode: "넣는 방식",
	splitLonger: (count: number) => ` (긴 덩어리 ${n(count)}개를 더 나눴어요)`,
	pasteEmpty: "대본을 붙여 넣어 주세요",
	cancel: "취소",
	inserted: (count: number, extra: number) =>
		`문단 ${n(count)}개를 넣었어요${extra > 0 ? `. 나머지 ${n(extra)}개는 넣지 않았어요.` : ""}`,
	// 되돌리기 알림
	removed: "문단을 지웠어요",
	merged: "문단을 합쳤어요",
	split: "문단을 나눴어요",
	// 카드에 붙여 넣어 나눔. 200개를 넘으면 나머지를 알린다(스펙 3절 상한)
	// 200개라 나누지 못하고 첫 덩어리만 지금 문단에 넣었다
	pasteFull: (extra: number) =>
		`문단은 ${n(PARAGRAPHS_MAX)}개까지예요. ${n(extra)}개는 넣지 않았어요.`,
	splitInto: (count: number, extra = 0) =>
		`문단 ${n(count)}개로 나눴어요${extra > 0 ? `. 나머지 ${n(extra)}개는 넣지 않았어요.` : ""}`,
	undo: "되돌리기",
	// 합치기 메뉴 둘째 줄
	mergeNote: "앞 문단의 성우와 설정을 써요",
	// 화면 상태(브리프 6.1)
	noVoices: "담은 성우가 없어요",
	toCasting: "성우 캐스팅에서 담기",
	paragraphsMax: `문단은 ${n(PARAGRAPHS_MAX)}개까지예요`,
	// 확인 창
	confirmCredit: (count: number) =>
		`크레딧을 써서 문단 ${n(count)}개를 만들까요?`,
	confirmCost: (count: number) => `비용이 드는 문단 ${n(count)}개를 만들까요?`,
	savedFree,
	confirmNew: "새로 만들 문단",
	confirmCount: (count: number, reused: number) =>
		`${n(count)}개${reused > 0 ? ` (${savedFree(reused)})` : ""}`,
	// Airy 줄의 요율 근거(usageBasis, '스펙과 다른 점' 19). T5 확인 창과 같은 모양
	airyBasis: (basis: string) => `(Airy 요금 기준: ${basis})`,
	// Gemini 줄의 근거. 문단마다 다른 초 수는 빼고 모델별 1분 단가와 말 빠르기 가정만(usageBasis와 같은 표현). 모델이 둘이면 이름을 붙인다
	geminiBasis: (models: readonly GeminiModel[], now: number) =>
		`(Gemini 요금 기준: 유료 등급 1분 ${
			models.length === 1
				? geminiPerMinute(models[0], now)
				: models
						.map((model) => `${model} ${geminiPerMinute(model, now)}`)
						.join(", ")
		} · 1초에 ${GEMINI_CHARS_PER_SECOND}글자로 계산)`,
	// 모두 무료인데 미확인 문단이 있어 창이 뜬다('스펙과 다른 점' 22). 크레딧·비용 말 없이 사실만
	confirmFree: (count: number) => `문단 ${n(count)}개를 만들까요?`,
	unknownFree:
		"처리 여부를 확인하지 못한 문단이 있어요. 다시 만들어도 무료예요.",
	// T5 TrialConfirm과 같은 판정(typecastOverdrawn)·문구
	typecastOverdrawn:
		"남은 플랜 크레딧이 없어요. 플랜에 따라 추가 청구될 수 있어요.",
	// T9 unknownRetry. Gemini가 들면 크레딧이 아니라 요금이라 '비용'(제목 두 갈래와 같다)
	unknownRetry: (cost: boolean) =>
		`같은 대본·성우·설정의 앞 요청은 처리 여부를 아직 몰라요. 다시 만들면 ${cost ? "비용이 한 번 더 들" : "크레딧이 한 번 더 쓰일"} 수 있어요.`,
	makeCredit: "크레딧 쓰고 만들기",
	makeCost: "비용 내고 만들기",
	rateUnknown: "배율을 확인하지 못했어요",
	// 진행: 큐 순번과 문단 번호를 나눈다('스펙과 다른 점' 28)
	progress: (at: number, total: number, no: number, seconds: number) =>
		`${n(total)}개 중 ${n(at)}번째 · 문단 ${n(no)} · ${n(seconds)}초`,
	started: (count: number) => `문단 ${n(count)}개를 만들기 시작했어요`,
	stopped: "멈췄어요",
	// 끝(알림)
	done: (count: number) => `문단 ${n(count)}개를 만들었어요`,
	// 태그 도구줄과 자동 태그(브리프 15.3). 알약·메뉴 알약 글은 두 작업실 공용 TAG_TEXT(tag-view)이고,
	// 자동 태그 실패 문구는 아래 PARAGRAPH_AUTO_TAG_TEXT를 tag-view autoTagProblemText에 넘긴다
	tagToolbarName: (no: number) => `문단 ${n(no)} 태그`,
	tagsEmotionNote: "이 성우는 대본 태그를 읽지 않아요. 감정은 설정에서 바꿔요.",
	tagsStyleNote: "이 성우는 대본 태그를 읽지 않아요. 말투는 설정에서 바꿔요.",
	tagsModelNote:
		"이 모델은 대본 태그를 읽지 않아요. 태그는 Eleven v3·v4에서 써요.",
	tagsToSettings: "설정에서 바꾸기",
	// 도구줄 메뉴 머리(문단은 분위기도 대본 커서 자리에 [값]으로 넣는다)
	tagSoundGroup: "소리 · 커서 위치에",
	tagMoodGroup: "분위기 · 커서 위치에",
	// 주어는 성우, ElevenLabs v2·flash(elevenlabs_plain)는 모델이다
	unsentNote: (count: number, model: boolean) =>
		`이 ${model ? "모델이" : "성우가"} 읽지 않는 태그 ${n(count)}개는 빼고 보내요`,
	unsentEmpty: "태그를 빼면 보낼 글이 없어요",
	autoTag: "자동 태그",
	autoTagName: "자동 태그 추천, 비용 발생",
	// 버튼이 잠긴 이유(429 대기 시각이 1순위, 확인 창 실패 줄의 대기 시각과 같은 문구)
	autoTagRetryAt: (iso: string) =>
		`${retryTime(iso)} 이후에 다시 추천받을 수 있어요`,
	autoTagNone: "태그를 읽는 성우의 문단이 없어요",
	autoTagBusy: "전체 만들기가 끝난 뒤 추천받을 수 있어요",
	// 확인 창 본문 세 줄(횟수, 금액, 회색 안내). 한 번은 OpenAI(실패하면 Gemini) 텍스트 호출 1회(약 $0.01)다
	autoTagTitle: "대본을 보내 태그를 추천받을까요?",
	autoTagCount: (paragraphs: number, calls: number) =>
		calls === 1
			? `문단 ${n(paragraphs)}개를 한 번에 보내요`
			: `문단 ${n(paragraphs)}개를 ${n(calls)}번에 나눠 보내요`,
	autoTagCost: (calls: number) =>
		calls === 1
			? `약 ${usd2.format(0.01)}`
			: `한 번에 약 ${usd2.format(0.01)}, 모두 약 ${usd2.format(calls / 100)}`,
	// 앞글·모델 코드명·뒷글. 모델 코드명만 번역하지 않는다(translate="no", audit P3)
	autoTagModelNote: [
		"OpenAI 텍스트 모델(",
		"gpt-6-luna",
		")을 써요. 3번 실패하면 Gemini(",
		"gemini-3.8-flash",
		")로 보내요. Gemini 키가 무료 등급이면 Google이 대본을 학습에 쓸 수 있어요.",
	],
	autoTagGo: "추천받기",
	// 창을 연 뒤 보낼 문단·횟수가 늘었을 때. 보내지 않고 새 수를 보인다(승인한 횟수보다 많이 보내지 않는다, security low 1)
	autoTagRecount:
		"보낼 문단이 바뀌었어요. 바뀐 수를 확인하고 다시 눌러 주세요.",
	autoTagProgress: (done: number, total: number) =>
		`추천받는 중 ${n(done)}/${n(total)}`,
	// '멈추기'를 누른 뒤 지금 호출이 끝날 때까지 그 단추 글
	autoTagStopping: "멈추는 중",
	// 미리 보기 창
	autoTagPreviewTitle: "자동 태그 추천",
	autoTagNothing: "추천할 태그가 없어요",
	autoTagSkipped: (count: number) =>
		`태그를 받지 않는 문단 ${n(count)}개는 그대로 둬요`,
	autoTagStoppedAt: (no: number, reason: string) =>
		`문단 ${n(no)}부터 멈췄어요 · ${reason}`,
	autoTagNotSent: (no: number) => `문단 ${n(no)}부터는 보내지 않았어요`,
	autoTagMadeNote: "만든 결과가 있어요. 바꾸면 다시 만들어야 해요.",
	autoTagUnknownNote:
		"처리 여부를 확인하지 못한 문단이에요. 바꾸면 다시 만들어야 해요.",
	// 기본 성우인지 화자 성우인지 가리지 않는다(브리프 16.5)
	autoTagOwnNote: (count: number) =>
		`감정·말투를 바꾼 문단 ${n(count)}개는 이제 자기 성우와 설정을 써요`,
	// 바뀐 칸 이름(AutoTagChange fields의 field)과 전·후의 화면 밖 이름표(줄 긋기는 읽히지 않는다)
	autoTagFields: {
		text: "대본",
		emotion: "감정",
		style: "말투",
		direction: "말투 지시",
	},
	autoTagBefore: "전",
	autoTagAfter: "후",
	// '대본' 칸의 새로 넣은 태그(mark) 앞 화면 밖 이름표
	autoTagNewTag: "새 태그",
	autoTagChoose: (no: number) => `문단 ${n(no)} 바꾸기`,
	close: "닫기",
	autoTagApplyN: (count: number) => `고른 문단 바꾸기 (${n(count)})`,
	// 바꾼 뒤 알림(뒤에 되돌리기 undo)
	autoTagApplied: (count: number) => `문단 ${n(count)}개를 바꿨어요`,
	autoTagChanged: (count: number) =>
		`보낸 뒤 고친 문단 ${n(count)}개는 건너뛰었어요`,
} as const;

// 미확인 한 줄이 다시 받는 창(6분)을 지났을 때(unknownNoteOf의 expired). 그 공급자 사용 기록을 가리킨다(E5)
export const unknownExpiredOf = (provider: ProviderId) =>
	provider === "gemini"
		? "확인 시간이 지났어요. 요금 발생 여부는 Google AI Studio 사용량에서 확인해 주세요."
		: `확인 시간이 지났어요. 크레딧 사용 여부는 ${PROVIDER_LABEL[provider]} 사용 기록에서 확인해 주세요.`;

// 생성 실패 한 줄(E5, 브리프 9절). 카드·막대가 함께 쓴다. 이 화면 문구가 따로 있는 사유만 여기서, 나머지는 그 공급자의 T5 문구다
export function makeProblemText(
	provider: ProviderId,
	problem: TrialProblem,
): { text: string; connections: boolean } {
	switch (problem.reason) {
		case "unknown_outcome":
			return {
				text: PARAGRAPH_TEXT.unknownOutcome(provider),
				connections: false,
			};
		case "in_progress":
			return { text: PARAGRAPH_TEXT.inProgress, connections: false };
		case "rate_limit":
			if (problem.retryAt)
				return {
					text: PARAGRAPH_TEXT.retryAfter(problem.retryAt),
					connections: false,
				};
			break;
		case "voice_unavailable":
			return { text: PARAGRAPH_TEXT.voiceRejected, connections: false };
		case "storage":
			return {
				text: "지금은 음성을 만들 수 없어요. 잠시 뒤 다시 해 주세요.",
				connections: false,
			};
		case "provider_input":
			// 속도 칸이 있는 공급자만 속도를 말한다(Airy·Gemini는 없다)
			if (problem.providerCode === "audio_too_large")
				return {
					text: `결과 오디오가 너무 커요. ${
						provider === "gemini"
							? "대본을 줄이거나 말투 지시를 바꿔 주세요"
							: provider === "airy"
								? "대본을 줄여 주세요"
								: "대본을 줄이거나 속도를 올려 주세요"
					}`,
					connections: false,
				};
			break;
		case "unexpected":
			return {
				text: "음성을 만들지 못했어요. 잠시 뒤 다시 해 주세요.",
				connections: false,
			};
	}
	return trialProblemText(provider, problem);
}

// 문단 자동 태그 실패 한 줄의 문구 표(tag-view autoTagProblemText, 브리프 15.3, critique P2). '추천'으로 통일하고 비용이 들었을 수 있으면 다시 하라고 하지 않는다.
// 키·계정·한도 등은 T5 Gemini 문구, 그 문구가 공통 대체 문구면 failed다
export const PARAGRAPH_AUTO_TAG_TEXT = {
	reply: "추천 답을 읽지 못했어요. 비용이 들었을 수 있어요.",
	retryAt: PARAGRAPH_TEXT.autoTagRetryAt,
	failed: "추천을 받지 못했어요. 잠시 뒤 다시 해 주세요.",
	unknown: "추천 답을 받지 못했어요. 비용이 들었을 수 있어요.",
} as const;

// 막는 이유 한 줄(브리프 9절). 막대(short false)는 blockedAt으로 번호를 붙이고 길이는 지금 글자 수까지, 카드(short)는 길이를 짧게.
// 빈 문단은 막대만 말한다(makePlan은 빈 문단을 막힘으로 세지 않고, 카드는 빈 문단에 이유를 두지 않는다)
export function blockText(block: ParagraphBlock, short: boolean): string {
	if (block === "empty") return PARAGRAPH_TEXT.nothingToMake;
	if (block === "no_voice") return PARAGRAPH_TEXT.noVoice;
	if (block === "unavailable") return PARAGRAPH_TEXT.unavailable;
	return short
		? PARAGRAPH_TEXT.tooLongShort(block.max)
		: PARAGRAPH_TEXT.tooLong(block.length, block.max);
}

// 실패 상태 칸의 짧은 이유(브리프 6.2 "경고색 TriangleAlert + 짧은 이유"). 한 줄 상태라 마침표가 없다. 그 밖은 '만들지 못했어요'
export function failShortOf(
	provider: ProviderId,
	problem: TrialProblem,
): string {
	switch (problem.reason) {
		case "rate_limit":
			return "대기 중";
		case "quota":
			return provider === "gemini" ? "결제·한도 확인" : "크레딧 부족";
		case "no_key":
		case "provider_auth":
		case "no_permission":
			return "연결 확인 필요";
		case "in_progress":
			return "다른 생성 진행 중";
		case "provider_error":
			return "음성 서비스 오류";
		default:
			return PARAGRAPH_TEXT.failed;
	}
}

// 차이 칩 순서(브리프 5.4): 모델 → 감정·말투 → 속도 → 그 밖. ElevenLabs 스타일은 수치 슬라이더라 '그 밖'이다
const CHIP_FEEL = new Set([
	"emotion",
	"preset",
	"intensity",
	"tag",
	"direction",
]);
const chipRank = (provider: ProviderId, field: string) =>
	field === "model"
		? 0
		: CHIP_FEEL.has(field) || (provider === "airy" && field === "style")
			? 1
			: field === "tempo" || field === "speed"
				? 2
				: 3;

// 카드 둘째 줄 차이 칩(브리프 5.4): 문단 자기 설정에서 기본과 다른 칸. 기본은 같은 공급자면 기본 성우 설정, 아니면 그 공급자 처음 값이다.
// 그 모델이 쓰는 칸만 본다(usedSettings). 감정 칩이 있으면 감정 모드 칩은 뺀다(같은 바뀜을 두 칩으로 말하지 않는다). 모델·태그·언어는 값만(settingsSummary와 같다)
export function chipsOf(
	own: VoiceSetup | undefined,
	base: VoiceSetup | null,
): { field: string; text: string }[] {
	if (!own) return [];
	const from = (
		base?.provider === own.provider
			? base.settings
			: DEFAULT_SETTINGS[own.provider]
	) as Record<string, unknown>;
	const changed = Object.entries(
		usedSettings({ ...own, text: "" } as TrialRequest),
	).filter(([field, value]) => from[field] !== value);
	const preset = changed.some(([field]) => field === "preset");
	return changed
		.filter(([field]) => !(preset && field === "emotion"))
		.sort(([a], [b]) => chipRank(own.provider, a) - chipRank(own.provider, b))
		.map(([field, value]) => {
			const text = optionText(own.provider, field, value);
			return {
				field,
				text:
					field === "model" || field === "tag" || field === "language"
						? text.value
						: `${text.label} ${text.value}`,
			};
		});
}

// 문단 태그 도구줄 묶음(스펙 15.1 표): 소리 → 분위기, 빈 묶음은 뺀다. 범위 태그는 문단에 없고,
// Gemini 말투는 설정 칸 '말투 지시'에서 바꾸므로 분위기를 뺀다. 묶음이 없으면 카드가 안내를 보인다.
// 값은 대본에 넣는 글 그대로다(분위기는 [값]). 알약 접근 이름이 넣는 글을 말한다
export function paragraphTagGroups(family: ActingFamily): TagGroup[] {
	const { sound, front } = ACTING[family];
	const all: TagGroup[] = [
		{
			kind: "sound",
			title: PARAGRAPH_TEXT.tagSoundGroup,
			short: TAG_TEXT.soundShort,
			items: sound,
		},
		{
			kind: "mood",
			title: PARAGRAPH_TEXT.tagMoodGroup,
			short: TAG_TEXT.moodShort,
			items:
				family === "gemini"
					? []
					: front.map(({ label, value }) => ({ label, value: `[${value}]` })),
		},
	];
	return all.filter((group) => group.items.length > 0);
}

// T11 숫자 검수(브리프 17.6). 이름·원문 표기 뒤에 받침 따라 바뀌는 조사를 붙이지 않는다.
// leading_zero·unit_join 이유는 브리프 표에 없어 같은 말투로 더했다(보고)
export const NUMBER_TEXT = {
	// 카드
	spoken: "발음용 대본",
	changed: "읽기 바꿈",
	spokenLabel: (no: number) => `문단 ${n(no)} 발음용 대본`,
	// 카드 상태 줄 "숫자 1~3개 · GPT-4o · 1/2 검수 안 함"(가운데는 원문 표기 나열 unreviewedList, 화면이 translate="no"로 끼운다)
	openHead: "숫자",
	openTail: "검수 안 함",
	review: "검수하기",
	done: "숫자 검수 끝",
	again: "다시 보기",
	spokenCount: (count: number, max: number) =>
		`발음용 대본 ${n(count)}/${n(max)}자`,
	// 버튼
	button: "숫자 검수",
	buttonLabel: (count: number) => `숫자 검수, 검수 안 함 ${n(count)}개`,
	// 창
	title: "숫자 검수",
	summary: (open: number, total: number) =>
		`검수 안 함 ${n(open)} · 모두 ${n(total)}`,
	note: "원문은 그대로 두고, 고른 읽기는 발음용 대본에만 넣어요",
	paragraph: (no: number) => `문단 ${n(no)}`,
	kindLine: (no: number, kind: string) => `문단 ${n(no)} · ${kind}`,
	needsCheck: "확인 필요",
	recommend: "추천",
	list: "검수 항목",
	legend: "읽기",
	keepOf: (original: string) => `원문 유지 · ${original}`,
	manual: "직접 입력",
	manualInput: "직접 입력할 읽을 글",
	autoTag: "자동 태그 참고",
	autoTagLoading: "자동 태그 참고 후보를 불러오는 중…",
	// 현재 위치 "5 / 12"(창 머리 설명, 목록이 숨는 767px 이하에서도 보인다)
	position: (at: number, total: number) => `${n(at)} / ${n(total)}`,
	appliedMark: "적용함",
	keptMark: "원문 유지함",
	manualMark: "직접 입력함",
	openMark: "검수 안 함",
	prev: "이전",
	next: "다음",
	revert: "되돌리기",
	applyCertain: (count: number) => `확실한 것 모두 적용 (${n(count)})`,
	applyNext: "적용하고 다음",
	copy: "발음용 대본 복사",
	allDone: "모두 검수했어요",
	pickReading: "읽기를 골라 주세요",
	typeReading: "읽을 글을 입력해 주세요",
	locked: "전체 만들기가 끝난 뒤 바꿀 수 있어요",
	live: (no: number, original: string, mark: string) =>
		`문단 ${n(no)}, ${original}, ${mark}`,
	// 알림
	applied: (count: number) => `숫자 ${n(count)}개를 적용했어요`,
	copied: "발음용 대본을 복사했어요",
	copyFailed: "복사하지 못했어요. 브라우저 권한을 확인해 주세요.",
	// 만들기 확인 창
	// "숫자 N개를 검수하지 않았어요(나열). 검수하지 않은 숫자는 원문대로 보내요."(나열은 화면이 translate="no"로 끼운다)
	unreviewedHead: (count: number) => `숫자 ${n(count)}개를 검수하지 않았어요`,
	unreviewedTail: "검수하지 않은 숫자는 원문대로 보내요.",
	asIs: "원문대로 만들기",
	kinds: {
		money: "금액",
		phone: "전화번호",
		date: "날짜",
		time: "시간",
		count: "수량",
		percent: "비율",
		decimal: "소수",
		temperature: "온도",
		range: "범위",
		fraction: "분수·식",
		product: "제품명·버전",
		number: "수",
	} satisfies Record<ReadingKind, string>,
	reasons: {
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
	} satisfies Record<CheckReason, string>,
} as const;
