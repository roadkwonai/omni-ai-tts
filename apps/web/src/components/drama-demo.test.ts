import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DramaItem } from "@tts-pilot-app/api/drama-contract";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

// web vitest는 @/ 별칭을 풀지 못한다: 같은 모듈을 상대 경로로 돌려주고, 공급자·서버로 가는 곳은 가짜로 둔다
vi.mock("@/lib/drama-view", () => import("../lib/drama-view"));
vi.mock("@/lib/classes-view", () => import("../lib/classes-view"));
vi.mock("@/lib/studio-view", () => import("../lib/studio-view"));
vi.mock("@/utils/orpc", () => ({
	OWNED_LIST: {},
	orpc: {
		dramaList: { queryOptions: () => ({ queryKey: ["dramaList"] }) },
		dramaDelete: { mutationOptions: () => ({}) },
	},
}));

const take = {
	id: "t1",
	createdAt: "2026-10-22T01:42:00.000Z",
	usage: { unit: "free", amount: 0 },
	bytes: 44 + 88_200 * 10,
	segments: null,
	status: "done",
	request: {
		sceneName: "장면",
		model: "drama-3",
		settings: { speed: 1, temperature: 0.7 },
		speakers: [{ name: "지연", voiceId: "f1" }],
		lines: [{ speaker: 0, direction: "", text: "안녕하세요." }],
	},
} as unknown as DramaItem;

const drama = {
	generating: false,
	model: "drama-3",
	takes: [take],
	takesLoad: "ready",
	picks: {},
	shown: null,
	restoreScript: () => () => {},
	focusStage: () => {},
	switchModel: () => {},
};
vi.mock("./drama-provider", () => ({
	DRAMA_STAGE_ID: "drama-stage",
	useDrama: () => drama,
	useScriptKey: () => "key",
	stageOrMain: () => {},
}));
// 시간축 시험: 나뉜 테이크로 그리고(split), 줄 구간(segments)을 있게·없게 바꾼다
const audioState = vi.hoisted(() => ({
	split: false,
	segments: null as unknown,
}));
vi.mock("./drama-take", () => ({
	lineAt: () => 0,
	useTakeAudio: () => ({
		take: audioState.segments
			? { ...take, segments: audioState.segments }
			: take,
		group: [take],
		picked: [],
		status: "",
		split: audioState.split,
		followAll: () => {},
	}),
	useTakeTime: () => ({ playing: false, sceneLine: 0 }),
}));
vi.mock("./drama-undo", () => ({ showScriptUndo: () => {} }));
vi.mock("./drama-voice-dialog", () => ({
	SPEAKER_MARK: ["bg-primary"],
	SpeakerMark: () => null,
}));
vi.mock("./class-group", () => ({
	boxClass: "box",
	RowAction: () => null,
}));
vi.mock("./confirm-dialog", () => ({ ConfirmDialog: () => null }));
vi.mock("./voice-problem", () => ({ lockedButton: () => null }));

const { DemoProvider } = await import("./demo");
const { DramaStage } = await import("./drama-stage");
const { DramaTakes } = await import("./drama-takes");

const NOT_SPLIT = "대사별로 나누지 못했어요";
const NOT_SPLIT_BADGE = "나누지 못함";
const SAMPLE = "데모 샘플";

function render(demo: boolean, node: () => unknown) {
	return renderToStaticMarkup(
		createElement(
			QueryClientProvider,
			{ client: new QueryClient() },
			createElement(DemoProvider, {
				demo,
				children: createElement(node as never),
			}),
		),
	);
}

test("공개 데모의 무대는 나누지 못함 경고를 숨기고 '데모 샘플' 배지를 단다", () => {
	const html = render(true, DramaStage);
	expect(html).not.toContain(NOT_SPLIT);
	expect(html).toContain(SAMPLE);
});

test("본인용 무대는 나누지 못함 경고를 보이고 데모 배지는 없다", () => {
	const html = render(false, DramaStage);
	expect(html).toContain(NOT_SPLIT);
	expect(html).not.toContain(SAMPLE);
});

test("공개 데모의 이전 테이크는 '나누지 못함' 배지를 숨기고 본인용은 보인다", () => {
	expect(render(true, DramaTakes)).not.toContain(NOT_SPLIT_BADGE);
	expect(render(false, DramaTakes)).toContain(NOT_SPLIT_BADGE);
});

test("줄 구간이 없는 무대는 화자별 빈 띠를 그리지 않고, 있으면 그린다", () => {
	audioState.split = true;
	try {
		audioState.segments = null;
		expect(render(true, DramaStage)).not.toContain("h-5 rounded-sm bg-muted");
		audioState.segments = [{ start: 0, end: 1, cutStart: 0, cutEnd: 1 }];
		expect(render(true, DramaStage)).toContain("h-5 rounded-sm bg-muted");
	} finally {
		audioState.split = false;
		audioState.segments = null;
	}
});
