// apps/web/src/components/drama-lines.tsx
"use client";

import { ACTING, tagSent } from "@tts-pilot-app/api/drama-acting";
import {
	cleanDirection,
	DRAMA_DIRECTION_MAX,
	DRAMA_LINE_MAX,
	DRAMA_LINES_MAX,
	sceneChars,
	sceneLimit,
	takeKey,
} from "@tts-pilot-app/api/drama-script";
import type { ProviderId } from "@tts-pilot-app/api/providers/contract";
import {
	codePoints,
	normalizeText,
} from "@tts-pilot-app/api/providers/trial-options";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@tts-pilot-app/ui/components/dropdown-menu";
import { Input } from "@tts-pilot-app/ui/components/input";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import { Textarea } from "@tts-pilot-app/ui/components/textarea";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import {
	ChevronDown,
	EllipsisVertical,
	Plus,
	TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import {
	type ClipboardEvent,
	type KeyboardEvent,
	type MouseEvent,
	type ReactNode,
	type RefObject,
	type SyntheticEvent,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { gapText } from "@/lib/drama-join";
import { readKey } from "@/lib/drama-read";
import {
	DRAMA_TEXT,
	type DraftLine,
	type DraftSpeaker,
	feelOptions,
	feelPatch,
	readLineProblemText,
	shownFeel,
	speakerNameOf,
	tagSpans,
} from "@/lib/drama-view";
import type { TrialProblem } from "@/lib/trial-view";

import { fieldClass, isComposingEnter } from "./class-form-dialog";
import { AutoTagButton } from "./drama-autotag";
import { DefaultGap, GAP_HELP_ID, LineGap } from "./drama-gap";
import { LineActions, playsKey, SaveLineItem } from "./drama-line-actions";
import { DramaPasteDialog } from "./drama-paste-dialog";
import {
	dramaFieldId,
	useDrama,
	useLines,
	useScriptKey,
} from "./drama-provider";
import { useDramaRead } from "./drama-read";
import { lineKey, TakePick, useTakeAudio } from "./drama-take";
import { castOf, DramaToolbar, focusToolbar } from "./drama-toolbar";
import { dismissUndo, showScriptUndo } from "./drama-undo";
import { SpeakerMark } from "./drama-voice-dialog";
import { usePlayer } from "./sample-player";
import { menuItem, RadioMenu } from "./voice-conditions";
import { lockedButton } from "./voice-problem";

// 대본 구역(브리프 5.4, 6절, 7절 포커스, 17절 3·4·5·6): 머리(제목과 글자 수, 기본 쉼 칸, '대본 붙여 넣기', '전체 자동 태그'),
// 대본 지면(한 층 줄 격자, 대상 줄 아래 연기 지시 도구줄, 마지막 줄을 뺀 줄 아래 가름선), '줄 추가'와 Enter 안내. 줄 목록은 이 구역만 읽는다(LinesProvider). 줄 행에는 원시 값, 화자별 같은 객체, 늘 같은 함수만 넘겨
// 글자를 치거나 읽는 줄이 바뀌면 그 줄만 다시 그린다(React Compiler 메모, 입력 지연). 칸 id는 dramaFieldId라 뱃지 넣기·막는 이유의 '{n}번 줄로'가 찾는다

type Lines = ReturnType<typeof useLines>;
type Focus = Parameters<Lines["noteFocus"]>[0];
type Cast = ReturnType<typeof castOf>;
type Shown = NonNullable<ReturnType<typeof shownFeel>>;

// 칸 아래 글자 수를 보이기 시작하는 글자 수(브리프 5.4)
const TEXT_COUNT_FROM = 250;
const DIRECTION_COUNT_FROM = 50;
// 화자 칩 바탕(번호별 문자열 표, Tailwind가 찾을 수 있게). 글자는 foreground다(브리프 9.2)
const CHIP = [
	"bg-speaker-1-subtle",
	"bg-speaker-2-subtle",
	"bg-speaker-3-subtle",
	"bg-speaker-4-subtle",
] as const;
// 대사 칸 두 층(뒤판·textarea)이 함께 쓰는 글꼴 크기·줄 높이·안쪽 여백·경계 두께·반경·줄바꿈(브리프 5.4, 리뷰 D10).
// 하나라도 다르면 두 층이 다른 자리에서 끊겨 캐럿이 강조와 어긋난다. 대사는 모든 폭에서 16px, 줄 높이는 눈금에서 1.6에 가장 가까운 relaxed다(브리프 17절 4).
// md:text-base가 fieldClass의 md:text-sm을 덮는다
const LAYER =
	"min-h-11 w-full rounded-xl border px-2.5 py-2 text-base leading-relaxed whitespace-pre-wrap wrap-anywhere break-keep md:text-base";
// 지시 칸: 테두리·바탕 없는 한 줄, 14px(767px 이하 16px, fieldClass) 회색 글(브리프 17절 4). 자리 표시 '지시'는 그 줄을 가리키거나 포커스가 그 줄에 있을 때만 보인다.
// 경계는 투명으로 두어 포커스·경고 때만 다른 입력과 같은 ring·warning 경계가 보인다
const DIRECTION =
	"border-transparent bg-transparent text-muted-foreground placeholder:text-transparent group-focus-within:placeholder:text-muted-foreground group-hover:placeholder:text-muted-foreground hover:bg-muted focus-visible:bg-card dark:bg-transparent dark:hover:bg-muted dark:focus-visible:bg-card";
// 감정·말투 메뉴: 지시 자리를 채우는 ghost(시안 .emo). RadioMenu의 outline·카드색을 덮는다
const FEEL_MENU =
	"w-full justify-start border-transparent bg-transparent px-2.5 text-muted-foreground hover:bg-muted";
// 목록 아래 Enter 안내(enterHelp). 모든 대사 칸이 설명으로 잇는다(audit P2-3)
const ENTER_HELP_ID = "drama-enter-help";

const focusText = (id: string) =>
	document.getElementById(dramaFieldId(id, "text"))?.focus();
// 대사 끝 자리. 화자 칩·감정 칸에 포커스가 들어오거나 줄 메뉴 '연기 지시 넣기'가 이 줄을 대상으로 정할 때 쓴다
const textEnd = (line: DraftLine): Focus => ({
	line: line.id,
	field: "text",
	start: line.text.length,
	end: line.text.length,
});

// 이 컴포넌트가 띄운 동작 알림 하나(여러 줄 붙여 넣기). 새로 띄우면 앞 것을 닫고, 컴포넌트가 사라지면 닫는다
function useOwnToast() {
	const id = useRef<string | number | null>(null);
	useEffect(
		() => () => {
			if (id.current !== null) toast.dismiss(id.current);
		},
		[],
	);
	return (message: string, action: { label: string; onClick: () => void }) => {
		if (id.current !== null) toast.dismiss(id.current);
		id.current = toast(message, { action });
	};
}

// 넘친 글자 수 앞의 16px 경고 아이콘(색만으로 말하지 않는다, 브리프 9.1)
const overMark = (over: boolean) =>
	over ? (
		<TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
	) : null;

// 칸 아래 오른쪽 글자 수("251 / 300자"). 넘으면 경고색과 경고 아이콘
function FieldCount({
	id,
	count,
	max,
}: {
	id: string;
	count: number;
	max: number;
}) {
	return (
		<p
			id={id}
			className={cn(
				"flex items-center gap-1 self-end text-sm tabular-nums",
				count > max ? "text-warning" : "text-muted-foreground",
			)}
		>
			{overMark(count > max)}
			{DRAMA_TEXT.fieldCount(count, max)}
		</p>
	);
}

// 감정 칸(브리프 14절 배치 3, 17절 4): 지시 자리에 Typecast는 '감정'(그 성우가 받는 값만), Airy는 '말투' 메뉴 하나(ghost)다.
// 고르면 그 줄 feel만 바꾼다. 묶음 이름이 "3번 줄 연기 지시"라 메뉴가 어느 줄인지 함께 읽힌다.
// 포커스가 들어오면 이 줄을 연기 지시 대상으로 정한다(그 아래 도구줄이 생긴다. Typecast는 강도, 그 밖은 noTags 글)
function FeelField({
	line,
	n,
	cast,
	shown,
	onChange,
	onNote,
}: {
	line: DraftLine;
	n: number;
	cast: Cast;
	shown: Shown;
	onChange: Lines["setLine"];
	onNote: (at: Focus) => void;
}) {
	const { family } = cast;
	return (
		// fieldset은 기본 최소 너비가 내용 너비라 min-w-0(지시 열 폭 안에서 값이 말줄임된다)
		<fieldset
			aria-label={DRAMA_TEXT.directionLabel(n)}
			onFocus={() => onNote(textEnd(line))}
			className="min-w-0"
		>
			<RadioMenu
				label={family === "airy" ? DRAMA_TEXT.styleLabel : DRAMA_TEXT.feelLabel}
				value={shown.value}
				options={feelOptions(family, cast.emotions)}
				align="start"
				onChange={(value) =>
					onChange(line.id, {
						feel: feelPatch(family, line.feel, shown, { value }),
					})
				}
				className={FEEL_MENU}
			/>
		</fieldset>
	);
}

// 줄 메뉴 '이 줄부터 읽기'. 메뉴가 열려 있을 때만 그려져 읽기 상태를 읽는다(줄 행이 읽기 시작·끝마다 다시 그려지지 않게).
// 읽는 중·확인 창 단계와 장면을 만드는 중(서버 동시 1건)에는 꺼진다(그 사이 시작은 읽기가 무시한다). 확인 창은 닫히면 이 줄 메뉴 버튼(opener)으로 돌아온다
function ReadFromItem({
	lineId,
	opener,
}: {
	lineId: string;
	opener: RefObject<HTMLButtonElement | null>;
}) {
	const read = useDramaRead();
	const generating = useDrama().generating !== null;
	return (
		<DropdownMenuItem
			className={menuItem}
			disabled={read.state.phase !== "idle" || generating}
			onClick={() => read.start(lineId, opener.current)}
		>
			{DRAMA_TEXT.readFrom}
		</DropdownMenuItem>
	);
}

// 실패한 줄(브리프 14절 배치 4, 17절 4: 줄 li 안 대사 아래 전체 폭): 읽기가 여기서 멈췄다. 이유는 T5 문구(이 줄 화자 공급자, 기본 문구만 이 줄 문구)와 '이 줄부터 다시 읽기'
// (장면을 만드는 중에는 잠긴다).
// 생성 실패(공급자·진행 중·미확인 등)는 나타날 때 알린다(role="alert"). 재생 실패는 플레이어가 이미 "… 재생하지 못했어요"로 알렸으므로 글만 둔다.
// 알릴지는 나타날 때 한 번 정한다(뒤에 다른 소리를 틀어도 역할이 붙어 다시 읽히지 않게). 실패는 늘 새 읽기(실패를 비움) 뒤라 이 칸도 새로 생긴다
function LineFailure({
	lineId,
	provider,
	problem,
	opener,
}: {
	lineId: string;
	provider: ProviderId;
	problem: TrialProblem;
	opener: RefObject<HTMLButtonElement | null>;
}) {
	const read = useDramaRead();
	const generating = useDrama().generating !== null;
	const player = usePlayer();
	const [alert] = useState(() => {
		const now = player.current;
		return !(
			problem.reason === "unexpected" &&
			now?.voiceId === readKey(lineId) &&
			now.status === "failed"
		);
	});
	const text = readLineProblemText(provider, problem);
	// 읽기를 시작하면 실패 표시와 이 버튼이 함께 사라지므로 포커스는 이 줄 메뉴로(확인 창도 거기로 돌아온다).
	// 막는 이유로 시작하지 않았으면(버튼이 남음) 그대로 둔다
	function readAgain(event: MouseEvent<HTMLButtonElement>) {
		const button = event.currentTarget;
		flushSync(() => read.start(lineId, opener.current));
		if (!button.isConnected) opener.current?.focus();
	}
	return (
		<div className="col-span-full flex flex-col items-start gap-1">
			<p
				role={alert ? "alert" : undefined}
				className="flex gap-2 text-sm text-warning"
			>
				<TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
				{text.text}
			</p>
			<div className="flex flex-wrap items-center gap-x-3">
				<Button
					variant="link"
					size="lg"
					focusableWhenDisabled
					disabled={generating}
					className={lockedButton(true)}
					onClick={readAgain}
				>
					{DRAMA_TEXT.readAgainFrom}
				</Button>
				{text.connections ? (
					<Button
						variant="link"
						size="lg"
						nativeButton={false}
						render={<Link href="/connections" />}
					>
						{DRAMA_TEXT.connections}
					</Button>
				) : null}
			</div>
		</div>
	);
}

// 줄 하나(브리프 5.4, 17절 4·5). 정지: 화자 칩 → 지시 칸(또는 감정 메뉴) → 대사 칸 → 동작 칸. DOM 순서와 화면 순서가 같다.
// 격자는 index.css drama-line: 768px 이상 한 층 [번호][칩][지시][대사][동작], 767px 이하 두 층 [번호][칩][지시][받을 테이크] / [대사][동작].
// 칩 뒤 자리는 화자 family가 정한다: 지시를 받으면 지시 칸, Typecast·Airy는 감정 메뉴(Typecast 강도는 도구줄), 그 밖은 빈 자리와 화면 밖 noDirection.
// 대상 줄이면 대사 아래(가름선 위)에 연기 지시 도구줄(DramaToolbar, 브리프 17절 6)이 있다.
// 듣거나 읽는 줄은 줄 바탕과 aria-current, 실패 줄은 대사 아래에 이유와 '이 줄부터 다시 읽기'(줄 id로 가리킨다). 동작 칸은 받을 테이크 ▾(테이크 조각이고 같은 대본 테이크가 둘 이상)와 ▶·⋮(LineActions)다.
// 마지막 줄이 아니면 맨 아래 칸이 가름선(LineGap, 브리프 17절 5)이다. 기본 쉼은 원시 값(defaultGap)으로 받는다(자리 표시)
function LineRow({
	line,
	n,
	first,
	last,
	only,
	next,
	target,
	speakers,
	cast,
	defaultGap,
	segment,
	pickable,
	reading,
	failed,
	onChange,
	onNote,
	onEnter,
	onMove,
	onRemove,
	onMultiLine,
}: {
	line: DraftLine;
	n: number;
	first: boolean;
	last: boolean;
	only: boolean;
	// 지운 뒤 포커스할 줄(다음 줄 → 앞 줄)
	next: string | null;
	// 연기 지시를 넣을 줄(번호를 청록으로, 그 아래 도구줄)
	target: boolean;
	speakers: readonly DraftSpeaker[];
	// 이 줄 화자의 연기 family·감정 재료(castOf). 화자별 같은 객체다
	cast: Cast | undefined;
	// 줄 사이 기본 쉼(초). 쉼 칸의 자리 표시다
	defaultGap: number;
	// 줄 ▶가 테이크 조각이다(DramaLines가 한 번 센다). pickable이면 받을 테이크 ▾도 있다
	segment: boolean;
	pickable: boolean;
	// 듣거나 읽는 줄(읽기의 읽는 줄 또는 조각을 듣는 줄), 이 줄에서 멈춘 읽기 실패
	reading: boolean;
	failed: TrialProblem | null;
	onChange: Lines["setLine"];
	onNote: (at: Focus) => void;
	onEnter: (id: string) => void;
	onMove: Lines["moveLine"];
	onRemove: (id: string, next: string | null, n: number) => void;
	onMultiLine: (text: string) => void;
}) {
	const textCountId = useId();
	const directionCountId = useId();
	const rowRef = useRef<HTMLLIElement>(null);
	const menuRef = useRef<HTMLButtonElement>(null);
	// 줄 메뉴가 닫힌 뒤 할 일('연기 지시 넣기'). onOpenChangeComplete가 꺼내 비운 뒤 부른다
	const afterMenu = useRef<(() => void) | null>(null);
	const textId = dramaFieldId(line.id, "text");
	const directionId = dramaFieldId(line.id, "direction");
	const name = speakerNameOf(speakers, line.speaker);
	// 화자가 없는 줄은 없지만(줄 화자는 늘 범위 안) 그때는 지금처럼 지시 칸이다
	const family = cast?.family ?? "fish_drama";
	const shown = cast && shownFeel(cast.voice, cast.value, family, line.feel);
	// 지시를 받지 않는 family의 감정·말투(Typecast·Airy). 지시를 받으면 지시 칸이 먼저다
	const directs = ACTING[family].front.length > 0;
	const feel = !directs && cast && shown ? { cast, shown } : null;

	// 읽는 줄이 되면 화면 안으로(가까운 쪽으로만). 동작 줄이기 설정이면 바로 옮긴다. 아래 여백은 막대의 scroll-padding이 맡는다
	useEffect(() => {
		if (!reading) return;
		const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
		rowRef.current?.scrollIntoView({
			block: "nearest",
			behavior: still ? "instant" : "smooth",
		});
	}, [reading]);
	// 글자 수와 경고 경계는 막는 이유(dramaBlock)와 같은 정리 뒤 값이다. 입력은 자르지 않는다(maxLength 없음, Ruling 14)
	const text = normalizeText(line.text);
	const direction = cleanDirection(line.direction);
	const textCount = codePoints(text);
	const directionCount = codePoints(direction);
	const showTextCount = textCount >= TEXT_COUNT_FROM;
	const showDirectionCount = directionCount >= DIRECTION_COUNT_FROM;

	// 마지막 포커스 자리(연기 지시 뱃지가 넣는 곳)
	const note =
		(field: Focus["field"]) =>
		(event: SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) =>
			onNote({
				line: line.id,
				field,
				start: event.currentTarget.selectionStart ?? 0,
				end: event.currentTarget.selectionEnd ?? 0,
			});
	// Enter(조합 중이 아닐 때): 이 줄 바로 뒤에 다음 화자의 빈 줄(DN-4 B). 칸 안 줄바꿈은 넣지 않고 Shift+Enter는 아무 일도 없다
	function onTextKey(event: KeyboardEvent<HTMLTextAreaElement>) {
		if (event.key !== "Enter" || isComposingEnter(event)) return;
		event.preventDefault();
		if (!event.shiftKey) onEnter(line.id);
	}
	// 여러 줄을 붙여 넣으면 줄바꿈을 공백으로 바꿔 한 칸에 넣고 알린다. 브라우저 되돌리기에 남게 insertText로 넣고, 안 되면 고른 자리를 바꿔 쓴다
	function onTextPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
		const pasted = event.clipboardData.getData("text/plain");
		if (!/[\r\n]/.test(pasted)) return;
		event.preventDefault();
		const joined = pasted.replace(/[\r\n]+/g, " ");
		const field = event.currentTarget;
		if (!document.execCommand("insertText", false, joined))
			onChange(line.id, {
				text:
					field.value.slice(0, field.selectionStart) +
					joined +
					field.value.slice(field.selectionEnd),
			});
		onMultiLine(pasted);
	}
	// 줄 메뉴 '연기 지시 넣기'(브리프 17절 6): 이 줄을 대상으로 정한다. 이 줄의 마지막 커서 자리가 없으면 대사 끝.
	// 메뉴가 닫힌 뒤 이 줄 아래 도구줄로 포커스한다
	function insertDirection() {
		if (!target) onNote(textEnd(line));
		afterMenu.current = () => focusToolbar(line.id);
	}

	// 뒤판: 태그 조각만 무채색 바탕 + 밑줄, 이 화자 family가 보내지 않을 태그는 밑줄 대신 줄 긋기(tagSent, readText와 같은 판정).
	// 굵기·자간·여백은 바꾸지 않는다(캐럿이 어긋난다). 키는 글 안 위치
	const backdrop: ReactNode[] = [];
	let at = 0;
	for (const span of tagSpans(line.text)) {
		backdrop.push(
			span.tag ? (
				<span
					key={at}
					className={cn(
						"bg-muted decoration-muted-foreground",
						tagSent(family, span.text) ? "underline" : "line-through",
					)}
				>
					{span.text}
				</span>
			) : (
				span.text
			),
		);
		at += span.text.length;
	}

	return (
		<li
			ref={rowRef}
			aria-current={reading ? "true" : undefined}
			// relative: 화면 밖 글(sr-only)이 줄 안에 머문다. group: 지시 칸 자리 표시가 줄을 가리키거나 포커스할 때만 보인다
			className={cn(
				"drama-line group relative px-3 py-1 transition-colors max-md:px-2",
				reading && "bg-primary-subtle",
			)}
		>
			{/* 칸들의 접근 이름이 "3번 줄 …"이라 번호는 읽지 않는다. 대상 줄은 번호가 청록이다(그 줄 아래 도구줄 이름도 번호를 말한다) */}
			<span
				aria-hidden="true"
				className={cn(
					"flex h-11 items-center justify-end font-bold text-sm tabular-nums",
					target ? "text-primary" : "text-muted-foreground",
				)}
			>
				{n}
			</span>
			{/* 768px 이상은 칩 열 폭(112px, 1024px 이상 120px)을 채우고, 767px 이하는 120px까지. 이름은 말줄임 */}
			<DropdownMenu>
				<DropdownMenuTrigger
					aria-label={DRAMA_TEXT.lineSpeaker(n, name)}
					// 칩에 포커스해도 이 줄이 연기 지시 대상이다(넣을 자리는 대사 끝)
					onFocus={() => onNote(textEnd(line))}
					className={cn(
						"flex h-11 min-w-0 items-center gap-2 rounded-full px-3 font-bold text-foreground text-sm outline-offset-2 hover:brightness-95 focus-visible:outline-2 focus-visible:outline-ring aria-expanded:brightness-95 max-md:max-w-30 md:w-full dark:aria-expanded:brightness-110 dark:hover:brightness-110",
						CHIP[line.speaker],
					)}
				>
					<SpeakerMark index={line.speaker} />
					<span className="min-w-0 truncate">{name}</span>
					<ChevronDown
						aria-hidden="true"
						className="ml-auto size-4 shrink-0 text-muted-foreground"
					/>
				</DropdownMenuTrigger>
				<DropdownMenuContent className="w-auto min-w-48 p-1">
					<DropdownMenuRadioGroup
						value={String(line.speaker)}
						onValueChange={(value) =>
							onChange(line.id, { speaker: Number(value) })
						}
					>
						{speakers.map((_, index) => (
							<DropdownMenuRadioItem
								// 화자는 번호가 정체다(drama-speakers와 같다)
								key={index}
								value={String(index)}
								// 하나 고르기는 고르면 닫힌다(Base UI 1.8 RadioItem 기본 false, voice-conditions와 같다). 포커스는 칩으로
								closeOnClick
								className="gap-2"
							>
								<SpeakerMark index={index} />
								<span className="min-w-0 truncate">
									{speakerNameOf(speakers, index)}
								</span>
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			{directs ? (
				<div className="flex min-w-0 flex-col gap-1">
					<Input
						id={directionId}
						name={`drama-direction-${line.id}`}
						data-drama-field=""
						value={line.direction}
						onChange={(event) =>
							onChange(line.id, { direction: event.target.value })
						}
						onFocus={note("direction")}
						onSelect={note("direction")}
						placeholder={DRAMA_TEXT.directionShort}
						aria-label={DRAMA_TEXT.directionLabel(n)}
						aria-invalid={
							directionCount > DRAMA_DIRECTION_MAX ||
							direction.includes("<|") ||
							undefined
						}
						aria-describedby={showDirectionCount ? directionCountId : undefined}
						autoComplete="off"
						className={cn(fieldClass, DIRECTION)}
					/>
					{showDirectionCount ? (
						<FieldCount
							id={directionCountId}
							count={directionCount}
							max={DRAMA_DIRECTION_MAX}
						/>
					) : null}
				</div>
			) : feel ? (
				<FeelField
					line={line}
					n={n}
					cast={feel.cast}
					shown={feel.shown}
					onChange={onChange}
					onNote={onNote}
				/>
			) : (
				// 지시도 감정도 받지 않는 성우(ElevenLabs v2·flash). 자리는 비워 대사 시작을 맞추고 이유는 화면 밖 글로 둔다.
				// 숨긴 지시는 지우지 않고 보내지 않는다(스펙 14.2)
				<div>
					<p className="sr-only">{DRAMA_TEXT.noDirection}</p>
				</div>
			)}
			<div className="drama-line-text flex min-w-0 flex-col gap-1">
				{/* 흐름 안의 뒤판이 높이를 정하고 textarea가 그 위를 덮는다(내용에 따라 늘어나고 스크롤바가 없다).
				    너비·확대·글꼴이 바뀌어도 두 층이 같은 폭에서 같은 줄로 끊긴다. 글자는 투명하고 textarea가 글자와 캐럿을 그린다.
				    테두리·바탕이 없고 가리키면 muted, 포커스하면 카드색(가리켜도 포커스가 이긴다) 바탕은 뒤판이 그린다(textarea가 덮으면 태그 강조가 가려진다) */}
				<div className="group/text relative">
					<div
						aria-hidden="true"
						className={cn(
							LAYER,
							"pointer-events-none border-transparent text-transparent transition-colors group-focus-within/text:bg-card group-hover/text:not-group-focus-within/text:bg-muted",
						)}
					>
						{backdrop}
					</div>
					<Textarea
						id={textId}
						name={`drama-text-${line.id}`}
						data-drama-field=""
						rows={1}
						value={line.text}
						// 끌어 놓기 같은 다른 길로 들어온 줄바꿈도 한 줄 = 한 대사로 둔다(브리프 4절)
						onChange={(event) =>
							onChange(line.id, {
								text: event.target.value.replace(/[\r\n]+/g, " "),
							})
						}
						onKeyDown={onTextKey}
						onPaste={onTextPaste}
						onFocus={note("text")}
						onSelect={note("text")}
						placeholder={DRAMA_TEXT.textPlaceholder}
						aria-label={DRAMA_TEXT.textLabel(n)}
						// 300자 초과·화자 표식 글자(<|)만 경고 경계다. 빈 대사는 막대의 막는 이유만 말한다(첫 화면이 경고로 시작하지 않게, 브리프 6절)
						aria-invalid={
							textCount > DRAMA_LINE_MAX || text.includes("<|") || undefined
						}
						// 글자 수(보일 때)와 Enter 안내(새 줄 만들기)
						aria-describedby={
							showTextCount ? `${textCountId} ${ENTER_HELP_ID}` : ENTER_HELP_ID
						}
						autoComplete="off"
						className={cn(
							fieldClass,
							LAYER,
							"field-sizing-fixed absolute inset-0 h-full overflow-hidden border-transparent bg-transparent dark:bg-transparent",
						)}
					/>
				</div>
				{showTextCount ? (
					<FieldCount id={textCountId} count={textCount} max={DRAMA_LINE_MAX} />
				) : null}
			</div>
			{/* 동작 칸(index.css drama-line-actions): 768px 이상은 마지막 열 하나, 767px 이하는 받을 테이크 칸(위 층 끝)과 단추 칸(아래 층 끝)이 따로 놓인다 */}
			<div className="drama-line-actions">
				<div className="drama-line-take">
					{pickable ? <TakePick line={n - 1} /> : null}
				</div>
				<div className="drama-line-buttons">
					<LineActions
						line={line}
						index={n - 1}
						n={n}
						speaker={name}
						segment={segment}
						menu={
							<DropdownMenu
								onOpenChangeComplete={(open) => {
									const run = afterMenu.current;
									afterMenu.current = null;
									if (!open) run?.();
								}}
							>
								<DropdownMenuTrigger
									render={
										<Button
											ref={menuRef}
											variant="ghost"
											size="icon-lg"
											aria-label={DRAMA_TEXT.lineMenu(n)}
											// RowAction 모양(회색, 가리키거나 포커스하면 진해진다)
											className="text-muted-foreground hover:text-foreground focus-visible:text-foreground aria-expanded:text-foreground"
										/>
									}
								>
									<EllipsisVertical aria-hidden="true" />
								</DropdownMenuTrigger>
								<DropdownMenuContent
									align="end"
									className="w-auto min-w-48 p-1"
									// 위로·아래로는 옮겨진 줄의 이 버튼으로 돌아온다. onOpenChangeComplete가 afterMenu를 먼저 비우므로 닫힐 때 이 값은 늘 true다(Base UI 1.8.0):
									// 메뉴가 마이크로태스크에서 이 버튼으로 되돌린다
									finalFocus={() => afterMenu.current === null}
								>
									{/* 차례(스펙 17.2 '줄 메뉴'): 이 줄부터 읽기 → 이 줄 받기(테이크 조각일 때) → 위로 · 아래로 → 연기 지시 넣기 → 지우기 */}
									<DropdownMenuGroup>
										<ReadFromItem lineId={line.id} opener={menuRef} />
										{segment ? <SaveLineItem index={n - 1} /> : null}
										<DropdownMenuItem
											className={menuItem}
											disabled={first}
											onClick={() => onMove(line.id, -1)}
										>
											{DRAMA_TEXT.moveUp}
										</DropdownMenuItem>
										<DropdownMenuItem
											className={menuItem}
											disabled={last}
											onClick={() => onMove(line.id, 1)}
										>
											{DRAMA_TEXT.moveDown}
										</DropdownMenuItem>
										<DropdownMenuItem
											className={menuItem}
											onClick={insertDirection}
										>
											{DRAMA_TEXT.insertDirection}
										</DropdownMenuItem>
										{/* 한 줄뿐이면 꺼지고 둘째 줄이 이유다(브리프 9.1) */}
										<DropdownMenuItem
											className={cn(menuItem, "flex-col items-start gap-0.5")}
											disabled={only}
											onClick={() => onRemove(line.id, next, n)}
										>
											{DRAMA_TEXT.removeLine}
											{only ? (
												<span className="text-muted-foreground">
													{DRAMA_TEXT.lastLine}
												</span>
											) : null}
										</DropdownMenuItem>
									</DropdownMenuGroup>
								</DropdownMenuContent>
							</DropdownMenu>
						}
					/>
				</div>
			</div>
			{target ? <DramaToolbar line={line} n={n} /> : null}
			{failed ? (
				<LineFailure
					lineId={line.id}
					provider={speakers[line.speaker]?.provider ?? "fish_audio"}
					problem={failed}
					opener={menuRef}
				/>
			) : null}
			{/* 마지막 줄 뒤에는 쉼이 없다(그 줄 쉼은 남아도 쓰이지 않는다) */}
			{last ? null : (
				<LineGap
					lineId={line.id}
					n={n}
					gap={line.gap}
					defaultGap={defaultGap}
					onChange={onChange}
				/>
			)}
		</li>
	);
}

// 대본 구역. Task 11 편집기가 화자 구역 뒤, 막대 앞에 하나 둔다. 임시 작업을 읽기 전(ready 전)에는 줄 셋 높이 뼈대다(브리프 5.4, 6절)
export function DramaLines() {
	const drama = useDrama();
	const {
		lines,
		setLine,
		addLine,
		moveLine,
		removeLine,
		noteFocus,
		badgeTarget,
	} = useLines();
	const headId = useId();
	const fullId = useId();
	// 붙여 넣기 창을 글을 채워 연다(여러 줄 붙여 넣기 알림의 동작)
	const pasteRef = useRef<((text: string) => void) | null>(null);
	const showPasted = useOwnToast();
	// 대본 구역이 사라지면(화면을 떠나면) 실행 취소 알림 둘을 닫는다(drama-undo 칸의 수명 주인)
	useEffect(() => dismissUndo, []);
	const { phase, mode, atId, failed } = useDramaRead().state;
	const take = useTakeAudio();
	const scriptKey = useScriptKey();
	const now = usePlayer().current;
	// noteFocus는 줄 목록이 바뀔 때마다 새 함수다. 줄 행에는 늘 같은 함수를 넘겨 다른 줄을 다시 그리지 않는다(advanced-event-handler-refs)
	const noteRef = useRef(noteFocus);
	useLayoutEffect(() => {
		noteRef.current = noteFocus;
	});
	const full = lines.length >= DRAMA_LINES_MAX;
	const chars = sceneChars(lines);
	const limit = sceneLimit(drama.settings.speed);
	// 화자별 연기 family·감정 재료. 화자·성우·프리셋이 바뀔 때만 새로 센다(React Compiler 메모)라 글자를 쳐도 줄 행에 같은 객체가 간다
	const cast = drama.speakers.map((_, i) => castOf(drama, i));
	// 줄 ▶가 테이크 조각이다: 테이크 모드이고, 무대 테이크가 나뉘었고, 지금 대본과 같다(스펙 17.2 '줄 ▶'). 줄에는 원시 값으로 넘긴다(계획 리뷰 P5-4)
	const segment =
		take.mode &&
		take.split &&
		take.take !== null &&
		takeKey(take.take.request) === scriptKey;
	// 조각을 듣는 줄(브리프 17절 4 '듣거나 읽는 중', 계획 리뷰 P5-19). 없으면 -1
	const heard = segment
		? take.picked.findIndex((item, i) => playsKey(now, lineKey(item.id, i)))
		: -1;

	const onNote = (at: Focus) => noteRef.current(at);
	// Enter·'줄 추가': 그 줄 바로 뒤(없으면 끝)에 다음 화자의 빈 줄, 포커스는 새 줄 대사 칸. 50줄이면 아무 일도 없다(linesFull이 말한다)
	function add(after?: string) {
		const id = flushSync(() => addLine(after));
		if (id) focusText(id);
	}
	// 확인 없이 지우고 포커스는 다음 줄 → 앞 줄 대사 칸. 알림 '실행 취소'는 지우기 직전 대본(removeLine 스냅숏)을 되살리고 그 줄 대사 칸으로 간다
	function remove(id: string, next: string | null, n: number) {
		const undo = flushSync(() => removeLine(id));
		if (!undo) return;
		if (next) focusText(next);
		showScriptUndo(DRAMA_TEXT.lineRemoved(n), undo, () => focusText(id));
	}
	const onMultiLine = (text: string) =>
		showPasted(DRAMA_TEXT.multiLinePasted, {
			label: DRAMA_TEXT.paste,
			onClick: () => pasteRef.current?.(text),
		});

	return (
		// 뼈대를 그리는 동안 구역이 받는 중이다(뼈대는 aria-hidden)
		<section
			aria-labelledby={headId}
			aria-busy={!drama.ready || undefined}
			className="flex flex-col gap-3"
		>
			{/* 대본 머리(브리프 17절 3): [대본][줄·글자 수] … [기본 쉼][붙여 넣기][자동 태그]. 좁으면 줄을 바꾸고, 자동 태그를 막는 이유는 맨 아래 줄 전체다 */}
			<div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2">
				<h2 id={headId} className="font-bold text-xl">
					{DRAMA_TEXT.script}
				</h2>
				{drama.ready ? (
					<>
						<p
							className={cn(
								"mr-auto flex items-center gap-1 text-sm tabular-nums",
								chars > limit ? "text-warning" : "text-muted-foreground",
							)}
						>
							{overMark(chars > limit)}
							{DRAMA_TEXT.count(lines.length, chars, limit)}
						</p>
						<DefaultGap />
						<DramaPasteDialog opener={pasteRef} showUndo={showScriptUndo} />
						<AutoTagButton />
					</>
				) : null}
			</div>
			{drama.ready ? (
				<>
					{/* 대본 지면: 그릇 하나, 줄 사이 구분선 없음(가름선이 대신한다). overflow-clip: 읽는 줄 바탕이 둥근 모서리 밖으로 나가지 않게(스크롤 칸을 만들지 않는다) */}
					<ol className="overflow-clip rounded-2xl bg-card py-2 ring-1 ring-border max-md:py-1">
						{lines.map((line, i) => (
							<LineRow
								key={line.id}
								line={line}
								n={i + 1}
								first={i === 0}
								last={i === lines.length - 1}
								only={lines.length === 1}
								next={lines[i + 1]?.id ?? lines[i - 1]?.id ?? null}
								target={line.id === badgeTarget}
								speakers={drama.speakers}
								cast={cast[line.speaker]}
								defaultGap={drama.gap}
								segment={segment}
								pickable={segment && take.group.length > 1}
								// 읽기 상태는 줄 id를 견준 원시 값만 넘긴다(바뀐 줄만 다시 그린다, rerender-derived-state). 받는 중에는 읽는 줄 바탕이 없다(브리프 16절 5)
								reading={
									(phase === "reading" &&
										mode === "read" &&
										atId === line.id) ||
									i === heard
								}
								failed={failed?.lineId === line.id ? failed.problem : null}
								onChange={setLine}
								onNote={onNote}
								onEnter={add}
								onMove={moveLine}
								onRemove={remove}
								onMultiLine={onMultiLine}
							/>
						))}
					</ol>
					{/* 아래(브리프 17절 4): [줄 추가][Enter 안내] + 50줄 알림 */}
					<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
						<Button
							variant="outline"
							size="lg"
							focusableWhenDisabled
							disabled={full}
							aria-describedby={full ? fullId : undefined}
							className={lockedButton(true)}
							onClick={() => add()}
						>
							<Plus data-icon="inline-start" aria-hidden="true" />
							{DRAMA_TEXT.addLine}
						</Button>
						<p id={ENTER_HELP_ID} className="text-muted-foreground text-sm">
							{DRAMA_TEXT.enterHelp}
						</p>
						{/* 늘 그려 두는 알림 칸(50줄에 닿으면 읽힌다, Enter로 닿아도 같은 줄) */}
						<p
							id={fullId}
							role="status"
							className="text-muted-foreground text-sm"
						>
							{full ? DRAMA_TEXT.linesFull : ""}
						</p>
					</div>
					<p id={GAP_HELP_ID} className="sr-only">
						{DRAMA_TEXT.gapLineHelp(gapText(drama.gap))}
					</p>
				</>
			) : (
				// 임시 작업을 읽기 전: 줄 셋 높이 뼈대(줄 하나와 가름선 약 80px)
				<Skeleton aria-hidden="true" className="h-60 rounded-2xl" />
			)}
		</section>
	);
}
