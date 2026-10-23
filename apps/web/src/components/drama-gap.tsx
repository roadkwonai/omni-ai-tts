// apps/web/src/components/drama-gap.tsx
"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import { Input } from "@tts-pilot-app/ui/components/input";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tts-pilot-app/ui/components/tooltip";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { X } from "lucide-react";
import { type RefObject, useId, useRef, useState } from "react";
import { GAP_DEFAULT, gapOf, gapText } from "@/lib/sound-join";

import { fieldClass, isComposingEnter } from "./class-form-dialog";

// 쉼 칸(브리프 15절 1, 16절 1, 17절 3·5): 대본 머리의 기본 쉼 칸과 줄 사이 가름선. 두 칸이 같은 숫자 칸 부품(GapInput)을 쓴다

// 가름선 숫자 칸 설명(gapLineHelp). 대본 구역에 하나 두고 모든 가름선 칸이 잇는다(브리프 16절 1)
export const GAP_HELP_ID = "drama-gap-help";
// 쉼 숫자 칸(브리프 15절 1, 16절 1). form 밖이라 브라우저 step·min·max 검사는 아무것도 막지 않고 값은 gapOf가 맞춘다
const GAP_INPUT = {
	type: "number",
	inputMode: "decimal",
	step: "0.1",
	min: "0",
	max: "5",
	autoComplete: "off",
} as const;
// 기본 쉼 칸: 56px 가운데 맞춤(시안 .gap-default). 이름표가 회색이라 값은 foreground로 둔다
const GAP_FIELD = cn(
	fieldClass,
	"w-14 text-center text-foreground tabular-nums",
);
// 가름선 숫자 칸: 40×28px, 오른쪽 맞춤, 테두리·바탕 없음(브리프 17절 5). 글자 크기·굵기는 가름선(drama-gap)에서 받는다
const LINE_GAP_FIELD =
	"h-7 w-10 rounded-md border-transparent bg-transparent px-1 py-0 text-right text-foreground tabular-nums hover:bg-muted focus-visible:bg-card dark:bg-transparent dark:hover:bg-muted dark:focus-visible:bg-card";

// 쉼 숫자 칸(기본 쉼·가름선 두 칸이 쓴다, 브리프 16절 1). 칸을 떠날 때와 Enter(조합 중 제외)에 gapOf로 맞춘 값을 onCommit에 한 번 넘긴다(비우거나 글자면 null).
// 고치는 동안만 글(text)을 따로 두고, 고치지 않을 때는 value(저장된 값)를 그대로 보여 바깥 변경(임시 작업 읽기·'기본으로')을 따라간다.
// data-drama-field: 767px 이하에서 입력하는 동안 막대 결과 칸을 숨긴다(index.css drama-bar-result)
export function GapInput({
	id,
	name,
	value,
	placeholder,
	describedBy,
	inputRef,
	className = GAP_FIELD,
	onCommit,
}: {
	id: string;
	name: string;
	value: string;
	placeholder?: string;
	describedBy: string;
	inputRef?: RefObject<HTMLInputElement | null>;
	className?: string;
	onCommit: (gap: number | null) => void;
}) {
	const [text, setText] = useState<string | null>(null);
	function commit() {
		if (text === null) return;
		onCommit(gapOf(text));
		setText(null);
	}
	return (
		<Input
			{...GAP_INPUT}
			ref={inputRef}
			id={id}
			name={name}
			data-drama-field=""
			value={text ?? value}
			placeholder={placeholder}
			onChange={(event) => setText(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === "Enter" && !isComposingEnter(event)) commit();
				// 빈 칸의 ↑/↓는 브라우저가 0에서 시작한다. 자리 표시(기본 쉼)에서 0.1초씩 바꾼다(스펙 16.4). 커밋은 평소처럼 떠날 때·Enter
				const step =
					event.key === "ArrowUp" ? 0.1 : event.key === "ArrowDown" ? -0.1 : 0;
				if (step !== 0 && (text ?? value) === "" && placeholder) {
					event.preventDefault();
					setText(gapText(gapOf(Number(placeholder) + step) ?? 0));
				}
			}}
			aria-describedby={describedBy}
			className={cn("drama-gap-number", className)}
		/>
	);
}

