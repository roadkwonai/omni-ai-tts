// apps/web/src/components/drama-confirm.tsx
"use client";

import { sceneChars } from "@tts-pilot-app/api/drama-script";
import { normalizeText } from "@tts-pilot-app/api/providers/trial-options";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@tts-pilot-app/ui/components/alert-dialog";
import { Coins, TriangleAlert } from "lucide-react";
import { type ReactNode, type RefObject, useId, useRef, useState } from "react";

import { castOrder, DRAMA_TEXT, scriptHead } from "@/lib/drama-view";
import { savedOf } from "@/lib/studio-view";

import { type DramaPending, useDrama } from "./drama-provider";

// 유료 확인 창(브리프 5.9). 유료 모델 둘(s2.1-pro·drama-3)이 생성마다 거친다. 무료는 provider.start가 확인 없이 만든다.
// 첫 포커스 '취소'. 닫히면(취소·Esc·'크레딧 쓰고 만들기') 연 버튼(막대 주 버튼)으로 돌아간다. 바깥 누르기로는 닫히지 않는다(AlertDialog).
// 두 번 눌림은 렌더를 기다리지 않는 sentRef로 막는다(T5 TrialConfirm과 같다). 서버 선점이 정본이고 이것은 보조다
export function DramaConfirm() {
	const drama = useDrama();
	const cancelRef = useRef<HTMLButtonElement>(null);
	const { pending } = drama;
	return (
		<AlertDialog
			open={pending !== null}
			onOpenChange={(open) => !open && drama.cancel()}
		>
			{pending ? (
				<AlertDialogContent
					initialFocus={cancelRef}
					finalFocus={pending.opener ? { current: pending.opener } : undefined}
				>
					<ConfirmBody pending={pending} cancelRef={cancelRef} />
				</AlertDialogContent>
			) : null}
		</AlertDialog>
	);
}

// 정의 목록 한 줄(이름 왼쪽, 값 오른쪽)
function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex justify-between gap-4">
			<dt className="shrink-0 text-muted-foreground">{label}</dt>
			<dd className="wrap-anywhere min-w-0 text-right">{children}</dd>
		</div>
	);
}

function ConfirmBody({
	pending,
	cancelRef,
}: {
	pending: DramaPending;
	cancelRef: RefObject<HTMLButtonElement | null>;
}) {
	const drama = useDrama();
	const warnId = useId();
	const [sent, setSent] = useState(false);
	const sentRef = useRef(false);
	const { request, usage, bytes, unknownSame } = pending;
	// 대본에 나오는 화자만, 처음 나온 순서. 성우 이름은 담은 목록에서(빠졌으면 id)
	const cast = castOrder(request.lines).map((index) => {
		const speaker = request.speakers[index];
		const voiceId = speaker?.voiceId ?? "";
		const voice =
			savedOf(drama.savedVoices, voiceId, "fish_audio")?.voice.name ?? voiceId;
		return DRAMA_TEXT.castPair(normalizeText(speaker?.name ?? ""), voice);
	});
	const basis = DRAMA_TEXT.basis(request.model);
	// 경고 줄(버튼 위). 설명 안이라 창을 열 때 함께 읽히고, 버튼 설명으로도 잇는다(음성 작업실 audit F1)
	const warnings = [
		request.model === "drama-3" ? DRAMA_TEXT.drama3Warning : null,
		unknownSame ? DRAMA_TEXT.unknownRetry : null,
	].filter((warning) => warning !== null);
	return (
		<>
			<AlertDialogHeader>
				<AlertDialogTitle>{DRAMA_TEXT.confirmTitle}</AlertDialogTitle>
			</AlertDialogHeader>
			<AlertDialogDescription
				render={<div />}
				className="flex flex-col gap-3 text-foreground"
			>
				<p className="text-muted-foreground">{DRAMA_TEXT.confirmCredit}</p>
				<dl className="flex flex-col gap-2 text-sm">
					<Row label={DRAMA_TEXT.confirmScene}>
						{DRAMA_TEXT.sceneSummary(
							normalizeText(request.sceneName) || DRAMA_TEXT.scenePlaceholder,
							request.lines.length,
							sceneChars(request.lines),
						)}
					</Row>
					<div className="flex min-w-0 flex-col gap-1">
						<dt className="text-muted-foreground">
							{DRAMA_TEXT.confirmScript}
						</dt>
						<dd className="wrap-anywhere min-w-0">
							{scriptHead(request.lines)}
						</dd>
					</div>
					<Row label={DRAMA_TEXT.confirmSpeakers}>{cast.join(" · ")}</Row>
					<Row label={DRAMA_TEXT.confirmModel}>
						<span translate="no">{DRAMA_TEXT.modelName[request.model]}</span>
					</Row>
					{/* 근거는 금액 아래 별도 회색 줄(음성 작업실 확인 창과 같다) */}
					<div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
						<dt className="whitespace-nowrap text-muted-foreground">
							{DRAMA_TEXT.confirmEstimate}
						</dt>
						<dd className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5 tabular-nums">
							<Coins aria-hidden="true" className="size-4 text-warning" />
							{DRAMA_TEXT.confirmUsage(usage, bytes)}
						</dd>
						{basis ? (
							<dd className="basis-full text-left text-muted-foreground md:text-right">
								{basis}
							</dd>
						) : null}
					</div>
				</dl>
				{warnings.length > 0 ? (
					<div id={warnId} className="flex flex-col gap-2">
						{warnings.map((warning) => (
							<p key={warning} className="flex gap-2 text-sm text-warning">
								<TriangleAlert
									aria-hidden="true"
									className="mt-0.5 size-4 shrink-0"
								/>
								{warning}
							</p>
						))}
					</div>
				) : null}
			</AlertDialogDescription>
			<AlertDialogFooter>
				<AlertDialogCancel ref={cancelRef} size="lg">
					{DRAMA_TEXT.cancel}
				</AlertDialogCancel>
				<AlertDialogAction
					size="lg"
					aria-describedby={warnings.length > 0 ? warnId : undefined}
					disabled={sent}
					onClick={() => {
						if (sentRef.current) return;
						sentRef.current = true;
						setSent(true);
						drama.confirm(pending);
					}}
				>
					{/* 채운 청록 버튼 안의 유료 표식은 글자색이다(DESIGN.md) */}
					<Coins data-icon="inline-start" aria-hidden="true" />
					{DRAMA_TEXT.confirmMake}
				</AlertDialogAction>
			</AlertDialogFooter>
		</>
	);
}
