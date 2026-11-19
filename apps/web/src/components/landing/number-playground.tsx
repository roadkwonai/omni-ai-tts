"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import { Textarea } from "@tts-pilot-app/ui/components/textarea";
import { TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { TRY } from "@/lib/landing-content";

import { readingView } from "./try-reading";

// 장면 2 숫자 놀이터(브리프 3·5절): 입력하는 대로 즉시 한글 읽기를 계산한다(디바운스 없음, 서버 호출 없음). 바뀐 부분만 강조하고 확인 필요 항목은 이유 한 줄.
// 눈에 보이는 결과는 즉시 바뀌고, 스크린 리더에는 결과 요약 한 줄만 aria-live="polite"로 500ms 쉬었다 알린다(키 입력마다 읽지 않는다).
// 예시 칩은 입력칸을 그 문장으로 바꾸고 포커스를 입력칸에 둔다
export function NumberPlayground() {
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const [text, setText] = useState<string>(TRY.example);
	const view = readingView(text);
	const noNumber =
		view.parts.length > 0 && view.count === 0 && view.checks.length === 0;
	const summary =
		view.parts.length === 0
			? TRY.emptyResult
			: noNumber
				? TRY.noNumber
				: TRY.summary(view.count, view.checks.length);
	const [live, setLive] = useState(summary);
	useEffect(() => {
		const timer = setTimeout(() => setLive(summary), 500);
		return () => clearTimeout(timer);
	}, [summary]);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<label htmlFor="try-input" className="font-bold text-sm">
					{TRY.inputLabel}
				</label>
				<Textarea
					id="try-input"
					ref={inputRef}
					value={text}
					maxLength={TRY.max}
					autoComplete="off"
					onChange={(event) => setText(event.target.value)}
					className="min-h-24 rounded-xl bg-card px-3 py-3 text-base md:text-base"
				/>
				<p className="text-right text-muted-foreground text-sm tabular-nums">
					{text.length} / {TRY.max}자
				</p>
			</div>
			<ul aria-label={TRY.chipsLabel} className="flex flex-wrap gap-2">
				{TRY.chips.map((chip) => (
					<li key={chip}>
						<Button
							variant="neutral"
							size="lg"
							translate="no"
							className="landing-press"
							onClick={() => {
								setText(chip);
								inputRef.current?.focus();
							}}
						>
							{chip}
						</Button>
					</li>
				))}
			</ul>
			<p aria-live="polite" className="sr-only">
				{live}
			</p>
			<div className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border ring-inset md:p-6">
				<h3 className="font-bold text-muted-foreground text-sm">
					{TRY.resultHead}
				</h3>
				{view.parts.length === 0 ? (
					<p className="text-muted-foreground">{TRY.emptyResult}</p>
				) : (
					<p className="wrap-break-word whitespace-pre-wrap break-keep text-lg leading-relaxed">
						{view.parts.map((part, index) =>
							part.changed ? (
								<mark
									key={index}
									className="rounded-sm bg-primary-subtle px-0.5 font-bold text-foreground"
								>
									{part.text}
								</mark>
							) : (
								<span key={index}>{part.text}</span>
							),
						)}
					</p>
				)}
				{noNumber ? (
					<p className="text-muted-foreground text-sm">{TRY.noNumber}</p>
				) : null}
				{view.checks.length > 0 ? (
					<ul className="flex flex-col gap-1.5">
						{view.checks.map((check, index) => (
							<li
								key={`${index}-${check.original}`}
								className="flex gap-2 text-sm text-warning"
							>
								<TriangleAlert
									aria-hidden="true"
									className="mt-0.5 size-4 shrink-0"
								/>
								<span className="wrap-break-word text-pretty break-keep">
									<span translate="no" className="font-bold">
										{check.original}
									</span>{" "}
									{TRY.checkHead} {check.reason}
								</span>
							</li>
						))}
					</ul>
				) : null}
			</div>
		</div>
	);
}
