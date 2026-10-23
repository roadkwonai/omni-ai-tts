// 버리는 시험 스크립트: Fish 다화자 + 단어 시각으로 대사별 파일 자르기. 키는 출력하지 않는다.
// node drama-spike.mjs list
// node drama-spike.mjs gen <model> <voice0> <voice1> <outdir>
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const KEY = process.env.FISH_AUDIO_API_KEY;
if (!KEY) throw new Error("FISH_AUDIO_API_KEY 없음");
const ALLOWED = new Set(["s2.1-pro-free", "drama-3"]); // 철자가 틀리면 유료 s2.1-pro로 조용히 넘어간다

const LINES = [
	[0, "[작게 한숨 쉬며]", "또 늦었네. 삼십 분이나 기다렸어."],
	[1, "[숨을 헐떡이며]", "미안, 미안! 지하철이 갑자기 멈춰 버렸어."],
	[0, "[의심스럽게]", "지난주에도 지하철 핑계였잖아."],
	[1, "[멋쩍게 웃으며]", "이번엔 진짜야. 대신 오늘 저녁은 내가 살게."],
	[0, "[못 이기는 척]", "비싼 거 먹을 거야. 각오해."],
	[1, "", "<whisper>지갑아, 미안하다.</whisper>"],
];
const NAMES = ["지연", "민수"];

const [mode, model, v0, v1, outdir] = process.argv.slice(2);

if (mode === "list") {
	const r = await fetch(
		"https://api.fish.audio/model?language=ko&page_size=30&sort_by=score",
		{ headers: { Authorization: `Bearer ${KEY}` } },
	);
	const j = await r.json();
	for (const m of j.items ?? [])
		console.log(
			[
				m._id,
				m.title,
				(m.tags ?? []).join(","),
				m.languages?.join(","),
				m.like_count,
			].join(" | "),
		);
	process.exit(0);
}

if (mode !== "gen" || !ALLOWED.has(model) || !v0 || !v1 || !outdir)
	throw new Error(
		"usage: gen <s2.1-pro-free|drama-3> <voice0> <voice1> <outdir>",
	);

const text = LINES.map(
	([s, tag, t]) => `<|speaker:${s}|>${tag ? `${tag} ` : ""}${t}`,
).join("\n");
fs.mkdirSync(outdir, { recursive: true });
fs.writeFileSync(`${outdir}/request-text.txt`, text);
console.log({
	model,
	chars: [...text].length,
	utf8Bytes: Buffer.byteLength(text),
});

const t0 = Date.now();
const res = await fetch("https://api.fish.audio/v1/tts/stream/with-timestamp", {
	method: "POST",
	headers: {
		Authorization: `Bearer ${KEY}`,
		"Content-Type": "application/json",
		model,
	},
	body: JSON.stringify({ text, reference_id: [v0, v1], format: "mp3" }),
});
console.log({
	status: res.status,
	requestId: res.headers.get("x-request-id") ?? null,
});
if (!res.ok) {
	console.log((await res.text()).slice(0, 800));
	process.exit(1);
}

// SSE: data: {audio_base64, alignment, chunk_seq, chunk_audio_offset_sec}
const chunks = [];
const align = new Map();
let buf = "";
let events = 0;
const dec = new TextDecoder();
for await (const part of res.body) {
	buf += dec.decode(part, { stream: true });
	for (let i = buf.indexOf("\n\n"); i >= 0; i = buf.indexOf("\n\n")) {
		const ev = buf.slice(0, i);
		buf = buf.slice(i + 2);
		const data = ev
			.split("\n")
			.filter((l) => l.startsWith("data:"))
			.map((l) => l.slice(5).trim())
			.join("");
		if (!data || data === "[DONE]") continue;
		const p = JSON.parse(data);
		events++;
		if (events === 1)
			fs.writeFileSync(
				`${outdir}/first-event-keys.json`,
				JSON.stringify(Object.keys(p)),
			);
		if (p.audio_base64) chunks.push(Buffer.from(p.audio_base64, "base64"));
		if (p.alignment)
			align.set(p.chunk_seq ?? 0, {
				offset: p.chunk_audio_offset_sec ?? 0,
				a: p.alignment,
			});
	}
}
const audio = Buffer.concat(chunks);
fs.writeFileSync(`${outdir}/scene.mp3`, audio);
const words = [...align.entries()]
	.sort((a, b) => a[0] - b[0])
	.flatMap(([, { offset, a }]) =>
		(a.segments ?? []).map((s) => ({
			text: s.text,
			start: s.start + offset,
			end: s.end + offset,
		})),
	);
fs.writeFileSync(`${outdir}/words.json`, JSON.stringify(words, null, 1));
const duration = Number(
	execFileSync("ffprobe", [
		"-v",
		"error",
		"-show_entries",
		"format=duration",
		"-of",
		"csv=p=0",
		`${outdir}/scene.mp3`,
	])
		.toString()
		.trim(),
);
console.log({
	ms: Date.now() - t0,
	events,
	alignedChunks: align.size,
	words: words.length,
	duration,
});

// 대사별 자르기: 태그를 뺀 글자 수만큼 단어를 차례로 먹는다
const norm = (s) =>
	s.replace(/<[^>]+>|\[[^\]]*\]/g, "").replace(/[^\p{L}\p{N}]/gu, "");
let wi = 0;
const spans = LINES.map(([s, , t]) => {
	const need = [...norm(t)].length;
	let got = 0;
	const first = wi;
	while (wi < words.length && got < need)
		got += [...norm(words[wi++].text)].length;
	const last = wi - 1;
	return {
		speaker: NAMES[s],
		text: t,
		need,
		got,
		start: words[first]?.start ?? null,
		end: words[last]?.end ?? null,
		words: words
			.slice(first, wi)
			.map((w) => w.text)
			.join(" "),
	};
});
for (let i = 0; i < spans.length; i++) {
	const cutStart = i === 0 ? 0 : (spans[i - 1].end + spans[i].start) / 2;
	const cutEnd =
		i === spans.length - 1 ? duration : (spans[i].end + spans[i + 1].start) / 2;
	Object.assign(spans[i], {
		cutStart: +cutStart.toFixed(3),
		cutEnd: +cutEnd.toFixed(3),
	});
	if (Number.isFinite(cutStart) && Number.isFinite(cutEnd) && cutEnd > cutStart)
		execFileSync("ffmpeg", [
			"-v",
			"error",
			"-y",
			"-i",
			`${outdir}/scene.mp3`,
			"-ss",
			String(cutStart),
			"-to",
			String(cutEnd),
			"-c:a",
			"libmp3lame",
			"-q:a",
			"2",
			`${outdir}/${String(i + 1).padStart(2, "0")}_${spans[i].speaker}.mp3`,
		]);
}
fs.writeFileSync(`${outdir}/lines.json`, JSON.stringify(spans, null, 1));
console.table(
	spans.map(({ speaker, need, got, start, end, cutStart, cutEnd }) => ({
		speaker,
		need,
		got,
		start,
		end,
		cutStart,
		cutEnd,
	})),
);
