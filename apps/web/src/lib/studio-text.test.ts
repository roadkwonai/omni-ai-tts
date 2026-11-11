// apps/web/src/lib/studio-text.test.ts
import { ORPCError } from "@orpc/client";
import { ACTING } from "@tts-pilot-app/api/drama-acting";
import {
	DEFAULT_SETTINGS,
	type TypecastSettings,
} from "@tts-pilot-app/api/providers/trial-options";
import { describe, expect, it } from "vitest";

import type { VoiceSetup } from "./paragraph-script";
import {
	blockText,
	chipsOf,
	failShortOf,
	makeProblemText,
	PARAGRAPH_AUTO_TAG_TEXT,
	PARAGRAPH_TEXT,
	paragraphTagGroups,
	unknownExpiredOf,
} from "./studio-text";
import { createFailureOf } from "./studio-view";
import { autoTagProblemText } from "./tag-view";
import {
	type TrialProblem,
	trialFallback,
	trialProblemText,
} from "./trial-view";
import { retryTime } from "./voice-view";

const problem = (
	reason: string,
	extra: Partial<TrialProblem> = {},
): TrialProblem =>
	({ reason, retryAt: null, providerCode: null, ...extra }) as TrialProblem;
const RETRY_AT = "2026-10-23T06:11:30.000Z";

describe("makeProblemText(공급자별 실패 문구, E5)", () => {
	it("makeProblemText: ElevenLabs no_key → ElevenLabs 문구, connections true", () => {
		const shown = makeProblemText("elevenlabs", problem("no_key"));
		expect(shown).toEqual(trialProblemText("elevenlabs", problem("no_key")));
		expect(shown.text).toContain("ElevenLabs");
		expect(shown.connections).toBe(true);
	});
	it("makeProblemText: 미확인은 그 공급자 사용 기록 문구", () => {
		expect(makeProblemText("fish_audio", problem("unknown_outcome"))).toEqual({
			text: "처리 여부를 확인하지 못했어요. 크레딧이 쓰였을 수 있으니 Fish Audio 사용 기록을 확인한 뒤 이어서 만들어 주세요",
			connections: false,
		});
		expect(unknownExpiredOf("airy")).toBe(
			"확인 시간이 지났어요. 크레딧 사용 여부는 Airy 사용 기록에서 확인해 주세요",
		);
	});
	it("진행 중·대기 시각은 이어서 만들기 문구, 대기 시각이 없으면 T5 문구", () => {
		expect(makeProblemText("typecast", problem("in_progress")).text).toBe(
			"다른 생성이 진행 중이에요. 끝난 뒤 이어서 만들어 주세요",
		);
		expect(
			makeProblemText("gemini", problem("rate_limit", { retryAt: RETRY_AT }))
				.text,
		).toBe(
			`요청 한도에 걸렸어요 · ${retryTime(RETRY_AT)} 이후에 이어서 만들 수 있어요`,
		);
		// 막대 오류 줄에 끼워도 '멈췄어요'가 한 번이다
		const barLine = PARAGRAPH_TEXT.stoppedAt(
			12,
			makeProblemText("typecast", problem("rate_limit", { retryAt: RETRY_AT }))
				.text,
		);
		expect(barLine.match(/멈췄어요/g)).toHaveLength(1);
		expect(makeProblemText("gemini", problem("rate_limit")).text).toBe(
			trialProblemText("gemini", problem("rate_limit")).text,
		);
	});
	it("makeProblemText·unknownExpiredOf: Gemini 미확인은 요금·Google AI Studio 문구", () => {
		expect(makeProblemText("gemini", problem("unknown_outcome"))).toEqual({
			text: "처리 여부를 확인하지 못했어요. 요금이 들었을 수 있으니 Google AI Studio 사용량을 확인한 뒤 이어서 만들어 주세요",
			connections: false,
		});
		expect(unknownExpiredOf("gemini")).toBe(
			"확인 시간이 지났어요. 요금 발생 여부는 Google AI Studio 사용량에서 확인해 주세요",
		);
	});
	it("속도 설정이 없는 Gemini의 큰 오디오는 속도를 말하지 않는다", () => {
		const big = problem("provider_input", { providerCode: "audio_too_large" });
		expect(makeProblemText("gemini", big).text).toBe(
			"결과 오디오가 너무 커요. 대본을 줄이거나 말투 지시를 바꿔 주세요",
		);
		expect(makeProblemText("typecast", big).text).toContain("속도");
	});
	it("Airy 큰 오디오 문구에 '속도'가 없음", () => {
		const big = problem("provider_input", { providerCode: "audio_too_large" });
		const text = makeProblemText("airy", big).text;
		expect(text).not.toContain("속도");
		expect(text).toContain("대본");
	});
	it("작업실 문구: 성우 거절·너무 큰 결과·저장소·알 수 없는 실패", () => {
		expect(makeProblemText("typecast", problem("voice_unavailable"))).toEqual({
			text: "이 성우는 보관함에 없거나 현재 이용 불가예요. 성우를 다시 골라 주세요",
			connections: false,
		});
		expect(PARAGRAPH_TEXT.voiceRejected).toBe(
			"이 성우는 보관함에 없거나 현재 이용 불가예요. 성우를 다시 골라 주세요",
		);
		expect(
			makeProblemText(
				"typecast",
				problem("provider_input", { providerCode: "audio_too_large" }),
			).text,
		).toBe("결과 오디오가 너무 커요. 대본을 줄이거나 속도를 올려 주세요");
		expect(makeProblemText("typecast", problem("storage")).text).toBe(
			"지금은 음성을 만들 수 없어요. 잠시 뒤 다시 해 주세요",
		);
		expect(makeProblemText("typecast", problem("unexpected")).text).toBe(
			"음성을 만들지 못했어요. 잠시 뒤 다시 해 주세요",
		);
	});
	it("나머지는 그 공급자의 T5 문구(키 문제는 '연결 상태 보기')", () => {
		expect(makeProblemText("typecast", problem("no_key")).connections).toBe(
			true,
		);
		expect(makeProblemText("typecast", problem("quota")).text).toBe(
			"크레딧이 부족해요. 기본 샘플은 무료로 들을 수 있어요",
		);
	});
	it("생성 실패(createFailureOf): 사유 없는 실패는 미확인 문구, 처리 전 거절은 '만들지 못했어요'", () => {
		expect(
			makeProblemText(
				"typecast",
				createFailureOf(new TypeError("Failed to fetch")),
			).text,
		).toBe(PARAGRAPH_TEXT.unknownOutcome("typecast"));
		expect(
			makeProblemText("typecast", createFailureOf(new ORPCError("BAD_REQUEST")))
				.text,
		).toBe("음성을 만들지 못했어요. 잠시 뒤 다시 해 주세요");
	});
});

