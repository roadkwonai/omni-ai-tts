// apps/web/src/components/drama-speakers.tsx
"use client";

import { DRAMA_SPEAKERS_MAX } from "@tts-pilot-app/api/drama-script";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Input } from "@tts-pilot-app/ui/components/input";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tts-pilot-app/ui/components/tooltip";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { TriangleAlert, UserPlus, X } from "lucide-react";
import { useId } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { badSpeakerNames, DRAMA_TEXT, voiceOfSpeaker } from "@/lib/drama-view";
import { sampleKindOf } from "@/lib/voice-view";

import { fieldClass } from "./class-form-dialog";
import { boxClass } from "./class-group";
import { useDrama, useSpeakerLines } from "./drama-provider";
import {
	DramaVoicePicker,
	SpeakerMark,
	speakerFieldId,
} from "./drama-voice-dialog";
import { useSample } from "./sample-player";
import { useSavedList } from "./saved-voices";
import { ReloadButton } from "./voice-problem";
import { SampleButton } from "./voice-row";

// 화자 띠 하나(브리프 17절 2): [화자 원][이름 칸][성우 버튼][기본 샘플][빼기] 한 줄.
// 빼기는 잠겨도 포커스를 받고(aria-disabled) 누르면 이유를 알림으로 보인다(터치에는 툴팁이 없다). 이유는 화면 밖 글로 설명에 잇고 툴팁도 이유다
function SpeakerCard({
	index,
	name,
	invalid,
	locked,
	onRemove,
}: {
	index: number;
	name: string;
	invalid: boolean;
	// 빼기 잠김 이유(removeLocked·removeLast). 없으면 null
	locked: string | null;
	onRemove: () => void;
}) {
	const drama = useDrama();
	const reasonId = useId();
	// 화자 공급자로 담은 성우(Fish만 보지 않는다, Task 16 리뷰 Minor 3). 기본 샘플은 지금처럼 그 성우의 것이다
	const speaker = drama.speakers[index];
	const voice = speaker ? voiceOfSpeaker(speaker, drama.savedVoices) : null;
	const sample = voice?.previewUrl ?? null;
	const { status, toggle } = useSample(sample ?? "");
	return (
		// 띠마다 '화자 1' 묶음이라 같은 글자의 '성우 고르기'가 어느 화자의 것인지 들린다.
		// fieldset은 기본 최소 너비가 내용 너비라 구역 폭을 넘지 않게 min-w-0
		<fieldset
			aria-label={DRAMA_TEXT.speakerName(index + 1)}
			className={cn(
				boxClass,
				"flex h-13 min-w-0 items-center gap-0.5 pr-0.5 pl-3 max-md:w-full",
			)}
		>
			<SpeakerMark index={index} />
			{/* 바로 고친다. 입력을 자르지 않는다(maxLength 없음, Ruling 14). 넘치면 경고 경계와 막는 이유가 말한다 */}
			<Input
				id={speakerFieldId(index, "name")}
				name={`drama-speaker-name-${index}`}
				value={name}
				onChange={(event) => drama.renameSpeaker(index, event.target.value)}
				aria-label={DRAMA_TEXT.nameLabel(index + 1)}
				aria-invalid={invalid || undefined}
				autoComplete="off"
				data-drama-field=""
				// 띠 안에서는 테두리·바탕 없이 이름만 보이고, 가리키면 바탕, 포커스하면 ring
				className={cn(
					fieldClass,
					"ml-1 w-21 min-w-0 shrink-0 border-transparent bg-transparent px-2 font-bold hover:bg-muted focus-visible:bg-card dark:bg-transparent dark:hover:bg-muted",
				)}
			/>
			<DramaVoicePicker index={index} />
			{voice ? (
				<SampleButton
					status={sample ? status : "none"}
					subject={`${voice.name} ${sampleKindOf(voice)}`}
					onToggle={
						sample ? () => toggle(sample, voice.name, sample) : undefined
					}
				/>
			) : null}
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							variant="ghost"
							size="icon-lg"
							aria-label={DRAMA_TEXT.removeSpeaker(index + 1)}
							aria-disabled={locked ? true : undefined}
							aria-describedby={locked ? reasonId : undefined}
							// RowAction 모양(회색, 가리키거나 포커스하면 진해진다). 잠기면 흐리게
							className="shrink-0 text-muted-foreground hover:text-foreground focus-visible:text-foreground aria-disabled:opacity-50"
							onClick={() => (locked ? toast(locked) : onRemove())}
						/>
					}
				>
					<X aria-hidden="true" />
				</TooltipTrigger>
				<TooltipContent>{locked ?? DRAMA_TEXT.removeTip}</TooltipContent>
			</Tooltip>
			{locked ? (
				<span id={reasonId} className="sr-only">
					{locked}
				</span>
			) : null}
		</fieldset>
	);
}

