"use client";

import {
	type QueryClient,
	useIsMutating,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tts-pilot-app/ui/components/tooltip";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Star } from "lucide-react";
import { toast } from "sonner";

import { type Group, MESSAGES, saveFailure } from "@/lib/classes-view";
import { LIBRARY_TEXT, savedKey } from "@/lib/saved-voice-view";
import { client, OWNED_LIST, orpc } from "@/utils/orpc";

// 담은 성우 목록 하나를 캐스팅의 별·행 칩·담기 칸과 보관함이 함께 읽는다(스펙 3절)
const savedListOptions = orpc.savedVoiceList.queryOptions(OWNED_LIST);
// 캐시를 직접 읽고 쓰는 키는 queryOptions의 queryKey다. orpc.savedVoiceList.key()는 무효화용 접두 키라 다른 칸을 가리킨다
export const savedListKey = savedListOptions.queryKey;

export const useSavedList = () => useQuery(savedListOptions);

export function useSavedItem(voice: Voice): SavedVoice | undefined {
	const key = savedKey(voice);
	return useQuery({
		...savedListOptions,
		select: (items) => items.find((item) => savedKey(item.voice) === key),
	}).data;
}

// 채널·분류 목록(칩·분류 붙이기·필터가 함께 쓴다, 계획 리뷰 P8). 둘 다 받아야 loaded다
export function useClassLists() {
	const channels = useQuery(orpc.channelList.queryOptions(OWNED_LIST));
	const classes = useQuery(orpc.classificationList.queryOptions(OWNED_LIST));
	return {
		channels: channels.data ?? [],
		classes: classes.data ?? [],
		loaded: channels.isSuccess && classes.isSuccess,
		failed: channels.isError || classes.isError,
		retry: () => {
			void channels.refetch();
			void classes.refetch();
		},
	};
}

// '성우 N명'이 바뀌는 변경 뒤에 부른다(계획 리뷰 P9)
export function invalidateClasses(queryClient: QueryClient) {
	void queryClient.invalidateQueries({ queryKey: orpc.channelList.key() });
	void queryClient.invalidateQueries({
		queryKey: orpc.classificationList.key(),
	});
}

// 목록 캐시의 그 성우를 바꾼다(담기지 않았으면 그대로)
function patch(
	queryClient: QueryClient,
	key: string,
	change: (item: SavedVoice) => SavedVoice,
) {
	queryClient.setQueryData<SavedVoice[]>(savedListKey, (items) =>
		items?.map((item) => (savedKey(item.voice) === key ? change(item) : item)),
	);
}

// 서버 결과로 목록 캐시를 고친다. 새로 담긴 성우는 맨 앞(최근 담은 순).
// id가 아니라 성우로 찾는다: 다른 탭에서 빼고 다시 담기면 id가 새로 생긴다(QA F1)
export function writeBack(queryClient: QueryClient, saved: SavedVoice) {
	const key = savedKey(saved.voice);
	queryClient.setQueryData<SavedVoice[]>(savedListKey, (items) => {
		if (!items) return items;
		return items.some((item) => savedKey(item.voice) === key)
			? items.map((item) => (savedKey(item.voice) === key ? saved : item))
			: [saved, ...items];
	});
}

// 실패하면 성공으로 보이지 않는다: 알리고 서버 값으로 되돌린다(목록을 다시 받는다). 없어진 채널·분류는 '찾을 수 없어요'(스펙 5절)
function useFailure() {
	const queryClient = useQueryClient();
	return (error: unknown) => {
		toast.error(
			saveFailure(error) === "not_found"
				? MESSAGES.notFound
				: MESSAGES.saveFailed,
		);
		void queryClient.invalidateQueries({ queryKey: savedListKey });
		invalidateClasses(queryClient);
	};
}

// 같은 성우의 담기·연결은 한 줄로 차례로 보낸다(계획 리뷰 E2)
const scopeOf = (voice: Voice) => {
	const key = savedKey(voice);
	return {
		key,
		mutationKey: ["savedVoice", key],
		scope: { id: `saved:${key}` },
	};
};

type SaveChange = { favorite?: boolean; frequent?: boolean; memo?: string };

export function useSaveVoice(voice: Voice) {
	const queryClient = useQueryClient();
	const fail = useFailure();
	const { key, mutationKey, scope } = scopeOf(voice);
	return useMutation({
		mutationKey,
		scope,
		mutationFn: (change: SaveChange) =>
			client.savedVoiceSave({ voice, ...change }),
		// 메모는 서버가 정리하므로 결과로만 바꾼다
		onMutate: ({ favorite, frequent }) =>
			patch(queryClient, key, (item) => ({
				...item,
				favorite: favorite ?? item.favorite,
				frequent: frequent ?? item.frequent,
			})),
		onSuccess: (saved) => writeBack(queryClient, saved),
		onError: fail,
	});
}

type LinkChange = { group: Group; id: string; on: boolean };
// 같은 변경을 두 번 적용해도 같다
const applyLink = (ids: readonly string[], { id, on }: LinkChange) =>
	on
		? ids.includes(id)
			? [...ids]
			: [...ids, id]
		: ids.filter((x) => x !== id);

export function useLinkVoice(voice: Voice) {
	const queryClient = useQueryClient();
	const fail = useFailure();
	const { key, mutationKey, scope } = scopeOf(voice);
	return useMutation({
		mutationKey,
		scope,
		// 실행 시점 캐시(앞 요청의 결과가 반영된)에 이 변경을 다시 적용해 보낸다(계획 리뷰 E2)
		mutationFn: (change: LinkChange) => {
			const item = queryClient
				.getQueryData<SavedVoice[]>(savedListKey)
				?.find((entry) => savedKey(entry.voice) === key);
			const channelIds = item?.channelIds ?? [];
			const classificationIds = item?.classificationIds ?? [];
			return client.savedVoiceLinks({
				voice,
				channelIds:
					change.group === "channel"
						? applyLink(channelIds, change)
						: channelIds,
				classificationIds:
					change.group === "channel"
						? classificationIds
						: applyLink(classificationIds, change),
			});
		},
		onMutate: (change) =>
			patch(queryClient, key, (item) =>
				change.group === "channel"
					? { ...item, channelIds: applyLink(item.channelIds, change) }
					: {
							...item,
							classificationIds: applyLink(item.classificationIds, change),
						},
			),
		onSuccess: (saved) => writeBack(queryClient, saved),
		onError: fail,
		onSettled: () => invalidateClasses(queryClient),
	});
}

// 실패 표시는 확인 창이 맡는다(T6 class-delete-dialog 구조, 계획 리뷰 D15)
export function useRemoveVoice() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: string }) => client.savedVoiceRemove(input),
		// 다시 받기 전에 캐시에서 바로 지운다. 남아 있으면 담기 칸이 비운 메모와 비교해 '저장하지 않은 변경'을 잠깐 보인다(NOT_FOUND는 무효화가 맡는다)
		onSuccess: (_, input) =>
			queryClient.setQueryData<SavedVoice[]>(savedListKey, (items) =>
				items?.filter((item) => item.id !== input.id),
			),
		// 빼면 그 성우를 쓰는 프리셋의 성우가 빈다(T8). 프리셋 목록도 접두 키로 다시 받는다
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: savedListKey });
			invalidateClasses(queryClient);
			void queryClient.invalidateQueries({ queryKey: orpc.presetList.key() });
		},
	});
}

