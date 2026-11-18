"use client";

import type { ProviderId } from "@tts-pilot-app/api/providers/contract";
import {
	codePoints,
	TRIAL_TEXT_MAX,
	utf8Bytes,
} from "@tts-pilot-app/api/providers/trial-options";
import { Input } from "@tts-pilot-app/ui/components/input";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Coins, Play } from "lucide-react";
import { type ReactNode, useId, useRef } from "react";

import { plain } from "@/lib/voice-view";

import { DEMO_TEXT, useDemo } from "./demo";
import { useSentence } from "./trial-provider";

// 공개 데모는 공급자를 부르지 않아 돈 표시 없이 데모 샘플이라고 알린다
function DefaultHint() {
	const demo = useDemo();
	return (
		<>
			기본 샘플
			<Play
				aria-hidden="true"
				className="mx-0.5 inline size-3.5 fill-current align-middle"
			/>
			은 무료예요. 내 문장 듣기는
			{demo ? (
				` ${DEMO_TEXT.sentenceHint}`
			) : (
				<>
					<Coins
						aria-hidden="true"
						className="mx-0.5 inline size-3.5 align-middle text-warning"
					/>
					크레딧을 써요(Fish Audio 무료 모델 제외).
				</>
			)}
		</>
	);
}

const DEFAULT_HINT = <DefaultHint />;

// 모든 탭에서 같은 문장. IME 조합 중에는 자르지 않고 완료 시 200코드포인트로 제한한다.
// hint는 아래 안내 칸이다. 넘기지 않으면 기본 안내, null이면 칸을 그리지 않는다(기본 샘플이 없는 내 보이스 창)
export function SentenceBar({
	provider,
	hint = DEFAULT_HINT,
}: {
	provider: ProviderId | null;
	hint?: ReactNode;
}) {
	const { text, setText } = useSentence();
	const id = useId();
	const composing = useRef(false);
	const count = codePoints(text);
	const limit = (value: string) => [...value].slice(0, TRIAL_TEXT_MAX).join("");
	return (
		<section aria-labelledby={`${id}-label`} className="flex flex-col gap-2">
			<div className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-border ring-inset md:flex-row md:items-center md:gap-4">
				<label id={`${id}-label`} htmlFor={id} className="shrink-0 font-bold">
					내 문장
				</label>
				<Input
					id={id}
					name="trial-sentence"
					autoComplete="off"
					value={text}
					onCompositionStart={() => {
						composing.current = true;
					}}
					onCompositionEnd={(event) => {
						composing.current = false;
						setText(limit(event.currentTarget.value));
					}}
					onChange={(event) =>
						setText(
							composing.current
								? event.target.value
								: limit(event.target.value),
						)
					}
					placeholder="들어 볼 문장을 써 주세요"
					aria-describedby={hint ? `${id}-count ${id}-hint` : `${id}-count`}
					className="min-h-11 shrink-0 rounded-xl text-base md:flex-1 md:text-sm"
				/>
				<p
					id={`${id}-count`}
					className={cn(
						"shrink-0 self-end text-sm tabular-nums md:self-auto",
						count >= 190 ? "text-warning" : "text-muted-foreground",
					)}
				>
					{plain.format(count)} / {TRIAL_TEXT_MAX}자
					{provider === "fish_audio"
						? ` · ${plain.format(utf8Bytes(text))}바이트`
						: null}
				</p>
			</div>
			{hint ? (
				<p id={`${id}-hint`} className="text-muted-foreground text-sm">
					{hint}
				</p>
			) : null}
		</section>
	);
}
