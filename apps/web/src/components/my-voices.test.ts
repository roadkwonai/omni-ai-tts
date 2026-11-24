import { ORPCError } from "@orpc/client";
import type { MyVoice } from "@tts-pilot-app/api/my-voice-contract";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

type Mutation = {
	isPending: boolean;
	variables?: { id: string };
	mutate: (
		input: { id: string },
		handlers: { onError: (error: unknown) => void },
	) => void;
};
type Press = {
	children?: ReactNode;
	disabled?: boolean;
	"aria-busy"?: boolean;
	"aria-label"?: string;
	"aria-describedby"?: string;
	onClick?: (event: { currentTarget: null }) => void;
};
const fake = vi.hoisted(() => ({
	items: [] as unknown[],
	mutations: {} as Record<string, unknown>,
	settled: {} as Record<string, () => void>,
	invalidated: [] as unknown[],
	buttons: [] as unknown[],
	html: "",
	toastError: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
	useQuery: () => ({
		data: {
			items: fake.items,
			providers: { fish_audio: true, gemini: true },
		},
		dataUpdatedAt: 0,
		error: null,
		errorUpdateCount: 0,
		isPending: false,
	}),
	useMutation: ({ name }: { name: string }) =>
		fake.mutations[name] ?? { isPending: false, mutate: () => {} },
	useQueryClient: () => ({
		invalidateQueries: ({ queryKey }: { queryKey: unknown[] }) =>
			fake.invalidated.push(queryKey[0]),
	}),
}));
vi.mock("@tts-pilot-app/ui/components/button", () => ({
	buttonVariants: () => "",
	Button: (props: Press) => {
		fake.buttons.push(props);
		return props.children;
	},
}));
vi.mock("@tts-pilot-app/ui/components/dropdown-menu", () => {
	const pass = ({ children }: { children?: ReactNode }) => children;
	return {
		DropdownMenu: pass,
		DropdownMenuContent: () => null,
		DropdownMenuGroup: pass,
		DropdownMenuItem: pass,
		DropdownMenuSeparator: () => null,
		DropdownMenuTrigger: ({ render }: { render: ReactNode }) => render,
	};
});
vi.mock("@/lib/classes-view", () => import("../lib/classes-view"));
vi.mock("@/lib/connection-view", () => import("../lib/connection-view"));
vi.mock("@/lib/my-voice-text", () => import("../lib/my-voice-text"));
vi.mock("@/lib/my-voice-view", () => import("../lib/my-voice-view"));
vi.mock("@/lib/voice-failure", () => import("../lib/voice-failure"));
vi.mock("@/lib/saved-voice-view", () => import("../lib/saved-voice-view"));
vi.mock("@/utils/orpc", () => {
	const list = (name: string) => ({
		key: () => [name],
		queryOptions: () => ({ queryKey: [name] }),
	});
	const mutation = (name: string) => ({
		mutationOptions: ({ onSettled }: { onSettled: () => void }) => {
			fake.settled[name] = onSettled;
			return { name };
		},
	});
	return {
		client: {},
		QUIET: {},
		OWNED_LIST: {},
		orpc: {
			myVoiceList: list("myVoiceList"),
			savedVoiceList: list("savedVoiceList"),
			presetList: list("presetList"),
			channelList: list("channelList"),
			classificationList: list("classificationList"),
			myVoiceCheck: mutation("check"),
			myVoiceDelete: mutation("remove"),
			myVoiceSave: mutation("save"),
		},
	};
});
vi.mock("sonner", () => ({ toast: { error: fake.toastError } }));
vi.mock("./class-group", () => ({ boxClass: "" }));
vi.mock("./confirm-dialog", () => ({ ConfirmDialog: () => null }));
vi.mock("./demo", () => ({ DEMO_TEXT: {}, useDemo: () => false }));
vi.mock("./empty-state", () => ({ EmptyState: () => null }));
vi.mock("./my-voice-create", () => ({
	CREATE_ID: "create",
	MyVoiceCreate: () => null,
	ProviderText: ({ text }: { text: string }) => text,
}));
vi.mock("./my-voice-listen", () => ({ MyVoiceListen: () => null }));
vi.mock("./notice", () => ({ Notice: () => null, SignInNotice: () => null }));
vi.mock("./sample-player", () => ({
	SamplePlayerProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./voice-conditions", () => ({ menuItem: "" }));
vi.mock("./voice-problem", () => ({
	lockedButton: () => "",
	ReloadRow: () => null,
}));

const { MyVoices } = await import("./my-voices");

const item = (
	id: string,
	name: string,
	status: MyVoice["status"],
): MyVoice => ({
	id,
	provider: "fish_audio",
	name,
	status,
	reason: null,
	createdAt: "2026-11-24T00:00:00.000Z",
	savedVoiceId: null,
	voice: null,
	presets: [],
});
const draw = (items: MyVoice[], mutations: Record<string, Mutation> = {}) => {
	fake.items = items;
	fake.mutations = mutations;
	fake.buttons.length = 0;
	fake.html = renderToStaticMarkup(createElement(MyVoices));
	return fake.buttons as Press[];
};
const named = (buttons: Press[], text: string) =>
	buttons.filter(({ children, "aria-label": label }) =>
		[children, label].flat().includes(text),
	);
beforeEach(() => {
	fake.invalidated.length = 0;
	fake.toastError.mockClear();
});

test("한 줄이 진행 중이면 다른 줄의 주 동작과 ⋯도 잠긴다(audit C4)", () => {
	const buttons = draw(
		[item("a", "가", "processing"), item("b", "나", "processing")],
		{
			check: { isPending: true, variables: { id: "a" }, mutate: () => {} },
		},
	);
	const primary = named(buttons, "상태 확인");
	expect(primary.map(({ disabled }) => disabled)).toEqual([true, true]);
	// 진행 표시는 누른 줄에만 있다
	expect(primary.map((button) => button["aria-busy"] === true)).toEqual([
		true,
		false,
	]);
	for (const name of ["가 동작", "나 동작"])
		expect(named(buttons, name).map(({ disabled }) => disabled)).toEqual([
			true,
		]);
});

test("다른 줄이 진행 중이면 잠긴 이유 한 줄을 알리고 잠긴 줄의 두 버튼이 그 줄을 가리킨다(UI 리뷰)", () => {
	const items = [item("a", "가", "processing"), item("b", "나", "processing")];
	const buttons = draw(items, {
		check: { isPending: true, variables: { id: "a" }, mutate: () => {} },
	});
	const [, id, reason] =
		fake.html.match(
			/<p(?=[^>]*role="status")[^>]*id="([^"]+)"[^>]*>([^<]*)</,
		) ?? [];
	expect(reason).toContain("끝나면");
	expect(
		[
			...named(buttons, "상태 확인"),
			...named(buttons, "가 동작"),
			...named(buttons, "나 동작"),
		].map((button) => button["aria-describedby"]),
	).toEqual([undefined, id, undefined, id]);
	// 알림 자리는 늘 있고(읽어 주기·줄 높이) 진행 중이 아니면 비어 있다
	draw(items);
	expect(fake.html).toMatch(
		new RegExp(`<p(?=[^>]*role="status")[^>]*id="${id}"[^>]*></p>`),
	);
});

test("진행 중인 줄이 없으면 모두 눌린다", () => {
	const buttons = draw([
		item("a", "가", "processing"),
		item("b", "나", "processing"),
	]);
	expect(
		named(buttons, "상태 확인").map(({ disabled }) => disabled ?? false),
	).toEqual([false, false]);
});

test.each(["check", "remove", "save"])(
	"%s 뒤에는 채널·분류의 '성우 N명'도 다시 받는다(audit C4)",
	(name) => {
		draw([item("a", "가", "ready")]);
		fake.settled[name]?.();
		expect(fake.invalidated).toEqual(
			expect.arrayContaining(["channelList", "classificationList"]),
		);
	},
);

test("상태 확인의 공급자 오류는 새로 만들어졌다는 안내가 아니라 잠시 뒤 다시 하라는 안내다(audit N3)", () => {
	const check = vi.fn<Mutation["mutate"]>();
	const buttons = draw([item("a", "가", "processing")], {
		check: { isPending: false, mutate: check },
	});
	named(buttons, "상태 확인")[0]?.onClick?.({ currentTarget: null });
	check.mock.calls[0]?.[1].onError(
		new ORPCError("BAD_GATEWAY", {
			data: { provider: "fish_audio", reason: "provider_error" },
		}),
	);
	expect(fake.toastError.mock.calls).toEqual([
		["음성 서비스에 문제가 생겼어요. 잠시 뒤 다시 해 주세요."],
	]);
});
