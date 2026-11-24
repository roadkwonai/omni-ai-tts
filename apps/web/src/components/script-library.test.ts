import { ORPCError } from "@orpc/client";
import type { ScriptSummary } from "@tts-pilot-app/api/script-contract";
import { createElement, type FunctionComponent, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

type Effect = { run: () => unknown; deps: readonly unknown[] | undefined };
type Fields = {
	channelId: string | null;
	onTitle: (title: string) => void;
	onChannel: (id: string | null) => void;
	onToggle: (
		group: "category" | "type",
		entry: { id: string; name: string },
		on: boolean,
	) => void;
};
const fake = vi.hoisted(() => ({
	client: {} as Record<string, (input: never) => Promise<unknown>>,
	invalidated: [] as unknown[],
	params: "",
	effects: [] as Effect[],
	search: undefined as { onChange: (q: string) => void } | undefined,
	// 있으면 다시 그려도 상태가 남는다(그린 순서로 찾는다)
	cells: null as unknown[] | null,
	at: 0,
	finalFocus: undefined as (() => unknown) | undefined,
	fields: undefined as Fields | undefined,
	submit: undefined as
		| ((event: { preventDefault: () => void }) => void)
		| undefined,
}));
// DOM 렌더러가 없다: 효과와 제출 처리기를 잡아 직접 부른다
vi.mock("react", async (original) => {
	const react = await original<typeof import("react")>();
	const { useState: real } = react;
	return {
		...react,
		useEffect: (run: () => unknown, deps?: readonly unknown[]) => {
			fake.effects.push({ run, deps });
		},
		useState: (first: unknown) => {
			const { cells } = fake;
			if (!cells) return real(first);
			const at = fake.at++;
			if (!(at in cells))
				cells[at] = typeof first === "function" ? first() : first;
			const set = (next: unknown) => {
				cells[at] = typeof next === "function" ? next(cells[at]) : next;
			};
			return [cells[at], set];
		},
	};
});
vi.mock("react/jsx-dev-runtime", async (original) => {
	const { jsxDEV, ...rest } = await original<{
		jsxDEV: (type: unknown, props: never, ...rest: unknown[]) => unknown;
	}>();
	return {
		...rest,
		jsxDEV: (type: unknown, props: { onSubmit?: never }, ...more: never[]) => {
			if (type === "form") fake.submit = props.onSubmit;
			return jsxDEV(type, props as never, ...more);
		},
	};
});
vi.mock("@tanstack/react-query", () => ({
	keepPreviousData: undefined,
	useInfiniteQuery: () => ({ isPending: true, error: null }),
	useMutation: () => ({ mutate: () => {} }),
	useQueryClient: () => ({
		invalidateQueries: ({ queryKey }: { queryKey: unknown[] }) =>
			fake.invalidated.push(queryKey[0]),
	}),
}));
vi.mock("@/lib/classes-view", () => import("../lib/classes-view"));
vi.mock(
	"@/lib/script-library-view",
	() => import("../lib/script-library-view"),
);
vi.mock("@/lib/script-text", () => import("../lib/script-text"));
vi.mock("@/lib/script-work", () => import("../lib/script-work"));
vi.mock("@/lib/voice-failure", () => import("../lib/voice-failure"));
vi.mock("@/utils/orpc", () => {
	const key = (name: string) => ({ key: () => [name] });
	return {
		client: fake.client,
		QUIET: {},
		orpc: {
			scriptList: { ...key("scriptList"), infiniteOptions: () => ({}) },
			scriptDuplicate: { mutationOptions: () => ({}) },
			scriptRemove: { mutationOptions: () => ({}) },
			channelList: key("channelList"),
			classificationList: key("classificationList"),
		},
	};
});
vi.mock("next/navigation", () => ({
	useSearchParams: () => new URLSearchParams(fake.params),
}));
vi.mock("@tts-pilot-app/ui/components/dialog", () => {
	const pass = ({ children }: { children?: ReactNode }) => children;
	return {
		Dialog: pass,
		DialogContent: (props: {
			children?: ReactNode;
			finalFocus: () => unknown;
		}) => {
			fake.finalFocus = props.finalFocus;
			return pass(props);
		},
		DialogDescription: pass,
		DialogHeader: pass,
		DialogTitle: pass,
	};
});
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("./class-form-dialog", () => ({
	DIALOG_BODY: "",
	DialogButtons: () => null,
	isComposingEnter: () => false,
}));
vi.mock("./class-group", () => ({ boxClass: "" }));
vi.mock("./confirm-dialog", () => ({ ConfirmDialog: () => null }));
vi.mock("./empty-state", () => ({ EmptyState: () => null }));
vi.mock("./notice", () => ({ SignInNotice: () => null }));
vi.mock("./saved-voices", () => ({
	useClassLists: () => ({
		channels: [],
		classes: [],
		loaded: true,
		failed: false,
		retry: () => {},
	}),
}));
vi.mock("./script-save-dialog", () => ({
	ScriptFields: (props: Fields) => {
		fake.fields = props;
		return null;
	},
}));
vi.mock("./voice-conditions", () => ({
	menuItem: "",
	VoiceConditions: ({ search }: { search: typeof fake.search }) => {
		fake.search = search;
		return null;
	},
}));
vi.mock("./voice-problem", () => ({
	ReloadButton: () => null,
	ReloadRow: () => null,
}));

const library: Record<string, unknown> = await import("./script-library");
const ScriptLibrary = library.ScriptLibrary as FunctionComponent;
const ScriptEditDialog = library.ScriptEditDialog as FunctionComponent<{
	mode: "edit" | "recent";
	row: ScriptSummary;
	channelNames: ReadonlyMap<string, string>;
	classes: readonly { id: string; name: string; kind: "category" | "type" }[];
	openerRef: { current: { isConnected: boolean } | null };
	focusWhenGone: () => unknown;
	onClose: () => void;
}>;

const row = {
	id: "s1",
	kind: "saved",
	title: "뉴스 대본",
	preview: "안녕",
	paragraphCount: 1,
	charCount: 2,
	channelId: null,
	classificationIds: ["known", "other-tab"],
	updatedAt: "2026-11-24T00:00:00.000Z",
} as ScriptSummary;
const replaceState = vi.fn();
beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal("window", { history: { replaceState }, scrollTo: () => {} });
	replaceState.mockClear();
	fake.invalidated.length = 0;
	fake.cells = null;
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

const pick = (id: string) => ({ id, name: id });
// change가 있으면 칸을 바꾸고 다시 그린 뒤 저장한다
async function submitEdit(
	onClose = vi.fn(),
	{
		mode = "edit" as "edit" | "recent",
		channelId = null as string | null,
		channels = [] as string[],
		opener = null as { isConnected: boolean } | null,
		change = undefined as ((fields: Fields) => void) | undefined,
	} = {},
) {
	if (change) fake.cells ??= [];
	const render = () => {
		fake.at = 0;
		renderToStaticMarkup(
			createElement(ScriptEditDialog, {
				mode,
				row: { ...row, channelId },
				channelNames: new Map(channels.map((id) => [id, id])),
				// 다른 탭에서 만든 분류(other-tab)는 이 목록에 아직 없다
				classes: [
					{ id: "known", name: "지식", kind: "category" },
					{ id: "calm", name: "차분함", kind: "type" },
				],
				openerRef: { current: opener },
				focusWhenGone: () => "다음 줄",
				onClose,
			}),
		);
	};
	render();
	if (change && fake.fields) {
		change(fake.fields);
		render();
	}
	fake.submit?.({ preventDefault: () => {} });
	await vi.advanceTimersByTimeAsync(0);
	return onClose;
}

// 고치기가 보낸 값. 목록이 오래됐으면 화면이 모르는 채널·분류가 붙어 있을 수 있다(다른 탭, CLI)
async function sentBy(change?: (fields: Fields) => void) {
	const scriptUpdate = vi.fn(async (_: object) => ({}));
	fake.client.scriptUpdate = scriptUpdate;
	await submitEdit(vi.fn(), { channels: ["ch"], change });
	return scriptUpdate.mock.calls[0]?.[0];
}
test("제목만 고치면 채널·분류 연결을 보내지 않는다(audit C7)", async () => {
	expect(await sentBy((fields) => fields.onTitle("새 제목"))).toEqual({
		id: "s1",
		title: "새 제목",
	});
});
test("채널만 바꾸면 분류 연결을 보내지 않는다(audit C7)", async () => {
	expect(await sentBy((fields) => fields.onChannel("ch"))).toEqual({
		id: "s1",
		channelId: "ch",
	});
});
test("분류를 바꾸면 채널은 보내지 않고 목록에 아직 없는 분류의 연결은 떼지 않는다(audit C7)", async () => {
	expect(
		await sentBy((fields) => fields.onToggle("type", pick("calm"), true)),
	).toEqual({ id: "s1", classificationIds: ["known", "calm", "other-tab"] });
});
test("바꾸지 않았거나 바꿨다가 되돌린 칸은 보내지 않는다(audit C7)", async () => {
	expect(await sentBy()).toEqual({ id: "s1" });
	expect(
		await sentBy((fields) => {
			fields.onToggle("category", pick("known"), false);
			fields.onToggle("category", pick("known"), true);
			fields.onChannel("ch");
			fields.onChannel(null);
		}),
	).toEqual({ id: "s1" });
});
test("최근 대본을 보관함에 저장할 때는 모든 칸을 보낸다", async () => {
	const scriptCreate = vi.fn(async (_: object) => ({ title: "뉴스 대본" }));
	fake.client.scriptGet = async () => ({ work: "작업" });
	fake.client.scriptCreate = scriptCreate;
	await submitEdit(vi.fn(), { mode: "recent", channelId: "ch" });
	expect(scriptCreate.mock.calls[0]?.[0]).toEqual({
		title: "뉴스 대본",
		channelId: "ch",
		classificationIds: ["known", "other-tab"],
		work: "작업",
	});
});

test("고른 채널·분류나 대본이 지워졌어도 고치기 창을 닫지 않고 고친 제목을 남긴다(audit N10)", async () => {
	fake.client.scriptUpdate = async () => {
		throw new ORPCError("NOT_FOUND");
	};
	const onClose = await submitEdit();
	expect(onClose).not.toHaveBeenCalled();
	// 저장 창과 같이 채널·분류 목록을 다시 받아 고를 것을 고친다
	expect(fake.invalidated).toEqual(
		expect.arrayContaining(["scriptList", "channelList", "classificationList"]),
	);
});

// 채널 ch와 분류 calm을 골라 저장했다가 거절된 뒤 다시 저장한다. 다시 받은 채널 목록이 channels다
async function retryWith(channels: string[]) {
	const scriptUpdate = vi.fn(async (_: object) => {
		throw new ORPCError("NOT_FOUND");
	});
	fake.client.scriptUpdate = scriptUpdate;
	const change = (fields: Fields) => {
		fields.onChannel("ch");
		fields.onToggle("type", pick("calm"), true);
	};
	await submitEdit(vi.fn(), { channelId: "old", channels: ["ch"], change });
	await submitEdit(vi.fn(), { channelId: "old", channels });
	return scriptUpdate.mock.calls.map(([input]) => input);
}
test("분류만 지워졌으면 다시 저장해도 고른 채널이 남는다(audit N10 리뷰)", async () => {
	expect(await retryWith(["ch"])).toEqual([
		{
			id: "s1",
			channelId: "ch",
			classificationIds: ["known", "calm", "other-tab"],
		},
		{ id: "s1", channelId: "ch", classificationIds: ["known", "calm"] },
	]);
	expect(fake.fields?.channelId).toBe("ch");
});
test("고른 채널이 지워졌으면 다시 저장할 때 채널만 뺀다(audit N10 리뷰)", async () => {
	const [first, again] = await retryWith([]);
	expect(first).toMatchObject({ channelId: "ch" });
	expect(again).toEqual({
		id: "s1",
		channelId: null,
		classificationIds: ["known", "calm"],
	});
	// 화면도 보내는 값과 같이 '채널 없음'이다
	expect(fake.fields?.channelId).toBeNull();
});

test("창을 연 줄이 사라졌으면 포커스를 다음 줄로, 남아 있으면 그 버튼으로 돌린다(UI 리뷰)", async () => {
	fake.client.scriptUpdate = async () => ({});
	const opener = { isConnected: true };
	await submitEdit(vi.fn(), { opener });
	expect(fake.finalFocus?.()).toBe(opener);
	await submitEdit(vi.fn(), { opener: { isConnected: false } });
	expect(fake.finalFocus?.()).toBe("다음 줄");
});

test("저장되면 고치기 창을 닫는다", async () => {
	fake.client.scriptUpdate = async () => ({});
	expect(await submitEdit()).toHaveBeenCalledOnce();
});

// React가 다시 그릴 때처럼 deps가 바뀐 효과의 정리 함수만 부른다
function draw(params: string) {
	fake.params = params;
	fake.effects.length = 0;
	renderToStaticMarkup(createElement(ScriptLibrary));
	return [...fake.effects];
}
test("쓰던 검색어는 메뉴로 다시 연 화면에 되살아나지 않는다(audit C8)", () => {
	const before = draw("q=뉴");
	const cleanups = before.map(({ run }) => run());
	fake.search?.onChange("뉴스");
	const after = draw("");
	before.forEach(({ deps }, index) => {
		const next = after[index]?.deps;
		const changed =
			!deps || !next || deps.some((dep, at) => !Object.is(dep, next[at]));
		const cleanup = cleanups[index];
		if (changed && typeof cleanup === "function") cleanup();
	});
	vi.advanceTimersByTime(1000);
	expect(replaceState).not.toHaveBeenCalled();
});
