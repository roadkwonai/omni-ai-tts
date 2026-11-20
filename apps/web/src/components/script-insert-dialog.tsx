"use client";

import { ORPCError } from "@orpc/client";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Script } from "@tts-pilot-app/api/script-contract";
import { scriptBody } from "@tts-pilot-app/api/script-rules";
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
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import { Toggle } from "@tts-pilot-app/ui/components/toggle";
import { ToggleGroup } from "@tts-pilot-app/ui/components/toggle-group";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Check, TriangleAlert } from "lucide-react";
import {
	type KeyboardEvent,
	type RefObject,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";

import type { LinkedScript, Work } from "@/lib/paragraph-script";
import {
	EMPTY_SCRIPT_FILTERS,
	recentTitle,
	type ScriptView,
	whenLabel,
} from "@/lib/script-library-view";
import { SCRIPT_TEXT } from "@/lib/script-text";
import {
	appendNotes,
	appendRoom,
	dirtyOf,
	fingerprintOf,
	fromScript,
	type ScriptWork,
} from "@/lib/script-work";
import { PARAGRAPH_TEXT } from "@/lib/studio-text";
import { STUDIO_TEXT } from "@/lib/studio-view";
import { client, orpc, QUIET } from "@/utils/orpc";

import { DialogCloseButton } from "./dialog-close-button";
import { centered, focusText, paragraphTextId } from "./paragraph-focus";
import { useParagraphs, useWork } from "./paragraph-provider";
import { DirtyDialog, sendSave } from "./script-guard-dialogs";
import { LoadingRows, useScriptList } from "./script-library";
import { SearchField } from "./voice-conditions";
import { lockedButton, ReloadRow } from "./voice-problem";

// '보관함에서 넣기' 창(브리프 18.3). 한 창에서 고르기(목록)와 넣는 방식(미리 보기·세그먼트·경고)을 보인다.
// scriptId가 있으면(주소 `?script=`, 보관함 '열기') 목록 없이 그 대본이 골라진 2단계로 열고 늘 바꾼다.
// 넣으면 '되돌리기' 알림(useParagraphs().undoable)이고 포커스는 넣은 첫 문단의 대본 칸이다.

const SEARCH_DELAY_MS = 300;
const radioId = (id: string) => `script-insert-${id}`;
const viewItem =
	"min-h-11 shrink-0 px-3 md:px-4 text-muted-foreground focus-visible:z-10 data-pressed:bg-card data-pressed:font-bold data-pressed:text-foreground data-pressed:ring-1 data-pressed:ring-border";
const sourceItem =
	"min-h-11 shrink-0 px-4 text-muted-foreground focus-visible:z-10 data-pressed:bg-card data-pressed:font-bold data-pressed:text-foreground data-pressed:ring-1 data-pressed:ring-border";

type Before = { work: Work; linked: LinkedScript | undefined };

const titleOf = (script: Script) =>
	script.title ??
	recentTitle(script.work.paragraphs.map((p) => p.text).join("\n\n"));
// 서버가 검증한 작업이라 공급자 설정 칸이 느슨한 타입(Record<string, unknown>)으로 온다. 작업 모양으로 읽는 길은 WorkProvider의 checkedFor(readWork)다
const workOf = (script: Script): Work =>
	fromScript({ ...script, work: script.work as ScriptWork });
const blankEnd = (ps: readonly { text: string }[]) =>
	ps.at(-1)?.text.trim() === "";

// 받은 대본을 작업에 바꿔 넣는다/이어 넣는다. 둘 다 '되돌리기' 알림을 띄우고 넣은 첫 문단 id를 돌려준다(없으면 undefined).
// 되돌리기는 바꾸기 전 작업 전체(문단·id·linked·화자·기본 성우·쉼·채널)로 돌아간다(계획 2.3).
// before는 저장하고 바꾸기가 저장한 뒤의 작업과 연결이다(그 판으로 되돌려야 저장 안 됨이 생기지 않는다)
export function useScriptInsert() {
	const work = useWork();
	const { undoable } = useParagraphs();
	function replace(script: Script, before?: Before) {
		const previous = before?.work ?? work.snapshot();
		const previousLinked = before ? before.linked : work.linked;
		const source = workOf(script);
		work.replaceWork(source, {
			linked:
				script.kind === "saved" && script.title
					? {
							scriptId: script.id,
							title: script.title,
							version: script.version,
							fingerprint: fingerprintOf(source),
						}
					: undefined,
		});
		undoable(SCRIPT_TEXT.replaced(titleOf(script)), () =>
			work.replaceWork(previous, { linked: previousLinked }),
		);
		return work.snapshot().paragraphs[0]?.id;
	}
	function append(script: Script) {
		const previous = work.snapshot();
		const previousLinked = work.linked;
		const at = blankEnd(previous.paragraphs)
			? previous.paragraphs.length - 1
			: previous.paragraphs.length;
		const dropped = work.appendWork(workOf(script));
		undoable(
			SCRIPT_TEXT.inserted(
				script.work.paragraphs.length - dropped.paragraphs,
				dropped.paragraphs,
				dropped.speakers,
			),
			() => work.replaceWork(previous, { linked: previousLinked }),
		);
		return work.snapshot().paragraphs[at]?.id;
	}
	return { replace, append };
}

// 컴포넌트 밖에 둔다(try/catch). 주소로 열 때 창 없이 바꾸는 길이 쓴다
export async function fetchScript(id: string): Promise<Script | "gone" | null> {
	try {
		return await client.scriptGet({ id });
	} catch (error) {
		return error instanceof ORPCError && error.code === "NOT_FOUND"
			? "gone"
			: null;
	}
}

// 1단계 목록: 줄 전체가 라디오 하나(보관함 줄의 1~3번, 동작 버튼 없음). 방향키로 움직이면 고른다. 목록은 열 때만 받는다
function Picker({
	view,
	q,
	picked,
	onPick,
	bodyRef,
}: {
	view: ScriptView;
	q: string;
	picked: string | null;
	onPick: (id: string, row: { paragraphs: number; chars: number }) => void;
	bodyRef: RefObject<HTMLDivElement | null>;
}) {
	// 끝 감시 줄은 창 본문 스크롤(bodyRef) 안에서 본다
	const { query, items, sentinelRef } = useScriptList(
		view,
		{ ...EMPTY_SCRIPT_FILTERS, q },
		{ root: bodyRef, rootMargin: "200px" },
	);
	const hasPicked = items.some((row) => row.id === picked);
	const {
		hasNextPage,
		isFetchingNextPage,
		isFetchNextPageError,
		fetchNextPage,
	} = query;

	if (query.isLoadingError)
		return (
			<ReloadRow
				text={SCRIPT_TEXT.listFailed}
				reloading={query.isFetching}
				onReload={() => void query.refetch()}
			/>
		);
	if (query.isPending)
		return <LoadingRows className="h-20 w-full rounded-lg" />;
	if (items.length === 0)
		return (
			<p className="text-muted-foreground text-sm">
				{q.trim() !== ""
					? SCRIPT_TEXT.noMatches
					: view === "saved"
						? SCRIPT_TEXT.emptySaved
						: SCRIPT_TEXT.emptyRecent}
			</p>
		);

	function move(event: KeyboardEvent<HTMLDivElement>) {
		const step =
			event.key === "ArrowDown" || event.key === "ArrowRight"
				? 1
				: event.key === "ArrowUp" || event.key === "ArrowLeft"
					? -1
					: 0;
		const from = event.target instanceof HTMLElement ? event.target.id : "";
		if (step === 0 || from === "") return;
		const at = items.findIndex((row) => radioId(row.id) === from);
		const next = items[at + step];
		if (at < 0 || !next) return;
		event.preventDefault();
		onPick(next.id, {
			paragraphs: next.paragraphCount,
			chars: next.charCount,
		});
		document.getElementById(radioId(next.id))?.focus();
	}

	return (
		<>
			{/* roving tabindex: 고른 줄이 지금 목록에 없으면 첫 줄이 Tab으로 들어가는 자리. shrink-0은 본문 칸이 모자랄 때 줄이 겹쳐 눌리지 않게 한다(스크롤은 본문이 한다) */}
			<div
				role="radiogroup"
				aria-label={SCRIPT_TEXT.pickLabel}
				onKeyDown={move}
				className={cn(
					"flex shrink-0 flex-col divide-y overflow-hidden rounded-lg ring-1 ring-border",
					query.isPlaceholderData && "opacity-60",
				)}
			>
				{items.map((row, index) => {
					const checked = row.id === picked;
					const title =
						row.kind === "saved" ? (row.title ?? "") : recentTitle(row.preview);
					return (
						// biome-ignore lint/a11y/useSemanticElements: 줄 전체가 라디오 하나이고 안에 제목·미리 보기·메타 줄이 있어 input[type=radio]로 만들 수 없다
						<button
							key={row.id}
							id={radioId(row.id)}
							type="button"
							role="radio"
							aria-checked={checked}
							tabIndex={checked || (!hasPicked && index === 0) ? 0 : -1}
							onClick={() =>
								onPick(row.id, {
									paragraphs: row.paragraphCount,
									chars: row.charCount,
								})
							}
							className="flex min-h-11 items-start gap-3 p-3 text-left outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-checked:bg-foreground/10"
						>
							<span className="min-w-0 flex-1">
								<span className="wrap-break-word block break-keep font-bold text-base">
									{title}
								</span>
								{row.kind === "saved" ? (
									<span className="mt-1 line-clamp-2 block break-keep text-muted-foreground text-sm">
										{row.preview}
									</span>
								) : null}
								<span className="mt-1 block text-muted-foreground text-sm tabular-nums">
									{SCRIPT_TEXT.rowMeta(
										row.paragraphCount,
										row.charCount,
										whenLabel(row.updatedAt),
									)}
								</span>
							</span>
							{checked ? (
								<Check className="mt-1 shrink-0" aria-hidden="true" />
							) : null}
						</button>
					);
				})}
			</div>
			{hasNextPage ? (
				<div ref={sentinelRef} className="mt-3 flex flex-col items-start gap-2">
					{isFetchNextPageError ? (
						<ReloadRow
							text={SCRIPT_TEXT.moreFailed}
							reloading={isFetchingNextPage}
							onReload={() => void fetchNextPage()}
						/>
					) : isFetchingNextPage ? (
						<Skeleton aria-hidden="true" className="h-11 w-full rounded-lg" />
					) : (
						<Button
							variant="neutral"
							size="lg"
							onClick={() => void fetchNextPage()}
						>
							{SCRIPT_TEXT.more}
						</Button>
					)}
				</div>
			) : null}
		</>
	);
}

type Guard = { pending: boolean; failed: boolean } | null;

// 창 안(열려 있을 때만 그려져 작업을 읽는다). onBlocked는 저장하고 바꾸기가 충돌·지워짐을 만났을 때(메뉴가 그 창을 연다, 바꾸기는 하지 않는다)
function InsertBody({
	scriptId,
	onInserted,
	onBlocked,
}: {
	scriptId?: string;
	onInserted: (firstId: string | undefined) => void;
	onBlocked: (reason: "stale" | "gone", title: string) => void;
}) {
	const work = useWork();
	const queryClient = useQueryClient();
	const { paragraphs } = useParagraphs();
	const { replace, append } = useScriptInsert();
	const locked = scriptId !== undefined;
	const [view, setView] = useState<ScriptView>("saved");
	const [query, setQuery] = useState("");
	const [q, setQ] = useState("");
	const [picked, setPicked] = useState<string | null>(scriptId ?? null);
	const [row, setRow] = useState<{ paragraphs: number; chars: number } | null>(
		null,
	);
	const [mode, setMode] = useState<"append" | "replace">("append");
	const [guard, setGuard] = useState<Guard>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const bodyRef = useRef<HTMLDivElement>(null);
	const previewId = useId();
	const warnId = useId();
	useEffect(
		() => () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		},
		[],
	);

	const detail = useQuery({
		...orpc.scriptGet.queryOptions({
			input: picked ? { id: picked } : skipToken,
			...QUIET,
		}),
		// 고를 때마다 새로 받는다(다른 곳에서 고쳤을 수 있다)
		staleTime: 0,
	});
	const script = picked && detail.data?.id === picked ? detail.data : null;
	const counts = script
		? scriptBody(script.work.paragraphs)
		: row
			? { paragraphCount: row.paragraphs, charCount: row.chars }
			: null;

	// 지금 대본이 비었으면 세그먼트가 없고 늘 바꾼다(빈 카드를 남기지 않는다). 열기(locked)도 늘 바꾼다
	const hasScript = paragraphs.some((p) => p.text.trim() !== "");
	const replacing = locked || !hasScript || mode === "replace";
	const noRoom = !replacing && appendRoom(paragraphs) === 0;
	const kept = blankEnd(paragraphs) ? paragraphs.length - 1 : paragraphs.length;
	const notes =
		script && !replacing
			? appendNotes({ ...work.work, paragraphs }, workOf(script))
			: null;

	function pick(id: string, next: { paragraphs: number; chars: number }) {
		setPicked(id);
		setRow(next);
	}
	function run(before?: Before) {
		if (!script) return;
		onInserted(replacing ? replace(script, before) : append(script));
	}
	function insert() {
		if (!script) return;
		if (replacing && dirtyOf(work.snapshot(), work.linked)) {
			setGuard({ pending: false, failed: false });
			return;
		}
		run();
	}
	function saveThenReplace() {
		const link = work.linked;
		if (!link) return;
		const snap = work.snapshot();
		setGuard({ pending: true, failed: false });
		void sendSave(link, snap, false).then((sent) => {
			if (sent.ok) {
				void queryClient.invalidateQueries({
					queryKey: orpc.scriptList.key(),
				});
				run({
					work: snap,
					linked: {
						...link,
						version: sent.version,
						fingerprint: fingerprintOf(snap),
					},
				});
			} else if (sent.reason === "failed") {
				setGuard({ pending: false, failed: true });
			} else {
				setGuard(null);
				if (sent.reason === "gone") {
					work.clearLinked();
					void queryClient.invalidateQueries({
						queryKey: orpc.scriptList.key(),
					});
				}
				onBlocked(sent.reason, link.title);
			}
		});
	}

	function onQuery(next: string) {
		setQuery(next);
		// 목록이 바뀌니 고른 줄도 비운다(목록에 없는 줄이 골라진 채로 남지 않게)
		setPicked(null);
		setRow(null);
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => setQ(next), SEARCH_DELAY_MS);
	}

	const notFound =
		detail.error instanceof ORPCError && detail.error.code === "NOT_FOUND";
	const ready = script !== null && !noRoom;

	return (
		<>
			<DialogHeader className="shrink-0 pr-12">
				<DialogTitle>{SCRIPT_TEXT.insertTitle}</DialogTitle>
				<DialogDescription className="sr-only">
					{SCRIPT_TEXT.insertDescription}
				</DialogDescription>
			</DialogHeader>
			<div
				ref={bodyRef}
				className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
			>
				{locked ? (
					<p className="wrap-break-word break-keep font-bold text-base">
						{script ? titleOf(script) : null}
					</p>
				) : (
					<>
						<ToggleGroup
							value={[view]}
							onValueChange={(next) => {
								const value = next[0] as ScriptView | undefined;
								if (!value || value === view) return;
								setView(value);
								setPicked(null);
								setRow(null);
							}}
							aria-label="보기 구역"
							className="self-start bg-muted p-1"
						>
							<Toggle value="saved" className={viewItem}>
								{SCRIPT_TEXT.savedSection}
							</Toggle>
							<Toggle value="recent" className={viewItem}>
								{SCRIPT_TEXT.recentSection}
							</Toggle>
						</ToggleGroup>
						{view === "saved" ? (
							// /scripts 조건 줄과 같은 검색 칸. shrink-0은 본문 칸이 모자랄 때 칸이 눌려 줄어들지 않게 한다
							<div className="flex shrink-0">
								<SearchField
									search={{
										value: query,
										placeholder: SCRIPT_TEXT.searchPlaceholder,
										label: SCRIPT_TEXT.searchLabel,
										onChange: onQuery,
									}}
									searchRef={searchRef}
									name="script-insert-search"
								/>
							</div>
						) : null}
						<Picker
							// 구역이 바뀌면 목록 상태(끝 감시 줄·고른 줄)를 새로 시작한다
							key={view}
							view={view}
							q={view === "saved" ? q : ""}
							picked={picked}
							onPick={pick}
							bodyRef={bodyRef}
						/>
					</>
				)}
			</div>
			{/* 고정 줄: 미리 보기·넣는 방식·경고. 읽히는 글(미리 보기, 경고)만 aria-live 영역이고 세그먼트·'다시 불러오기' 버튼은 밖이다. 영역은 늘 그려 바뀐 수가 읽힌다.
			    줄 사이 간격은 글마다 mt-2로 둬서 빈 영역이 자리를 차지하지 않는다 */}
			<div className="flex shrink-0 flex-col">
				<div id={previewId} aria-live="polite">
					{detail.isError && notFound ? (
						<p className="mt-2 text-sm text-warning">{SCRIPT_TEXT.gone}</p>
					) : !detail.isError && picked && counts ? (
						<p className="mt-2 font-bold text-sm tabular-nums">
							{SCRIPT_TEXT.preview(counts.paragraphCount, counts.charCount)}
						</p>
					) : !detail.isError && picked ? (
						<Skeleton aria-hidden="true" className="mt-2 h-5 w-40" />
					) : null}
				</div>
				{detail.isError && !notFound ? (
					<div className="mt-2">
						<ReloadRow
							text={SCRIPT_TEXT.openFailed}
							reloading={detail.isFetching}
							onReload={() => void detail.refetch()}
						/>
					</div>
				) : null}
				{picked && !locked && hasScript ? (
					<ToggleGroup
						value={[mode]}
						onValueChange={(next) => {
							if (next[0]) setMode(next[0] as "append" | "replace");
						}}
						aria-label={PARAGRAPH_TEXT.pasteMode}
						className="mt-2 bg-muted p-1"
					>
						<Toggle value="append" className={sourceItem}>
							{SCRIPT_TEXT.modeAppend}
						</Toggle>
						<Toggle value="replace" className={sourceItem}>
							{SCRIPT_TEXT.modeReplace}
						</Toggle>
					</ToggleGroup>
				) : null}
				<div id={warnId} aria-live="polite">
					{picked && hasScript && replacing ? (
						<p className="mt-2 flex gap-2 text-sm text-warning">
							<TriangleAlert
								aria-hidden="true"
								className="mt-0.5 size-4 shrink-0"
							/>
							{SCRIPT_TEXT.warnReplace(kept)}
						</p>
					) : null}
					{picked && hasScript && replacing && !work.linked ? (
						<p className="mt-2 text-muted-foreground text-sm">
							{SCRIPT_TEXT.replaceUndoNote}
						</p>
					) : null}
					{script && noRoom ? (
						<p className="mt-2 text-muted-foreground text-sm">
							{SCRIPT_TEXT.noRoom}
						</p>
					) : null}
					{notes && notes.followDefault > 0 ? (
						<p className="mt-2 text-muted-foreground text-sm">
							{SCRIPT_TEXT.warnFollowDefault(notes.followDefault)}
						</p>
					) : null}
					{notes && !noRoom && notes.overLimit > 0 ? (
						<p className="mt-2 text-muted-foreground text-sm">
							{SCRIPT_TEXT.warnOverLimit(notes.overLimit)}
						</p>
					) : null}
					{notes && notes.speakers > 0 ? (
						<p className="mt-2 text-muted-foreground text-sm">
							{SCRIPT_TEXT.warnSpeakers(notes.speakers)}
						</p>
					) : null}
				</div>
			</div>
			<DialogFooter className="shrink-0">
				<DialogClose
					render={
						<Button
							variant="neutral"
							size="lg"
							className="flex-1 md:flex-none"
						/>
					}
				>
					{SCRIPT_TEXT.cancel}
				</DialogClose>
				{/* 고르기 전에는 무채색 neutral로 잠근다(잠긴 주 버튼은 채움 50%가 아니다) */}
				<Button
					variant={ready ? "default" : "neutral"}
					size="lg"
					focusableWhenDisabled
					disabled={!ready}
					aria-describedby={`${previewId} ${warnId}`}
					className={cn("flex-1 md:flex-none", lockedButton(true))}
					onClick={insert}
				>
					{SCRIPT_TEXT.insertNow}
				</Button>
			</DialogFooter>
			<DialogCloseButton label={STUDIO_TEXT.close} />
			{guard && work.linked ? (
				<DirtyDialog
					title={work.linked.title}
					pending={guard.pending}
					failed={guard.failed}
					onSaveThenReplace={saveThenReplace}
					onReplace={() => {
						setGuard(null);
						run();
					}}
					onCancel={() => setGuard(null)}
				/>
			) : null}
		</>
	);
}

