// apps/web/src/components/studio-results.tsx
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { STUDIO_RESULTS_SHOWN } from "@tts-pilot-app/api/providers/trial-options";
import type { StudioItem } from "@tts-pilot-app/api/studio-contract";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Download, Play, Trash2 } from "lucide-react";
import { type RefObject, useEffect, useId, useRef, useState } from "react";

import { MESSAGES, neighborId } from "@/lib/classes-view";
import {
	firstLine,
	STUDIO_TEXT,
	studioResultLine,
	unknownNoteOf,
	voiceNameOf,
} from "@/lib/studio-view";
import { orpc } from "@/utils/orpc";

import { boxClass, RowAction } from "./class-group";
import { ConfirmDialog } from "./confirm-dialog";
import { useStudio, useStudioItems } from "./studio-provider";
import { lockedButton } from "./voice-problem";

// 지운 뒤 포커스할 이웃 줄을 찾는 id
const rowId = (id: string) => `studio-result-${id}`;
// 받는 중인 줄 버튼의 접근 이름 끝(브리프 8절 receivingShort: "… 받는 중"은 '받는 중'만 붙인다)
const RECEIVING_TAIL = "받는 중";

// 이전 결과 한 줄(브리프 5.8): 대본 첫 줄 + 배지(미확인 또는 '플레이어에 있음') / 언제 · 성우 · (처음 값이 아닌 설정) · 크레딧 /
// (미확인) 늦은 도착 안내, 다시 받는 6분이 지나면 사용 기록 안내(critique P1-a·b).
// 재생(올리고 재생) → 내려받기 → 지우기. 미확인은 지우기만이고, 완료로 바뀌면 앞 두 버튼이 생겨도 지우기는 그대로다(포커스 유지)
function ResultRow({
	item,
	name,
	now,
	finding,
	onPress,
	onRemove,
}: {
	item: StudioItem;
	name: string;
	now: Date;
	// '음성 만들기'가 같은 조합을 찾는 동안 받기를 잠근다(늦은 찾기 결과가 그사이 누른 '재생'을 덮지 않게, Task 7 리뷰)
	finding: boolean;
	// 재생·내려받기를 눌렀다(받다가 줄이 사라지면 포커스를 옮길 곳을 정한다)
	onPress: () => void;
	onRemove: (button: HTMLButtonElement) => void;
}) {
	const studio = useStudio();
	const unknown = item.status === "unknown";
	const current = studio.shown?.id === item.id;
	const receiving =
		studio.receiving?.id === item.id ? studio.receiving.action : null;
	const line = firstLine(item.request.text);
	// 줄마다 다른 접근 이름(대본 앞 20자, T5 resultSubject와 같은 방식)
	const subject = `${name} '${[...line].slice(0, 20).join("")}'`;
	// 같은 줄의 다른 받기 버튼은 잠근다. 다른 줄은 누를 수 있다(앞 받기는 버린다)
	const locked = finding || receiving !== null;
	return (
		// 640px 미만은 동작 버튼을 글자 칸 아래 오른쪽으로 내린다(presets.md 6절과 같다)
		<li
			id={rowId(item.id)}
			aria-current={current ? "true" : undefined}
			className={cn(
				"flex flex-col gap-2 px-4 py-3 first:rounded-t-2xl last:rounded-b-2xl sm:flex-row sm:items-start sm:gap-3",
				current && "bg-primary-subtle",
			)}
		>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<p className="flex min-w-0 items-center gap-2">
					<span className="min-w-0 truncate font-bold">{line}</span>
					{unknown ? (
						<Badge variant="warning" className="shrink-0">
							{STUDIO_TEXT.unknownBadge}
						</Badge>
					) : current ? (
						// 색만으로 말하지 않는다(브리프 5.8)
						<Badge variant="secondary" className="shrink-0">
							{STUDIO_TEXT.shownBadge}
						</Badge>
					) : null}
				</p>
				<p className="text-muted-foreground text-sm tabular-nums">
					{studioResultLine(item, name, now)}
				</p>
				{unknown ? (
					<p className="text-muted-foreground text-sm">
						{unknownNoteOf(item.createdAt, now)}
					</p>
				) : null}
			</div>
			{/* 44px 버튼 가운데를 첫 줄에 맞추는 보정은 가로 배치에서만(preset-board와 같다) */}
			<div className="flex shrink-0 self-end sm:-my-2.5 sm:self-auto">
				{unknown ? null : (
					<>
						<RowAction
							label={`${subject} ${receiving === "open" ? RECEIVING_TAIL : STUDIO_TEXT.play}`}
							tip={STUDIO_TEXT.play}
							icon={Play}
							busy={receiving === "open"}
							disabled={locked}
							onClick={() => {
								onPress();
								studio.open(item);
							}}
						/>
						<RowAction
							label={`${subject} ${receiving === "download" ? RECEIVING_TAIL : STUDIO_TEXT.download}`}
							tip={STUDIO_TEXT.download}
							icon={Download}
							busy={receiving === "download"}
							disabled={locked}
							onClick={() => {
								onPress();
								studio.download(item);
							}}
						/>
					</>
				)}
				<RowAction
					label={`${subject} ${STUDIO_TEXT.remove}`}
					tip={STUDIO_TEXT.remove}
					icon={Trash2}
					onClick={onRemove}
				/>
			</div>
		</li>
	);
}

