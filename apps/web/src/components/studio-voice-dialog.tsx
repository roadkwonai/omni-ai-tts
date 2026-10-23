// apps/web/src/components/studio-voice-dialog.tsx
"use client";

import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button, buttonVariants } from "@tts-pilot-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@tts-pilot-app/ui/components/dialog";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { type Ref, useId, useRef, useState } from "react";

import { LIBRARY_TEXT } from "@/lib/saved-voice-view";
import { STUDIO_TEXT, usageLine } from "@/lib/studio-view";
import { metaLine, sampleKindOf } from "@/lib/voice-view";

import { DialogCloseButton } from "./dialog-close-button";
import { usePlayer, useSample } from "./sample-player";
import { useStudio } from "./studio-provider";
import { ReloadButton } from "./voice-problem";
import { SampleButton } from "./voice-row";

// 성우 한 줄(브리프 5.5): 기본 샘플(무료) → 고르기 버튼(이름 · 조건 요약 · '최근 사용 3일 전 · 12회').
// 이용 불가 성우는 aria-disabled로 포커스를 받고 눌러도 아무 일이 없다. 이름·조건·이력 글자만 흐리고 이유는 배지가 맡는다(배지는 설명으로 잇는다).
// 지금 고른 성우는 옅은 청록 바탕, aria-current, Check
function VoiceOption({
	item,
	now,
	chosen,
	onPick,
	ref,
}: {
	item: SavedVoice;
	now: Date;
	chosen: boolean;
	onPick: () => void;
	// 창이 열릴 때 첫 포커스(브리프 7절)
	ref?: Ref<HTMLButtonElement>;
}) {
	const sample = item.voice.previewUrl;
	const { status, toggle } = useSample(sample ?? "");
	const reasonId = useId();
	const usage = usageLine(item, now);
	const off = item.unavailable;
	return (
		<li className="flex items-center gap-3 py-2">
			<SampleButton
				status={sample ? status : "none"}
				subject={`${item.voice.name} ${sampleKindOf(item.voice)}`}
				onToggle={
					sample ? () => toggle(sample, item.voice.name, sample) : undefined
				}
			/>
			<button
				ref={ref}
				type="button"
				aria-disabled={off || undefined}
				aria-current={chosen ? "true" : undefined}
				aria-describedby={off ? reasonId : undefined}
				onClick={off ? undefined : onPick}
				className={cn(
					"flex min-h-11 min-w-0 flex-1 flex-col items-start rounded-md px-2 py-1 text-left outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring",
					// 고른 줄은 청록 바탕을 지키고 이용 불가 줄은 눌리지 않으므로 hover 바탕을 주지 않는다
					chosen ? "bg-primary-subtle" : !off && "hover:bg-muted",
				)}
			>
				<span className="flex w-full min-w-0 items-center gap-2">
					<span
						className={cn(
							"min-w-0 truncate font-bold text-base",
							off && "opacity-50",
						)}
					>
						{item.voice.name}
					</span>
					{chosen ? (
						<Check
							aria-hidden="true"
							className="size-4 shrink-0 text-primary"
						/>
					) : null}
					{off ? (
						// 이름에 섞이지 않게 숨기고 aria-describedby로만 읽힌다(숨긴 요소도 설명으로 잇는다)
						<Badge id={reasonId} aria-hidden="true" variant="secondary">
							{LIBRARY_TEXT.unavailable}
						</Badge>
					) : null}
				</span>
				<span
					className={cn(
						"max-w-full truncate text-muted-foreground text-sm",
						off && "opacity-50",
					)}
				>
					{metaLine(item.voice)}
				</span>
				{usage ? (
					<span
						className={cn(
							"text-muted-foreground text-sm tabular-nums",
							off && "opacity-50",
						)}
					>
						{usage}
					</span>
				) : null}
			</button>
		</li>
	);
}

