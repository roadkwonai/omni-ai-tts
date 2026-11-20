"use client";

import {
	keepPreviousData,
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { cleanText } from "@tts-pilot-app/api/classification-rules";
import { codePoints } from "@tts-pilot-app/api/providers/trial-options";
import type { ScriptSummary } from "@tts-pilot-app/api/script-contract";
import { SCRIPT_TITLE_MAX } from "@tts-pilot-app/api/script-rules";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button, buttonVariants } from "@tts-pilot-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tts-pilot-app/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@tts-pilot-app/ui/components/dropdown-menu";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import { Toggle } from "@tts-pilot-app/ui/components/toggle";
import { ToggleGroup } from "@tts-pilot-app/ui/components/toggle-group";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import {
	ArrowRight,
	BookmarkPlus,
	Copy,
	Ellipsis,
	Pencil,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
	memo,
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";

import {
	byName,
	emptyMessage,
	GROUP_TEXT,
	type Group,
	groupLists,
	type Named,
	neighborId,
	saveFailure,
} from "@/lib/classes-view";
import {
	EMPTY_SCRIPT_FILTERS,
	hasScriptFilters,
	listInputOf,
	queryFromScriptFilters,
	recentTitle,
	type ScriptFilters,
	type ScriptView,
	sameIds,
	scriptFiltersFromQuery,
	whenLabel,
} from "@/lib/script-library-view";
import { SCRIPT_TEXT } from "@/lib/script-text";
import { firstSentenceTitle } from "@/lib/script-work";
import { failureOf } from "@/lib/voice-failure";
import { client, orpc, QUIET } from "@/utils/orpc";
import {
	DIALOG_BODY,
	DialogButtons,
	isComposingEnter,
} from "./class-form-dialog";
import { boxClass } from "./class-group";
import { ConfirmDialog } from "./confirm-dialog";
import { EmptyState } from "./empty-state";
import { SignInNotice } from "./notice";
import { useClassLists } from "./saved-voices";
import { ScriptFields } from "./script-save-dialog";
import { type AxisView, menuItem, VoiceConditions } from "./voice-conditions";
import { ReloadButton, ReloadRow } from "./voice-problem";

const SEARCH_DELAY_MS = 300;
type Cursor = { at: string; id: string };

// 보관함 화면과 '보관함에서 넣기' 창(Task 6)이 함께 쓰는 목록. 키에 조건이 들어가 조건마다 쿼리가 따로 있다.
// 목록 응답에는 작업 JSON(work)이 없다(서버가 보장). 화면이 오류를 직접 보이므로 QUIET이다
// 돌려주는 sentinelRef를 목록 끝 감시 줄에 달면 줄이 root(없으면 화면) 안으로 들어올 때 다음 30개를 받는다. 오류가 나면 멈추고 '다시 불러오기'를 기다린다
export function useScriptList(
	kind: ScriptView,
	filters: ScriptFilters,
	{
		root,
		rootMargin = "400px",
	}: { root?: RefObject<HTMLElement | null>; rootMargin?: string } = {},
) {
	const sentinelRef = useRef<HTMLDivElement>(null);
	const query = useInfiniteQuery({
		...orpc.scriptList.infiniteOptions({
			input: (cursor: Cursor | null) => ({
				...listInputOf(kind, filters),
				...(cursor ? { cursor } : {}),
			}),
			initialPageParam: null as Cursor | null,
			getNextPageParam: (last) => last.next,
			placeholderData: keepPreviousData,
			...QUIET,
		}),
	});
	const items = query.data?.pages.flatMap((page) => page.items) ?? [];
	const { hasNextPage, isFetchingNextPage, isFetchNextPageError } = query;
	const { fetchNextPage } = query;
	useEffect(() => {
		const node = sentinelRef.current;
		if (!node || !hasNextPage || isFetchingNextPage || isFetchNextPageError)
			return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) void fetchNextPage();
			},
			{ root: root?.current ?? null, rootMargin },
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, [
		hasNextPage,
		isFetchingNextPage,
		isFetchNextPageError,
		fetchNextPage,
		root,
		rootMargin,
	]);
	return { query, items, sentinelRef };
}

