// 버리는 확인 스크립트: Fish 다화자 시각 정보 응답을 PCM으로 받아 WAV로 만들고 줄별로 자른다. 키는 출력하지 않는다.
// node pcm-check.mjs <s2.1-pro-free|drama-3> <outdir>
import fs from "node:fs";

const KEY = process.env.FISH_AUDIO_API_KEY;
if (!KEY) throw new Error("FISH_AUDIO_API_KEY 없음");
const ALLOWED = new Set(["s2.1-pro-free", "drama-3"]); // 철자가 틀리면 유료 s2.1-pro로 조용히 넘어간다
const [model, outdir] = process.argv.slice(2);
if (!ALLOWED.has(model) || !outdir)
	throw new Error("usage: <s2.1-pro-free|drama-3> <outdir>");

const VOICES = [
	"1acdf5b0fd6e4692bb3f38c550ffbde2",
	"8cf5ee4cb0224c109852a206f185a05f",
]; // 효정2, 보이스1
const NAMES = ["지연", "민수"];
const LINES = [
	[0, "놀라며", "너 지금 몇 시인지 알아? 회의 벌써 시작했어."],
	[1, "sighs", "알아, 알아. 버스를 놓쳐서 한 대 더 기다렸어."],
	[0, "", "<whisper>팀장님은 아직 모르셔.</whisper> 빨리 들어가."],
	[1, "laughs", "고마워, 진짜. 오늘 커피는 내가 살게."],
];
const RATE = 44100;
const text = LINES.map(
	([s, d, t]) => `<|speaker:${s}|>${d ? `[${d}] ` : ""}${t}`,
).join("\n");
fs.mkdirSync(outdir, { recursive: true });
fs.writeFileSync(`${outdir}/request-text.txt`, text);
console.log({
	model,
	chars: [...text.replace(/<\|speaker:\d+\|>/g, "")].length,
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
	body: JSON.stringify({
		text,
		reference_id: VOICES,
		format: "pcm",
		sample_rate: RATE,
	}),
});
console.log({ status: res.status, type: res.headers.get("content-type") });
if (!res.ok) {
	console.log((await res.text()).slice(0, 800));
	process.exit(1);
}

const pcm = [];
const align = new Map();
const events = []; // 테스트 자료: 오디오는 길이만 남긴다
let buf = "";
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
		const audio = p.audio_base64 ? Buffer.from(p.audio_base64, "base64") : null;
		if (audio) pcm.push(audio);
		events.push({
			...p,
			audio_base64: audio ? `<${audio.length} bytes>` : p.audio_base64,
		});
		if (p.alignment)
			align.set(p.chunk_seq ?? 0, {
				offset: p.chunk_audio_offset_sec ?? 0,
				a: p.alignment,
			});
	}
}
const raw = Buffer.concat(pcm);
fs.writeFileSync(`${outdir}/events.json`, JSON.stringify(events, null, 1));
const wav = (body) => {
	const h = Buffer.alloc(44);
	h.write("RIFF", 0);
	h.writeUInt32LE(36 + body.length, 4);
	h.write("WAVE", 8);
	h.write("fmt ", 12);
	h.writeUInt32LE(16, 16);
	h.writeUInt16LE(1, 20);
	h.writeUInt16LE(1, 22);
	h.writeUInt32LE(RATE, 24);
	h.writeUInt32LE(RATE * 2, 28);
	h.writeUInt16LE(2, 32);
	h.writeUInt16LE(16, 34);
	h.write("data", 36);
	h.writeUInt32LE(body.length, 40);
	return Buffer.concat([h, body]);
};
fs.writeFileSync(`${outdir}/scene.wav`, wav(raw));
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
const pcmSeconds = raw.length / 2 / RATE;
const lastAudioDuration = [...align.values()].reduce(
	(m, { offset, a }) => Math.max(m, offset + (a.audio_duration ?? 0)),
	0,
);
console.log({
	ms: Date.now() - t0,
	events: events.length,
	alignedChunks: align.size,
	words: words.length,
	pcmBytes: raw.length,
	oddBytes: raw.length % 2,
	pcmSeconds: +pcmSeconds.toFixed(3),
	alignEnd: +(words.at(-1)?.end ?? 0).toFixed(3),
	lastAudioDuration: +lastAudioDuration.toFixed(3),
});

// 줄 나누기: 지시·태그와 세그먼트에 붙은 쌍 태그 이름을 빼고 글자 수만큼 먹는다
const PAIRED = /whisper|emphasis|soft|fast|slow|stress|forceful/gi;
const norm = (s) =>
	s
		.replace(/<[^>]+>|\[[^\]]*\]/g, "")
		.replace(PAIRED, "")
		.replace(/[^\p{L}\p{N}]/gu, "");
let wi = 0;
const spans = LINES.map(([s, , t]) => {
	const need = [...norm(t)].length;
	let got = 0;
	const first = wi;
	while (wi < words.length && got < need)
		got += [...norm(words[wi++].text)].length;
	return {
		speaker: NAMES[s],
		need,
		got,
		start: words[first]?.start,
		end: words[wi - 1]?.end,
	};
});
const ok = spans.every((x) => x.need === x.got) && wi === words.length;
spans.forEach((x, i) => {
	x.cutStart = i === 0 ? 0 : (spans[i - 1].end + x.start) / 2;
	x.cutEnd =
		i === spans.length - 1 ? pcmSeconds : (x.end + spans[i + 1].start) / 2;
	const a = Math.round(x.cutStart * RATE) * 2;
	const b = Math.round(x.cutEnd * RATE) * 2;
	fs.writeFileSync(
		`${outdir}/${String(i + 1).padStart(2, "0")}_${x.speaker}.wav`,
		wav(raw.subarray(a, b)),
	);
});
fs.writeFileSync(
	`${outdir}/lines.json`,
	JSON.stringify({ ok, leftoverWords: words.length - wi, spans }, null, 1),
);
console.log({ splitOk: ok, leftoverWords: words.length - wi });
console.table(
	spans.map((x) => ({
		...x,
		start: x.start?.toFixed(2),
		end: x.end?.toFixed(2),
		cutStart: x.cutStart.toFixed(2),
		cutEnd: x.cutEnd.toFixed(2),
	})),
);
