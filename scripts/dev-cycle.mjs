#!/usr/bin/env node
// dev-cycle 경량 러너: case | table | status | audit | close
// 절차 정본은 docs/dev-workflow.md, 판정 규칙은 .dev-cycle.json이다.
import { execFileSync, spawnSync } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULTS = {
	todoPath: "tasks/todo.md",
	archiveDir: "tasks/archive",
	workflowDoc: "docs/dev-workflow.md",
	defaultBranch: "main",
	rules: [],
	authPaths: null,
	ui: { auditMin: 16, a11yMin: 3 },
	commands: {},
};
export const CASES = ["A", "B", "C", "D", "E", "F", "H"];
const LAYERS = ["E", "D", "B"];

export class UsageError extends Error {}

export function loadConfig(root) {
	const p = join(root, ".dev-cycle.json");
	let cfg = {};
	try {
		cfg = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
	} catch (e) {
		throw new UsageError(`.dev-cycle.json을 읽을 수 없다: ${e.message}`);
	}
	return { ...DEFAULTS, ...cfg };
}

function git(root, args) {
	return execFileSync("git", args, {
		cwd: root,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	});
}

const splitZ = (s) => s.split("\0").filter(Boolean);

// 기준점은 todo.md에서 다시 읽히므로 git 옵션(--output=… 등)으로 해석되지 않게 형식을 제한한다.
const SHA_RE = /^[0-9a-f]{4,64}$/;
const commitOf = (root, ref) => {
	try {
		// --end-of-options는 쓰지 않는다: 오래된 git(2.25 등)의 rev-parse가 모른다. '-'로 시작하는 ref는 호출 전에 거른다.
		return git(root, [
			"rev-parse",
			"--verify",
			"--quiet",
			`${ref}^{commit}`,
		]).trim();
	} catch {
		return null;
	}
};

export function resolveBase(root, config) {
	if (!commitOf(root, "HEAD")) return null;
	const branch = git(root, ["branch", "--show-current"]).trim();
	// 설정 브랜치가 없을 때(BTS는 master로 초기화한다) 기능 브랜치의 커밋이 diff에서 빠지지 않도록 후보를 차례로 본다.
	const candidates = [
		...new Set([
			config.defaultBranch,
			`origin/${config.defaultBranch}`,
			"main",
			"master",
		]),
	];
	// 기본 브랜치 위에서는 push하지 않은 이전 커밋이 새 라운드에 섞이지 않도록 HEAD를 쓴다.
	if (
		branch &&
		candidates.some((c) => c === branch || c === `origin/${branch}`)
	)
		return commitOf(root, "HEAD");
	for (const ref of candidates) {
		if (!ref || ref === branch || ref.startsWith("-")) continue;
		const c = commitOf(root, ref);
		if (c) return git(root, ["merge-base", "HEAD", c]).trim();
	}
	return commitOf(root, "HEAD");
}

export function changedFiles(root, base) {
	if (base && !SHA_RE.test(base))
		throw new UsageError(`기준점이 커밋 해시가 아니다: ${base}`);
	const untracked = splitZ(
		git(root, ["ls-files", "-z", "--others", "--exclude-standard"]),
	);
	// --relative: 상위 저장소의 하위 폴더에서 실행해도 ls-files처럼 현재 폴더 기준 경로를 쓴다.
	const tracked = base
		? splitZ(
				git(root, [
					"diff",
					"-z",
					"--name-only",
					"--no-renames",
					"--relative",
					base,
					"--",
				]),
			)
		: splitZ(git(root, ["ls-files", "-z"]));
	return [...new Set([...tracked, ...untracked])].sort();
}

