"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import type { TrialItem } from "@tts-pilot-app/api/providers/trial-contract";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@tts-pilot-app/ui/components/alert-dialog";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tts-pilot-app/ui/components/tooltip";
import { Trash2 } from "lucide-react";
import { Fragment, useId, useLayoutEffect, useRef, useState } from "react";

import { resultLine, resultSubject } from "@/lib/trial-view";
import { orpc } from "@/utils/orpc";

import { DemoBadge, useDemo } from "./demo";
import { useSample } from "./sample-player";
import { useTrial } from "./trial-provider";
import { ReloadButton } from "./voice-problem";
import { SampleButton } from "./voice-row";

// 이 성우의 완료 결과(오디오 없음). 패널 구역의 '저장된 결과 듣기' 판정과 결과 목록이 같은 키를 쓴다(TanStack 중복 제거)
export function useTrialItems(voice: Voice) {
	return useQuery({
		...orpc.trialList.queryOptions({
			input: { provider: voice.provider, voiceId: voice.voiceId },
		}),
		retry: false,
		meta: { toast: false },
	});
}

// '내 문장 결과'(브리프 12절): 이 성우의 완료 결과 최신순 20개. 이용 조건·담기와 같은 소제목의 형제 구역이다(계획 리뷰 D28).
// 줄마다 재생(저장본, 크레딧 0)·지우기. 새로 만들기는 줄에 두지 않는다(사용자 결정 U4)
export function TrialResults({ voice }: { voice: Voice }) {
	const items = useTrialItems(voice);
	const demo = useDemo();
	const [removing, setRemoving] = useState<TrialItem | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [deleteFailed, setDeleteFailed] = useState(false);
	const [focusIndex, setFocusIndex] = useState<number | null>(null);
	const headRef = useRef<HTMLHeadingElement>(null);
	const listRef = useRef<HTMLUListElement>(null);
	const openerRef = useRef<HTMLButtonElement>(null);
	const cancelRef = useRef<HTMLButtonElement>(null);
	const deletingRef = useRef(false);
	const queryClient = useQueryClient();
	const trial = useTrial();
	const remove = useMutation(orpc.trialDelete.mutationOptions());
	const now = new Date();
	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.trialList.key({
				input: { provider: voice.provider, voiceId: voice.voiceId },
			}),
		});
	useLayoutEffect(() => {
		if (removing !== null) return;
		if (focusIndex !== null) {
			if (items.isFetching) return;
			const next =
				listRef.current?.children[focusIndex]?.querySelector("button");
			(next ?? headRef.current)?.focus();
			setFocusIndex(null);
			return;
		}
		if (openerRef.current?.isConnected) openerRef.current.focus();
		openerRef.current = null;
	}, [focusIndex, items.isFetching, removing]);
	return (
		<section className="flex flex-col gap-2">
			<h3 ref={headRef} tabIndex={-1} className="font-bold outline-none">
				내 문장 결과
			</h3>
			{deleteFailed ? (
				<p role="alert" className="text-sm text-warning">
					결과를 지우지 못했어요. 잠시 뒤 다시 눌러 주세요.
				</p>
			) : null}
			{items.isPending ? (
				// 받는 중(계획 리뷰 D20)
				<Skeleton className="h-11 w-full" />
			) : items.isError ? (
				<div className="flex flex-wrap items-center gap-3">
					<p className="text-muted-foreground text-sm">
						결과를 불러오지 못했어요
					</p>
					<ReloadButton
						reloading={items.isFetching}
						onReload={() => void items.refetch()}
					/>
				</div>
			) : items.data.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					아직 들어 본 문장이 없어요
				</p>
			) : (
				<ul ref={listRef} className="flex flex-col gap-1">
					{items.data.map((item) => (
						<ResultRow
							key={item.id}
							voice={voice}
							item={item}
							line={resultLine(item, now, !demo)}
							onRemove={(button) => {
								openerRef.current = button;
								setDeleteFailed(false);
								setRemoving(item);
							}}
						/>
					))}
				</ul>
			)}
			<AlertDialog
				open={removing !== null}
				onOpenChange={(open) => {
					if (!open && !deletingRef.current) setRemoving(null);
				}}
			>
				{removing ? (
					<AlertDialogContent initialFocus={cancelRef} finalFocus={false}>
						<AlertDialogHeader>
							<AlertDialogTitle>이 결과를 지울까요?</AlertDialogTitle>
							<AlertDialogDescription>
								지우면 이 결과는 다시 들을 수 없어요.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel ref={cancelRef} size="lg" disabled={deleting}>
								취소
							</AlertDialogCancel>
							<AlertDialogAction
								size="lg"
								variant="destructive"
								disabled={deleting}
								onClick={async () => {
									if (!removing || deletingRef.current) return;
									deletingRef.current = true;
									setDeleting(true);
									setDeleteFailed(false);
									const index =
										items.data?.findIndex((item) => item.id === removing.id) ??
										-1;
									let deleted = false;
									try {
										await remove.mutateAsync({ id: removing.id });
										trial.forget(removing.id);
										deleted = true;
									} catch {
										// 이미 지워졌거나(NOT_FOUND) 저장소 실패: 목록을 다시 받아 지금 상태를 보인다(계획 리뷰 D21)
										setDeleteFailed(true);
									}
									try {
										await refresh();
									} finally {
										if (deleted) setFocusIndex(Math.max(index, 0));
										deletingRef.current = false;
										setDeleting(false);
										setRemoving(null);
									}
								}}
							>
								지우기
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				) : null}
			</AlertDialog>
		</section>
	);
}

