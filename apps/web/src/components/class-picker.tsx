"use client";

import type { Voice } from "@tts-pilot-app/api/providers/contract";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Plus } from "lucide-react";
import { type RefObject, useId, useState } from "react";

import { GROUPS, type Group, type Named } from "@/lib/classes-view";

import { ClassChecklist } from "./class-checklist";
import { useLinkVoice } from "./saved-voices";

// '분류 붙이기'(스펙 4절, 사용자 결정 U4: 팝오버가 아니라 담기 칸 안에서 펼친다. 넓은 화면·서랍 모두 같고 겹침이 없다).
// 체크 목록(ClassChecklist)에 성우 연결 mutation을 붙인 모양이다. 체크하면 바로 저장되고, 일치하는 이름이 없으면 그 자리에서 만들고 붙인다(T6 프로시저).
// 펼침은 최대 20rem이고 넘치면 펼침 안에서 스크롤한다. 애니메이션 없이 바로 열린다(브리프 B3)
export function ClassPicker({
	voice,
	item,
	triggerRef,
	onLinked,
}: {
	voice: Voice;
	item: SavedVoice | undefined;
	triggerRef: RefObject<HTMLButtonElement | null>;
	// 붙임·뗌 알림(화면 밖 role=status, 브리프 B5)
	onLinked: (name: string, group: Group, on: boolean) => void;
}) {
	const regionId = useId();
	const [open, setOpen] = useState(false);
	const link = useLinkVoice(voice);
	const classIds = item?.classificationIds ?? [];
	const selected: Record<Group, readonly string[]> = {
		channel: item?.channelIds ?? [],
		category: classIds,
		type: classIds,
	};

	function toggle(group: Group, entry: Named, on: boolean) {
		// 알림은 저장된 뒤에만(실패하면 실패 토스트만 남는다)
		link.mutate(
			{ group, id: entry.id, on },
			{ onSuccess: () => onLinked(entry.name, group, on) },
		);
	}
	function close() {
		setOpen(false);
		triggerRef.current?.focus();
	}

	return (
		<div className="flex flex-col gap-2">
			<Button
				ref={triggerRef}
				variant="link"
				size="lg"
				className="self-start"
				aria-expanded={open}
				aria-controls={regionId}
				onClick={() => {
					if (open) close();
					else setOpen(true);
				}}
			>
				<Plus aria-hidden="true" />
				분류 붙이기
			</Button>
			{open ? (
				// biome-ignore lint/a11y/noStaticElementInteractions: 안의 검색 칸·체크박스·버튼에서 올라오는 Esc 하나만 받는다(펼침 접기)
				<div
					id={regionId}
					// 패널 카드 안에 둥근 테두리 상자를 또 두지 않고 위쪽 구분선으로 나눈다(critique B1). 가로 4px 여백은 스크롤 칸이 검색 칸 포커스 고리를 자르지 않게 한다
					className="flex max-h-80 flex-col gap-3 overflow-y-auto overscroll-contain border-t px-1 pt-3"
					// 펼침만 접는다. 서랍(Sheet) 안에서도 서랍은 닫지 않는다(브리프 B3)
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.stopPropagation();
							close();
						}
					}}
				>
					<ClassChecklist
						groups={GROUPS}
						selected={selected}
						onToggle={toggle}
						autoFocus
					/>
				</div>
			) : null}
		</div>
	);
}
