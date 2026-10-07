"use client";

import type { Voice, VoiceSample } from "@tts-pilot-app/api/providers/contract";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@tts-pilot-app/ui/components/sheet";
import { BadgeCheck, Info, TriangleAlert } from "lucide-react";
import {
	type RefObject,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

import { PROVIDER_LABEL } from "@/lib/connection-view";
import { LIBRARY_TEXT } from "@/lib/saved-voice-view";
import {
	chipsOf,
	emotionLines,
	sampleLabel,
	sampleSubject,
	termLines,
	voiceKey,
} from "@/lib/voice-view";

import { useSample } from "./sample-player";
import { SavedSection } from "./saved-section";
import { useSavedItem } from "./saved-voices";
import { useOptionalTrial } from "./trial-provider";
import { TrialResults } from "./trial-results";
import { TrialSection } from "./trial-section";
import { SampleButton } from "./voice-row";

const SOURCE = { public: "공개 라이브러리", account: "내 계정" } as const;
// 행 알약과 같이 안쪽 경계 한 줄(다크 카드 위에서도 보이게, critique 2026-10-05)
const chip =
	"rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground text-xs ring-1 ring-border ring-inset";

// 패널의 샘플 한 줄(브리프 5절 패널 3, 7절, 계획 리뷰 U3): 왼쪽 44px 둥근 아이콘 버튼과 이름표. 재생 키가 샘플 주소라 행의 같은 샘플과 같은 상태다
function PanelSample({ voice, sample }: { voice: Voice; sample: VoiceSample }) {
	const { status, toggle } = useSample(sample.url);
	const label = sampleLabel(sample);
	return (
		<li className="flex min-h-11 items-center gap-3">
			<SampleButton
				status={status}
				subject={`${voice.name} ${label}`}
				onToggle={() =>
					toggle(sample.url, sampleSubject(voice.name, sample), sample.url)
				}
			/>
			<span className="flex flex-wrap items-center gap-x-2">
				{label}
				{status === "playing" ? <Badge variant="primary">재생 중</Badge> : null}
				{status === "failed" ? (
					<span className="text-sm text-warning">재생하지 못했어요</span>
				) : null}
			</span>
		</li>
	);
}

// 설명(브리프 5절 패널 2): 세 줄에서 잘렸을 때만 '더 보기'를 보인다. 잘림은 글자 수가 아니라 그린 높이로 판정한다(계획 리뷰 D11).
// 성우마다 key로 다시 만들어 펼침 상태가 다음 성우로 넘어가지 않는다.
// 숨은 탭(keepMounted, display:none)에서 마운트되면 높이가 0이라 처음에는 잘림이 없다고 나온다. 크기가 바뀔 때마다 다시 재서 탭을 열거나 창 너비가 바뀌어도 맞춘다.
// 펼친 동안은 재지 않는다(잘림이 없어지므로). 접으면 다시 잰다.
function Description({ text }: { text: string }) {
	const ref = useRef<HTMLParagraphElement>(null);
	const [expanded, setExpanded] = useState(false);
	const [clamped, setClamped] = useState(false);
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el || expanded) return;
		const measure = () => setClamped(el.scrollHeight > el.clientHeight);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	}, [expanded]);
	return (
		<div>
			<p
				ref={ref}
				className={
					expanded
						? "text-muted-foreground"
						: "line-clamp-3 text-muted-foreground"
				}
			>
				{text}
			</p>
			{clamped ? (
				<Button
					variant="link"
					size="lg"
					aria-label={expanded ? "설명 접기" : "설명 더 보기"}
					onClick={() => setExpanded((value) => !value)}
				>
					{expanded ? "접기" : "더 보기"}
				</Button>
			) : null}
		</div>
	);
}