// 카드 머리줄의 성우 버튼과 성우 고르기 창(브리프 5.3·5.5). 담은 Typecast 성우만(최근 사용 순 → 즐겨찾기 → 담은 순).
// 받는 중 뼈대 셋, 실패면 '다시 불러오기', 담은 성우가 없으면 '성우 캐스팅에서 담기'. 검색·필터는 두지 않는다(DN-9).
// 고르거나 닫으면 포커스는 성우 버튼으로 돌아간다(DialogTrigger 기본, DN-5). 창이 닫히면 창에서 튼 기본 샘플을 멈춘다
export function VoicePicker() {
	const studio = useStudio();
	const player = usePlayer();
	const [open, setOpen] = useState(false);
	// 창을 연 시각('최근 사용 3일 전'의 기준). 렌더 중 new Date()는 React Compiler가 첫 값으로 기억해 페이지를 연 시각에 머문다
	const [now, setNow] = useState(() => new Date());
	const firstRef = useRef<HTMLButtonElement>(null);
	const badgeId = useId();
	const chosen = studio.voice;
	const failed = studio.voicesLoad === "failed";
	// 첫 포커스: 고른 성우 → 첫 고를 수 있는 성우 → 첫 줄(샘플 버튼에는 가지 않는다). 그 밖은 창의 첫 탭 정지다:
	// 빈 상태 '성우 캐스팅에서 담기', 실패 '다시 불러오기', 받는 중 '닫기'(DOM 끝에 둔다)
	const firstId = (
		chosen ??
		studio.voices.find((item) => !item.unavailable) ??
		studio.voices[0]
	)?.id;

	function changeOpen(next: boolean) {
		setOpen(next);
		if (next) setNow(new Date());
		else player.stop();
	}

	return (
		<>
			<Dialog open={open} onOpenChange={changeOpen}>
				<DialogTrigger
					render={
						<Button
							// 채운 청록은 하나다(브리프 3절): 목록을 받지 못하면 카드의 '다시 불러오기'가 채운 버튼이다.
							// 고른 성우는 무채색 테두리 + 진한 굵은 이름(채널 고르기와 같은 조건 버튼 결, critique P2-3)
							variant={chosen || failed ? "outline" : "default"}
							size="lg"
							aria-describedby={chosen?.unavailable ? badgeId : undefined}
							className={cn(
								"min-w-0 max-w-full",
								chosen &&
									"border-border text-foreground hover:bg-muted aria-expanded:bg-muted",
							)}
						/>
					}
				>
					<span className="truncate">
						{chosen ? chosen.voice.name : STUDIO_TEXT.pickVoice}
					</span>
					{chosen ? (
						<span
							className="shrink-0 font-normal text-muted-foreground"
							translate="no"
						>
							· Typecast
						</span>
					) : null}
				</DialogTrigger>
				<DialogContent
					initialFocus={() => firstRef.current ?? true}
					className="md:max-w-lg"
				>
					{/* 오른쪽 위 '닫기'(44px + 12px)와 제목이 겹치지 않게 오른쪽을 비운다 */}
					<DialogHeader className="pr-12">
						<DialogTitle>{STUDIO_TEXT.pickVoice}</DialogTitle>
						<DialogDescription>
							{STUDIO_TEXT.pickVoiceDescription}
						</DialogDescription>
					</DialogHeader>
					{studio.voicesLoad === "loading" ? (
						<div aria-busy="true" className="flex flex-col gap-2">
							<Skeleton aria-hidden="true" className="h-16 w-full rounded-xl" />
							<Skeleton aria-hidden="true" className="h-16 w-full rounded-xl" />
							<Skeleton aria-hidden="true" className="h-16 w-full rounded-xl" />
						</div>
					) : failed ? (
						// 다시 받는 동안에도 남는다(받는 중 뼈대로 바뀌면 포커스를 쥔 버튼이 사라진다, QA-1)
						<div
							aria-busy={studio.voicesFetching || undefined}
							className="flex flex-col items-start gap-3"
						>
							<p className="text-sm text-warning">{STUDIO_TEXT.voicesFailed}</p>
							<ReloadButton
								reloading={studio.voicesFetching}
								onReload={studio.reloadVoices}
							/>
						</div>
					) : studio.voices.length === 0 ? (
						<div className="flex flex-col items-start gap-3">
							<p>{STUDIO_TEXT.noVoices}</p>
							{/* cn 없이 쓰면 기본 border-transparent가 outline 테두리를 지운다(preset-board와 같다) */}
							<Link
								href="/casting"
								className={cn(
									buttonVariants({ variant: "outline", size: "lg" }),
								)}
							>
								{STUDIO_TEXT.toCasting}
								<ArrowRight data-icon="inline-end" aria-hidden="true" />
							</Link>
						</div>
					) : (
						// 768px 이상만 창 안에서 스크롤하고 끝에서 뒤 페이지로 이어지지 않는다(audit F5). 767px 이하는 시트가 스크롤한다(이중 스크롤 없음, D11).
						// 스크롤 칸이 잘라 내지 않게 좌우 4px(포커스 윤곽 2px + 간격 2px)
						<ul className="flex flex-col divide-y divide-border overscroll-contain md:max-h-96 md:overflow-y-auto md:px-1">
							{studio.voices.map((item) => (
								<VoiceOption
									key={item.id}
									ref={item.id === firstId ? firstRef : undefined}
									item={item}
									now={now}
									chosen={item.id === chosen?.id}
									onPick={() => {
										studio.pickVoice(item.voice.voiceId);
										changeOpen(false);
									}}
								/>
							))}
						</ul>
					)}
					<DialogCloseButton label={STUDIO_TEXT.close} />
				</DialogContent>
			</Dialog>
			{chosen?.unavailable ? (
				<Badge id={badgeId} variant="secondary">
					{LIBRARY_TEXT.unavailable}
				</Badge>
			) : null}
		</>
	);
}
