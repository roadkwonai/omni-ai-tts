// node --test scripts/vercel-deploy.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { modeErrors, parseArgs, urlMismatch } from "./vercel-deploy.mjs";

test("parseArgs: 기본 studio, --target 값과 = 형식", () => {
	assert.deepEqual(parseArgs(["production", "--check"]), {
		target: "studio",
		rest: ["production", "--check"],
	});
	assert.equal(parseArgs(["production", "--target", "demo"]).target, "demo");
	assert.equal(parseArgs(["--target=demo", "develop"]).target, "demo");
	assert.deepEqual(parseArgs(["production", "--target"]), {
		target: "",
		rest: ["production"],
	});
});

test("modeErrors: studio는 demo 모드를 거절한다", () => {
	assert.deepEqual(
		modeErrors({ expect: "owner", mode: "owner", keys: ["GEMINI_API_KEY"] }),
		[],
	);
	assert.deepEqual(modeErrors({ expect: "owner", mode: "", keys: [] }), []);
	assert.equal(
		modeErrors({ expect: "owner", mode: "demo", keys: [] }).length,
		1,
	);
});

test("modeErrors: demo는 APP_MODE=demo이고 키 이름이 없어야 한다", () => {
	assert.deepEqual(
		modeErrors({ expect: "demo", mode: "demo", keys: ["DEMO_DB_HOST"] }),
		[],
	);
	assert.equal(
		modeErrors({ expect: "demo", mode: "", keys: ["DEMO_DB_HOST"] }).length,
		1,
	);
	const e = modeErrors({
		expect: "demo",
		mode: "demo",
		keys: [
			"DEMO_DB_HOST",
			"DATABASE_URL",
			"OPENAI_API_KEY",
			"FISH_AUDIO_API_KEY",
		],
	});
	assert.equal(e.length, 1);
	assert.match(
		e[0],
		/OPENAI_API_KEY, FISH_AUDIO_API_KEY|FISH_AUDIO_API_KEY, OPENAI_API_KEY/,
	);
});

test("modeErrors: 읽지 못하면 실패", () => {
	assert.equal(modeErrors({ expect: "owner", mode: null, keys: [] }).length, 1);
	assert.equal(modeErrors({ expect: "demo", mode: null, keys: [] }).length, 1);
});

test("modeErrors: demo에 DEMO_DB_HOST 이름이 없으면 오류, studio는 요구 안 함", () => {
	const e = modeErrors({ expect: "demo", mode: "demo", keys: [] });
	assert.equal(e.length, 1);
	assert.match(e[0], /DEMO_DB_HOST/);
	assert.deepEqual(modeErrors({ expect: "owner", mode: "", keys: [] }), []);
});

test("urlMismatch: production만 주소를 비교한다", () => {
	const a = { url: "https://a.vercel.app/", projUrl: "https://b.vercel.app" };
	assert.equal(urlMismatch({ name: "develop", ...a }), false);
	assert.equal(urlMismatch({ name: "production", ...a }), true);
	assert.equal(
		urlMismatch({
			name: "production",
			url: "https://b.vercel.app/",
			projUrl: "https://b.vercel.app",
		}),
		false,
	);
});
