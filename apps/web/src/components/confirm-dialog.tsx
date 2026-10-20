"use client";

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
import { type ReactNode, type RefObject, useRef, useState } from "react";
import { toast } from "sonner";

import { MESSAGES, saveFailure } from "@/lib/classes-view";

type Handlers = {
	onSuccess: () => void;
	onError: (error: unknown) => void;
	onSettled: () => void;
};

// 지우기·빼기 확인(T6 스펙 4절, T7 계획 리뷰 D15). 열 때만 마운트된다. 첫 포커스는 '취소'.
// 처리됐거나(성공) 이미 없으면(NOT_FOUND) 알리고 닫은 뒤 포커스를 focusAfterDone으로, 취소면 연 버튼으로 돌린다.
// 실패하면 창을 닫지 않고 이유를 보이며 포커스를 '취소'로 둔다('취소'는 막지 않는다, 계획 리뷰 E4).
// AlertDialogAction은 Close가 아닌 Button이라 눌러도 닫히지 않는다(packages/ui alert-dialog.tsx)
export function ConfirmDialog({
	title,
	description,
	action,
	pendingText,
	failedText,
	doneText,
	pending,
	send,
	openerRef,
	focusAfterDone,
	onClose,
}: {
	title: string;
	description: ReactNode;
	action: string;
	// 진행 중은 버튼 스피너로만 보이므로 보조기기에 따로 알린다(audit P2)
	pendingText: string;
	failedText: string;
	doneText: string;
	pending: boolean;
	// 변경을 한 번 보낸다(mutation.mutate에 handlers를 넘긴다)
	send: (handlers: Handlers) => void;
	openerRef: RefObject<HTMLButtonElement | null>;
	focusAfterDone: () => HTMLElement | null;
	// done: 처리됐거나 이미 없어서 닫는다(취소면 false)
	onClose: (done: boolean) => void;
}) {
	const cancelRef = useRef<HTMLButtonElement>(null);
	const sendingRef = useRef(false);
	const doneRef = useRef(false);
	const [failed, setFailed] = useState(false);

	function confirm() {
		if (sendingRef.current) return;
		sendingRef.current = true;
		setFailed(false);
		send({
			onSuccess: () => {
				doneRef.current = true;
				toast.success(doneText);
				onClose(true);
			},
			onError: (error) => {
				if (saveFailure(error) === "not_found") {
					doneRef.current = true;
					toast.error(MESSAGES.notFound);
					onClose(true);
					return;
				}
				setFailed(true);
				cancelRef.current?.focus();
			},
			onSettled: () => {
				sendingRef.current = false;
			},
		});
	}

	return (
		<AlertDialog
			open
			onOpenChange={(open) => {
				if (!open && !pending) onClose(false);
			}}
		>
			<AlertDialogContent
				initialFocus={cancelRef}
				finalFocus={() =>
					(doneRef.current ? focusAfterDone() : openerRef.current) ?? true
				}
			>
				<AlertDialogHeader>
					<AlertDialogTitle className="wrap-anywhere">{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				{failed ? (
					<p role="alert" className="text-sm text-warning">
						{failedText}
					</p>
				) : null}
				<p role="status" className="sr-only">
					{pending ? pendingText : ""}
				</p>
				<AlertDialogFooter>
					<AlertDialogCancel ref={cancelRef} size="lg">
						취소
					</AlertDialogCancel>
					<AlertDialogAction
						size="lg"
						variant="destructive"
						disabled={pending}
						focusableWhenDisabled
						onClick={confirm}
					>
						{pending ? (
							<Spinner data-icon="inline-start" aria-hidden="true" />
						) : null}
						{action}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
