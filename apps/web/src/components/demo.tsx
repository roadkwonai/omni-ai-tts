"use client";

import { Badge } from "@tts-pilot-app/ui/components/badge";
import { createContext, type ReactNode, useContext } from "react";

// 공개 데모 여부. 서버가 APP_MODE를 읽어 (app) 앱 틀에서 한 번 내려 주고, 클라이언트는 env를 읽지 않는다.
const DemoContext = createContext(false);

export function DemoProvider({
	demo,
	children,
}: {
	demo: boolean;
	children: ReactNode;
}) {
	return <DemoContext value={demo}>{children}</DemoContext>;
}

export const useDemo = () => useContext(DemoContext);

// 데모 안내 문구(공급자를 부르지 않는 자리마다 같은 말을 쓴다)
export const DEMO_TEXT = {
	band: "공개 데모 · 예시 데이터는 매일 처음 상태로 돌아가요",
	account: "공개 데모",
	sample: "데모 샘플",
	connectionsTitle: "공개 데모에서는 공급자를 부르지 않아요",
	connectionsDescription:
		"연결 상태는 본인용 작업실에서만 확인해요. 여기서는 만들기 결과로 데모 샘플이 나와요.",
	myVoicesTitle: "공개 데모에서는 내 보이스를 만들거나 지울 수 없어요",
	myVoicesDescription:
		"클론은 공급자 계정이 있어야 해서 데모에서는 막아 두었어요.",
	listTitle: "공개 데모는 저장해 둔 목록만 보여요",
	listDescription:
		"이 성우 목록은 데모에 담겨 있지 않아요. 다른 공급자를 골라 보세요.",
	autoTag: "공개 데모에서는 자동 태그를 쓸 수 없어요. 공급자를 부르지 않아요.",
	// 확인 창·버튼 문구. 데모는 미리 만든 샘플을 돌려줘 비용이 없다
	listenTitle: "데모 샘플로 들어 볼까요?",
	listenAction: "데모 샘플 듣기",
	makeTitle: "데모 샘플로 만들까요?",
	makeAction: "데모 샘플로 만들기",
	makeNote: "공급자를 부르지 않고 미리 만든 데모 샘플이 나와요.",
	makeName: "장면 만들기, 데모 샘플",
	listenFree: "공급자 없이",
	sentenceHint: "데모 샘플로 나와요.",
	savedFree: "저장된 결과",
	savedCount: (count: number) => `저장된 결과 ${count.toLocaleString()}개`,
	receiveFree: "받기는 공급자를 부르지 않아요",
	// sampleName은 '기본 샘플'(받침 없음, 로)과 '참고 음성'(받침 있음, 으로) 둘뿐이다
	voiceNote: (sampleName: string) =>
		sampleName === "참고 음성"
			? "비슷한 목소리는 참고 음성으로 들어 보세요"
			: "성우 본래 목소리는 기본 샘플로 들어 보세요",
	listenName: (name: string) => `${name} 내 문장 듣기, 데모 샘플`,
	regenerateName: (name: string) => `${name} 새로 만들기, 데모 샘플`,
	autoTagParagraphName: "자동 태그 추천",
	autoTagDramaName: "전체 자동 태그",
} as const;

// 머리 띠(모든 앱 화면 위, 한 줄, 닫기 없음)
export function DemoBand() {
	return (
		<p className="break-keep border-b bg-primary-subtle px-4 py-2 text-center text-foreground text-xs sm:text-sm">
			{DEMO_TEXT.band}
		</p>
	);
}

// 결과 자리의 작은 표시. 데모가 아니면 아무것도 그리지 않는다
export function DemoBadge() {
	return useDemo() ? (
		<Badge variant="secondary">{DEMO_TEXT.sample}</Badge>
	) : null;
}
