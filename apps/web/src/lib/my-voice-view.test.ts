// apps/web/src/lib/my-voice-view.test.ts
import type { MyVoiceStatus } from "@tts-pilot-app/api/my-voice-contract";
import { describe, expect, it } from "vitest";

import {
	badgeOf,
	dismissNeedsConfirm,
	dismissText,
	lengthProblemText,
	menuOf,
	primaryActionOf,
	reasonText,
	recordingHintOf,
	rowNoteOf,
} from "./my-voice-view";

const STATUSES: MyVoiceStatus[] = [
	"sending",
	"processing",
	"ready",
	"failed",
	"unknown",
	"deleting",
];
const item = (status: MyVoiceStatus, savedVoiceId: string | null = null) => ({
	status,
	savedVoiceId,
});

describe("badgeOf", () => {
	it.each([
		["sending", "보내는 중", "outline", true],
		["processing", "처리 중", "outline", true],
		["ready", "사용 가능", "secondary", false],
		["failed", "실패", "warning", false],
		["unknown", "처리 여부 미확인", "warning", false],
		["deleting", "삭제 대기", "warning", false],
	] as const)("%s", (status, label, tone, busy) => {
		expect(badgeOf(status)).toEqual({ label, tone, busy });
	});
	it("여섯 상태 모두 표가 있다", () => {
		for (const status of STATUSES) expect(badgeOf(status).label).not.toBe("");
	});
});

describe("primaryActionOf", () => {
	it.each([
		["ready", "listen"],
		["processing", "check"],
		["deleting", "retryDelete"],
		["sending", null],
		["failed", null],
		["unknown", null],
	] as const)("%s → %s", (status, action) => {
		expect(primaryActionOf(item(status))).toBe(action);
	});
});

describe("menuOf", () => {
	it.each([
		["ready", "saved-id", ["openLibrary", "delete"]],
		["ready", null, ["saveAgain", "delete"]],
		["processing", null, ["delete"]],
		["failed", null, ["dismiss"]],
		["unknown", null, ["dismiss"]],
		["sending", null, []],
		["deleting", null, []],
	] as const)("%s 보관함 %s", (status, saved, menu) => {
		expect(menuOf(item(status, saved))).toEqual(menu);
	});
	it("보관함 행은 사용 가능일 때만 본다", () => {
		expect(menuOf(item("processing", "saved-id"))).toEqual(["delete"]);
	});
});

describe("dismissNeedsConfirm", () => {
	it.each([
		["failed", true],
		["unknown", false],
	] as const)("%s → %s", (status, confirm) => {
		expect(dismissNeedsConfirm(item(status))).toBe(confirm);
	});
});

describe("reasonText", () => {
	const text = (reason: string | null) => reasonText(reason, "fish_audio");
	it.each([
		"no_key",
		"quota",
		"no_permission",
		"provider_auth",
		"rate_limit",
		"in_progress",
		"quality",
		"provider_input",
		"unknown_outcome",
		"provider_error",
		"not_found",
		"audio_format",
		"audio_length",
		"audio_size",
	])("%s는 빈 문구가 아니다", (reason) => {
		expect(text(reason).length).toBeGreaterThan(5);
	});
	it("quota와 no_permission은 같은 안내", () => {
		expect(text("quota")).toBe(text("no_permission"));
		expect(text("quota")).toContain("이 계정은 클론을 만들 수 없어요");
	});
	it("미확인 안내에 공급자 이름이 들어간다", () => {
		expect(reasonText("unknown_outcome", "gemini")).toContain("Gemini");
		expect(reasonText("unknown_outcome", "fish_audio")).toContain("Fish Audio");
	});
	it("품질 실패는 다시 녹음을 안내한다", () => {
		expect(text("quality")).toContain("조용한 곳에서 다시 녹음");
	});
	it("모르는 사유와 null은 기본 문구", () => {
		expect(text("zzz")).toBe(text(null));
		expect(text(null)).not.toBe("");
	});
	it("provider_auth는 공급자의 클론 거절로 안내한다", () => {
		expect(text("provider_auth")).toBe(
			"음성 서비스가 이 계정의 클론 요청을 거절했어요. 연결 상태와 음성 서비스 요금제·잔액을 확인해 주세요.",
		);
		expect(text("provider_auth")).not.toBe(text("no_key"));
	});
	it("객체 기본 속성 이름에 속지 않는다", () => {
		expect(text("constructor")).toBe(text(null));
	});
	// 공급자 5xx는 만들어진 뒤에 왔을 수 있다. CLI(clones)와 뜻이 같다(audit N3)
	it.each([
		["fish_audio", "Fish Audio"],
		["gemini", "Gemini"],
	] as const)(
		"%s 공급자 오류는 만들어졌을 수 있다고 알린다(audit N3)",
		(provider, name) => {
			const said = reasonText("provider_error", provider);
			expect(said).toContain("만들어졌을 수 있어요");
			expect(said).toContain(`${name} 웹에서 확인`);
			expect(
				rowNoteOf({ status: "failed", reason: "provider_error", provider }),
			).toBe(said);
		},
	);
});