// 패널 내용(머리의 제목은 칸에서는 h2, 서랍에서는 SheetTitle이 맡는다).
// 구역 순서는 사용자 결정 U2: … 이용 조건 → 내 문장 듣기 → 담기 → 내 문장 결과. 성우 보관함(TrialProvider 밖)에는 내 문장 듣기 구역이 없고 담기가 기본 샘플 바로 뒤다
export function VoicePanelContent({ voice }: { voice: Voice }) {
	const trial = useOptionalTrial();
	const saved = useSavedItem(voice);
	const samples: VoiceSample[] =
		voice.samples.length > 0
			? voice.samples
			: voice.previewUrl
				? [{ language: null, title: null, url: voice.previewUrl }]
				: [];
	const chips = chipsOf(voice);
	const terms = termLines(voice);
	const emotions = emotionLines(voice);
	// ElevenLabs 공개 라이브러리 성우는 이용 가능 확인을 하지 않는다는 것을 숨기지 않는다(계획 리뷰 D16, PRODUCT 원칙 4). 담긴 성우에만.
	// 캐스팅은 이용 조건 뒤, 보관함은 담기 칸 바로 위(담기 칸을 올린 뒤에도 붙어 있게)
	const notChecked =
		saved && voice.provider === "elevenlabs" && voice.source === "public" ? (
			<p className="text-muted-foreground text-sm">{LIBRARY_TEXT.notChecked}</p>
		) : null;
	// 본문 글자는 칸과 서랍 모두 16px이다(SheetContent 기본 14px을 덮는다)
	return (
		<div className="flex flex-col gap-5 text-base">
			{/* 이용 불가 안내는 무채색 안내 상자(T7 브리프 B6, trial-confirm 안내 상자와 같은 모양) */}
			{saved?.unavailable ? (
				<p role="note" className="flex gap-2 rounded-xl bg-muted p-3 text-sm">
					<TriangleAlert
						aria-hidden="true"
						className="mt-0.5 size-4 shrink-0"
					/>
					{LIBRARY_TEXT.unavailableNotice}
				</p>
			) : null}
			{/* Typecast는 출처 구분이 없어 공급자 이름만 보인다(critique 2026-10-05) */}
			<p className="text-muted-foreground text-sm">
				<span translate="no">{PROVIDER_LABEL[voice.provider]}</span>
				{voice.provider === "typecast" ? null : ` · ${SOURCE[voice.source]}`}
			</p>
			{chips.length > 0 ? (
				<ul className="flex flex-wrap gap-1.5" aria-label="공급자 분류">
					{chips.map((label) => (
						<li key={label} className={chip}>
							{label}
						</li>
					))}
				</ul>
			) : null}
			{voice.description ? (
				<Description key={voiceKey(voice)} text={voice.description} />
			) : null}
			<section className="flex flex-col gap-2">
				<h3 className="font-bold">기본 샘플</h3>
				{samples.length > 0 ? (
					<ul className="flex flex-col gap-1">
						{samples.map((sample) => (
							<PanelSample key={sample.url} voice={voice} sample={sample} />
						))}
					</ul>
				) : (
					<p className="text-muted-foreground text-sm">기본 샘플이 없어요</p>
				)}
			</section>
			{/* 성우 보관함은 정리가 일이라 담기 칸을 기본 샘플 바로 뒤에 둔다(critique P2). 캐스팅은 U2 자리 그대로 */}
			{trial ? null : (
				<>
					{notChecked}
					<SavedSection voice={voice} />
				</>
			)}
			{voice.provider === "typecast" ? (
				emotions.length > 0 ? (
					<section className="flex flex-col gap-2">
						<h3 className="font-bold">모델별 감정</h3>
						<ul
							className="flex flex-col gap-1 text-muted-foreground text-sm"
							translate="no"
						>
							{emotions.map((line) => (
								<li key={line}>{line}</li>
							))}
						</ul>
					</section>
				) : null
			) : terms.length > 0 ? (
				<section className="flex flex-col gap-2">
					<h3 className="font-bold">이용 조건</h3>
					<ul className="flex flex-col gap-1.5 text-sm">
						{terms.map((line) => {
							const Icon =
								line.kind === "licensed"
									? BadgeCheck
									: line.tone === "warning"
										? TriangleAlert
										: Info;
							return (
								<li
									key={line.text}
									className="flex gap-2 text-muted-foreground"
								>
									<Icon
										aria-hidden="true"
										className={
											line.tone === "warning"
												? "mt-0.5 size-4 shrink-0 text-warning"
												: "mt-0.5 size-4 shrink-0"
										}
									/>
									{line.text}
								</li>
							);
						})}
					</ul>
				</section>
			) : null}
			{trial ? notChecked : null}
			{trial ? (
				<>
					<TrialSection voice={voice} />
					<SavedSection voice={voice} />
					<TrialResults voice={voice} />
				</>
			) : null}
		</div>
	);
}

// 1200px 이상: 오른쪽 칸(브리프 9절). 목록을 받으면 첫 성우가 골라져 있다(AC8). 화면보다 길면 패널 안에서 스크롤한다
// id는 쓰는 쪽(CastingWorkspace)이 useId로 정해 행의 aria-controls와 맞춘다. 탭을 숨긴 채 남겨 두므로 고정 id는 겹친다
export function VoicePanel({ voice, id }: { voice: Voice; id: string }) {
	const titleId = useId();
	return (
		<aside
			id={id}
			aria-labelledby={titleId}
			className="voice-panel-sticky flex flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-border ring-inset"
		>
			<h2 id={titleId} className="text-balance font-bold text-xl">
				{voice.name}
			</h2>
			<VoicePanelContent voice={voice} />
		</aside>
	);
}

// 1199px 이하: 서랍(767px 이하는 전체 화면). 열리면 제목에 포커스가 가고, 닫으면 그 행으로 돌아간다(AC8)
// 폭은 SheetContent 기본(w-full·md:max-w-md)이다. 닫기 버튼이 absolute라 SheetContent가 스크롤하면 함께 올라간다.
// 그래서 SheetContent는 overflow-hidden이고 머리 아래 본문 칸만 스크롤한다(코디네이터 판정, Task 8 리뷰).
export function VoiceSheet({
	voice,
	open,
	onOpenChange,
	finalFocus,
}: {
	voice: Voice | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	finalFocus: RefObject<HTMLButtonElement | null>;
}) {
	const titleRef = useRef<HTMLHeadingElement>(null);
	const trial = useOptionalTrial();
	return (
		<Sheet open={open && voice !== null} onOpenChange={onOpenChange}>
			<SheetContent
				initialFocus={titleRef}
				finalFocus={finalFocus}
				className="overflow-hidden"
			>
				{voice ? (
					<>
						<SheetHeader>
							{/* 열리면 스크립트로 포커스를 받는다. 키보드로 열었으면 2px 윤곽선을 보인다 */}
							<SheetTitle
								ref={titleRef}
								tabIndex={-1}
								className="text-balance text-xl outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid focus-visible:outline-offset-2"
							>
								{voice.name}
							</SheetTitle>
							<SheetDescription className="sr-only">
								{trial
									? "성우 정보, 기본 샘플, 내 문장 듣기, 담기"
									: "성우 정보, 기본 샘플, 담기"}
							</SheetDescription>
						</SheetHeader>
						<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
							<VoicePanelContent voice={voice} />
						</div>
					</>
				) : null}
			</SheetContent>
		</Sheet>
	);
}
