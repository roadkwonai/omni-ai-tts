"use client";

import type { Voice } from "@tts-pilot-app/api/providers/contract";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import {
	type ReactNode,
	useId,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";

import { pickSelected, voiceKey } from "@/lib/voice-view";

import { VoicePanel, VoiceSheet } from "./voice-panel";
import type { Select } from "./voice-row";

const WIDE = "(min-width: 75rem)";
const subscribe = (callback: () => void) => {
	const media = matchMedia(WIDE);
	media.addEventListener("change", callback);
	return () => media.removeEventListener("change", callback);
};
const isWide = () => matchMedia(WIDE).matches;
const serverWide = () => true;
// 1200px 이상이면 패널이 오른쪽 칸이고, 아래면 서랍이다(브리프 9절, --breakpoint-xl과 같은 75rem). 서버 렌더는 넓은 화면으로 본다
export function useWide(): boolean {
	return useSyncExternalStore(subscribe, isWide, serverWide);
}

// 행 목록(children)과 성우 패널. 넓은 화면은 고른 성우(없거나 사라지면 첫 성우)를 칸에 보인다.
// 좁은 화면은 행을 누를 때만 서랍을 열고 닫으면 그 행으로 포커스를 돌린다(AC8). 처음 선택이 서랍을 저절로 열지 않는다.
// 첫 로딩·오류·빈 상태에도 두 칸 배치를 유지한다. 패널 자리는 받는 중이면 뼈대, 그 밖에는 비운다(계획 리뷰 D13)
export function CastingWorkspace({
	voices,
	chosen,
	onChoose,
	pending,
	children,
}: {
	voices: Voice[];
	chosen: string | null;
	onChoose: (key: string) => void;
	pending?: boolean;
	children: (props: {
		selectedKey: string | null;
		select: Select;
		panelId?: string;
	}) => ReactNode;
}) {
	const wide = useWide();
	// 탭을 숨긴 채 남겨 둬 작업대가 여럿이므로 패널 id는 작업대마다 만든다(행의 aria-controls와 패널 id가 같다)
	const panelId = useId();
	const [sheetOpen, setSheetOpen] = useState(false);
	const rowRef = useRef<HTMLButtonElement | null>(null);
	// 서랍·패널에 넘기는 성우는 좁은 화면에서도 고른 성우다(서랍이 닫히는 200ms 동안 내용이 남는다). 서랍 열림은 VoiceSheet가 open && voice !== null로 거른다
	const shownKey = wide ? pickSelected(voices, chosen) : chosen;
	const selected = voices.find((voice) => voiceKey(voice) === shownKey) ?? null;
	// 행 강조: 좁은 화면은 서랍이 열린 동안만 고른 행을 강조한다
	const selectedKey = wide || sheetOpen ? shownKey : null;
	// 넓어졌거나 열린 동안 그 성우가 목록에서 사라졌으면 서랍 열림을 풀어 둔다(다시 좁아지거나 성우가 돌아와도 저절로 열리지 않는다)
	if ((wide || selected === null) && sheetOpen) setSheetOpen(false);
	const select: Select = (voice, row) => {
		onChoose(voiceKey(voice));
		if (!wide) {
			rowRef.current = row;
			setSheetOpen(true);
		}
	};
	return (
		// 약 62:38(시안). 8칸 중 5·3
		<div className="flex flex-col gap-6 xl:grid xl:grid-cols-8 xl:items-start">
			<div className="min-w-0 xl:col-span-5">
				{children({
					selectedKey,
					select,
					panelId: wide && selected ? panelId : undefined,
				})}
			</div>
			{wide ? (
				// 서버 렌더는 넓은 화면으로 보므로 하이드레이션 전 좁은 화면에서는 CSS로 감춘다(xl = 75rem = WIDE).
				// 격자가 items-start라도 이 칸은 행 높이만큼 늘인다. 그래야 안의 패널(sticky)이 목록을 따라 내려갈 자리가 있다(critique P1, 2026-10-05)
				<div className="hidden xl:col-span-3 xl:block xl:self-stretch">
					{selected ? (
						<VoicePanel id={panelId} voice={selected} />
					) : pending ? (
						<Skeleton className="h-96 w-full rounded-2xl" />
					) : null}
				</div>
			) : (
				<VoiceSheet
					voice={selected}
					open={sheetOpen}
					onOpenChange={setSheetOpen}
					finalFocus={rowRef}
				/>
			)}
		</div>
	);
}