describe("blockText(막대·카드의 막는 이유)", () => {
	it("막대는 지금 글자 수까지, 카드(short)는 짧게. 성우 없음·이용 불가는 같다", () => {
		const long = { kind: "too_long", length: 2153, max: 2000 } as const;
		expect(blockText(long, false)).toBe(
			"2,000자 이하로 줄여 주세요 (지금 2,153자)",
		);
		expect(blockText(long, true)).toBe("2,000자를 넘었어요");
		for (const short of [false, true]) {
			expect(blockText("no_voice", short)).toBe("성우를 골라 주세요");
			expect(blockText("unavailable", short)).toBe(
				"이 성우는 지금 쓸 수 없어요",
			);
		}
		// 막대는 빈 문단을 '만들 문단이 없어요'로 말한다(카드는 빈 문단에 이유를 두지 않는다)
		expect(blockText("empty", false)).toBe("만들 문단이 없어요");
	});
});

describe("PARAGRAPH_TEXT(브리프 9절)", () => {
	it("길이 초과는 정리 뒤 글자가 상한 안이면 숫자를 보이지 않는다", () => {
		expect(PARAGRAPH_TEXT.tooLong(2153, 2000)).toBe(
			"2,000자 이하로 줄여 주세요 (지금 2,153자)",
		);
		expect(PARAGRAPH_TEXT.tooLong(1900, 2000)).toBe(
			"2,000자 이하로 줄여 주세요",
		);
		expect(PARAGRAPH_TEXT.blockedAt(3, PARAGRAPH_TEXT.noVoice)).toBe(
			"문단 3: 성우를 골라 주세요",
		);
	});
	it("함수형 문구", () => {
		expect(PARAGRAPH_TEXT.paragraphN(12)).toBe("문단 12");
		expect(PARAGRAPH_TEXT.progress(3, 28, 12, 18)).toBe(
			"28개 중 3번째 · 문단 12 · 18초",
		);
		expect(PARAGRAPH_TEXT.stoppedAt(12, "공급자 쪽 오류예요")).toBe(
			"문단 12에서 멈췄어요 · 공급자 쪽 오류예요",
		);
		expect(PARAGRAPH_TEXT.makeAll(28, true)).toBe("전체 만들기 · 28개 · 무료");
		expect(PARAGRAPH_TEXT.makeAll(28, false)).toBe("전체 만들기 · 28개");
		expect(PARAGRAPH_TEXT.inserted(200, 0)).toBe("문단 200개를 넣었어요");
		expect(PARAGRAPH_TEXT.inserted(200, 5)).toBe(
			"문단 200개를 넣었어요. 나머지 5개는 넣지 않았어요",
		);
		expect(PARAGRAPH_TEXT.overLimit(5)).toBe(
			"200개까지만 넣어요. 나머지 5개는 넣지 않아요",
		);
	});
	it("작업 요약 사용량 줄: 공급자 이름은 화면이 앞에 붙이고(translate=no) N개 · 금액, Gemini는 아래 추정 줄과 겹치지 않게 금액만, 무료는 금액 없이", () => {
		expect(PARAGRAPH_TEXT.usageRow(22, { unit: "credit", amount: 6410 })).toBe(
			"22개 · 약 6,410크레딧",
		);
		const gemini = PARAGRAPH_TEXT.usageRow(3, {
			unit: "usd_micro",
			amount: 420_000,
		});
		expect(gemini).toBe("3개 · 약 $0.4200");
		expect(gemini).not.toContain("추정");
		expect(PARAGRAPH_TEXT.usageRow(5, null)).toBe("5개");
	});
	it("예상 길이는 1분 미만이면 초, 그 위는 분(반올림)", () => {
		expect(PARAGRAPH_TEXT.aboutLength(40)).toBe("약 40초");
		expect(PARAGRAPH_TEXT.aboutLength(1860)).toBe("약 31분");
		expect(PARAGRAPH_TEXT.summaryChip(12, 40, 1860)).toBe("12/40 · 약 31분");
		expect(PARAGRAPH_TEXT.madeOf(1200, 2000)).toBe("1,200 / 2,000");
	});
	it("막대(브리프 4·5.7): 잠긴 주 버튼, 한 줄 칸, 결과 칸 안내와 캡션", () => {
		expect(PARAGRAPH_TEXT.makeAllPlain).toBe("전체 만들기");
		expect(PARAGRAPH_TEXT.makeRestPlain).toBe("이어서 만들기");
		expect(PARAGRAPH_TEXT.stop).toBe("멈추기");
		expect(PARAGRAPH_TEXT.waitNote).toBe(
			"공급자 응답을 기다리고 있어요. 다시 누르지 않아도 돼요",
		);
		expect(PARAGRAPH_TEXT.freeLine).toBe(
			"Fish Audio 무료 모델이라 확인 없이 만들어요",
		);
		expect(PARAGRAPH_TEXT.pasteHint).toBe("대본을 붙여 넣으면 문단으로 나눠요");
		expect(PARAGRAPH_TEXT.allMadeHint).toBe("모든 문단을 만들었어요");
		expect(PARAGRAPH_TEXT.resultHint).toBe(
			"문단을 만들면 여기서 들을 수 있어요",
		);
		// 앞 20자(코드 포인트, 공백은 한 칸으로) 뒤 말줄임, 짧으면 그대로
		expect(
			PARAGRAPH_TEXT.listenCaption(
				3,
				"Rachel",
				"안녕하세요\n오늘은 문단 작업실을 소개할게요",
			),
		).toBe("문단 3 · Rachel · 안녕하세요 오늘은 문단 작업실을 소개…");
		expect(PARAGRAPH_TEXT.listenCaption(3, "Rachel", "짧은 문단")).toBe(
			"문단 3 · Rachel · 짧은 문단",
		);
		expect(PARAGRAPH_TEXT.joinCaption(1872.4)).toBe("이어 듣기 · 31분 12초");
		expect(PARAGRAPH_TEXT.joinCaption(42.6)).toBe("이어 듣기 · 43초");
	});
	it("critique·audit 반영(대조표 24행): 막힌 문단 제외 사용량, 붙여 넣기 경고, 카드 '만들기' 이름, 레일 이름", () => {
		expect(PARAGRAPH_TEXT.blockedExcluded(3)).toBe("막힌 문단 3개 제외");
		expect(PARAGRAPH_TEXT.estimateNeedsVoice).toBe("성우를 고르면 셈해요");
		expect(PARAGRAPH_TEXT.replaceWarning(40, 0)).toBe(
			"지금 문단 40개를 모두 바꿔요",
		);
		expect(PARAGRAPH_TEXT.replaceWarning(40, 3)).toBe(
			"지금 문단 40개를 모두 바꿔요 · 성우나 설정을 바꾼 문단 3개도 사라져요",
		);
		expect(PARAGRAPH_TEXT.append).toBe("이어 넣기");
		// 접근 이름은 보이는 글('만들기', 무료면 '무료' 배지까지)을 담는다(2.5.3)
		expect(PARAGRAPH_TEXT.makeOf(3)).toBe("문단 3 만들기");
		expect(PARAGRAPH_TEXT.makeOf(3, true)).toBe("문단 3 만들기 무료");
		expect(PARAGRAPH_TEXT.railLabel).toBe("작업 설정과 요약");
		expect(PARAGRAPH_TEXT.playAll).toBe("이어 듣기");
	});
	it("받기 메뉴 항목 둘째 줄(브리프 5.7)", () => {
		expect(PARAGRAPH_TEXT.receiveWavNote).toBe("문단 사이 쉼을 넣어 이어요");
		expect(PARAGRAPH_TEXT.receiveZipNote(40)).toBe("번호순 파일 40개");
		expect(PARAGRAPH_TEXT.receiveSrtNote).toBe("한 파일과 시각이 맞아요");
		// 받을 문단이 없으면(꺼진 항목) 숫자를 빼고 말한다(F13-1)
		expect(PARAGRAPH_TEXT.receiveZipNote(0)).toBe("번호순 파일");
		// 만든 문단이 있는데 아직 듣지 않았다(F13-2)
		expect(PARAGRAPH_TEXT.listenHint).toBe(
			"문단의 듣기를 누르면 여기서 들려요",
		);
	});
	it("확인 창 무료 갈래(모두 무료인데 미확인), Typecast 초과 경고, Gemini 요율 근거", () => {
		expect(PARAGRAPH_TEXT.confirmFree(3)).toBe("문단 3개를 만들까요?");
		expect(PARAGRAPH_TEXT.unknownFree).toBe(
			"처리 여부를 확인하지 못한 문단이 있어요. 다시 만들어도 무료예요",
		);
		expect(PARAGRAPH_TEXT.typecastOverdrawn).toBe(
			"남은 플랜 크레딧이 없어요. 플랜에 따라 추가 청구될 수 있어요",
		);
		const before = Date.parse("2026-10-23T00:00:00+09:00");
		// 문단마다 다른 초 수는 빼고 모델별 1분 단가와 말 빠르기 가정만(usageBasis와 같은 표현)
		expect(PARAGRAPH_TEXT.geminiBasis(["gemini-3.8-flash-tts"], before)).toBe(
			"(Gemini 요금 기준: 유료 등급 1분 $0.0135 · 1초에 5글자 가정)",
		);
		expect(
			PARAGRAPH_TEXT.geminiBasis(
				["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"],
				before,
			),
		).toBe(
			"(Gemini 요금 기준: 유료 등급 1분 gemini-3.8-flash-tts $0.0135, gemini-3.8-flash-lite-tts $0.0090 · 1초에 5글자 가정)",
		);
		// 2027-01-01 0시 KST부터 두 배
		expect(
			PARAGRAPH_TEXT.geminiBasis(
				["gemini-3.8-flash-tts"],
				Date.parse("2027-01-01T00:00:00+09:00"),
			),
		).toBe("(Gemini 요금 기준: 유료 등급 1분 $0.0270 · 1초에 5글자 가정)");
	});
	it("전체 만들기 확인 창(브리프 5.8): 새로 만들 문단 줄, 중복 과금 경고는 Gemini가 들면 '비용'", () => {
		expect(PARAGRAPH_TEXT.confirmNew).toBe("새로 만들 문단");
		expect(PARAGRAPH_TEXT.confirmCount(28, 12)).toBe(
			"28개 (저장된 결과 12개는 크레딧 0)",
		);
		expect(PARAGRAPH_TEXT.confirmCount(28, 0)).toBe("28개");
		expect(PARAGRAPH_TEXT.airyBasis("한국어 1글자 1.5크레딧")).toBe(
			"(Airy 요금 기준: 한국어 1글자 1.5크레딧)",
		);
		expect(PARAGRAPH_TEXT.unknownRetry(false)).toBe(
			"같은 대본·성우·설정의 앞 요청은 처리 여부를 아직 몰라요. 다시 만들면 크레딧이 한 번 더 쓰일 수 있어요",
		);
		expect(PARAGRAPH_TEXT.unknownRetry(true)).toBe(
			"같은 대본·성우·설정의 앞 요청은 처리 여부를 아직 몰라요. 다시 만들면 비용이 한 번 더 들 수 있어요",
		);
	});
	it("조각 받기 실패는 없는 '이전 결과'를 가리키지 않고 공급자와 상관없이 '비용'이라 한다", () => {
		expect(PARAGRAPH_TEXT.receiveFailed).toBe(
			"결과를 받지 못했어요. 잠시 뒤 다시 받아 주세요. 다시 받아도 비용은 들지 않아요",
		);
	});
	it("문단 카드(브리프 5.4·5.5): 접근 이름에 문단 번호, 글자 수, 가름선", () => {
		expect(PARAGRAPH_TEXT.scriptOf(3)).toBe("문단 3 대본");
		expect(PARAGRAPH_TEXT.count(58, 2000)).toBe("58 / 2,000자");
		expect(PARAGRAPH_TEXT.settingsOf(3)).toBe("문단 3 설정");
		expect(PARAGRAPH_TEXT.menuOf(3)).toBe("문단 3 메뉴");
		expect(PARAGRAPH_TEXT.menu).toBe("문단 메뉴");
		expect(PARAGRAPH_TEXT.failed).toBe("만들지 못했어요");
		expect(PARAGRAPH_TEXT.chipAction("감정 기쁨")).toBe("감정 기쁨 바꾸기");
		expect(PARAGRAPH_TEXT.moreChips(2)).toBe("+2");
		expect(PARAGRAPH_TEXT.moreChipsLabel(2)).toBe("+2 바꾼 설정 더 보기");
		expect(PARAGRAPH_TEXT.gapName(3)).toBe("문단 3 뒤 쉼(초)");
		expect(PARAGRAPH_TEXT.gapResetOf(3)).toBe("기본으로, 문단 3 뒤 쉼");
		expect(PARAGRAPH_TEXT.gapLineHelp("0.5")).toBe(
			"0~5초, 0.1초 단위. 비우면 기본 0.5초",
		);
	});
	it("⋯ 메뉴 항목과 꺼진 이유, 카드에 붙여 넣어 나눈 알림(넘친 것은 알린다)", () => {
		expect([
			PARAGRAPH_TEXT.moveUp,
			PARAGRAPH_TEXT.moveDown,
			PARAGRAPH_TEXT.insertBelow,
			PARAGRAPH_TEXT.splitHere,
			PARAGRAPH_TEXT.mergePrev,
			PARAGRAPH_TEXT.mergeNextItem,
			PARAGRAPH_TEXT.remove,
		]).toEqual([
			"위로",
			"아래로",
			"아래에 문단 추가",
			"여기서 나누기",
			"앞 문단과 합치기",
			"다음 문단과 합치기",
			"지우기",
		]);
		expect(PARAGRAPH_TEXT.firstOne).toBe("첫 문단이에요");
		expect(PARAGRAPH_TEXT.lastOne).toBe("마지막 문단이에요");
		expect(PARAGRAPH_TEXT.splitInto(3)).toBe("문단 3개로 나눴어요.");
		expect(PARAGRAPH_TEXT.splitInto(3, 2)).toBe(
			"문단 3개로 나눴어요. 나머지 2개는 넣지 않았어요.",
		);
		// 200개라 나누지 못하고 첫 덩어리만 지금 문단에 넣었다
		expect(PARAGRAPH_TEXT.pasteFull(4)).toBe(
			"문단은 200개까지예요. 4개는 넣지 않았어요.",
		);
	});
	it("카드 성우 단추 접근 이름에 문단 번호, 목록 전·보관함에 없는 성우", () => {
		expect(PARAGRAPH_TEXT.voiceLabel(3, "포세이돈", "typecast", true)).toBe(
			"문단 3 성우: 포세이돈, Typecast, 기본을 따름",
		);
		expect(PARAGRAPH_TEXT.voiceLabel(3, "Rachel", "elevenlabs", false)).toBe(
			"문단 3 성우: Rachel, ElevenLabs",
		);
		expect(PARAGRAPH_TEXT.voiceLabel(3, null, "typecast", true)).toBe(
			"문단 3 성우: Typecast, 기본을 따름",
		);
		expect(PARAGRAPH_TEXT.pickVoiceOf(3)).toBe("문단 3 성우 고르기");
		expect(PARAGRAPH_TEXT.notSaved).toBe("보관함에 없는 성우");
		expect(PARAGRAPH_TEXT.voicesLoading).toBe("성우 목록을 불러오고 있어요");
	});
	it("화자 문구(T10-b 브리프 16.5): 화자 따르기·접근 이름·정했어요", () => {
		expect(PARAGRAPH_TEXT.followSpeaker).toBe("화자 따르기");
		expect(PARAGRAPH_TEXT.followDefault).toBe("기본 따르기");
		expect(
			PARAGRAPH_TEXT.voiceLabel(3, "Rachel", "elevenlabs", true, "민수"),
		).toBe("문단 3 성우: Rachel, ElevenLabs, 화자 민수의 성우를 따름");
		// 이름 뒤에 받침 따라 바뀌는 조사를 붙이지 않는다(브리프 9절), 화자를 따르지 않으면 기본을 따름 그대로
		expect(PARAGRAPH_TEXT.voiceLabel(3, null, "typecast", true, "민준")).toBe(
			"문단 3 성우: Typecast, 화자 민준의 성우를 따름",
		);
		expect(PARAGRAPH_TEXT.voiceLabel(3, null, "typecast", true, null)).toBe(
			"문단 3 성우: Typecast, 기본을 따름",
		);
		// 자기 성우면 따르지 않는다
		expect(
			PARAGRAPH_TEXT.voiceLabel(3, "Rachel", "elevenlabs", false, "민수"),
		).toBe("문단 3 성우: Rachel, ElevenLabs");
		expect(PARAGRAPH_TEXT.speakerSet("민수")).toBe("화자를 정했어요 · 민수");
		expect(PARAGRAPH_TEXT.speakerSet("민준")).toBe("화자를 정했어요 · 민준");
		expect(PARAGRAPH_TEXT.speakerSet("Tom")).toBe("화자를 정했어요 · Tom");
	});
	it("T10-b 화자 칸·고르기·이어 듣기 문구(브리프 16.5)", () => {
		const t = PARAGRAPH_TEXT;
		expect(t.speakers).toBe("화자");
		expect(t.speakersCount(4)).toBe("4명");
		expect(t.speakersBand(2)).toBe("화자 2명");
		expect(t.speakerParagraphs(12)).toBe("문단 12");
		expect(t.speakerFollowsDefault).toBe("기본 성우 따름");
		expect(t.speakerRemove).toBe("화자 지우기");
		expect(t.speakerRemoveOf("민수")).toBe("화자 지우기, 민수");
		expect(t.speakerVoiceOf("민수", "Rachel · ElevenLabs")).toBe(
			"화자 민수 성우: Rachel · ElevenLabs",
		);
		expect(t.speakerBusy(12)).toBe("문단 12개가 이 화자예요");
		expect(t.pickForSpeaker("민수")).toBe("화자 민수의 성우를 골라요");
		expect(t.pickForSelection(3)).toBe("고른 문단 3개의 성우를 골라요");
		expect(t.clearVoice).toBe("비우기(기본 성우 따름)");
		expect(t.speaker).toBe("화자");
		expect(t.noSpeaker).toBe("화자 없음");
		expect(t.pickOf(3)).toBe("문단 3 고르기");
		expect(t.playing).toBe("듣는 중");
		expect(t.select).toBe("고르기");
		expect(t.selectAll).toBe("모두 고르기");
		expect(t.selectedOf(3, 40)).toBe("3/40개 고름");
		expect([t.selectVoice, t.selectGap, t.selectFollow]).toEqual([
			"성우",
			"쉼",
			"따르기",
		]);
		expect(t.selectNone).toBe("문단을 골라 주세요");
		expect(t.selectLocked).toBe("전체 만들기가 끝난 뒤 바꿀 수 있어요");
		expect(t.selectEnd).toBe("끝내기");
		expect(t.selectBarLabel).toBe("고른 문단 고치기");
		expect(t.batchGapTitle(3)).toBe("고른 문단 3개의 문단 뒤 쉼");
		expect(t.apply).toBe("적용");
		expect(t.batchVoiceDone(3)).toBe("문단 3개의 성우를 바꿨어요.");
		expect(t.batchFollowDone(3)).toBe("문단 3개가 성우를 따르게 했어요.");
		expect(t.batchSpeakerDone(3)).toBe("문단 3개의 화자를 바꿨어요.");
		expect(t.batchGapDone(3)).toBe("문단 3개의 쉼을 바꿨어요.");
		expect(t.batchRemoveDone(3)).toBe("문단 3개를 지웠어요.");
		expect(t.prevParagraph).toBe("이전 문단");
		expect(t.nextParagraph).toBe("다음 문단");
		expect(t.playingAt(12)).toBe("문단 12 재생 중");
	});
	it("T10-b 다듬기 문구(브리프 16.8)", () => {
		const t = PARAGRAPH_TEXT;
		expect(t.speakerRemoved("민수")).toBe("화자를 지웠어요 · 민수");
		expect(t.speakerPicksFollow(12)).toBe(
			"고르면 이 화자 문단 12개가 함께 따라요",
		);
		// 성우 목록을 받는 중(이름 없음)에도 구분점으로 시작하지 않는다
		expect(t.speakerVoiceNow("Rachel", "ElevenLabs")).toBe(
			"Rachel · ElevenLabs",
		);
		expect(t.speakerVoiceNow(null, "ElevenLabs")).toBe("ElevenLabs");
	});
	it("붙여 넣기 미리 보기 화자 줄과 상한 문구", () => {
		const t = PARAGRAPH_TEXT;
		expect(t.pasteSpeakersHead(2)).toBe("화자 2명:");
		expect(t.pasteSpeakersShown(["민수", "지아", "도윤"])).toEqual([
			"민수",
			"지아",
			"도윤",
		]);
		expect(t.pasteSpeakersMore(["민수", "지아", "도윤"])).toBeNull();
		expect(t.pasteSpeakersShown(["가", "나", "다", "라"])).toEqual([
			"가",
			"나",
		]);
		expect(t.pasteSpeakersMore(["가", "나", "다", "라"])).toBe("외 2명");
		expect(PARAGRAPH_TEXT.speakersMax(0)).toBe("화자는 20명까지예요");
		expect(PARAGRAPH_TEXT.speakersMax(3)).toBe(
			"화자는 20명까지예요. 문단이 없는 화자 3명을 지우면 넣을 수 있어요",
		);
	});
	it("화자 성우가 빠진 알림은 화자 갈래를 말한다", () => {
		expect(PARAGRAPH_TEXT.voicesDropped(false, 0, 2)).toBe(
			"보관함에 없는 화자 성우 2개를 비웠어요. 그 화자의 문단은 기본 성우를 따라요",
		);
		expect(PARAGRAPH_TEXT.voicesDropped(false, 3, 1)).toBe(
			"보관함에 없는 성우를 쓰던 문단 3개는 기본 성우를 따라요. 화자 성우 1개도 보관함에 없어 비웠어요",
		);
		expect(PARAGRAPH_TEXT.voicesDropped(true, 0, 1)).toBe(
			"기본 성우가 보관함에 없어 비웠어요. 기본 성우를 다시 골라 주세요. 화자 성우 1개도 보관함에 없어 비웠어요",
		);
		// 화자가 없으면 T10-a 문구 그대로
		expect(PARAGRAPH_TEXT.voicesDropped(false, 3, 0)).toBe(
			PARAGRAPH_TEXT.voicesDropped(false, 3),
		);
	});
	it("자동 태그 알림은 기본 성우인지 화자 성우인지 가리지 않는다", () => {
		expect(PARAGRAPH_TEXT.autoTagOwnNote(2)).toBe(
			"감정·말투를 바꾼 문단 2개는 이제 자기 성우와 설정을 써요",
		);
	});
	it("임시 작업을 읽으며 보관함에 없는 성우를 비운 알림(F30-2): 기본만·문단만·둘 다", () => {
		expect(PARAGRAPH_TEXT.voicesDropped(true, 0)).toBe(
			"기본 성우가 보관함에 없어 비웠어요. 기본 성우를 다시 골라 주세요",
		);
		expect(PARAGRAPH_TEXT.voicesDropped(false, 3)).toBe(
			"보관함에 없는 성우를 쓰던 문단 3개는 기본 성우를 따라요",
		);
		expect(PARAGRAPH_TEXT.voicesDropped(true, 2)).toBe(
			"기본 성우와 문단 2개의 성우가 보관함에 없어 비웠어요. 기본 성우를 다시 골라 주세요",
		);
	});
});

