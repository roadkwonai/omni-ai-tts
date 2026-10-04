"use client";

import type { Voice } from "@tts-pilot-app/api/providers/contract";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Play, Square } from "lucide-react";

import {
	AGE_LABEL,
	GENDER_LABEL,
	labelOf,
	USE_CASE_LABEL,
} from "@/lib/voice-filter";

import { useSample } from "./sample-player";

// 카드에 보이는 콘텐츠 태그 수. 나머지는 "+N"(접근 이름에는 모두 넣는다, 브리프 5절)
const VISIBLE_TAGS = 2;
const tagClass =
	"rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground text-xs";

// 브리프 5절 카드와 7절 샘플 버튼 상태표.
export function VoiceCard({ voice }: { voice: Voice }) {
	const { status, toggle } = useSample(voice.voiceId);
	const playing = status === "playing";
	const { previewUrl } = voice;
	const useCases = voice.useCases.map((value) =>
		labelOf(USE_CASE_LABEL, value),
	);
	return (
		<article
			className={cn(
				// relative: 안의 sr-only(absolute) 글자가 선반 ul의 잘림 안에 머물게 하는 기준 상자. transition: 재생 중 ring(box-shadow)도 전환한다
				"relative flex h-full flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border ring-inset transition",
				// 재생 중: 안쪽 2px 청록 링(크기가 바뀌지 않고, 가로 선반의 넘김 영역에서 잘리지 않는다)
				playing && "ring-2 ring-primary",
			)}
		>
			<div className="flex items-start gap-2">
				<h3 className="min-w-0 flex-1">
					<span className="font-bold text-lg">{voice.name}</span>
					{voice.englishName ? (
						<>
							{" "}
							<span
								translate="no"
								className="ml-0.5 text-muted-foreground text-sm"
							>
								{voice.englishName}
							</span>
						</>
					) : null}
				</h3>
				{playing ? <Badge variant="primary">재생 중</Badge> : null}
			</div>
			<p className="text-muted-foreground text-sm">
				{voice.gender ? labelOf(GENDER_LABEL, voice.gender) : "성별 정보 없음"}{" "}
				· {voice.age ? labelOf(AGE_LABEL, voice.age) : "연령 정보 없음"}
			</p>
			{useCases.length > 0 ? (
				<p className="flex flex-wrap gap-1.5">
					<span className="sr-only">콘텐츠: {useCases.join(", ")}</span>
					{useCases.slice(0, VISIBLE_TAGS).map((label) => (
						<span key={label} aria-hidden="true" className={tagClass}>
							{label}
						</span>
					))}
					{useCases.length > VISIBLE_TAGS ? (
						<span aria-hidden="true" className={tagClass}>
							+{useCases.length - VISIBLE_TAGS}
						</span>
					) : null}
				</p>
			) : null}
			{/* 모델과 감정 수는 짝으로만 줄을 바꾼다(모델 둘이면 카드 너비를 넘는다). 구분점은 앞 짝의 끝에 붙여 줄 머리에 오지 않게 한다 */}
			<p
				translate="no"
				className="flex flex-wrap gap-x-1.5 text-muted-foreground text-sm tabular-nums"
			>
				{voice.models.map((model, index) => (
					<span key={model.model} className="whitespace-nowrap">
						{model.model} · 감정 {model.emotions.length}
						{index < voice.models.length - 1 ? " ·" : ""}
					</span>
				))}
			</p>
			<div className="mt-auto flex flex-col gap-2 pt-1">
				{status === "failed" ? (
					<p className="text-sm text-warning">재생하지 못했어요</p>
				) : null}
				{previewUrl === null ? (
					<Button
						variant="secondary"
						size="lg"
						className="w-full"
						disabled
						aria-label={`${voice.name} 샘플 없음`}
					>
						샘플 없음
					</Button>
				) : (
					<Button
						variant={playing ? "default" : "outline"}
						size="lg"
						className="w-full"
						// 불러오는 중에 누르면 멈춘다. 접근 이름에 보이는 글자 '샘플 듣기'를 그대로 담는다(WCAG 2.5.3).
						aria-label={
							playing
								? `${voice.name} 샘플 정지`
								: status === "loading"
									? `${voice.name} 샘플 듣기 취소`
									: status === "failed"
										? `${voice.name} 기본 샘플 다시 듣기`
										: `${voice.name} 기본 샘플 듣기`
						}
						aria-busy={status === "loading"}
						onClick={() => toggle(voice.voiceId, voice.name, previewUrl)}
					>
						{status === "loading" ? (
							<Spinner data-icon="inline-start" aria-hidden="true" />
						) : playing ? (
							<Square
								data-icon="inline-start"
								aria-hidden="true"
								className="fill-current"
							/>
						) : (
							<Play
								data-icon="inline-start"
								aria-hidden="true"
								className="fill-current"
							/>
						)}
						{playing ? "정지" : status === "failed" ? "다시 듣기" : "샘플 듣기"}
					</Button>
				)}
			</div>
		</article>
	);
}
