// 웹에서 옮긴 순수 규칙의 대조 입력(T20). 기대값 shared-rules.fixtures.json은 옮기기 전 커밋 f66ac3e의 웹 원본(apps/web/src/lib)으로 이 함수를 돌려 만들었다.
// 시험에서만 쓴다. 입력을 고치면 기대값을 그 커밋의 원본으로 다시 만든다
import { createHash } from "node:crypto";

import type * as dramaTags from "./drama-autotag";
import type * as drama from "./drama-request";
import type { DraftLine, DraftSpeaker } from "./drama-request";
import type * as plan from "./make-plan";
import type * as numbers from "./number-reading";
import type * as tags from "./paragraph-autotag";
import type * as files from "./paragraph-files";
import type * as script from "./paragraph-script";
import type { Paragraph, VoiceSetup, Work } from "./paragraph-script";
import type { Preset, PresetValue } from "./preset-contract";
import type { ProviderId, Voice } from "./providers/contract";
import { DEFAULT_SETTINGS, type SettingsOf } from "./providers/trial-options";
import type { SavedVoice } from "./saved-voice-contract";
import type * as speaker from "./script-speaker";
import type * as sound from "./sound-join";
import type { StudioAutoTagOutput } from "./studio-contract";

export type Rules = {
	numbers: typeof numbers;
	speaker: typeof speaker;
	script: typeof script;
	plan: typeof plan;
	tags: typeof tags;
	files: typeof files;
	sound: typeof sound;
	drama: typeof drama;
	dramaTags: typeof dramaTags;
};

// Fish Audio 무료 기간 안과 밖
export const NOW = Date.parse("2026-10-20T03:00:00Z");
export const LATER = Date.parse("2026-12-15T03:00:00Z");

// 풀어 쓴 글(NFD), 폭 없는 공백, 방향 바꿈 글자는 소스에 그대로 두지 않는다
const NFD = "한".normalize("NFD");
const ZERO_WIDTH = String.fromCharCode(0x200b);
const RLO = String.fromCharCode(0x202e);

export const NUMBER_TEXTS = [
	"금액 12,345원, 1억 2천만 원, 100달러.",
	"전화 010-1234-5678, 2026년 6월 10일, 10월.",
	"오후 3:05에 시작, 화면은 16:10, 24:00까지.",
	"사과 3개와 20살, 2번 만났고 5대가 왔다.",
	"3.5%예요, 3.14159, 영하 -5도, -7점.",
	"1~3개, 10~20명, 1/2, 2026-06-10, 3·1.",
	"GPT-4o, iPhone 16, 007, v1.2.3, 1,2,3.",
	"30원칙 5분석 제3장 제12회 [break 2] 1조 5억, 9999999999999.",
	"숫자 없음",
];

const saved = (
	provider: ProviderId,
	voiceId: string,
	name: string,
	over: { unavailable?: boolean; models?: Voice["models"] } = {},
) =>
	({
		id: `saved-${voiceId}`,
		unavailable: over.unavailable ?? false,
		voice: { provider, voiceId, name, models: over.models ?? [] },
	}) as unknown as SavedVoice;
export const VOICES: SavedVoice[] = [
	saved("typecast", "tc1", "민지/차분", {
		models: [{ model: "ssfm-v21", emotions: ["normal", "happy", "sad"] }],
	}),
	saved("elevenlabs", "el1", "Rachel"),
	saved("fish_audio", "fa1", "지연"),
	saved("fish_audio", "fa2", "민수"),
	saved("airy", "ai1", "에어리"),
	saved("gemini", "ge1", "Kore"),
	saved("fish_audio", "gone", "없음", { unavailable: true }),
];
const setup = <P extends ProviderId>(
	provider: P,
	voiceId: string,
	over: Partial<SettingsOf[P]> = {},
) =>
	({
		provider,
		voiceId,
		settings: { ...DEFAULT_SETTINGS[provider], ...over },
	}) as VoiceSetup;
