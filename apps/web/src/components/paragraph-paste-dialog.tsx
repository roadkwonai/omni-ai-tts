// apps/web/src/components/paragraph-paste-dialog.tsx
"use client";

import {
	PARAGRAPHS_MAX,
	STUDIO_TEXT_MAX,
	studioTextMax,
} from "@tts-pilot-app/api/providers/trial-options";
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
import { Toggle } from "@tts-pilot-app/ui/components/toggle";
import { ToggleGroup } from "@tts-pilot-app/ui/components/toggle-group";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { ClipboardPaste, TriangleAlert } from "lucide-react";
import { useId, useRef, useState } from "react";

import {
	idleSpeakerCount,
	type Paragraph,
	pasteToParts,
	speakerMax,
	speakersAdd,
} from "@/lib/paragraph-script";
import { PARAGRAPH_TEXT } from "@/lib/studio-text";
import { STUDIO_TEXT } from "@/lib/studio-view";

import { fieldClass } from "./class-form-dialog";
import { DialogCloseButton } from "./dialog-close-button";
import { SpeakerMark } from "./drama-voice-dialog";
import { centered, paragraphTextId } from "./paragraph-focus";
import { useParagraphs, useWork } from "./paragraph-provider";
import { sourceItem } from "./setting-fields";
import { lockedButton } from "./voice-problem";

// 대본 붙여 넣기 창(T10 브리프 5.8). 빈 줄로 덩어리를 나누고 `이름: 대사`는 화자 문단으로 읽으며, 상한(그 화자가 따르는 성우의 상한)을 넘는 덩어리는 문장 끝에서 더 나눈다(pasteToParts).
// 화자는 목록에 없는 이름만 더하고 지우지 않는다(되돌리기가 문단만 되돌리게, 계획 2.2). 기존 목록 ∪ 새 이름이 20명을 넘으면 넣기를 잠근다.
// 넣으면 창을 닫고 '되돌리기' 알림(useParagraphs().edit), 포커스는 넣은 첫 문단의 대본 칸(브리프 7절).
// 대본이 있으면 처음 방식은 '이어 넣기'이고, '전체 바꾸기'를 고르면 미리 보기 위에 지울 문단 수를 경고한다(critique 반영)

type Mode = "replace" | "append";
// '이어 넣기'는 끝 문단이 비었으면 그 자리에 넣는다(목록 가운데 빈 카드가 남지 않게). '전체 바꾸기' 경고도 빈 끝 문단은 세지 않는다
const withoutBlankEnd = (ps: Paragraph[]) =>
	ps.at(-1)?.text.trim() === "" ? ps.slice(0, -1) : ps;

