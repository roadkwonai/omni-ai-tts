import { createAiry } from "./airy";
import type { ProviderId } from "./contract";
import { createElevenLabs } from "./elevenlabs";
import type { ProviderClient } from "./errors";
import { createFishAudio } from "./fish-audio";
import { createGemini } from "./gemini";
import { createTypecast } from "./typecast";

type ProviderKeys = Partial<Record<ProviderId, string | undefined>>;
export type Providers = Partial<Record<ProviderId, ProviderClient>>;

// 키가 있는 공급자만 클라이언트를 만든다. 빈 키나 공백 키로 SDK를 만들면 process.env로 대체하므로 만들지 않는다(tts-provider).
const withKey = (
	key: string | undefined,
	create: (key: string) => ProviderClient,
) => (key?.trim() ? create(key.trim()) : undefined);

export function createProviders(keys: ProviderKeys): Providers {
	return {
		typecast: withKey(keys.typecast, createTypecast),
		elevenlabs: withKey(keys.elevenlabs, createElevenLabs),
		fish_audio: withKey(keys.fish_audio, createFishAudio),
		airy: withKey(keys.airy, createAiry),
		gemini: withKey(keys.gemini, createGemini),
	};
}
