"use client";

import {
	useQueryClient,
	useQueryErrorResetBoundary,
} from "@tanstack/react-query";
import { Button } from "@tts-pilot-app/ui/components/button";
import { useEffect, useRef } from "react";

import { PageHeader } from "@/components/page-header";
import { failureOf } from "@/lib/voice-failure";

// 앱 틀 안의 예상 밖 오류(스펙 5절 6, 브리프 7절). 조회가 던진 오류면 쿼리의 오류 상태도 풀어야 다시 그릴 때 다시 부른다.
// TanStack Query 5.103.2 errorBoundaryUtils는 경계가 풀리기 전까지 retryOnMount를 false로 덮기만 한다.
// 성우 목록은 retryOnMount: false라, 실패한 쿼리를 처음 상태로 되돌려야 다시 그릴 때 한 번 부른다.
// 경계가 보이는 동안 실패한 화면은 언마운트되어 있으므로 resetQueries는 다시 부르지 않고 상태만 지운다.
export default function AppError({
	retry,
}: {
	error: Error & { digest?: string };
	retry: () => void;
}) {
	const { reset } = useQueryErrorResetBoundary();
	const queryClient = useQueryClient();
	const ref = useRef<HTMLDivElement>(null);
	// 경계로 바뀌면 스크린 리더가 알 수 있게 제목으로 포커스를 옮긴다.
	useEffect(() => {
		ref.current?.querySelector("h1")?.focus();
	}, []);
	return (
		<div ref={ref}>
			<PageHeader
				title="문제가 생겼어요"
				description="화면을 그리다 문제가 생겼어요. 다시 시도해 주세요."
			/>
			<div className="px-4 pb-10 md:px-11">
				<Button
					size="lg"
					onClick={() => {
						reset();
						void queryClient.resetQueries({
							// 경계까지 온(사유를 모르는) 실패만 되돌린다. 사유를 화면에 보인 실패는 다시 부르지 않는다(AC4)
							predicate: (query) =>
								query.state.status === "error" &&
								failureOf(query.state.error) === null,
						});
						retry();
					}}
				>
					다시 시도하기
				</Button>
			</div>
		</div>
	);
}
