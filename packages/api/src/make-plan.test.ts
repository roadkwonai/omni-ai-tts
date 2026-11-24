// packages/api/src/make-plan.test.ts
import { describe, expect, it } from "vitest";

import {
	type Found,
	type FoundMap,
	findTargets,
	lookupsOf,
	makePlan,
	mergeFound,
	paragraphStatus,
	receivePlan,
	signatureOf,
	usageByProvider,
} from "./make-plan";
import type { Paragraph, Work } from "./paragraph-script";
import {
	comboSignature,
	DEFAULT_SETTINGS,
	FISH_FREE_UNTIL,
	type FishModel,
} from "./providers/trial-options";
import type { SavedVoice } from "./saved-voice-contract";
import type { StudioRequest } from "./studio-contract";

const VOICES = [
	{
		id: "s1",
		unavailable: false,
		voice: {
			provider: "fish_audio",
			voiceId: "fa1",
			name: "지연",
			models: [],
		},
	},
] as unknown as SavedVoice[];
const setup = (model: FishModel) => ({
	provider: "fish_audio" as const,
	voiceId: "fa1",
	settings: { ...DEFAULT_SETTINGS.fish_audio, model },
});
const PS: Paragraph[] = [1, 2, 3].map((n) => ({
	id: `p${n}`,
	text: `무료로 만든 문단 ${n}`,
}));
const WORK: Work = {
	defaultVoice: setup("s2.1-pro-free"),
	gap: 0.5,
	channelId: null,
	paragraphs: PS,
};
const BEFORE = FISH_FREE_UNTIL - 1;
const AFTER = FISH_FREE_UNTIL;
const found = (id: string, status: Found["status"] = "done"): Found => ({
	id,
	createdAt: "2026-11-29T00:00:00.000Z",
	status,
	usage: { unit: "free", amount: 0 },
	bytes: 10,
});
const modelsOf = (requests: readonly StudioRequest[]) =>
	requests.map((request) => `${request.settings.model} ${request.text}`);
// 서버 찾기 응답을 합친 표. done의 키는 "모델 글"
const search = (
	ps: Paragraph[],
	done: readonly string[],
	status: Found["status"] = "done",
	now = AFTER,
): FoundMap => {
	const targets = findTargets(ps, WORK, VOICES, new Map(), true, now);
	return mergeFound(
		new Map(),
		targets,
		modelsOf(targets).map((key) =>
			done.includes(key) ? found(key, status) : null,
		),
	);
};
const FREE = PS.map((p) => `s2.1-pro-free ${p.text}`);

