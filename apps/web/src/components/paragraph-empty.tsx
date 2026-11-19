// apps/web/src/components/paragraph-empty.tsx
"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import { FolderOpen } from "lucide-react";
import { useRef, useState } from "react";

import { STUDIO_TEXT } from "@/lib/studio-view";

import { EmptyState } from "./empty-state";
import { ParagraphPasteDialog } from "./paragraph-paste-dialog";
import { ScriptInsertDialog } from "./script-insert-dialog";

// 대본이 비어 있을 때 문단 목록 자리의 빈 상태(R2 브리프 4절). 주 '대본 붙여 넣기'(채운 청록은 이 화면에서 이 버튼 하나),
// 보조 '저장한 대본 열기'(머리 '대본' 메뉴의 보관함 창과 같은 창), 3차 '직접 쓰기'(빈 카드로 돌아가 바로 쓴다).
// 창은 연 버튼(openerRef)으로 포커스를 돌려준다. 빈 대본이라 '저장하고 바꾸기'가 막힐 일이 없어 onBlocked는 닫기만 한다
export function ParagraphEmpty({ onType }: { onType: () => void }) {
	const [opening, setOpening] = useState(false);
	const openerRef = useRef<HTMLButtonElement>(null);
	return (
		<EmptyState
			art="studio"
			title={STUDIO_TEXT.emptyTitle}
			description={STUDIO_TEXT.emptyDescription}
		>
			<ParagraphPasteDialog filled />
			<Button
				ref={openerRef}
				variant="neutral"
				size="lg"
				onClick={() => setOpening(true)}
			>
				<FolderOpen data-icon="inline-start" aria-hidden="true" />
				{STUDIO_TEXT.openSaved}
			</Button>
			<Button variant="ghost" size="lg" onClick={onType}>
				{STUDIO_TEXT.typeHere}
			</Button>
			{opening ? (
				<ScriptInsertDialog
					openerRef={openerRef}
					onClose={() => setOpening(false)}
					onBlocked={() => setOpening(false)}
				/>
			) : null}
		</EmptyState>
	);
}
