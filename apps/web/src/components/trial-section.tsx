"use client";

import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	comboSignature,
	DEFAULT_SETTINGS,
	estimate,
} from "@tts-pilot-app/api/providers/trial-options";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Coins, Info, Square } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { castingLoadView, sameSettings } from "@/lib/preset-view";
import {
	costCopy,
	dataNote,
	requestOf,
	trialAriaLabel,
	trialProblemText,
	usageText,
} from "@/lib/trial-view";
import { voiceKey } from "@/lib/voice-view";
import { DEMO_TEXT, useDemo } from "./demo";
import { type PresetHost, PresetLine, PresetMenu } from "./preset-menu";
import { Options } from "./setting-fields";
import { useRate } from "./trial-confirm";
import { useShownText, useTrial } from "./trial-provider";
import { useTrialItems } from "./trial-results";
import { lockedButton } from "./voice-problem";

// 패널 '내 문장 듣기' 구역(브리프 12절). 자리는 이용 조건 뒤, 결과 목록 앞이다(사용자 결정 U5).
// 머리('처음 값으로'는 늘 그리고 기본값이면 흐림, D12) → 옵션 → 데이터 안내 → 바닥에 붙는 줄(예상 사용량·버튼·새로 만들기·이유·오류, U3).
// 바닥 줄은 패널(칸은 voice-panel-sticky, 서랍은 본문)의 스크롤 칸 바닥에 붙고, 제자리가 보이면 풀린다
export function TrialSection({ voice }: { voice: Voice }) {
	const trial = useTrial();
	// 공개 데모는 공급자를 부르지 않아 돈 표시와 '크레딧 0'이 없다
	const demo = useDemo();
	const text = useShownText();
	const request = requestOf(voice, text, trial.settings);
	const key = voiceKey(voice);
	const rate = useRate(request);
	const items = useTrialItems(voice);
	const signature = comboSignature(request);
	const saved =
		trial.hasSaved(request) ||
		items.data?.some((item) => comboSignature(item.request) === signature) ===
			true;
	const block = trial.blockOf(voice, text);
	const mine = trial.busy?.key === key;
	const creating = mine && trial.busy?.phase === "creating";
	const playing = trial.playing(voice);
	const usage = estimate(request, rate.multiplier);
	const note = dataNote(request);
	const problem = trial.problem(key);
	const problemText = problem
		? trialProblemText(voice.provider, problem)
		: null;
	// 처음 값과 다르거나 불러온 프리셋이 있으면 '처음 값으로'가 켜진다(누르면 표시도 지운다)
	const changed =
		!sameSettings(
			voice.provider,
			trial.settings[voice.provider],
			DEFAULT_SETTINGS[voice.provider],
		) || trial.loaded(voice.provider) !== null;
	const [resetKey, setResetKey] = useState(0);
	// 캐스팅 프리셋 메뉴의 화면 상태: 불러오기는 설정만 바꾼다(T8 그대로). 바꾼 뒤 옵션 칸을 다시 그린다
	const host: PresetHost = {
		provider: voice.provider,
		voice,
		settings: trial.settings,
		loaded: trial.loaded(voice.provider),
		apply: (preset) => {
			trial.loadPreset(preset.provider, {
				id: preset.id,
				settings: preset.settings,
			});
			setResetKey((current) => current + 1);
		},
		loadView: (preset) => castingLoadView(voice, trial.settings, preset),
	};
	const headingId = useId();
	const reasonId = useId();
	const problemId = useId();
	// 빈 문장이면 예상 사용량 줄을 숨긴다(D9). 오류 줄이 있으면 막는 이유 줄은 숨기고 버튼 설명을 오류 줄로 돌린다(D11)
	const empty = block === "문장을 먼저 써 주세요";
	const describedBy = problemText ? problemId : block ? reasonId : undefined;
	return (
		<section aria-labelledby={headingId} className="flex flex-col gap-3">
			<div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
				<h3 id={headingId} className="font-bold">
					내 문장 듣기
				</h3>
				{/* 두 버튼 사이 8px: 붙어 있으면 휴대폰에서 '처음 값으로'를 잘못 눌러 값을 잃는다(브리프 5절) */}
				<div className="flex items-center gap-2">
					<PresetMenu host={host} />
					<Button
						variant="ghost"
						size="lg"
						focusableWhenDisabled
						className={cn("text-muted-foreground", lockedButton(!changed))}
						disabled={!changed}
						onClick={() => {
							trial.resetSettings(voice.provider);
							setResetKey((current) => current + 1);
						}}
					>
						처음 값으로
					</Button>
				</div>
			</div>
			<PresetLine host={host} />
			<div
				key={`${voice.provider}:${resetKey}`}
				className="flex flex-col gap-3"
			>
				<Options
					voice={voice}
					request={request}
					onChange={(patch) => trial.setSetting(voice.provider, patch)}
				/>
			</div>
			{note ? (
				<p className="flex gap-2 text-muted-foreground text-sm">
					<Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
					{note}
				</p>
			) : null}
			<div className="sticky bottom-0 z-10 flex flex-col gap-2 border-border border-t pt-3 pb-1 max-xl:bg-popover xl:bg-card">
				{empty ? null : (
					<p className="flex flex-wrap items-center gap-1.5 text-sm tabular-nums">
						{saved ? (
							demo ? (
								DEMO_TEXT.savedFree
							) : (
								costCopy(voice.provider).saved
							)
						) : usage.unit === "free" ? (
							<Badge variant="success">무료</Badge>
						) : demo ? null : (
							<>
								<Coins aria-hidden="true" className="size-4 text-warning" />
								새로 만들 때 {usageText(usage)}
							</>
						)}
						{!saved && !demo && rate.missing ? (
							<span className="text-muted-foreground">
								(배율을 확인하지 못했어요)
							</span>
						) : null}
					</p>
				)}
				<Button
					size="lg"
					className={cn("w-full", lockedButton(!playing && block !== null))}
					focusableWhenDisabled
					disabled={!playing && (block !== null || mine)}
					aria-label={
						demo && !playing && !creating && !saved
							? DEMO_TEXT.listenName(voice.name)
							: trialAriaLabel(
									voice.name,
									request,
									playing
										? "playing"
										: creating
											? "busy"
											: saved
												? "saved"
												: "idle",
								)
					}
					aria-describedby={describedBy}
					onClick={(event) =>
						playing ? trial.stop() : trial.listen(voice, event.currentTarget)
					}
				>
					{playing ? (
						<Square
							data-icon="inline-start"
							aria-hidden="true"
							className="fill-current"
						/>
					) : mine ? (
						<Spinner data-icon="inline-start" aria-hidden="true" />
					) : saved || demo ? null : usage.unit === "free" ? (
						<Badge variant="success">무료</Badge>
					) : (
						// 채운 청록 버튼 안의 유료 표식은 글자색이다(Global Constraints)
						<Coins data-icon="inline-start" aria-hidden="true" />
					)}
					{playing
						? "정지"
						: creating
							? "만드는 중…"
							: saved
								? "저장된 결과 듣기"
								: "내 문장 듣기"}
				</Button>
				{/* 같은 조합을 다시 만들기(유료). 결과 줄이 아니라 여기 하나만 둔다(사용자 결정 U4) */}
				{saved && !playing ? (
					<Button
						variant="outline"
						size="lg"
						className={cn("w-full", lockedButton(block !== null))}
						focusableWhenDisabled
						disabled={block !== null || mine}
						aria-label={
							demo
								? DEMO_TEXT.regenerateName(voice.name)
								: `${voice.name} 새로 만들기, ${usage.unit === "free" ? "무료" : costCopy(voice.provider).paid}`
						}
						aria-describedby={describedBy}
						onClick={(event) =>
							trial.listen(voice, event.currentTarget, { regenerate: true })
						}
					>
						{usage.unit === "free" ? (
							<Badge data-icon="inline-start" variant="success">
								무료
							</Badge>
						) : demo ? null : (
							<Coins
								data-icon="inline-start"
								aria-hidden="true"
								className="text-warning"
							/>
						)}
						새로 만들기
					</Button>
				) : null}
				{problemText ? (
					<div
						id={problemId}
						className="flex flex-col items-start text-sm text-warning"
					>
						<p>{problemText.text}</p>
						{problemText.connections ? (
							// T4 사유 안내와 같은 44px 링크 버튼(계획 리뷰 D25)
							<Button
								variant="link"
								size="lg"
								nativeButton={false}
								className="px-0"
								render={<Link href="/connections" />}
							>
								연결 상태 보기
							</Button>
						) : null}
					</div>
				) : block ? (
					<p id={reasonId} className="text-muted-foreground text-sm">
						{block}
					</p>
				) : null}
			</div>
		</section>
	);
}
