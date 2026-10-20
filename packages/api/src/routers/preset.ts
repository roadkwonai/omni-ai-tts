// packages/api/src/routers/preset.ts
import { ORPCError } from "@orpc/server";
import { channel } from "@tts-pilot-app/db/schema/classification";
import {
	channelDefaultPreset,
	voicePreset,
} from "@tts-pilot-app/db/schema/preset";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { deletedSchema, deleteInputSchema } from "../classification-contract";
import type { Context } from "../context";
import { protectedProcedure } from "../index";
import {
	copyName,
	type Preset,
	presetCreateInputSchema,
	presetOverwriteInputSchema,
	presetSchema,
	presetUpdateInputSchema,
	readSettings,
} from "../preset-contract";
import {
	dbCode,
	found,
	isUniqueViolation,
	stored as sharedStored,
} from "../voice-cache";
import { upsert, voiceOf } from "./saved-voice";

type Db = Context["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// 같은 이름은 이름 유니크 인덱스가 막는다(동시 저장 포함). 고른 채널·성우가 그사이 지워지면 외래 키 위반(23503)이라 없는 항목과 같게 NOT_FOUND
const mapError = (error: unknown) =>
	isUniqueViolation(error, "voice_preset_name")
		? new ORPCError("CONFLICT", { data: { reason: "duplicate_name" } })
		: dbCode(error) === "23503"
			? new ORPCError("NOT_FOUND")
			: null;
const stored = <T>(step: string, run: () => Promise<T>) =>
	sharedStored("[preset]", step, run, mapError);

const mine = (ownerId: string, id: string) =>
	and(eq(voicePreset.id, id), eq(voicePreset.ownerId, ownerId));

// 가리킬 채널은 내 것만. 없거나 남의 것이면 NOT_FOUND(prokit-api 불변식 3)
async function ownChannel(tx: Tx, ownerId: string, channelId: string | null) {
	if (channelId === null) return;
	const [row] = await tx
		.select({ id: channel.id })
		.from(channel)
		.where(and(eq(channel.id, channelId), eq(channel.ownerId, ownerId)));
	found(row);
}

// 이 프리셋의 기본 지정을 풀고, on이면 그 채널의 기본을 이 프리셋으로 바꾼다(채널마다 하나, data-upsert).
// 프리셋의 채널을 바꾸거나 비워도 먼저 푸는 이 한 곳이 이전 채널의 기본을 정리한다(스펙 2절 '기본 프리셋의 채널')
// 부르는 쪽이 voice_preset 행 잠금을 먼저 잡는다(presetUpdate의 update, presetCreate는 커밋 전 새 행). 그래야 같은 프리셋 동시 지정이 23505가 되지 않는다
// shortcut: 두 프리셋의 기본 채널을 동시에 맞바꾸면 교착(40P01)으로 한쪽이 500(데이터는 그대로). T14 다중 사용자 때 첫 줄에 pg_advisory_xact_lock(hashtext(ownerId))으로 소유자별로 줄 세운다
async function setDefault(
	tx: Tx,
	presetId: string,
	channelId: string | null,
	on: boolean,
) {
	await tx
		.delete(channelDefaultPreset)
		.where(eq(channelDefaultPreset.presetId, presetId));
	if (on && channelId !== null)
		await tx
			.insert(channelDefaultPreset)
			.values({ channelId, presetId })
			.onConflictDoUpdate({
				target: channelDefaultPreset.channelId,
				set: { presetId },
			});
}

// 프리셋과 그 담은 성우·기본 지정. 담은 성우 조인에도 소유자를 건다(프리셋이 가리키는 성우는 늘 내 것이지만 읽기에서 한 번 더 막는다)
async function listOf(
	db: Db | Tx,
	ownerId: string,
	id?: string,
): Promise<Preset[]> {
	const rows = await db
		.select({
			preset: voicePreset,
			saved: savedVoice,
			defaultOf: channelDefaultPreset.channelId,
		})
		.from(voicePreset)
		.leftJoin(
			savedVoice,
			and(
				eq(savedVoice.id, voicePreset.savedVoiceId),
				eq(savedVoice.ownerId, voicePreset.ownerId),
			),
		)
		.leftJoin(
			channelDefaultPreset,
			eq(channelDefaultPreset.presetId, voicePreset.id),
		)
		.where(id ? mine(ownerId, id) : eq(voicePreset.ownerId, ownerId));
	return rows.map(({ preset, saved, defaultOf }) => {
		const { settings, fixed } = readSettings(preset.provider, preset.settings);
		// provider와 settings의 짝은 readSettings가 지킨다(TS가 합집합의 짝을 따라가지 못한다)
		return {
			id: preset.id,
			name: preset.name,
			provider: preset.provider,
			settings,
			savedVoiceId: saved ? preset.savedVoiceId : null,
			voice: saved ? voiceOf(saved) : null,
			unavailable: saved?.unavailable ?? false,
			channelId: preset.channelId,
			channelDefault: defaultOf !== null,
			fixed,
		} as Preset;
	});
}

const one = async (db: Db | Tx, ownerId: string, id: string) =>
	found((await listOf(db, ownerId, id))[0]);

// 프리셋(T8 스펙 3절). 소유자는 context.ownerId뿐이고 모든 조회·변경에 owner_id 조건을 건다.
// insert 값은 소유자를 마지막에 두고, update는 바꿀 칸만 적는다(입력 스키마가 바뀌어도 소유자가 덮이지 않게, T6 계획 리뷰 E8).
// 트랜잭션 안은 DB 문장뿐이다(공급자 호출 없음, lock-short-transactions)
export const presetRouter = {
	presetList: protectedProcedure
		.output(z.array(presetSchema))
		.handler(({ context: { db, ownerId } }) =>
			stored("목록", () => listOf(db, ownerId)),
		),
	presetCreate: protectedProcedure
		.input(presetCreateInputSchema)
		.output(presetSchema)
		.handler(({ input, context: { db, ownerId } }) =>
			stored("만들기", () =>
				db.transaction(async (tx) => {
					await ownChannel(tx, ownerId, input.channelId);
					// 프리셋의 성우는 보관함에 담는다(즐겨찾기·자주 사용·메모는 그대로, 스펙 2절)
					const savedVoiceId = await upsert(tx, ownerId, input.voice, {});
					const [row] = await tx
						.insert(voicePreset)
						.values({
							name: input.name,
							provider: input.provider,
							savedVoiceId,
							settings: input.settings,
							channelId: input.channelId,
							ownerId,
						})
						.returning({ id: voicePreset.id });
					const { id } = found(row);
					await setDefault(tx, id, input.channelId, input.channelDefault);
					return one(tx, ownerId, id);
				}),
			),
		),
	presetOverwrite: protectedProcedure
		.input(presetOverwriteInputSchema)
		.output(presetSchema)
		.handler(({ input, context: { db, ownerId } }) =>
			stored("덮어쓰기", () =>
				db.transaction(async (tx) => {
					const [current] = await tx
						.select({ provider: voicePreset.provider })
						.from(voicePreset)
						.where(mine(ownerId, input.id));
					// 설정은 공급자마다 칸이 달라 다른 공급자로 바꾸지 않는다(새로 저장한다)
					if (found(current).provider !== input.provider)
						throw new ORPCError("BAD_REQUEST");
					const savedVoiceId = await upsert(tx, ownerId, input.voice, {});
					const [row] = await tx
						.update(voicePreset)
						.set({ savedVoiceId, settings: input.settings })
						.where(mine(ownerId, input.id))
						.returning({ id: voicePreset.id });
					found(row);
					return one(tx, ownerId, input.id);
				}),
			),
		),
	presetUpdate: protectedProcedure
		.input(presetUpdateInputSchema)
		.output(presetSchema)
		.handler(({ input, context: { db, ownerId } }) =>
			stored("고치기", () =>
				db.transaction(async (tx) => {
					await ownChannel(tx, ownerId, input.channelId);
					const [row] = await tx
						.update(voicePreset)
						.set({ name: input.name, channelId: input.channelId })
						.where(mine(ownerId, input.id))
						.returning({ id: voicePreset.id });
					found(row);
					await setDefault(tx, input.id, input.channelId, input.channelDefault);
					return one(tx, ownerId, input.id);
				}),
			),
		),
	presetDuplicate: protectedProcedure
		.input(deleteInputSchema)
		.output(presetSchema)
		.handler(({ input: { id }, context: { db, ownerId } }) =>
			stored("복제", () =>
				db.transaction(async (tx) => {
					const [source] = await tx
						.select()
						.from(voicePreset)
						.where(mine(ownerId, id));
					const { name, provider, savedVoiceId, settings, channelId } =
						found(source);
					const names = await tx
						.select({ name: voicePreset.name })
						.from(voicePreset)
						.where(eq(voicePreset.ownerId, ownerId));
					// 채널 기본은 복제하지 않는다(채널마다 하나)
					const [row] = await tx
						.insert(voicePreset)
						.values({
							name: copyName(
								name,
								names.map((entry) => entry.name),
							),
							provider,
							savedVoiceId,
							settings,
							channelId,
							ownerId,
						})
						.returning({ id: voicePreset.id });
					return one(tx, ownerId, found(row).id);
				}),
			),
		),
	presetRemove: protectedProcedure
		.input(deleteInputSchema)
		.output(deletedSchema)
		.handler(({ input: { id }, context: { db, ownerId } }) =>
			stored("지우기", async () => {
				const [row] = await db
					.delete(voicePreset)
					.where(mine(ownerId, id))
					.returning({ id: voicePreset.id });
				found(row);
				return { deleted: true as const };
			}),
		),
};
