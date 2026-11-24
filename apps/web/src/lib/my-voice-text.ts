// apps/web/src/lib/my-voice-text.ts
// 내 보이스(T13) 문구. 정본은 docs/briefs/my-voices.md 5절·7절이고 문구는 그대로 옮긴다
import { GEMINI_CONSENT_SENTENCE } from "@tts-pilot-app/api/my-voice-rules";

export { GEMINI_CONSENT_SENTENCE };

// 약 20초 낭독 분량(1초 5~6자). 사람 이름·브랜드가 없는 평범한 문장
export const READING_PASSAGE =
	"아침 공기가 서늘해지면 창문을 조금만 열어 두고 따뜻한 차를 한 잔 우립니다. 천천히 한 모금씩 마시다 보면 어제의 일들이 차분하게 정리되곤 합니다. 저녁에는 가까운 공원을 한 바퀴 걷고, 돌아와 내일 할 일을 간단히 적어 둡니다. 하루를 이렇게 마무리하면 마음이 한결 가벼워집니다.";

// 들어보기 창을 열 때 문장 칸에 채우는 첫 문장(마침표까지)
export const READING_FIRST_SENTENCE = READING_PASSAGE.slice(
	0,
	READING_PASSAGE.indexOf(".") + 1,
);

export const MY_VOICE_TEXT = {
	// 메뉴·머리
	title: "내 보이스",
	description:
		"내 목소리를 녹음해 클론 보이스를 만들고, 성우 보관함에 담아 작업실에서 써요",
	create: "만들기",

	// 상태 배지
	badgeSending: "보내는 중",
	badgeProcessing: "처리 중",
	badgeReady: "사용 가능",
	badgeFailed: "실패",
	badgeUnknown: "처리 여부 미확인",
	badgeDeleting: "삭제 대기",

	// 줄 주 동작
	listen: "내 문장 듣기",
	check: "상태 확인",
	retryDelete: "다시 시도하기",

	// ⋯ 메뉴
	openLibrary: "성우 보관함에서 보기",
	saveAgain: "성우 보관함에 다시 담기",
	delete: "지우기",
	dismiss: "목록에서 치우기",
	more: "더 보기",

	// 줄 글자
	rowMeta: (provider: string, when: string, presets: number) =>
		`${provider} · ${when} 만듦${presets > 0 ? ` · 프리셋 ${presets}개` : ""}`,
	rowActions: (name: string) => `${name} 동작`,
	noSample: "클론에는 기본 샘플이 없어요",

	// 목록 상태
	emptyTitle: "아직 만든 내 보이스가 없어요",
	emptyDescription:
		"내 목소리를 10초 넘게 녹음하면 클론 보이스를 만들 수 있어요",
	listError: "내 보이스 목록을 불러오지 못했어요",
	reload: "다시 불러오기",
	noProviderTitle: "클론을 만들 수 있는 음성 서비스가 연결돼 있지 않아요",
	viewConnections: "연결 상태 보기",

	loading: "내 보이스를 불러오고 있어요",
	savedToLibrary: "성우 보관함에 담았어요",
	deletingNow: "지우는 중이에요",
	// 다른 줄이 잠긴 이유. 휴대폰 320px에서 '만들기' 옆 두 줄에 든다
	lockedReason: "처리 중인 내 보이스가 끝나면 누를 수 있어요",

	// 만들기 창
	createTitle: "내 보이스 만들기",
	steps: "만들기 단계",
	nameProblem: "이름을 1~30자로 입력해 주세요",
	passageHint: "이런 글을 읽으면 좋아요",
	retry: "다시 보내기",
	network: "보내지 못했어요. 연결을 확인하고 다시 보내 주세요.",

	// 만들기 창 단계
	stepProvider: "서비스·이름",
	stepSource: "원본",
	stepConsent: "동의 문장",
	stepConfirm: "확인",
	stepShort: (at: number, total: number, name: string) =>
		`${at}/${total} ${name}`,
	prev: "이전",
	next: "다음",
	close: "닫기",

	// 1단계
	providerLabel: "서비스",
	providerHintFish: "원본 10~60초",
	providerHintGemini: "원본 10~30초 + 동의 문장 녹음",
	notConnected: "연결 안 됨",
	nameLabel: "이름",

	// 녹음·파일 칸
	record: "녹음하기",
	stop: "멈추기",
	reRecord: "다시 녹음하기",
	pickFile: "파일 고르기",
	changeFile: "파일 바꾸기",
	sourceAudio: "내 원본",
	consentAudio: "동의 녹음",
	readAloud: "문장을 그대로 읽어 녹음해 주세요",
	rangeHint: (min: number, max: number) => `${min}~${max}초`,
	recordedSeconds: (n: number) => `${n}초 녹음했어요`,
	recordStopped: "최대 길이라 녹음을 멈췄어요",
	recording: "녹음 중",
	untilMin: (min: number, left: number) => `${min}초까지 ${left}초 남았어요`,
	enoughRecorded: "충분해요. 더 읽거나 멈춰도 돼요.",

	// 4단계(고지 한 묶음)
	sendLabel: "보낼 것",
	whereLabel: "가는 곳",
	keepsLabel: "보관",
	undoLabel: "되돌리기",
	costLabel: "요금",
	sendTo: (provider: string) => `${provider} 계정에 클론을 만들어요`,
	providerKeeps: "음성 서비스도 원본을 보관할 수 있어요. 앱에는 남기지 않아요.",
	undoHow: (provider: string) =>
		`내 보이스에서 지우면 ${provider} 계정에서도 지워져요`,
	cloneCost: "음성 서비스 문서에 클론 요금 정보가 없어요",
	consentCheck: (provider: string) =>
		`제 목소리이고, ${provider}에 보내 클론을 만드는 데 동의합니다`,
	send: "보내기",
	sending: "보내는 중",
	retryAt: (time: string) => `${time}부터 다시 보낼 수 있어요`,

	// 결과
	resultReady: (name: string) =>
		`‘${name}’ 클론 보이스를 만들었어요. 성우 보관함에 담았어요.`,
	resultProcessing:
		"음성 서비스가 학습 중이에요. 목록에서 상태를 확인할 수 있어요.",
	pickSourceAgain: "원본 다시 고르기",

	// 들어보기 창
	listenTitle: (name: string) => `${name} 내 문장 듣기`,

	// 지우기 확인
	deleteTitle: (name: string) => `‘${name}’ 내 보이스를 지울까요?`,
	// 프리셋 이름은 문장에 넣지 않고 화면이 줄 바꾼 목록으로 보인다
	deleteDescription: (provider: string) =>
		`${provider} 계정에서도 지워지고 되돌릴 수 없어요.`,
	deletePresets: (count: number) =>
		`이 성우를 쓰는 프리셋 ${count}개는 성우를 다시 골라야 해요.`,
	deleteKeepsResults: "이미 만든 음성 결과는 그대로 남아요.",
	dismissDescription: (provider: string) =>
		`${provider} 계정에 남은 실패한 클론도 지워져요`,
	dismissUnsure: (provider: string) =>
		`목록에서만 지워지고 ${provider} 계정에 남았을 수 있어요. ${provider} 웹에서 확인하고 필요하면 지워 주세요.`,
	cancel: "취소",

	// 알림
	created: (name: string) => `‘${name}’ 클론 보이스를 만들었어요`,
	deleted: (name: string) => `‘${name}’ 내 보이스를 지웠어요`,
	dismissed: "목록에서 치웠어요",
	stillTraining: "아직 학습 중이에요",
	busyCreating: "다른 내 보이스를 만드는 중이에요. 끝난 뒤 다시 해 주세요.",
	busySending: "보내는 중이에요. 끝난 뒤 다시 해 주세요.",

	// 브라우저 오류(스펙 5.3, 브리프 5절)
	micDenied:
		"마이크를 쓸 수 없어요. 브라우저 주소창의 권한을 확인하거나 파일을 골라 주세요.",
	micMissing: "마이크를 찾지 못했어요. 파일을 골라 주세요.",
	undecodable: "이 파일은 열 수 없어요. 다른 오디오 파일을 골라 주세요.",
	fileTooBig: "파일이 너무 커요. 더 짧은 오디오 파일을 골라 주세요.",
	silent: "소리가 거의 들리지 않아요. 마이크를 확인하고 다시 녹음해 주세요.",
	tooShort: (what: string, seconds: number, min: number, max: number) =>
		`${what}이 너무 짧아요. 지금은 ${seconds}초인데 ${min}~${max}초가 필요해요.`,
	tooLong: (what: string, seconds: number, min: number, max: number) =>
		`${what}이 너무 길어요. 지금은 ${seconds}초인데 ${min}~${max}초가 필요해요.`,

	// 서버 사유(스펙 8절). {공급자}는 그 클론의 공급자
	reasonNoKey: "연결 안 됨. 연결 상태에서 키를 확인해 주세요.",
	// 공급자가 401·403을 준 경우. 같은 키로 음성 생성은 되는데 클론 만들기·상태 확인만 거절될 수 있어 '연결 안 됨'이라 하지 않는다
	reasonProviderAuth:
		"음성 서비스가 이 계정의 클론 요청을 거절했어요. 연결 상태와 음성 서비스 요금제·잔액을 확인해 주세요.",
	reasonNoPlan:
		"이 계정은 클론을 만들 수 없어요. 음성 서비스 요금제를 확인해 주세요.",
	reasonRateLimit: "요청이 많아 잠시 막혔어요. 잠시 뒤 다시 해 주세요.",
	reasonInProgress: "다른 내 보이스를 만드는 중이에요. 끝난 뒤 다시 해 주세요.",
	reasonQuality:
		"녹음 품질 검사를 통과하지 못했어요. 조용한 곳에서 다시 녹음해 주세요.",
	reasonProviderInput:
		"음성 서비스가 이 원본을 받아 주지 않았어요. 원본과 동의 녹음을 확인하고 다시 만들어 주세요.",
	reasonUnknown: (provider: string) =>
		`음성 서비스 쪽에 만들어졌을 수 있어요. ${provider} 웹에서 확인하고 필요하면 지워 주세요.`,
	reasonProviderError: "음성 서비스에 문제가 생겼어요. 잠시 뒤 다시 해 주세요.",
	reasonNotFound: "음성 서비스에서 찾지 못했어요. 목록에서 치워 주세요.",
	reasonAudioFormat:
		"원본 형식이 맞지 않아요. 파일을 다시 고르거나 다시 녹음해 주세요.",
	reasonAudioLength: "원본 길이가 범위 밖이에요. 다시 녹음해 주세요.",
	reasonAudioSize: "원본이 너무 커요. 더 짧게 다시 녹음해 주세요.",
	reasonDeleting: "음성 서비스에서 아직 지워지지 않았어요. 다시 시도해 주세요.",
	reasonFallback: "만들지 못했어요. 잠시 뒤 다시 해 주세요.",
} as const;