// 그 성우의 담기·연결이 하나라도 진행 중인지(담기 칸 머리의 스피너)
export function useSaving(voice: Voice): boolean {
	return useIsMutating({ mutationKey: scopeOf(voice).mutationKey }) > 0;
}

// 행 맨 끝의 별(브리프 B1). 누르면 바로 저장된다(담기지 않았으면 담긴다). 연타는 scope가 차례로 보내고 마지막 상태가 남는다.
// 채운 별은 버튼 글자색(foreground), 빈 별은 회색이다. 담은 성우 목록이 오기 전·실패면 켜짐 여부를 모르므로 누를 수 없다(계획 리뷰 D9)
export function SavedStar({
	voice,
	tabIndex,
}: {
	voice: Voice;
	tabIndex: number;
}) {
	// 목록 전체가 아니라 '받았는지'만 구독한다: 다른 성우가 바뀌어도 이 별은 다시 그리지 않는다
	const list = useQuery({ ...savedListOptions, select: () => true });
	const item = useSavedItem(voice);
	const save = useSaveVoice(voice);
	// 백그라운드 재조회가 실패해도 가진 데이터로 누를 수 있다. 실패 툴팁은 데이터가 없을 때만
	const ready = list.data === true;
	const on = item?.favorite ?? false;
	const tip = !ready
		? list.isError
			? LIBRARY_TEXT.listFailed
			: LIBRARY_TEXT.loading
		: on
			? "즐겨찾기 해제"
			: "즐겨찾기";
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="ghost"
						size="icon-lg"
						className="relative z-10 shrink-0 aria-disabled:opacity-50"
						aria-disabled={!ready || undefined}
						tabIndex={tabIndex}
						aria-pressed={on}
						aria-label={`${voice.name} 즐겨찾기`}
						onClick={() => {
							if (ready) save.mutate({ favorite: !on });
						}}
					/>
				}
			>
				<Star
					aria-hidden="true"
					className={cn(on ? "fill-current" : "text-muted-foreground")}
				/>
			</TooltipTrigger>
			<TooltipContent>{tip}</TooltipContent>
		</Tooltip>
	);
}