describe("PARAGRAPH_TEXT 태그 도구줄·자동 태그(브리프 15.3)", () => {
	it("글 문구는 15.3 표 그대로", () => {
		expect(PARAGRAPH_TEXT).toMatchObject({
			tagsEmotionNote:
				"이 성우는 대본 태그를 읽지 않아요. 감정은 설정에서 바꿔요",
			tagsStyleNote:
				"이 성우는 대본 태그를 읽지 않아요. 말투는 설정에서 바꿔요",
			tagsModelNote:
				"이 모델은 대본 태그를 읽지 않아요. 태그는 Eleven v3·v4에서 써요",
			tagsToSettings: "설정에서 바꾸기",
			tagSoundGroup: "소리 · 커서 위치에",
			tagMoodGroup: "분위기 · 커서 위치에",
			unsentEmpty: "태그를 빼면 보낼 글이 없어요",
			autoTag: "자동 태그",
			autoTagName: "자동 태그 추천, 비용 발생",
			autoTagNone: "태그를 받는 성우의 문단이 없어요",
			autoTagBusy: "전체 만들기가 끝난 뒤 추천받을 수 있어요",
			autoTagTitle: "대본을 보내 태그를 추천받을까요?",
			// 모델 코드명만 번역하지 않게 앞글·모델명·뒷글로 나눴다(audit P3)
			autoTagModelNote: [
				"OpenAI 텍스트 모델(",
				"gpt-6-luna",
				")을 써요. 3번 실패하면 Gemini(",
				"gemini-3.8-flash",
				")로 보내요. Gemini 키가 무료 등급이면 Google이 대본을 학습에 쓸 수 있어요",
			],
			autoTagGo: "추천 받기",
			// 창을 연 뒤 보낼 문단·횟수가 늘면 보내지 않고 새 수를 보인다(security low 1)
			autoTagRecount:
				"보낼 문단이 바뀌었어요. 바뀐 수를 확인하고 다시 눌러 주세요",
			cancel: "취소",
			stop: "멈추기",
			autoTagStopping: "멈추는 중",
			autoTagPreviewTitle: "자동 태그 추천",
			autoTagNothing: "추천할 태그가 없어요",
			autoTagMadeNote: "만든 결과가 있어요. 바꾸면 다시 만들어야 해요",
			autoTagUnknownNote:
				"처리 여부를 확인하지 못한 문단이에요. 바꾸면 다시 만들어야 해요",
			autoTagFields: {
				text: "대본",
				emotion: "감정",
				style: "말투",
				direction: "말투 지시",
			},
			autoTagBefore: "전",
			autoTagAfter: "후",
			autoTagNewTag: "새 태그",
			close: "닫기",
			undo: "되돌리기",
		});
		// 확인 창 본문은 세 줄 함수로 나눴다(QA F-P2-2)
		expect(PARAGRAPH_TEXT).not.toHaveProperty("autoTagBody");
	});
	it("함수형 문구의 숫자 자리", () => {
		expect(PARAGRAPH_TEXT.tagToolbarName(12)).toBe("문단 12 태그");
		// 주어는 성우, ElevenLabs v2·flash(elevenlabs_plain)는 모델이다(critique P2)
		expect(PARAGRAPH_TEXT.unsentNote(3, false)).toBe(
			"이 성우가 읽지 않는 태그 3개는 빼고 보내요",
		);
		expect(PARAGRAPH_TEXT.unsentNote(1200, true)).toBe(
			"이 모델이 읽지 않는 태그 1,200개는 빼고 보내요",
		);
		// 확인 창 횟수 줄: 한 번이면 '한 번에'
		expect(PARAGRAPH_TEXT.autoTagCount(12, 1)).toBe(
			"문단 12개를 한 번에 보내요",
		);
		expect(PARAGRAPH_TEXT.autoTagCount(1200, 7)).toBe(
			"문단 1,200개를 7번에 나눠 보내요",
		);
		// 금액 줄: 횟수 × $0.01을 USD 소수 둘로(부동소수 오차 없이)
		expect(PARAGRAPH_TEXT.autoTagCost(1)).toBe("약 $0.01");
		expect(PARAGRAPH_TEXT.autoTagCost(3)).toBe(
			"한 번에 약 $0.01, 모두 약 $0.03",
		);
		expect(PARAGRAPH_TEXT.autoTagCost(29)).toBe(
			"한 번에 약 $0.01, 모두 약 $0.29",
		);
		expect(PARAGRAPH_TEXT.autoTagCost(120)).toBe(
			"한 번에 약 $0.01, 모두 약 $1.20",
		);
		expect(PARAGRAPH_TEXT.autoTagRetryAt(RETRY_AT)).toBe(
			`${retryTime(RETRY_AT)} 이후에 다시 추천받을 수 있어요`,
		);
		expect(PARAGRAPH_TEXT.autoTagProgress(2, 5)).toBe("추천 받는 중 2/5");
		expect(
			PARAGRAPH_TEXT.autoTagStoppedAt(
				51,
				"추천을 받지 못했어요. 잠시 뒤 다시 해 주세요",
			),
		).toBe(
			"문단 51부터 멈췄어요 · 추천을 받지 못했어요. 잠시 뒤 다시 해 주세요",
		);
		expect(PARAGRAPH_TEXT.autoTagNotSent(51)).toBe(
			"문단 51부터는 보내지 않았어요",
		);
		expect(PARAGRAPH_TEXT.autoTagSkipped(4)).toBe(
			"태그를 받지 않는 문단 4개는 그대로 둬요",
		);
		expect(PARAGRAPH_TEXT.autoTagOwnNote(2)).toBe(
			"감정·말투를 바꾼 문단 2개는 이제 자기 성우와 설정을 써요",
		);
		expect(PARAGRAPH_TEXT.autoTagChoose(7)).toBe("문단 7 바꾸기");
		expect(PARAGRAPH_TEXT.autoTagApplyN(3)).toBe("고른 문단 바꾸기 (3)");
		expect(PARAGRAPH_TEXT.autoTagApplied(3)).toBe("문단 3개를 바꿨어요");
		expect(PARAGRAPH_TEXT.autoTagChanged(1)).toBe(
			"보낸 뒤 고친 문단 1개는 건너뛰었어요",
		);
	});
});