const PARAGRAPHS: Paragraph[] = [
	{ id: "p1", text: "사과 3개를 샀어요. [whispers] <sigh>" },
	{
		id: "p2",
		text: "값은 1,200원 [laughs]",
		gap: 1.2,
		voice: setup("typecast", "tc1", { emotion: "preset", preset: "happy" }),
		fixes: {
			text: "값은 1,200원 [laughs]",
			decisions: [
				{ start: 3, end: 9, original: "1,200원", choice: "apply" },
				{ start: 0, end: 1, original: "값", choice: "keep" },
			],
		},
	},
	{ id: "p3", text: "  \n " },
	{ id: "p4", text: "민수의 말 <sigh>", speaker: "민수" },
	{
		id: "p5",
		text: `${NFD}글 조합\r\n다음 줄 [excited]`,
		voice: setup("elevenlabs", "el1"),
	},
	{ id: "p6", text: "에어리 [whispers] 글", voice: setup("airy", "ai1") },
	{
		id: "p7",
		text: "제미나이 글",
		voice: setup("gemini", "ge1", { direction: "밝게" }),
	},
	{ id: "p8", text: "[laughs]", voice: setup("typecast", "tc1") },
	{ id: "p9", text: "못 쓰는 성우", voice: setup("fish_audio", "gone") },
	{ id: "p10", text: "사과 3개를 샀어요. [whispers] <sigh>" },
	{ id: "p11", text: "가".repeat(2100), voice: setup("typecast", "tc1") },
	{
		id: "p12",
		text: "플래시 글",
		voice: setup("elevenlabs", "el1", { model: "eleven_flash_v2_5" }),
	},
];
export const WORK: Work = {
	defaultVoice: setup("fish_audio", "fa1"),
	gap: 0.5,
	channelId: null,
	paragraphs: PARAGRAPHS,
	speakers: [
		{ name: "민수", voice: setup("fish_audio", "fa2", { model: "s2.1-pro" }) },
		{ name: "쉼", voice: null },
	],
};
const PRESETS = [
	{
		id: "preset1",
		unavailable: false,
		voice: { provider: "gemini", voiceId: "ge1" },
		provider: "gemini",
		settings: { ...DEFAULT_SETTINGS.gemini, direction: "차분하게" },
	},
] as unknown as Preset[];
const who = (
	name: string,
	provider: ProviderId,
	voiceId: string | null,
	presetId: string | null = null,
): DraftSpeaker => ({ name, provider, voiceId, presetId });
const CAST = [
	who("지연", "fish_audio", "fa1"),
	who("안 쓰는 화자", "fish_audio", null),
	who("민수", "fish_audio", "fa2"),
];
const SCENE_LINES: DraftLine[] = [
	{ id: "l1", speaker: 2, direction: " [작게] 웃으며 ", text: " 안녕 " },
	{
		id: "l2",
		speaker: 0,
		direction: "",
		text: "<whisper>그래</whisper>",
		gap: 1,
	},
];
const MIXED = [
	who("타입", "typecast", "tc1"),
	who("일레븐", "elevenlabs", "el1"),
	who("피시", "fish_audio", "fa1"),
	who("제미", "gemini", "ge1", "preset1"),
	who("에어", "airy", "ai1", "preset-gone"),
	who("이용 불가", "fish_audio", "gone"),
];
const MIXED_LINES: DraftLine[] = [
	{
		id: "m1",
		speaker: 0,
		direction: "작게",
		text: "타입 [laughs] 글",
		feel: { typecast: { emotion: "sad", intensity: 1.5 } },
	},
	{ id: "m2", speaker: 1, direction: "whispers", text: "일레븐 [laughs] 글" },
	{ id: "m3", speaker: 2, direction: "웃으며", text: "피시 <sigh> 글" },
	{ id: "m4", speaker: 3, direction: "힘차게", text: "제미 글" },
	{
		id: "m5",
		speaker: 4,
		direction: "",
		text: "에어 글",
		feel: { airy: { style: "bright" } },
	},
];
const PASTE = [
	`지연: 안녕\r\n민수： 반가워\n이어지는 말\n\n12:30 회의야\nhttps://a.b\n오후 3:05에 봐\n빈사람:\n새사람: ${NFD}글`,
	"이름 없는 줄\n둘째 줄",
	"가: 1\n나: 2\n다: 3\n라: 4\n마: 5",
	"\n \r\n",
	Array.from({ length: 51 }, (_, i) => `줄 ${i}`).join("\n"),
];

const hash = (value: string | Uint8Array) =>
	createHash("sha256").update(value).digest("hex").slice(0, 16);