// 넣은 첫 문단의 대본 칸을 가운데로 옮기고 포커스한다. 칸이 아직 그려지지 않았으면 다음 프레임에 다시 본다(몇 번만)
function land(id: string, tries = 5) {
	requestAnimationFrame(() => {
		if (centered(paragraphTextId(id))) focusText(id);
		else if (tries > 0) land(id, tries - 1);
	});
}

// 열 때만 마운트된다. 넣으면 포커스는 넣은 첫 문단의 대본 칸(가운데로 옮긴 뒤), 취소·닫기는 연 버튼(openerRef)이다
export function ScriptInsertDialog({
	scriptId,
	openerRef,
	onClose,
	onBlocked,
}: {
	scriptId?: string;
	openerRef: RefObject<HTMLElement | null>;
	onClose: () => void;
	onBlocked: (reason: "stale" | "gone", title: string) => void;
}) {
	const inserted = useRef<string | null>(null);
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent
				initialFocus={() =>
					document.querySelector<HTMLElement>(
						"[name='script-insert-search']",
					) ?? true
				}
				// 넣은 뒤에는 창이 포커스를 돌려주지 않는다(false). 넣은 문단은 창이 사라진 뒤에야 그려져 창의 복귀 계산이 그 칸을 못 찾고 연 버튼으로 덮어쓴다 → onInserted가 그려진 뒤 직접 옮긴다
				finalFocus={() =>
					inserted.current !== null ? false : openerRef.current || true
				}
				// 767 이하는 전체 시트, 머리·버튼 줄은 고정하고 본문만 스크롤한다. 고르는 단계는 높이를 고정해 고른 뒤 미리 보기·경고 줄이 생겨도 창 머리가 움직이지 않는다
				className={cn(
					"flex h-dvh flex-col rounded-none md:max-w-2xl md:rounded-2xl",
					// 최대 높이는 공통 값(알림 자리를 뺀 높이, packages/ui dialog.tsx)을 따르고, 고르는 단계의 85dvh도 그 값에 걸린다(MG-14)
					scriptId === undefined ? "md:h-[85dvh]" : "md:h-auto",
				)}
			>
				<InsertBody
					scriptId={scriptId}
					onInserted={(id) => {
						inserted.current = id ?? null;
						onClose();
						if (id) land(id);
					}}
					onBlocked={onBlocked}
				/>
			</DialogContent>
		</Dialog>
	);
}