describe("dismissText", () => {
	it("공급자 id가 없을 수 있는 실패를 치울 때는 공급자에 남았을 수 있다고 알린다(audit N3)", () => {
		const said = dismissText({ reason: "provider_error", provider: "gemini" });
		expect(said).toContain("남았을 수 있어요");
		expect(said).toContain("Gemini 웹에서 확인");
		expect(said).not.toContain("클론도 지워져요");
	});
	it("공급자 id가 있는 실패는 공급자 계정에서도 지운다고 알린다", () => {
		expect(dismissText({ reason: "quality", provider: "fish_audio" })).toBe(
			"Fish Audio 계정에 남은 실패한 클론도 지워져요",
		);
	});
});

describe("lengthProblemText", () => {
	it.each([
		[
			"Fish 원본 5초",
			() => lengthProblemText("fish_audio", "source", 5),
			"원본이 너무 짧아요",
		],
		[
			"Fish 원본 70초",
			() => lengthProblemText("fish_audio", "source", 70),
			"원본이 너무 길어요",
		],
		[
			"Gemini 원본 40초",
			() => lengthProblemText("gemini", "source", 40),
			"10~30초",
		],
		[
			"Gemini 동의 0.4초",
			() => lengthProblemText("gemini", "consent", 0.4),
			"동의 녹음이 너무 짧아요",
		],
		[
			"Gemini 동의 25초",
			() => lengthProblemText("gemini", "consent", 25),
			"1~20초",
		],
	])("%s", (_name, run, part) => {
		expect(run()).toContain(part);
	});
	it("범위 안이면 null", () => {
		expect(lengthProblemText("fish_audio", "source", 10)).toBeNull();
		expect(lengthProblemText("fish_audio", "source", 60)).toBeNull();
		expect(lengthProblemText("gemini", "consent", 1)).toBeNull();
	});
	it("현재 길이를 범위 밖으로 읽히게 알린다(짧으면 내림, 길면 올림)", () => {
		expect(lengthProblemText("fish_audio", "source", 5.9)).toContain("5초");
		expect(lengthProblemText("fish_audio", "source", 9.99)).toContain("9초");
		expect(lengthProblemText("fish_audio", "source", 60.01)).toContain("61초");
	});
});

describe("rowNoteOf", () => {
	const note = (status: MyVoiceStatus, reason: string | null = null) =>
		rowNoteOf({ status, reason, provider: "gemini" });
	it("사유 줄은 실패·미확인·삭제 대기만 있다", () => {
		expect(note("ready")).toBeNull();
		expect(note("processing")).toBeNull();
		expect(note("sending")).toBeNull();
		expect(note("deleting")).toContain("아직 지워지지 않았어요");
		expect(note("unknown")).toBe(
			"음성 서비스 쪽에 만들어졌을 수 있어요. Gemini 웹에서 확인하고 필요하면 지워 주세요.",
		);
		expect(note("failed", "quality")).toContain("다시 녹음");
		expect(note("failed", null)).toBe(reasonText(null, "gemini"));
	});
});

describe("recordingHintOf", () => {
	it("최소 길이 전에는 남은 초를 센다", () => {
		expect(recordingHintOf(10, 0)).toEqual({
			text: "10초까지 10초 남았어요",
			enough: false,
		});
		expect(recordingHintOf(10, 7)).toEqual({
			text: "10초까지 3초 남았어요",
			enough: false,
		});
	});
	it("최소를 넘으면 충분하다고 말한다", () => {
		expect(recordingHintOf(10, 10)).toEqual({
			text: "충분해요. 더 읽거나 멈춰도 돼요.",
			enough: true,
		});
		expect(recordingHintOf(1, 4).enough).toBe(true);
	});
});
