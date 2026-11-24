import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

const src = new URL("../", import.meta.url);

// my-voice-contract는 zod 스키마라 값으로 부르면 /my-voices 번들에 zod(gzip 108KB)가 딸려 온다(audit N4). 타입은 지워진다
test("화면 코드는 내 보이스 계약을 타입으로만 불러온다", () => {
	const values = readdirSync(src, { recursive: true, encoding: "utf8" })
		.filter((path) => /\.tsx?$/.test(path) && !path.includes(".test."))
		.flatMap((path) =>
			[
				...readFileSync(new URL(path, src), "utf8").matchAll(
					/^(?:import|export)\b[^;]*?["'][^"']*my-voice-contract["']/gm,
				),
			]
				.filter(([statement]) => !/^(?:import|export) type\b/.test(statement))
				.map(() => path),
		);
	expect(values).toEqual([]);
});