export function classify(files, config) {
	const re = (src, where) => {
		try {
			return new RegExp(src);
		} catch (e) {
			throw new UsageError(
				`.dev-cycle.json ${where} 정규식 오류: ${e.message}`,
			);
		}
	};
	const rules = config.rules.map((r) => ({
		...r,
		re: re(r.match, `rules(${r.case})`),
	}));
	const authRe = config.authPaths ? re(config.authPaths, "authPaths") : null;
	const layers = new Set();
	const evidence = [];
	let harness = false;
	let auth = false;
	for (const file of files) {
		const rule = rules.find((r) => r.re.test(file));
		const isAuth = authRe ? authRe.test(file) : false;
		if (isAuth) auth = true;
		if (!rule && !isAuth) continue;
		if (rule?.case === "H") harness = true;
		else if (rule) layers.add(rule.case);
		evidence.push({
			file,
			case: rule?.case ?? null,
			why: rule?.why ?? null,
			auth: isAuth,
		});
	}
	const list = LAYERS.filter((c) => layers.has(c));
	const pathCase =
		list.length === 0
			? harness
				? "H"
				: "A"
			: list.length === 1
				? list[0]
				: "F";
	return { pathCase, layers: list, harness, auth, evidence };
}

export const SECURITY_ROW =
	"[review] bts-reviewer(security) → verdict, max_severity, 반영·기각 내역";

