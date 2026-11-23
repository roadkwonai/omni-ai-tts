import { chmodSync, readdirSync } from "node:fs";
import { defineConfig } from "rolldown";

export default defineConfig({
	input: "src/cli.ts",
	platform: "node",
	// 파일 이름은 entryFileNames의 [name] 하나다. 나뉜 조각이 생기면 아래 검사가 막는다
	output: { dir: "dist", format: "esm", cleanDir: true },
	plugins: [
		{
			name: "only-cli",
			writeBundle() {
				const files = readdirSync("dist");
				if (files.join() !== "cli.js")
					throw new Error(`dist에 예상하지 않은 파일: ${files.join(", ")}`);
				chmodSync("dist/cli.js", 0o755);
			},
		},
	],
});
