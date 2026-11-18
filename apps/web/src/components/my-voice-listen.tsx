"use client";

import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tts-pilot-app/ui/components/dialog";
import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

import {
	READING_FIRST_SENTENCE,
	MY_VOICE_TEXT as T,
} from "@/lib/my-voice-text";

import { CREATE_ID } from "./my-voice-create";
import { usePlayer } from "./sample-player";
import { SentenceBar } from "./sentence-bar";
import { TrialProvider, useSentence } from "./trial-provider";
import { TrialResults } from "./trial-results";
import { TrialSection } from "./trial-section";

// 처음 열 때 문장 칸이 비어 있으면 읽을 거리 첫 문장으로 채운다(이미 쓴 문장은 덮지 않는다)
function FillFirstSentence() {
	const { text, setText } = useSentence();
	// biome-ignore lint/correctness/useExhaustiveDependencies: 열릴 때 한 번만 채운다
	useEffect(() => {
		if (text === "") setText(READING_FIRST_SENTENCE);
	}, []);
	return null;
}

// 내 보이스 '내 문장으로 들어보기' 창(브리프 5절). 캐스팅 패널의 내 문장 듣기 부품을 그 클론 Voice로 그대로 쓴다.
// 열 때만 마운트되므로 문장·설정·재생은 창을 닫으면 사라진다. SamplePlayerProvider는 바깥(my-voices)의 것을 쓴다
export function MyVoiceListen({
	name,
	voice,
	openerRef,
	onClose,
}: {
	name: string;
	voice: Voice;
	openerRef: RefObject<HTMLElement | null>;
	onClose: () => void;
}) {
	// 바깥 Provider의 소리를 쓰므로 창을 닫을 때 직접 멈춘다(내 문장 결과의 blob 주소도 함께 사라진다)
	const { stop } = usePlayer();
	const stopRef = useRef(stop);
	useLayoutEffect(() => {
		stopRef.current = stop;
	});
	useEffect(() => () => stopRef.current(), []);
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent
				// 만들기 창의 '결과 → 들어보기'로 열면 연 버튼이 없어 페이지의 '만들기'로 돌아간다
				finalFocus={() =>
					openerRef.current ?? document.getElementById(CREATE_ID) ?? true
				}
				className="md:max-w-2xl"
			>
				<DialogHeader>
					<DialogTitle className="wrap-anywhere break-keep">
						{T.listenTitle(name)}
					</DialogTitle>
					<DialogDescription>{T.noSample}</DialogDescription>
				</DialogHeader>
				<TrialProvider>
					<div className="flex flex-col gap-4">
						<FillFirstSentence />
						{/* 클론은 기본 샘플이 없어 '기본 샘플은 무료' 안내를 뺀다. 요금은 모델별 표시가 맡는다 */}
						<SentenceBar provider={voice.provider} hint={null} />
						<TrialSection voice={voice} />
						<TrialResults voice={voice} />
					</div>
				</TrialProvider>
			</DialogContent>
		</Dialog>
	);
}
