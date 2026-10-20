"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { OWNED_LIST, orpc } from "@/utils/orpc";

// 프리셋 목록 하나를 캐스팅 메뉴·/presets·보관함('프리셋' 보기, 빼기 확인)이 함께 읽는다(스펙 3절)
export const usePresetList = () =>
	useQuery(orpc.presetList.queryOptions(OWNED_LIST));

// 실패해도 처리됐을 수 있으므로 늘 다시 받는다(무효화는 접두 키). 만들기·덮어쓰기는 성우를 보관함에 담으므로 보관함도 다시 받는다
function useSettled(alsoSaved: boolean) {
	const queryClient = useQueryClient();
	return () => {
		void queryClient.invalidateQueries({ queryKey: orpc.presetList.key() });
		if (alsoSaved)
			void queryClient.invalidateQueries({
				queryKey: orpc.savedVoiceList.key(),
			});
	};
}

export const useCreatePreset = () =>
	useMutation(
		orpc.presetCreate.mutationOptions({ onSettled: useSettled(true) }),
	);
export const useOverwritePreset = () =>
	useMutation(
		orpc.presetOverwrite.mutationOptions({ onSettled: useSettled(true) }),
	);
export const useUpdatePreset = () =>
	useMutation(
		orpc.presetUpdate.mutationOptions({ onSettled: useSettled(false) }),
	);
export const useDuplicatePreset = () =>
	useMutation(
		orpc.presetDuplicate.mutationOptions({ onSettled: useSettled(false) }),
	);
export const useRemovePreset = () =>
	useMutation(
		orpc.presetRemove.mutationOptions({ onSettled: useSettled(false) }),
	);
