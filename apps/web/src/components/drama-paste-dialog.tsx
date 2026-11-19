// apps/web/src/components/drama-paste-dialog.tsx
"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@tts-pilot-app/ui/components/dialog";
import { Textarea } from "@tts-pilot-app/ui/components/textarea";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { ClipboardPaste, TriangleAlert } from "lucide-react";
import {
	type RefObject,
	useId,
	useImperativeHandle,
	useRef,
	useState,
} from "react";

import {
	DRAMA_TEXT,
	type PasteResult,
	parsePaste,
	speakerNameOf,
	speakerVoice,
} from "@/lib/drama-view";

import { fieldClass } from "./class-form-dialog";
import { DialogCloseButton } from "./dialog-close-button";
import { dramaFieldId, useDrama, useLines } from "./drama-provider";
import { SpeakerMark } from "./drama-voice-dialog";
import { lockedButton } from "./voice-problem";

// 대본 붙여 넣기 창(브리프 5.6). '대본 붙여 넣기' 버튼이 창을 열고, 대사 칸에 여러 줄을 붙여 넣은 알림의 동작도 그 글을 채워 연다(opener).
// 미리 보기는 입력마다 parsePaste로 셈하고, '바꾸기'는 같은 결과를 from과 함께 replace에 넘긴다(Ruling 18: 규칙 5도 제자리 from이라
// 목록 받기 실패로 가려진 성우 id를 지우지 않는다). 바꾸면 창을 닫고 대본 실행 취소 알림(showUndo, 화면에 하나)을 띄운다

const PASTE_ERROR = {
	too_many_speakers: DRAMA_TEXT.pasteTooManySpeakers,
	too_many_lines: DRAMA_TEXT.pasteTooManyLines,
	empty: DRAMA_TEXT.pasteEmpty,
} satisfies Record<Extract<PasteResult, { error: string }>["error"], string>;

// 창 안(열려 있을 때만 그려져 줄 목록을 읽는다). 빈 글이면 미리 보기 없이 '바꾸기'만 잠근다(쓰기 전부터 오류를 띄우지 않는다)
function PasteBody({
	seed,
	textId,
	onReplaced,
}: {
	seed: string;
	textId: string;
	// 바꾼 뒤: 알림 문구, 실행 취소, 되살릴 첫 줄 id
	onReplaced: (message: string, undo: () => void, first: string | null) => void;
}) {
	const drama = useDrama();
	const { lines, replace } = useLines();
	const [text, setText] = useState(seed);
	const errorId = useId();
	const emptyId = useId();
	const empty = text.trim() === "";
	const preview = empty ? null : parsePaste(text, drama.speakers, () => "");
	const error =
		preview && "error" in preview ? PASTE_ERROR[preview.error] : null;
	const result = preview && !("error" in preview) ? preview : null;
	const filled = lines.some(
		(line) => line.text.trim() !== "" || line.direction.trim() !== "",
	);

	function apply() {
		const next = parsePaste(text, drama.speakers, () => crypto.randomUUID());
		if ("error" in next) return;
		const first = lines[0]?.id ?? null;
		const undo = replace(next.speakers, next.lines, next.from);
		onReplaced(
			DRAMA_TEXT.replaced(next.lines.length, next.speakers.length),
			undo,
			first,
		);
	}

	return (
		<>
			{/* 오른쪽 위 '닫기'(44px + 12px)와 제목이 겹치지 않게 오른쪽을 비운다 */}
			<DialogHeader className="pr-12">
				<DialogTitle>{DRAMA_TEXT.paste}</DialogTitle>
				<DialogDescription>{DRAMA_TEXT.pasteDescription}</DialogDescription>
			</DialogHeader>
			<div className="flex min-w-0 flex-col gap-3">
				<label htmlFor={textId} className="sr-only">
					{DRAMA_TEXT.pasteLabel}
				</label>
				{/* 입력을 자르지 않는다(maxLength 없음, Ruling 14). 길면 칸 안에서 스크롤한다 */}
				<Textarea
					id={textId}
					autoComplete="off"
					value={text}
					onChange={(event) => setText(event.target.value)}
					placeholder={DRAMA_TEXT.pastePlaceholder}
					className={cn(fieldClass, "max-h-80 min-h-40")}
				/>
				{/* 요약 한 줄만 읽힌다(오류면 그 줄이 대신한다). 늘 그려 두어(빈 글이어도 한 줄 자리) 바뀐 글이 읽히고 칸 아래가 튀지 않는다 */}
				<p
					id={errorId}
					aria-live="polite"
					className={cn(
						"flex min-h-5 items-center gap-2 text-sm",
						error ? "text-warning" : "font-bold",
					)}
				>
					{error ? (
						<>
							<TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
							{error}
						</>
					) : result ? (
						DRAMA_TEXT.pasteSummary(result.lines.length, result.speakers.length)
					) : null}
				</p>
				{result ? (
					<ul className="flex flex-col gap-1">
						{result.speakers.map((speaker, index) => {
							// 이어 쓰는 성우는 그 화자 공급자로 본다(다른 공급자·프리셋도, Task 16 리뷰 Minor 3). 카드 첫 줄과 같은 이름
							const carried = speakerVoice(
								speaker,
								drama.savedVoices,
								drama.presets,
							);
							return (
								// 화자는 번호가 정체다(규칙 5에서는 지금 화자 그대로라 이름이 겹치거나 빌 수 있다)
								<li key={index} className="flex min-w-0 items-center gap-2">
									<SpeakerMark index={index} />
									<span className="min-w-0 truncate font-bold">
										{speakerNameOf(result.speakers, index)}
									</span>
									<span className="min-w-0 truncate text-muted-foreground text-sm">
										{carried
											? DRAMA_TEXT.pasteCarried(carried.name)
											: DRAMA_TEXT.pasteNoVoice}
									</span>
								</li>
							);
						})}
					</ul>
				) : null}
				{filled ? (
					<p className="text-muted-foreground text-sm">
						{DRAMA_TEXT.pasteReplaceNote(lines.length)}
					</p>
				) : null}
			</div>
			{/* 767px 이하 시트에서는 두 버튼이 가로 반반(DialogButtons와 같다) */}
			<DialogFooter>
				<DialogClose
					render={
						<Button
							variant="neutral"
							size="lg"
							className="flex-1 md:flex-none"
						/>
					}
				>
					{DRAMA_TEXT.cancel}
				</DialogClose>
				<Button
					size="lg"
					focusableWhenDisabled
					disabled={result === null}
					// 잠긴 이유: 오류면 보이는 오류 줄, 빈 글이면 화면 밖 pasteEmpty(쓰기 전에는 보이는 오류를 띄우지 않는다)
					aria-describedby={error ? errorId : empty ? emptyId : undefined}
					className={cn("flex-1 md:flex-none", lockedButton(true))}
					onClick={apply}
				>
					{DRAMA_TEXT.replace}
				</Button>
				{empty ? (
					<span id={emptyId} className="sr-only">
						{DRAMA_TEXT.pasteEmpty}
					</span>
				) : null}
			</DialogFooter>
			{/* DOM 끝에 둔다(Tab 순서에서 버튼보다 뒤, 성우 고르기 창과 같다) */}
			<DialogCloseButton label={DRAMA_TEXT.close} />
		</>
	);
}