// 첫 불러오기 자리 표시 세 줄(높이·모서리만 다르다)
export function LoadingRows({ className }: { className: string }) {
	return (
		<div aria-busy="true" className="flex flex-col gap-2">
			{[0, 1, 2].map((n) => (
				<Skeleton key={n} aria-hidden="true" className={className} />
			))}
			<span className="sr-only" role="status">
				{SCRIPT_TEXT.loadingList}
			</span>
		</div>
	);
}

const openButtonId = (id: string) => `script-${id}-open`;
const viewId = (view: ScriptView) => `script-view-${view}`;
const viewItem =
	"min-h-11 shrink-0 px-3 md:px-4 text-muted-foreground focus-visible:z-10 data-pressed:bg-card data-pressed:font-bold data-pressed:text-foreground data-pressed:ring-1 data-pressed:ring-border";

// 주소에 쓴다. App Router가 useSearchParams와 맞춘다(번들 문서 linking-and-navigating 'Native History API')
function writeQuery(filters: ScriptFilters & { view: ScriptView }) {
	const query = queryFromScriptFilters(filters);
	window.history.replaceState(
		null,
		"",
		query ? `/scripts?${query}` : "/scripts",
	);
}

export function ScriptLibrary() {
	const params = useSearchParams();
	const { view, ...raw } = scriptFiltersFromQuery(
		new URLSearchParams(params.toString()),
	);
	const { channels, classes, loaded, failed, retry } = useClassLists();
	const searchRef = useRef<HTMLInputElement>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [query, setQuery] = useState(raw.q);
	// 주소의 검색어가 밖에서 바뀌면(구역 전환, 메뉴로 다시 열기) 칸도 따라간다
	const [seenQ, setSeenQ] = useState(raw.q);
	if (seenQ !== raw.q) {
		setSeenQ(raw.q);
		setQuery(raw.q);
	}
	useEffect(
		() => () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		},
		[],
	);

	// 지워진 채널·분류의 id(옛 링크)는 두 목록이 다 온 뒤 버린다. 버리지 않으면 보이지 않는 조건이 목록을 비운다
	const known = new Set([...channels, ...classes].map((entry) => entry.id));
	const filters: ScriptFilters = loaded
		? {
				...raw,
				channel:
					raw.channel === "none" || (raw.channel && known.has(raw.channel))
						? raw.channel
						: null,
				category: raw.category.filter((id) => known.has(id)),
				type: raw.type.filter((id) => known.has(id)),
			}
		: raw;
	const list = useScriptList(view, filters);

	function commit(next: ScriptFilters, nextView: ScriptView = "saved") {
		if (timerRef.current) clearTimeout(timerRef.current);
		writeQuery({ ...next, view: nextView });
	}
	function change(next: ScriptFilters) {
		commit({ ...next, q: query });
	}
	function onQuery(q: string) {
		setQuery(q);
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(
			() => writeQuery({ ...filters, q, view: "saved" }),
			SEARCH_DELAY_MS,
		);
	}
	function clearAll() {
		setQuery("");
		commit(EMPTY_SCRIPT_FILTERS);
		searchRef.current?.focus();
	}

	if (failureOf(list.query.error) === "unauthorized") return <SignInNotice />;

	const lists = groupLists(channels, classes);
	const axes: AxisView[] = [
		{
			key: "channel",
			label: SCRIPT_TEXT.channelLabel,
			kind: "single",
			emptyLabel: SCRIPT_TEXT.allChannels,
			options: [
				{ value: "none", label: SCRIPT_TEXT.noChannel },
				...byName(lists.channel).map((item) => ({
					value: item.id,
					label: item.name,
				})),
			],
			selected: filters.channel ? [filters.channel] : [],
			onChange: ([value]) => change({ ...filters, channel: value ?? null }),
			countUnknown: true,
		},
		...(["category", "type"] as const).map((group): AxisView => {
			const options = byName(lists[group]).map((item) => ({
				value: item.id,
				label: item.name,
			}));
			const empty = options.length === 0;
			return {
				key: group,
				label: GROUP_TEXT[group].label,
				kind: "multi",
				options,
				selected: filters[group],
				onChange: (ids) => change({ ...filters, [group]: ids }),
				hint: !empty
					? undefined
					: loaded
						? emptyMessage(group)
						: failed
							? SCRIPT_TEXT.classesFailed
							: undefined,
				emptyAction: loaded ? (
					<DropdownMenuItem
						className="min-h-11 rounded-md text-sm"
						render={<Link href="/classes" />}
					>
						채널·분류에서 만들기
					</DropdownMenuItem>
				) : null,
				countUnknown: true,
			};
		}),
	];
	const selectedCount =
		(filters.channel ? 1 : 0) + filters.category.length + filters.type.length;

	return (
		<div className="flex max-w-3xl flex-col gap-4">
			<ToggleGroup
				value={[view]}
				// 하나 고르기. 고른 칸을 다시 눌러 비우는 것은 막는다
				onValueChange={(value) => {
					const next = value[0] as ScriptView | undefined;
					if (!next || next === view) return;
					commit(EMPTY_SCRIPT_FILTERS, next);
					window.scrollTo({ top: 0 });
				}}
				aria-label="보기 구역"
				// 좁은 폭·글자 200%에서 칸이 줄을 바꿔 넘치지 않는다
				className="max-w-full flex-wrap self-start bg-muted p-1"
			>
				<Toggle id={viewId("saved")} value="saved" className={viewItem}>
					{SCRIPT_TEXT.savedSection}
				</Toggle>
				<Toggle id={viewId("recent")} value="recent" className={viewItem}>
					{SCRIPT_TEXT.recentSection}
				</Toggle>
			</ToggleGroup>
			{view === "saved" ? (
				<>
					<VoiceConditions
						label={SCRIPT_TEXT.searchLabel}
						search={{
							value: query,
							placeholder: SCRIPT_TEXT.searchPlaceholder,
							label: SCRIPT_TEXT.searchLabel,
							onChange: onQuery,
							onSubmit: () => commit({ ...filters, q: query }),
						}}
						axes={axes}
						disabled={false}
						selectedCount={selectedCount}
						searchRef={searchRef}
					/>
					{/* 결과가 없을 때는 빈 상태의 '조건 모두 해제' 하나만 둔다 */}
					{hasScriptFilters({ ...filters, q: query }) &&
					!(list.query.isSuccess && list.items.length === 0) ? (
						<Button
							variant="link"
							size="lg"
							className="self-start"
							onClick={clearAll}
						>
							{SCRIPT_TEXT.clearAll}
						</Button>
					) : null}
					{failed ? (
						<div className="flex flex-wrap items-center gap-3">
							<p className="text-sm text-warning">
								{SCRIPT_TEXT.classesFailed}
							</p>
							<ReloadButton reloading={false} onReload={retry} />
						</div>
					) : null}
				</>
			) : null}
			{/* 받은 줄 수만 화면 밖으로 읽는다(검색 결과 수를 세지 않는다) */}
			<p role="status" className="sr-only">
				{list.query.isSuccess && !list.query.isPlaceholderData
					? SCRIPT_TEXT.shown(list.items.length)
					: ""}
			</p>
			<ScriptBody
				view={view}
				list={list}
				filtered={hasScriptFilters({ ...filters, q: query })}
				onClear={clearAll}
				loaded={loaded}
				channelNames={new Map(channels.map((item) => [item.id, item.name]))}
				classes={classes}
			/>
		</div>
	);
}