const bytesOf = async (parts: (Blob | Uint8Array<ArrayBuffer>)[]) => {
	const bytes = new Uint8Array(await new Blob(parts).arrayBuffer());
	return `${bytes.length} ${hash(bytes)}`;
};
const floats = (...values: number[]) => new Float32Array(values);
// 긴 값은 길이와 해시로 줄이고(글 2,100자), 풀어 쓴 자모(NFD)는 눈에 보이게 적는다
const jamo = (char: string) => {
	const code = char.charCodeAt(0);
	return code >= 0x1100 && code <= 0x11ff ? `(U+${code.toString(16)})` : char;
};
const brief = (value: unknown): unknown =>
	JSON.parse(
		JSON.stringify(value ?? null, (_, v) =>
			typeof v !== "string"
				? v
				: v.length > 300
					? `${v.length} ${hash(v)}`
					: [...v].map(jamo).join(""),
		),
	);

// 규칙마다 결과 한 벌. 기대값과 모양까지 같아야 한다
export async function runRules(f: Rules) {
	const { script, plan, sound } = f;
	const requests = (now: number) =>
		PARAGRAPHS.map((p) => script.paragraphRequest(p, WORK, VOICES, now));
	const found = (() => {
		const targets = plan.findTargets(
			PARAGRAPHS,
			WORK,
			VOICES,
			new Map(),
			true,
			NOW,
		);
		return plan.mergeFound(
			new Map(),
			targets,
			targets.map((_, i) =>
				i > 2
					? null
					: {
							id: `r${i}`,
							createdAt: "2026-10-20T00:00:00.000Z",
							usage: { unit: "credit", amount: 1 },
							bytes: 4,
							status: i === 1 ? "unknown" : "done",
						},
			),
		);
	})();
	const open = PARAGRAPHS.filter((p) => !["p9", "p11"].includes(p.id));
	const made = plan.makePlan(open, WORK, VOICES, found, NOW);
	const blocked = plan.makePlan(PARAGRAPHS, WORK, VOICES, found, NOW);
	const doneAll = plan.mergeFound(
		found,
		made.make.map((item) => item.request),
		made.make.map((_, i) => ({
			id: `d${i}`,
			createdAt: "2026-10-20T00:00:00.000Z",
			usage: { unit: "credit", amount: 1 },
			bytes: 4,
			status: "done",
		})),
	);
	const statusOf = (p: Paragraph) =>
		plan.paragraphStatus(p, WORK, VOICES, found, new Map(), NOW);
	const { targets, skipped } = f.tags.autoTagTargets(
		PARAGRAPHS,
		WORK,
		VOICES,
		(p) => script.paragraphRequest(p, WORK, VOICES, NOW),
		statusOf,
	);
	const reply = {
		paragraphs: targets.map(({ sent }, i) => ({
			text: i === 0 ? `[laughs] ${sent.text}` : sent.text,
			direction: "새 말투",
			feel: {
				typecast: { emotion: "sad", intensity: 2 },
				airy: { style: "bright" },
			},
		})),
		skipped: 0,
	} as unknown as StudioAutoTagOutput;
	const changes = f.tags.autoTagChanges(targets, reply);
	const usable = f.drama.usableSpeakers(MIXED, VOICES, PRESETS);
	const acting = usable.map((s) =>
		f.drama.actingOf(
			s,
			f.drama.voiceOfSpeaker(s, VOICES),
			f.drama.speakerValue(s, PRESETS),
			"s2.1-pro-free",
			false,
		),
	);
	const sent = SCENE_LINES.map((line, i) => ({
		line,
		n: i + 1,
		direction: line.direction,
	}));
	const dramaChanges = f.dramaTags.autoTagChanges(
		sent,
		[
			{ direction: "크게", text: "안녕" },
			{ direction: "", text: "<whisper>그래</whisper> 좋아" },
		],
		(_, feel) => (feel ? "있음" : null),
	);
	const read = (
		lines: DraftLine[],
		over: {
			fromId?: string;
			count?: number;
			presets?: null;
			name?: string;
		} = {},
	) =>
		f.drama.readRequests(
			MIXED.map((s) => ({ ...s, name: over.name ?? s.name })),
			lines,
			{
				saved: VOICES,
				presets: over.presets === null ? null : PRESETS,
				headerModel: "s2.1-pro-free",
				now: LATER,
			},
			over.fromId ?? lines[0]?.id ?? "",
			over.count,
		);
	const ids = () => {
		let n = 0;
		return () => `id${++n}`;
	};
	return brief({
		readingItems: NUMBER_TEXTS.map((text) =>
			f.numbers
				.readingItems(text)
				.map((i) =>
					[
						i.start,
						i.end,
						i.original,
						i.kind,
						i.needsCheck,
						i.reason ?? "",
						...i.readings,
					].join("|"),
				),
		),
		speakerLine: PASTE[0]
			?.split(/\r?\n/)
			.map((row) => f.speaker.speakerLine(row)),
		spokenOf: PARAGRAPHS.map(script.spokenOf),
		applyCertain: script
			.applyCertain(PARAGRAPHS.slice(0, 2))
			.map((p) => [script.spokenOf(p), script.unreviewedList([p])]),
		blockOf: PARAGRAPHS.map((p) => script.blockOf(p, WORK, VOICES)),
		paragraphRequest: requests(NOW).map(
			(r) =>
				r &&
				JSON.stringify({ ...r, text: r.text.replace(/가{2100}/, "가×2100") }),
		),
		// 무료 기간이 끝난 뒤 달라지는 문단만
		paragraphRequestLater: requests(LATER).map(
			(r) => r?.settings.model ?? null,
		),
		pasteToParts: script.pasteToParts(
			"첫 문단이다. 길다.\r\n \r\n민수: 안녕\n이어짐\n\n끝",
			() => 8,
			4,
		),
		status: PARAGRAPHS.map(statusOf),
		chunks: plan
			.chunkTargets(
				made.make.map((item) => item.request),
				2,
				400,
			)
			.map((chunk) => chunk.length),
		makePlan: [made, blocked].map((p) => ({
			...p,
			make: p.make.map((item) => [item.id, item.n, hash(item.signature)]),
			estimate: p.estimate.map((item) => item.n),
			unknown: p.unknown.map(hash),
		})),
		usage: plan.usageByProvider(blocked.estimate, () => null, NOW),
		receivePlan: [
			plan.receivePlan(open, WORK, VOICES, found, NOW),
			plan.receivePlan(open, WORK, VOICES, doneAll, NOW),
			plan.receivePlan([], WORK, VOICES, found, NOW),
		].map((r) =>
			r.ok
				? r.items.map((i) =>
						[i.id, i.n, i.found.id, i.gap, i.voiceName, i.text].join("|"),
					)
				: r,
		),
		autoTagTargets: [
			targets.map((t) => [t.n, t.family, t.emotions, t.result, t.own]),
			skipped,
		],
		autoTagBatches: [
			targets,
			targets.slice(0, 1).flatMap((t) => Array.from({ length: 101 }, () => t)),
		].map((list) => f.tags.autoTagBatches(list).map((b) => b.length)),
		autoTagInputOf: f.tags
			.autoTagInputOf(targets)
			.paragraphs.map((p) => JSON.stringify(p)),
		autoTagChanges: changes.map(({ n, text, settings, fields }) => ({
			n,
			text,
			settings,
			fields,
		})),
		applyAutoTag: (() => {
			const out = f.tags.applyAutoTag(
				PARAGRAPHS,
				WORK,
				changes,
				new Set(changes.map((c) => c.id)),
			);
			return [out.applied, out.changed, hash(JSON.stringify(out.paragraphs))];
		})(),
		srtOf: f.files.srtOf([
			{
				start: 0,
				end: 1.2345,
				text: f.files.stripTags("안녕 [laughs]\n<삼국지>"),
			},
			{ start: 1.5, end: 2, text: "" },
			{ start: 3661.9996, end: 3700, text: "끝" },
		]),
		fileNames: [
			f.files.workFileName(`가/나 다:라${ZERO_WIDTH}`, new Date(NOW), "srt"),
			f.files.paragraphFileName(7, "A/B 성우", "첫 문단 글".repeat(6), "mp3"),
			f.files.safeName(`../x${RLO}`),
		],
		pcm16: [...sound.pcm16(floats(0, 0.5, -0.5, 1, -1, 1.5, -2, 0.00002))],
		monoOf: [...sound.monoOf([floats(0.5, -0.25, 1), floats(0.25, 0.25, -1)])],
		trimSilence: [
			[
				...sound.trimSilence(
					floats(0, 0, 0.001, 0.5, 0.2, 0.003, 0.00316, 0, 0),
					50,
				),
			],
			[...sound.trimSilence(floats(0, 0.003), 50)],
		],
		spansOf: sound.spansOf([44100, 22050, 10], [0.5, 0.02, 3], 44100),
		joinWav: await bytesOf(
			sound.joinWav(
				[
					new Blob([sound.pcm16(floats(0.1, -0.1))]),
					new Blob([sound.pcm16(floats(0.3))]),
					new Blob([]),
				],
				[0.05, 0.01],
			),
		),
		gapOf: [0.26, "1.04", "", 9, -1, "x", null].map(sound.gapOf),
		sceneRequest: [
			f.drama.requestOf({
				sceneName: " 첫 만남 ",
				speakers: CAST,
				lines: SCENE_LINES,
				model: "s2.1-pro",
				settings: { speed: 1, temperature: 0.7 },
			}),
			f.drama.requestOf({
				sceneName: "",
				speakers: MIXED,
				lines: MIXED_LINES,
				model: "s2.1-pro",
				settings: { speed: 1, temperature: 0.7 },
			}),
			f.drama.requestOf({
				sceneName: "",
				speakers: CAST,
				lines: SCENE_LINES.map((line) => ({ ...line, speaker: 1 })),
				model: "s2.1-pro",
				settings: { speed: 1, temperature: 0.7 },
			}),
		],
		usableSpeakers: usable.map((s) => [s.voiceId, s.presetId]),
		acting,
		lineRequest: MIXED_LINES.map((line) => {
			const s = usable[line.speaker] as DraftSpeaker;
			return JSON.stringify(
				f.drama.lineRequest(
					f.drama.voiceOfSpeaker(s, VOICES) as Voice,
					f.drama.speakerValue(s, PRESETS) as PresetValue,
					acting[line.speaker]?.family as never,
					line,
					LATER,
				),
			);
		}),
		parsePaste: PASTE.map((raw) => f.drama.parsePaste(raw, CAST, ids())).map(
			(r) =>
				"error" in r
					? r
					: {
							speakers: r.speakers.map((s) => JSON.stringify(s)),
							lines: r.lines.map((l) => JSON.stringify(l)),
							from: r.from,
						},
		),
		splitOk: [
			["done", [{}]],
			["done", null],
			["unknown", [{}]],
			["done", [{}, {}]],
		].map(([status, segments]) =>
			f.drama.splitOk({ status, segments, request: { lines: [{}] } } as never),
		),
		dramaAutoTagChanges: dramaChanges.map(({ n, fields, patch }) => ({
			n,
			fields,
			patch,
		})),
		dramaAutoTagApply: f.dramaTags.autoTagApply(
			[...SCENE_LINES]
				.reverse()
				.map((line) => (line.id === "l1" ? { ...line, text: "고침" } : line)),
			dramaChanges,
		),
		// 이름 없는 화자·없는 화자는 번호 이름
		dramaSpeakerNameOf: [0, 1, 2].map((i) =>
			f.drama.speakerNameOf([{ name: ` ${NFD}글 ` }, { name: "  " }], i),
		),
		readRequests: [
			read(MIXED_LINES),
			read(MIXED_LINES, { fromId: "m3", count: 1 }),
			read(MIXED_LINES, { presets: null }),
			read([{ id: "x1", speaker: 5, direction: "", text: "글" }]),
			read([{ id: "x2", speaker: 2, direction: "", text: "나".repeat(201) }]),
			read([{ id: "x3", speaker: 0, direction: "", text: "[laughs]" }]),
			read([{ id: "x4", speaker: 2, direction: "", text: "글" }], {
				name: "",
			}),
		].map((r) =>
			// before는 옮긴 뒤 더한 칸이다(무료 모델 종료 뒤 찾기, drama-request.test.ts가 본다)
			"problem" in r
				? r
				: r.lines.map(({ before: _, ...line }) => JSON.stringify(line)),
		),
		autoTagInput: [
			f.dramaTags.autoTagInput(
				CAST,
				SCENE_LINES,
				() => ({ family: "fish_s2", model: "s2.1-pro-free", emotions: null }),
				true,
			).input,
			f.dramaTags.autoTagInput(
				usable.map((s, i) => (i === 1 ? { ...s, name: " " } : s)),
				[...MIXED_LINES, { id: "m6", speaker: 5, direction: "", text: " \n " }],
				(i) => acting[i] as NonNullable<(typeof acting)[number]>,
				false,
			).input,
		].map((input) => ({
			mode: input.mode,
			speakers: input.speakers.map((s) => JSON.stringify(s)),
			lines: input.lines.map((line) => JSON.stringify(line)),
		})),
	});
}
