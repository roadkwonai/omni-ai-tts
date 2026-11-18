"use client";

import { ORPCError } from "@orpc/client";
import {
	type QueryClient,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { MyVoice } from "@tts-pilot-app/api/my-voice-contract";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button, buttonVariants } from "@tts-pilot-app/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@tts-pilot-app/ui/components/dropdown-menu";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import {
	BookmarkPlus,
	Ellipsis,
	Loader2,
	Plus,
	Trash2,
	UserRound,
	X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { neighborId } from "@/lib/classes-view";
import { PROVIDER_LABEL } from "@/lib/connection-view";
import { MY_VOICE_TEXT as T } from "@/lib/my-voice-text";
import {
	badgeOf,
	dismissNeedsConfirm,
	type MenuAction,
	menuOf,
	primaryActionOf,
	reasonText,
	rowNoteOf,
} from "@/lib/my-voice-view";
import { failureOf } from "@/lib/voice-failure";
import { client, orpc, QUIET } from "@/utils/orpc";

import { boxClass } from "./class-group";
import { ConfirmDialog } from "./confirm-dialog";
import { DEMO_TEXT, useDemo } from "./demo";
import { CREATE_ID, MyVoiceCreate, ProviderText } from "./my-voice-create";
import { MyVoiceListen } from "./my-voice-listen";
import { Notice, SignInNotice } from "./notice";
import { SamplePlayerProvider } from "./sample-player";
import { savedListKey } from "./saved-voices";
import { menuItem } from "./voice-conditions";
import { lockedButton, ReloadRow } from "./voice-problem";

const primaryId = (id: string) => `my-voice-${id}-primary`;
const menuId = (id: string) => `my-voice-${id}-menu`;

// 지운 뒤 포커스: 다음 줄의 주 동작 → 그 줄의 ⋯ → '만들기'(브리프 6절)
const focusAfterRemove = (nextId: string | null) =>
	(nextId &&
		(document.getElementById(primaryId(nextId)) ??
			document.getElementById(menuId(nextId)))) ||
	document.getElementById(CREATE_ID);

// "11월 18일 만듦"(올해 아니면 연도도). 날짜만 보인다
const madeOn = (iso: string, thisYear: number) => {
	const at = new Date(iso);
	return at.toLocaleDateString("ko-KR", {
		...(at.getFullYear() === thisYear ? {} : { year: "numeric" }),
		month: "long",
		day: "numeric",
	});
};

// 서버가 준 사유를 문구로. 보내는 중인 줄을 지우려는 CONFLICT는 따로 말한다
function failureText(error: unknown, provider: MyVoice["provider"]): string {
	if (error instanceof ORPCError) {
		if (error.code === "CONFLICT") return T.busySending;
		const reason = (error.data as { reason?: unknown } | undefined)?.reason;
		if (typeof reason === "string") return reasonText(reason, provider);
	}
	return T.reasonFallback;
}
// 지우기 실패: 행은 삭제 대기로 남는다
function deleteFailureText(error: unknown): string {
	if (error instanceof ORPCError && error.code === "CONFLICT")
		return T.busySending;
	return failureOf(error) === "rate_limit"
		? T.reasonRateLimit
		: T.reasonDeleting;
}

function refresh(queryClient: QueryClient) {
	void queryClient.invalidateQueries({ queryKey: orpc.myVoiceList.key() });
	void queryClient.invalidateQueries({ queryKey: savedListKey });
	void queryClient.invalidateQueries({ queryKey: orpc.presetList.key() });
}

type Asking = { item: MyVoice; mode: "delete" | "dismiss" };

// 만들기 창의 원본 재생, 들어보기 창, 목록이 오디오 요소 하나를 함께 쓴다(한 번에 한 소리)
// 공개 데모는 만들기·지우기 대신 안내 하나를 보인다(클론은 공급자 계정이 필요하다)
export function MyVoices() {
	if (useDemo())
		return (
			<Notice
				title={DEMO_TEXT.myVoicesTitle}
				description={DEMO_TEXT.myVoicesDescription}
			/>
		);
	return (
		<SamplePlayerProvider>
			<MyVoicesList />
		</SamplePlayerProvider>
	);
}

// Server Component 페이지 안의 목록 한 곳(브리프 5절). 머리 '만들기'는 페이지 머리가 서버 컴포넌트라 본문 맨 위에 둔다
function MyVoicesList() {
	const queryClient = useQueryClient();
	const list = useQuery({ ...orpc.myVoiceList.queryOptions(), ...QUIET });
	const settled = () => refresh(queryClient);
	const check = useMutation(
		orpc.myVoiceCheck.mutationOptions({ onSettled: settled }),
	);
	const remove = useMutation(
		orpc.myVoiceDelete.mutationOptions({ onSettled: settled }),
	);
	const save = useMutation(
		orpc.myVoiceSave.mutationOptions({ onSettled: settled }),
	);
	const [creating, setCreating] = useState(false);
	const [asking, setAsking] = useState<Asking | null>(null);
	const [removeError, setRemoveError] = useState<unknown>(null);
	const [listening, setListening] = useState<{
		name: string;
		voice: Voice;
	} | null>(null);
	const openerRef = useRef<HTMLButtonElement | null>(null);
	const nextRef = useRef<string | null>(null);
	const checkedRef = useRef(false);

	// 페이지를 열 때 처리 중인 줄마다 한 번 공급자에 묻는다(무료, 자동 재시도 없음)
	useEffect(() => {
		if (checkedRef.current || !list.data) return;
		checkedRef.current = true;
		const ids = list.data.items
			.filter((item) => item.status === "processing")
			.map((item) => item.id);
		if (ids.length === 0) return;
		void Promise.allSettled(ids.map((id) => client.myVoiceCheck({ id }))).then(
			() => refresh(queryClient),
		);
	}, [list.data, queryClient]);

	if (failureOf(list.error) === "unauthorized") return <SignInNotice />;

	const items = list.data?.items ?? [];
	// 렌더 중 new Date()는 React Compiler가 캐시한다(교훈 2026-10-21). 올해는 목록을 받은 시각에서 구한다
	const thisYear = new Date(list.dataUpdatedAt).getFullYear();
	const providers = list.data?.providers;
	const noProvider = providers
		? !providers.fish_audio && !providers.gemini
		: false;
	// 진행 중인 줄 하나(확인·지우기·다시 담기)는 그 줄 동작을 잠근다
	const workingId = [check, remove, save].find((m) => m.isPending)?.variables
		?.id;

	function ask(
		item: MyVoice,
		mode: Asking["mode"],
		trigger: HTMLButtonElement | null,
	) {
		nextRef.current = neighborId(
			items.map((entry) => entry.id),
			item.id,
		);
		openerRef.current = trigger;
		setRemoveError(null);
		setAsking({ item, mode });
	}

	// 확인 창 없이 지우는 길(삭제 대기 '다시 시도', 앱 줄만 있는 미확인 치우기)
	function removeNow(item: MyVoice, mode: "delete" | "dismiss") {
		nextRef.current = neighborId(
			items.map((entry) => entry.id),
			item.id,
		);
		remove.mutate(
			{ id: item.id },
			{
				onSuccess: () => {
					toast.success(mode === "delete" ? T.deleted(item.name) : T.dismissed);
					requestAnimationFrame(() =>
						focusAfterRemove(nextRef.current)?.focus(),
					);
				},
				onError: (error) => toast.error(deleteFailureText(error)),
			},
		);
	}

	function run(
		item: MyVoice,
		action: "check" | "listen" | "retryDelete",
		button: HTMLButtonElement,
	) {
		if (action === "listen") {
			if (!item.voice) return;
			openerRef.current = button;
			setListening({ name: item.name, voice: item.voice });
		} else if (action === "check") {
			check.mutate(
				{ id: item.id },
				{
					onSuccess: (next) => {
						if (next.status === "ready") toast.success(T.created(next.name));
						else if (next.status === "processing") toast(T.stillTraining);
					},
					onError: (error) => toast.error(failureText(error, item.provider)),
				},
			);
		} else removeNow(item, "delete");
	}

	function menu(
		item: MyVoice,
		action: MenuAction,
		trigger: HTMLButtonElement | null,
	) {
		if (action === "saveAgain")
			save.mutate(
				{ id: item.id },
				{
					onSuccess: () => toast.success(T.savedToLibrary),
					onError: (error) => toast.error(failureText(error, item.provider)),
				},
			);
		else if (action === "delete") ask(item, "delete", trigger);
		else if (action === "dismiss") {
			if (dismissNeedsConfirm(item)) ask(item, "dismiss", trigger);
			else removeNow(item, "dismiss");
		}
	}

	let body: React.ReactNode;
	if (!list.data && list.errorUpdateCount > 0)
		body = (
			<ReloadRow
				text={T.listError}
				reloading={list.isFetching}
				onReload={() => void list.refetch()}
			/>
		);
	else if (list.isPending)
		body = (
			<div aria-busy="true" className="flex flex-col gap-2">
				{[0, 1].map((n) => (
					<Skeleton
						key={n}
						aria-hidden="true"
						className="h-24 w-full rounded-2xl"
					/>
				))}
				<span className="sr-only" role="status">
					{T.loading}
				</span>
			</div>
		);
	else if (items.length === 0)
		body = noProvider ? null : (
			<Notice title={T.emptyTitle} description={T.emptyDescription} />
		);
	else
		body = (
			<ul className={cn("divide-y overflow-hidden", boxClass)}>
				{items.map((item) => (
					<MyVoiceRow
						key={item.id}
						item={item}
						busy={workingId === item.id}
						thisYear={thisYear}
						onPrimary={run}
						onMenu={menu}
					/>
				))}
			</ul>
		);

	return (
		<div className="flex max-w-3xl flex-col gap-4">
			<Button
				id={CREATE_ID}
				size="lg"
				className={cn("self-start", lockedButton(true))}
				focusableWhenDisabled
				disabled={!providers || noProvider}
				onClick={() => setCreating(true)}
			>
				<Plus data-icon="inline-start" aria-hidden="true" />
				{T.create}
			</Button>
			{noProvider ? (
				<Notice title={T.noProviderTitle}>
					<Link
						href="/connections"
						className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
					>
						{T.viewConnections}
					</Link>
				</Notice>
			) : null}
			<section aria-label={T.title} className="flex flex-col gap-3">
				{body}
			</section>
			{providers ? (
				<MyVoiceCreate
					open={creating}
					onOpenChange={(open) => {
						setCreating(open);
						// 보내는 중에 닫아도 요청은 이어지므로 닫을 때 목록을 다시 받는다
						if (!open) refresh(queryClient);
					}}
					providers={providers}
					onDone={() => refresh(queryClient)}
					onListen={(item) => {
						if (!item.voice) return;
						openerRef.current = null;
						setCreating(false);
						setListening({ name: item.name, voice: item.voice });
					}}
				/>
			) : null}
			{listening ? (
				<MyVoiceListen
					name={listening.name}
					voice={listening.voice}
					openerRef={openerRef}
					onClose={() => setListening(null)}
				/>
			) : null}
			{asking ? (
				<ConfirmDialog
					title={T.deleteTitle(asking.item.name)}
					description={
						<DeleteDescription
							mode={asking.mode}
							provider={asking.item.provider}
							presets={asking.item.presets}
						/>
					}
					action={asking.mode === "delete" ? T.delete : T.dismiss}
					pendingText={T.deletingNow}
					failedText={deleteFailureText(removeError)}
					doneText={
						asking.mode === "delete" ? T.deleted(asking.item.name) : T.dismissed
					}
					pending={remove.isPending}
					send={(handlers) =>
						remove.mutate(
							{ id: asking.item.id },
							{
								...handlers,
								onError: (error) => {
									setRemoveError(error);
									handlers.onError(error);
								},
							},
						)
					}
					openerRef={openerRef}
					focusAfterDone={() => focusAfterRemove(nextRef.current)}
					onClose={() => setAsking(null)}
				/>
			) : null}
		</div>
	);
}

// 지우기 확인 설명. 프리셋 이름은 문장에 묻지 않게 줄 바꾼 목록(말줄임)으로 보인다.
// AlertDialogDescription이 <p>라 ul을 넣을 수 없어 role로 목록을 나타낸다
function DeleteDescription({
	mode,
	provider,
	presets,
}: {
	mode: Asking["mode"];
	provider: MyVoice["provider"];
	presets: readonly string[];
}) {
	const label = PROVIDER_LABEL[provider];
	if (mode === "dismiss")
		return <ProviderText text={T.dismissDescription(label)} name={label} />;
	return (
		<>
			<ProviderText text={T.deleteDescription(label)} name={label} />{" "}
			{presets.length > 0 ? (
				<>
					{T.deletePresets(presets.length)}
					{/* biome-ignore lint/a11y/useSemanticElements: 설명이 <p> 안이라 ul·li를 넣을 수 없다 */}
					<span role="list" className="my-2 flex flex-col gap-1">
						{presets.map((name) => (
							// biome-ignore lint/a11y/useSemanticElements: 위와 같다
							<span
								key={name}
								role="listitem"
								className="truncate font-bold text-foreground"
							>
								‘{name}’
							</span>
						))}
					</span>
				</>
			) : null}
			{T.deleteKeepsResults}
		</>
	);
}

const MENU_ICON: Record<MenuAction, typeof Trash2> = {
	openLibrary: UserRound,
	saveAgain: BookmarkPlus,
	delete: Trash2,
	dismiss: X,
};
const MENU_TEXT: Record<MenuAction, string> = {
	openLibrary: T.openLibrary,
	saveAgain: T.saveAgain,
	delete: T.delete,
	dismiss: T.dismiss,
};

// 줄 하나. 줄 전체를 누르는 동작은 없다. 주 동작 → ⋯ 순서이고 640px 미만은 글자 칸 아래 오른쪽에 둔다.
// 보내는 중·삭제 대기 줄은 ⋯가 없다(지우기 잠금)
function MyVoiceRow({
	item,
	busy,
	thisYear,
	onPrimary,
	onMenu,
}: {
	item: MyVoice;
	busy: boolean;
	thisYear: number;
	onPrimary: (
		item: MyVoice,
		action: "check" | "listen" | "retryDelete",
		button: HTMLButtonElement,
	) => void;
	onMenu: (
		item: MyVoice,
		action: MenuAction,
		trigger: HTMLButtonElement | null,
	) => void;
}) {
	const triggerRef = useRef<HTMLButtonElement>(null);
	const badge = badgeOf(item.status);
	const note = rowNoteOf(item);
	const primary = primaryActionOf(item);
	const actions = menuOf(item);
	return (
		<li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4">
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
					<p className="wrap-break-word break-keep font-bold text-base">
						{item.name}
					</p>
					<Badge variant={badge.tone === "warning" ? "warning" : "secondary"}>
						{badge.busy ? (
							<Loader2 data-icon="inline-start" aria-hidden="true" />
						) : null}
						{badge.label}
					</Badge>
				</div>
				<p className="mt-1 text-muted-foreground text-sm">
					<ProviderText
						text={T.rowMeta(
							PROVIDER_LABEL[item.provider],
							madeOn(item.createdAt, thisYear),
							item.presets.length,
						)}
						name={PROVIDER_LABEL[item.provider]}
					/>
				</p>
				{note ? (
					<p className="mt-1 text-sm text-warning">
						<ProviderText text={note} name={PROVIDER_LABEL[item.provider]} />
					</p>
				) : null}
			</div>
			{primary || actions.length > 0 ? (
				<div className="flex shrink-0 items-center justify-end gap-1">
					{primary ? (
						<Button
							id={primaryId(item.id)}
							variant="neutral"
							size="lg"
							focusableWhenDisabled
							disabled={busy}
							aria-busy={busy || undefined}
							className={lockedButton(false)}
							onClick={(event) => onPrimary(item, primary, event.currentTarget)}
						>
							{busy ? (
								<Spinner data-icon="inline-start" aria-hidden="true" />
							) : null}
							{T[primary]}
						</Button>
					) : null}
					{actions.length > 0 ? (
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button
										id={menuId(item.id)}
										ref={triggerRef}
										variant="ghost"
										size="icon-lg"
										focusableWhenDisabled
										disabled={busy}
										aria-label={T.rowActions(item.name)}
										className={cn(
											"text-muted-foreground hover:text-foreground focus-visible:text-foreground aria-expanded:text-foreground",
											// 진행 중 표시는 주 동작의 스피너가 맡고 ⋯는 그냥 잠긴 것이라 흐리게 한다
											lockedButton(true),
										)}
									/>
								}
							>
								<Ellipsis aria-hidden="true" />
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-auto min-w-48 p-1">
								<DropdownMenuGroup>
									{actions.map((action, index) => {
										const Icon = MENU_ICON[action];
										return (
											<MenuEntry
												key={action}
												separated={index > 0 && action === "delete"}
												item={item}
												action={action}
												icon={<Icon aria-hidden="true" />}
												onMenu={() => onMenu(item, action, triggerRef.current)}
											/>
										);
									})}
								</DropdownMenuGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					) : null}
				</div>
			) : null}
		</li>
	);
}

// '성우 보관함에서 보기'는 보관함의 공급자·이름 조건 주소로 가는 링크, 나머지는 동작
function MenuEntry({
	item,
	action,
	icon,
	separated,
	onMenu,
}: {
	item: MyVoice;
	action: MenuAction;
	icon: React.ReactNode;
	separated: boolean;
	onMenu: () => void;
}) {
	return (
		<>
			{separated ? <DropdownMenuSeparator /> : null}
			{action === "openLibrary" ? (
				<DropdownMenuItem
					className={menuItem}
					render={
						<Link
							href={{
								pathname: "/voices",
								query: { provider: item.provider, q: item.name },
							}}
						/>
					}
				>
					{icon}
					{MENU_TEXT[action]}
				</DropdownMenuItem>
			) : (
				<DropdownMenuItem className={menuItem} onClick={onMenu}>
					{icon}
					{MENU_TEXT[action]}
				</DropdownMenuItem>
			)}
		</>
	);
}