describe("문단 자동 태그 실패 문구(autoTagProblemText + PARAGRAPH_AUTO_TAG_TEXT, 브리프 15.3)", () => {
	const shown = (
		reason: string,
		extra: { retryAt?: string; providerCode?: string } = {},
	) => autoTagProblemText(problem(reason, extra), PARAGRAPH_AUTO_TAG_TEXT);
	it("모델 안내 회색 줄(스펙 16.3), 홀수 칸이 모델 코드명", () => {
		expect(PARAGRAPH_TEXT.autoTagModelNote).toHaveLength(5);
		expect(PARAGRAPH_TEXT.autoTagModelNote[1]).toBe("gpt-6-luna");
		expect(PARAGRAPH_TEXT.autoTagModelNote[3]).toBe("gemini-3.8-flash");
		expect(PARAGRAPH_TEXT.autoTagModelNote.join("")).toBe(
			"OpenAI 텍스트 모델(gpt-6-luna)을 써요. 3번 실패하면 Gemini(gemini-3.8-flash)로 보내요. Gemini 키가 무료 등급이면 Google이 대본을 학습에 쓸 수 있어요",
		);
	});
	it("답 형식 오류: 비용이 들었을 수 있어 다시 하라고 하지 않는다", () => {
		expect(shown("provider_input", { providerCode: "auto_tag_reply" })).toBe(
			"추천 답을 읽지 못했어요. 비용이 들었을 수 있어요",
		);
	});
	it("429 대기 시각: 앱 공통 retryTime 형식", () => {
		expect(shown("rate_limit", { retryAt: RETRY_AT })).toBe(
			`${retryTime(RETRY_AT)} 이후에 다시 추천받을 수 있어요`,
		);
	});
	it("공급자 오류", () => {
		expect(shown("provider_error")).toBe(
			"추천을 받지 못했어요. 잠시 뒤 다시 해 주세요",
		);
	});
	it("처리 여부 미확인: 비용이 들었을 수 있어 다시 하라고 하지 않는다", () => {
		expect(shown("unknown_outcome")).toBe(
			"추천 답을 받지 못했어요. 비용이 들었을 수 있어요",
		);
	});
	it("그 밖: 키·계정·한도는 Gemini 공통 문구, 공통 대체 문구면 공급자 오류 문구", () => {
		for (const reason of ["no_key", "provider_auth", "quota", "no_permission"])
			expect(shown(reason)).toBe(
				trialProblemText("gemini", problem(reason)).text,
			);
		for (const reason of ["unexpected", "odd_reason"]) {
			expect(trialProblemText("gemini", problem(reason)).text).toBe(
				trialFallback("gemini"),
			);
			expect(shown(reason)).toBe(
				"추천을 받지 못했어요. 잠시 뒤 다시 해 주세요",
			);
		}
	});
});

