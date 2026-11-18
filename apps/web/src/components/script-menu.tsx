"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@tts-pilot-app/ui/components/dropdown-menu";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import {
	ArrowRight,
	ChevronDown,
	FilePlus,
	FileText,
	FolderOpen,
	Save,
} from "lucide-react";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { SCRIPT_TEXT } from "@/lib/script-text";
import { clipTitle, dirtyOf, fingerprintOf } from "@/lib/script-work";
import { orpc } from "@/utils/orpc";

import { focusText } from "./paragraph-focus";
import { useWork } from "./paragraph-provider";
import { ConflictDialog, GoneDialog, sendSave } from "./script-guard-dialogs";
import {
	fetchScript,
	ScriptInsertDialog,
	useScriptInsert,
} from "./script-insert-dialog";
import { ScriptOpener } from "./script-opener";
import { ScriptSaveDialog } from "./script-save-dialog";
import { conditionButton, menuItem } from "./voice-conditions";

type Open =
	| { kind: "new"; title?: string }
	| { kind: "insert"; scriptId?: string }
	| { kind: "conflict"; title: string }
	| { kind: "gone"; title: string }
	| null;

// 항목 하나: 막히면 둘째 줄이 이유(프리셋 메뉴의 두 줄 항목과 같다)
function Reason({ children, label }: { children: string; label: string }) {
	return (
		<span className="flex min-w-0 flex-col items-start gap-0.5">
			<span className="max-w-full truncate">{label}</span>
			<span className="max-w-full truncate text-muted-foreground text-sm">
				{children}
			</span>
		</span>
	);
}