// Fish Audio 무료 모델이 끝난 뒤에도 끝나기 전에 무료로 만든 문단(보관 30일)을 다시 쓴다
describe("무료 모델 종료 뒤 저장된 무료 결과", () => {
	it("종료 전에 찾아 둔 결과는 종료 뒤 다시 찾지 않고 쓴다", () => {
		const table = search(PS, FREE, "done", BEFORE);
		expect(findTargets(PS, WORK, VOICES, table, false, AFTER)).toEqual([]);
		expect(
			paragraphStatus(
				PS[0] as Paragraph,
				WORK,
				VOICES,
				table,
				new Map(),
				AFTER,
			),
		).toBe("made");
		expect(receivePlan(PS, WORK, VOICES, table, AFTER)).toMatchObject({
			ok: true,
		});
	});
	it("처음 찾을 때는 무료 요청을 유료 요청보다 먼저 찾는다", () => {
		const [p] = PS;
		expect(
			modelsOf(
				findTargets(p ? [p] : [], WORK, VOICES, new Map(), false, AFTER),
			),
		).toEqual([`s2.1-pro-free ${p?.text}`, `s2.1-pro ${p?.text}`]);
		expect(
			modelsOf(findTargets(PS, WORK, VOICES, new Map(), false, BEFORE)),
		).toEqual(FREE);
	});
	it("찾을 서명은 보정 전·뒤 둘이고, 둘 다 찾은 문단은 다시 찾지 않는다", () => {
		const [p] = PS as [Paragraph, ...Paragraph[]];
		const at = (now: number, target = p) =>
			lookupsOf(target, WORK, VOICES, now).map(
				({ request, signature }) =>
					`${request.settings.model} ${signature === comboSignature(request)}`,
			);
		expect(at(AFTER)).toEqual(["s2.1-pro-free true", "s2.1-pro true"]);
		expect(at(BEFORE)).toEqual(["s2.1-pro-free true"]);
		expect(at(AFTER, { ...p, voice: setup("s2.1-pro") })).toEqual([
			"s2.1-pro true",
		]);
		expect(at(AFTER, { ...p, text: " " })).toEqual([]);
		const none = search(PS, []);
		expect(none.size).toBe(6);
		expect(findTargets(PS, WORK, VOICES, none, false, AFTER)).toEqual([]);
		// 하나만 찾은 문단은 못 찾은 쪽만 찾는다
		const [free, paid] = lookupsOf(p, WORK, VOICES, AFTER);
		for (const [known, rest] of [
			[free, paid],
			[paid, free],
		])
			expect(
				findTargets(
					[p],
					WORK,
					VOICES,
					new Map([[known?.signature ?? "", null]]),
					false,
					AFTER,
				),
			).toEqual([rest?.request]);
	});
	it("찾은 무료 결과를 만든 문단으로 세고 받는다", () => {
		const table = search(PS, FREE);
		expect(makePlan(PS, WORK, VOICES, table, AFTER)).toMatchObject({
			make: [],
			reused: 3,
			free: false,
		});
		const plan = receivePlan(PS, WORK, VOICES, table, AFTER);
		expect(plan.ok && plan.items.map((item) => item.found.id)).toEqual(FREE);
		// 화면·CLI가 문단의 결과를 표에서 찾는 키
		const keys = PS.map(
			(p) => signatureOf(p, WORK, VOICES, AFTER, table)?.signature ?? "",
		);
		expect(keys.map((key) => table.get(key)?.id)).toEqual(FREE);
		expect(findTargets(PS, WORK, VOICES, table, false, AFTER)).toEqual([]);
	});
	it("무료 결과가 없는 문단만 유료 모델로 만들고 사용량도 유료다", () => {
		const table = search(PS, FREE.slice(0, 2));
		const plan = makePlan(PS, WORK, VOICES, table, AFTER);
		expect(plan).toMatchObject({ reused: 2, free: false });
		expect(modelsOf(plan.make.map((item) => item.request))).toEqual([
			`s2.1-pro ${PS[2]?.text}`,
		]);
		expect(usageByProvider(plan.make, () => null, AFTER)).toMatchObject([
			{ provider: "fish_audio", count: 1, usage: { unit: "byte", amount: 25 } },
		]);
	});
	it("무료 결과가 완료가 아니면 유료 요청의 결과를 본다", () => {
		expect(
			makePlan(PS, WORK, VOICES, search(PS, FREE, "unknown"), AFTER),
		).toMatchObject({ reused: 0, unknown: [] });
		const paid = PS.map((p) => `s2.1-pro ${p.text}`);
		const plan = receivePlan(PS, WORK, VOICES, search(PS, paid), AFTER);
		expect(plan.ok && plan.items.map((item) => item.found.id)).toEqual(paid);
	});
	it("처음부터 유료 모델을 고른 문단은 같은 글의 무료 결과를 쓰지 않는다", () => {
		const paid = { ...(PS[0] as Paragraph), voice: setup("s2.1-pro") };
		const table = search([...PS, { ...paid, id: "p4" }], FREE);
		const plan = makePlan(
			[...PS, { ...paid, id: "p4" }],
			WORK,
			VOICES,
			table,
			AFTER,
		);
		expect(plan.reused).toBe(3);
		expect(plan.make.map((item) => item.id)).toEqual(["p4"]);
	});
});

describe("usageByProvider", () => {
	it("무료가 먼저이고 유료가 뒤여도 바이트로 센다", () => {
		const items = (["s2.1-pro-free", "s2.1-pro"] as const).map((model, i) => ({
			id: `p${i}`,
			n: i + 1,
			signature: model,
			request: { ...setup(model), text: "가나" },
		}));
		expect(usageByProvider(items, () => null, BEFORE)).toMatchObject([
			{ count: 2, usage: { unit: "byte", amount: 6 } },
		]);
	});
});