describe("failShortOf(실패 상태 칸의 짧은 이유, 브리프 6.2)", () => {
	it("사유별 짧은 글, 나머지는 '만들지 못했어요'", () => {
		expect(failShortOf("typecast", problem("rate_limit"))).toBe("대기 중");
		expect(failShortOf("typecast", problem("quota"))).toBe("크레딧 부족");
		expect(failShortOf("gemini", problem("quota"))).toBe("결제·한도 확인");
		expect(failShortOf("airy", problem("no_key"))).toBe("연결 확인 필요");
		expect(failShortOf("airy", problem("provider_auth"))).toBe(
			"연결 확인 필요",
		);
		expect(failShortOf("typecast", problem("in_progress"))).toBe(
			"다른 생성 진행 중",
		);
		expect(failShortOf("typecast", problem("provider_error"))).toBe(
			"공급자 오류",
		);
		expect(failShortOf("typecast", problem("provider_input"))).toBe(
			"만들지 못했어요",
		);
	});
});

describe("chipsOf(카드 차이 칩, 브리프 5.4)", () => {
	const typecast = (settings: Partial<TypecastSettings>): VoiceSetup => ({
		provider: "typecast",
		voiceId: "tc_1",
		settings: { ...DEFAULT_SETTINGS.typecast, ...settings },
	});
	it("자기 성우가 없거나 기본과 같으면 칩이 없다", () => {
		expect(chipsOf(undefined, typecast({}))).toEqual([]);
		expect(chipsOf(typecast({ tempo: 1.2 }), typecast({ tempo: 1.2 }))).toEqual(
			[],
		);
	});
	it("같은 공급자면 기본 성우 설정과 견주고, 감정 칩이 있으면 감정 모드 칩은 뺀다", () => {
		const own = typecast({ emotion: "preset", preset: "happy", tempo: 1.2 });
		expect(chipsOf(own, typecast({}))).toEqual([
			{ field: "preset", text: "감정 기쁨" },
			{ field: "tempo", text: "속도 1.20배" },
		]);
		expect(chipsOf(own, typecast({ tempo: 1.2 }))).toEqual([
			{ field: "preset", text: "감정 기쁨" },
		]);
	});
	it("모델 → 감정·말투 → 속도 → 그 밖 순, 모델·태그는 값만", () => {
		const own: VoiceSetup = {
			provider: "elevenlabs",
			voiceId: "el_1",
			settings: {
				...DEFAULT_SETTINGS.elevenlabs,
				model: "eleven_multilingual_v2",
				stability: 0.6,
				speed: 1.1,
			},
		};
		expect(chipsOf(own, null).map((chip) => chip.text)).toEqual([
			"eleven_multilingual_v2",
			"속도 1.10배",
			"안정성 0.60",
		]);
		const fish: VoiceSetup = {
			provider: "fish_audio",
			voiceId: "fa_1",
			settings: { ...DEFAULT_SETTINGS.fish_audio, speed: 1.2, tag: "whispers" },
		};
		expect(chipsOf(fish, null).map((chip) => chip.text)).toEqual([
			"[whispers]",
			"속도 1.20배",
		]);
	});
	it("다른 공급자의 기본 성우와는 견주지 않고 그 공급자 처음 값과 견준다", () => {
		const airy: VoiceSetup = {
			provider: "airy",
			voiceId: "ai_1",
			settings: { ...DEFAULT_SETTINGS.airy, style: "bright" },
		};
		expect(chipsOf(airy, typecast({ tempo: 1.5 }))).toEqual([
			{ field: "style", text: "말투 밝게" },
		]);
	});
});

