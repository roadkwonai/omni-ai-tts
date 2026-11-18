// apps/web/src/components/number-review.tsx
"use client";

import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@tts-pilot-app/ui/components/dialog";
import { Input } from "@tts-pilot-app/ui/components/input";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tts-pilot-app/ui/components/tooltip";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import {
	ChevronLeft,
	ChevronRight,
	CircleAlert,
	CircleCheck,
	Copy,
	ListChecks,
	Minus,
	Undo2,
} from "lucide-react";
import {
	type ReactNode,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { autoTagReadings } from "@/lib/autotag-reading";
import type { ReadingItem } from "@/lib/number-reading";
import {
	applyCertain,
	type Decision,
	decide,
	isCertain,
	type Paragraph,
	reviewOf,
	spokenOf,
	spokenPartsOf,
	undecide,
	unreviewedList,
} from "@/lib/paragraph-script";
import { NUMBER_TEXT, PARAGRAPH_TEXT } from "@/lib/studio-text";
import { STUDIO_TEXT } from "@/lib/studio-view";

import { fieldClass, isComposingEnter } from "./class-form-dialog";
import { DialogCloseButton } from "./dialog-close-button";
import {
	useParagraphs,
	useShownParagraphs,
	useWork,
} from "./paragraph-provider";
import { lockedButton } from "./voice-problem";

// 숫자 검수(T11, 브리프 17): 카드 숫자 줄(NumberLine), 작업 설정 '숫자 검수' 버튼(NumberReviewButton), 숫자 검수 창(NumberReview).
// 결정은 문단의 fixes에 저장되고(paragraph-script decide·undecide·applyCertain) 모두 useParagraphs().edit를 거친다.
// 항목은 readingItems 캐시에서 온다. 공급자는 부르지 않는다. AutoTag 참고 후보는 창을 열 때만 동적으로 불러온다(lib/autotag-reading)

// 바뀐 자리 표시(15.2의 새 태그 표시와 같은 문법). label은 화면 밖 이름표
function Mark({ children, label }: { children: ReactNode; label?: string }) {
	return (
		<mark className="rounded-sm bg-card px-0.5 font-bold text-foreground ring-1 ring-border">
			{label ? <span className="sr-only">{label} </span> : null}
			{children}
		</mark>
	);
}

const markOf = (decision: Decision | null) =>
	!decision
		? NUMBER_TEXT.openMark
		: decision.choice === "keep"
			? NUMBER_TEXT.keptMark
			: decision.choice === "manual"
				? NUMBER_TEXT.manualMark
				: NUMBER_TEXT.appliedMark;

function StateIcon({ decision }: { decision: Decision | null }) {
	return !decision ? (
		<CircleAlert aria-hidden="true" className="size-4 shrink-0 text-warning" />
	) : decision.choice === "keep" ? (
		<Minus
			aria-hidden="true"
			className="size-4 shrink-0 text-muted-foreground"
		/>
	) : (
		<CircleCheck aria-hidden="true" className="size-4 shrink-0 text-success" />
	);
}

// 카드 숫자 줄(17.1). 교정 항목이 없는 문단은 아무것도 그리지 않는다. 발음용 대본 판은 바뀐 자리가 있을 때만, 상태 줄은 항목이 있으면 늘 있다
export function NumberLine({
	paragraph: p,
	n,
	onReview,
}: {
	paragraph: Paragraph;
	n: number;
	onReview: (opener: HTMLElement) => void;
}) {
	const { pairs, unreviewed } = reviewOf(p);
	if (pairs.length === 0) return null;
	const parts = spokenPartsOf(p);
	const changed = parts.some((part) => part.changed);
	// 판이 생기거나 사라져도 바깥 칸과 상태 줄은 같은 노드로 남는다(연 버튼이 새로 그려지면 닫을 때 포커스가 갈 곳이 없다)
	const done = unreviewed === 0;
	const label = done ? NUMBER_TEXT.again : NUMBER_TEXT.review;
	const status = (
		<p className="flex flex-wrap items-center gap-x-2 text-sm">
			<span
				className={cn(
					"flex items-center gap-1.5",
					done ? "text-success" : "text-warning",
				)}
			>
				{done ? (
					<CircleCheck aria-hidden="true" className="size-4 shrink-0" />
				) : (
					<CircleAlert aria-hidden="true" className="size-4 shrink-0" />
				)}
				{done ? (
					NUMBER_TEXT.done
				) : (
					// 어느 숫자가 남았는지 원문 표기로 보인다(최대 3개, 17.1). 조사는 붙이지 않는다
					<span className="min-w-0">
						{NUMBER_TEXT.openHead}{" "}
						<span translate="no">{unreviewedList([p])}</span>{" "}
						{NUMBER_TEXT.openTail}
					</span>
				)}
			</span>
			{/* 구분점과 링크는 한 덩어리로 줄바꿈된다(점이 다음 줄 맨 앞에 홀로 남지 않게). gap-2는 포커스 링이 점과 겹치지 않는 간격 */}
			<span className="flex items-center gap-2 whitespace-nowrap">
				<span aria-hidden="true" className="text-muted-foreground">
					·
				</span>
				{/* 눌림 영역 44px, 줄 높이는 위아래로 들어가 24px. 링크 모양이지만 청록은 채운 주 버튼과 포커스만이라(브리프 17.1, 청록 금지) 변형 색(link의 text-primary)을 text-foreground로 덮는다. hover는 밑줄이 굵어진다 */}
				<Button
					variant="link"
					size="lg"
					aria-label={`${PARAGRAPH_TEXT.paragraphN(n)} ${label}`}
					className="-my-2.5 font-normal text-foreground underline hover:decoration-2"
					onClick={(event) => onReview(event.currentTarget)}
				>
					{label}
				</Button>
			</span>
		</p>
	);
	return (
		<div
			className={cn(
				"flex flex-col",
				changed ? "gap-1.5 rounded-xl bg-muted px-2.5 py-2" : "px-2.5",
			)}
		>
			{changed ? (
				<fieldset className="flex min-w-0 flex-col gap-0.5">
					<legend className="sr-only">{NUMBER_TEXT.spokenLabel(n)}</legend>
					<p aria-hidden="true" className="text-muted-foreground text-sm">
						{NUMBER_TEXT.spoken}
					</p>
					<p className="wrap-anywhere whitespace-pre-wrap text-base leading-relaxed">
						{parts.map((part, i) =>
							part.changed ? (
								<Mark key={i} label={NUMBER_TEXT.changed}>
									{part.text}
								</Mark>
							) : (
								<span key={i}>{part.text}</span>
							),
						)}
					</p>
				</fieldset>
			) : null}
			{status}
		</div>
	);
}

// 문단별 항목 수·검수 안 한 수(문단 객체가 같으면 다시 세지 않는다). 작업 띠 버튼이 늦춘 문단 목록으로 센다
const COUNTS = new WeakMap<Paragraph, { total: number; open: number }>();
function countOf(p: Paragraph) {
	let hit = COUNTS.get(p);
	if (!hit) {
		const { pairs, unreviewed } = reviewOf(p);
		hit = { total: pairs.length, open: unreviewed };
		COUNTS.set(p, hit);
	}
	return hit;
}

// '숫자 검수' 버튼(17.2): 교정 항목이 있으면 보이고, 검수 안 한 항목이 있으면 끝에 개수 배지를 단다. 0개면 배지 없이 둔다(복사·다시 보기 길)
export function NumberReviewButton() {
	const work = useWork();
	const ps = useShownParagraphs();
	const { total, open } = useMemo(() => {
		let total = 0;
		let open = 0;
		for (const p of ps) {
			const hit = countOf(p);
			total += hit.total;
			open += hit.open;
		}
		return { total, open };
	}, [ps]);
	if (total === 0) return null;
	return (
		<Button
			variant="neutral"
			size="lg"
			aria-label={open > 0 ? NUMBER_TEXT.buttonLabel(open) : undefined}
			onClick={(event) => work.openReview(null, event.currentTarget)}
		>
			<ListChecks data-icon="inline-start" aria-hidden="true" />
			{NUMBER_TEXT.button}
			{open > 0 ? (
				<Badge aria-hidden="true" className="tabular-nums">
					{open}
				</Badge>
			) : null}
		</Button>
	);
}

type Row = {
	key: string;
	p: Paragraph;
	n: number;
	item: ReadingItem;
	decision: Decision | null;
};
// 대본 전체의 항목(문단 순서, 같은 문단은 글 순서)
const rowsOf = (paragraphs: readonly Paragraph[]): Row[] =>
	paragraphs.flatMap((p, i) =>
		reviewOf(p).pairs.map(({ item, decision }) => ({
			key: `${p.id}:${item.start}`,
			p,
			n: i + 1,
			item,
			decision,
		})),
	);

// 고른 선택지. reading은 제안 읽기 번호, autotag는 AutoTag 참고 후보
type Selection =
	| { kind: "reading"; index: number }
	| { kind: "keep" }
	| { kind: "manual" }
	| { kind: "autotag" }
	| null;
type Chosen = { key: string; pick: Selection; text: string };
// 확인 필요가 아니고 제안이 있는 검수 안 한 항목('확실한 것 모두 적용'이 적용하는 것)
const certainOf = (r: Row) => isCertain(r.item, r.decision);

// 항목을 열 때의 선택: 정한 항목은 정한 것, 아니면 확인 필요가 아닌 항목만 첫 제안(확인 필요는 아무것도 고르지 않는다)
function initialOf({ key, item, decision }: Row): Chosen {
	const first = item.readings[0] ?? "";
	if (!decision)
		return {
			key,
			pick:
				item.needsCheck || item.readings.length === 0
					? null
					: { kind: "reading", index: 0 },
			text: first,
		};
	if (decision.choice === "keep")
		return { key, pick: { kind: "keep" }, text: first };
	if (decision.choice === "manual")
		return { key, pick: { kind: "manual" }, text: decision.reading ?? first };
	const at = item.readings.indexOf(decision.reading ?? first);
	return {
		key,
		pick: at < 0 ? { kind: "manual" } : { kind: "reading", index: at },
		text: decision.reading ?? first,
	};
}

// 지금 선택을 결정으로. 고르지 않았거나 직접 입력이 비었으면 null
function decisionOf(
	{ pick, text }: Chosen,
	item: ReadingItem,
	candidate: string | null,
): Pick<Decision, "choice" | "reading"> | null {
	if (!pick) return null;
	if (pick.kind === "keep") return { choice: "keep" };
	if (pick.kind === "reading")
		return { choice: "apply", reading: item.readings[pick.index] };
	if (pick.kind === "autotag")
		return candidate ? { choice: "manual", reading: candidate } : null;
	return text.trim() ? { choice: "manual", reading: text.trim() } : null;
}

// 문맥: 원문 앞뒤 약 30자(더 있으면 …), 항목은 mark
const CONTEXT = 30;
function Context({ row }: { row: Row }) {
	const { text } = row.p;
	const { start, end, original } = row.item;
	return (
		<p
			translate="no"
			className="wrap-anywhere whitespace-pre-wrap break-keep text-base leading-relaxed"
		>
			{start > CONTEXT ? "…" : null}
			{text.slice(Math.max(0, start - CONTEXT), start)}
			<Mark>{original}</Mark>
			{text.slice(end, end + CONTEXT)}
			{text.length > end + CONTEXT ? "…" : null}
		</p>
	);
}

// 라디오 한 줄(눌림 영역 44px, 원형 표식 + 글). 진짜 input[type=radio]라 ↑↓로 고른다
function Choice({
	name,
	checked,
	first,
	onSelect,
	children,
}: {
	name: string;
	checked: boolean;
	// 열 때·항목을 옮길 때 포커스가 갈 라디오(고른 것, 없으면 첫째)
	first: boolean;
	onSelect: () => void;
	children: ReactNode;
}) {
	return (
		<label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 hover:bg-muted">
			<span className="relative grid size-5 shrink-0 place-items-center">
				<input
					type="radio"
					name={name}
					checked={checked}
					data-review-first={first ? "" : undefined}
					onChange={onSelect}
					className="peer absolute inset-0 m-0 size-5 cursor-pointer appearance-none rounded-full border border-input outline-offset-2 checked:border-foreground focus-visible:outline-2 focus-visible:outline-ring"
				/>
				<span className="pointer-events-none size-2.5 rounded-full bg-foreground opacity-0 peer-checked:opacity-100" />
			</span>
			<span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-base md:text-sm">
				{children}
			</span>
		</label>
	);
}

// 이전·다음 같은 아이콘 버튼(이름표 + 툴팁). 끝에서는 꺼져도 닿는다
function IconButton({
	label,
	disabled,
	onClick,
	children,
}: {
	label: string;
	disabled: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="neutral"
						size="icon-lg"
						aria-label={label}
						focusableWhenDisabled
						disabled={disabled}
						className={lockedButton(true)}
						onClick={onClick}
					/>
				}
			>
				{children}
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

// 창 안(열려 있을 때만 그려진다). 열린 동안 원문은 바뀌지 않는다(모달). locked는 전체 만들기가 도는 중이라 결정을 바꿀 수 없다(이동·복사는 된다)
function ReviewBody({
	paragraphId,
	locked,
}: {
	paragraphId: string | null;
	locked: boolean;
}) {
	const { paragraphs, edit } = useParagraphs();
	const rows = useMemo(() => rowsOf(paragraphs), [paragraphs]);
	const lockId = useId();
	const reasonId = useId();
	const radioName = useId();
	const listId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	// 지금 항목의 key, 모두 검수했으면 "done"
	const [view, setView] = useState(() => {
		const mine = paragraphId
			? rows.filter((r) => r.p.id === paragraphId)
			: rows;
		const start =
			mine.find((r) => !r.decision) ??
			mine[0] ??
			rows.find((r) => !r.decision) ??
			rows[0];
		return start?.key ?? "done";
	});
	const [chosen, setChosen] = useState<Chosen | null>(null);
	// AutoTag 참고 후보(항목 순서대로). null이면 불러오는 중. 항목 글이 같은 동안은 다시 부르지 않는다
	const [auto, setAuto] = useState<(string | null)[] | null>(null);
	const originals = rows.map((r) => r.item.original).join("\u0000");
	useEffect(() => {
		let alive = true;
		void autoTagReadings(
			originals === "" ? [] : originals.split("\u0000"),
		).then((list) => {
			if (alive) setAuto(list);
		});
		return () => {
			alive = false;
		};
	}, [originals]);

	// 지금 항목이 목록에서 보이게(긴 대본). 항목이 바뀔 때만
	useEffect(() => {
		document
			.getElementById(`${listId}${view}`)
			?.scrollIntoView({ block: "nearest" });
	}, [listId, view]);

	const index = view === "done" ? -1 : rows.findIndex((r) => r.key === view);
	const row = index < 0 ? null : rows[index];
	const finished = row === null;
	// 한 번 돌아 센다(js-combine-iterations). 직접 입력을 칠 때마다 다시 세지 않게 rows가 바뀔 때만
	const { open, certain } = useMemo(() => {
		let open = 0;
		let certain = 0;
		for (const r of rows) {
			if (!r.decision) open += 1;
			if (certainOf(r)) certain += 1;
		}
		return { open, certain };
	}, [rows]);
	const sel = row ? (chosen?.key === row.key ? chosen : initialOf(row)) : null;
	const candidate = row ? (auto?.[index] ?? null) : null;
	const decision = row && sel ? decisionOf(sel, row.item, candidate) : null;
	const reason =
		!row || !sel
			? null
			: !sel.pick
				? NUMBER_TEXT.pickReading
				: !decision
					? NUMBER_TEXT.typeReading
					: null;
	const blocked = locked || reason !== null;

	// 지금 항목의 포커스 라디오: 고른 것, 아무것도 고르지 않았으면 첫째
	const target = !sel
		? null
		: sel.pick?.kind === "reading"
			? `reading:${sel.pick.index}`
			: (sel.pick?.kind ??
				(row && row.item.readings.length > 0 ? "reading:0" : "keep"));
	// 지금 항목의 포커스 라디오로 포커스. 상태를 먼저 그린 뒤 부른다
	function focusRadio() {
		document.querySelector<HTMLElement>("[data-review-first]")?.focus();
	}
	// 항목(또는 "done")으로 간다. 앞 항목에서 고르던 것은 버린다. 목록은 포커스를 라디오로 보낸다
	function show(key: string) {
		flushSync(() => {
			setView(key);
			setChosen(null);
		});
	}
	function go(key: string, focus = false) {
		show(key);
		if (focus) focusRadio();
	}

	function pick(next: Selection, text?: string) {
		if (!row || !sel) return;
		flushSync(() =>
			setChosen({ ...sel, key: row.key, pick: next, text: text ?? sel.text }),
		);
		if (next?.kind === "manual") inputRef.current?.focus();
	}
	// 한 문단의 결정만 바꾼다. 같은 문단이면 edit이 받아들이지 않는다(저장·되돌리기 없음)
	function change(id: string, fn: (p: Paragraph) => Paragraph) {
		edit((ps) => {
			const at = ps.findIndex((p) => p.id === id);
			const next = at < 0 ? undefined : fn(ps[at]);
			return next === undefined || next === ps[at]
				? ps
				: ps.map((p, i) => (i === at ? next : p));
		});
	}
	// 다음 미검수 항목(지금 것 뒤, 없으면 앞). 없으면 null(모두 검수)
	function nextOpen() {
		return (
			rows.find((r, i) => i > index && !r.decision) ??
			rows.find((r, i) => i < index && !r.decision) ??
			null
		);
	}
	function apply() {
		if (!row || blocked || !decision) return;
		const fromInput = document.activeElement === inputRef.current;
		change(row.p.id, (p) => decide(p, row.item, decision));
		const next = nextOpen();
		if (!next) {
			show("done");
			document.querySelector<HTMLElement>("[data-review-done]")?.focus();
			return;
		}
		show(next.key);
		// 다음 항목에 처음부터 고른 것이 있으면 포커스는 주 버튼에 둔다(Enter로 이어서 받는다). 확인 필요이거나 입력 칸이 사라졌으면 라디오로 보낸다
		if (initialOf(next).pick === null || fromInput) focusRadio();
	}
	function applyAll() {
		if (locked || certain === 0) return;
		edit((ps) => applyCertain(ps), {
			message: NUMBER_TEXT.applied(certain),
		});
		// 남은 것(확인 필요)이 없으면 모두 검수, 지금 항목이 방금 적용되었으면 남은 첫 항목으로
		const left = rows.find((r) => !r.decision && !certainOf(r));
		if (!left) show("done");
		else if (row && certainOf(row)) show(left.key);
	}
	function revert() {
		if (!row || locked) return;
		// 되돌리기 단추가 사라지니 포커스를 지금 항목의 라디오로(apply와 같다). 상태를 먼저 그린 뒤 옮긴다
		flushSync(() => {
			change(row.p.id, (p) => undecide(p, row.item));
			setChosen(null);
		});
		focusRadio();
	}
	async function copy() {
		const text = paragraphs
			.map(spokenOf)
			.filter((part) => part.trim() !== "")
			.join("\n\n");
		try {
			await navigator.clipboard.writeText(text);
			toast(NUMBER_TEXT.copied);
		} catch {
			toast.error(NUMBER_TEXT.copyFailed);
		}
	}

	const last = rows.length - 1;
	const live = row
		? NUMBER_TEXT.live(row.n, row.item.original, markOf(row.decision))
		: NUMBER_TEXT.allDone;
	return (
		<>
			{/* 오른쪽 위 '닫기'(44px + 12px)와 제목이 겹치지 않게 오른쪽을 비운다 */}
			<DialogHeader className="shrink-0 pr-12">
				<DialogTitle className="break-keep">{NUMBER_TEXT.title}</DialogTitle>
				<DialogDescription className="tabular-nums">
					{NUMBER_TEXT.summary(open, rows.length)}
					{/* 지금 위치. 목록이 숨는 767px 이하에서도 보인다 */}
					{row ? ` · ${NUMBER_TEXT.position(index + 1, rows.length)}` : null}
				</DialogDescription>
				<p className="text-muted-foreground text-sm">{NUMBER_TEXT.note}</p>
			</DialogHeader>
			<p aria-live="polite" className="sr-only">
				{live}
			</p>
			<div className="flex min-h-0 flex-1 gap-4">
				{/* 항목 목록(768px 이상). 누르면 그 항목으로 가고 포커스는 지금 항목의 라디오로 간다 */}
				<ol
					aria-label={NUMBER_TEXT.list}
					className="-mx-1 hidden min-h-0 w-56 shrink-0 flex-col gap-0.5 overflow-y-auto overscroll-contain px-1 md:flex"
				>
					{rows.map((r) => {
						const current = r.key === view;
						return (
							<li key={r.key}>
								<button
									type="button"
									id={`${listId}${r.key}`}
									aria-current={current ? "true" : undefined}
									onClick={() => go(r.key, true)}
									className={cn(
										"flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-foreground text-sm outline-offset-2 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
										// 지금 항목: hover(bg-muted)보다 진한 바탕. 가장자리 막대는 쓰지 않는다(craft-floor)
										current && "bg-foreground/10 hover:bg-foreground/10",
									)}
								>
									<StateIcon decision={r.decision} />
									<span
										className={cn(
											"shrink-0 tabular-nums",
											current ? "text-foreground" : "text-muted-foreground",
										)}
									>
										{NUMBER_TEXT.paragraph(r.n)}
									</span>
									<span translate="no" className="min-w-0 truncate font-bold">
										{r.item.original}
									</span>
									<span className="sr-only">{markOf(r.decision)}</span>
								</button>
							</li>
						);
					})}
				</ol>
				<div className="-mx-1 flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-1">
					{row && sel ? (
						<>
							<p className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
								{NUMBER_TEXT.kindLine(row.n, NUMBER_TEXT.kinds[row.item.kind])}
								{row.item.needsCheck ? (
									<Badge variant="warning">{NUMBER_TEXT.needsCheck}</Badge>
								) : null}
							</p>
							<Context row={row} />
							{row.item.needsCheck && row.item.reason ? (
								<p className="text-muted-foreground text-sm">
									{NUMBER_TEXT.reasons[row.item.reason]}
								</p>
							) : null}
							{row.decision ? (
								<p className="text-muted-foreground text-sm">
									{markOf(row.decision)}
								</p>
							) : null}
							<fieldset className="flex min-w-0 flex-col">
								<legend className="sr-only">{NUMBER_TEXT.legend}</legend>
								{!row.item.needsCheck && row.item.readings.length > 0 ? (
									<p className="px-3 text-muted-foreground text-sm">
										{NUMBER_TEXT.recommend}
									</p>
								) : null}
								{row.item.readings.map((reading, i) => (
									<Choice
										key={reading}
										name={radioName}
										checked={
											sel.pick?.kind === "reading" && sel.pick.index === i
										}
										first={target === `reading:${i}`}
										onSelect={() => pick({ kind: "reading", index: i })}
									>
										{reading}
									</Choice>
								))}
								<Choice
									name={radioName}
									checked={sel.pick?.kind === "keep"}
									first={target === "keep"}
									onSelect={() => pick({ kind: "keep" })}
								>
									<span translate="no">
										{NUMBER_TEXT.keepOf(row.item.original)}
									</span>
								</Choice>
								<Choice
									name={radioName}
									checked={sel.pick?.kind === "manual"}
									first={target === "manual"}
									onSelect={() => pick({ kind: "manual" })}
								>
									{NUMBER_TEXT.manual}
								</Choice>
								{sel.pick?.kind === "manual" ? (
									<div className="px-3 pb-1">
										<Input
											ref={inputRef}
											name="number-reading"
											autoComplete="off"
											aria-label={NUMBER_TEXT.manualInput}
											aria-describedby={
												reason && !locked ? reasonId : undefined
											}
											value={sel.text}
											onChange={(event) =>
												pick({ kind: "manual" }, event.target.value)
											}
											onKeyDown={(event) => {
												if (isComposingEnter(event)) {
													event.preventDefault();
													return;
												}
												if (event.key === "Enter") {
													event.preventDefault();
													apply();
												}
											}}
											className={fieldClass}
										/>
									</div>
								) : null}
								{candidate ? (
									<Choice
										name={radioName}
										checked={sel.pick?.kind === "autotag"}
										first={target === "autotag"}
										onSelect={() => pick({ kind: "autotag" })}
									>
										{candidate}
										<Badge>{NUMBER_TEXT.autoTag}</Badge>
									</Choice>
								) : auto === null ? (
									<p className="px-3 py-2 text-muted-foreground text-sm">
										{NUMBER_TEXT.autoTagLoading}
									</p>
								) : null}
							</fieldset>
						</>
					) : (
						<div className="flex flex-col items-start gap-4 py-6">
							<p className="flex items-center gap-2 font-bold text-success text-xl">
								<CircleCheck aria-hidden="true" className="size-6 shrink-0" />
								{NUMBER_TEXT.allDone}
							</p>
							<Button
								variant="neutral"
								size="lg"
								data-review-done=""
								onClick={() => void copy()}
							>
								<Copy data-icon="inline-start" aria-hidden="true" />
								{NUMBER_TEXT.copy}
							</Button>
						</div>
					)}
				</div>
			</div>
			{locked ? (
				<p id={lockId} className="shrink-0 text-muted-foreground text-sm">
					{NUMBER_TEXT.locked}
				</p>
			) : null}
			{/* 주 버튼이 잠긴 이유(잠금 이유 줄과 같은 자리, 보이는 14px 회색 한 줄) */}
			{reason && !locked ? (
				<p id={reasonId} className="shrink-0 text-muted-foreground text-sm">
					{reason}
				</p>
			) : null}
			{/* 버튼 줄(고정). 768px 이상은 왼쪽 이동·되돌리기, 오른쪽 '확실한 것 모두 적용'과 주 버튼. 767px 이하는 이동 줄 → 주 버튼 한 줄 → '확실한 것 모두 적용' */}
			<DialogFooter className="shrink-0 flex-col md:flex-row md:items-center md:justify-between">
				<div className="flex items-center gap-2">
					<IconButton
						label={NUMBER_TEXT.prev}
						disabled={index === 0 || last < 0}
						onClick={() =>
							go(finished ? (rows[last]?.key ?? "done") : rows[index - 1].key)
						}
					>
						<ChevronLeft aria-hidden="true" />
					</IconButton>
					<IconButton
						label={NUMBER_TEXT.next}
						disabled={finished || index === last}
						onClick={() => go(rows[index + 1].key)}
					>
						<ChevronRight aria-hidden="true" />
					</IconButton>
					{row?.decision ? (
						<Button
							variant="neutral"
							size="lg"
							focusableWhenDisabled
							disabled={locked}
							aria-describedby={locked ? lockId : undefined}
							className={lockedButton(true)}
							onClick={revert}
						>
							<Undo2 data-icon="inline-start" aria-hidden="true" />
							{NUMBER_TEXT.revert}
						</Button>
					) : null}
				</div>
				<div className="contents md:flex md:items-center md:gap-2">
					<Button
						variant="neutral"
						size="lg"
						focusableWhenDisabled
						disabled={locked || certain === 0}
						aria-describedby={locked ? lockId : undefined}
						className={cn("order-3 md:order-none", lockedButton(true))}
						onClick={applyAll}
					>
						{NUMBER_TEXT.applyCertain(certain)}
					</Button>
					{finished ? null : (
						<Button
							variant={blocked ? "neutral" : "default"}
							size="lg"
							focusableWhenDisabled
							disabled={blocked}
							aria-describedby={locked ? lockId : reason ? reasonId : undefined}
							// 잠겨도 neutral이지만(브리프 3절) 테두리를 foreground로 해 '확실한 것 모두 적용'과 구분한다
							className={cn(
								"order-2 md:order-none",
								lockedButton(true),
								blocked && "border-foreground",
							)}
							onClick={apply}
						>
							{NUMBER_TEXT.applyNext}
						</Button>
					)}
				</div>
			</DialogFooter>
			{finished ? null : (
				<Button
					variant="ghost"
					size="lg"
					// 보조 동작이라 ghost의 글자색(foreground)을 text-muted-foreground로 낮춘다(브리프 17.3)
					className="shrink-0 self-start text-muted-foreground"
					onClick={() => void copy()}
				>
					<Copy data-icon="inline-start" aria-hidden="true" />
					{NUMBER_TEXT.copy}
				</Button>
			)}
			{/* DOM 끝에 둔다(Tab 순서에서 버튼보다 뒤) */}
			<DialogCloseButton label={STUDIO_TEXT.close} />
		</>
	);
}

// 숫자 검수 창(17.3). 열림 상태는 작업의 reviewAt이고, 닫으면(Esc·X) 포커스는 연 버튼으로 돌아간다(17.5).
// 닫히는 동안에도 내용이 남게 마지막 열린 값을 기억한다. locked는 전체 만들기가 도는 중이다
export function NumberReview({ locked }: { locked: boolean }) {
	const work = useWork();
	const at = work.reviewAt;
	const [last, setLast] = useState(at);
	// 열 때마다 새 값이라(openReview) 닫히는 중에 다시 열어도 창 안 상태를 새로 시작한다(ReviewBody key)
	const [opens, setOpens] = useState(0);
	if (at && at !== last) {
		setLast(at);
		setOpens(opens + 1);
	}
	return (
		<Dialog
			open={at !== null}
			onOpenChange={(next) => {
				if (!next) work.closeReview();
			}}
		>
			<DialogContent
				// 열려 있는 동안을 알리는 표식(되돌리기 알림이 포커스를 창 안에 둔다, paragraph-provider restore)
				data-number-review=""
				initialFocus={() =>
					document.querySelector<HTMLElement>("[data-review-first]") ?? true
				}
				finalFocus={() => work.reviewOpener() ?? true}
				className="flex flex-col overflow-hidden md:min-h-96 md:max-w-2xl"
			>
				{last ? (
					<ReviewBody
						key={opens}
						paragraphId={last.paragraphId}
						locked={locked}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