// 머리의 '대본' 메뉴(브리프 18.1). 연결된 대본의 제목과 저장 안 됨 점을 버튼 안에 보이고,
// 저장·새 대본으로 저장·보관함에서 넣기·보관함 링크를 모은다. 창은 모두 이 메뉴 버튼으로 포커스를 돌려준다.
// 주소의 `?script=`(보관함 '열기')도 여기서 받는다(ScriptOpener, 같은 창 상태를 쓴다)
export function ScriptMenu() {
	const work = useWork();
	const { replace } = useScriptInsert();
	const queryClient = useQueryClient();
	const triggerRef = useRef<HTMLButtonElement>(null);
	const savingRef = useRef(false);
	const [open, setOpen] = useState<Open>(null);
	const [saving, setSaving] = useState(false);
	const [overwriteFailed, setOverwriteFailed] = useState(false);
	const { linked, dirty, saveBlocked } = work;
	// 저장 응답이 올 때 지금 연결을 보려고 최신 값을 둔다(클로저의 work.linked는 저장을 시작할 때 값이다)
	const linkedRef = useRef(linked);
	useEffect(() => {
		linkedRef.current = linked;
	}, [linked]);
	// 메뉴를 열 때 한 번 계산한 '저장 안 됨'(C7): 열려 있는 동안 글자를 고칠 수 없다
	const [dirtyAtOpen, setDirtyAtOpen] = useState(false);
	const blockedText = saveBlocked
		? saveBlocked === "empty"
			? SCRIPT_TEXT.needText
			: SCRIPT_TEXT.blocked[saveBlocked]
		: null;

	// 주소로 열기(브리프 18.3). 지금 작업이 비었고 저장 안 됨도 아니면 창 없이 바꾸고 알림만, 아니면 2단계 창을 연다
	function openFromAddress(id: string) {
		const snap = work.snapshot();
		if (
			snap.paragraphs.every((p) => p.text.trim() === "") &&
			!dirtyOf(snap, work.linked)
		) {
			void fetchScript(id).then((script) => {
				if (script === null || script === "gone") {
					toast.error(
						script === "gone" ? SCRIPT_TEXT.gone : SCRIPT_TEXT.openFailed,
					);
					return;
				}
				const first = replace(script);
				if (first) requestAnimationFrame(() => focusText(first));
			});
			return;
		}
		setOpen({ kind: "insert", scriptId: id });
	}

	function save(force: boolean) {
		const link = work.linked;
		if (!link || savingRef.current) return;
		const snap = work.snapshot();
		savingRef.current = true;
		setSaving(true);
		setOverwriteFailed(false);
		void sendSave(link, snap, force)
			.then((sent) => {
				const now = linkedRef.current;
				// 저장하는 사이 연결이 바뀌었다(다른 대본을 열었다): 결과는 그 연결에 적용하지 않고 목록만 새로 고친다
				if (now?.scriptId !== link.scriptId || now.version !== link.version) {
					void queryClient.invalidateQueries({
						queryKey: orpc.scriptList.key(),
					});
					return;
				}
				if (sent.ok) {
					work.markSaved({
						...link,
						version: sent.version,
						fingerprint: fingerprintOf(snap),
					});
					void queryClient.invalidateQueries({
						queryKey: orpc.scriptList.key(),
					});
					toast.success(SCRIPT_TEXT.savedIn(link.title));
					setOpen(null);
				} else if (sent.reason === "stale") {
					setOpen({ kind: "conflict", title: link.title });
				} else if (sent.reason === "gone") {
					// 연결을 비우고(메뉴 버튼이 '대본'으로) 지워진 대본 창을 연다
					work.clearLinked();
					void queryClient.invalidateQueries({
						queryKey: orpc.scriptList.key(),
					});
					setOpen({ kind: "gone", title: link.title });
				} else if (force) {
					setOverwriteFailed(true);
				} else {
					toast.error(SCRIPT_TEXT.saveFailed);
				}
			})
			.finally(() => {
				savingRef.current = false;
				setSaving(false);
			});
	}

	return (
		<>
			<DropdownMenu
				onOpenChange={(next) => {
					if (next) setDirtyAtOpen(dirtyOf(work.snapshot(), work.linked));
				}}
			>
				<DropdownMenuTrigger
					disabled={!work.restored}
					render={
						<Button
							ref={triggerRef}
							variant="outline"
							size="lg"
							title={linked?.title}
							aria-label={
								linked ? SCRIPT_TEXT.menuLabel(linked.title, dirty) : undefined
							}
							className={cn(conditionButton(0), "max-w-full")}
						/>
					}
				>
					<FileText data-icon="inline-start" aria-hidden="true" />
					{linked ? (
						<>
							{/* 1단(56rem 미만)은 앞 12자, 넓으면 24자. 전체는 title 속성 */}
							<span className="@4xl:hidden break-keep">
								{clipTitle(linked.title, 12)}
							</span>
							<span className="@4xl:inline hidden break-keep">
								{clipTitle(linked.title, 24)}
							</span>
						</>
					) : (
						SCRIPT_TEXT.menu
					)}
					{linked && dirty ? (
						<>
							<span
								aria-hidden="true"
								className="size-2 shrink-0 rounded-full bg-warning"
							/>
							<span className="sr-only">{SCRIPT_TEXT.dirty}</span>
						</>
					) : null}
					<ChevronDown data-icon="inline-end" aria-hidden="true" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-72 p-1">
					{linked ? (
						<DropdownMenuItem
							className={menuItem}
							disabled={!dirtyAtOpen || saveBlocked !== null || saving}
							onClick={() => save(false)}
						>
							<Save aria-hidden="true" />
							{blockedText ? (
								<Reason label={SCRIPT_TEXT.save}>{blockedText}</Reason>
							) : (
								<>
									{SCRIPT_TEXT.save}
									{dirtyAtOpen ? null : (
										<span className="ml-auto text-muted-foreground text-sm">
											{SCRIPT_TEXT.saved}
										</span>
									)}
								</>
							)}
						</DropdownMenuItem>
					) : null}
					<DropdownMenuItem
						className={menuItem}
						disabled={saveBlocked !== null || saving}
						onClick={() => setOpen({ kind: "new" })}
					>
						<FilePlus aria-hidden="true" />
						{blockedText ? (
							<Reason label={SCRIPT_TEXT.saveNew}>{blockedText}</Reason>
						) : (
							SCRIPT_TEXT.saveNew
						)}
					</DropdownMenuItem>
					<DropdownMenuItem
						className={menuItem}
						disabled={saving}
						onClick={() => setOpen({ kind: "insert" })}
					>
						<FolderOpen aria-hidden="true" />
						{SCRIPT_TEXT.insert}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className={menuItem}
						render={<Link href="/scripts" />}
					>
						{SCRIPT_TEXT.libraryLink}
						<ArrowRight className="ml-auto" aria-hidden="true" />
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			{open?.kind === "new" ? (
				<ScriptSaveDialog
					initialTitle={open.title}
					openerRef={triggerRef}
					onClose={() => setOpen(null)}
				/>
			) : null}
			{open?.kind === "insert" ? (
				<ScriptInsertDialog
					scriptId={open.scriptId}
					openerRef={triggerRef}
					onClose={() => setOpen(null)}
					// 저장하고 바꾸기가 막혔다: 바꾸기는 하지 않고 그 창을 연다(브리프 18.4)
					onBlocked={(reason, title) =>
						setOpen({ kind: reason === "stale" ? "conflict" : "gone", title })
					}
				/>
			) : null}
			<Suspense fallback={null}>
				<ScriptOpener onOpen={openFromAddress} />
			</Suspense>
			{open?.kind === "conflict" ? (
				<ConflictDialog
					title={open.title}
					pending={saving}
					failed={overwriteFailed}
					openerRef={triggerRef}
					onSaveAsNew={() =>
						setOpen({
							kind: "new",
							// 제목 100자 안에 '사본'이 들어가게 긴 제목은 앞을 자른다
							title: SCRIPT_TEXT.copyTitle(
								[...open.title].slice(0, 96).join(""),
							),
						})
					}
					onOverwrite={() => save(true)}
					onCancel={() => {
						setOverwriteFailed(false);
						setOpen(null);
					}}
				/>
			) : null}
			{open?.kind === "gone" ? (
				<GoneDialog
					title={open.title}
					openerRef={triggerRef}
					// 지워졌으니 같은 제목이 비어 있다. 제목을 그대로 처음 값으로
					onSaveAsNew={() => setOpen({ kind: "new", title: open.title })}
					onCancel={() => setOpen(null)}
				/>
			) : null}
		</>
	);
}