// 이전 결과(브리프 5.8): 최근 20개(완료·미확인). 받는 중이거나 0개면 구역을 그리지 않는다(DN-10).
// 첫 받기에 실패하면 제목 + 경고 + '다시 불러오기'. 백그라운드 재조회(15초) 실패는 받아 둔 목록을 그대로 보인다.
// 지우기는 확인 창(앱 DB에서만, 공급자 기록은 그대로). 지운 뒤 포커스는 다음 줄 → 이전 줄의 첫 버튼 → 주 버튼(구역이 사라진다)
export function StudioResults({
	headRef,
	mainRef,
}: {
	headRef: RefObject<HTMLHeadingElement | null>;
	mainRef: RefObject<HTMLButtonElement | null>;
}) {
	const studio = useStudio();
	const items = useStudioItems();
	const queryClient = useQueryClient();
	const remove = useMutation(
		orpc.studioDelete.mutationOptions({
			onSettled: () =>
				void queryClient.invalidateQueries({ queryKey: orpc.studioList.key() }),
		}),
	);
	const [removing, setRemoving] = useState<StudioItem | null>(null);
	const headId = useId();
	const openerRef = useRef<HTMLButtonElement | null>(null);
	// 지운 뒤 포커스할 이웃 줄. 다시 받은 목록에는 지운 id가 없으므로 지우기를 누를 때 정한다(class-group과 같다)
	const nextRef = useRef<string | null>(null);
	// 재생·내려받기를 누른 줄. 받다가 다른 탭에서 지워져(찾을 수 없음) 목록에서 사라지면 누른 버튼과 함께 포커스가 없어진다
	const [pressed, setPressed] = useState<string | null>(null);
	// '다시 불러오기'가 성공했다. 포커스는 다시 그린 뒤에 옮긴다
	const [reloaded, setReloaded] = useState(false);
	const list = items.data;
	const receivingId = studio.receiving?.id ?? null;
	// 첫 받기 실패는 실패 횟수로 본다. 데이터 없이 다시 받으면 TanStack 5.103 fetchState가 status를 pending·error를 null로 되돌려
	// isError로 보면 다시 받는 동안 실패 블록과 포커스를 쥔 '다시 불러오기'가 사라진다
	const failed = !list && items.errorUpdateCount > 0;
	// 누른 줄이 사라지면 제목으로, 구역이 사라지면 주 버튼으로 옮긴다(브리프 7절). 포커스가 이미 다른 곳에 있으면 그대로 둔다(지우기 확인은 focusAfterDone이 맡는다).
	// 아래 잊기보다 먼저 둔다(같은 그리기에서 줄이 사라지고 다시 받기가 끝난다)
	useEffect(() => {
		if (pressed === null || list?.some((item) => item.id === pressed)) return;
		setPressed(null);
		if (document.activeElement !== document.body) return;
		((list?.length ? headRef.current : null) ?? mainRef.current)?.focus();
	}, [pressed, list, headRef, mainRef]);
	// 그 줄의 받기가 끝났고 목록도 다시 받는 중이 아니면 잊는다(찾을 수 없음이면 provider가 목록을 다시 받으므로 그 결과까지 기다린다).
	// 빈 곳을 누른 뒤 나중에 줄이 사라져도 포커스가 튀지 않게
	useEffect(() => {
		if (pressed !== null && receivingId !== pressed && !items.isFetching)
			setPressed(null);
	}, [pressed, receivingId, items.isFetching]);
	// await refetch() 직후에는 새 목록이 아직 그려지지 않아 구역이 남을지 모른다. 그린 뒤 제목, 구역이 사라졌으면 주 버튼으로(브리프 7절)
	useEffect(() => {
		if (!reloaded) return;
		setReloaded(false);
		(headRef.current ?? mainRef.current)?.focus();
	}, [reloaded, headRef, mainRef]);
	if (!list?.length && !failed) return null;
	const finding = studio.busy?.phase === "finding";
	// 목록을 받은 시각을 '지금'으로 본다. 렌더 중 new Date()는 React Compiler가 첫 값으로 기억해 상대 시간·미확인 안내가 바뀌지 않는다.
	// 미확인 줄이 있으면 6분이 지날 때까지 15초마다 다시 받으므로, 지난 뒤 한 번 더 받을 때 안내가 사용 기록 안내로 바뀐다
	const now = new Date(items.dataUpdatedAt);

	async function reload() {
		const result = await items.refetch();
		if (result.isSuccess) setReloaded(true);
	}

	return (
		<section aria-labelledby={headId} className="flex flex-col gap-3">
			{/* 스크립트 포커스 자리('이전 결과 보기', 다시 불러오기 성공). Tab 순서에는 없다 */}
			<h2
				id={headId}
				ref={headRef}
				tabIndex={-1}
				className="font-bold text-xl outline-none"
			>
				{STUDIO_TEXT.results}
			</h2>
			{list ? (
				<>
					<ul className={cn(boxClass, "divide-y divide-border")}>
						{list.map((item) => (
							<ResultRow
								key={item.id}
								item={item}
								name={voiceNameOf(studio.voices, item.request.voiceId)}
								now={now}
								finding={finding}
								onPress={() => setPressed(item.id)}
								onRemove={(button) => {
									openerRef.current = button;
									nextRef.current = neighborId(
										list.map((each) => each.id),
										item.id,
									);
									setRemoving(item);
								}}
							/>
						))}
					</ul>
					{list.length >= STUDIO_RESULTS_SHOWN ? (
						<p className="text-muted-foreground text-sm">
							{STUDIO_TEXT.resultsCap}
						</p>
					) : null}
				</>
			) : (
				<div className="flex flex-wrap items-center gap-3">
					<p className="text-sm text-warning">{STUDIO_TEXT.resultsFailed}</p>
					{/* outline: 채운 청록은 막대의 주 버튼 하나다(브리프 3절). 다시 받는 동안 같은 버튼이 남아 포커스를 지킨다 */}
					<Button
						variant="outline"
						size="lg"
						focusableWhenDisabled
						disabled={items.isFetching}
						aria-busy={items.isFetching || undefined}
						className={lockedButton(false)}
						onClick={() => void reload()}
					>
						{items.isFetching ? (
							<Spinner data-icon="inline-start" aria-hidden="true" />
						) : null}
						{STUDIO_TEXT.reload}
					</Button>
				</div>
			)}
			{removing ? (
				<ConfirmDialog
					title={STUDIO_TEXT.removeQuestion}
					description={STUDIO_TEXT.removeDetail}
					action={STUDIO_TEXT.remove}
					pendingText={STUDIO_TEXT.removing}
					failedText={MESSAGES.deleteFailed}
					doneText={STUDIO_TEXT.removed}
					pending={remove.isPending}
					send={(handlers) => remove.mutate({ id: removing.id }, handlers)}
					openerRef={openerRef}
					focusAfterDone={() =>
						(nextRef.current
							? document
									.getElementById(rowId(nextRef.current))
									?.querySelector("button")
							: null) ?? mainRef.current
					}
					onClose={(done) => {
						// 플레이어에 올라 있던 결과면 막대를 비운다
						if (done) studio.forget(removing.id);
						setRemoving(null);
					}}
				/>
			) : null}
		</section>
	);
}