export function parseWorkflow(md) {
	const blocks = {};
	let key = null;
	for (const line of md.split(/\r?\n/)) {
		const h = line.match(/^###\s+(공통|[A-Z])(?=[.\s]|$)/);
		if (h) {
			key = h[1] === "공통" ? "COMMON" : h[1];
			blocks[key] = [];
			continue;
		}
		if (/^#{1,2}\s/.test(line)) {
			key = null;
			continue;
		}
		const m = key && line.match(/^-\s+(.*\S)\s*$/);
		if (!m) continue;
		const text = m[1];
		const inc = text.match(/^@include\s+(.+)$/);
		const inh = text.match(/^@inherit\s+(.+)$/);
		if (inc) blocks[key].push({ include: inc[1].trim().split(/\s+/) });
		else if (inh) blocks[key].push({ inherit: inh[1].trim().split(/\s+/) });
		else blocks[key].push({ text, tag: text.match(/^\[(\w+)\]/)?.[1] ?? null });
	}
	return blocks;
}

export function buildRows(workflow, caseKey, cls) {
	if (!workflow[caseKey])
		throw new UsageError(`${caseKey} 케이스 블록이 워크플로 문서에 없다`);
	const expand = (key, stack) => {
		if (stack.includes(key))
			throw new UsageError(`@include 순환: ${[...stack, key].join(" → ")}`);
		const rows = [];
		for (const item of workflow[key] ?? []) {
			if (item.include) {
				for (const k of item.include) rows.push(...expand(k, [...stack, key]));
			} else if (item.inherit) {
				const src = cls.pathCase;
				if (src !== "A" && src !== key) {
					rows.push(
						...expand(src, [...stack, key]).filter((r) =>
							item.inherit.includes(r.tag),
						),
					);
				}
			} else {
				rows.push({ text: item.text, tag: item.tag });
			}
		}
		return rows;
	};
	const out = [];
	const seen = new Set();
	const push = (r) => {
		if (seen.has(r.text)) return;
		seen.add(r.text);
		out.push(r);
	};
	expand(caseKey, []).forEach(push);
	if (cls.harness && caseKey !== "H") expand("H", []).forEach(push);
	if (cls.auth && !out.some((r) => r.text.includes("bts-reviewer(security)")))
		push({ text: SECURITY_ROW, tag: "review" });
	expand("COMMON", []).forEach(push);
	return out;
}

const START_RE = /<!-- dev-cycle:start (.*?) -->/;
const END_TAG = "<!-- dev-cycle:end -->";
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|");

export function renderBlock(meta, rows, extra = []) {
	const lines = [
		`<!-- dev-cycle:start case=${meta.case} base=${meta.base ?? "none"} auth=${Boolean(meta.auth)} opened=${meta.opened} -->`,
		`## 활성 라운드: ${meta.case} — ${meta.title}`,
		"| # | 단계 | 증거 |",
		"|---|---|---|",
		...rows.map((r, i) => `| ${i + 1} | ${esc(r.text)} | ${esc(r.evidence)} |`),
		...(extra.length ? ["", ...extra] : []),
		END_TAG,
	];
	return lines.join("\n");
}

export function parseActive(md) {
	const start = md.search(START_RE);
	if (start < 0) return null;
	const endAt = md.indexOf(END_TAG, start);
	if (endAt < 0)
		throw new UsageError("dev-cycle:end 마커가 없다. tasks/todo.md를 확인한다");
	const end = endAt + END_TAG.length;
	const block = md.slice(start, end);
	const meta = Object.fromEntries(
		[...block.match(START_RE)[1].matchAll(/(\w+)=(\S+)/g)].map((m) => [
			m[1],
			m[2],
		]),
	);
	meta.auth = meta.auth === "true";
	if (meta.base === "none") meta.base = null;
	if (meta.base && !SHA_RE.test(meta.base))
		throw new UsageError(`마커의 base가 커밋 해시가 아니다: ${meta.base}`);
	const title = block.match(/^## 활성 라운드: \S+ — (.*)$/m)?.[1] ?? "";
	const rows = [];
	const extra = [];
	const lines = block.split(/\r?\n/).slice(1, -1);
	const layout = /^## 활성 라운드: |^\|\s*#\s*\||^\|[\s:|-]+\|$/;
	for (const line of lines) {
		if (!/^\|\s*\d+\s*\|/.test(line)) {
			// 번호 행이 아닌 줄(메모, 번호 없는 수동 행)은 --upgrade 때 그대로 옮긴다.
			if (line.trim() && !layout.test(line.trim())) extra.push(line);
			continue;
		}
		const t = line.trim();
		const [, afterNo, afterText] = [...t.matchAll(/(?<!\\)\|/g)].map(
			(m) => m.index,
		);
		const unesc = (s) => s.trim().replace(/\\\|/g, "|");
		// 손으로 적은 증거에는 이스케이프 안 된 `|`(예: pnpm test | tail, ||)가 들 수 있다.
		// 칸을 나눠 다시 붙이면 원문이 바뀌므로 셋째 칸 시작부터 줄 끝까지를 그대로 쓰고 끝의 `|`와 공백만 벗긴다.
		const rest =
			afterText === undefined
				? ""
				: t.slice(afterText + 1).replace(/(?:\s|(?<!\\)\|)+$/, "");
		rows.push({
			text: unesc(t.slice(afterNo + 1, afterText)),
			evidence: unesc(rest),
		});
	}
	return { meta, title, rows, extra, start, end };
}

export function readWorkflow(root, config) {
	return parseWorkflow(readFileSync(join(root, config.workflowDoc), "utf8"));
}

function readTodo(root, config) {
	const p = join(root, config.todoPath);
	return existsSync(p) ? readFileSync(p, "utf8") : null;
}

export function writeTable(
	root,
	config,
	caseKey,
	{ upgrade = false, title, write = false, now = new Date() } = {},
) {
	const md = readTodo(root, config) ?? "# 작업\n";
	const active = parseActive(md);
	if (write && active && !upgrade)
		throw new UsageError(
			"활성 라운드가 이미 있다. close로 닫거나 --upgrade를 쓴다",
		);
	if (upgrade && !active)
		throw new UsageError("--upgrade할 활성 라운드가 없다");
	const base = active ? active.meta.base : resolveBase(root, config);
	const cls = classify(changedFiles(root, base), config);
	const key = caseKey ?? cls.pathCase;
	if (!CASES.includes(key))
		throw new UsageError(
			`알 수 없는 케이스: ${key} (가능: ${CASES.join(", ")})`,
		);
	const rows = buildRows(readWorkflow(root, config), key, cls).map((r) => ({
		...r,
		evidence: "",
	}));
	if (active && upgrade) {
		const old = new Map(active.rows.map((r) => [r.text, r.evidence]));
		for (const r of rows) r.evidence = old.get(r.text) ?? "";
		const kept = new Set(rows.map((r) => r.text));
		for (const r of active.rows)
			if (!kept.has(r.text)) rows.push({ text: r.text, evidence: r.evidence });
	}
	const meta = {
		case: key,
		base,
		auth: cls.auth || Boolean(active?.meta.auth),
		opened: active?.meta.opened ?? now.toISOString().slice(0, 10),
		title: title ?? active?.title ?? "제목 없음",
	};
	const block = renderBlock(meta, rows, upgrade ? active.extra : []);
	if (write) {
		const next = active
			? md.slice(0, active.start) + block + md.slice(active.end)
			: `${md.replace(/\s*$/, "")}\n\n${block}\n`;
		const p = join(root, config.todoPath);
		mkdirSync(dirname(p), { recursive: true });
		writeFileSync(p, next);
	}
	return { case: key, base, rows: rows.length, auth: meta.auth, block };
}

const PLACEHOLDERS = new Set(["✓", "✔", "-", "ok", "done", "todo", "tbd"]);

export function evidenceProblem(e) {
	const v = String(e ?? "").trim();
	if (!v) return "증거 칸이 비어 있다";
	if (/^n\/a(?![a-z])/i.test(v))
		return /^n\/a\s*:\s*\S/i.test(v) ? null : "N/A에 사유가 없다 (N/A: 사유)";
	if (/^(blocked|미실행)(?![a-z])/i.test(v))
		return /^(blocked|미실행)\s*:\s*\S/i.test(v)
			? null
			: "blocked·미실행에 사유가 없다 (blocked: 사유)";
	if (PLACEHOLDERS.has(v.toLowerCase()) || v.replace(/\s/g, "").length < 4)
		return "형식만 채운 증거다";
	return null;
}

export function audit(root, config) {
	const md = readTodo(root, config);
	const active = md && parseActive(md);
	if (!active)
		return {
			ok: false,
			problems: [
				'활성 라운드가 없다 — pnpm dev-cycle table <케이스> --write --title "<요약>"으로 연다',
			],
		};
	const problems = [];
	active.rows.forEach((r, i) => {
		const p = evidenceProblem(r.evidence);
		if (p) problems.push(`#${i + 1} ${r.text}: ${p}`);
	});
	const X = active.meta.case;
	const cls = classify(changedFiles(root, active.meta.base), config);
	if (!["C", "F"].includes(X) && ![X, "A"].includes(cls.pathCase)) {
		problems.push(
			`케이스 상향 필요: 현재 diff 판정은 ${cls.pathCase} → pnpm dev-cycle table ${cls.pathCase} --write --upgrade`,
		);
	} else {
		const have = new Set(active.rows.map((r) => r.text));
		for (const r of buildRows(readWorkflow(root, config), X, cls)) {
			if (!have.has(r.text))
				problems.push(
					`필수 행 누락: ${r.text} → pnpm dev-cycle table ${X} --write --upgrade`,
				);
		}
	}
	if (existsSync(join(root, ".claude/agents"))) {
		const r = spawnSync(
			process.execPath,
			[join(root, "scripts/sync-agents.mjs"), "--check"],
			{ cwd: root, encoding: "utf8" },
		);
		if (r.status !== 0)
			problems.push(
				`에이전트 정의 불일치 — pnpm agents:sync 실행: ${`${r.stdout}${r.stderr}`.trim()}`,
			);
	}
	return {
		ok: problems.length === 0,
		problems,
		case: X,
		pathCase: cls.pathCase,
	};
}

export function status(root, config) {
	const md = readTodo(root, config);
	const active = md && parseActive(md);
	if (!active) {
		return {
			active: false,
			line: '활성 라운드 없음 — pnpm dev-cycle case로 판정한 뒤 pnpm dev-cycle table <케이스> --write --title "<요약>"으로 연다 (케이스는 요청 기준, 아직 diff가 없으면 판정은 A)',
		};
	}
	const filled = active.rows.filter((r) => !evidenceProblem(r.evidence)).length;
	const next =
		active.rows.find((r) => evidenceProblem(r.evidence))?.text ?? null;
	const line = `라운드 ${active.meta.case} "${active.title}" — ${filled}/${active.rows.length}칸 — 다음: ${next ?? "audit 후 close"}`;
	return {
		active: true,
		case: active.meta.case,
		filled,
		total: active.rows.length,
		next,
		line,
	};
}

export function close(root, config, now = new Date()) {
	const res = audit(root, config);
	if (!res.ok) return res;
	const todoPath = join(root, config.todoPath);
	const md = readFileSync(todoPath, "utf8");
	const active = parseActive(md);
	const day = now.toISOString().slice(0, 10);
	const archivePath = join(root, config.archiveDir, `${day.slice(0, 7)}.md`);
	const archived = md
		.slice(active.start, active.end)
		.replace("<!-- dev-cycle:start ", `<!-- dev-cycle:archived closed=${day} `)
		.replace("## 활성 라운드: ", "## 라운드: ")
		.replace(END_TAG, "<!-- dev-cycle:archived-end -->");
	mkdirSync(dirname(archivePath), { recursive: true });
	appendFileSync(
		archivePath,
		`${existsSync(archivePath) ? "\n" : ""}${archived}\n`,
	);
	const before = md.slice(0, active.start).replace(/\s*$/, "");
	const after = md.slice(active.end).replace(/^\s*/, "");
	writeFileSync(
		todoPath,
		`${[before, after].filter(Boolean).join("\n\n").replace(/\s*$/, "")}\n`,
	);
	return { ok: true, archivePath };
}

const USAGE =
	"사용법: dev-cycle <case | table [CASE] [--write] [--upgrade] [--title 제목] | status | audit | close> [--json]";

export function main(argv, root = process.cwd()) {
	const [cmd, ...rest] = argv;
	const json = rest.includes("--json");
	const titleAt = rest.indexOf("--title");
	const title = titleAt >= 0 ? rest[titleAt + 1] : undefined;
	const positional = rest.filter(
		(a, i) => !a.startsWith("--") && (titleAt < 0 || i !== titleAt + 1),
	);
	const config = loadConfig(root);
	const print = (obj, text) =>
		console.log(json ? JSON.stringify(obj, null, 2) : text);
	switch (cmd) {
		case "case": {
			const md = readTodo(root, config);
			const active = md && parseActive(md);
			const base = active ? active.meta.base : resolveBase(root, config);
			const cls = classify(changedFiles(root, base), config);
			const head = `${cls.pathCase}${cls.auth ? " (+auth: security 리뷰 행 추가)" : ""}${cls.harness && cls.pathCase !== "H" ? " (+H)" : ""} — base ${base ?? "none"}`;
			const lines = cls.evidence.map(
				(e) =>
					`  ${e.case ?? "-"}${e.auth ? "+auth" : ""}  ${e.file}  (${e.why ?? "인증 민감 경로"})`,
			);
			print({ ...cls, base }, [head, ...lines].join("\n"));
			return 0;
		}
		case "table": {
			const r = writeTable(root, config, positional[0], {
				upgrade: rest.includes("--upgrade"),
				title,
				write: rest.includes("--write"),
			});
			print(
				r,
				rest.includes("--write")
					? `${config.todoPath}에 케이스 ${r.case} 대조표(${r.rows}행)를 썼다`
					: r.block,
			);
			return 0;
		}
		case "status": {
			const s = status(root, config);
			print(s, s.line);
			return 0;
		}
		case "audit": {
			const r = audit(root, config);
			print(
				r,
				r.ok
					? "audit 통과"
					: ["audit 실패:", ...r.problems.map((p) => `  ❌ ${p}`)].join("\n"),
			);
			return r.ok ? 0 : 1;
		}
		case "close": {
			const r = close(root, config);
			print(
				r,
				r.ok
					? `라운드를 닫았다 → ${r.archivePath}`
					: [
							"close 거부 — audit 실패:",
							...r.problems.map((p) => `  ❌ ${p}`),
						].join("\n"),
			);
			return r.ok ? 0 : 1;
		}
		default:
			console.error(USAGE);
			return 2;
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	try {
		process.exitCode = main(process.argv.slice(2));
	} catch (e) {
		console.error(e.message);
		process.exitCode = e instanceof UsageError ? 2 : 1;
	}
}
