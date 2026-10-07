"use client";

import { useQuery } from "@tanstack/react-query";

import { MESSAGES } from "@/lib/classes-view";
import { failureOf } from "@/lib/voice-failure";
import { OWNED_LIST, orpc } from "@/utils/orpc";

import { ClassGroup } from "./class-group";
import { LoopbackNotice } from "./notice";

// '채널·분류' 본문(T6 스펙 4절). 조회 둘(채널, 카테고리·타입)을 세 묶음에 나눠 준다. 넓은 화면에서 행이 벌어지지 않게 max-w-3xl(계획 리뷰 D10)
export function ClassesBoard() {
	const channels = useQuery(orpc.channelList.queryOptions(OWNED_LIST));
	const classifications = useQuery(
		orpc.classificationList.queryOptions(OWNED_LIST),
	);
	if (
		failureOf(channels.error) === "unauthorized" ||
		failureOf(classifications.error) === "unauthorized"
	)
		return <LoopbackNotice title={MESSAGES.loopback} />;
	// 다시 받은 결과가 성공이면 true. 묶음이 포커스를 머리로 옮긴다(계획 리뷰 D6)
	const retryChannels = async () => !(await channels.refetch()).isError;
	const retryClassifications = async () =>
		!(await classifications.refetch()).isError;
	return (
		<div className="flex max-w-3xl flex-col gap-10">
			<ClassGroup
				group="channel"
				items={channels.data}
				failed={channels.isError}
				retrying={channels.isFetching}
				onRetry={retryChannels}
			/>
			{(["category", "type"] as const).map((kind) => (
				<ClassGroup
					key={kind}
					group={kind}
					items={classifications.data?.filter((item) => item.kind === kind)}
					failed={classifications.isError}
					retrying={classifications.isFetching}
					onRetry={retryClassifications}
				/>
			))}
		</div>
	);
}