describe("paragraphTagGroups(스펙 15.1 표)", () => {
	it("소리 → 분위기 순이고 값은 넣는 글 그대로다(소리는 ACTING 값, 분위기는 [값])", () => {
		const groups = paragraphTagGroups("fish_s2");
		expect(groups.map((g) => [g.kind, g.title, g.short])).toEqual([
			["sound", "소리 · 커서 위치에", "소리"],
			["mood", "분위기 · 커서 위치에", "분위기"],
		]);
		expect(groups[0].items).toBe(ACTING.fish_s2.sound);
		// 알약 접근 이름("신나서, [excited]")과 넣는 글이 같다
		expect(groups[1].items).toEqual(
			ACTING.fish_s2.front.map(({ label, value }) => ({
				label,
				value: `[${value}]`,
			})),
		);
		expect(groups[1].items).toContainEqual({
			label: "신나서",
			value: "[excited]",
		});
		expect(paragraphTagGroups("elevenlabs_tags").map((g) => g.kind)).toEqual([
			"sound",
			"mood",
		]);
	});
	it("Gemini는 소리만(말투는 설정 칸 '말투 지시'), 범위 묶음은 어느 family에도 없다", () => {
		expect(paragraphTagGroups("gemini").map((g) => g.kind)).toEqual(["sound"]);
		expect(paragraphTagGroups("fish_drama").map((g) => g.kind)).toEqual([
			"sound",
			"mood",
		]);
	});
	it("태그를 받지 않는 family는 묶음이 없다(카드가 안내를 보인다)", () => {
		for (const family of [
			"typecast_v30",
			"typecast_v21",
			"airy",
			"elevenlabs_plain",
		] as const)
			expect(paragraphTagGroups(family)).toEqual([]);
	});
});
