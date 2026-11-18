// apps/web/src/components/paragraph-card.tsx
"use client";

import type { ActingFamily } from "@tts-pilot-app/api/drama-acting";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	codePoints,
	DEFAULT_SETTINGS,
	fieldsOf,
	normalizeText,
	STUDIO_TEXT_MAX,
	studioTextMax,
	type TrialRequest,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button, buttonVariants } from "@tts-pilot-app/ui/components/button";
import { Checkbox } from "@tts-pilot-app/ui/components/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@tts-pilot-app/ui/components/dropdown-menu";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { Textarea } from "@tts-pilot-app/ui/components/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tts-pilot-app/ui/components/tooltip";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import {
	AudioLines,
	Check,
	CircleHelp,
	Coins,
	Ellipsis,
	Play,
	SlidersHorizontal,
	TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import {
	type ClipboardEvent,
	type KeyboardEvent,
	memo,
	type RefObject,
	type SyntheticEvent,
	useId,
	useRef,
	useState,
} from "react";
import { flushSync } from "react-dom";

import { PROVIDER_LABEL } from "@/lib/connection-view";
import type { ParagraphStatus } from "@/lib/make-all";
import {
	type Paragraph,
	spokenOf,
	tooLongOf,
	type VoiceSetup,
} from "@/lib/paragraph-script";
import { sameSettings } from "@/lib/preset-view";
import {
	chipsOf,
	NUMBER_TEXT,
	PARAGRAPH_TEXT,
	paragraphTagGroups,
} from "@/lib/studio-text";
import { emotionShift, type ListLoad, STUDIO_TEXT } from "@/lib/studio-view";

import { useElapsed } from "./bar-height";
import { fieldClass } from "./class-form-dialog";
import { LineGap } from "./drama-gap";
import { SpeakerMark } from "./drama-voice-dialog";
import { EmotionPalette } from "./emotion-palette";
import { NumberLine } from "./number-review";
import { paragraphHeadId, paragraphTextId } from "./paragraph-focus";
import { ParagraphToolbar } from "./paragraph-tags";
import { Options } from "./setting-fields";
import { menuItem } from "./voice-conditions";
import { VoicePickerDialog } from "./voice-picker-dialog";
import { lockedButton } from "./voice-problem";

// 문단 카드(T10 브리프 5.4·5.5·6.2·7·8절): li 안에 카드 면(div)과 가름선(마지막 문단 빼고).
// 카드는 useWork()를 구독하지 않는다(E10). 목록(paragraph-studio)이 상태·성우·잠금·실패 줄을 원시 값·같은 객체로, 고침은 늘 같은 actions로 내리고
// 카드는 memo라 props가 바뀐 카드만 다시 그린다(컴파일러는 목록의 map 결과를 통째로 기억할 뿐 항목별로 건너뛰지 않는다). 지난 초(useElapsed)는 지금 만드는 카드의 상태 칸만 센다

// 고친 뒤 포커스를 목적지(브리프 7절)로 옮기는 함수. null이면 바뀐 것이 없다
export type Landing = (() => void) | null;
// 목록이 내리는 고침. 모두 문단 id로 부르고, 나누기·합치기·추가·지우기는 착지를 돌려준다(⋯ 메뉴는 닫힌 뒤에 부른다)
export type CardActions = {
	text: (id: string, text: string) => void;
	// 앞(-1)·뒤(1) 문단 대본 칸으로. 이웃이 없으면 false(브라우저 기본 이동)
	neighbor: (id: string, dir: -1 | 1) => boolean;
	split: (id: string, caret: number) => Landing;
	// 앞(-1)·다음(1) 문단과 합친다. sameOnly면 두 문단의 성우·설정이 같을 때만(Backspace)
	merge: (id: string, dir: -1 | 1, sameOnly?: boolean) => Landing;
	move: (id: string, dir: -1 | 1) => void;
	insert: (id: string) => Landing;
	remove: (id: string) => Landing;
	// 빈 줄이 든 글이면 나눠 넣고 true(브라우저 붙여 넣기를 막는다)
	paste: (
		id: string,
		selection: { start: number; end: number },
		raw: string,
	) => boolean;
	voice: (id: string, setup: VoiceSetup) => void;
	followDefault: (id: string) => void;
	// 화자를 목록의 이름으로, undefined면 화자 없음으로(⋯ 메뉴 '화자')
	speaker: (id: string, name: string | undefined) => void;
	// 고르기 체크(고른 문단 id 집합은 목록이 든다)
	pick: (id: string, on: boolean) => void;
	settings: (
		id: string,
		patch: Partial<Record<string, string | number | boolean>>,
	) => void;
	reset: (id: string) => void;
	gap: (id: string, gap: number | undefined) => void;
	// 설정 칸 펼치기(한 번에 한 카드)
	toggle: (id: string) => void;
	open: (id: string) => void;
	listen: (id: string) => void;
	make: (id: string, opener: HTMLElement) => void;
	// 숫자 줄 '검수하기'·'다시 보기': 숫자 검수 창을 이 문단에서 연다(닫으면 포커스는 opener로)
	review: (id: string, opener: HTMLElement) => void;
	// 대본 칸 포커스·선택: 태그 대상 문단과 마지막 커서를 정한다(도구줄 안 포커스는 부르지 않는다)
	caret: (id: string, start: number, end: number) => void;
	// 태그 대상 문단의 마지막 커서 자리에 태그와 공백 하나를 넣는다. 값은 묶음이 정한 글 그대로(분위기는 [값], paragraphTagGroups)
	insertTag: (value: string) => void;
};

// 카드 상태 칸. quiet는 '확인 중'인데 성우 목록·찾기가 실패한 때다(이유는 막대와 레일이 말한다, 브리프 6.2)
export type CardStatus = ParagraphStatus | "quiet";

const KEYS = { split: "Alt+Enter", merge: "Backspace" } as const;
const GAP_TEXT = {
	name: PARAGRAPH_TEXT.gapName,
	reset: PARAGRAPH_TEXT.gapReset,
	resetLine: PARAGRAPH_TEXT.gapResetOf,
	unit: PARAGRAPH_TEXT.gapUnit,
};
// 줄 동작 아이콘(드라마 RowAction 모양: 회색, 가리키거나 펼치면 진해진다)
const ROW_ICON =
	"text-muted-foreground hover:text-foreground focus-visible:text-foreground aria-expanded:text-foreground";
const STATE = "flex items-center gap-1.5 text-sm";
const STATE_ICON = "size-4 shrink-0";
// 대본 칸: 테두리 없는 16px 글(모든 폭), 행간 1.6에 가까운 relaxed, hover muted, 포커스 2px ring(브리프 5.4·10, 프리미티브의 1px·반투명을 덮는다). md:text-base가 fieldClass의 md:text-sm을 덮는다.
// shortcut: 높이는 field-sizing(Textarea 기본)으로 자란다. 지원하지 않는 브라우저는 칸 안에서 스크롤한다, 그 브라우저를 쓰게 되면 드라마 뒤판(LAYER) 방식으로
const SCRIPT =
	"min-h-11 border-transparent bg-transparent px-2.5 py-2 text-base leading-relaxed md:text-base hover:bg-muted focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring dark:bg-transparent dark:hover:bg-muted dark:focus-visible:bg-card";
// 입력 칸(대본·설정)의 포커스 링은 붙은 2px ring이라 고른 카드의 안쪽 링과 닮는다. 고르기 중에는 offset 2px 윤곽(index.css studio-pick-focus)으로 바꾼다
const PICK_FOCUS = "studio-pick-focus";
const FOCUSABLE =
	'button:not([tabindex="-1"]), input:not([tabindex="-1"]), textarea, [role="switch"]';

// 대본 칸 단축키(브리프 8절). 한글 조합 중이거나 수정 키(Shift·Ctrl·Cmd, Alt+Enter가 아닌 Alt)가 있으면 없다.
// ↑·Backspace는 선택 없이 맨 앞, ↓는 선택 없이 맨 끝에서만
function shortcutOf(
	event: KeyboardEvent<HTMLTextAreaElement>,
): "up" | "down" | "split" | "merge" | null {
	if (
		event.nativeEvent.isComposing ||
		event.keyCode === 229 ||
		event.shiftKey ||
		event.ctrlKey ||
		event.metaKey
	)
		return null;
	if (event.altKey) return event.key === "Enter" ? "split" : null;
	const { selectionStart, selectionEnd, value } = event.currentTarget;
	if (selectionStart !== selectionEnd) return null;
	if (event.key === "ArrowUp" && selectionStart === 0) return "up";
	if (event.key === "ArrowDown" && selectionStart === value.length)
		return "down";
	if (event.key === "Backspace" && selectionStart === 0) return "merge";
	return null;
}

// Options가 그리는 칸 차례: 모델 → fieldsOf. 팔레트를 주면 Typecast 감정 둘(감정 모드·감정)은 그 첫 자리 팔레트 하나다(setting-fields Options와 같은 규칙)
function shownFields(request: TrialRequest, palette: boolean): string[] {
	const fields = fieldsOf(request);
	const at = palette
		? fields.find((field) => field === "emotion" || field === "preset")
		: undefined;
	return [
		"model",
		...fields.filter(
			(field) =>
				!palette || (field !== "emotion" && field !== "preset") || field === at,
		),
	];
}
// 차이 칩이 가리키는 설정 칸으로(브리프 7절). Typecast 감정은 팔레트의 눌린 알약, 그 밖은 그 칸의 첫 조작 요소. 차례에 없으면 모델 칸
function focusField(
	box: HTMLElement | null,
	pressed: HTMLElement | null,
	field: string,
) {
	if (pressed && (field === "emotion" || field === "preset")) {
		pressed.focus();
		return;
	}
	const order = box?.dataset.fields?.split(" ") ?? [];
	const slot = box?.children[Math.max(0, order.indexOf(field))];
	const target = slot?.matches(FOCUSABLE)
		? slot
		: slot?.querySelector(FOCUSABLE);
	if (target instanceof HTMLElement) target.focus();
}

// 성우 이름(카드·레일): 담은 성우면 이름, 목록을 받았는데 없으면 '보관함에 없는 성우', 목록 전이면 없음(날 voice id를 보이지 않는다)
export const voiceNameOf = (saved: SavedVoice | null, load: ListLoad) =>
	saved?.voice.name ?? (load === "ready" ? PARAGRAPH_TEXT.notSaved : null);
// 성우 단추의 이름 자리. 목록을 받는 중이면 자리 표시(단추 안이라 Skeleton(div) 대신 span), 받지 못했으면 "—"
export function VoiceName({
	saved,
	load,
}: {
	saved: SavedVoice | null;
	load: ListLoad;
}) {
	const name = voiceNameOf(saved, load);
	if (name) return <span className="min-w-0 truncate">{name}</span>;
	return load === "loading" ? (
		<span
			aria-hidden="true"
			className="h-4 w-16 animate-pulse rounded-lg bg-muted"
		/>
	) : (
		<span>{PARAGRAPH_TEXT.none}</span>
	);
}
// 성우 설정 칸을 그릴 수 없을 때(카드·레일): 목록을 받는 중이면 회색 안내, 받지 못했으면 실패, 받았는데 없으면 쓸 수 없는 성우
export function VoiceMissingNote({ load }: { load: ListLoad }) {
	return load === "loading" ? (
		<p className="text-muted-foreground text-sm">
			{PARAGRAPH_TEXT.voicesLoading}
		</p>
	) : (
		<p className="text-sm text-warning">
			{load === "failed"
				? PARAGRAPH_TEXT.voicesFailed
				: PARAGRAPH_TEXT.unavailable}
		</p>
	);
}

// 만드는 중: 청록 스피너와 지난 초(가짜 진행률 없음). 1초마다 이 칸만 다시 그린다(E10)
function MakingStatus({ since }: { since: number | null }) {
	const seconds = useElapsed(since);
	return (
		<span className={STATE}>
			<Spinner aria-hidden="true" className="text-primary" />
			{PARAGRAPH_TEXT.making(seconds)}
		</span>
	);
}

// 상태 칸(브리프 6.2): 글자 + 아이콘, 색만으로 말하지 않는다. 안 만듦은 주 동작이 말한다
function StatusCell({
	status,
	reason,
	expired,
	since,
}: {
	status: CardStatus;
	reason: string | null;
	expired: boolean;
	since: number | null;
}) {
	switch (status) {
		case "empty":
		case "checking":
			return (
				<span className="text-muted-foreground text-sm">
					{status === "empty" ? PARAGRAPH_TEXT.empty : PARAGRAPH_TEXT.checking}
				</span>
			);
		case "blocked":
		case "failed":
			return (
				<span className={cn(STATE, "text-warning")}>
					<TriangleAlert aria-hidden="true" className={STATE_ICON} />
					{reason ?? PARAGRAPH_TEXT.failed}
				</span>
			);
		case "making":
			return <MakingStatus since={since} />;
		case "made":
			return (
				<span className={cn(STATE, "text-success")}>
					<Check aria-hidden="true" className={STATE_ICON} />
					{PARAGRAPH_TEXT.made}
				</span>
			);
		case "unknown":
			// 다시 찾는 창(6분)이 지나면 회색
			return (
				<span
					className={cn(
						STATE,
						expired ? "text-muted-foreground" : "text-warning",
					)}
				>
					<CircleHelp aria-hidden="true" className={STATE_ICON} />
					{PARAGRAPH_TEXT.unknown}
				</span>
			);
		default:
			return null;
	}
}

// 카드 '만들기'(무채색 neutral + 회색 Coins, 무료면 '무료' 배지, DN-1). 전체 만들기가 도는 동안 잠기고 이유를 설명·툴팁으로 잇는다(E3).
// 잠겨도 가리켜 툴팁을 볼 수 있고 누름은 Base UI가 막는다(focusableWhenDisabled). 접근 이름에 문단 번호(200장에서 같은 이름이 줄지 않게)
function MakeButton({
	id,
	n,
	free,
	locked,
	onMake,
}: {
	id: string;
	n: number;
	free: boolean;
	locked: boolean;
	onMake: CardActions["make"];
}) {
	const reasonId = useId();
	return (
		<>
			<Tooltip disabled={!locked}>
				<TooltipTrigger
					render={
						<Button
							variant="neutral"
							size="lg"
							focusableWhenDisabled
							disabled={locked}
							aria-label={PARAGRAPH_TEXT.makeOf(n, free)}
							aria-describedby={locked ? reasonId : undefined}
							className={cn(locked && "opacity-50 hover:bg-card")}
							onClick={(event) => onMake(id, event.currentTarget)}
						/>
					}
				>
					{PARAGRAPH_TEXT.make}
					{free ? (
						<Badge variant="success">{PARAGRAPH_TEXT.free}</Badge>
					) : (
						<Coins
							data-icon="inline-end"
							aria-hidden="true"
							className="text-muted-foreground"
						/>
					)}
				</TooltipTrigger>
				<TooltipContent>{PARAGRAPH_TEXT.afterMakeAll}</TooltipContent>
			</Tooltip>
			{locked ? (
				<span id={reasonId} hidden>
					{PARAGRAPH_TEXT.afterMakeAll}
				</span>
			) : null}
		</>
	);
}

// 머리줄 아래 실패·미확인 한 줄(설정 칸이 접혀도 보인다). 키·인증이면 '연결 상태 보기'. 알리지 않는다(막대 role="alert"가 한 번 읽는다, 브리프 6.3)
function ProblemLine({
	unknown,
	text,
	connections,
	expired,
}: {
	unknown: boolean;
	text: string;
	connections: boolean;
	expired: boolean;
}) {
	const Icon = unknown ? CircleHelp : TriangleAlert;
	return (
		<div className="flex flex-col items-start gap-1">
			<p
				className={cn(
					"flex gap-2 text-sm",
					expired ? "text-muted-foreground" : "text-warning",
				)}
			>
				<Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
				{text}
			</p>
			{connections ? (
				<Button
					variant="link"
					size="lg"
					nativeButton={false}
					render={<Link href="/connections" />}
				>
					{STUDIO_TEXT.connections}
				</Button>
			) : null}
		</div>
	);
}

// 설정 칸(브리프 5.4): 그 공급자 설정(T5 칸, Typecast는 감정 팔레트) → '처음 값으로' → (자기 것이면) '기본 따르기'.
// request는 그 성우가 받는 값으로 맞춘 요청이다(펼친 카드만 목록이 만든다). 바꾸면 기본을 따르던 문단도 자기 성우가 된다(ownSettings).
// 칸 차례(data-fields)는 차이 칩이 포커스할 칸을 찾는다. 처음 값·기본으로 돌리면 칸을 다시 그린다(말투 태그의 직접 쓰기 상태)
function CardSettings({
	id,
	setup,
	own,
	speaker,
	voice,
	request,
	voicesLoad,
	actions,
	boxRef,
	pressedRef,
	toggleRef,
}: {
	id: string;
	setup: VoiceSetup | null;
	own: boolean;
	// 따르는 성우가 화자 것이면 그 화자 이름('화자 따르기')
	speaker: string | null;

	voice: Voice | null;
	request: TrialRequest | null;
	voicesLoad: ListLoad;
	actions: CardActions;
	boxRef: RefObject<HTMLDivElement | null>;
	pressedRef: RefObject<HTMLButtonElement | null>;
	toggleRef: RefObject<HTMLButtonElement | null>;
}) {
	const [resets, setResets] = useState(0);
	if (!setup)
		return (
			<p className="text-muted-foreground text-sm">
				{STUDIO_TEXT.settingsNeedVoice}
			</p>
		);
	if (!voice || !request) return <VoiceMissingNote load={voicesLoad} />;
	const change = (patch: Partial<Record<string, string | number | boolean>>) =>
		actions.settings(id, patch);
	const palette =
		request.provider === "typecast" && setup.provider === "typecast" ? (
			<EmotionPalette
				voice={voice}
				settings={request.settings}
				shift={emotionShift(setup.settings, request.settings)}
				pressedRef={pressedRef}
				onChange={change}
			/>
		) : undefined;
	const changed = !sameSettings(
		setup.provider,
		setup.settings,
		DEFAULT_SETTINGS[setup.provider],
	);
	return (
		<div className="flex flex-col gap-3 md:max-w-md">
			<div
				key={`${setup.provider}:${resets}`}
				ref={boxRef}
				data-fields={shownFields(request, palette !== undefined).join(" ")}
				className="flex flex-col gap-3"
			>
				<Options
					voice={voice}
					request={request}
					onChange={change}
					palette={palette}
				/>
			</div>
			<div className="flex flex-wrap gap-2">
				<Button
					variant="ghost"
					size="lg"
					focusableWhenDisabled
					disabled={!changed}
					className={cn("text-muted-foreground", lockedButton(!changed))}
					onClick={() => {
						actions.reset(id);
						setResets((count) => count + 1);
					}}
				>
					{PARAGRAPH_TEXT.reset}
				</Button>
				{own ? (
					// 누르면 이 단추가 사라지므로 포커스는 카드 '설정'으로
					<Button
						variant="ghost"
						size="lg"
						className="text-muted-foreground"
						onClick={() => {
							flushSync(() => {
								actions.followDefault(id);
								setResets((count) => count + 1);
							});
							toggleRef.current?.focus();
						}}
					>
						{speaker !== null
							? PARAGRAPH_TEXT.followSpeaker
							: PARAGRAPH_TEXT.followDefault}
					</Button>
				) : null}
			</div>
		</div>
	);
}

// 단축키 표기. macOS는 Alt를 Option 기호로 적는다(aria-keyshortcuts는 그대로).
// 메뉴 내용은 열릴 때만 브라우저에서 그려져 서버 HTML에 없다(navigator를 읽어도 수화가 어긋나지 않는다).
// userAgentData(Chromium, "macOS")가 먼저, 없거나 비면 navigator.platform("MacIntel")
const keyText = (keys: string) =>
	/mac|iphone|ipad/i.test(
		(navigator as Navigator & { userAgentData?: { platform: string } })
			.userAgentData?.platform || navigator.platform,
	)
		? keys.replace("Alt+", "⌥ ")
		: keys;

// ⋯ 메뉴 항목 하나(44px, 두 줄). 꺼지면 둘째 줄이 이유, 아니면 note. 단축키는 회색 표기와 aria-keyshortcuts.
// 꺼진 항목은 이름만 흐리고 이유 줄은 그대로 읽히게 둔다(프리미티브의 항목 전체 50%를 덮는다)
function MenuItem({
	label,
	keys,
	note,
	reason,
	onClick,
}: {
	label: string;
	keys?: string;
	note?: string;
	reason: string | null;
	onClick: () => void;
}) {
	const line = reason ?? note;
	return (
		<DropdownMenuItem
			className={cn(
				menuItem,
				"flex-col items-stretch gap-0.5 data-disabled:opacity-100",
			)}
			disabled={reason !== null}
			aria-keyshortcuts={keys}
			onClick={onClick}
		>
			<span className="flex items-center gap-6 group-data-disabled/dropdown-menu-item:opacity-50">
				{label}
				{keys ? (
					<kbd className="ml-auto font-sans text-muted-foreground">
						{keyText(keys)}
					</kbd>
				) : null}
			</span>
			{line ? <span className="text-muted-foreground">{line}</span> : null}
		</DropdownMenuItem>
	);
}

// ⋯ 메뉴(브리프 5.4, 세 묶음): [위로 · 아래로] / [아래에 문단 추가 · 여기서 나누기 · 앞 문단과 합치기 · 다음 문단과 합치기] / [지우기].
// 위로·아래로는 메뉴가 옮긴 카드의 이 단추로 포커스를 돌려준다. 나머지는 대본 칸으로 착지하므로 메뉴가 되돌리지 않는다(finalFocus).
// 이 카드가 남으면(나누기·추가·다음과 합치기) 메뉴가 다 닫힌 뒤 착지한다: 열린 채로 옮기면 메뉴가 닫히는 동안 포커스를 팝업으로 되가져간다(F12-6).
// 이 카드가 사라지면(앞과 합치기·지우기) 메뉴도 함께 사라져 닫힘 뒤가 오지 않으니 곧바로 착지한다
function CardMenu({
	id,
	n,
	first,
	last,
	full,
	speakerName,
	speakerNames,
	textRef,
	actions,
}: {
	id: string;
	n: number;
	first: boolean;
	last: boolean;
	full: boolean;
	// 이 문단의 화자(목록에 있는 이름)와 작업의 화자 이름들. 목록이 비면 '화자' 항목을 그리지 않는다
	speakerName: string | null;
	speakerNames: readonly string[];
	textRef: RefObject<HTMLTextAreaElement | null>;
	actions: CardActions;
}) {
	const firstReason = first ? PARAGRAPH_TEXT.firstOne : null;
	const lastReason = last ? PARAGRAPH_TEXT.lastOne : null;
	const fullReason = full ? PARAGRAPH_TEXT.paragraphsMax : null;
	// 이번에 연 메뉴에서 실제로 고쳐 대본 칸으로 착지할 항목을 눌렀다(액션이 착지를 돌려줬다)
	const moved = useRef(false);
	const after = useRef<Landing>(null);
	const away = (run: () => Landing) => () => {
		const land = run();
		moved.current = land !== null;
		if (!land) return;
		if (textRef.current?.isConnected) after.current = land;
		else land();
	};
	return (
		<DropdownMenu
			onOpenChange={(open) => {
				if (open) moved.current = false;
			}}
			onOpenChangeComplete={(open) => {
				const land = after.current;
				after.current = null;
				if (!open) land?.();
			}}
		>
			<Tooltip>
				<TooltipTrigger
					render={
						<DropdownMenuTrigger
							render={
								<Button
									variant="ghost"
									size="icon-lg"
									aria-label={PARAGRAPH_TEXT.menuOf(n)}
									className={ROW_ICON}
								/>
							}
						/>
					}
				>
					<Ellipsis aria-hidden="true" />
				</TooltipTrigger>
				<TooltipContent>{PARAGRAPH_TEXT.menu}</TooltipContent>
			</Tooltip>
			<DropdownMenuContent
				align="end"
				finalFocus={() => !moved.current}
				className="w-auto min-w-60 p-1"
			>
				<DropdownMenuGroup>
					<MenuItem
						label={PARAGRAPH_TEXT.moveUp}
						reason={firstReason}
						onClick={() => actions.move(id, -1)}
					/>
					<MenuItem
						label={PARAGRAPH_TEXT.moveDown}
						reason={lastReason}
						onClick={() => actions.move(id, 1)}
					/>
					{/* 화자가 1명 이상일 때만(브리프 16.1). 고르면 메뉴가 닫히고 포커스는 ⋯ 단추로 돌아간다 */}
					{speakerNames.length > 0 ? (
						<DropdownMenuSub>
							<DropdownMenuSubTrigger className={menuItem}>
								{PARAGRAPH_TEXT.speaker}
								{speakerName ? (
									<span className="max-w-28 truncate font-normal text-muted-foreground">
										{speakerName}
									</span>
								) : null}
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent className="min-w-44 p-1">
								<DropdownMenuRadioGroup
									value={speakerName ?? ""}
									onValueChange={(name) =>
										actions.speaker(id, name === "" ? undefined : name)
									}
								>
									{speakerNames.map((name, index) => (
										<DropdownMenuRadioItem
											key={name}
											value={name}
											closeOnClick
											className={menuItem}
										>
											<SpeakerMark index={index} />
											<span className="truncate">{name}</span>
										</DropdownMenuRadioItem>
									))}
									<DropdownMenuRadioItem
										value=""
										closeOnClick
										className={menuItem}
									>
										{PARAGRAPH_TEXT.noSpeaker}
									</DropdownMenuRadioItem>
								</DropdownMenuRadioGroup>
							</DropdownMenuSubContent>
						</DropdownMenuSub>
					) : null}
				</DropdownMenuGroup>
				<DropdownMenuSeparator className="my-1" />
				<DropdownMenuGroup>
					<MenuItem
						label={PARAGRAPH_TEXT.insertBelow}
						reason={fullReason}
						onClick={away(() => actions.insert(id))}
					/>
					<MenuItem
						label={PARAGRAPH_TEXT.splitHere}
						keys={KEYS.split}
						reason={fullReason}
						onClick={away(() =>
							actions.split(id, textRef.current?.selectionStart ?? 0),
						)}
					/>
					<MenuItem
						label={PARAGRAPH_TEXT.mergePrev}
						keys={KEYS.merge}
						note={PARAGRAPH_TEXT.mergeNote}
						reason={firstReason}
						onClick={away(() => actions.merge(id, -1))}
					/>
					<MenuItem
						label={PARAGRAPH_TEXT.mergeNextItem}
						note={PARAGRAPH_TEXT.mergeNote}
						reason={lastReason}
						onClick={away(() => actions.merge(id, 1))}
					/>
				</DropdownMenuGroup>
				<DropdownMenuSeparator className="my-1" />
				<DropdownMenuGroup>
					<MenuItem
						label={PARAGRAPH_TEXT.remove}
						reason={null}
						onClick={away(() => actions.remove(id))}
					/>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export const ParagraphCard = memo(function ParagraphCard({
	paragraph: p,
	n,
	first,
	last,
	full,
	follow,
	speaker,
	speakerName,
	speakerNames,
	selecting,
	selected,
	playing,
	defaultGap,
	saved,
	voicesLoad,
	status,
	reason,
	problem,
	connections,
	expired,
	free,
	locked,
	current,
	since,
	open,
	request,
	tagTarget,
	family,
	unsent,
	actions,
}: {
	paragraph: Paragraph;
	n: number;
	first: boolean;
	last: boolean;
	// 문단 200개(추가·나누기가 꺼진다, 브리프 6.1)
	full: boolean;
	// 자기 성우가 없을 때 따르는 성우(화자 성우 → 기본 성우)와, 그것이 화자 성우이면 그 화자 이름(원시 값이라 카드 memo가 유지된다)
	follow: VoiceSetup | null;
	speaker: string | null;
	// 이 문단의 화자(목록에 있는 이름. 머리줄 표식)와 작업의 화자 이름들(⋯ 메뉴 '화자', 목록이 바뀔 때만 바뀌는 같은 배열)
	speakerName: string | null;
	speakerNames: readonly string[];
	// 고르기 중(머리줄에 체크 상자)과 이 문단을 골랐다(안쪽 2px 청록 링), 이어 듣기가 지금 이 문단을 들려준다('듣는 중' 표식)
	selecting: boolean;
	selected: boolean;
	playing: boolean;
	defaultGap: number;
	// 이 문단이 쓰는 성우의 담은 성우 항목(없거나 목록 전이면 null)
	saved: SavedVoice | null;
	voicesLoad: ListLoad;
	status: CardStatus;
	// 막힘·실패의 짧은 이유(실패에 없으면 '만들지 못했어요')
	reason: string | null;
	// 실패·미확인 한 줄(makeProblemText·unknownExpiredOf)과 '연결 상태 보기', 미확인이 다시 찾는 창을 지났는지
	problem: string | null;
	connections: boolean;
	expired: boolean;
	free: boolean;
	// 전체 만들기가 도는 중(카드 '만들기' 잠금)
	locked: boolean;
	// 지금 만드는 문단과 보낸 시각
	current: boolean;
	since: number | null;
	open: boolean;
	// 펼친 카드의 설정 칸 요청(그 성우가 받는 값으로 맞춤). 접힌 카드는 null
	request: TrialRequest | null;
	// 태그 대상 문단(도구줄을 그린다), 그 성우의 태그 family(성우가 없으면 null), 보낼 때 빼는 태그 수(스펙 15.1·15.2)
	tagTarget: boolean;
	family: ActingFamily | null;
	unsent: number;
	actions: CardActions;
}) {
	const textRef = useRef<HTMLTextAreaElement>(null);
	const toggleRef = useRef<HTMLButtonElement>(null);
	const boxRef = useRef<HTMLDivElement>(null);
	const pressedRef = useRef<HTMLButtonElement>(null);
	const panelId = useId();
	const countId = useId();
	const noteId = useId();
	const toolsId = useId();
	const setup = p.voice ?? follow;
	const voiceName = voiceNameOf(saved, voicesLoad);
	const chips = chipsOf(p.voice, follow);
	const shownChips = chips.length > 3 ? chips.slice(0, 3) : chips;
	// 글자 수는 막는 이유(tooLongOf)와 같은 정리 뒤 코드 포인트. 성우가 없으면 일반 상한
	const max = setup ? studioTextMax(setup.provider) : STUDIO_TEXT_MAX;
	// 글자 수·상한은 보낼 글인 발음용 대본 기준이다(T11). 결정이 없으면 spokenOf가 p.text 그대로라 지금과 같다
	const spoken = spokenOf(p);
	const count = codePoints(normalizeText(spoken));
	const over = setup ? tooLongOf(spoken, setup.provider) !== null : count > max;
	const near = over || count > max * 0.9;
	// 받지 않는 태그 안내(스펙 15.2). 빈 문단(blankFor)인데 뺀 태그가 있으면 원문이 공백뿐이 아니라 태그만 있던 문단이다. v2·flash는 주어가 모델
	const note =
		unsent === 0
			? null
			: status === "empty"
				? PARAGRAPH_TEXT.unsentEmpty
				: PARAGRAPH_TEXT.unsentNote(unsent, family === "elevenlabs_plain");
	// 대상 카드의 안내 family(태그 묶음이 없는 Typecast·Airy·v2·flash)는 도구줄 자리 안내가 이 글을 보이고,
	// 아래 줄 안내는 화면 밖 설명으로만 남는다(두 줄 겹침, 브리프 15.1·critique P2)
	const merged =
		note !== null &&
		tagTarget &&
		family !== null &&
		paragraphTagGroups(family).length === 0;

	// 칩: 설정 칸을 펴고 그 칩의 칸으로(T9 감정 표식과 같다)
	function openAt(field: string) {
		if (!open) flushSync(() => actions.open(p.id));
		focusField(boxRef.current, pressedRef.current, field);
	}
	function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
		const key = shortcutOf(event);
		if (!key) return;
		const caret = event.currentTarget.selectionStart;
		// Alt+Enter는 200개여도 줄바꿈을 넣지 않는다(브리프 6.1 '아무것도 하지 않는다')
		if (key === "split") {
			event.preventDefault();
			actions.split(p.id, caret)?.();
			return;
		}
		if (key === "merge") {
			const land = actions.merge(p.id, -1, true);
			if (!land) return;
			event.preventDefault();
			land();
			return;
		}
		if (actions.neighbor(p.id, key === "up" ? -1 : 1)) event.preventDefault();
	}
	const onCaret = (event: SyntheticEvent<HTMLTextAreaElement>) =>
		actions.caret(
			p.id,
			event.currentTarget.selectionStart,
			event.currentTarget.selectionEnd,
		);
	function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
		const { selectionStart, selectionEnd } = event.currentTarget;
		if (
			actions.paste(
				p.id,
				{ start: selectionStart, end: selectionEnd },
				event.clipboardData.getData("text/plain"),
			)
		)
			event.preventDefault();
	}

	const makeable =
		status === "unmade" || status === "failed" || status === "unknown";
	return (
		<li className="flex flex-col gap-2">
			{/* 카드 면은 이름 없는 div다(카드마다 region 랜드마크를 만들면 200문단에서 랜드마크 목록이 묻힌다). 제목 탐색은 숨은 h2 '문단 N'이 맡는다 */}
			<div
				aria-current={current ? "step" : undefined}
				className={cn(
					"paragraph-card flex flex-col gap-2 rounded-2xl px-4 py-3 ring-inset transition-colors",
					// 고른 카드는 안쪽 2px 청록 링이라 만드는 중 바탕(primary-subtle)과 겹쳐도 둘 다 보인다(브리프 16.2)
					selected ? "ring-2 ring-primary" : "ring-1 ring-border",
					// 고르기 중 카드 안 칸의 포커스는 띄운 윤곽(offset)이라 붙은 고른 링과 모양으로 구분된다(버튼·체크는 이미 offset 윤곽)
					selecting && PICK_FOCUS,
					current ? "bg-primary-subtle" : "bg-card",
				)}
			>
				{/* 머리줄은 위아래로 카드 여백에 6px씩 들어가 대본이 먼저 읽힌다(단추 눌림 영역 44px은 그대로, 브리프 5.4) */}
				<div className="-my-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
					{/* 고르기 중: 머리줄 맨 앞 체크 상자(눌림 44px, Checkbox의 after 확장을 44px로) */}
					{selecting ? (
						<Checkbox
							checked={selected}
							onCheckedChange={(on) => actions.pick(p.id, on)}
							aria-label={PARAGRAPH_TEXT.pickOf(n)}
							className="after:-inset-3.5"
						/>
					) : null}
					{/* 번호는 회색 숫자, 숨은 제목 '문단 N'은 '문단 N 보기'·이동의 목적지(포커스만 받는다) */}
					<h2
						id={paragraphHeadId(p.id)}
						tabIndex={-1}
						className="min-w-6 rounded-sm font-bold text-muted-foreground text-sm tabular-nums outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
					>
						<span aria-hidden="true">{n}</span>
						<span className="sr-only">{PARAGRAPH_TEXT.paragraphN(n)}</span>
					</h2>
					{/* 화자 표식: 눌리지 않고 Tab 정지가 아니다. 접근 이름 앞에 '화자' */}
					{speakerName ? (
						<span
							title={speakerName}
							className="flex min-w-0 max-w-28 items-center gap-1.5 text-sm"
						>
							<SpeakerMark index={speakerNames.indexOf(speakerName)} />
							<span className="sr-only">{PARAGRAPH_TEXT.speaker} </span>
							<span className="truncate">{speakerName}</span>
						</span>
					) : null}
					<VoicePickerDialog
						target={{ kind: "paragraph", n }}
						current={setup}
						follow={follow}
						speaker={speaker}
						onPick={(next) => actions.voice(p.id, next)}
						onFollowDefault={
							p.voice ? () => actions.followDefault(p.id) : undefined
						}
						trigger={
							<Button
								variant="ghost"
								size="lg"
								aria-label={
									setup
										? PARAGRAPH_TEXT.voiceLabel(
												n,
												voiceName,
												setup.provider,
												!p.voice,
												speaker,
											)
										: PARAGRAPH_TEXT.pickVoiceOf(n)
								}
								// 굵기가 '기본과 다름'을 말한다: 이 문단만의 성우는 700 진하게, 기본을 따르면 400 회색(배지 없음, 브리프 5.4, DESIGN 굵기 둘)
								className={cn(
									"min-w-0 max-w-full justify-start px-3",
									setup &&
										(p.voice
											? "font-bold text-foreground"
											: "font-normal text-muted-foreground"),
								)}
							>
								{setup ? (
									<>
										<VoiceName saved={saved} load={voicesLoad} />
										<span
											className="shrink-0 font-normal text-muted-foreground"
											translate="no"
										>
											· {PROVIDER_LABEL[setup.provider]}
										</span>
									</>
								) : (
									// 대본이 생기기 전에는 회색(아직 막는 이유가 아니다)
									<span
										className={
											p.text.trim() === ""
												? "text-muted-foreground"
												: "text-warning"
										}
									>
										{STUDIO_TEXT.pickVoice}
									</span>
								)}
							</Button>
						}
					/>
					{/* 오른쪽 묶음: 상태 → 주 동작 → '설정' → ⋯. 좁으면 다음 줄로 감긴다 */}
					<div className="ml-auto flex items-center gap-1">
						{/* 이어 듣기가 지금 이 문단을 들려준다. 바탕·링은 바꾸지 않고 알리지 않는다(문단이 바뀔 때마다 읽지 않게, 브리프 16.3) */}
						{playing ? (
							<span className={cn(STATE, "text-primary")}>
								<AudioLines aria-hidden="true" className={STATE_ICON} />
								{PARAGRAPH_TEXT.playing}
							</span>
						) : null}
						<StatusCell
							status={status}
							reason={reason}
							expired={expired}
							since={since}
						/>
						{makeable ? (
							<MakeButton
								id={p.id}
								n={n}
								free={free}
								locked={locked}
								onMake={actions.make}
							/>
						) : status === "made" ? (
							<Tooltip>
								<TooltipTrigger
									render={
										<Button
											variant="ghost"
											size="icon-lg"
											aria-label={PARAGRAPH_TEXT.listen(n)}
											className={ROW_ICON}
											onClick={() => actions.listen(p.id)}
										/>
									}
								>
									<Play aria-hidden="true" />
								</TooltipTrigger>
								<TooltipContent>{PARAGRAPH_TEXT.listen(n)}</TooltipContent>
							</Tooltip>
						) : status === "checking" || status === "quiet" ? (
							// 확인 중에는 '만들기' 자리를 비워 둔다(찾은 뒤 머리줄이 밀리지 않게, 브리프 6.2)
							<span
								aria-hidden="true"
								className={cn(
									buttonVariants({ variant: "neutral", size: "lg" }),
									"invisible",
								)}
							>
								{PARAGRAPH_TEXT.make}
								<Coins data-icon="inline-end" />
							</span>
						) : null}
						<Tooltip>
							<TooltipTrigger
								render={
									<Button
										ref={toggleRef}
										variant="ghost"
										size="icon-lg"
										aria-label={PARAGRAPH_TEXT.settingsOf(n)}
										aria-expanded={open}
										aria-controls={panelId}
										className={ROW_ICON}
										onClick={() => actions.toggle(p.id)}
									/>
								}
							>
								<SlidersHorizontal aria-hidden="true" />
							</TooltipTrigger>
							<TooltipContent>{STUDIO_TEXT.settings}</TooltipContent>
						</Tooltip>
						<CardMenu
							id={p.id}
							n={n}
							first={first}
							last={last}
							full={full}
							speakerName={speakerName}
							speakerNames={speakerNames}
							textRef={textRef}
							actions={actions}
						/>
					</div>
				</div>
				{/* 둘째 줄 차이 칩: 32px 알약, 위아래 투명 확장으로 눌림 영역 44px. 셋을 넘으면 넷째 자리 +N */}
				{chips.length > 0 ? (
					<div className="flex flex-wrap gap-x-2 gap-y-3 py-1.5">
						{shownChips.map((chip) => (
							<Button
								key={chip.field}
								variant="secondary"
								aria-label={PARAGRAPH_TEXT.chipAction(chip.text)}
								className="relative rounded-full px-3 font-normal after:absolute after:inset-x-0 after:-inset-y-1.5"
								onClick={() => openAt(chip.field)}
							>
								{chip.text}
							</Button>
						))}
						{chips.length > 3 ? (
							<Button
								variant="secondary"
								aria-label={PARAGRAPH_TEXT.moreChipsLabel(chips.length - 3)}
								className="relative rounded-full px-3 font-normal tabular-nums after:absolute after:inset-x-0 after:-inset-y-1.5"
								onClick={() => openAt(chips[3].field)}
							>
								{PARAGRAPH_TEXT.moreChips(chips.length - 3)}
							</Button>
						) : null}
					</div>
				) : null}
				{problem ? (
					<ProblemLine
						unknown={status === "unknown"}
						text={problem}
						connections={connections}
						expired={expired}
					/>
				) : null}
				{/* 늘 그려 aria-controls가 있는 id를 가리킨다. 접혀 있으면 안을 그리지 않는다 */}
				<div
					id={panelId}
					hidden={!open}
					className="border-border border-t pt-3"
				>
					{open ? (
						<CardSettings
							id={p.id}
							setup={setup}
							own={p.voice !== undefined}
							speaker={speaker}
							voice={saved?.voice ?? null}
							request={request}
							voicesLoad={voicesLoad}
							actions={actions}
							boxRef={boxRef}
							pressedRef={pressedRef}
							toggleRef={toggleRef}
						/>
					) : null}
				</div>
				{/* 대본 칸 → 도구줄(태그 대상일 때) → 아래 줄(왼쪽 안내, 오른쪽 글자 수). 글자 수는 포커스했을 때와 상한의 90%를 넘었을 때만 보인다.
				    안내는 늘 보인다. 둘 다 숨어 있어도 칸 설명으로 읽힌다 */}
				<div className="group/text flex flex-col gap-1">
					<Textarea
						ref={textRef}
						id={paragraphTextId(p.id)}
						name="paragraph-text"
						data-studio-script=""
						autoComplete="off"
						value={p.text}
						onChange={(event) => actions.text(p.id, event.target.value)}
						onKeyDown={onKey}
						onPaste={onPaste}
						onFocus={onCaret}
						onSelect={onCaret}
						aria-label={PARAGRAPH_TEXT.scriptOf(n)}
						aria-describedby={note ? `${countId} ${noteId}` : countId}
						aria-invalid={over || undefined}
						placeholder={first && last ? PARAGRAPH_TEXT.placeholder : undefined}
						className={cn(fieldClass, SCRIPT)}
					/>
					{tagTarget && family ? (
						<ParagraphToolbar
							id={toolsId}
							n={n}
							family={family}
							note={merged ? note : null}
							onPick={actions.insertTag}
							onSettings={() =>
								openAt(
									family === "airy"
										? "style"
										: family === "typecast_v21"
											? "preset"
											: "emotion",
								)
							}
						/>
					) : null}
					{/* 숫자 줄: 교정 항목이 있는 문단에만 있다(발음용 대본 판과 검수 상태, 브리프 17.1) */}
					<NumberLine
						paragraph={p}
						n={n}
						onReview={(opener) => actions.review(p.id, opener)}
					/>
					{/* 안내도 글자 수도 보이지 않으면 줄째 숨긴다(빈 줄이 간격을 더하지 않게). 도구줄로 옮긴 안내는 화면 밖이라 보이지 않는 셈이다 */}
					<div
						className={cn(
							"flex items-start gap-x-4",
							(!note || merged) &&
								!near &&
								"hidden group-focus-within/text:flex",
						)}
					>
						{note ? (
							<p
								id={noteId}
								className={merged ? "sr-only" : "text-muted-foreground text-sm"}
							>
								{note}
							</p>
						) : null}
						<p
							id={countId}
							className={cn(
								"ml-auto shrink-0 items-center gap-1 text-sm tabular-nums",
								over ? "text-warning" : "text-muted-foreground",
								near ? "flex" : "hidden group-focus-within/text:flex",
							)}
						>
							{over ? (
								<TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
							) : null}
							{spoken === p.text
								? PARAGRAPH_TEXT.count(count, max)
								: NUMBER_TEXT.spokenCount(count, max)}
						</p>
					</div>
				</div>
			</div>
			{/* 마지막 문단 뒤에는 쉼이 없다(스펙 3절) */}
			{last ? null : (
				<LineGap
					id={p.id}
					n={n}
					gap={p.gap}
					defaultGap={defaultGap}
					onChange={(gap) => actions.gap(p.id, gap)}
					text={GAP_TEXT}
				/>
			)}
		</li>
	);
});