// 화자 구역(브리프 17절 2, 6절, 7절 포커스): 머리([제목][도움] … ['화자 추가']), 담은 성우 목록 실패 알림 줄, 띠 흐름.
// 줄 목록은 읽지 않는다(입력 지연). 빼기 잠김은 화자별 줄 수(useSpeakerLines)만 본다
export function DramaSpeakers() {
	const drama = useDrama();
	const counts = useSpeakerLines();
	// 담은 목록을 다시 받는 중(알림 줄 '다시 불러오기' 스피너)
	const savedList = useSavedList();
	const headId = useId();
	const { speakers } = drama;
	const full = speakers.length >= DRAMA_SPEAKERS_MAX;
	// 이름 칸 경고 경계: 막는 이유의 이름 검사와 같은 기준(빈·겹침은 뒤 화자·20자 초과)
	const invalid = badSpeakerNames(speakers);

	// 새 화자 이름 칸으로, 글 전체를 고른다
	function add() {
		if (full) return;
		flushSync(() => drama.addSpeaker());
		const field = document.getElementById(
			speakerFieldId(speakers.length, "name"),
		);
		if (field instanceof HTMLInputElement) {
			field.focus();
			field.select();
		}
	}
	// 뺀 뒤 포커스: 다음 띠 이름 칸 → 앞 띠 이름 칸(뒤 화자 번호와 색이 하나씩 당겨진다)
	function remove(index: number) {
		flushSync(() => drama.removeSpeaker(index));
		document
			.getElementById(
				speakerFieldId(Math.min(index, speakers.length - 2), "name"),
			)
			?.focus();
	}

	return (
		// 뼈대를 그리는 동안 구역이 받는 중이다(뼈대는 aria-hidden).
		// isolate: 띠 안 샘플 단추의 z-10이 고정 막대·머리 위로 올라오지 않게 구역이 쌓임 맥락을 만든다
		<section
			aria-labelledby={headId}
			aria-busy={!drama.ready || undefined}
			className="isolate flex flex-col gap-3"
		>
			<div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1">
				<h2
					id={headId}
					tabIndex={-1}
					// w-fit: 포커스 윤곽이 줄 전체가 아니라 제목 글에 붙는다
					className="w-fit font-bold text-xl outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid focus-visible:outline-offset-2"
				>
					{DRAMA_TEXT.speakers}
				</h2>
				<p className="text-muted-foreground text-sm max-md:hidden">
					{DRAMA_TEXT.speakersHelp}
				</p>
				{drama.ready ? (
					full ? (
						<p className="ml-auto text-muted-foreground text-sm">
							{DRAMA_TEXT.speakersFull}
						</p>
					) : (
						<Button
							variant="outline"
							size="lg"
							className="ml-auto"
							onClick={add}
						>
							<UserPlus data-icon="inline-start" aria-hidden="true" />
							{DRAMA_TEXT.addSpeaker}
						</Button>
					)
				) : null}
			</div>
			{!drama.ready ? (
				// 임시 작업·저장한 성우를 읽기 전(브리프 6절): 띠 높이 뼈대
				<div aria-hidden="true" className="flex flex-wrap gap-2">
					<Skeleton className="h-13 rounded-2xl max-md:w-full md:w-80" />
					<Skeleton className="h-13 rounded-2xl max-md:w-full md:w-80" />
				</div>
			) : (
				<>
					{/* 창을 열어야 오류를 아는 일이 없게 띠 위에 둔다(리뷰 D17). 다시 받는 동안에도 남는다(포커스를 쥔 버튼이 사라지지 않게) */}
					{drama.voicesLoad === "failed" ? (
						<div
							aria-busy={savedList.isFetching || undefined}
							className="flex flex-wrap items-center gap-3"
						>
							<p className="flex items-center gap-2 text-sm text-warning">
								<TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
								{DRAMA_TEXT.voicesFailed}
							</p>
							<ReloadButton
								reloading={savedList.isFetching}
								onReload={() =>
									drama.reloadVoices(() => document.getElementById(headId))
								}
							/>
						</div>
					) : null}
					<div className="flex flex-wrap gap-2">
						{speakers.map((speaker, index) => {
							const lines = counts[index] ?? 0;
							return (
								<SpeakerCard
									// 화자에는 id가 없고 정체가 번호다(색·번호·줄의 speaker가 모두 번호를 따른다). 빼면 뒤 띠가 한 칸씩 당겨진다
									key={index}
									index={index}
									name={speaker.name}
									invalid={invalid[index] ?? false}
									locked={
										speakers.length <= 1
											? DRAMA_TEXT.removeLast
											: lines > 0
												? DRAMA_TEXT.removeLocked(lines)
												: null
									}
									onRemove={() => remove(index)}
								/>
							);
						})}
					</div>
				</>
			)}
		</section>
	);
}
