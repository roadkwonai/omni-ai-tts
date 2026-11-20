import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
	appendFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
	audit,
	buildRows,
	CASES,
	changedFiles,
	classify,
	loadConfig,
	parseActive,
	parseWorkflow,
	setEvidence,
	writeTable,
} from "./dev-cycle.mjs";

test("H 갱신은 기존 평가 증거와 수동 행을 보존하고 평가 행을 하나로 합친다", (t) => {
	const root = mkdtempSync(join(tmpdir(), "prokit-h-eval-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const git = (...args) => execFileSync("git", args, { cwd: root });
	const write = (file, content) => {
		const path = join(root, file);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content);
	};
	git("init", "-q");
	git("config", "user.email", "test@example.com");
	git("config", "user.name", "Test");
	write(
		".dev-cycle.json",
		readFileSync(new URL("../.dev-cycle.json", import.meta.url)),
	);
	const workflow = readFileSync(
		new URL("../docs/dev-workflow.md", import.meta.url),
		"utf8",
	);
	const legacy =
		"스킬을 바꿨으면 skill-creator eval 재실행 → 벤치마크 경로 또는 N/A: 사유";
	const oldWorkflow = workflow.replace(
		/스킬을 바꿨으면 skill-creator eval 적용 여부 확인[^\n]+/,
		legacy,
	);
	write("docs/dev-workflow.md", oldWorkflow);
	write("tasks/todo.md", "# 작업\n");
	git("add", ".");
	git("commit", "-qm", "base");
	const config = loadConfig(root);
	writeTable(root, config, "H", { write: true, title: "갱신" });
	let todo = readFileSync(join(root, "tasks/todo.md"), "utf8");
	todo = todo.replace(`| ${legacy} |  |`, `| ${legacy} | 기존 평가 증거 |`);
	todo = todo.replace(
		"<!-- dev-cycle:end -->",
		"| 99 | 수동 확인 | 기존 수동 증거 |\n<!-- dev-cycle:end -->",
	);
	write("tasks/todo.md", todo);
	write("docs/dev-workflow.md", workflow);
	writeTable(root, config, "H", { write: true, upgrade: true });
	const active = parseActive(readFileSync(join(root, "tasks/todo.md"), "utf8"));
	const evalRows = active.rows.filter((r) =>
		r.text.startsWith("스킬을 바꿨으면 skill-creator eval"),
	);
	assert.equal(evalRows.length, 1);
	assert.equal(evalRows[0].evidence, "기존 평가 증거");
	assert.equal(
		active.rows.find((r) => r.text === "수동 확인")?.evidence,
		"기존 수동 증거",
	);
});

test("H 자동 빌드 제외는 빌드 입력이 추가되면 무효가 된다", (t) => {
	const root = mkdtempSync(join(tmpdir(), "prokit-h-build-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const git = (...args) => execFileSync("git", args, { cwd: root });
	const write = (file, content) => {
		const path = join(root, file);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content);
	};
	git("init", "-q");
	git("config", "user.email", "test@example.com");
	git("config", "user.name", "Test");
	write(
		".dev-cycle.json",
		readFileSync(new URL("../.dev-cycle.json", import.meta.url)),
	);
	write(
		"docs/dev-workflow.md",
		readFileSync(new URL("../docs/dev-workflow.md", import.meta.url)),
	);
	write("tasks/todo.md", "# 작업\n");
	write("scripts/dev-cycle.mjs", "old\n");
	git("add", ".");
	git("commit", "-qm", "base");
	const config = loadConfig(root);
	writeTable(root, config, "H", { write: true, title: "하네스" });
	write("scripts/dev-cycle.mjs", "new\n");
	writeTable(root, config, "H", { write: true, upgrade: true });
	const active = parseActive(readFileSync(join(root, "tasks/todo.md"), "utf8"));
	assert.match(
		active.rows.find((r) => r.text.startsWith("[verify] 빌드·검사 (")).evidence,
		/^N\/A: 하네스 문서·러너만 변경/,
	);
	write(".github/workflows/check.yml", "name: check\n");
	assert.ok(
		audit(root, config).problems.some((p) =>
			p.includes("빌드·배포 또는 작업공간 입력이 바뀌었다"),
		),
	);
});

test("L은 기존 화면 파일 두 개와 변경 30줄까지만 허용한다", (t) => {
	const root = mkdtempSync(join(tmpdir(), "prokit-lite-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const git = (...args) =>
		execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
	const write = (file, content) => {
		const path = join(root, file);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content);
	};
	git("init", "-q");
	git("config", "user.email", "test@example.com");
	git("config", "user.name", "Test");
	write(
		".dev-cycle.json",
		readFileSync(new URL("../.dev-cycle.json", import.meta.url)),
	);
	const page = "apps/web/src/example.tsx";
	write(page, "old\n");
	write("apps/web/src/other.tsx", "old\n");
	write("packages/ui/src/button.tsx", "old\n");
	git("add", ".");
	git("commit", "-qm", "base");
	const base = git("rev-parse", "HEAD");
	const config = loadConfig(root);
	const check = () =>
		classify(changedFiles(root, base), config, { root, base }).liteOk;
	write(page, "new\n".repeat(29));
	assert.equal(check(), true);
	write(page, "new\n".repeat(30));
	assert.equal(check(), false);
	write(page, "new\n");
	write("packages/ui/src/button.tsx", "new\n");
	assert.equal(check(), false);
});

test("L 감사는 상향·fresh 리뷰·마무리 선택을 검사하고 백로그 문턱을 경고한다", (t) => {
	const root = mkdtempSync(join(tmpdir(), "prokit-lite-audit-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const git = (...args) =>
		execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
	const write = (file, content) => {
		const path = join(root, file);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content);
	};
	git("init", "-q");
	git("config", "user.email", "test@example.com");
	git("config", "user.name", "Test");
	write(
		".dev-cycle.json",
		readFileSync(new URL("../.dev-cycle.json", import.meta.url)),
	);
	write(
		"docs/dev-workflow.md",
		readFileSync(new URL("../docs/dev-workflow.md", import.meta.url)),
	);
	write(".gitignore", ".prokit/\ntasks/evidence/\n");
	write(
		"tasks/todo.md",
		"# 작업\n\n## 개발 백로그\n- [x] 기존 P0 완료\n- [ ] 이전 항목\n",
	);
	write("apps/web/src/example.tsx", "old\n");
	write(
		"skills.manifest.json",
		JSON.stringify({
			skills: [],
			performers: {
				agents: ["prokit-ui-builder", "prokit-runtime-checker"],
				skills: {},
			},
		}),
	);
	git("add", ".");
	git("commit", "-qm", "base");
	const config = loadConfig(root);
	writeTable(root, config, "L", { write: true, title: "백로그: 여백" });
	write("apps/web/src/example.tsx", "new\n");
	const fill = (row, text) => {
		write("tasks/evidence/row.txt", text);
		setEvidence(root, config, row, "tasks/evidence/row.txt");
	};
	const rows = [
		"Main 직접: 여백",
		"pnpm check-types·lint·build exit 0",
		"위임: prokit-runtime-checker(사용: next-dev-loop, agent-browser); 폭: 320px, 360px; 상태: 기본; 오류 예산: 0",
		"prokit-reviewer(code): approve, max=none, 경량: 확인, 리뷰: fresh; ponytail-review: approve",
		"사용자가 화면을 확인함 (2026-11-20), 마무리: 커밋만",
	];
	rows.forEach((value, index) => {
		fill(index + 1, value);
	});
	fill(4, rows[3].replace("경량: 확인", "경량: 아님"));
	assert.ok(
		audit(root, config).problems.some((problem) =>
			problem.startsWith("케이스 상향 필요: B"),
		),
	);
	fill(4, rows[3].replace("fresh", "이어 쓰기"));
	assert.ok(
		audit(root, config).problems.some((problem) =>
			problem.includes("리뷰: fresh"),
		),
	);
	fill(4, rows[3]);
	fill(5, "사용자가 화면을 확인함");
	assert.ok(
		audit(root, config).problems.some((problem) =>
			problem.includes("마무리: <선택>"),
		),
	);
	fill(5, rows[4]);
	appendFileSync(
		join(root, "tasks/todo.md"),
		"\n### 후속\n- [ ] [P2] 회귀\n- [ ] 미표시 관찰\n",
	);
	const cli = spawnSync(
		process.execPath,
		[
			new URL("./dev-cycle.mjs", import.meta.url).pathname,
			"close",
			"--round-only",
			"--json",
		],
		{ cwd: root, encoding: "utf8" },
	);
	assert.equal(cli.status, 0, cli.stderr || cli.stdout);
	const result = JSON.parse(cli.stdout);
	assert.equal(result.ok, true, result.problems?.join("\n"));
	assert.match(result.warnings?.[0] ?? "", /새 백로그 1건/);
	assert.match(
		readFileSync(join(root, "tasks/todo.md"), "utf8"),
		/\[x\] 기존 P0 완료/,
	);
	assert.doesNotMatch(readFileSync(result.archivePath, "utf8"), /기존 P0 완료/);
});

test("L 워크플로는 실행 확인, 독립 리뷰, 사용자 확인을 포함한다", () => {
	assert.ok(CASES.includes("L"));
	const workflow = parseWorkflow(
		readFileSync(new URL("../docs/dev-workflow.md", import.meta.url), "utf8"),
	);
	const rows = buildRows(workflow, "L", {
		harness: false,
		auth: false,
		layers: [],
	});
	assert.equal(rows.length, 5);
	const text = rows.map((row) => row.text).join("\n");
	assert.match(text, /prokit-runtime-checker/);
	assert.match(text, /prokit-reviewer\(code\)/);
	assert.match(text, /마무리/);
});
