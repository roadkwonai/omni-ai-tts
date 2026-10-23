// apps/web/src/components/drama-autotag.tsx
"use client";

import { useMutation } from "@tanstack/react-query";
import type { Feel } from "@tts-pilot-app/api/drama-acting";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@tts-pilot-app/ui/components/alert-dialog";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@tts-pilot-app/ui/components/dialog";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { Coins, TriangleAlert } from "lucide-react";
import {
	createContext,
	type ReactNode,
	type RefObject,
	useContext,
	useId,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";

import {
	type AutoTagChange,
	type AutoTagSent,
	autoTagApply,
	autoTagBlock,
	autoTagChanges,
	autoTagInput,
	autoTagNotes,
	autoTagProblemText,
	DRAMA_TEXT,
	type DraftLine,
	feelText,
	newSpeaker,
	shownFeel,
	speakerNameOf,
	speakerValue,
	voiceOfSpeaker,
} from "@/lib/drama-view";
import { trialFailureOf } from "@/lib/trial-view";
import { orpc } from "@/utils/orpc";

import { dramaFieldId, useDrama, useLines } from "./drama-provider";
import { SpeakerMark } from "./drama-voice-dialog";
import { lockedButton } from "./voice-problem";

// 전체 자동 태그(브리프 14절 배치 6, 17절 3, 스펙 14.4·14.5): 대본 머리의 버튼 → 확인 창 → dramaAutoTag 한 번(Gemini 텍스트, 유료) →
// 미리 보기 → '모두 바꾸기'(대본 실행 취소 10초) 또는 '닫기'. 창 둘은 편집기에 하나씩 두고(DramaAutoTag), 버튼은 대본 머리에 있다(AutoTagButton).
// 자동으로 다시 보내지 않는다(tts-provider). 보낸 줄은 그때의 줄 객체로 기억해 그사이 고친 줄을 건너뛴다(autoTagApply)

type Open = (opener: HTMLElement | null) => void;
const AutoTagContext = createContext<{ open: Open; busy: boolean } | null>(
	null,
);
type Preview = { changes: AutoTagChange[]; skipped: number };

// 창 둘(확인·미리 보기)과 그 상태. showUndo는 대본 실행 취소 알림(drama-undo showScriptUndo, 화면에 하나)이다
export function DramaAutoTag({
	showUndo,
	children,
}: {
	showUndo: (message: string, undo: () => void, after?: () => void) => void;
	children: ReactNode;
}) {
	const mutation = useMutation({
		...orpc.dramaAutoTag.mutationOptions(),
		retry: false,
		// 루프백으로만 붙으니 브라우저 offline 판단으로 멈추지 않게 한다(drama-provider와 같다)
		networkMode: "always",
	});
	const [phase, setPhase] = useState<"closed" | "confirm" | "preview">(
		"closed",
	);
	const [opener, setOpener] = useState<HTMLElement | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [preview, setPreview] = useState<Preview>({ changes: [], skipped: 0 });
	const cancelRef = useRef<HTMLButtonElement>(null);
	// 렌더를 기다리지 않고 두 번째 요청을 막는다(두 번 누름). 버튼 잠금은 보조다
	const sendingRef = useRef(false);
	// 확인 창이 미리 보기로 넘어가며 닫힐 때는 포커스를 연 버튼으로 돌리지 않는다(미리 보기 창이 가져간다)
	const toPreview = useRef(false);
	const busy = mutation.isPending;

	const open: Open = (element) => {
		if (sendingRef.current) return;
		toPreview.current = false;
		setOpener(element);
		setError(null);
		setPhase("confirm");
	};

	async function send(
		input: ReturnType<typeof autoTagInput>["input"],
		sent: AutoTagSent[],
		label: (line: DraftLine, feel: Feel | undefined) => string | null,
	) {
		if (sendingRef.current) return;
		sendingRef.current = true;
		setError(null);
		try {
			const reply = await mutation.mutateAsync(input);
			setPreview({
				changes: autoTagChanges(sent, reply.lines, label),
				skipped: reply.skipped,
			});
			toPreview.current = true;
			setPhase("preview");
		} catch (failure) {
			// 창을 닫지 않고 이유를 보이며 포커스를 '취소'로 둔다(ConfirmDialog와 같다). 다시 보내기는 사용자가 누른다
			setError(autoTagProblemText(trialFailureOf(failure)));
			cancelRef.current?.focus();
		} finally {
			sendingRef.current = false;
		}
	}

	return (
		<AutoTagContext value={{ open, busy }}>
			{children}
			<AlertDialog
				open={phase === "confirm"}
				onOpenChange={(next) => {
					// 보내는 중에는 취소·Esc로 닫지 않는다(답이 와야 미리 보기가 열린다)
					if (!next && !sendingRef.current) setPhase("closed");
				}}
			>
				<AlertDialogContent
					initialFocus={cancelRef}
					finalFocus={() => (toPreview.current ? false : (opener ?? true))}
				>
					<ConfirmBody
						error={error}
						busy={busy}
						cancelRef={cancelRef}
						onSend={send}
					/>
				</AlertDialogContent>
			</AlertDialog>
			<Dialog
				open={phase === "preview"}
				onOpenChange={(next) => {
					if (!next) setPhase("closed");
				}}
			>
				<DialogContent
					finalFocus={() => opener ?? true}
					className="md:max-w-lg"
				>
					<PreviewBody
						preview={preview}
						onDone={() => setPhase("closed")}
						showUndo={showUndo}
					/>
				</DialogContent>
			</Dialog>
		</AutoTagContext>
	);
}

// 확인 창 안(드라마 확인 창 모양: 첫 포커스 '취소', 바깥 누르기로 닫히지 않음). '제안 받기'를 누를 때 지금 대본으로 입력을 만든다
function ConfirmBody({
	error,
	busy,
	cancelRef,
	onSend,
}: {
	error: string | null;
	busy: boolean;
	cancelRef: RefObject<HTMLButtonElement | null>;
	onSend: (
		input: ReturnType<typeof autoTagInput>["input"],
		sent: AutoTagSent[],
		label: (line: DraftLine, feel: Feel | undefined) => string | null,
	) => void;
}) {
	const drama = useDrama();
	const { lines } = useLines();
	const errorId = useId();

	function go() {
		const { input, sent } = autoTagInput(
			drama.speakers,
			lines,
			drama.actingOf,
			drama.fishOnly,
		);
		if (sent.length === 0) return;
		// 감정 칸 글: 줄 칸과 같은 길(shownFeel)로 보이는 값. 감정 칸이 없는 화자는 null
		const label = (line: DraftLine, feel: Feel | undefined) => {
			const speaker = drama.speakers[line.speaker] ?? newSpeaker("");
			const { family } = drama.actingOf(line.speaker);
			return feelText(
				family,
				shownFeel(
					voiceOfSpeaker(speaker, drama.savedVoices),
					speakerValue(speaker, drama.presets),
					family,
					feel,
				),
			);
		};
		onSend(input, sent, label);
	}

	return (
		<>
			<AlertDialogHeader>
				<AlertDialogTitle>{DRAMA_TEXT.autoTagTitle}</AlertDialogTitle>
				<AlertDialogDescription>
					{DRAMA_TEXT.autoTagBody}
				</AlertDialogDescription>
			</AlertDialogHeader>
			{error ? (
				<p
					id={errorId}
					role="alert"
					className="flex gap-2 text-sm text-warning"
				>
					<TriangleAlert
						aria-hidden="true"
						className="mt-0.5 size-4 shrink-0"
					/>
					{error}
				</p>
			) : null}
			<AlertDialogFooter>
				<AlertDialogCancel ref={cancelRef} size="lg">
					{DRAMA_TEXT.cancel}
				</AlertDialogCancel>
				<AlertDialogAction
					size="lg"
					focusableWhenDisabled
					disabled={busy}
					aria-busy={busy || undefined}
					aria-describedby={error ? errorId : undefined}
					onClick={go}
				>
					{/* 채운 청록 버튼 안의 유료 표식은 글자색이다(DESIGN.md). 보내는 중은 스피너(가짜 진행률 없음) */}
					{busy ? (
						<Spinner data-icon="inline-start" aria-hidden="true" />
					) : (
						<Coins data-icon="inline-start" aria-hidden="true" />
					)}
					{DRAMA_TEXT.autoTagGo}
				</AlertDialogAction>
			</AlertDialogFooter>
		</>
	);
}

// 미리 보기 창 안: 바뀐 줄만 '번호 화자' 한 줄 + 바뀐 칸마다 전(줄 긋기, 회색)·후(정리한 값, autoTagChanges). 안내는 autoTagNotes.
// '모두 바꾸기'는 지금 줄에서 보낸 뒤 바뀌지 않은 줄만 바꾸고(replace: 바꾸기 전 대본을 scriptUndo로 잡는다) 실행 취소 알림을 띄운다
function PreviewBody({
	preview,
	onDone,
	showUndo,
}: {
	preview: Preview;
	onDone: () => void;
	showUndo: (message: string, undo: () => void, after?: () => void) => void;
}) {
	const drama = useDrama();
	const { lines, replace } = useLines();
	const { changes, skipped } = preview;
	// 바꿀 값 없음·받지 않는 줄 수·(모두 Fish) 바꾼 결과의 장면 상한 넘김('스펙과 다른 점' 23)
	const notes = autoTagNotes(
		changes,
		skipped,
		lines,
		drama.fishOnly,
		drama.settings.speed,
	);
	const fieldLabel = (
		field: AutoTagChange["fields"][number]["field"],
		speaker: number,
	) =>
		field === "direction"
			? DRAMA_TEXT.palette
			: field === "text"
				? DRAMA_TEXT.lineNoun
				: drama.actingOf(speaker).family === "airy"
					? DRAMA_TEXT.styleLabel
					: DRAMA_TEXT.feelLabel;

	function apply() {
		const result = autoTagApply(lines, changes);
		onDone();
		const skippedNote =
			result.changed > 0 ? DRAMA_TEXT.autoTagChanged(result.changed) : null;
		if (result.applied === 0) {
			if (skippedNote) toast(skippedNote);
			return;
		}
		// 화자는 그대로 두고 줄만 바꾼다(저장된 화자를 넘겨 성우 id를 잃지 않는다)
		const undo = replace(drama.storedSpeakers, result.lines);
		// 되살린 뒤 포커스: 바꾼 첫 줄의 대사 칸(바꾼 줄만 새 객체다)
		const first = result.lines.find((line, i) => line !== lines[i])?.id;
		showUndo(
			[DRAMA_TEXT.autoTagApplied(result.applied), skippedNote]
				.filter((part) => part !== null)
				.join(" · "),
			undo,
			() => {
				if (first)
					document.getElementById(dramaFieldId(first, "text"))?.focus();
			},
		);
	}

	return (
		<>
			<DialogHeader>
				<DialogTitle>{DRAMA_TEXT.autoTagPreviewTitle}</DialogTitle>
				{notes.length > 0 ? (
					<DialogDescription render={<div />} className="flex flex-col gap-1">
						{notes.map((note) => (
							<p key={note}>{note}</p>
						))}
					</DialogDescription>
				) : null}
			</DialogHeader>
			{changes.length > 0 ? (
				<ol className="flex min-w-0 flex-col divide-y divide-border">
					{changes.map(({ line, n, fields }) => (
						<li
							key={line.id}
							className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
						>
							<p className="flex min-w-0 items-center gap-2">
								<span className="w-6 shrink-0 text-muted-foreground text-sm tabular-nums">
									{n}
								</span>
								<SpeakerMark index={line.speaker} />
								<span className="min-w-0 truncate font-bold">
									{speakerNameOf(drama.speakers, line.speaker)}
								</span>
							</p>
							<dl className="flex flex-col gap-2 text-sm">
								{fields.map(({ field, before, after }) => (
									<div key={field} className="flex gap-2">
										<dt className="w-16 shrink-0 text-muted-foreground">
											{fieldLabel(field, line.speaker)}
										</dt>
										{/* 전은 지운 글(del, 줄 긋기 회색), 후는 넣는 글(ins). 전이 비었으면 후만. 줄 긋기는 읽히지 않아 화면 밖 이름표를 붙인다 */}
										<dd className="wrap-anywhere flex min-w-0 flex-col break-keep">
											{before ? (
												<del className="text-muted-foreground">
													<span className="sr-only">{`${DRAMA_TEXT.autoTagBefore} `}</span>
													{before}
												</del>
											) : null}
											<ins className="no-underline">
												<span className="sr-only">{`${DRAMA_TEXT.autoTagAfter} `}</span>
												{after}
											</ins>
										</dd>
									</div>
								))}
							</dl>
						</li>
					))}
				</ol>
			) : null}
			{/* 767px 이하 시트에서는 두 버튼이 가로 반반(붙여 넣기 창과 같다). 첫 포커스는 '닫기'(바꾸지 않는 쪽) */}
			<DialogFooter>
				<DialogClose
					render={
						<Button
							variant="outline"
							size="lg"
							className="flex-1 md:flex-none"
						/>
					}
				>
					{DRAMA_TEXT.close}
				</DialogClose>
				{changes.length > 0 ? (
					<Button size="lg" className="flex-1 md:flex-none" onClick={apply}>
						{DRAMA_TEXT.autoTagApply}
					</Button>
				) : null}
			</DialogFooter>
		</>
	);
}

// 대본 머리의 '전체 자동 태그'(경고색 Coins, 유료 Gemini 텍스트 호출). 서버가 거절할 이름·줄이 있거나 대본 합계가 2,000자를 넘으면
// 잠기고 그 이유를 보인다(autoTagBlock, 화자가 섞여도 본다). 버튼과 이유는 줄을 바꾸는 부모 flex의 칸 둘이다.
// 767px 이하 보이는 글은 '자동 태그'이고 접근 이름은 늘 전체(autoTagName, 브리프 17절 3)다
export function AutoTagButton() {
	const autoTag = useContext(AutoTagContext);
	if (!autoTag) throw new Error("AutoTagButton은 DramaAutoTag 안에서만 쓴다");
	const drama = useDrama();
	const { lines } = useLines();
	const reasonId = useId();
	const block = autoTagBlock(drama.speakers, lines, drama.actingOf);
	const locked = block !== null || autoTag.busy;
	return (
		<>
			<Button
				variant="outline"
				size="lg"
				focusableWhenDisabled
				disabled={locked}
				aria-label={DRAMA_TEXT.autoTagName}
				aria-describedby={block ? reasonId : undefined}
				className={lockedButton(true)}
				onClick={(event) => {
					if (!locked) autoTag.open(event.currentTarget);
				}}
			>
				<Coins
					data-icon="inline-start"
					aria-hidden="true"
					className="text-warning"
				/>
				<span className="md:hidden">{DRAMA_TEXT.autoTagShort}</span>
				<span className="max-md:hidden">{DRAMA_TEXT.autoTag}</span>
			</Button>
			{block ? (
				<p
					id={reasonId}
					className="order-last basis-full text-muted-foreground text-sm"
				>
					{block.text}
				</p>
			) : null}
		</>
	);
}
