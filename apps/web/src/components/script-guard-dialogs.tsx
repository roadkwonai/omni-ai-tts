"use client";

import { ORPCError } from "@orpc/client";
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
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { type RefObject, useRef } from "react";

import type { LinkedScript, Work } from "@/lib/paragraph-script";
import { SCRIPT_TEXT } from "@/lib/script-text";
import { toScriptWork } from "@/lib/script-work";
import { client } from "@/utils/orpc";

// 저장이 막혔을 때 묻는 창들(브리프 18.5). 둘 다 열 때만 마운트되고 처음 포커스는 '취소'다.
// 닫히면 '대본' 메뉴 버튼(openerRef)으로 돌아간다. 새 대본 창으로 넘어가면 그 창이 포커스를 이어받는다.

export type Sent =
	| { ok: true; version: number }
	| { ok: false; reason: "stale" | "gone" | "failed" };

// 판 조건 저장(스펙 4.4). 메뉴의 '저장'과 미저장 경고의 '저장하고 바꾸기'가 함께 쓴다. 컴포넌트 밖에 둔다: 컴포넌트 안 try/catch는 React Compiler가 그 컴포넌트를 건너뛴다.
// scriptSave의 CONFLICT는 stale 하나뿐이고, NOT_FOUND는 없음·최근 대본·남의 것(구분하지 않는다)
export async function sendSave(
	link: LinkedScript,
	snap: Work,
	force: boolean,
): Promise<Sent> {
	try {
		const out = await client.scriptSave({
			id: link.scriptId,
			version: link.version,
			...(force ? { force: true } : {}),
			channelId: snap.channelId,
			work: toScriptWork(snap),
		});
		return { ok: true, version: out.version };
	} catch (error) {
		if (error instanceof ORPCError) {
			if (error.code === "CONFLICT") return { ok: false, reason: "stale" };
			if (error.code === "NOT_FOUND") return { ok: false, reason: "gone" };
		}
		return { ok: false, reason: "failed" };
	}
}

