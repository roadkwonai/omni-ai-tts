"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RefObject } from "react";

import {
	deleteDetail,
	deleteQuestion,
	doneMessage,
	type Group,
	MESSAGES,
} from "@/lib/classes-view";
import { linkedNote } from "@/lib/saved-voice-view";
import { client, orpc } from "@/utils/orpc";
import { listKey } from "./class-form-dialog";
import type { ClassItem } from "./class-group";
import { ConfirmDialog } from "./confirm-dialog";

// 삭제 확인(스펙 4절). 지운 뒤·없어진 항목이면 포커스를 다음 행 → 이전 행 → '만들기'로(사용자 결정 2026-10-06), 취소면 연 버튼으로 돌린다.
// 처리됐을 수 있으므로 목록은 늘 다시 받는다
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
	const remove = useMutation({
		mutationFn: () =>
			group === "channel"
				? client.channelDelete({ id: item.id })
				: client.classificationDelete({ id: item.id }),
		// 담은 성우의 칩·보관함 필터도 바뀐다
		onSettled: () =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: listKey(group) }),
				queryClient.invalidateQueries({
					queryKey: orpc.savedVoiceList.key(),
				}),
				// 채널을 지우면 프리셋의 채널·기본이 풀린다(T8)
				queryClient.invalidateQueries({ queryKey: orpc.presetList.key() }),
			]),
	});

	return (
		<ConfirmDialog
			title={deleteQuestion(group, item.name)}
			description={`${deleteDetail(group)}${linkedNote(item.voiceCount ?? 0, group)}`}
			action="지우기"
			pendingText="지우는 중이에요"
			failedText={MESSAGES.deleteFailed}
			doneText={doneMessage(group, item.name, "delete")}
			pending={remove.isPending}
			send={(handlers) => remove.mutate(undefined, handlers)}
			openerRef={openerRef}
			focusAfterDone={focusAfterDelete}
			onClose={() => onClose()}
		/>
	);
}