// 창 안(열려 있을 때만 그려져 문단 목록을 읽는다). 빈 글이면 미리 보기 없이 '넣기'만 잠근다(쓰기 전부터 경고를 띄우지 않는다)
function PasteBody({
	textId,
	raw,
	onRaw,
	onInserted,
}: {
	textId: string;
	// 붙여 넣을 글은 창 밖에 둔다(글이 있는 동안 바깥 누르기로 닫히지 않게)
	raw: string;
	onRaw: (raw: string) => void;
	onInserted: (firstId: string) => void;
}) {
	const work = useWork();
	const { paragraphs, edit, undoable } = useParagraphs();
	const [mode, setMode] = useState<Mode>("append");
	const previewId = useId();
	const emptyId = useId();
	// 지금 대본이 비었으면 세그먼트가 없고 늘 바꾼다(빈 카드를 남기지 않는다)
	const hasScript = paragraphs.some((p) => p.text.trim() !== "");
	const append = hasScript && mode === "append";
	// '전체 바꾸기'로 사라질 문단과 그 가운데 성우나 설정을 따로 바꾼 문단(설정을 바꾸면 ownSettings가 자기 성우를 만든다)
	const kept = withoutBlankEnd(paragraphs);
	const own = kept.filter((p) => p.voice !== undefined).length;
	// 새 문단은 화자가 있으면 그 화자 성우, 없으면 기본 성우를 따른다(조각마다 speakerMax). 안내 글의 상한은 기본 성우 것이고 성우가 없으면 일반 상한
	const meta = work.work;
	const voice = meta.defaultVoice;
	const max = voice ? studioTextMax(voice.provider) : STUDIO_TEXT_MAX;
	const room = append ? PARAGRAPHS_MAX - kept.length : PARAGRAPHS_MAX;
	const { parts, names, extra, long } = pasteToParts(
		raw,
		(speaker) => speakerMax(meta, speaker),
		room,
	);
	// 화자 목록에 더한 결과. null이면 20명을 넘어 넣을 수 없다
	const list = meta.speakers ?? [];
	const added = speakersAdd(list, names);
	const empty = raw.trim() === "";

	function insert() {
		if (parts.length === 0 || !added) return;
		const fresh: Paragraph[] = parts.map(({ text, speaker }) => ({
			id: crypto.randomUUID(),
			text,
			...(speaker === undefined ? {} : { speaker }),
		}));
		const message = PARAGRAPH_TEXT.inserted(fresh.length, extra);
		if (hasScript && !append) {
			// 전체 바꾸기: 새 작업 id를 받고 연결은 그대로 둔다(저장 안 됨으로 보인다). 되돌리면 문단과 함께 이전 id·화자도 돌아온다
			const previous = { ...meta, paragraphs };
			const { id: _id, ...rest } = meta;
			work.replaceWork(
				{
					...rest,
					paragraphs: fresh,
					...(added !== list ? { speakers: added } : {}),
				},
				{ linked: work.linked },
			);
			const linked = work.linked;
			undoable(message, () => work.replaceWork(previous, { linked }));
		} else {
			edit(
				(ps) =>
					append
						? [...withoutBlankEnd(ps), ...fresh].slice(0, PARAGRAPHS_MAX)
						: fresh,
				{ message },
			);
			if (added !== list) work.setSpeakers(added);
		}
		onInserted(fresh[0].id);
	}

	return (
		<>
			{/* 오른쪽 위 '닫기'(44px + 12px)와 제목이 겹치지 않게 오른쪽을 비운다 */}
			<DialogHeader className="pr-12">
				<DialogTitle>{PARAGRAPH_TEXT.paste}</DialogTitle>
				<DialogDescription>
					{PARAGRAPH_TEXT.pasteDescription(max)}
				</DialogDescription>
			</DialogHeader>
			<div className="flex min-w-0 flex-col gap-3">
				<label htmlFor={textId} className="sr-only">
					{PARAGRAPH_TEXT.pasteLabel}
				</label>
				{/* 입력을 자르지 않는다. 길면 칸 안에서 스크롤한다 */}
				<Textarea
					id={textId}
					name="paragraph-paste"
					autoComplete="off"
					value={raw}
					onChange={(event) => onRaw(event.target.value)}
					aria-describedby={previewId}
					className={cn(fieldClass, "max-h-96 min-h-60")}
				/>
				{hasScript ? (
					<ToggleGroup
						value={[mode]}
						onValueChange={(next) => {
							if (next[0]) setMode(next[0] as Mode);
						}}
						aria-label={PARAGRAPH_TEXT.pasteMode}
						className="bg-muted p-1"
					>
						<Toggle value="append" className={sourceItem}>
							{PARAGRAPH_TEXT.append}
						</Toggle>
						<Toggle value="replace" className={sourceItem}>
							{PARAGRAPH_TEXT.replaceAll}
						</Toggle>
					</ToggleGroup>
				) : null}
				{/* 늘 그려 두어(빈 글이어도 한 줄 자리) 바뀐 수가 읽히고 칸 아래가 튀지 않는다. '전체 바꾸기' 경고는 맨 위 줄이라 고르면 읽히고 '넣기' 설명에도 든다 */}
				<div id={previewId} aria-live="polite" className="flex flex-col gap-1">
					{hasScript && !append ? (
						<p className="flex gap-2 text-sm text-warning">
							<TriangleAlert
								aria-hidden="true"
								className="mt-0.5 size-4 shrink-0"
							/>
							{PARAGRAPH_TEXT.replaceWarning(kept.length, own)}
						</p>
					) : null}
					<p className="min-h-5 font-bold text-sm tabular-nums">
						{empty
							? null
							: `${PARAGRAPH_TEXT.splitsInto(parts.length + extra)}${long > 0 ? PARAGRAPH_TEXT.splitLonger(long) : ""}`}
					</p>
					{/* 찾은 화자. `참고:` 같은 줄이 화자로 읽혔는지 넣기 전에 본다 */}
					{names.length > 0 ? (
						<p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
							<span className="tabular-nums">
								{PARAGRAPH_TEXT.pasteSpeakersHead(names.length)}
							</span>
							{PARAGRAPH_TEXT.pasteSpeakersShown(names).map((name) => (
								<span
									key={name}
									className="flex min-w-0 max-w-40 items-center gap-1.5"
								>
									{/* 표식 번호·색은 넣은 뒤 화자 목록 순서다(넣을 수 없으면 이 글의 순서) */}
									<SpeakerMark
										index={Math.max(
											0,
											(added ?? names.map((n) => ({ name: n }))).findIndex(
												(s) => s.name === name,
											),
										)}
									/>
									<span className="truncate">{name}</span>
								</span>
							))}
							{PARAGRAPH_TEXT.pasteSpeakersMore(names)}
						</p>
					) : null}
					{!added ? (
						<p className="flex items-center gap-2 text-sm text-warning">
							<TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
							{PARAGRAPH_TEXT.speakersMax(idleSpeakerCount(list, paragraphs))}
						</p>
					) : null}
					{extra > 0 ? (
						<p className="flex items-center gap-2 text-sm text-warning">
							<TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
							{PARAGRAPH_TEXT.overLimit(extra)}
						</p>
					) : null}
				</div>
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
					{PARAGRAPH_TEXT.cancel}
				</DialogClose>
				{/* 잠기면 무채색 neutral(잠긴 주 버튼은 채움 50%가 아니다, 브리프 3절) */}
				<Button
					variant={parts.length === 0 || !added ? "neutral" : "default"}
					size="lg"
					focusableWhenDisabled
					disabled={parts.length === 0 || !added}
					// 잠긴 이유: 빈 글이면 화면 밖 문구, 자리가 없으면 보이는 넘침 줄
					aria-describedby={empty ? emptyId : previewId}
					className={cn("flex-1 md:flex-none", lockedButton(true))}
					onClick={insert}
				>
					{PARAGRAPH_TEXT.insert}
				</Button>
				{empty ? (
					<span id={emptyId} className="sr-only">
						{PARAGRAPH_TEXT.pasteEmpty}
					</span>
				) : null}
			</DialogFooter>
			{/* DOM 끝에 둔다(Tab 순서에서 버튼보다 뒤) */}
			<DialogCloseButton label={STUDIO_TEXT.close} />
		</>
	);
}

