import { createAiry } from "./airy";
import type { ProviderId } from "./contract";
import { createElevenLabs } from "./elevenlabs";
import type { ProviderClient } from "./errors";
import { createFishAudio } from "./fish-audio";
import { createGemini } from "./gemini";
import { createOpenAI, type TextClient } from "./openai";
import { createTypecast } from "./typecast";

type ProviderKeys = Partial<Record<ProviderId | "openai", string | undefined>>;
// openai는 자동 태그 텍스트 전용 칸이다(TTS 공급자가 아니라 ProviderId에 없다)
export type Providers = Partial<Record<ProviderId, ProviderClient>> & {
	openai?: TextClient;
};

// 키가 있는 공급자만 클라이언트를 만든다. 빈 키나 공백 키로 SDK를 만들면 process.env로 대체하므로 만들지 않는다(tts-provider).
const withKey = <T>(key: string | undefined, create: (key: string) => T) =>
	key?.trim() ? create(key.trim()) : undefined;

export function createProviders(keys: ProviderKeys): Providers {
	return {
		typecast: withKey(keys.typecast, createTypecast),
		elevenlabs: withKey(keys.elevenlabs, createElevenLabs),
		fish_audio: withKey(keys.fish_audio, createFishAudio),
		airy: withKey(keys.airy, createAiry),
		gemini: withKey(keys.gemini, createGemini),
		openai: withKey(keys.openai, createOpenAI),
	};
}