// 가름선(브리프 17절 5): 줄 li 안 마지막 칸(전체 폭), 높이 28px의 가는 선 가운데 [숫자 칸][초][× 기본으로(줄 쉼이 있을 때)].
// 값은 줄 쉼이고 굵은 foreground다. 없으면 빈 칸에 기본 쉼이 회색 자리 표시로 보인다.
// 비우거나 글자를 넣으면 0이 아니라 줄 쉼을 지운다(기본 쉼을 쓴다). 같은 값이면 쓰지 않는다(대본 고침 경로라 오류 줄이 내려간다)
export function LineGap({
	id,
	n,
	gap,
	defaultGap,
	onChange,
	text,
}: {
	id: string;
	n: number;
	gap: number | undefined;
	defaultGap: number;
	onChange: (gap: number | undefined) => void;
	// 문구는 호스트(드라마·문단 작업실)가 준다
	text: {
		name: (n: number) => string;
		reset: string;
		resetLine: (n: number) => string;
		unit: string;
	};
}) {
	const inputId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const resetRef = useRef<HTMLButtonElement>(null);
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: 안의 숫자 칸에서 올라오는 blur 하나만 받아 포커스를 되돌린다(새 상호작용이 아니다)
		<div
			className="drama-gap col-span-full flex h-7 items-center before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border"
			// 칸을 비우고(글자) '기본으로'로 떠나면 커밋이 그 단추를 없애므로 포커스를 칸에 남긴다('기본으로'를 누른 결과와 같다)
			onBlur={(event) => {
				if (
					resetRef.current !== null &&
					event.relatedTarget === resetRef.current &&
					gapOf(inputRef.current?.value) === null
				)
					queueMicrotask(() => inputRef.current?.focus());
			}}
		>
			<div
				className={cn(
					"flex items-center gap-2 px-1.5",
					gap === undefined
						? "text-muted-foreground"
						: "font-bold text-foreground",
				)}
			>
				{/* 위아래 여백(py-2 -my-2)으로 눌림 영역 44px. 접근 이름은 화면 밖 '{n}번 줄 뒤 쉼(초)'이고 보이는 '초'가 그 안에 있다(WCAG 2.5.3) */}
				<label
					htmlFor={inputId}
					className="-my-2 flex items-center gap-0.5 py-2"
				>
					<span className="sr-only">{text.name(n)}</span>
					<GapInput
						id={inputId}
						name={`drama-gap-${id}`}
						value={gap === undefined ? "" : gapText(gap)}
						placeholder={gapText(defaultGap)}
						describedBy={GAP_HELP_ID}
						inputRef={inputRef}
						className={LINE_GAP_FIELD}
						onCommit={(next) => {
							const value = next ?? undefined;
							if (value !== gap) onChange(value);
						}}
					/>
					<span aria-hidden="true">{text.unit}</span>
				</label>
				{/* 누르면 이 단추가 사라지므로 포커스는 그 줄 숫자 칸으로. 28px 단추에 after로 눌림 영역 44px */}
				{gap === undefined ? null : (
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									ref={resetRef}
									variant="ghost"
									size="icon-sm"
									aria-label={text.resetLine(n)}
									className="relative text-muted-foreground after:absolute after:-inset-2 hover:text-foreground focus-visible:text-foreground"
									onClick={() => {
										onChange(undefined);
										inputRef.current?.focus();
									}}
								/>
							}
						>
							<X aria-hidden="true" className="size-3.5" />
						</TooltipTrigger>
						<TooltipContent>{text.reset}</TooltipContent>
					</Tooltip>
				)}
			</div>
		</div>
	);
}

// 기본 쉼 칸(브리프 15절 1, 17절 3): 대본 머리의 '기본 쉼 [0.3]초'. 숫자 칸 부품(GapInput)이 맞춘 값을 넣는다(비우거나 글자면 처음 값). 같은 값이면 쓰지 않는다
export function DefaultGap({
	value,
	onChange,
	text,
}: {
	value: number;
	onChange: (gap: number) => void;
	text: { label: string; unit: string; help: string };
}) {
	const id = useId();
	const helpId = useId();
	return (
		<div className="flex items-center gap-1.5 text-muted-foreground text-sm">
			<label htmlFor={id}>{text.label}</label>
			<GapInput
				id={id}
				name="drama-gap-default"
				value={gapText(value)}
				describedBy={helpId}
				onCommit={(next) => {
					const gap = next ?? GAP_DEFAULT;
					if (gap !== value) onChange(gap);
				}}
			/>
			<span>{text.unit}</span>
			<span id={helpId} className="sr-only">
				{text.help}
			</span>
		</div>
	);
}