// 결과 한 줄: ▷ · 문장(한 줄 말줄임) · 요약(언제·사용량·설정, 두 줄까지, D2) · 지우기.
// 버튼 이름은 줄마다 다르고(문장 앞 20자) 문장 전체와 요약은 설명으로 잇는다(title을 쓰지 않는다, 계획 리뷰 D6)
function ResultRow({
	voice,
	item,
	line,
	onRemove,
}: {
	voice: Voice;
	item: TrialItem;
	line: string;
	onRemove: (button: HTMLButtonElement) => void;
}) {
	const trial = useTrial();
	const [loading, setLoading] = useState(false);
	const id = useId();
	// 재생 키는 그 결과의 blob: 주소다. 아직 받지 않았으면 어떤 키와도 같지 않은 결과 id
	const { status } = useSample(trial.urlOf(item.id) ?? item.id);
	const subject = resultSubject(voice.name, item);
	const details = `${id}-text ${id}-line`;
	return (
		<li className="flex min-h-11 items-center gap-3">
			<SampleButton
				status={loading ? "loading" : status}
				subject={subject}
				describedBy={details}
				onToggle={async () => {
					setLoading(true);
					await trial.playItem(voice, item);
					setLoading(false);
				}}
			/>
			<span className="flex min-w-0 flex-1 flex-col">
				<span id={`${id}-text`} className="flex min-w-0 items-center gap-2">
					<span className="truncate">{item.request.text}</span>
					<DemoBadge />
				</span>
				<span
					id={`${id}-line`}
					className="line-clamp-2 text-muted-foreground text-sm tabular-nums"
					translate="no"
				>
					{/* 모델 이름(띄어쓰기 없음)만 하이픈에서 갈라지지 않게 nowrap으로 묶는다. 띄어쓰기 있는 긴 자유 태그는 line-clamp 안에서 줄을 바꾼다. 조각은 위치만 의미가 있어 index key다 */}
					{line.split(" · ").map((part, i) => (
						<Fragment key={i}>
							{i > 0 ? " · " : null}
							<span
								className={/\s/.test(part) ? undefined : "whitespace-nowrap"}
							>
								{part}
							</span>
						</Fragment>
					))}
				</span>
			</span>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							variant="ghost"
							size="icon-lg"
							aria-label={`${subject} 지우기`}
							aria-describedby={details}
							onClick={(event) => onRemove(event.currentTarget)}
						/>
					}
				>
					<Trash2 aria-hidden="true" />
				</TooltipTrigger>
				<TooltipContent>지우기</TooltipContent>
			</Tooltip>
		</li>
	);
}
