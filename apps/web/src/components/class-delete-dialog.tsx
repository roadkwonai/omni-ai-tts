"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { type RefObject, useRef, useState } from "react";
import { toast } from "sonner";

import {
	deleteDetail,
	deleteQuestion,
	doneMessage,
	type Group,
	MESSAGES,
	saveFailure,
} from "@/lib/classes-view";
import { client } from "@/utils/orpc";
import { listKey } from "./class-form-dialog";
import type { ClassItem } from "./class-group";

// 삭제 확인(스펙 4절). 열 때만 마운트된다. 첫 포커스는 '취소'.
// 지운 뒤·없어진 항목이면 포커스를 다음 행 → 이전 행 → '만들기'로(사용자 결정 2026-10-06), 취소면 연 버튼으로 돌린다.
// 실패하면 창을 닫지 않고 이유를 보이며 포커스를 '취소'로 둔다('취소'는 막지 않는다, 계획 리뷰 E4). 처리됐을 수 있으므로 목록은 늘 다시 받는다.
// AlertDialogAction은 Close가 아닌 Button이라 눌러도 닫히지 않는다(packages/ui alert-dialog.tsx)
export function ClassDeleteDialog({
	group,
	item,
	openerRef,
	focusAfterDelete,
	onClose,
}: {
	group: Group;
	item: ClassItem;
	openerRef: RefObject<HTMLButtonElement | null>;
	focusAfterDelete: () => HTMLElement | null;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const cancelRef = useRef<HTMLButtonElement>(null);
	const sendingRef = useRef(false);
	const doneRef = useRef(false);
	const [failed, setFailed] = useState(false);
	const remove = useMutation({
		mutationFn: () =>
			group === "channel"
				? client.channelDelete({ id: item.id })
				: client.classificationDelete({ id: item.id }),
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: listKey(group) }),
	});

	function confirm() {
		if (sendingRef.current) return;
		sendingRef.current = true;
		setFailed(false);
		remove.mutate(undefined, {
			onSuccess: () => {
				doneRef.current = true;
				toast.success(doneMessage(group, item.name, "delete"));
				onClose();
			},
			onError: (error) => {
				if (saveFailure(error) === "not_found") {
					doneRef.current = true;
					toast.error(MESSAGES.notFound);
					onClose();
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
				if (!open && !remove.isPending) onClose();
			}}
		>
			<AlertDialogContent
				initialFocus={cancelRef}
				finalFocus={() =>
					(doneRef.current ? focusAfterDelete() : openerRef.current) ?? true
				}
			>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{deleteQuestion(group, item.name)}
					</AlertDialogTitle>
					<AlertDialogDescription>{deleteDetail(group)}</AlertDialogDescription>
				</AlertDialogHeader>
				{failed ? (
					<p role="alert" className="text-sm text-warning">
						{MESSAGES.deleteFailed}
					</p>
				) : null}
				{/* 지우는 중은 버튼 스피너로만 보이므로 보조기기에 따로 알린다(audit P2) */}
				<p role="status" className="sr-only">
					{remove.isPending ? "지우는 중이에요" : ""}
				</p>
				<AlertDialogFooter>
					<AlertDialogCancel ref={cancelRef} size="lg">
						취소
					</AlertDialogCancel>
					<AlertDialogAction
						size="lg"
						variant="destructive"
						disabled={remove.isPending}
						focusableWhenDisabled
						onClick={confirm}
					>
						{remove.isPending ? (
							<Spinner data-icon="inline-start" aria-hidden="true" />
						) : null}
						지우기
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
