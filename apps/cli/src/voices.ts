import type { ProviderId, Voice } from "@tts-pilot-app/api/providers/contract";
import {
	ClientError,
	type Connection,
	changeVoices,
	manageError,
} from "./client.js";
import { note } from "./output.js";

export const PROVIDERS: readonly string[] = [
	"typecast",
	"elevenlabs",
	"fish_audio",
	"airy",
	"gemini",
] satisfies ProviderId[];
const CACHE_MAX = 500;
const CACHE_MS = 24 * 60 * 60 * 1000;

export const refOf = ({ provider, voiceId }: Voice) => `${provider}:${voiceId}`;
// 공급자:성우 ID. 첫 콜론에서 나눈다
export function parseRef(ref: string): {
	provider: ProviderId;
	voiceId: string;
} {
	const at = ref.indexOf(":");
	const provider = ref.slice(0, Math.max(at, 0));
	const voiceId = ref.slice(at + 1);
	if (!PROVIDERS.includes(provider) || !voiceId)
		throw new ClientError("INPUT", 2, "성우는 공급자:성우 ID여야 합니다.");
	return { provider: provider as ProviderId, voiceId };
}

// 찾은 성우를 origin별로 최근 500명 둔다. 그사이 세션이 바뀌었으면(로그아웃) 버린다
export async function remember(
	{ origin, version }: Pick<Connection, "origin" | "version">,
	found: Voice[],
) {
	const savedAt = Date.now();
	const refs = new Set(found.map(refOf));
	await changeVoices(({ voices }, sessions) => {
		if (sessions[origin]?.version !== version) return;
		voices[origin] = [
			...(voices[origin] ?? []).filter(
				(item) =>
					savedAt - item.savedAt < CACHE_MS && !refs.has(refOf(item.voice)),
			),
			...found.map((voice) => ({ voice, savedAt })),
		].slice(-CACHE_MAX);
	}).catch(() => note("찾은 성우를 voices.json에 두지 못했습니다."));
}
export const remembered = (origin: string, ref: string) =>
	changeVoices(
		({ voices }) =>
			voices[origin]?.find(
				(item) =>
					Date.now() - item.savedAt < CACHE_MS && refOf(item.voice) === ref,
			)?.voice,
	);

// REF의 성우. 보관함 → voices.json → (목록 전체를 주는 공급자) 목록 순서다. saved는 담긴 성우일 때만 있다
export async function resolveVoice(
	connection: Connection,
	ref: string,
): Promise<{ voice: Voice; saved?: Connection["voices"][number] }> {
	const { provider, voiceId } = parseRef(ref);
	const saved = connection.voices.find(({ voice }) => refOf(voice) === ref);
	if (saved) return { voice: saved.voice, saved };
	const cached = await remembered(connection.origin, ref);
	if (cached) return { voice: cached };
	if (provider === "typecast" || provider === "airy" || provider === "gemini") {
		const { voices } = await connection.client
			.voiceList({ provider })
			.catch(manageError);
		const voice = voices.find((item) => item.voiceId === voiceId);
		if (voice) return { voice };
	}
	throw new ClientError(
		"NOT_FOUND",
		4,
		"성우를 찾을 수 없습니다. casting search로 먼저 찾아 주세요.",
	);
}
