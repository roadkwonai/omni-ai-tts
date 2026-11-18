// apps/web/src/lib/script-text.ts
// 대본 보관함(T12) 문구. 정본은 docs/briefs/scripts.md 7절과 docs/briefs/studio.md 18절이고 문구는 그대로 옮긴다

const count = (n: number) => n.toLocaleString("ko-KR");

// 제목 끝 글자의 받침에 따라 바뀌는 조사: 으로/로, 을/를. 한글이 아닌 끝 글자(영문·숫자)는 읽기를 알 수 없어 둘 다 보인다.
// shortcut: 숫자·영문 읽기(예: 3→삼)는 따지지 않는다, 그런 제목이 흔해지면 읽기 표를 더한다
export function particle(word: string, kind: "으로" | "을"): string {
	const code = (word.trimEnd().at(-1) ?? "").charCodeAt(0);
	if (code < 0xac00 || code > 0xd7a3)
		return kind === "으로" ? "(으)로" : "을(를)";
	const tail = (code - 0xac00) % 28;
	if (kind === "을") return tail === 0 ? "를" : "을";
	return tail === 0 || tail === 8 ? "로" : "으로";
}

export const SCRIPT_TEXT = {
	// 보관함 화면(scripts.md 7절)
	library: "대본 보관함",
	savedSection: "저장한 대본",
	recentSection: "최근 만든 대본",
	searchPlaceholder: "제목·대본 글로 찾기",
	allChannels: "모든 채널",
	noChannel: "채널 없음",
	rowMeta: (paragraphs: number, chars: number, when: string) =>
		`문단 ${paragraphs}개 · ${count(chars)}자 · ${when}`,
	edit: "고치기",
	duplicate: "복제",
	remove: "지우기",
	saveToLibrary: "보관함에 저장",
	more: "더 보기",
	edited: (title: string) => `‘${title}’ 대본을 고쳤어요.`,
	created: (title: string) => `‘${title}’ 대본을 만들었어요.`,
	removed: (title: string) => `‘${title}’ 대본을 지웠어요.`,
	removedRecent: "최근 대본을 지웠어요.",
	savedAs: (title: string) => `‘${title}’ 대본으로 저장했어요.`,

	// 보관함 화면의 머리·상태·창(scripts.md 5절)
	description:
		"음성 작업실에서 저장한 대본과 최근 만든 대본을 찾아 다시 열어요.",
	searchLabel: "대본 찾기",
	channelLabel: "채널",
	categoryLabel: "카테고리",
	typeLabel: "타입",
	clearAll: "조건 모두 해제",
	channelChip: (name: string) => `채널 ${name}`,
	openLabel: (title: string) => `${title} 작업실에서 열기`,
	actionsLabel: (title: string) => `${title} 동작`,
	shown: (n: number) => `대본 ${n}개를 보여요`,
	recentNote: "만들기를 누른 작업이 최근 20개까지 남아요.",
	emptySaved: "아직 저장한 대본이 없어요",
	emptySavedDetail:
		"음성 작업실 머리의 '대본' 메뉴에서 지금 작업을 새 대본으로 저장할 수 있어요.",
	emptyRecent: "아직 만든 대본이 없어요",
	emptyRecentDetail: "음성 작업실에서 만들기를 누르면 그 작업이 여기에 남아요.",
	toStudio: "음성 작업실로",
	noMatches: "조건에 맞는 대본이 없어요",
	listFailed: "대본 목록을 받지 못했어요",
	moreFailed: "더 받지 못했어요",
	loadingList: "대본 목록을 받고 있어요",
	classesFailed: "채널·분류 목록을 받지 못했어요",
	reload: "다시 불러오기",
	loopback: "이 주소에서는 대본 보관함을 쓸 수 없어요",
	editTitle: "대본 고치기",
	editNote: "대본 글은 음성 작업실에서 열어 고쳐요.",
	saveToLibraryTitle: "보관함에 저장",
	removeQuestion: (title: string) => `‘${title}’ 대본을 지울까요?`,
	removeRecentQuestion: "이 최근 대본을 지울까요?",
	removeDetail:
		"이미 만든 음성 결과는 그대로 남아요. 작업실에서 열어 둔 작업도 그대로지만, 다음 저장은 새 대본으로 해요.",
	removeRecentDetail: "이미 만든 음성 결과는 그대로 남아요.",
	removing: "대본을 지우는 중이에요",
	removeFailed: "지우지 못했어요. 잠시 뒤 다시 해 주세요.",
	gone: "이미 지워졌거나 찾을 수 없어요.",
	duplicateFailed: "복제하지 못했어요. 잠시 뒤 다시 해 주세요.",

	// 작업실 '대본' 메뉴(studio.md 18.1)
	menu: "대본",
	menuLabel: (title: string, dirty: boolean) =>
		`대본: ${title}${dirty ? ", 저장 안 됨" : ""}`,
	dirty: "저장 안 됨",
	save: "저장",
	saved: "저장됨",
	saveNew: "새 대본으로 저장…",
	insert: "보관함에서 넣기…",
	libraryLink: "대본 보관함",
	needText: "대본을 써야 저장할 수 있어요",
	// 저장할 수 없는 이유(ScriptWorkProblem). empty는 needText
	blocked: {
		too_many: "문단이 200개를 넘어 저장할 수 없어요",
		too_long: "한 문단이 10,000자를 넘어 저장할 수 없어요",
		too_large: "작업이 너무 커서 저장할 수 없어요",
		nul: "저장할 수 없는 글자가 들어 있어요",
		encoding: "저장할 수 없는 글자가 들어 있어요",
	},
	savedIn: (title: string) => `‘${title}’ 대본에 저장했어요.`,
	saving: "저장하는 중이에요",
	saveFailed: "저장하지 못했어요. 잠시 뒤 다시 해 주세요.",

	// '새 대본으로 저장' 창(18.2)
	saveTitle: "새 대본으로 저장",
	saveDescription: (paragraphs: number, chars: number) =>
		`지금 작업(문단 ${paragraphs}개 · ${count(chars)}자)을 보관함에 저장해요.`,
	fieldTitle: "제목",
	fieldChannel: "채널",
	channelNote: "채널을 바꾸면 작업 채널도 바뀌어요",
	fieldClasses: "분류",
	cancel: "취소",
	saveNow: "저장하기",
	duplicateName: "같은 이름의 대본이 있어요",
	titleEmpty: "제목을 입력해 주세요",
	titleTooLong: "제목은 100자까지 쓸 수 있어요",
	channelGone: "고른 채널이나 분류가 지워졌어요. 다시 골라 주세요",
	copyTitle: (title: string) => `${title} 사본`,

	// '보관함에서 넣기' 창(18.3)
	insertTitle: "보관함에서 넣기",
	insertDescription: "대본을 골라 지금 작업에 이어 넣거나 바꿔 넣어요.",
	pickLabel: "넣을 대본",
	openFailed: "대본을 받지 못했어요",
	preview: (paragraphs: number, chars: number) =>
		`문단 ${paragraphs}개 · ${count(chars)}자`,
	modeAppend: "이어 넣기",
	modeReplace: "바꾸기",
	warnFollowDefault: (n: number) =>
		`성우를 따로 고르지 않은 문단 ${n}개는 지금 기본 성우로 읽어요`,
	warnOverLimit: (n: number) =>
		`200개까지만 넣어요. 나머지 ${n}개는 넣지 않아요`,
	warnSpeakers: (n: number) => `화자가 20명을 넘어 ${n}개 문단의 화자를 비워요`,
	warnReplace: (n: number) => `지금 문단 ${n}개를 모두 바꿔요`,
	insertNow: "넣기",
	// extra: 200개 상한으로 넣지 못한 수, cleared: 화자 20명 상한으로 화자를 비운 문단 수(붙여 넣기 창과 같은 말)
	inserted: (n: number, extra = 0, cleared = 0) =>
		`문단 ${n}개를 넣었어요${extra > 0 ? `. 나머지 ${extra}개는 넣지 않았어요` : ""}${cleared > 0 ? `. 화자가 20명을 넘어 ${cleared}개 문단의 화자를 비웠어요` : ""}`,
	noRoom: "문단이 이미 200개라 더 넣을 수 없어요",
	replaceUndoNote:
		"바꾼 뒤 10초 동안 되돌릴 수 있고, 만들기를 누른 작업은 최근 만든 대본에 남아요.",
	replaced: (title: string) => `‘${title}’${particle(title, "으로")} 바꿨어요`,
	undo: "되돌리기",

	// 미저장 경고 창(18.4)
	dirtyTitle: (title: string) => `‘${title}’에 저장하지 않은 변경이 있어요`,
	dirtyDescription: "바꾸면 이 작업의 변경은 되돌리기 10초 뒤 사라져요.",
	saveThenReplace: "저장하고 바꾸기",
	replaceWithoutSaving: "저장하지 않고 바꾸기",

	// 충돌 창(18.5)
	conflictTitle: "다른 곳에서 이 대본을 먼저 저장했어요",
	conflictDescription: (title: string) =>
		`다른 탭이나 기기에서 ‘${title}’${particle(title, "을")} 저장했어요. 지금 작업을 어떻게 할까요?`,
	saveAsNew: "새 대본으로 저장",
	overwrite: "덮어쓰기",
	goneTitle: "보관함에서 지워진 대본이에요",
	goneDescription: (title: string) =>
		`‘${title}’${particle(title, "을")} 보관함에서 찾을 수 없어요. 지금 작업은 그대로 남아 있어요.`,
} as const;
