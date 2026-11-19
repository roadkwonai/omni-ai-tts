import { expect, test } from "vitest";

import { DEMO_TEXT } from "./demo";

// 공개 데모는 공급자를 부르지 않아 비용이 없다. 확인 창·버튼·자동 태그 이름에 쓰는 데모 문구에 돈 말이 없어야 한다
test("데모 확인 창·버튼·자동 태그 이름은 크레딧·비용 말이 없다", () => {
	expect(DEMO_TEXT.listenTitle).toBe("데모 샘플로 들어 볼까요?");
	expect(DEMO_TEXT.listenAction).toBe("데모 샘플 듣기");
	expect(DEMO_TEXT.makeTitle).toBe("데모 샘플로 만들까요?");
	expect(DEMO_TEXT.makeAction).toBe("데모 샘플로 만들기");
	expect(DEMO_TEXT.makeName).toBe("장면 만들기, 데모 샘플");
	expect(DEMO_TEXT.autoTagParagraphName).toBe("자동 태그 추천");
	expect(DEMO_TEXT.autoTagDramaName).toBe("전체 자동 태그");
	expect(DEMO_TEXT.sentenceHint).toBe("데모 샘플로 나와요.");
	expect(DEMO_TEXT.voiceNote("기본 샘플")).toBe(
		"성우 본래 목소리는 기본 샘플로 들어 보세요",
	);
	expect(DEMO_TEXT.voiceNote("참고 음성")).toBe(
		"비슷한 목소리는 참고 음성으로 들어 보세요",
	);
	expect(DEMO_TEXT.listenFree).toBe("음성 서비스 없이");
	expect(DEMO_TEXT.listenName("민지")).toBe("민지 내 문장 듣기, 데모 샘플");
	expect(DEMO_TEXT.regenerateName("민지")).toBe("민지 새로 만들기, 데모 샘플");
	expect(DEMO_TEXT.savedFree).toBe("저장된 결과");
	expect(DEMO_TEXT.listenName("민지")).not.toMatch(/크레딧|비용|요금/);
	expect(DEMO_TEXT.regenerateName("민지")).not.toMatch(/크레딧|비용|요금/);
	for (const key of [
		"sentenceHint",
		"listenFree",
		"savedFree",
		"listenTitle",
		"listenAction",
		"makeTitle",
		"makeAction",
		"makeNote",
		"makeName",
		"autoTagParagraphName",
		"autoTagDramaName",
	] as const)
		expect(DEMO_TEXT[key]).not.toMatch(/크레딧|비용|요금/);
});
