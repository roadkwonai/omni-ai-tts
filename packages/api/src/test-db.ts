import { createDb } from "@tts-pilot-app/db";

// DB 테스트 공통(T4 목록 캐시, T6 이후 소유 데이터). TEST_DATABASE_URL이 없으면 연결하지 않는 자리표시자로 만들고 스위트를 건너뛴다(skipped는 통과가 아니다, bts-api).
// 스위트가 표를 통째로 비우므로 이름이 _test로 끝나는 DB만 받는다(계획 리뷰 E10). 테스트 파일은 차례로 돈다(vitest.config.ts fileParallelism false).
export const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl && !new URL(testDatabaseUrl).pathname.endsWith("_test")) {
	throw new Error("TEST_DATABASE_URL은 이름이 _test로 끝나는 DB여야 한다");
}
export const testDb = createDb({
	DATABASE_URL: testDatabaseUrl ?? "postgresql://skip@127.0.0.1:1/skip",
});