// '대본 붙여 넣기' 버튼과 창(레일·1단 작업 띠가 하나씩 그린다). filled는 채운 청록 우선순위(fillOf)가 이 버튼일 때다.
// 열면 포커스는 글 칸, 넣으면 넣은 첫 문단의 대본 칸(가운데로 옮긴 뒤), 취소·닫기는 이 버튼(브리프 7절).
// 글이 있는 동안은 바깥 누르기로 닫히지 않는다(DESIGN.md 입력 창)
export function ParagraphPasteDialog({ filled }: { filled: boolean }) {
	const [open, setOpen] = useState(false);
	const [raw, setRaw] = useState("");
	// 넣은 첫 문단 id. 창이 닫힌 뒤(문단이 그려진 뒤) 그 대본 칸으로 간다
	const inserted = useRef<string | null>(null);
	const textId = useId();
	return (
		<Dialog
			open={open}
			disablePointerDismissal={raw !== ""}
			onOpenChange={(next) => {
				if (next) {
					inserted.current = null;
					setRaw("");
				}
				setOpen(next);
			}}
		>
			<DialogTrigger
				render={<Button variant={filled ? "default" : "neutral"} size="lg" />}
			>
				<ClipboardPaste data-icon="inline-start" aria-hidden="true" />
				{PARAGRAPH_TEXT.paste}
			</DialogTrigger>
			<DialogContent
				initialFocus={() => document.getElementById(textId) ?? true}
				// Base UI는 preventScroll로 돌려주므로 먼저 가운데로 옮긴다('문단 N 보기'와 같은 착지)
				finalFocus={() =>
					(inserted.current !== null &&
						centered(paragraphTextId(inserted.current))) ||
					true
				}
				className="md:max-w-2xl"
			>
				<PasteBody
					textId={textId}
					raw={raw}
					onRaw={setRaw}
					onInserted={(id) => {
						inserted.current = id;
						setOpen(false);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
