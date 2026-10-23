// apps/web/src/components/paragraph-tags.tsx
"use client";

import type { ActingFamily } from "@tts-pilot-app/api/drama-acting";
import { Button } from "@tts-pilot-app/ui/components/button";

import { PARAGRAPH_TEXT, paragraphTagGroups } from "@/lib/studio-text";

import { TagTools } from "./tag-tools";

// 문단 카드 태그 도구줄(T10 브리프 15.1, 스펙 15.1 표). 태그 대상 카드 하나의 대본 칸 바로 아래에 둔다.
// 태그를 받는 family는 소리 → 분위기 알약(드라마와 같은 부품), 받지 않으면 회색 안내 한 줄이다.
// Typecast·Airy는 감정·말투가 설정 칸에 있어 '설정에서 바꾸기'를 단다(ElevenLabs v2·flash는 눌러 갈 곳이 없다).
// note(빼고 보내는 태그 안내)가 있으면 안내 글 대신 그것을 보인다. 카드 아래 줄 안내와 두 줄로 겹치지 않게(브리프 15.1, critique P2)
export function ParagraphToolbar({
	id,
	n,
	family,
	note,
	onPick,
	onSettings,
}: {
	id: string;
	n: number;
	family: ActingFamily;
	note: string | null;
	onPick: (value: string) => void;
	onSettings: () => void;
}) {
	const [first, ...rest] = paragraphTagGroups(family);
	if (first)
		return (
			<TagTools
				id={id}
				label={PARAGRAPH_TEXT.tagToolbarName(n)}
				first={first}
				rest={rest}
				// 넣는 글은 묶음이 정한 값 그대로다(소리·분위기 [값], paragraphTagGroups)
				onPick={(_kind, value) => onPick(value)}
			/>
		);
	const plain = family === "elevenlabs_plain";
	return (
		<div id={id} className="flex flex-wrap items-center gap-x-2">
			<p className="flex min-h-11 items-center text-muted-foreground text-sm">
				{note ??
					(plain
						? PARAGRAPH_TEXT.tagsModelNote
						: family === "airy"
							? PARAGRAPH_TEXT.tagsStyleNote
							: PARAGRAPH_TEXT.tagsEmotionNote)}
			</p>
			{plain ? null : (
				<Button variant="ghost" size="lg" onClick={onSettings}>
					{PARAGRAPH_TEXT.tagsToSettings}
				</Button>
			)}
		</div>
	);
}
