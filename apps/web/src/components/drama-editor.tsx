// apps/web/src/components/drama-editor.tsx
"use client";

import {
	DRAMA_SCENE_NAME_MAX,
	type DramaModel,
} from "@tts-pilot-app/api/drama-script";
import {
	codePoints,
	normalizeText,
} from "@tts-pilot-app/api/providers/trial-options";
import { Input } from "@tts-pilot-app/ui/components/input";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { useId } from "react";

import { DRAMA_TEXT, dramaModelsOf, FREE_MODEL } from "@/lib/drama-view";
import { failureOf } from "@/lib/voice-failure";

import { fieldClass } from "./class-form-dialog";
import { DramaAutoTag } from "./drama-autotag";
import { DramaBar } from "./drama-bar";
import { DramaConfirm } from "./drama-confirm";
import { DramaLines } from "./drama-lines";
import { DramaProvider, useDrama } from "./drama-provider";
import { DramaReadProvider } from "./drama-read";
import { DramaReadConfirm } from "./drama-read-confirm";
import { Sampling } from "./drama-sampling";
import { DramaSpeakers } from "./drama-speakers";
import { DramaStage } from "./drama-stage";
import { TakeAudioProvider } from "./drama-take";
import { DramaTakes } from "./drama-takes";
import { showScriptUndo } from "./drama-undo";
import { SignInNotice } from "./notice";
import { PageHeader } from "./page-header";
import { SamplePlayerProvider } from "./sample-player";
import { useSavedList } from "./saved-voices";
import { RadioMenu } from "./voice-conditions";

// 머리 동작 묶음(브리프 17절 1): 장면 이름(보이는 이름표, 768px 이상 w-48, 767px 이하 한 줄 가득) → 모델 고르기(RadioMenu, DN-10) → 샘플링.
// 장면 이름은 자르지 않고 40자를 넘으면 경고 경계(막는 이유가 말한다). 모델 메뉴에는 Coins를 두지 않는다(고르기다)
function DramaHead() {
	const drama = useDrama();
	const id = useId();
	const { sceneName } = drama;
	const over =
		codePoints(normalizeText(sceneName)) > DRAMA_SCENE_NAME_MAX ||
		// 계약의 원문 상한(× 4 UTF-16)을 넘어도 막는 이유가 말한다(dramaBlock과 같은 기준)
		sceneName.length > DRAMA_SCENE_NAME_MAX * 4;
	return (
		<>
			<div className="flex w-full items-center gap-2 md:w-auto">
				<label htmlFor={id} className="shrink-0 font-bold text-sm">
					{DRAMA_TEXT.sceneName}
				</label>
				<Input
					id={id}
					name="drama-scene-name"
					data-drama-field=""
					autoComplete="off"
					value={sceneName}
					placeholder={DRAMA_TEXT.scenePlaceholder}
					aria-invalid={over || undefined}
					onChange={(event) => drama.setSceneName(event.target.value)}
					className={cn(fieldClass, "min-w-0 flex-1 md:w-48 md:flex-none")}
				/>
			</div>
			<RadioMenu<DramaModel>
				label={DRAMA_TEXT.model}
				value={drama.model}
				align="start"
				// 무료 기간이 끝나면 dramaModelsOf가 무료 모델을 뺀다. 무료는 기존 '무료' 배지, 유료 둘은 " · 유료"(modelLabel).
				// 항목 아래 회색 둘째 줄이 결과 차이를 말한다(modelNote, 트리거 글자와 접근 이름은 그대로)
				options={dramaModelsOf().map((model) =>
					model === FREE_MODEL
						? {
								value: model,
								label: DRAMA_TEXT.modelLabel[model],
								note: DRAMA_TEXT.modelNote[model],
								free: true,
							}
						: {
								value: model,
								label: DRAMA_TEXT.modelLabel[model],
								note: DRAMA_TEXT.modelNote[model],
							},
				)}
				onChange={drama.setModel}
			/>
			<Sampling />
		</>
	);
}

// 머리 → 편집 열(최대 1024px, 왼쪽 정렬, 구역 사이 32px): 화자 → 대본(+ 도구줄) → 막대 → 무대 → 이전 테이크(브리프 5.1, 11절 19).
// 막대는 767px 이하에서 화면 바닥에 고정, 768px 이상에서는 sticky이고 DOM은 대본 바로 뒤라 Tab이 무대·이전 테이크를 지나지 않고 주 버튼에 닿는다(음성 작업실 DN-1과 같다).
// 열 바닥 여백은 막대 높이 + 24px(studio-bar-space)
function DramaBody() {
	return (
		<>
			<PageHeader
				title={DRAMA_TEXT.title}
				description={DRAMA_TEXT.description}
				actions={<DramaHead />}
			/>
			<div className="max-md:studio-bar-space px-4 md:px-11 md:pb-10">
				<div className="flex max-w-5xl flex-col gap-8">
					<DramaSpeakers />
					<DramaLines />
					<DramaBar />
					<DramaStage />
					<DramaTakes />
				</div>
			</div>
			<DramaConfirm />
			<DramaReadConfirm />
		</>
	);
}

// 드라마 작업실(T9.5 스펙 4절, 브리프 docs/briefs/drama.md). 소유자가 없으면 머리와 주소 안내 하나다
// (담은 성우 목록의 UNAUTHORIZED로 판정, 음성 작업실과 같다). 한 번에 한 오디오는 페이지의 플레이어 하나가 맡는다
export function DramaEditor() {
	const saved = useSavedList();
	if (failureOf(saved.error) === "unauthorized")
		return (
			<>
				<PageHeader
					title={DRAMA_TEXT.title}
					description={DRAMA_TEXT.description}
				/>
				<div className="px-4 pb-10 md:px-11">
					<SignInNotice />
				</div>
			</>
		);
	return (
		<SamplePlayerProvider>
			<DramaProvider>
				{/* 줄 표시(읽는 줄·만드는 줄·실패 줄)와 '이 줄부터 읽기'가 읽기 상태를 쓴다. 페이지 플레이어와 초안 안쪽이다 */}
				<DramaReadProvider>
					{/* 무대 테이크 소리 하나를 무대·장면 플레이어·대본 줄·막대 받기가 같이 쓴다(스펙 17.9) */}
					<TakeAudioProvider>
						{/* 전체 자동 태그 창 둘. 버튼은 대본 머리에 있다. 실행 취소는 대본 실행 취소 알림 칸 하나다 */}
						<DramaAutoTag showUndo={showScriptUndo}>
							<DramaBody />
						</DramaAutoTag>
					</TakeAudioProvider>
				</DramaReadProvider>
			</DramaProvider>
		</SamplePlayerProvider>
	);
}