type List = ReturnType<typeof useScriptList>;
type ClassItem = Named & { kind: "category" | "type" };

// 목록 한 곳: 상태 아홉 가지와 줄 동작·창. 창은 열 때만 마운트하고 연 버튼을 기억한다(프리셋 보드와 같다)
function ScriptBody({
	view,
	list,
	filtered,
	onClear,
	loaded,
	channelNames,
	classes,
}: {
	view: ScriptView;
	list: List;
	filtered: boolean;
	onClear: () => void;
	// 채널·분류 목록이 왔다. 오기 전에는 고치기·보관함에 저장을 잠근다(분류가 빈 채로 저장돼 기존 분류가 지워지지 않게)
	loaded: boolean;
	channelNames: ReadonlyMap<string, string>;
	classes: readonly ClassItem[];
}) {
	const { query, items, sentinelRef } = list;
	const queryClient = useQueryClient();
	const settled = () =>
		void queryClient.invalidateQueries({ queryKey: orpc.scriptList.key() });
	const duplicate = useMutation(
		orpc.scriptDuplicate.mutationOptions({ onSettled: settled }),
	);
	const remove = useMutation(
		orpc.scriptRemove.mutationOptions({ onSettled: settled }),
	);
	const duplicatingRef = useRef(false);
	const openerRef = useRef<HTMLButtonElement | null>(null);
	const nextRef = useRef<string | null>(null);
	const [editing, setEditing] = useState<{
		mode: "edit" | "recent";
		row: ScriptSummary;
	} | null>(null);
	const [removing, setRemoving] = useState<ScriptSummary | null>(null);

	const {
		hasNextPage,
		isFetchingNextPage,
		isFetchNextPageError,
		fetchNextPage,
	} = query;

	// 줄은 memo라 이 셋은 모양이 바뀌지 않게 둔다(목록이 늘어도 기존 줄을 다시 그리지 않는다). 지울 때 다음 줄을 찾는 id 순서는 ref로 읽는다
	const idsRef = useRef<string[]>([]);
	useEffect(() => {
		idsRef.current = items.map((item) => item.id);
	}, [items]);
	const duplicateMutate = duplicate.mutate;
	const askEdit = useCallback(
		(row: ScriptSummary, trigger: HTMLButtonElement | null) => {
			openerRef.current = trigger;
			setEditing({ mode: row.kind === "saved" ? "edit" : "recent", row });
		},
		[],
	);
	const askRemove = useCallback(
		(row: ScriptSummary, trigger: HTMLButtonElement | null) => {
			nextRef.current = neighborId(idsRef.current, row.id);
			openerRef.current = trigger;
			setRemoving(row);
		},
		[],
	);
	const copy = useCallback(
		(row: ScriptSummary) => {
			if (duplicatingRef.current) return;
			duplicatingRef.current = true;
			duplicateMutate(
				{ id: row.id },
				{
					onSettled: () => {
						duplicatingRef.current = false;
					},
					onSuccess: (made) => toast.success(SCRIPT_TEXT.created(made.title)),
					onError: (error) =>
						toast.error(
							saveFailure(error) === "not_found"
								? SCRIPT_TEXT.gone
								: SCRIPT_TEXT.duplicateFailed,
						),
				},
			);
		},
		[duplicateMutate],
	);

	let body: React.ReactNode;
	if (query.isLoadingError)
		body = (
			<ReloadRow
				text={SCRIPT_TEXT.listFailed}
				reloading={query.isFetching}
				onReload={() => void query.refetch()}
			/>
		);
	else if (query.isPending)
		body = <LoadingRows className="h-28 w-full rounded-2xl" />;
	else if (items.length === 0)
		body =
			view === "saved" && filtered ? (
				<div className="flex flex-wrap items-center gap-3">
					<p className="text-muted-foreground text-sm">
						{SCRIPT_TEXT.noMatches}
					</p>
					<Button size="lg" variant="neutral" onClick={onClear}>
						{SCRIPT_TEXT.clearAll}
					</Button>
				</div>
			) : (
				<EmptyState
					art="list"
					title={
						view === "saved" ? SCRIPT_TEXT.emptySaved : SCRIPT_TEXT.emptyRecent
					}
					description={
						view === "saved"
							? SCRIPT_TEXT.emptySavedDetail
							: SCRIPT_TEXT.emptyRecentDetail
					}
				>
					<Link
						href="/studio"
						className={cn(buttonVariants({ variant: "neutral", size: "lg" }))}
					>
						{SCRIPT_TEXT.toStudio}
						<ArrowRight data-icon="inline-end" aria-hidden="true" />
					</Link>
				</EmptyState>
			);
	else
		body = (
			<>
				{view === "recent" ? (
					<p className="text-muted-foreground text-sm">
						{SCRIPT_TEXT.recentNote}
					</p>
				) : null}
				<ul
					className={cn(
						"divide-y overflow-hidden",
						boxClass,
						query.isPlaceholderData && "opacity-60",
					)}
				>
					{items.map((row) => (
						<ScriptRow
							key={row.id}
							row={row}
							channelName={
								row.channelId ? channelNames.get(row.channelId) : undefined
							}
							classes={classes}
							loaded={loaded}
							onEdit={askEdit}
							onCopy={copy}
							onRemove={askRemove}
						/>
					))}
				</ul>
				{/* 끝 감시 줄. '더 보기'는 늘 같은 자리에 둔다(키보드·감시 실패 대비). 다 받으면 둘 다 없다 */}
				{hasNextPage ? (
					<div ref={sentinelRef} className="flex flex-col items-start gap-2">
						{isFetchNextPageError ? (
							<ReloadRow
								text={SCRIPT_TEXT.moreFailed}
								reloading={isFetchingNextPage}
								onReload={() => void fetchNextPage()}
							/>
						) : isFetchingNextPage ? (
							<div aria-busy="true" className="w-full">
								<Skeleton
									aria-hidden="true"
									className="h-11 w-full rounded-lg"
								/>
							</div>
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

	return (
		<section
			aria-label={
				view === "saved" ? SCRIPT_TEXT.savedSection : SCRIPT_TEXT.recentSection
			}
			className="flex flex-col gap-3"
		>
			{body}
			{editing ? (
				<ScriptEditDialog
					mode={editing.mode}
					row={editing.row}
					classes={classes}
					openerRef={openerRef}
					onClose={() => setEditing(null)}
				/>
			) : null}
			{removing ? (
				<ConfirmDialog
					title={
						removing.kind === "saved"
							? SCRIPT_TEXT.removeQuestion(removing.title ?? "")
							: SCRIPT_TEXT.removeRecentQuestion
					}
					description={
						removing.kind === "saved"
							? SCRIPT_TEXT.removeDetail
							: SCRIPT_TEXT.removeRecentDetail
					}
					action={SCRIPT_TEXT.remove}
					pendingText={SCRIPT_TEXT.removing}
					failedText={SCRIPT_TEXT.removeFailed}
					doneText={
						removing.kind === "saved"
							? SCRIPT_TEXT.removed(removing.title ?? "")
							: SCRIPT_TEXT.removedRecent
					}
					pending={remove.isPending}
					send={(handlers) => remove.mutate({ id: removing.id }, handlers)}
					openerRef={openerRef}
					// 다음 줄의 '열기' → 앞 줄 → 구역 전환(neighborId가 다음 줄 우선)
					focusAfterDone={() =>
						(nextRef.current &&
							document.getElementById(openButtonId(nextRef.current))) ||
						document.getElementById(viewId(view))
					}
					onClose={() => setRemoving(null)}
				/>
			) : null}
		</section>
	);
}

// 줄 하나. 줄 전체(글자 칸)가 '작업실에서 열기' 링크이고 고치기·복제·지우기는 링크 밖 형제인 ⋯ 메뉴 하나다(링크 안에 버튼을 넣지 않는다).
// Tab 순서는 줄 링크 → ⋯. 채널·분류 목록이 오기 전(loaded 아님)에는 고치기·보관함에 저장 항목을 잠근다. 줄은 memo라 목록이 늘어도 기존 줄은 다시 그리지 않는다
const ScriptRow = memo(function ScriptRow({
	row,
	channelName,
	classes,
	loaded,
	onEdit,
	onCopy,
	onRemove,
}: {
	row: ScriptSummary;
	channelName: string | undefined;
	classes: readonly ClassItem[];
	loaded: boolean;
	onEdit: (row: ScriptSummary, trigger: HTMLButtonElement | null) => void;
	onCopy: (row: ScriptSummary) => void;
	onRemove: (row: ScriptSummary, trigger: HTMLButtonElement | null) => void;
}) {
	const triggerRef = useRef<HTMLButtonElement>(null);
	const title =
		row.kind === "saved" ? (row.title ?? "") : recentTitle(row.preview);
	const chips = [
		...(channelName ? [SCRIPT_TEXT.channelChip(channelName)] : []),
		...row.classificationIds.flatMap((id) => {
			const found = classes.find((item) => item.id === id);
			return found ? [found.name] : [];
		}),
	];
	return (
		// 긴 목록은 화면 밖 줄을 그리지 않는다(content-visibility)
		<li className="flex items-start [contain-intrinsic-size:auto_136px] [content-visibility:auto]">
			<Link
				id={openButtonId(row.id)}
				href={`/studio?script=${row.id}`}
				aria-label={SCRIPT_TEXT.openLabel(title)}
				className="min-w-0 flex-1 p-4 outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
			>
				<p className="wrap-break-word break-keep font-bold text-base">
					{title}
				</p>
				{row.kind === "saved" ? (
					<p className="mt-1 line-clamp-2 break-keep text-muted-foreground text-sm">
						{row.preview}
					</p>
				) : null}
				<p className="mt-1 text-muted-foreground text-sm tabular-nums">
					{SCRIPT_TEXT.rowMeta(
						row.paragraphCount,
						row.charCount,
						whenLabel(row.updatedAt),
					)}
				</p>
				{row.kind === "saved" && chips.length > 0 ? (
					<div className="mt-2 flex flex-wrap gap-2">
						{chips.map((chip) => (
							<Badge key={chip} variant="secondary">
								{chip}
							</Badge>
						))}
					</div>
				) : null}
			</Link>
			<div className="shrink-0 p-2">
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button
								ref={triggerRef}
								variant="ghost"
								size="icon-lg"
								aria-label={SCRIPT_TEXT.actionsLabel(title)}
								className="text-muted-foreground hover:text-foreground focus-visible:text-foreground aria-expanded:text-foreground"
							/>
						}
					>
						<Ellipsis aria-hidden="true" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-auto min-w-48 p-1">
						<DropdownMenuGroup>
							{row.kind === "saved" ? (
								<>
									<DropdownMenuItem
										className={menuItem}
										disabled={!loaded}
										onClick={() => onEdit(row, triggerRef.current)}
									>
										<Pencil aria-hidden="true" />
										{SCRIPT_TEXT.edit}
									</DropdownMenuItem>
									<DropdownMenuItem
										className={menuItem}
										onClick={() => onCopy(row)}
									>
										<Copy aria-hidden="true" />
										{SCRIPT_TEXT.duplicate}
									</DropdownMenuItem>
								</>
							) : (
								<DropdownMenuItem
									className={menuItem}
									disabled={!loaded}
									onClick={() => onEdit(row, triggerRef.current)}
								>
									<BookmarkPlus aria-hidden="true" />
									{SCRIPT_TEXT.saveToLibrary}
								</DropdownMenuItem>
							)}
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className={menuItem}
								onClick={() => onRemove(row, triggerRef.current)}
							>
								<Trash2 aria-hidden="true" />
								{SCRIPT_TEXT.remove}
							</DropdownMenuItem>
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</li>
	);
});

type Saved =
	| { ok: true; title: string }
	| { ok: false; reason: "duplicate" | "not_found" | "failed" };

// 컴포넌트 밖에 둔다: 컴포넌트 안 try/catch는 React Compiler가 그 컴포넌트를 건너뛴다.
// 고치기는 scriptUpdate, '보관함에 저장'은 최근 대본의 작업을 받아(scriptGet) 새 저장 대본으로 만든다(scriptCreate)
async function saveScript(
	mode: "edit" | "recent",
	id: string,
	values: { title: string; channelId: string | null; ids: string[] },
): Promise<Saved> {
	try {
		if (mode === "edit") {
			await client.scriptUpdate({
				id,
				title: values.title,
				channelId: values.channelId,
				classificationIds: values.ids,
			});
			return { ok: true, title: cleanText(values.title) };
		}
		const { work } = await client.scriptGet({ id });
		const made = await client.scriptCreate({
			title: values.title,
			channelId: values.channelId,
			classificationIds: values.ids,
			work,
		});
		return { ok: true, title: made.title };
	} catch (error) {
		return { ok: false, reason: saveFailure(error) };
	}
}

// 고치기('대본 고치기')와 최근 대본의 '보관함에 저장' 창. 칸은 '새 대본으로 저장' 창과 같다(ScriptFields). 열 때만 마운트된다
function ScriptEditDialog({
	mode,
	row,
	classes,
	openerRef,
	onClose,
}: {
	mode: "edit" | "recent";
	row: ScriptSummary;
	classes: readonly ClassItem[];
	openerRef: RefObject<HTMLElement | null>;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [first] = useState(() => {
		const kindOf = (id: string) => classes.find((item) => item.id === id)?.kind;
		return {
			title:
				row.title ?? firstSentenceTitle([{ text: row.preview }]).slice(0, 100),
			category: row.classificationIds.filter((id) => kindOf(id) === "category"),
			type: row.classificationIds.filter((id) => kindOf(id) === "type"),
		};
	});
	const [title, setTitle] = useState(first.title);
	const [channelId, setChannelId] = useState<string | null>(row.channelId);
	const [category, setCategory] = useState<string[]>(first.category);
	const [type, setType] = useState<string[]>(first.type);
	const [problem, setProblem] = useState<string | null>(null);
	const [failure, setFailure] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const titleRef = useRef<HTMLInputElement>(null);
	const sendingRef = useRef(false);
	const tooLong = codePoints(cleanText(title)) > SCRIPT_TITLE_MAX;

	function toggle(group: Group, entry: Named, on: boolean) {
		const flip = (ids: string[]) =>
			on
				? ids.includes(entry.id)
					? ids
					: [...ids, entry.id]
				: ids.filter((id) => id !== entry.id);
		if (group === "category") setCategory(flip);
		else if (group === "type") setType(flip);
	}

	function submit() {
		if (sendingRef.current) return;
		setFailure(null);
		const cleaned = cleanText(title);
		if (cleaned === "" || tooLong) {
			setProblem(
				cleaned === "" ? SCRIPT_TEXT.titleEmpty : SCRIPT_TEXT.titleTooLong,
			);
			titleRef.current?.focus();
			return;
		}
		sendingRef.current = true;
		setPending(true);
		void saveScript(mode, row.id, {
			title: cleaned,
			channelId,
			ids: [...category, ...type],
		})
			.then((result) => {
				if (result.ok) {
					void queryClient.invalidateQueries({
						queryKey: orpc.scriptList.key(),
					});
					toast.success(
						mode === "edit"
							? SCRIPT_TEXT.edited(result.title)
							: SCRIPT_TEXT.savedAs(result.title),
					);
					onClose();
					return;
				}
				if (result.reason === "duplicate") {
					setProblem(SCRIPT_TEXT.duplicateName);
				} else if (result.reason === "not_found") {
					// 지워진 대본(또는 채널·분류)에 동작: 알리고 목록을 다시 받는다
					void queryClient.invalidateQueries({
						queryKey: orpc.scriptList.key(),
					});
					toast.error(SCRIPT_TEXT.gone);
					onClose();
					return;
				} else {
					setFailure(SCRIPT_TEXT.saveFailed);
				}
				titleRef.current?.focus();
			})
			.finally(() => {
				sendingRef.current = false;
				setPending(false);
			});
	}

	return (
		<Dialog
			open
			// 제목만이 아니라 채널·분류를 바꿨어도 창 밖 클릭으로 닫지 않는다
			disablePointerDismissal={
				title !== first.title ||
				channelId !== row.channelId ||
				!sameIds(category, first.category) ||
				!sameIds(type, first.type)
			}
			onOpenChange={(open) => {
				if (!open && !pending) onClose();
			}}
		>
			<DialogContent
				initialFocus={() => {
					titleRef.current?.select();
					return titleRef.current ?? true;
				}}
				finalFocus={() => openerRef.current ?? true}
				className="md:flex md:max-w-lg md:flex-col"
			>
				<form
					noValidate
					className="flex flex-col gap-5 md:min-h-0"
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
					onKeyDown={(event) => {
						// 한글 조합 Enter와 분류 검색 칸 Enter는 저장이 아니다
						if (
							isComposingEnter(event) ||
							(event.key === "Enter" &&
								event.target instanceof HTMLInputElement &&
								event.target.name === "class-search")
						)
							event.preventDefault();
					}}
				>
					<DialogHeader>
						<DialogTitle className="wrap-anywhere break-keep">
							{mode === "edit"
								? SCRIPT_TEXT.editTitle
								: SCRIPT_TEXT.saveToLibraryTitle}
						</DialogTitle>
						<DialogDescription>
							{mode === "edit"
								? SCRIPT_TEXT.editNote
								: SCRIPT_TEXT.preview(row.paragraphCount, row.charCount)}
						</DialogDescription>
					</DialogHeader>
					<div className={DIALOG_BODY}>
						<ScriptFields
							title={title}
							onTitle={(next) => {
								setTitle(next);
								setProblem(null);
							}}
							problem={problem}
							tooLong={tooLong}
							titleRef={titleRef}
							pending={pending}
							channelId={channelId}
							onChannel={setChannelId}
							category={category}
							type={type}
							onToggle={toggle}
						/>
					</div>
					{failure ? (
						<p role="alert" className="text-sm text-warning">
							{failure}
						</p>
					) : null}
					<p role="status" className="sr-only">
						{pending ? SCRIPT_TEXT.saving : ""}
					</p>
					<DialogButtons
						pending={pending}
						label={SCRIPT_TEXT.saveNow}
						onCancel={onClose}
					/>
				</form>
			</DialogContent>
		</Dialog>
	);
}
