// apps/web/src/lib/drama-view.ts
import {
	ACTING,
	type ActingFamily,
	applyLine,
	type Feel,
	familyOf,
	hasFeel,
	snapIntensity,
	TYPECAST_INTENSITIES,
} from "@tts-pilot-app/api/drama-acting";
import type { DramaItem } from "@tts-pilot-app/api/drama-contract";
import {
	cleanDirection,
	DRAMA_DIRECTION_MAX,
	DRAMA_LAUNCH_UNTIL,
	DRAMA_LINE_MAX,
	DRAMA_LINES_MAX,
	DRAMA_MODELS,
	DRAMA_NAME_MAX,
	DRAMA_SCENE_MAX,
	DRAMA_SCENE_NAME_MAX,
	DRAMA_SETTINGS,
	DRAMA_SPEAKERS_MAX,
	type DramaLine,
	type DramaModel,
	type DramaRequest,
	type DramaSettings,
	type DramaSpeaker,
	dramaUsage,
	pcmSeconds,
	sceneChars,
	sceneLimit,
	sceneText,
	splitRisk,
	TAGS,
	takeKey,
	WAV_HEADER_BYTES,
} from "@tts-pilot-app/api/drama-script";
import type { Preset, PresetValue } from "@tts-pilot-app/api/preset-contract";
import type { ProviderId, Voice } from "@tts-pilot-app/api/providers/contract";
import {
	type AiryStyle,
	codePoints,
	DEFAULT_SETTINGS,
	type EmotionPreset,
	FISH_FREE_UNTIL,
	freeModelOpen,
	normalizeText,
	RANGES,
	type Range,
	snap,
	TRIAL_TEXT_MAX,
	type Usage,
	utf8Bytes,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";

import { PROVIDER_IDS, PROVIDER_LABEL } from "./connection-view";
import { GAP_DEFAULT, gapOf } from "./drama-join";
import type { ReadProblem } from "./drama-read";
import {
	kstStamp,
	pressedEmotion,
	safeName,
	savedOf,
	VOICE_ID,
} from "./studio-view";
import {
	presetsOf,
	resultWhen,
	type TrialProblem,
	trialProblemText,
	requestOf as trialRequestOf,
	typecastModelsOf,
	usageText,
	valueText,
} from "./trial-view";
import { plain, retryTime } from "./voice-view";

// 드라마 작업실의 화면 문구와 계산(T9.5 스펙 2·4·5절). 화면 없이 테스트하는 순수 함수만 둔다.
// 값과 대본 조립·나누기는 zod 없는 drama-script에 있고, 계약(drama-contract)은 타입만 가져온다(화면 번들에 zod를 넣지 않는다)

const n = (value: number) => plain.format(value);
// 그 시각(0시 KST)에 끊는 기간의 마지막 날("11월 29일"). 앱은 공급자 날짜보다 하루 일찍 끊는다(T5 규칙, 브리프 11절 4)
function lastDayOf(end: number): string {
	const at = new Date(end - 1 + 9 * 60 * 60 * 1000);
	return `${at.getUTCMonth() + 1}월 ${at.getUTCDate()}일`;
}
const freeUntil = (end: number) => `${lastDayOf(end)}까지`;

// 화면 문구. 정본은 화면 브리프(docs/briefs/drama.md 8절, 2026-10-22 사용자 확인)이고 키·글은 그 표 그대로다.
// 표에 키 이름이 없는 줄(막는 이유·오류 사유)과 표의 자리 열에서 나온 조합(modelName·connections)만 이름을 지었다.
// 이름(화자·성우·장면) 뒤에 받침 따라 바뀌는 조사를 붙이지 않는다. howTo*의 `…`는 코드 모양으로 보일 부분이다
export const DRAMA_TEXT = {
	// 머리·화자·성우 창
	title: "드라마 작업실",
	description: "화자마다 성우를 붙이고 대본을 연기시켜요.",
	loopback: "이 주소에서는 드라마 작업실을 쓸 수 없어요",
	sceneName: "장면 이름",
	// 자리 표시이자 장면 이름이 비었을 때의 이름(스펙 2절 기본값 '장면')
	scenePlaceholder: "장면",
	model: "모델",
	// 메뉴 항목. 확인 창·이전 테이크는 " · 유료"를 뺀 modelName
	modelLabel: {
		"s2.1-pro-free": "S2.1 Pro Free",
		"s2.1-pro": "S2.1 Pro · 유료",
		"drama-3": "Drama 3 · 유료",
	} satisfies Record<DramaModel, string>,
	modelName: {
		"s2.1-pro-free": "S2.1 Pro Free",
		"s2.1-pro": "S2.1 Pro",
		"drama-3": "Drama 3",
	} satisfies Record<DramaModel, string>,
	// 모델 메뉴 항목 아래 회색 둘째 줄(결과 차이를 고르는 자리에서 말한다)
	modelNote: {
		"s2.1-pro-free": "대사별 파일도 나와요",
		"s2.1-pro": "대사별 파일도 나와요",
		"drama-3": "장면 파일만 나올 수 있어요",
	} satisfies Record<DramaModel, string>,
	speakers: "화자",
	speakersHelp: "대본에 나오는 화자만 장면에 들어가요 · 최대 4명",
	speakerName: (i: number) => `화자 ${i}`,
	nameLabel: (i: number) => `화자 ${i} 이름`,
	pickVoice: "성우 고르기",
	removeSpeaker: (i: number) => `화자 ${i} 빼기`,
	// 빼기 툴팁(8절 removeSpeaker 자리 열의 '툴팁 빼기'). 잠기면 툴팁이 잠김 이유다
	removeTip: "빼기",
	removeLocked: (lines: number) =>
		`이 화자의 줄이 ${n(lines)}개 있어요. 줄을 지우거나 다른 화자로 바꾼 뒤에 뺄 수 있어요.`,
	removeLast: "화자는 1명 이상이어야 해요.",
	addSpeaker: "화자 추가",
	speakersFull: "화자는 4명까지예요",
	voicesFailed: "담은 성우를 불러오지 못했어요",
	reload: "다시 불러오기",
	pickerTitle: (name: string) => `화자 ‘${name}’의 성우 고르기`,
	// 탭·설명은 브리프 14절 문구 표가 앞선다(Part 2)
	pickerDescription:
		"담은 성우나 프리셋, 공급자 전체에서 골라요. 전체에서 고르면 성우 보관함에도 담겨요.",
	source: "성우 출처",
	savedTab: "담은 성우",
	presetTab: "프리셋",
	allTab: "전체",
	// '전체' 탭 공급자 메뉴의 이름표
	providerPick: "공급자",
	toAll: "전체에서 고르기",
	toCasting: "성우 캐스팅에서 담기",
	usedBy: (name: string) => `${name}도 쓰는 중`,
	savedToLibrary: "성우 보관함에도 담았어요.",
	voiceUnusable: "이 성우는 지금 쓸 수 없어요. 다른 성우를 골라 주세요.",
	close: "닫기",

	// 대본·붙여 넣기·연기 지시
	script: "대본",
	count: (lines: number, chars: number, limit: number) =>
		`${n(lines)}줄 · ${n(chars)} / ${n(limit)}자`,
	lineSpeaker: (line: number, name: string) => `${line}번 줄 화자, ${name}`,
	directionLabel: (line: number) => `${line}번 줄 연기 지시`,
	// 지시 칸 자리 표시. 그 줄을 가리키거나 포커스할 때만 보인다(브리프 17절 4)
	directionShort: "지시",
	textLabel: (line: number) => `${line}번 줄 대사`,
	textPlaceholder: "대사",
	fieldCount: (count: number, max: number) => `${n(count)} / ${n(max)}자`,
	lineMenu: (line: number) => `${line}번 줄 메뉴`,
	moveUp: "위로",
	moveDown: "아래로",
	insertDirection: "연기 지시 넣기",
	removeLine: "지우기",
	lastLine: "줄은 1개 이상이어야 해요",
	lineRemoved: (line: number) => `${line}번 줄을 지웠어요.`,
	undo: "실행 취소",
	addLine: "줄 추가",
	paste: "대본 붙여 넣기",
	// 767px 이하 보이는 글. 접근 이름은 paste·autoTagName 전체다(브리프 17절 3)
	pasteShort: "붙여 넣기",
	linesFull: "줄은 50개까지예요",
	enterHelp:
		"대사 칸에서 Enter를 누르면 바로 아래에 다음 화자의 새 줄이 생겨요",
	multiLinePasted:
		"여러 줄을 한 줄로 합쳤어요. 줄마다 나누려면 대본 붙여 넣기를 써 주세요.",
	pasteDescription:
		"‘이름: 대사’ 줄을 화자와 줄로 바꿔요. 이름이 없는 줄은 앞 줄의 화자가 이어 말해요.",
	pasteLabel: "붙여 넣을 대본",
	pastePlaceholder:
		"지연: 또 늦었네. 삼십 분이나 기다렸어.\n민수: 미안, 미안! 지하철이 갑자기 멈춰 버렸어.",
	pasteSummary: (lines: number, speakers: number) =>
		`${n(lines)}줄 · 화자 ${speakers}명`,
	pasteCarried: (voice: string) => `성우 이어 씀 · ${voice}`,
	pasteNoVoice: "성우 없음, 바꾼 뒤 골라 주세요",
	pasteReplaceNote: (lines: number) =>
		`바꾸면 지금 대본 ${n(lines)}줄이 이 글로 바뀌어요`,
	pasteTooManySpeakers: "화자는 4명까지예요. 이름을 4개 이하로 줄여 주세요",
	pasteTooManyLines: "줄은 50개까지예요. 50줄 이하로 줄여 주세요",
	pasteEmpty: "붙여 넣은 글에 대사가 없어요",
	replace: "바꾸기",
	cancel: "취소",
	replaced: (lines: number, speakers: number) =>
		`대본을 바꿨어요. ${n(lines)}줄, 화자 ${speakers}명.`,
	palette: "연기 지시",
	// 도구줄(스펙 17.3): 접근 이름(지시 칸 directionLabel과 다르게 줄 메뉴 항목을 따른다), 첫 묶음 나머지를 담은 메뉴 알약, 묶음 짧은 이름(메뉴 알약 글). 메뉴 안 머리는 긴 묶음 이름이다
	toolbarName: (line: number) => `${line}번 줄 연기 지시 넣기`,
	moreOf: (name: string) => `${name} 더 보기`,
	soundShort: "소리",
	spanShort: "범위",
	moodShort: "분위기",
	soundGroup: "소리 · 커서 위치에",
	spanGroup: "범위 · 고른 글자를 감싸요",
	moodGroup: "분위기 · 그 줄의 지시 칸에",
	badgeName: (label: string, text: string) => `${label}, ${text}`,
	howTo: "지시 쓰는 법",
	howToDot: "점 태그: `그래 [sighs] 네가 이겼어.`",
	howToSpan: "범위 태그: `약속해 <whisper>아무한테도 말 안 한다고</whisper>.`",
	howToLine:
		"줄 지시: 지시 칸에 `icy calm` 또는 `작게 한숨 쉬며`. 어떤 말로 써도 되고 소리로 읽지 않아요.",
	howToNote: "한국어 지시와 영어 지시 중 무엇이 나은지는 들어 보고 정해요.",

	// 막대·샘플링·확인 창
	barLabel: "장면 만들기",
	make: "장면 만들기",
	makePaid: "장면 만들기, 크레딧 사용",
	makeFree: "장면 만들기, 무료",
	// 주 버튼 "연기하는 중 · 12초"(스펙 4절, 브리프 5.8)
	makingFor: (seconds: number) => `연기하는 중 · ${n(seconds)}초`,
	makingStatus: "장면을 연기하는 중이에요",
	waitNote: "공급자 응답을 기다리고 있어요. 다시 누르지 않아도 돼요",
	// 예상 줄. 무료면 끝에 무료 끝 날짜, 유료면 usageText가 이미 '추정 약'을 붙인다(브리프 5.8)
	estimate: (chars: number, bytes: number, usage: Usage) =>
		`${n(chars)}자 · ${n(bytes)}바이트 · ${usageText(usage)}${usage.unit === "free" ? ` · ${freeUntil(FISH_FREE_UNTIL)}` : ""}`,
	sampling: "샘플링",
	samplingSummary: (summary: string) => `샘플링 · ${summary}`,
	samplingDescription:
		"테이크마다 연기가 달라져요. 바꾼 값은 다음에 만드는 테이크부터 써요.",
	temperature: "연기 변화",
	temperatureNote: "높을수록 테이크마다 연기가 더 달라져요",
	speed: "속도",
	reset: "처음 값으로",
	toStage: "무대 보기",
	confirmTitle: "크레딧을 써서 장면을 만들까요?",
	confirmCredit:
		"Fish Audio API 크레딧이 쓰여요. API 크레딧은 웹 플랜 크레딧과 따로예요.",
	confirmScene: "장면",
	confirmScript: "대본",
	confirmSpeakers: "화자",
	confirmModel: "모델",
	confirmEstimate: "예상",
	sceneSummary: (name: string, lines: number, chars: number) =>
		`${name} · ${n(lines)}줄 · ${n(chars)}자`,
	castPair: (speaker: string, voice: string) => `${speaker} → ${voice}`,
	// 확인 창 예상 아래 근거 줄. 무료는 없다
	basis: (model: DramaModel, now = Date.now()): string | null =>
		model === "s2.1-pro"
			? "S2.1 Pro 요금(100만 바이트당 $15)으로 셈한 추정이에요"
			: model === "drama-3"
				? now < DRAMA_LAUNCH_UNTIL
					? `Drama 3 출시가(100만 바이트당 $10, ${freeUntil(DRAMA_LAUNCH_UNTIL)})로 셈한 추정이에요`
					: "Drama 3 정가(100만 바이트당 $50)로 셈한 추정이에요"
				: null,
	drama3Warning:
		"Drama 3는 대사별 시각 정보를 주지 않을 수 있어요. 그러면 대사별 파일 없이 장면 파일만 받아요",
	unknownRetry:
		"같은 대본의 앞 요청은 처리 여부를 아직 몰라요. 다시 만들면 크레딧이 한 번 더 쓰일 수 있어요",
	confirmMake: "크레딧 쓰고 만들기",

	// 막는 이유(dramaBlock, 이 순서)
	noVoice: (name: string) => `화자 ‘${name}’의 성우를 골라 주세요`,
	noName: (i: number) => `화자 ${i}의 이름을 써 주세요`,
	sameName: (name: string) => `같은 이름의 화자가 있어요 (‘${name}’)`,
	nameTooLong: (i: number, count: number) =>
		`화자 ${i}의 이름을 ${n(DRAMA_NAME_MAX)}자 이하로 줄여 주세요 (지금 ${n(count)}자)`,
	emptyLine: (line: number) => `${line}번 줄의 대사가 비었어요`,
	lineTooLong: (line: number, count: number) =>
		`${line}번 줄의 대사가 ${n(DRAMA_LINE_MAX)}자를 넘었어요 (지금 ${n(count)}자)`,
	directionTooLong: (line: number, count: number) =>
		`${line}번 줄의 지시가 ${n(DRAMA_DIRECTION_MAX)}자를 넘었어요 (지금 ${n(count)}자)`,
	marker: (line: number) => `${line}번 줄에 쓸 수 없는 글자(<|)가 있어요`,
	sceneNameTooLong: (count: number) =>
		`장면 이름을 ${n(DRAMA_SCENE_NAME_MAX)}자 이하로 줄여 주세요 (지금 ${n(count)}자)`,
	tooLong: (limit: number, count: number, speed: number) =>
		speed < 1
			? `속도 ${valueText("speed", speed)}에서는 ${n(limit)}자 이하로 줄여 주세요 (지금 ${n(count)}자)`
			: `${n(limit)}자 이하로 줄여 주세요 (지금 ${n(count)}자)`,
	// 나누지 못함 경고(splitWarning, 막지 않는다)
	splitNoText:
		"대사 없이 지시만 있는 줄이 있어요. 대사별 파일 없이 장면 파일만 나와요",
	splitTagWord:
		"대사의 영어 단어에 지시 이름(soft·fast 등)이 들어 있어요. 대사별 파일 없이 장면 파일만 나와요",

	// 오류(dramaProblemText)
	fishCredit:
		"Fish Audio API 크레딧이 부족해요. API 크레딧은 웹 플랜 크레딧과 따로예요",
	fishCreditLink: "Fish Audio에서 API 크레딧 충전하기",
	// Fish 공식 quickstart 문제 해결 표가 402를 Billing 충전으로 잇는다(2026-10-22 메인 확인)
	fishCreditUrl: "https://fish.audio/app/billing",
	// 새 창 링크 이름 끝의 화면 밖 글
	newWindow: "(새 창)",
	toFreeModel: "무료 모델로 바꾸기",
	// 막대 402 줄 '무료 모델로 바꾸기'와 무대 '대사 파일이 나오는 모델로 바꾸기'의 알림. label은 modelName
	modelSwitched: (label: string) => `모델을 ${label}로 바꿨어요.`,
	voiceRejected: (name: string) =>
		`화자 ‘${name}’의 성우를 쓸 수 없어요. 다시 골라 주세요`,
	voiceRejectedUnknown: "성우를 쓸 수 없는 화자가 있어요. 다시 골라 주세요",
	inProgress: "다른 생성이 진행 중이에요. 끝난 뒤 다시 눌러 주세요",
	unknownOutcome:
		"처리 여부를 확인하지 못했어요. 크레딧이 쓰였을 수 있으니 다시 누르기 전에 이전 테이크를 확인해 주세요",
	retryAfter: (time: string) => `${time} 이후에 다시 만들 수 있어요`,
	freeEnded: "Fish Audio 무료 모델 기간이 끝났어요. 모델을 다시 골라 주세요",
	audioTooLarge: "결과 오디오가 너무 커요. 대본을 줄이거나 속도를 올려 주세요",
	storage: "지금은 장면을 만들 수 없어요. 잠시 뒤 다시 해 주세요",
	unexpected: "장면을 만들지 못했어요. 잠시 뒤 다시 해 주세요",
	// 키·인증·권한 오류 줄의 링크 버튼(→ /connections)
	connections: "연결 상태 보기",

	// 무대·이전 테이크
	stage: "무대",
	stageGenerating: "새 테이크를 연기하는 중이에요",
	receivingScene: "장면을 받는 중이에요",
	sceneFailed:
		"장면을 받지 못했어요. 잠시 뒤 다시 받아 주세요. 크레딧은 들지 않아요",
	retryReceive: "다시 받기",
	takeCaption: (
		take: number,
		total: number,
		time: string,
		model: string,
		seconds: number,
	) =>
		`테이크 ${take} / ${total} · ${time} · ${model} · ${seconds.toFixed(1)}초`,
	prevTake: "앞 테이크",
	nextTake: "다음 테이크",
	// 장면 플레이어 넘기기 사이 글(스펙 17.3 결과 칸)
	takeAt: (at: number, total: number) => `테이크 ${at} / ${total}`,
	// 무대의 받기 메뉴 '대사별 파일 (zip)' 안내(스펙 17.2, 계획 리뷰 P5-13)
	zipNote: (lines: number) => `대사별 파일: 장면 1 + 대사 ${n(lines)}`,
	// zipNote 뒤에 잇는다(브리프 5.10 " · 대사는 테이크 1·2에서")
	zipMixed: (takes: readonly number[]) =>
		` · 대사는 테이크 ${takes.join("·")}에서`,
	receivingShort: "받는 중",
	downloadFailed:
		"받지 못했어요. 잠시 뒤 다시 해 주세요. 크레딧은 들지 않아요.",
	otherScript: "지금 대본과 다른 테이크예요",
	restoreScript: "이 테이크의 대본으로 되돌리기",
	restored: "테이크의 대본으로 되돌렸어요.",
	notSplit: "대사별로 나누지 못했어요. 장면 파일은 받을 수 있어요",
	notSplitDrama3:
		"Drama 3는 대사별 시각 정보를 주지 않을 수 있어요. 대사 파일이 필요하면 S2.1 Pro 계열 모델로 만들어 보세요",
	notSplitNoText: "대사 없이 지시만 있는 줄이 있어서 나누지 않았어요",
	notSplitTagWord: "대사의 영어 단어에 지시 이름이 들어 있어서 나누지 않았어요",
	notSplitMismatch:
		"읽은 글자가 대본과 맞지 않았어요. 지시나 숫자를 대본과 다르게 읽었을 수 있어요",
	// 나누지 못함 이유가 notSplitDrama3이고 지금 모델이 Drama 3일 때 안내 줄 셋째 행
	toSplitModel: "대사 파일이 나오는 모델로 바꾸기",
	// 대본 줄 ▶ · ■(스펙 17.3)
	playLine: (line: number, speaker: string) => `${line}번 줄 ${speaker} 듣기`,
	stopLine: (line: number, speaker: string) => `${line}번 줄 ${speaker} 정지`,
	// '이 줄만 읽기' ▶가 읽기·받기 중이라 잠긴 이유(장면을 만드는 중은 makingStatus)
	playLocked: "읽기나 받기가 끝나면 들을 수 있어요",
	// 줄 메뉴 '이 줄 받기'(줄 ▶가 테이크 조각일 때, 스펙 17.2 '줄 메뉴')
	saveThisLine: "이 줄 받기",
	takeChip: (take: number, time: string, model: string) =>
		`테이크 ${take} · ${time} · ${model}`,
	// 고르지 않은 줄의 무대 테이크 칩: 칩 접근 이름 끝, 5개 이상 메뉴 값 글자("2 · 무대 따라감")와 그 접근 이름
	follows: (label: string) => `${label} · 무대 따라감`,
	followAll: "모든 줄을 이 테이크로",
	followedAll: "모든 줄을 무대의 테이크로 맞췄어요.",
	// 줄 듣기 플레이어 알림의 종류 말("3번 줄 지연 대사 재생 중"). '저장된 결과'는 테이크 대신 쓰지 않는다(GLOSSARY)
	lineNoun: "대사",
	made: "장면을 만들었어요.",
	notFound: "이미 지워졌거나 찾을 수 없어요.",
	takes: "이전 테이크",
	takesFailed: "이전 테이크를 불러오지 못했어요",
	toTakes: "이전 테이크 보기",
	takeTitle: (scene: string, firstLine: string) => `${scene} · ${firstLine}`,
	takeLine: (
		when: string,
		model: string,
		speakers: readonly string[],
		seconds: number,
		usage: Usage,
	) =>
		`${when} · ${model} · ${speakers.join("·")} · ${seconds.toFixed(1)}초 · ${usageText(usage)}`,
	putOnStage: "무대에 올리기",
	onStageBadge: "무대에 있음",
	otherScriptBadge: "다른 대본",
	notSplitBadge: "나누지 못함",
	unknownBadge: "처리 여부 미확인",
	unknownUsage: "사용 여부 미확인",
	// 다시 받는 창(6분)이 지난 미확인 줄(studio-view unknownNoteOf의 만료 문구 인자)
	unknownExpired:
		"확인 시간이 지났어요. 크레딧 사용 여부는 Fish Audio 사용 기록에서 확인해 주세요",
	takesCap: "최근 20개까지 보여요",
	remove: "지우기",
	removeQuestion: "이 테이크를 지울까요?",
	removeDetail:
		"지우면 이 테이크를 다시 듣거나 받을 수 없어요. 공급자 사용 기록은 그대로예요.",
	removing: "지우는 중이에요",
	removed: "테이크를 지웠어요.",
	removedPicked: (lines: number) =>
		`테이크를 지웠어요. 이 테이크를 고른 줄 ${n(lines)}개는 무대의 테이크로 받아요.`,
	removeFailed: "지우지 못했어요. 잠시 뒤 다시 해 주세요.",

	// 8절 표에 키가 없던 조합(Task 11, Ruling 12). 글은 브리프 5절의 예 그대로다
	// 무대 캡션(넘기기가 없을 때, 5.10 "10:42 · Drama 3 · 18.3초")
	takeCaptionShort: (time: string, model: string, seconds: number) =>
		`${time} · ${model} · ${seconds.toFixed(1)}초`,
	// 확인 창 예상(5.9 "추정 약 $0.0032 · 322바이트"). usageText가 이미 '추정 약'을 붙인다
	confirmUsage: (usage: Usage, bytes: number) =>
		`${usageText(usage)} · ${n(bytes)}바이트`,
	// 막는 이유의 이동 버튼(8절 막는 이유 표의 이동 버튼 열)
	toName: "이름 칸으로",
	toLine: (line: number) => `${line}번 줄로`,
	// 막대 '샘플링' 접근 이름(5.8, 늘 지금 값): 보이는 글로 시작하고 처음 값인 항목을 뒤에 붙인다(WCAG 2.5.3)
	samplingLabel: (settings: DramaSettings): string =>
		[samplingText(settings), ...samplingParts(settings, false)].join(", "),
	// 테이크 5개 이상 줄 메뉴의 접근 이름(5.10). take는 트리거 값 글자("2" 또는 follows("2"))
	takeMenuLabel: (line: number, take: number | string) =>
		`${line}번 줄 테이크, ${take} 선택됨`,
	// 줄 듣기를 재생하는 페이지 플레이어의 이름("3번 줄 지연 대사 재생 중", sample-player 알림)
	lineName: (line: number, speaker: string) => `${line}번 줄 ${speaker}`,
	// '대사별 파일'·'쉼 넣어 한 파일로' 받기 시작·끝 화면 밖 알림(5.10 받기 진행)
	receivingAll: "모두 받는 중이에요",
	receivedAll: "모두 받았어요",
	// '쉼 넣어 한 파일로' 받기 시작·끝 화면 밖 알림(스펙 17.2)
	joinTakeSaving: "쉼 넣어 한 파일로 받는 중이에요",
	joinTakeSaved: "쉼 넣어 한 파일로 받았어요",

	// Part 2(브리프 14절 문구 표). 감정·말투 값의 이름은 ACTING(drama-acting)에 있다
	// 막는 이유(dramaBlock)의 첫 이유
	mixedBlock: "다른 공급자 화자가 있어 장면은 만들 수 없어요. 읽기를 쓰세요",
	read: "읽기",
	readStop: (done: number, total: number) => `멈춤 · ${n(done)}/${n(total)}줄`,
	// 찾는 중(줄 수를 아직 모름)의 멈춤(수정 회차 1)
	readStopOnly: "멈춤",
	readFrom: "이 줄부터 읽기",
	readAgainFrom: "이 줄부터 다시 읽기",
	makingNow: "만드는 중",
	readAnnounce: (line: number, speaker: string) => `${line}번 줄, ${speaker}`,
	// '받기' 메뉴 항목(15절이 '읽은 줄 모두 받기'를 바꿨다)
	readZip: "줄마다 받기 (zip)",
	noDirection: "이 성우는 지시를 받지 않아요",
	noTags: "이 성우는 연기 태그를 받지 않아요",
	feelLabel: "감정",
	intensityLabel: "강도",
	// 감정이 '자동'(smart)이면 잠긴 강도 칸의 이유(화면 밖 설명)
	intensityAuto: "감정이 자동이면 강도는 쓰지 않아요",
	styleLabel: "말투",
	readConfirmTitle: "새로 만들 줄이 있어요",
	readConfirmBody: (make: number, reuse: number) =>
		`${n(make)}줄을 새로 만들고 ${n(reuse)}줄은 저장된 소리를 써요`,
	readConfirmRow: (
		provider: ProviderId,
		lines: number,
		chars: number,
		usage: Usage,
	) =>
		`${PROVIDER_LABEL[provider]} · ${n(lines)}줄 · ${n(chars)}자 · ${usageText(usage)}`,
	// 확인 창 취소는 cancel
	readConfirmGo: "읽기",
	readVoiceBlock: (name: string) => `화자 ‘${name}’의 성우를 골라 주세요`,
	readLongBlock: (line: number) =>
		`${line}번 줄이 읽기 상한 ${n(TRIAL_TEXT_MAX)}자를 넘어요(지시 포함)`,
	readEmptyBlock: (line: number) =>
		`${line}번 줄은 보낼 대사가 없어요(태그만 있어요)`,
	autoTag: "전체 자동 태그",
	autoTagShort: "자동 태그",
	autoTagName: "전체 자동 태그, 크레딧 사용",
	autoTagLong: (count: number) =>
		`대본이 ${n(DRAMA_SCENE_MAX)}자를 넘어 자동 태그를 쓸 수 없어요 (지금 ${n(count)}자)`,
	autoTagTitle: "대본을 보내 연기 값을 제안받을까요?",
	autoTagBody:
		"Gemini 텍스트 모델(gemini-3.8-flash)로 대본을 보내요. 예상 약 $0.01. 키가 무료 등급이면 Google이 보낸 대본을 학습에 쓸 수 있어요",
	autoTagGo: "제안 받기",
	autoTagPreviewTitle: "자동 태그 제안",
	autoTagNone: "바꿀 값이 없어요",
	autoTagSkipped: (count: number) =>
		`연기 값을 받지 않는 성우의 줄 ${n(count)}개는 그대로 둬요`,
	autoTagApply: "모두 바꾸기",
	autoTagChanged: (count: number) =>
		`보낸 뒤 고친 줄 ${n(count)}개는 건너뛰었어요`,
	autoTagApplied: (count: number) =>
		`줄 ${n(count)}개를 바꿨어요 (실행 취소 10초)`,
	autoTagReply: "제안을 읽지 못했어요. 다시 해 주세요",
	// 수정 회차 1(코디네이터 판정): 맥락이 틀린 T5 문구만 바꾼다
	autoTagRetryAt: (time: string) => `${time} 이후에 다시 제안받을 수 있어요`,
	autoTagFailed: "제안을 받지 못했어요. 잠시 뒤 다시 해 주세요",
	// 미리 보기 전·후의 화면 밖 이름표(줄 긋기는 읽히지 않는다)
	autoTagBefore: "전",
	autoTagAfter: "후",
	// 줄 실패의 기본 문구(T5 '내 문장을 듣지 못했어요…' 대신)
	readLineFailed: "이 줄을 듣지 못했어요. 잠시 뒤 다시 눌러 주세요",

	// Part 3(브리프 15절 문구 표). 쉼 값(seconds)은 gapText로 만든 소수 한 자리 글이다
	gapDefault: "기본 쉼",
	gapUnit: "초",
	gapHelp: "0~5초, 0.1초 단위. 한 파일로 받을 때 줄 사이에 넣어요",
	// 가름선 숫자 칸의 화면 밖 이름표(브리프 17절 5). 보이는 글은 '초'뿐이다
	gapLineName: (line: number) => `${line}번 줄 뒤 쉼(초)`,
	// 가름선 숫자 칸의 설명. 대본 구역에 하나 둔다
	gapLineHelp: (seconds: string) =>
		`0~5초, 0.1초 단위. 비우면 기본 ${seconds}초`,
	// '기본으로' 단추. 접근 이름(gapResetLine)이 보이는 글로 시작한다(계획 리뷰 P4-4)
	gapReset: "기본으로",
	gapResetLine: (line: number) => `기본으로, ${line}번 줄 뒤 쉼`,
	joinPlay: "이어 듣기",
	joinStop: "이어 듣기 멈춤",
	joinSave: "한 파일로 받기 (WAV)",
	// 이어 듣기의 재생 이름("대본 전체 대사 재생 중")
	joinAnnounce: "대본 전체",
	joining: "대본을 잇는 중",
	joinFailed: "한 파일로 잇지 못했어요. ‘줄마다 받기’로 받아 주세요",

	// Part 4(브리프 16절 문구 표): 읽지 않고 대본 전체를 받는 '받기' 메뉴
	saveMenu: "받기",
	saveStop: (done: number, total: number) =>
		`멈춤 · 받는 중 ${n(done)}/${n(total)}줄`,
	// 받기 확인 창의 확인 버튼(읽기는 readConfirmGo)
	saveConfirmGo: "받기",

	// Part 5 막대(스펙 17.3): 결과 칸의 회색 안내, 주 버튼, 테이크 모드 받기 메뉴, 혼합 대본 한 줄 칸
	resultScene: "장면을 만들면 여기서 들을 수 있어요",
	resultJoin: "모든 줄을 읽으면 여기서 이어 들을 수 있어요",
	otherWays: "다른 방법",
	readByLine: "줄마다 읽기",
	readPaidName: "읽기, 크레딧 사용",
	saveSceneFile: "장면 파일 (WAV)",
	saveTakeJoin: "쉼 넣어 한 파일로 (WAV)",
	saveTakeZip: "대사별 파일 (zip)",
	readEstimate: (lines: number, chars: number, paid: boolean) =>
		`${n(lines)}줄 · ${n(chars)}자${paid ? " · 유료 공급자 화자가 있어요 · 누르면 예상 사용량을 먼저 보여 드려요" : ""}`,
} as const;

// 이 브라우저의 임시 작업(스펙 2절). 키에 판을 붙이고 필요한 칸만 둔다(client-localstorage-schema)
export const DRAFT_KEY = "tts-pilot:drama:v1";
// 화자는 다섯 공급자 성우(보관함) 또는 프리셋을 받는다(Part 2). presetId가 있으면 그 프리셋의 성우·설정이다
export type DraftSpeaker = {
	name: string;
	provider: ProviderId;
	voiceId: string | null;
	presetId: string | null;
};
// feel은 Typecast 감정·Airy 말투(Part 2). 없으면 화자 설정 그대로다.
// gap은 이 줄 뒤 쉼(초, 0.1 단위, 스펙 15절). 없으면 기본 쉼(Draft.gap)이고 요청에는 넣지 않는다
export type DraftLine = DramaLine & { id: string; feel?: Feel; gap?: number };
export type Draft = {
	sceneName: string;
	speakers: DraftSpeaker[];
	lines: DraftLine[];
	model: DramaModel;
	settings: DramaSettings;
	// 줄마다 고른 테이크(DN-5): takeKey → 줄 번호 → 테이크 id
	picks: Record<string, Record<number, string>>;
	// 줄 사이 기본 쉼(초)
	gap: number;
};

export const FREE_MODEL = "s2.1-pro-free" satisfies DramaModel;
// 고를 수 있는 모델. 무료 기간이 끝나면 s2.1-pro-free를 뺀다(첫 값이 처음 모델)
export const dramaModelsOf = (now = Date.now()): DramaModel[] =>
	DRAMA_MODELS.filter((model) => model !== FREE_MODEL || freeModelOpen(now));
// 대사 파일이 나오는 모델(무대 나누지 못함 안내의 바꾸기, 브리프 5.10): 무료 모델을 쓸 수 있으면 그것, 아니면 S2.1 Pro
export const splitModelOf = (now = Date.now()): DramaModel =>
	dramaModelsOf(now).includes(FREE_MODEL) ? FREE_MODEL : "s2.1-pro";

// 화면에 보이는 화자 이름(줄 칩·성우 창 제목·붙여 넣기 결과·무대). 다듬은 이름, 비었거나 없는 화자는 번호 이름.
// 이름 뒤에는 받침 따라 바뀌는 조사를 붙이지 않는다(브리프 8절)
export const speakerNameOf = (
	speakers: readonly Pick<DraftSpeaker, "name">[],
	index: number,
) =>
	normalizeText(speakers[index]?.name ?? "") ||
	DRAMA_TEXT.speakerName(index + 1);

// 성우 없는 새 화자. 공급자 처음 값은 Fish Audio다(성우 창 '전체'의 처음 공급자)
export const newSpeaker = (name: string): DraftSpeaker => ({
	name,
	provider: "fish_audio",
	voiceId: null,
	presetId: null,
});
const firstSpeakers = (): DraftSpeaker[] =>
	[1, 2].map((i) => newSpeaker(DRAMA_TEXT.speakerName(i)));
const emptyLine = (id: () => string): DraftLine => ({
	id: id(),
	speaker: 0,
	direction: "",
	text: "",
});

// 계약은 원문을 상한 × 4 UTF-16 단위까지만 받는다(drama-contract trimmedOf). 그보다 길면 정리 뒤 글자가 적어도 BAD_REQUEST라 dramaBlock이 막는다
const rawFits = (raw: string, max: number) => raw.length <= max * 4;
const objectOf = (value: unknown): Record<string, unknown> | null =>
	value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
// 글 칸: 글이 아니면 빈 글. 상한을 넘는 글은 그대로 되살린다(입력은 자르지 않는다, 브리프 5.4. 막는 이유가 말한다, Ruling 14)
const textOf = (value: unknown) => (typeof value === "string" ? value : "");
const settingOf = (value: unknown, range: Range) =>
	typeof value === "number" && Number.isFinite(value)
		? snap(value, range)
		: range.default;
// 화자 칸: 1~4명이고 화자마다 객체, 이름이 글. 모양이 하나라도 깨지면 칸 전체가 처음 값이다.
// 빈 이름·긴 이름은 고치는 중일 수 있어 지킨다(막는 이유가 말한다, Ruling 10·14).
// 성우·프리셋 id는 형식만 본다. 담은 목록과는 렌더할 때 맞춘다(usableSpeakers). 목록 받기 실패가 저장된 성우를 지우지 않게(계획 리뷰 P4).
// 공급자·프리셋 칸이 없으면(Part 1 저장 모양) Fish Audio·프리셋 없음이다
const idOf = (value: unknown) =>
	typeof value === "string" && VOICE_ID.test(value) ? value : null;
function speakersOf(raw: unknown): DraftSpeaker[] | null {
	if (!Array.isArray(raw) || raw.length < 1 || raw.length > DRAMA_SPEAKERS_MAX)
		return null;
	const speakers: DraftSpeaker[] = [];
	for (const item of raw) {
		const stored = objectOf(item);
		const name = stored?.name;
		if (typeof name !== "string") return null;
		speakers.push({
			name,
			provider:
				PROVIDER_IDS.find((provider) => provider === stored?.provider) ??
				"fish_audio",
			voiceId: idOf(stored?.voiceId),
			presetId: idOf(stored?.presetId),
		});
	}
	return speakers;
}
// 줄 감정·말투 칸: 값마다 검사해 깨진 값만 버린다(줄은 살린다). 감정은 Typecast 값 전체, 강도는 네 단계, 말투는 Airy 값
function feelOf(raw: unknown): Feel | undefined {
	const stored = objectOf(raw);
	const typecast = objectOf(stored?.typecast);
	const airy = objectOf(stored?.airy);
	const feel: Feel = {};
	if (
		typecast &&
		hasFeel("typecast_v30", typecast.emotion) &&
		TYPECAST_INTENSITIES.some((step) => step === typecast.intensity)
	)
		feel.typecast = {
			emotion: typecast.emotion as "smart" | EmotionPreset,
			intensity: typecast.intensity as number,
		};
	if (airy && hasFeel("airy", airy.style))
		feel.airy = { style: airy.style as AiryStyle };
	return feel.typecast || feel.airy ? feel : undefined;
}
// 줄 칸: 1~50줄. 줄마다 화자 번호가 범위 밖이면 0, 글이 아닌 칸은 빈 글, 깨진 감정·말투·쉼은 버린다. 줄 id는 새로 만든다
function linesOf(
	raw: unknown,
	speakers: number,
	id: () => string,
): DraftLine[] | null {
	if (!Array.isArray(raw) || raw.length < 1 || raw.length > DRAMA_LINES_MAX)
		return null;
	return raw.map((item) => {
		const stored = objectOf(item);
		const speaker = stored?.speaker;
		const feel = feelOf(stored?.feel);
		const gap = gapOf(stored?.gap);
		return {
			id: id(),
			speaker:
				typeof speaker === "number" &&
				Number.isInteger(speaker) &&
				speaker >= 0 &&
				speaker < speakers
					? speaker
					: 0,
			direction: textOf(stored?.direction),
			text: textOf(stored?.text),
			...(feel ? { feel } : {}),
			...(gap === null ? {} : { gap }),
		};
	});
}
const LINE_INDEX = /^(0|[1-9]\d*)$/;
// 고른 테이크 칸: takeKey마다 {줄 번호(0~49): 테이크 id}. 하나라도 어긋나면 빈 값.
// fromEntries로 만들어 '__proto__' 같은 키가 프로토타입을 바꾸지 않는다
function picksOf(raw: unknown): Draft["picks"] {
	const stored = objectOf(raw);
	if (!stored) return {};
	const picks: [string, Record<number, string>][] = [];
	for (const [key, value] of Object.entries(stored)) {
		const lines = objectOf(value);
		if (!lines) return {};
		const entries = Object.entries(lines);
		if (
			!entries.every(
				([line, take]) =>
					LINE_INDEX.test(line) &&
					Number(line) < DRAMA_LINES_MAX &&
					typeof take === "string",
			)
		)
			return {};
		picks.push([key, Object.fromEntries(entries) as Record<number, string>]);
	}
	return Object.fromEntries(picks);
}
// 칸마다 검사해 깨진 칸만 처음 값으로 둔다(사용자가 고친 값을 한 칸 때문에 모두 잃지 않게, studio readSetup과 같은 뜻).
// 막는 이유를 비켜 가는 값(화자 5개, 범위 밖 화자 번호, 끝난 무료 모델)은 여기서 고친다. 상한을 넘는 글은 지우지 않고 dramaBlock이 막는다(Ruling 14). 서버도 계약과 성우 검사로 거절한다
export function readDraft(
	raw: string | null,
	id: () => string,
	now = Date.now(),
): Draft {
	let stored: Record<string, unknown> = {};
	try {
		stored = objectOf(raw ? JSON.parse(raw) : null) ?? {};
	} catch {
		// 깨진 값은 처음 값으로 시작한다
	}
	const speakers = speakersOf(stored.speakers) ?? firstSpeakers();
	const models = dramaModelsOf(now);
	const settings = objectOf(stored.settings) ?? {};
	return {
		sceneName: textOf(stored.sceneName),
		speakers,
		lines: linesOf(stored.lines, speakers.length, id) ?? [emptyLine(id)],
		model: models.find((model) => model === stored.model) ?? models[0],
		settings: {
			speed: settingOf(settings.speed, RANGES.fish_audio.speed),
			temperature: settingOf(
				settings.temperature,
				RANGES.fish_audio.temperature,
			),
		},
		picks: picksOf(stored.picks),
		gap: gapOf(stored.gap) ?? GAP_DEFAULT,
	};
}

// 그 공급자로 담은 성우이고 이용 가능(같은 id를 다른 공급자로 담았으면 아니다)
const usableVoice = (
	voices: readonly SavedVoice[],
	voiceId: string | null,
	provider: ProviderId,
) => {
	const saved = savedOf(voices, voiceId, provider);
	return saved && !saved.unavailable ? saved.voice : null;
};
// 화자의 성우: 화자 공급자로 담은 이용 가능한 성우, 아니면 null
export const voiceOfSpeaker = (
	speaker: DraftSpeaker,
	saved: readonly SavedVoice[],
): Voice | null => usableVoice(saved, speaker.voiceId, speaker.provider);
// 화자의 성우와 보이는 이름(프리셋이면 '프리셋 이름 · 성우 이름', 브리프 14절 1). 화자 카드 성우 버튼·붙여 넣기 미리 보기가 쓴다.
// 화자 공급자로 담은 이용 가능한 성우만 본다(voiceOfSpeaker). 없으면 null
export function speakerVoice(
	speaker: DraftSpeaker,
	saved: readonly SavedVoice[],
	presets: readonly Preset[],
): { voice: Voice; name: string } | null {
	const voice = voiceOfSpeaker(speaker, saved);
	if (!voice) return null;
	const preset = presets.find((item) => item.id === speaker.presetId);
	return {
		voice,
		name: preset ? `${preset.name} · ${voice.name}` : voice.name,
	};
}
// 성우 버튼 둘째 줄의 모델 짧은 이름: 드라마 모델은 modelName('S2.1 Pro Free'), 그 밖은 공급자 모델 값 그대로(내 문장 듣기 모델 메뉴와 같다)
export function modelText(model: string): string {
	const drama = DRAMA_MODELS.find((each) => each === model);
	return drama ? DRAMA_TEXT.modelName[drama] : model;
}
// 렌더할 때 쓸 수 없는 성우·프리셋을 비운다. 초안(저장 값)은 그대로 둔다.
// 프리셋은 목록에 있고 이용 가능하며 그 성우(공급자·id)가 화자 성우와 같을 때만 남는다
export function usableSpeakers(
	speakers: readonly DraftSpeaker[],
	saved: readonly SavedVoice[],
	presets: readonly Preset[],
): DraftSpeaker[] {
	return speakers.map((speaker) => {
		const voiceId = voiceOfSpeaker(speaker, saved) ? speaker.voiceId : null;
		const preset = presets.find((item) => item.id === speaker.presetId);
		const presetId =
			preset &&
			!preset.unavailable &&
			preset.voice?.provider === speaker.provider &&
			preset.voice.voiceId === voiceId
				? preset.id
				: null;
		return voiceId === speaker.voiceId && presetId === speaker.presetId
			? speaker
			: { ...speaker, voiceId, presetId };
	});
}
// 화자의 설정 한 벌: 프리셋이면 그 공급자·설정 짝, 아니면 화자 공급자의 처음 설정.
// TS가 provider와 settings의 짝을 따라가지 못해 여기서 묶는다(preset-view presetSettingsOf와 같다)
export function speakerValue(
	speaker: DraftSpeaker,
	presets: readonly Preset[],
): PresetValue {
	const preset = presets.find((item) => item.id === speaker.presetId);
	return (
		preset
			? { provider: preset.provider, settings: preset.settings }
			: {
					provider: speaker.provider,
					settings: DEFAULT_SETTINGS[speaker.provider],
				}
	) as PresetValue;
}
// 쓰인 화자(줄의 화자)가 모두 Fish Audio인가. 장면 만들기는 이때만 된다
export const allFish = (
	speakers: readonly DraftSpeaker[],
	lines: readonly Pick<DramaLine, "speaker">[],
) => lines.every((line) => speakers[line.speaker]?.provider === "fish_audio");
// 화자의 연기 family·받는 감정(null이면 제한 없음)·모델. 모두 Fish면 Fish 화자는 머리 모델(장면), 아니면 화자 설정의 모델(읽기).
// Typecast는 성우가 가진 모델로 고치고 감정은 그 성우·모델이 받는 프리셋이다(v30은 smart도 받는다). 성우가 없으면 설정 그대로
export function actingOf(
	speaker: DraftSpeaker,
	voice: Voice | null,
	value: PresetValue,
	headerModel: DramaModel,
	fishOnly: boolean,
): { family: ActingFamily; emotions: string[] | null; model: string } {
	let model: string =
		fishOnly && speaker.provider === "fish_audio"
			? headerModel
			: value.settings.model;
	let emotions: string[] | null = null;
	if (speaker.provider === "typecast" && voice) {
		const models = typecastModelsOf(voice);
		const fixed = models.find((each) => each === model) ?? models[0];
		if (fixed) {
			model = fixed;
			const presets = presetsOf(voice, fixed);
			emotions = fixed === "ssfm-v30" ? ["smart", ...presets] : presets;
		}
	}
	return { family: familyOf(speaker.provider, model), emotions, model };
}

// 줄 감정 칸이 고를 값: 그 family 값 중 성우가 받는 것(emotions는 actingOf 값, null이면 전부). 감정이 없는 family는 빈 목록
export const feelOptions = (
	family: ActingFamily,
	emotions: readonly string[] | null,
) =>
	ACTING[family].feel.filter(
		(tag) => !emotions || emotions.includes(tag.value),
	);
export type FeelShown = { value: string; intensity: number | null };
// 감정 칸이 보일 값(Typecast 감정·강도, Airy 말투). 읽기 요청과 같은 길(applyLine → T5 성우 맞춤)이라 보낼 값이 보인다.
// 줄 값이 없거나 그 family 값이 아니면 화자 설정(프리셋·처음 설정)이다. 감정 칸이 없는 family는 null
export function shownFeel(
	voice: Voice | null,
	value: PresetValue,
	family: ActingFamily,
	feel: Feel | undefined,
): FeelShown | null {
	const applied = applyLine(value, family, { direction: "", text: "", feel });
	if (applied.provider === "airy" && family === "airy")
		return { value: applied.settings.style, intensity: null };
	if (applied.provider !== "typecast" || !family.startsWith("typecast"))
		return null;
	const request =
		voice?.provider === "typecast"
			? trialRequestOf(voice, "", {
					...DEFAULT_SETTINGS,
					typecast: applied.settings,
				})
			: null;
	const settings =
		request?.provider === "typecast" ? request.settings : applied.settings;
	return { value: pressedEmotion(settings), intensity: settings.intensity };
}
// 감정 칸·강도 칩에서 고른 값을 넣은 줄 feel. 다른 공급자 값은 둔다(보이지 않는 값은 지우지 않는다, 스펙 14.2).
// Typecast는 보이던 값에서 고른 쪽(감정 또는 강도)만 바꾸고, 강도는 임시 작업이 읽는 네 단계로 맞춘다. 그 family 값이 아니면 그대로
export function feelPatch(
	family: ActingFamily,
	feel: Feel | undefined,
	shown: FeelShown | null,
	pick: { value: string } | { intensity: number },
): Feel | undefined {
	const value = "value" in pick ? pick.value : (shown?.value ?? "");
	if (!hasFeel(family, value)) return feel;
	if (family === "airy")
		return { ...feel, airy: { style: value as AiryStyle } };
	const raw = "intensity" in pick ? pick.intensity : (shown?.intensity ?? 1);
	return {
		...feel,
		typecast: {
			emotion: value as "smart" | EmotionPreset,
			intensity: snapIntensity(raw),
		},
	};
}
// 감정 칸 글(자동 태그 미리 보기): 값 이름, Typecast는 뒤에 강도(자동이면 강도를 쓰지 않는다). 감정 칸이 없으면 null
export function feelText(
	family: ActingFamily,
	shown: FeelShown | null,
): string | null {
	if (!shown) return null;
	const name =
		ACTING[family].feel.find((tag) => tag.value === shown.value)?.label ??
		shown.value;
	return shown.intensity === null || shown.value === "smart"
		? name
		: `${name} · ${DRAMA_TEXT.intensityLabel} ${shown.intensity}`;
}
// 서버가 voice_unavailable만 줄 때 오류 문구의 화자('스펙과 다른 점' 7): 성우가 없거나 쓸 수 없는 첫 화자. 장면 화자라 Fish Audio다
export function unusableSpeaker(
	speakers: readonly Pick<DraftSpeaker, "voiceId">[],
	voices: readonly SavedVoice[],
): number | null {
	const index = speakers.findIndex(
		(speaker) => !usableVoice(voices, speaker.voiceId, "fish_audio"),
	);
	return index < 0 ? null : index;
}

// 보낼 요청. usableSpeakers를 거친 초안을 받는다. 계약은 모든 화자에 성우를 받으므로 대본에 쓰인 화자만 보내고 번호를 다시 매긴다.
// 쓰인 화자가 모두 Fish Audio가 아니거나 성우가 없으면 null
export function requestOf(draft: Draft): DramaRequest | null {
	if (!allFish(draft.speakers, draft.lines)) return null;
	const speakers: DramaSpeaker[] = [];
	const renumbered = new Map<number, number>();
	for (const index of [
		...new Set(draft.lines.map((line) => line.speaker)),
	].sort((a, b) => a - b)) {
		const speaker = draft.speakers[index];
		if (!speaker || speaker.voiceId === null) return null;
		renumbered.set(index, speakers.length);
		speakers.push({ name: speaker.name, voiceId: speaker.voiceId });
	}
	return {
		sceneName: draft.sceneName,
		speakers,
		lines: draft.lines.map(({ speaker, direction, text }) => ({
			speaker: renumbered.get(speaker) ?? 0,
			direction,
			text,
		})),
		model: draft.model,
		settings: draft.settings,
	};
}

// 막는 이유가 가리키는 칸(그 칸으로 가는 버튼, 디자인 리뷰 D11). 줄은 그 문제가 있는 칸(대사·지시)까지 가리킨다(브리프 5.8).
// voice는 읽기의 성우 없음이다(성우 id가 있어도 저장된 프리셋을 읽지 못한 화자라 늘 성우 창으로 간다)
type BlockTarget =
	| { kind: "speaker"; index: number }
	| { kind: "voice"; index: number }
	| { kind: "line"; id: string; field: "text" | "direction" }
	| null;
type Block = { text: string; target: BlockTarget };
// 정리 뒤 글자가 상한을 넘으면 그 글자 수, 원문이 계약의 원문 상한을 넘으면 원문 길이. 괜찮으면 0
const overBy = (raw: string, chars: number, max: number) =>
	chars > max ? chars : rawFits(raw, max) ? 0 : raw.length;
// [문제인가, 문구, (줄 검사만) 문제가 있는 칸]
type Check<R> = readonly [
	(row: R) => boolean,
	(row: R) => string,
	((row: R) => "text" | "direction")?,
];
// 검사 차례대로 첫 문제를 찾는다(행 순서가 아니라 검사 차례가 먼저다)
function firstProblem<R>(
	rows: readonly R[],
	checks: readonly Check<R>[],
): { row: R; text: string; field: "text" | "direction" } | null {
	for (const [bad, text, field] of checks) {
		const row = rows.find(bad);
		if (row) return { row, text: text(row), field: field?.(row) ?? "text" };
	}
	return null;
}
type SpeakerRow = { index: number; name: string; same: boolean; over: number };
const SPEAKER_CHECKS: Check<SpeakerRow>[] = [
	[(row) => row.name === "", (row) => DRAMA_TEXT.noName(row.index + 1)],
	[(row) => row.same, (row) => DRAMA_TEXT.sameName(row.name)],
	[
		(row) => row.over > 0,
		(row) => DRAMA_TEXT.nameTooLong(row.index + 1, row.over),
	],
];
// 화자 이름 검사 행. 이름은 서버와 같게 정리 뒤 값이고, 겹침은 앞에 같은 이름이 있는 뒤 화자에만 단다(막는 이유가 그 화자를 가리킨다)
function speakerRows(speakers: readonly DraftSpeaker[]): SpeakerRow[] {
	const names = speakers.map((speaker) => normalizeText(speaker.name));
	return speakers.map((raw, index) => {
		const name = names[index] ?? "";
		return {
			index,
			name,
			same: names.indexOf(name) < index,
			over: overBy(raw.name, codePoints(name), DRAMA_NAME_MAX),
		};
	});
}
// 화자 카드 이름 칸의 경고 경계(브리프 5.3): 막는 이유의 이름 검사(빈·겹침·20자 초과) 중 하나라도 걸리는 화자
export const badSpeakerNames = (speakers: readonly DraftSpeaker[]) =>
	speakerRows(speakers).map((row) => SPEAKER_CHECKS.some(([bad]) => bad(row)));
// '화자 추가'의 이름: 카드 자리(화자 수 + 1)의 '화자 N'부터, 쓰는 이름이면 하나씩 올린다. 이름 검사와 같은 정리 뒤 이름과 비교해 겹침으로 막히지 않는다
export function nextSpeakerName(speakers: readonly DraftSpeaker[]): string {
	const names = new Set(speakerRows(speakers).map((row) => row.name));
	let i = speakers.length + 1;
	while (names.has(DRAMA_TEXT.speakerName(i))) i++;
	return DRAMA_TEXT.speakerName(i);
}
type LineRow = {
	id: string;
	n: number;
	text: string;
	direction: string;
	textOver: number;
	directionOver: number;
};
const LINE_CHECKS: Check<LineRow>[] = [
	[
		(row) => row.text === "",
		(row) => DRAMA_TEXT.emptyLine(row.n),
		() => "text",
	],
	[
		(row) => row.textOver > 0,
		(row) => DRAMA_TEXT.lineTooLong(row.n, row.textOver),
		() => "text",
	],
	[
		(row) => row.directionOver > 0,
		(row) => DRAMA_TEXT.directionTooLong(row.n, row.directionOver),
		() => "direction",
	],
	// 화자 표식 끼워 넣기(계약 noMarker와 같은 정리 뒤 값). 대사에 있으면 대사 칸, 지시에만 있으면 지시 칸
	[
		(row) => row.text.includes("<|") || row.direction.includes("<|"),
		(row) => DRAMA_TEXT.marker(row.n),
		(row) => (row.text.includes("<|") ? "text" : "direction"),
	],
];
// 채운 '성우 고르기'를 붙일 화자: 줄이 쓰는 화자(줄 수 > 0) 중 성우 없는 첫 화자. 막는 이유(dramaBlock)가 가리키는 화자와 같다
export const firstEmptySpeaker = (
	speakers: readonly DraftSpeaker[],
	lineCounts: readonly number[],
): number | null => {
	const at = speakers.findIndex(
		(speaker, i) => speaker.voiceId === null && (lineCounts[i] ?? 0) > 0,
	);
	return at < 0 ? null : at;
};
// '장면 만들기'를 막는 이유(브리프 8절, 이 순서. 섞인 화자가 그 앞, 14절). 없으면 null. 글자는 서버와 같게 정리 뒤 코드 포인트로 세고,
// 원문이 계약의 원문 상한을 넘어도 막는다(서버 BAD_REQUEST가 '다시 해 주세요'로 보이지 않게).
// 다른 생성 진행 중·대기 시각은 서버 거절 뒤 오류 줄이다('스펙과 다른 점' 5)
export function dramaBlock(input: {
	sceneName: string;
	speakers: readonly DraftSpeaker[];
	lines: readonly DraftLine[];
	speed: number;
}): { text: string; target: BlockTarget } | null {
	// 장면은 Fish Audio 화자만 만든다. 섞이면 읽기를 쓴다(Part 2, 이동 버튼 없음)
	if (!allFish(input.speakers, input.lines))
		return { text: DRAMA_TEXT.mixedBlock, target: null };
	const rows = speakerRows(input.speakers);
	// 성우는 대본의 줄이 쓰는 화자만 요구한다(사용자 결정 2026-10-22). 이름은 카드에 보이므로 모든 카드를 본다
	const used = new Set(input.lines.map((line) => line.speaker));
	const noVoice = input.speakers.findIndex(
		(speaker, i) => used.has(i) && speaker.voiceId === null,
	);
	if (noVoice >= 0)
		return {
			text: DRAMA_TEXT.noVoice(
				rows[noVoice]?.name || DRAMA_TEXT.speakerName(noVoice + 1),
			),
			target: { kind: "speaker", index: noVoice },
		};
	const script = scriptBlock(input.speakers, input.lines);
	if (script) return script;
	const scene = overBy(
		input.sceneName,
		codePoints(normalizeText(input.sceneName)),
		DRAMA_SCENE_NAME_MAX,
	);
	if (scene > 0)
		return { text: DRAMA_TEXT.sceneNameTooLong(scene), target: null };
	const chars = sceneChars(input.lines);
	const limit = sceneLimit(input.speed);
	if (chars > limit)
		return {
			text: DRAMA_TEXT.tooLong(limit, chars, input.speed),
			target: null,
		};
	return null;
}
// 서버 계약이 거절할 이름·줄(브리프 8절 차례): 이름 빔·겹침·20자 초과 → 대사 빔·300자 초과 → 지시 60자 초과 → 화자 표식(<|).
// 성우·섞임·장면 이름·글자 상한은 보지 않는다. dramaBlock과 전체 자동 태그(autoTagBlock)가 함께 쓴다(수정 회차 1).
// skipEmpty면 대사가 빈 줄을 건너뛴다(자동 태그는 빼고 보낸다). 줄 번호는 원래 차례 그대로다
export function scriptBlock(
	speakers: readonly DraftSpeaker[],
	lines: readonly DraftLine[],
	skipEmpty = false,
): Block | null {
	const speaker = firstProblem(speakerRows(speakers), SPEAKER_CHECKS);
	if (speaker)
		return {
			text: speaker.text,
			target: { kind: "speaker", index: speaker.row.index },
		};
	const line = firstProblem(
		lines
			.map((raw, i): LineRow => {
				const text = normalizeText(raw.text);
				const direction = cleanDirection(raw.direction);
				return {
					id: raw.id,
					n: i + 1,
					text,
					direction,
					textOver: overBy(raw.text, codePoints(text), DRAMA_LINE_MAX),
					directionOver: overBy(
						raw.direction,
						codePoints(direction),
						DRAMA_DIRECTION_MAX,
					),
				};
			})
			.filter((row) => !skipEmpty || row.text !== ""),
		LINE_CHECKS,
	);
	return line
		? {
				text: line.text,
				target: { kind: "line", id: line.row.id, field: line.field },
			}
		: null;
}

// 읽기를 막는 이유(브리프 14절 문구). readRequests의 problem을 막대 이유 줄로 옮긴다: 성우 없음은 그 화자의 성우 창,
// 줄 문제는 그 줄 대사 칸(번호는 지금 줄 차례). 그냥 빈 대사는 장면과 같은 emptyLine이다(태그만 있는 줄만 readEmptyBlock)
export function readBlockOf(
	problem: ReadProblem,
	speakers: readonly Pick<DraftSpeaker, "name">[],
	lines: readonly Pick<DraftLine, "id" | "text">[],
): Block {
	const { lineId } = problem;
	if (problem.kind === "voice" || lineId === null) {
		const index = problem.speaker ?? 0;
		return {
			text: DRAMA_TEXT.readVoiceBlock(speakerNameOf(speakers, index)),
			target: { kind: "voice", index },
		};
	}
	const at = lines.findIndex((line) => line.id === lineId);
	const n = at + 1;
	return {
		text:
			problem.kind === "long"
				? DRAMA_TEXT.readLongBlock(n)
				: normalizeText(lines[at]?.text ?? "") === ""
					? DRAMA_TEXT.emptyLine(n)
					: DRAMA_TEXT.readEmptyBlock(n),
		target: { kind: "line", id: lineId, field: "text" },
	};
}
export type BarReason = Block & { for: ("scene" | "read")[] };
// 막대에 보이는 막는 이유 하나(브리프 5.8 '한 번에 하나', 17절 9): 장면 이유가 먼저이고 없으면 읽기 이유다(Fish 대본의 읽기는 ▾ '다른 방법' 안).
// 혼합 대본은 장면 버튼이 없어 장면 자리에 null을 넘긴다(읽기 이유만 보인다).
// for는 이 줄이 이유인 버튼이다(같은 글이면 둘 다). 보이지 않는 이유로 잠긴 버튼은 화면이 화면 밖 글로 잇는다
export function barReason(
	fishOnly: boolean,
	scene: Block | null,
	read: Block | null,
): BarReason | null {
	const [first, second] = fishOnly
		? ([
				["scene", scene],
				["read", read],
			] as const)
		: ([
				["read", read],
				["scene", scene],
			] as const);
	const [who, shown] = first[1] ? first : second;
	if (!shown) return null;
	const other = who === first[0] ? second : first;
	return {
		...shown,
		for: other[1]?.text === shown.text ? [first[0], second[0]] : [who],
	};
}

// 막대 예상 줄: 장면 글자(상한과 견줌)와 보낼 글의 UTF-8 바이트(화자 표식 포함, 과금 단위), 사용량.
// 성우 없는 화자도 빈 id로 세어 고르기 전부터 보인다(보낼 글은 성우 id와 상관없다)
export function countLine(
	draft: Pick<Draft, "speakers" | "lines" | "model" | "settings">,
	now = Date.now(),
): { chars: number; limit: number; bytes: number; usage: Usage } {
	const { text } = sceneText({
		speakers: draft.speakers.map((speaker) => ({
			name: speaker.name,
			voiceId: speaker.voiceId ?? "",
		})),
		lines: draft.lines,
	});
	const bytes = utf8Bytes(text);
	return {
		chars: sceneChars(draft.lines),
		limit: sceneLimit(draft.settings.speed),
		bytes,
		usage: dramaUsage(draft.model, bytes, now),
	};
}

// 나누지 못함 경고 한 줄('스펙과 다른 점' 13, 막지 않는다)
export function splitWarning(
	lines: readonly Pick<DramaLine, "text">[],
): string | null {
	const risk = splitRisk(lines);
	if (risk === "no_text") return DRAMA_TEXT.splitNoText;
	if (risk === "tag_word") return DRAMA_TEXT.splitTagWord;
	return null;
}

// Enter로 만든 새 줄의 화자: 다음 화자, 끝이면 처음(두 화자면 번갈아)
export const nextSpeaker = (speaker: number, count: number) =>
	(speaker + 1) % count;

// 붙여 넣기 줄 모양 '이름: 대사'(콜론 : 또는 전각 ：). 이름은 첫 콜론 앞이다(대사 속 콜론은 대사).
// 줄은 \r·\n으로만 나누므로 대사에 남는 줄 구분 문자(U+2028·U+2029)도 대사다(. 대신 [\s\S], s 플래그는 ES2018 타깃이 필요하다)
const PASTE_LINE = /^([^:：]*)[:：]([\s\S]*)$/;
const LETTER = /\p{L}/u;
export type PasteResult =
	| { speakers: DraftSpeaker[]; lines: DraftLine[]; from: (number | null)[] }
	| { error: "too_many_speakers" | "too_many_lines" | "empty" };
// 대본 붙여 넣기 '바꾸기'(브리프 5.6 화자 규칙 1~7). 이름은 글자를 하나 이상 품고 20자 이하라 '12:30 회의야'는 이름 없는 줄이다.
// 이름이 나온 순서대로 화자를 새로 만들고, from[i]는 새 화자 i가 성우(공급자·성우·프리셋)를 잇는 지금 화자의 번호다(없으면 null, Ruling 18).
// 이름이 하나라도 겹치면 겹친 이름만, 하나도 안 겹치면 차례대로 잇는다. 이름이 하나도 없으면 지금 화자 그대로(from은 제자리).
// 이름 없는 줄은 앞 줄의 화자(첫 이름 앞이면 첫 화자). 빈 줄과 대사가 빈 이름 줄은 건너뛰고 화자도 만들지 않는다.
// 대사는 자르지 않고(301자도 그대로, 막는 이유가 말한다) 지시를 읽지 않는다(대사 속 [ ]·< >는 태그 그대로)
export function parsePaste(
	raw: string,
	speakers: readonly DraftSpeaker[],
	id: () => string,
): PasteResult {
	const names: string[] = [];
	const rows: { name: string | null; text: string }[] = [];
	for (const row of raw.split(/\r\n|\r|\n/)) {
		const match = PASTE_LINE.exec(row);
		const name = normalizeText(match?.[1] ?? "");
		const named = LETTER.test(name) && codePoints(name) <= DRAMA_NAME_MAX;
		const text = normalizeText(named ? (match?.[2] ?? "") : row);
		if (text === "") continue;
		if (named && !names.includes(name)) names.push(name);
		rows.push({ name: named ? name : null, text });
	}
	if (names.length > DRAMA_SPEAKERS_MAX) return { error: "too_many_speakers" };
	if (rows.length > DRAMA_LINES_MAX) return { error: "too_many_lines" };
	if (rows.length === 0) return { error: "empty" };
	const lineOf = (speaker: number, text: string): DraftLine => ({
		id: id(),
		speaker,
		direction: "",
		text,
	});
	if (names.length === 0)
		return {
			speakers: [...speakers],
			lines: rows.map((row) => lineOf(0, row.text)),
			from: speakers.map((_, i) => i),
		};
	const current = speakers.map((speaker) => normalizeText(speaker.name));
	const overlap = names.some((name) => current.includes(name));
	const from = names.map((name, i) => {
		const at = overlap ? current.indexOf(name) : i;
		return at >= 0 && at < speakers.length ? at : null;
	});
	let speaker = 0;
	return {
		speakers: names.map((name, i) => {
			const carried = speakers[from[i] ?? -1];
			return carried
				? {
						name,
						provider: carried.provider,
						voiceId: carried.voiceId,
						presetId: carried.presetId,
					}
				: newSpeaker(name);
		}),
		lines: rows.map((row) => {
			if (row.name !== null) speaker = names.indexOf(row.name);
			return lineOf(speaker, row.text);
		}),
		from,
	};
}

// 소리 뱃지: 커서 위치에 '태그 '를 넣고 커서를 그 뒤로(위치는 UTF-16 단위, textarea selectionStart와 같다).
// 값은 태그 전체 글이다(ACTING의 sound, [sighs]·<sigh>, '스펙과 다른 점' 19)
export function insertSound(
	text: string,
	at: number,
	tag: string,
): { text: string; caret: number } {
	const inserted = `${tag} `;
	return {
		text: `${text.slice(0, at)}${inserted}${text.slice(at)}`,
		caret: at + inserted.length,
	};
}
// 범위 뱃지: 고른 글자를 감싸고 안쪽 글자를 고른다. 빈 범위면 빈 쌍을 넣고 커서를 가운데에
export function wrapSpan(
	text: string,
	start: number,
	end: number,
	value: string,
): { text: string; start: number; end: number } {
	const open = `<${value}>`;
	return {
		text: `${text.slice(0, start)}${open}${text.slice(start, end)}</${value}>${text.slice(end)}`,
		start: start + open.length,
		end: end + open.length,
	};
}
// 뱃지 하나가 칸 글을 바꾸는 범위 [from, to)와 바뀐 글, 넣은 뒤 고를 범위(브리프 5.5, DN-6). [from, to) 밖의 글은 그대로라
// 그 자리에 바뀐 글의 가운데만 insertText로 넣으면 된다. 분위기는 지시 칸 전체를 덮어쓴다.
// 소리·범위는 대사 칸의 마지막 커서 자리이고(소리는 고른 글자를 지우지 않고 그 앞에), 마지막 칸이 지시였으면 대사 끝이다.
// value는 소리면 태그 전체 글, 범위면 이름, 분위기면 지시 글이다(ACTING)
export function badgeEdit(
	kind: "sound" | "span" | "mood",
	old: string,
	at: { field: "text" | "direction"; start: number; end: number },
	value: string,
): { from: number; to: number; text: string; select: [number, number] } {
	if (kind === "mood")
		return {
			from: 0,
			to: old.length,
			text: value,
			select: [value.length, value.length],
		};
	const from =
		at.field === "text" ? Math.min(at.start, old.length) : old.length;
	const to =
		at.field === "text" ? Math.min(Math.max(at.end, from), old.length) : from;
	if (kind === "sound") {
		const { text, caret } = insertSound(old, from, value);
		return { from, to: from, text, select: [caret, caret] };
	}
	const { text, start, end } = wrapSpan(old, from, to, value);
	return { from, to, text, select: [start, end] };
}
// 대사 칸 뒤판 강조. 나누기가 지시·태그로 보는 식(drama-script TAGS)을 그대로 쓴다.
// matchAll은 식을 복사하면서 lastIndex도 이어받으므로, 함께 쓰는 전역 식의 남은 lastIndex를 피해 새 식으로 찾는다(Ruling 14)
export function tagSpans(text: string): { text: string; tag: boolean }[] {
	const spans: { text: string; tag: boolean }[] = [];
	let at = 0;
	for (const match of text.matchAll(new RegExp(TAGS))) {
		if (match.index > at)
			spans.push({ text: text.slice(at, match.index), tag: false });
		spans.push({ text: match[0], tag: true });
		at = match.index + match[0].length;
	}
	if (at < text.length) spans.push({ text: text.slice(at), tag: false });
	return spans;
}

// 파일 이름(스펙 2절). 못 쓰는 글자와 공백은 _, 시각은 테이크를 만든 한국 시간, NN은 두 자리 줄 번호.
// 장면 파일의 가운데 말은 파일 형식이라 문구(장면 이름 기본값)와 따로 둔다
const SCENE_FILE_WORD = "장면";
const sceneOf = (sceneName: string) =>
	safeName(normalizeText(sceneName) || DRAMA_TEXT.scenePlaceholder);
export const sceneFileName = (sceneName: string, createdAt: string) =>
	`${sceneOf(sceneName)}_${SCENE_FILE_WORD}_${kstStamp(createdAt)}.wav`;
// 받기 zip의 줄 파일은 공급자 형식 그대로다(MP3·WAV, 스펙 14.2). 장면 대사는 WAV
export const lineFileName = (
	sceneName: string,
	index: number,
	speaker: string,
	ext: "wav" | "mp3" = "wav",
) =>
	`${sceneOf(sceneName)}_${String(index + 1).padStart(2, "0")}_${safeName(normalizeText(speaker))}.${ext}`;
export const zipFileName = (sceneName: string, createdAt: string) =>
	`${sceneOf(sceneName)}_${kstStamp(createdAt)}.zip`;
// 받은 대본을 이은 WAV(스펙 15.2·16절). 시각은 받은 때다(zip과 같다)
export const joinFileName = (sceneName: string, createdAt: string) =>
	`${sceneOf(sceneName)}_읽기_${kstStamp(createdAt)}.wav`;
// 무대 테이크의 대사 조각을 쉼 넣어 이은 WAV(스펙 17.2). 시각은 무대 테이크를 만든 때다(장면 파일과 같다)
export const takeJoinFileName = (sceneName: string, createdAt: string) =>
	`${sceneOf(sceneName)}_이음_${kstStamp(createdAt)}.wav`;

// 대사별로 나눈 테이크: 완료이고 구간 수 = 줄 수
export const splitOk = (take: DramaItem) =>
	take.status === "done" && take.segments?.length === take.request.lines.length;
// 줄마다 고를 수 있는 테이크(스펙 2절 '테이크 묶기', 계획 리뷰 E5): 같은 대본·같은 성우(takeKey)이고 나눈 테이크, 오래된 순
export function takeGroup(
	items: readonly DramaItem[],
	shown: DramaItem,
): DramaItem[] {
	const key = takeKey(shown.request);
	return items
		.filter((item) => splitOk(item) && takeKey(item.request) === key)
		.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
// 줄마다 받을 테이크. 고르지 않았거나 고른 테이크가 그룹에 없으면(지움·다른 대본) 무대의 테이크
export function pickedTakes(
	group: readonly DramaItem[],
	picks: Readonly<Record<number, string>>,
	shown: DramaItem,
): DramaItem[] {
	return shown.request.lines.map(
		(_, line) => group.find((take) => take.id === picks[line]) ?? shown,
	);
}
// 테이크 칩 모양(브리프 5.10). used는 그 줄이 쓰는 테이크(pickedTakes), pick은 그 줄에 저장된 고른 값.
// 쓰는 테이크의 칩만 눌려 있고, 고른 값이 바로 그것이면 고름(채움 + Check), 아니면(고르지 않음·그룹에 없는 값) 무대 따라감(테두리만)
export const chipStateOf = (
	takeId: string,
	pick: string | undefined,
	used: string,
): "picked" | "follows" | "off" =>
	takeId !== used ? "off" : pick === used ? "picked" : "follows";
// '모든 줄을 이 테이크로'(브리프 5.10): 한 대본(takeKey)의 고른 값을 뺀다. 다른 대본의 고른 값은 그대로다
export const withoutPicks = (
	picks: Draft["picks"],
	key: string,
): Draft["picks"] =>
	Object.fromEntries(Object.entries(picks).filter(([each]) => each !== key));
// 실행 취소(Ruling 18): 고치기 직전의 저장된 화자(성우 id 그대로)·줄(scene이면 장면 이름도)을 잡아, 지금 초안에서 그 칸만 되살린 초안을 셈한다.
// 모델·샘플링·고른 테이크는 지금 값 그대로다. 보이는 화자(usableSpeakers)가 아니라 저장된 화자를 넘기므로 목록 받기 실패 중에도 성우 id를 잃지 않는다
type Script = Pick<Draft, "sceneName" | "speakers" | "lines">;
export function scriptUndo(before: Script, scene: boolean) {
	const { sceneName, speakers, lines } = before;
	return <D extends Script>(now: D): D =>
		scene
			? { ...now, sceneName, speakers, lines }
			: { ...now, speakers, lines };
}
// 그 실행 취소: 뺀 값을 그 대본에만 되살린다(비운 뒤 같은 대본에서 고른 값은 비우기 전 값으로). 뺀 값이 없었으면 그대로
export const restorePicks = (
	picks: Draft["picks"],
	key: string,
	kept: Draft["picks"][string] | undefined,
): Draft["picks"] => (kept ? { ...picks, [key]: kept } : picks);
// 무대에 올릴 테이크(브리프 5.10·5.11): 그 대본(takeKey)의 가장 새 완료 테이크 id. 미확인은 빼고, 나누지 못한 완료 테이크는 넣는다.
// except는 방금 지운 테이크. 목록은 최근 순이다(listDrama). 없으면 null(빈 무대)
export const newestOf = (
	items: readonly DramaItem[],
	key: string,
	except?: string,
) =>
	items.find(
		(item) =>
			item.status === "done" &&
			item.id !== except &&
			takeKey(item.request) === key,
	)?.id ?? null;

// 드라마 오류 줄(브리프 8절). 드라마 문구가 따로 있는 사유만 여기서, 나머지(키·인증·권한 등)는 T5 Fish Audio 문구다(계획 리뷰 P2).
// fishCredit이면 막대가 API 크레딧 충전 바깥 링크를, takes면 '이전 테이크 보기'를 붙인다
export function dramaProblemText(
	problem: TrialProblem,
	speaker: string | null,
): {
	text: string;
	connections: boolean;
	takes?: boolean;
	fishCredit?: boolean;
} {
	switch (problem.reason) {
		case "quota":
			return {
				text: DRAMA_TEXT.fishCredit,
				connections: false,
				fishCredit: true,
			};
		case "voice_unavailable":
			return {
				text:
					speaker === null
						? DRAMA_TEXT.voiceRejectedUnknown
						: DRAMA_TEXT.voiceRejected(speaker),
				connections: false,
			};
		case "unknown_outcome":
			return {
				text: DRAMA_TEXT.unknownOutcome,
				connections: false,
				takes: true,
			};
		case "in_progress":
			return { text: DRAMA_TEXT.inProgress, connections: false };
		case "free_ended":
			return { text: DRAMA_TEXT.freeEnded, connections: false };
		case "storage":
			return { text: DRAMA_TEXT.storage, connections: false };
		case "rate_limit":
			if (problem.retryAt)
				return {
					text: DRAMA_TEXT.retryAfter(retryTime(problem.retryAt)),
					connections: false,
				};
			break;
		case "provider_input":
			if (problem.providerCode === "audio_too_large")
				return { text: DRAMA_TEXT.audioTooLarge, connections: false };
			break;
		case "unexpected":
			return { text: DRAMA_TEXT.unexpected, connections: false };
	}
	return trialProblemText("fish_audio", problem);
}

// 무대·이전 테이크·막대·확인 창의 계산(Task 11, Ruling 12). 화면 없이 테스트하는 순수 함수다

// 테이크 길이(초): WAV 머리를 뺀 16비트 모노 44.1kHz 바이트(브리프 5.11 "(bytes − 44) / 88200"). 미확인(0바이트)은 0
export const takeSeconds = (bytes: number) =>
	pcmSeconds(Math.max(0, bytes - WAV_HEADER_BYTES));
// 테이크를 만든 한국 시간 "10:42"(파일 이름의 시각과 같은 기준)
export function takeTime(createdAt: string): string {
	const stamp = kstStamp(createdAt);
	return `${stamp.slice(9, 11)}:${stamp.slice(11)}`;
}
// 대본에 나오는 화자 번호(처음 나온 순서). 쓰이지 않는 화자는 빠진다(확인 창 화자 줄, 이전 테이크 둘째 줄)
export const castOrder = (lines: readonly Pick<DramaLine, "speaker">[]) => [
	...new Set(lines.map((line) => line.speaker)),
];
// 앞 max자(코드 포인트), 넘으면 …
function headOf(text: string, max: number): string {
	const chars = [...text];
	return chars.length > max ? `${chars.slice(0, max).join("")}…` : text;
}
// 확인 창 '대본': 대사를 이어 붙인 앞 100자(브리프 5.9)
export const scriptHead = (lines: readonly Pick<DramaLine, "text">[]) =>
	headOf(lines.map((line) => normalizeText(line.text)).join(" "), 100);
// 샘플링 값 이름과 지금 값("속도 1.20배"). changed면 처음 값이 아닌 것만, 아니면 처음 값인 것만
const samplingParts = (settings: DramaSettings, changed: boolean) =>
	(["temperature", "speed"] as const)
		.filter((field) => (settings[field] !== DRAMA_SETTINGS[field]) === changed)
		.map(
			(field) => `${DRAMA_TEXT[field]} ${valueText(field, settings[field])}`,
		);
// 막대 '샘플링' 글자(768px 이상): 처음 값이 아닌 값만 붙인다(브리프 5.8). 모두 처음 값이면 '샘플링'
export function samplingText(settings: DramaSettings): string {
	const parts = samplingParts(settings, true);
	return parts.length > 0
		? DRAMA_TEXT.samplingSummary(parts.join(" · "))
		: DRAMA_TEXT.sampling;
}
// 나누지 못한 이유 한 문장(브리프 5.10 표, 위에서부터)
export function notSplitReason(take: Pick<DramaItem, "request">): string {
	const risk = splitRisk(take.request.lines);
	if (risk === "no_text") return DRAMA_TEXT.notSplitNoText;
	if (risk === "tag_word") return DRAMA_TEXT.notSplitTagWord;
	return take.request.model === "drama-3"
		? DRAMA_TEXT.notSplitDrama3
		: DRAMA_TEXT.notSplitMismatch;
}
// 무대 캡션(브리프 5.10): 둘 이상인 그룹 안이면 "테이크 2 / 3 · 10:42 · Drama 3 · 18.3초", 아니면(하나뿐, 나누지 못함) 번호 없이
export function stageCaption(
	take: DramaItem,
	group: readonly DramaItem[],
): string {
	const time = takeTime(take.createdAt);
	const model = DRAMA_TEXT.modelName[take.request.model];
	const seconds = takeSeconds(take.bytes);
	const at = group.findIndex((item) => item.id === take.id);
	return group.length > 1 && at >= 0
		? DRAMA_TEXT.takeCaption(at + 1, group.length, time, model, seconds)
		: DRAMA_TEXT.takeCaptionShort(time, model, seconds);
}
// '대사별 파일' 안내(브리프 5.10, 리뷰 D16). 줄마다 받을 테이크(pickedTakes)가 섞였으면 그 테이크 번호(그룹 안, 오름차순)
export function zipNoteOf(
	group: readonly DramaItem[],
	picked: readonly DramaItem[],
): string {
	const numbers = [
		...new Set(
			picked.map((take) => group.findIndex((item) => item.id === take.id) + 1),
		),
	]
		.filter((number) => number > 0)
		.sort((a, b) => a - b);
	return `${DRAMA_TEXT.zipNote(picked.length)}${numbers.length > 1 ? DRAMA_TEXT.zipMixed(numbers) : ""}`;
}
// 무대 줄·이전 테이크 제목의 대사: 태그를 뺀 글(브리프 5.10). 태그가 빠진 자리의 공백은 하나로
export const lineText = (text: string) =>
	normalizeText(text.replace(TAGS, "").replace(/\s+/g, " "));
// 이전 테이크 첫째 줄(브리프 5.11): 장면 이름(없으면 '장면') · 첫 줄 대사 앞 20자
export const takeTitleOf = (take: Pick<DramaItem, "request">) =>
	DRAMA_TEXT.takeTitle(
		normalizeText(take.request.sceneName) || DRAMA_TEXT.scenePlaceholder,
		headOf(lineText(take.request.lines[0]?.text ?? ""), 20),
	);
// 이전 테이크 둘째 줄(브리프 5.11): 언제 · 모델 · 화자들 · 길이 · 사용량. 미확인은 길이 없이 끝에 '사용 여부 미확인'
export function takeLineOf(take: DramaItem, now: Date): string {
	const when = resultWhen(take.createdAt, now);
	const model = DRAMA_TEXT.modelName[take.request.model];
	const speakers = castOrder(take.request.lines).map((index) =>
		normalizeText(take.request.speakers[index]?.name ?? ""),
	);
	return take.status === "unknown"
		? `${when} · ${model} · ${speakers.join("·")} · ${usageText(take.usage)} · ${DRAMA_TEXT.unknownUsage}`
		: DRAMA_TEXT.takeLine(
				when,
				model,
				speakers,
				takeSeconds(take.bytes),
				take.usage,
			);
}

// '다시 불러오기' 성공 뒤 제목으로 포커스를 옮길지. 버튼이 사라져 body로 빠졌어도, 받는 동안 사용자가 다른 곳을 눌렀으면 옮기지 않는다
export function refocusAfterReload(state: {
	success: boolean;
	activeIsButton: boolean;
	activeIsBody: boolean;
	userMoved: boolean;
}): boolean {
	return (
		state.success &&
		!state.userMoved &&
		(state.activeIsButton || state.activeIsBody)
	);
}

// 전체 자동 태그(브리프 14절 배치 6, 스펙 14.5). 보낸 줄(그때의 줄 객체와 번호, 보낸 지시)을 기억해 미리 보기와 '모두 바꾸기'가 쓴다
export type AutoTagSent = { line: DraftLine; n: number; direction: string };
type AutoTagLine = Pick<DraftLine, "direction" | "text" | "feel">;
export type AutoTagChange = AutoTagSent & {
	fields: {
		field: "direction" | "text" | "feel";
		before: string;
		after: string;
	}[];
	// 바뀐 칸만 넣는다(바뀌지 않은 칸은 사용자 원문 그대로 둔다)
	patch: Partial<AutoTagLine>;
};

// 줄마다 보낼 지시. 지시 칸이 숨은 화자(front 없는 family)의 줄은 빈 값이다(고칠 칸이 없고 공급자로 가지도 않는다, 숨은 지시는 줄에 둔다)
function directionSent(
	speakers: readonly DraftSpeaker[],
	cast: (index: number) => { family: ActingFamily },
) {
	const hidden = speakers.map(
		(_, i) => ACTING[cast(i).family].front.length === 0,
	);
	return (line: DraftLine) => (hidden[line.speaker] ? "" : line.direction);
}

// 입력. 빈 대사는 계약이 받지 않으므로 대사가 있는 줄만 보내고, 그 줄이 쓰는 화자만 번호를 다시 매긴다(requestOf와 같다).
// cast(i)는 화자 i의 연기 family·모델·받는 감정(DramaProvider.actingOf), 이름은 보이는 이름이다
export function autoTagInput(
	speakers: readonly DraftSpeaker[],
	lines: readonly DraftLine[],
	cast: (index: number) => {
		family: ActingFamily;
		model: string;
		emotions: string[] | null;
	},
	fishOnly: boolean,
) {
	const directionOf = directionSent(speakers, cast);
	const sent: AutoTagSent[] = [];
	lines.forEach((line, i) => {
		if (normalizeText(line.text) !== "")
			sent.push({ line, n: i + 1, direction: directionOf(line) });
	});
	const used = [...new Set(sent.map(({ line }) => line.speaker))].sort(
		(a, b) => a - b,
	);
	const renumbered = new Map(used.map((index, i) => [index, i]));
	return {
		sent,
		input: {
			mode: fishOnly ? ("scene" as const) : ("read" as const),
			speakers: used.map((index) => {
				const { model, emotions } = cast(index);
				return {
					name: speakerNameOf(speakers, index),
					provider: (speakers[index] ?? newSpeaker("")).provider,
					model,
					emotions,
				};
			}),
			lines: sent.map(({ line, direction }) => ({
				speaker: renumbered.get(line.speaker) ?? 0,
				direction,
				text: line.text,
				feel: line.feel,
			})),
		},
	};
}

// 미리 보기의 바뀐 줄(보낸 차례). 보낸 값과 답을 모두 정리해(normalizeText·cleanDirection) 견주고 넣을 값도 정리한 값이다
// (앞뒤·지시 공백만 다른 제안은 바뀐 칸이 아니다). 지시는 줄 값이 아니라 보낸 지시와 견준다(숨은 지시를 빈 답으로 지우지 않는다).
// 감정은 보이는 글(label: 그 줄 화자의 감정 칸 글, 칸이 없으면 null)로 견준다(성우 설정과 같은 값을 줄에 적는 제안은 바꾸지 않는다)
export function autoTagChanges(
	sent: readonly AutoTagSent[],
	reply: readonly AutoTagLine[],
	label: (line: DraftLine, feel: Feel | undefined) => string | null,
): AutoTagChange[] {
	return sent.flatMap((item, i) => {
		const { line } = item;
		const next = reply[i];
		if (!next) return [];
		const fields: AutoTagChange["fields"] = [];
		const patch: AutoTagChange["patch"] = {};
		const direction = cleanDirection(item.direction);
		const nextDirection = cleanDirection(next.direction);
		if (nextDirection !== direction) {
			fields.push({
				field: "direction",
				before: direction,
				after: nextDirection,
			});
			patch.direction = nextDirection;
		}
		const text = normalizeText(line.text);
		const nextText = normalizeText(next.text);
		if (nextText !== text) {
			fields.push({ field: "text", before: text, after: nextText });
			patch.text = nextText;
		}
		const before = label(line, line.feel);
		const after = label(line, next.feel);
		if (before !== null && after !== null && before !== after) {
			fields.push({ field: "feel", before, after });
			patch.feel = next.feel;
		}
		return fields.length > 0 ? [{ ...item, fields, patch }] : [];
	});
}

const sameFeel = (a: Feel | undefined, b: Feel | undefined) =>
	a?.typecast?.emotion === b?.typecast?.emotion &&
	a?.typecast?.intensity === b?.typecast?.intensity &&
	a?.airy?.style === b?.airy?.style;
// '모두 바꾸기': 보낸 뒤 바뀌지 않은 줄만 id로 찾아(옮긴 줄도 찾는다) 바뀐 칸을 넣는다.
// 그사이 고쳤거나(화자·지시·대사·감정) 지운 줄은 건너뛰고 센다(autoTagChanged)
export function autoTagApply(
	lines: readonly DraftLine[],
	changes: readonly AutoTagChange[],
): { lines: DraftLine[]; applied: number; changed: number } {
	const byId = new Map(lines.map((line) => [line.id, line]));
	const patches = new Map<string, AutoTagChange["patch"]>();
	for (const { line, patch } of changes) {
		const now = byId.get(line.id);
		if (
			now &&
			now.speaker === line.speaker &&
			now.direction === line.direction &&
			now.text === line.text &&
			sameFeel(now.feel, line.feel)
		)
			patches.set(line.id, patch);
	}
	return {
		lines: lines.map((line) => {
			const patch = patches.get(line.id);
			return patch ? { ...line, ...patch } : line;
		}),
		applied: patches.size,
		changed: changes.length - patches.size,
	};
}

// 자동 태그 버튼을 잠그는 이유(브리프 14절 배치 6): 서버 계약이 거절할 이름·줄(scriptBlock)이 먼저, 그다음 대본 합계 2,000자.
// 화자가 섞여도 본다(dramaBlock은 섞이면 mixedBlock에서 멈춘다). 빈 대사 줄은 입력이 빼고 보내므로 건너뛰고,
// 대사가 하나도 없을 때만 보낼 줄이 없어 빈 줄 이유로 잠근다. 지시는 입력처럼 보낼 지시로 잰다(숨은 지시는 재지 않는다)
export function autoTagBlock(
	speakers: readonly DraftSpeaker[],
	lines: readonly DraftLine[],
	cast: (index: number) => { family: ActingFamily },
): Block | null {
	const directionOf = directionSent(speakers, cast);
	const sent = lines.map((line) => ({ ...line, direction: directionOf(line) }));
	const spoken = sent.some((line) => normalizeText(line.text) !== "");
	const script = scriptBlock(speakers, sent, spoken);
	if (script) return script;
	const chars = sceneChars(sent);
	return chars > DRAMA_SCENE_MAX
		? { text: DRAMA_TEXT.autoTagLong(chars), target: null }
		: null;
}

// 미리 보기 안내: 바꿀 값 없음, 받지 않는 줄 수, 그리고 모두 Fish면 모두 바꾼 결과가 장면 상한(속도 < 1이면 2,000자보다 낮다)을
// 넘을 때 지금 막는 이유(tooLong)를 미리 알린다('스펙과 다른 점' 23). lines는 지금 줄이다
export function autoTagNotes(
	changes: readonly AutoTagChange[],
	skipped: number,
	lines: readonly DraftLine[],
	fishOnly: boolean,
	speed: number,
): string[] {
	const notes: string[] = [];
	if (changes.length === 0) notes.push(DRAMA_TEXT.autoTagNone);
	if (skipped > 0) notes.push(DRAMA_TEXT.autoTagSkipped(skipped));
	if (fishOnly) {
		const chars = sceneChars(autoTagApply(lines, changes).lines);
		const limit = sceneLimit(speed);
		if (chars > limit) notes.push(DRAMA_TEXT.tooLong(limit, chars, speed));
	}
	return notes;
}

// T5 기본 실패 문구(trialProblemText의 그 밖 사유). 맥락이 다른 화면이 이 문구만 바꾼다
const trialFallback = (provider: ProviderId) =>
	trialProblemText(provider, {
		reason: "unexpected",
		retryAt: null,
		providerCode: null,
	}).text;

// 읽기 줄 실패 문구: T5 그대로, 다만 '내 문장을 듣지 못했어요…' 기본 문구는 이 줄 문구(readLineFailed)
export function readLineProblemText(
	provider: ProviderId,
	problem: TrialProblem,
): { text: string; connections: boolean } {
	const view = trialProblemText(provider, problem);
	return view.text === trialFallback(provider)
		? { ...view, text: DRAMA_TEXT.readLineFailed }
		: view;
}

// 자동 태그 오류 줄(확인 창 안, 코디네이터 판정): 답을 읽지 못함은 autoTagReply, 대기 시각은 '제안받을 수 있어요',
// 공급자 오류·처리 여부 미확인·예상 못 한 사유는 autoTagFailed, 나머지(키·계정·잔액 등)는 T5 Gemini 문구 그대로
export function autoTagProblemText(problem: TrialProblem): string {
	if (problem.providerCode === "auto_tag_reply") return DRAMA_TEXT.autoTagReply;
	if (problem.reason === "rate_limit" && problem.retryAt)
		return DRAMA_TEXT.autoTagRetryAt(retryTime(problem.retryAt));
	if (
		problem.reason === "provider_error" ||
		problem.reason === "unknown_outcome"
	)
		return DRAMA_TEXT.autoTagFailed;
	const { text } = trialProblemText("gemini", problem);
	return text === trialFallback("gemini") ? DRAMA_TEXT.autoTagFailed : text;
}
