// node --test scripts/release.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { noteDate } from "./release.mjs";

test("noteDate: KST 날짜, 자정 경계", () => {
	assert.equal(noteDate(new Date("2026-11-19T00:30:00Z")), "2026-11-19");
	assert.equal(noteDate(new Date("2026-11-18T14:59:00Z")), "2026-11-18");
	assert.equal(noteDate(new Date("2026-11-18T16:00:00Z")), "2026-11-19");
});