// 다른 곳에서 먼저 저장했다(CONFLICT stale). 덮어쓰기는 서버 호출이라 진행 중에는 닫히지 않고, 실패하면 창에 이유가 남는다
export function ConflictDialog({
	title,
	pending,
	failed,
	openerRef,
	onSaveAsNew,
	onOverwrite,
	onCancel,
}: {
	title: string;
	pending: boolean;
	failed: boolean;
	openerRef: RefObject<HTMLElement | null>;
	onSaveAsNew: () => void;
	onOverwrite: () => void;
	onCancel: () => void;
}) {
	const cancelRef = useRef<HTMLButtonElement>(null);
	return (
		<AlertDialog
			open
			onOpenChange={(open) => {
				if (!open && !pending) onCancel();
			}}
		>
			<AlertDialogContent
				initialFocus={cancelRef}
				finalFocus={() => openerRef.current ?? true}
			>
				<AlertDialogHeader>
					<AlertDialogTitle className="wrap-anywhere break-keep">
						{SCRIPT_TEXT.conflictTitle}
					</AlertDialogTitle>
					<AlertDialogDescription className="wrap-anywhere">
						{SCRIPT_TEXT.conflictDescription(title)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				{failed ? (
					<p role="alert" className="text-sm text-warning">
						{SCRIPT_TEXT.saveFailed}
					</p>
				) : null}
				<p role="status" className="sr-only">
					{pending ? SCRIPT_TEXT.saving : ""}
				</p>
				{/* 오른쪽부터 채운 주 버튼 → 덮어쓰기 → 취소. DOM은 반대라 Tab은 취소부터 */}
				<AlertDialogFooter>
					<AlertDialogCancel ref={cancelRef} size="lg" disabled={pending}>
						{SCRIPT_TEXT.cancel}
					</AlertDialogCancel>
					<AlertDialogAction
						size="lg"
						variant="neutral"
						className="text-destructive"
						disabled={pending}
						focusableWhenDisabled
						onClick={onOverwrite}
					>
						{pending ? (
							<Spinner data-icon="inline-start" aria-hidden="true" />
						) : null}
						{SCRIPT_TEXT.overwrite}
					</AlertDialogAction>
					<AlertDialogAction
						size="lg"
						disabled={pending}
						focusableWhenDisabled
						onClick={onSaveAsNew}
					>
						{SCRIPT_TEXT.saveAsNew}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

// 연결된 대본이 보관함에서 지워졌다(NOT_FOUND). 연결은 열기 전에 이미 비웠다
export function GoneDialog({
	title,
	openerRef,
	onSaveAsNew,
	onCancel,
}: {
	title: string;
	openerRef: RefObject<HTMLElement | null>;
	onSaveAsNew: () => void;
	onCancel: () => void;
}) {
	const cancelRef = useRef<HTMLButtonElement>(null);
	return (
		<AlertDialog
			open
			onOpenChange={(open) => {
				if (!open) onCancel();
			}}
		>
			<AlertDialogContent
				initialFocus={cancelRef}
				finalFocus={() => openerRef.current ?? true}
			>
				<AlertDialogHeader>
					<AlertDialogTitle className="wrap-anywhere break-keep">
						{SCRIPT_TEXT.goneTitle}
					</AlertDialogTitle>
					<AlertDialogDescription className="wrap-anywhere">
						{SCRIPT_TEXT.goneDescription(title)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel ref={cancelRef} size="lg">
						{SCRIPT_TEXT.cancel}
					</AlertDialogCancel>
					<AlertDialogAction size="lg" onClick={onSaveAsNew}>
						{SCRIPT_TEXT.saveAsNew}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

// 바꾸기를 눌렀는데 지금 작업이 연결된 대본과 다르다(브리프 18.4). 넣기 창 위에 뜨고 처음 포커스는 '취소'다.
// 저장은 서버 호출이라 진행 중에는 닫히지 않고, 실패하면 창에 이유가 남는다. 닫히면 포커스는 넣기 창으로 돌아간다(Base UI 기본)
export function DirtyDialog({
	title,
	pending,
	failed,
	onSaveThenReplace,
	onReplace,
	onCancel,
}: {
	title: string;
	pending: boolean;
	failed: boolean;
	onSaveThenReplace: () => void;
	onReplace: () => void;
	onCancel: () => void;
}) {
	const cancelRef = useRef<HTMLButtonElement>(null);
	return (
		<AlertDialog
			open
			onOpenChange={(open) => {
				if (!open && !pending) onCancel();
			}}
		>
			<AlertDialogContent initialFocus={cancelRef}>
				<AlertDialogHeader>
					<AlertDialogTitle className="wrap-anywhere break-keep">
						{SCRIPT_TEXT.dirtyTitle(title)}
					</AlertDialogTitle>
					<AlertDialogDescription className="wrap-anywhere">
						{SCRIPT_TEXT.dirtyDescription}
					</AlertDialogDescription>
				</AlertDialogHeader>
				{failed ? (
					<p role="alert" className="text-sm text-warning">
						{SCRIPT_TEXT.saveFailed}
					</p>
				) : null}
				<p role="status" className="sr-only">
					{pending ? SCRIPT_TEXT.saving : ""}
				</p>
				{/* 오른쪽부터 채운 주 버튼 → neutral → 취소. DOM은 반대라 Tab은 취소부터 */}
				<AlertDialogFooter>
					<AlertDialogCancel ref={cancelRef} size="lg" disabled={pending}>
						{SCRIPT_TEXT.cancel}
					</AlertDialogCancel>
					<AlertDialogAction
						size="lg"
						variant="neutral"
						disabled={pending}
						focusableWhenDisabled
						onClick={onReplace}
					>
						{SCRIPT_TEXT.replaceWithoutSaving}
					</AlertDialogAction>
					<AlertDialogAction
						size="lg"
						disabled={pending}
						focusableWhenDisabled
						onClick={onSaveThenReplace}
					>
						{pending ? (
							<Spinner data-icon="inline-start" aria-hidden="true" />
						) : null}
						{SCRIPT_TEXT.saveThenReplace}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