// 목록 아래 outline '대본 붙여 넣기'와 그 창. opener는 글을 채워 여는 함수를 받는다(대사 칸의 여러 줄 붙여 넣기 알림).
// 열면 포커스는 글 칸, 닫히면(바꾸기·취소·닫기·Esc) 이 버튼. 실행 취소는 첫 줄 대사 칸으로 간다(브리프 7절)
export function DramaPasteDialog({
	opener,
	showUndo,
}: {
	opener?: RefObject<((text: string) => void) | null>;
	// 대본 실행 취소 알림(drama-undo showScriptUndo, 화면에 하나): 문구, 실행 취소, 되살린 뒤 할 일
	showUndo: (message: string, undo: () => void, after?: () => void) => void;
}) {
	const [open, setOpen] = useState(false);
	// 열 때 글 칸에 채울 글. 창 안은 열 때마다 새로 그려 이 값으로 시작한다
	const [seed, setSeed] = useState("");
	const triggerRef = useRef<HTMLButtonElement>(null);
	const textId = useId();
	useImperativeHandle(
		opener,
		() => (text: string) => {
			setSeed(text);
			setOpen(true);
		},
		[],
	);
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (next) setSeed("");
				setOpen(next);
			}}
		>
			{/* 767px 이하 보이는 글은 '붙여 넣기'이고 접근 이름은 늘 전체다(브리프 17절 3) */}
			<DialogTrigger
				render={
					<Button
						ref={triggerRef}
						variant="neutral"
						size="lg"
						aria-label={DRAMA_TEXT.paste}
					/>
				}
			>
				<ClipboardPaste data-icon="inline-start" aria-hidden="true" />
				<span className="md:hidden">{DRAMA_TEXT.pasteShort}</span>
				<span className="max-md:hidden">{DRAMA_TEXT.paste}</span>
			</DialogTrigger>
			<DialogContent
				initialFocus={() => document.getElementById(textId) ?? true}
				// 알림 동작으로 열었어도 닫히면 이 버튼으로 간다
				finalFocus={triggerRef}
				className="md:max-w-lg"
			>
				<PasteBody
					seed={seed}
					textId={textId}
					onReplaced={(message, undo, first) => {
						setOpen(false);
						showUndo(message, undo, () => {
							if (first)
								document.getElementById(dramaFieldId(first, "text"))?.focus();
						});
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
