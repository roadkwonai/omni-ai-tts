import { defineConfig } from "vitest/config";

// DB 테스트 파일(voice-cache, voice-list.isolation)은 같은 테스트 DB의 표를 비우고 쓴다.
// 파일을 동시에 돌리면 서로를 깨므로 차례로 돌린다(T4 계획 리뷰 E1. vitest 5 fileParallelism 기본값은 true).
export default defineConfig({ test: { fileParallelism: false } });
