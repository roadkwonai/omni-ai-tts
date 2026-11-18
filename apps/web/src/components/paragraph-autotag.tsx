// apps/web/src/components/paragraph-autotag.tsx
"use client";

import { useMutation } from "@tanstack/react-query";
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
import { Checkbox } from "@tts-pilot-app/ui/components/checkbox";
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
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Coins, TriangleAlert } from "lucide-react";
import {
	createContext,
	type ReactNode,
	type RefObject,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";

import {
	type AutoTagChange,
	type AutoTagTarget,
	applyAutoTag,
	autoTagAsked,
	autoTagBatches,
	autoTagChanges,
	autoTagGrew,
	autoTagInputOf,
	autoTagTargets,
	excerptMarks,
	hasAutoTagTarget,
	newTagMarks,
} from "@/lib/paragraph-autotag";
import { voiceOf } from "@/lib/paragraph-script";
import { PARAGRAPH_AUTO_TAG_TEXT, PARAGRAPH_TEXT } from "@/lib/studio-text";
import { savedOf } from "@/lib/studio-view";
import { autoTagProblemText } from "@/lib/tag-view";
import { trialFailureOf } from "@/lib/trial-view";
import { orpc } from "@/utils/orpc";

import { BeforeAfter } from "./before-after";
import { DEMO_TEXT, useDemo } from "./demo";
import { voiceNameOf } from "./paragraph-card";
import {
	useParagraphs,
	useShownParagraphs,
	useWork,
} from "./paragraph-provider";
import { lockedButton, useCooldown } from "./voice-problem";

// 문단 작업실 자동 태그 추천(T10 스펙 15.3, 브리프 15.2): '자동 태그' 버튼 → 확인 창 → studioAutoTag를 묶음마다 차례로(OpenAI, 실패하면 Gemini 텍스트, 유료) →
// 미리 보기 → '고른 문단 바꾸기'(되돌리기 알림 10초) 또는 '닫기'. 창 둘은 작업실에 하나(ParagraphAutoTag), 버튼은 레일 '대본' 칸과 1단 작업 띠에 있다.
// 유료 호출은 '추천 받기'를 누를 때만 나가고 자동으로 다시 보내지 않는다(tts-provider). 429 대기 시각까지는 버튼과 '추천 받기'가 잠긴다.
// 판단은 lib/paragraph-autotag 순수 함수만 부른다

type Open = (opener: HTMLElement) => void;
// retryAt은 429 대기 시각이 지나기 전까지만 있다(useCooldown)
const AutoTagContext = createContext<{
	open: Open;
	retryAt: string | null;
} | null>(null);
// 보내는 중: 지금 보내는 묶음 차례(1부터)와 묶음 수
type Sending = { at: number; total: number };
// note는 멈춘 이유(실패 또는 '멈추기') 한 줄
type Preview = {
	changes: AutoTagChange[];
	skipped: number;
	note: string | null;
};
const NO_PREVIEW: Preview = { changes: [], skipped: 0, note: null };

// 창 둘(확인·미리 보기)과 보내기 루프. 연 버튼(레일·작업 띠 둘 중 누른 것)을 기억해 창이 닫히면 그리로 포커스를 돌린다
export function ParagraphAutoTag({ children }: { children: ReactNode }) {
	const mutation = useMutation({
		...orpc.studioAutoTag.mutationOptions(),
		retry: false,
		// 같은 출처로만 붙으니 브라우저 offline 판단으로 멈추지 않게 한다(paragraph-make와 같다)
		networkMode: "always",
	});
	const [phase, setPhase] = useState<"closed" | "confirm" | "preview">(
		"closed",
	);
	const [sending, setSending] = useState<Sending | null>(null);
	// '멈추기'를 눌렀고 지금 호출이 아직 끝나지 않았다(단추 글 '멈추는 중', 잠김)
	const [stopping, setStopping] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [preview, setPreview] = useState<Preview>(NO_PREVIEW);
	// 보내기가 429로 실패한 대기 시각. 시각이 지나면 useCooldown의 타이머가 풀고, 언마운트 때 타이머를 정리한다
	const [failedUntil, setFailedUntil] = useState<string | null>(null);
	const retryAt = useCooldown(failedUntil);
	const openerRef = useRef<HTMLElement | null>(null);
	const cancelRef = useRef<HTMLButtonElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	// 렌더를 기다리지 않고 두 번째 루프를 막는다(두 번 누름). 버튼 잠금은 보조다
	const sendingRef = useRef(false);
	// '멈추기'와 화면 떠남. 루프가 묶음마다 보기 전에 읽는다(await 뒤에는 렌더된 상태를 읽지 못한다, '스펙과 다른 점' 13)
	const stopRef = useRef(false);
	// 확인 창이 미리 보기로 넘어가며 닫힐 때는 포커스를 연 버튼으로 돌리지 않는다(미리 보기 '닫기'가 가져간다)
	const toPreview = useRef(false);
	useEffect(
		() => () => {
			stopRef.current = true;
		},
		[],
	);

	const open: Open = (element) => {
		if (sendingRef.current) return;
		toPreview.current = false;
		openerRef.current = element;
		setError(null);
		setPhase("confirm");
	};

	// 보내지 않고 확인 창에 이유 한 줄을 보이며 포커스를 '취소'로 둔다
	const warn = (text: string) => {
		setError(text);
		cancelRef.current?.focus();
	};

	// skipped는 보내지 않은 ElevenLabs v2·flash 문단 수(autoTagTargets). 서버 skipped를 더한다
	async function send(targets: AutoTagTarget[], skipped: number) {
		if (sendingRef.current) return;
		const batches = autoTagBatches(targets);
		// 창이 열린 사이 보낼 문단이 없어졌으면 보내지 않고 이유를 보인다
		if (batches.length === 0) {
			warn(PARAGRAPH_TEXT.autoTagNone);
			return;
		}
		sendingRef.current = true;
		stopRef.current = false;
		setError(null);
		const changes: AutoTagChange[] = [];
		let kept = skipped;
		let received = 0;
		let note: string | null = null;
		let failure: string | null = null;
		try {
			for (const batch of batches) {
				const first = batch[0]?.n ?? 0;
				if (stopRef.current) {
					note = PARAGRAPH_TEXT.autoTagNotSent(first);
					break;
				}
				setSending({ at: received + 1, total: batches.length });
				try {
					const reply = await mutation.mutateAsync(autoTagInputOf(batch));
					changes.push(...autoTagChanges(batch, reply));
					kept += reply.skipped;
					received += 1;
				} catch (problem) {
					// 거기서 멈춘다. 다시 보내기는 사용자가 누른다(429면 대기 시각까지 잠근다)
					const shown = trialFailureOf(problem);
					if (shown.reason === "rate_limit" && shown.retryAt)
						setFailedUntil(shown.retryAt);
					failure = autoTagProblemText(shown, PARAGRAPH_AUTO_TAG_TEXT);
					note = PARAGRAPH_TEXT.autoTagStoppedAt(first, failure);
					break;
				}
			}
		} finally {
			sendingRef.current = false;
			setSending(null);
			setStopping(false);
		}
		// 받은 묶음이 없으면(첫 묶음 실패) 창을 닫지 않고 이유를 보이며 포커스를 '취소'로 둔다(드라마와 같다)
		if (received === 0) {
			setError(failure);
			cancelRef.current?.focus();
			return;
		}
		setPreview({ changes, skipped: kept, note });
		toPreview.current = true;
		setPhase("preview");
	}

	return (
		<AutoTagContext value={{ open, retryAt }}>
			{children}
			<AlertDialog
				open={phase === "confirm"}
				onOpenChange={(next) => {
					// 보내는 중에는 '멈추기'(같은 자리의 취소 단추)·Esc로 닫지 않는다. 루프가 미리 보기로 넘긴 직후(다시 그리기 전)에 온 닫기는 미리 보기를 덮지 않는다
					if (!next && !sendingRef.current)
						setPhase((current) => (current === "confirm" ? "closed" : current));
				}}
			>
				<AlertDialogContent
					initialFocus={cancelRef}
					finalFocus={() =>
						toPreview.current ? false : (openerRef.current ?? true)
					}
				>
					<ConfirmBody
						sending={sending}
						stopping={stopping}
						waiting={retryAt !== null}
						error={error}
						cancelRef={cancelRef}
						onSend={send}
						onWarn={warn}
						onStop={() => {
							stopRef.current = true;
							setStopping(true);
						}}
					/>
				</AlertDialogContent>
			</AlertDialog>
			<Dialog
				open={phase === "preview"}
				onOpenChange={(next) => {
					if (!next) setPhase("closed");
				}}
			>
				{/* 머리·버튼 줄은 고정하고 목록만 스크롤한다(QA F-P2-3). 기본 grid·창 전체 스크롤을 이 창에서만 덮는다 */}
				<DialogContent
					initialFocus={closeRef}
					finalFocus={() => openerRef.current ?? true}
					className="flex flex-col overflow-hidden md:max-w-lg"
				>
					<PreviewBody
						preview={preview}
						closeRef={closeRef}
						onDone={() => setPhase("closed")}
					/>
				</DialogContent>
			</Dialog>
		</AutoTagContext>
	);
}

// 확인 창 안(첫 포커스 '취소', 바깥 누르기로 닫히지 않음). 문단 수·횟수는 창을 연 때의 대상이고,
// '추천 받기'를 누를 때 지금 문단으로 대상을 다시 만든다(0개면 보내지 않고 이유를 보인다). 문단 수나 횟수가 보인 수보다 늘었으면
// 보내지 않고 새 수로 바꿔 보이며 다시 누르게 한다(승인한 횟수보다 많이 보내지 않는다, security low 1). 보내는 중 '취소'는 같은 단추가 '멈추기'가 되고,
// 누르면 지금 호출이 끝날 때까지 '멈추는 중'으로 잠긴다(포커스를 지키게 aria-disabled. 다시 눌러도 같은 멈춤이다).
// 429 대기 시각 전(waiting)이면 '추천 받기'가 neutral로 잠기고 오류 줄을 설명으로 단다
function ConfirmBody({
	sending,
	stopping,
	waiting,
	error,
	cancelRef,
	onSend,
	onWarn,
	onStop,
}: {
	sending: Sending | null;
	stopping: boolean;
	waiting: boolean;
	error: string | null;
	cancelRef: RefObject<HTMLButtonElement | null>;
	onSend: (targets: AutoTagTarget[], skipped: number) => void;
	onWarn: (text: string) => void;
	onStop: () => void;
}) {
	const work = useWork();
	const { paragraphs } = useParagraphs();
	const errorId = useId();
	const targetsNow = () =>
		autoTagTargets(
			paragraphs,
			{ ...work.work, paragraphs },
			work.voices ?? [],
			work.requestOf,
			work.statusOf,
		);
	// 연 때의 수(보내는 동안 성우 목록·시각이 바뀌어도 고정). 누를 때 수가 늘었으면 새 수로 바꾼다
	const [asked, setAsked] = useState(() => autoTagAsked(targetsNow().targets));

	function go() {
		if (waiting) return;
		const { targets, skipped } = targetsNow();
		const now = autoTagAsked(targets);
		if (autoTagGrew(asked, now)) {
			setAsked(now);
			onWarn(PARAGRAPH_TEXT.autoTagRecount);
			return;
		}
		onSend(targets, skipped);
	}

	return (
		<>
			<AlertDialogHeader>
				<AlertDialogTitle>{PARAGRAPH_TEXT.autoTagTitle}</AlertDialogTitle>
				{/* 세 줄: 횟수, 경고색 Coins + 금액, 회색 안내(QA F-P2-2) */}
				<AlertDialogDescription
					render={<div />}
					className="flex flex-col gap-1 text-foreground"
				>
					<p>{PARAGRAPH_TEXT.autoTagCount(asked.paragraphs, asked.calls)}</p>
					<p className="flex items-center gap-2 tabular-nums">
						<Coins
							aria-hidden="true"
							className="size-4 shrink-0 text-warning"
						/>
						{PARAGRAPH_TEXT.autoTagCost(asked.calls)}
					</p>
					<p className="text-muted-foreground">
						{PARAGRAPH_TEXT.autoTagModelNote.map((part, i) =>
							// 고정 배열이라 index key로 충분하다. 홀수 칸이 모델 코드명이다
							i % 2 ? (
								<span key={i} translate="no">
									{part}
								</span>
							) : (
								part
							),
						)}
					</p>
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
				<AlertDialogCancel
					ref={cancelRef}
					variant="neutral"
					size="lg"
					aria-disabled={stopping || undefined}
					className={lockedButton(true)}
					onClick={sending ? onStop : undefined}
				>
					{!sending
						? PARAGRAPH_TEXT.cancel
						: stopping
							? PARAGRAPH_TEXT.autoTagStopping
							: PARAGRAPH_TEXT.stop}
				</AlertDialogCancel>
				{/* 대기 시각 전에는 무채색 neutral로 잠근다(잠긴 주 버튼은 채움 50%가 아니다, 브리프 15.2) */}
				<AlertDialogAction
					variant={waiting ? "neutral" : "default"}
					size="lg"
					focusableWhenDisabled
					disabled={sending !== null || waiting}
					className={lockedButton(waiting)}
					// 진행 숫자가 바뀔 때 낭독하지 않는다(브리프 15.2)
					aria-busy={sending ? true : undefined}
					aria-describedby={error ? errorId : undefined}
					onClick={go}
				>
					{/* 채운 청록 버튼 안의 유료 표식은 글자색, 잠긴 neutral에서는 경고색이다(DESIGN.md). 보내는 중은 스피너와 묶음 차례(가짜 진행률 없음) */}
					{sending ? (
						<Spinner data-icon="inline-start" aria-hidden="true" />
					) : (
						<Coins
							data-icon="inline-start"
							aria-hidden="true"
							className={waiting ? "text-warning" : undefined}
						/>
					)}
					{sending
						? PARAGRAPH_TEXT.autoTagProgress(sending.at, sending.total)
						: PARAGRAPH_TEXT.autoTagGo}
				</AlertDialogAction>
			</AlertDialogFooter>
		</>
	);
}

// 미리 보기 창 안(브리프 15.2): 바뀐 문단만 체크 상자 · 번호 · 성우 이름 + 바뀐 칸. '대본'은 바꾼 뒤 글만(새 태그 mark, 긴 글은 둘레 발췌),
// 감정·말투·말투 지시는 전(줄 긋기 회색)·후. 머리·이탈 안내·버튼 줄은 고정이고 목록만 스크롤한다. 처음에는 결과가 없는 문단만 고른다.
// '고른 문단 바꾸기'는 셈에 쓴 배열을 base로 두고 applyAutoTag(보낸 뒤 고친 문단은 건너뜀) → edit 되돌리기 알림. 포커스는 연 버튼(finalFocus)
function PreviewBody({
	preview,
	closeRef,
	onDone,
}: {
	preview: Preview;
	closeRef: RefObject<HTMLButtonElement | null>;
	onDone: () => void;
}) {
	const work = useWork();
	const { paragraphs, edit } = useParagraphs();
	const { changes, skipped, note } = preview;
	const noteId = useId();
	const ownId = useId();
	// '대본' 칸 조각은 변경 목록이 정해질 때 한 번만 센다(체크 상자를 누를 때마다 다시 세지 않게)
	const marks = useMemo(
		() =>
			new Map(
				changes.map(({ id, fields }) => {
					const text = fields.find(({ field }) => field === "text");
					return [
						id,
						text ? excerptMarks(newTagMarks(text.before, text.after)) : [],
					];
				}),
			),
		[changes],
	);
	const [chosen, setChosen] = useState(
		() =>
			new Set(
				changes.filter((change) => change.result === null).map(({ id }) => id),
			),
	);
	const all = { ...work.work, paragraphs };
	// 고른 문단 가운데 기본 성우를 따르다 감정·말투·말투 지시가 바뀌어 자기 성우가 될 문단
	const own = changes.filter(
		(change) =>
			chosen.has(change.id) && !change.own && change.settings !== null,
	).length;
	const notes = [
		changes.length === 0 ? PARAGRAPH_TEXT.autoTagNothing : null,
		skipped > 0 ? PARAGRAPH_TEXT.autoTagSkipped(skipped) : null,
		note,
	].filter((line) => line !== null);
	const nameOf = (change: AutoTagChange) => {
		const setup = voiceOf(change.sent, all);
		const saved =
			setup && work.voices
				? savedOf(work.voices, setup.voiceId, setup.provider)
				: null;
		return voiceNameOf(saved, work.voicesLoad) ?? PARAGRAPH_TEXT.none;
	};

	function toggle(id: string, on: boolean) {
		setChosen((current) => {
			const next = new Set(current);
			if (on) next.add(id);
			else next.delete(id);
			return next;
		});
	}

	function apply() {
		if (chosen.size === 0) return;
		const base = paragraphs;
		const result = applyAutoTag(base, all, changes, chosen);
		onDone();
		const skippedNote =
			result.changed > 0 ? PARAGRAPH_TEXT.autoTagChanged(result.changed) : null;
		if (result.applied === 0) {
			if (skippedNote) toast(skippedNote);
			return;
		}
		// 그사이 배열이 바뀌었으면 바꾸지 않는다(미리 보기는 모달이라 안전망이다)
		edit((ps) => (ps === base ? result.paragraphs : ps), {
			message: [PARAGRAPH_TEXT.autoTagApplied(result.applied), skippedNote]
				.filter((part) => part !== null)
				.join(" · "),
		});
	}

	return (
		<>
			<DialogHeader>
				<DialogTitle>{PARAGRAPH_TEXT.autoTagPreviewTitle}</DialogTitle>
				{notes.length > 0 ? (
					<DialogDescription render={<div />} className="flex flex-col gap-1">
						{notes.map((line) => (
							<p key={line}>{line}</p>
						))}
					</DialogDescription>
				) : null}
			</DialogHeader>
			{changes.length > 0 ? (
				// 체크 상자 포커스 링(바깥 4px)이 스크롤 칸에 잘리지 않게 가로 4px 여유를 둔다
				<ol className="-mx-1 flex min-h-0 min-w-0 flex-1 flex-col divide-y divide-border overflow-y-auto overscroll-contain px-1">
					{changes.map((change) => {
						const { id, n, result, fields } = change;
						const resultId = `${noteId}-${id}`;
						return (
							<li
								key={id}
								className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
							>
								{/* 줄 전체가 눌림 영역이다(44px). 체크 상자 이름은 '문단 N 바꾸기' */}
								{/* biome-ignore lint/a11y/noLabelWithoutControl: Base UI Checkbox는 label 안의 button이다 */}
								<label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-3">
									<Checkbox
										checked={chosen.has(id)}
										aria-label={PARAGRAPH_TEXT.autoTagChoose(n)}
										aria-describedby={result ? resultId : undefined}
										onCheckedChange={(on) => toggle(id, on === true)}
									/>
									<span className="min-w-6 shrink-0 text-muted-foreground text-sm tabular-nums">
										{n}
									</span>
									<span translate="no" className="min-w-0 truncate font-bold">
										{nameOf(change)}
									</span>
								</label>
								{result ? (
									<p id={resultId} className="text-muted-foreground text-sm">
										{result === "made"
											? PARAGRAPH_TEXT.autoTagMadeNote
											: PARAGRAPH_TEXT.autoTagUnknownNote}
									</p>
								) : null}
								<dl className="flex flex-col gap-2 text-sm">
									{fields.map(({ field, before, after }) => (
										<div key={field} className="flex gap-2">
											<dt className="w-16 shrink-0 text-muted-foreground">
												{PARAGRAPH_TEXT.autoTagFields[field]}
											</dt>
											{field === "text" ? (
												// '대본'은 바꾼 뒤 글만. 서버가 태그 말고는 글이 같다고 보장한다. 새 태그는 무채색 mark와 화면 밖 이름표
												<dd
													translate="no"
													className="wrap-anywhere min-w-0 break-keep"
												>
													{(marks.get(id) ?? []).map((part, i) =>
														part.mark ? (
															<mark
																key={i}
																className="rounded-sm bg-muted px-0.5 font-bold text-foreground ring-1 ring-border"
															>
																<span className="sr-only">{`${PARAGRAPH_TEXT.autoTagNewTag} `}</span>
																{part.text}
															</mark>
														) : (
															<span key={i}>{part.text}</span>
														),
													)}
												</dd>
											) : (
												<BeforeAfter
													before={before}
													after={after}
													beforeLabel={PARAGRAPH_TEXT.autoTagBefore}
													afterLabel={PARAGRAPH_TEXT.autoTagAfter}
												/>
											)}
										</div>
									))}
								</dl>
							</li>
						);
					})}
				</ol>
			) : null}
			{/* 버튼 줄 바로 위 고정 영역. '고른 문단 바꾸기' 설명이다(고르기에 따라 바뀐다) */}
			{own > 0 ? (
				<p id={ownId} className="text-muted-foreground text-sm">
					{PARAGRAPH_TEXT.autoTagOwnNote(own)}
				</p>
			) : null}
			{/* 767px 이하 시트에서는 두 버튼이 가로 반반(붙여 넣기 창과 같다). 첫 포커스는 '닫기'(바꾸지 않는 쪽) */}
			<DialogFooter>
				<DialogClose
					ref={closeRef}
					render={
						<Button
							variant="neutral"
							size="lg"
							className="flex-1 md:flex-none"
						/>
					}
				>
					{PARAGRAPH_TEXT.close}
				</DialogClose>
				{changes.length > 0 ? (
					// 잠기면 무채색 neutral(잠긴 주 버튼은 채움 50%가 아니다, 브리프 3절)
					<Button
						variant={chosen.size === 0 ? "neutral" : "default"}
						size="lg"
						focusableWhenDisabled
						disabled={chosen.size === 0}
						aria-describedby={own > 0 ? ownId : undefined}
						className={cn("flex-1 md:flex-none", lockedButton(true))}
						onClick={apply}
					>
						{PARAGRAPH_TEXT.autoTagApplyN(chosen.size)}
					</Button>
				) : null}
			</DialogFooter>
		</>
	);
}

// '자동 태그'(무채색 neutral, 경고색 Coins, 유료 OpenAI(실패하면 Gemini) 텍스트 호출, QA F-P2-1). 429 대기 시각 전이거나 전체 만들기가 도는 중이거나
// 보낼 문단이 없으면 잠기고 이유(그 차례로 하나)를 보인다.
// 버튼과 이유는 줄을 바꾸는 부모 flex의 칸 둘이다(이유는 order-last basis-full). 레일·작업 띠에 둘 다 그려지므로 늦춘 문단으로
// 첫 대상만 찾는다(E10, hasAutoTagTarget). 수는 창을 열 때 확인 창이 지금 문단으로 센다
export function AutoTagButton() {
	const context = useContext(AutoTagContext);
	if (!context)
		throw new Error("AutoTagButton은 ParagraphAutoTag 안에서만 쓴다");
	const { open, retryAt } = context;
	const demo = useDemo();
	const work = useWork();
	const ps = useShownParagraphs();
	const reasonId = useId();
	const { phase } = work.make;
	const reason = retryAt
		? PARAGRAPH_TEXT.autoTagRetryAt(retryAt)
		: phase !== "idle" && phase !== "stopped"
			? PARAGRAPH_TEXT.autoTagBusy
			: !hasAutoTagTarget(
						ps,
						{ ...work.work, paragraphs: ps },
						work.voices ?? [],
						work.requestOf,
					)
				? PARAGRAPH_TEXT.autoTagNone
				: null;
	return (
		<>
			<Button
				variant="neutral"
				size="lg"
				focusableWhenDisabled
				disabled={reason !== null}
				aria-label={
					demo ? DEMO_TEXT.autoTagParagraphName : PARAGRAPH_TEXT.autoTagName
				}
				aria-describedby={reason ? reasonId : undefined}
				className={lockedButton(true)}
				onClick={(event) => {
					if (reason !== null) return;
					// 공개 데모는 확인 창도 공급자 호출도 없이 안내만 한다
					if (demo) toast(DEMO_TEXT.autoTag);
					else open(event.currentTarget);
				}}
			>
				{demo ? null : (
					<Coins
						data-icon="inline-start"
						aria-hidden="true"
						className="text-warning"
					/>
				)}
				{PARAGRAPH_TEXT.autoTag}
			</Button>
			{reason ? (
				<p
					id={reasonId}
					className="order-last basis-full text-muted-foreground text-sm"
				>
					{reason}
				</p>
			) : null}
		</>
	);
}
