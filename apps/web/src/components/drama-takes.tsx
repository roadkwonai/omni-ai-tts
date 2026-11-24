// apps/web/src/components/drama-takes.tsx
"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { DramaItem } from "@tts-pilot-app/api/drama-contract";
import { takeKey } from "@tts-pilot-app/api/drama-script";
import { normalizeText } from "@tts-pilot-app/api/providers/trial-options";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Trash2, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";

import { neighborId } from "@/lib/classes-view";
import {
	DRAMA_TEXT,
	splitOk,
	takeLineOf,
	takeTime,
	takeTitleOf,
} from "@/lib/drama-view";
import { unknownNoteOf } from "@/lib/studio-view";
import { OWNED_LIST, orpc } from "@/utils/orpc";

import { boxClass, RowAction } from "./class-group";
import { ConfirmDialog } from "./confirm-dialog";
import { DemoBadge, useDemo } from "./demo";
import { stageOrMain, useDrama, useScriptKey } from "./drama-provider";
import { lockedButton } from "./voice-problem";

// '이전 테이크' 제목 id. 막대 오류 줄의 '이전 테이크 보기'가 여기로 포커스를 옮긴다
export const DRAMA_TAKES_ID = "drama-takes";
// 지운 뒤 포커스할 이웃 줄을 찾는 id
const rowId = (id: string) => `drama-take-${id}`;

// 테이크 목록 첫 받기 실패(브리프 5.10 무대·5.11 이전 테이크): 경고 + outline '다시 불러오기'(채운 청록은 막대의 주 버튼 하나, 브리프 3절).
// 다시 받는 동안 같은 버튼이 스피너·aria-busy로 남아 포커스를 지킨다(ReloadButton과 같다)
export function TakesFailed({ headingId }: { headingId: string }) {
	const drama = useDrama();
	const fetching = drama.takesFetching;
	return (
		<div className="flex flex-wrap items-center gap-3">
			<p className="flex items-center gap-2 text-sm text-warning">
				<TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
				{DRAMA_TEXT.takesFailed}
			</p>
			<Button
				variant="neutral"
				size="lg"
				focusableWhenDisabled
				disabled={fetching}
				aria-busy={fetching || undefined}
				className={lockedButton(false)}
				onClick={() =>
					drama.reloadTakes(
						// 이전 테이크가 0개로 회복되면 구역이 사라져 무대 제목(무대가 없으면 주 버튼)으로
						() => document.getElementById(headingId) ?? stageOrMain(),
					)
				}
			>
				{fetching ? (
					<Spinner data-icon="inline-start" aria-hidden="true" />
				) : null}
				{DRAMA_TEXT.reload}
			</Button>
		</div>
	);
}

// '다른 대본' 배지(지금 대본과 다른 테이크). 대본 열쇠는 이 잎만 읽는다(Ruling 17: 목록은 글자마다 다시 그리지 않는다)
function OtherScriptBadge({ take }: { take: DramaItem }) {
	const key = useScriptKey();
	return key === takeKey(take.request) ? null : (
		<Badge variant="secondary" className="shrink-0">
			{DRAMA_TEXT.otherScriptBadge}
		</Badge>
	);
}

// 이전 테이크 한 줄(브리프 5.11): 장면 이름 · 첫 줄 + 배지(미확인 / 무대에 있음 / 다른 대본 / 나누지 못함) /
// 언제 · 모델 · 화자 · 길이 · 사용량 / (미확인) 늦은 도착 안내, 6분이 지나면 사용 기록 안내.
// '무대에 올리기'(완료이고 무대에 없을 때만, 포커스는 무대 제목) → '지우기'. 640px 이상 오른쪽, 미만 글자 아래 오른쪽.
// 무대에 있는 줄은 배지 '무대에 있음'과 aria-current가 상태를 말한다
function TakeRow({
	take,
	now,
	onRemove,
}: {
	take: DramaItem;
	now: Date;
	onRemove: (button: HTMLButtonElement) => void;
}) {
	const drama = useDrama();
	// 공개 데모의 샘플은 줄 구간이 없다. 나누지 못한 게 아니라 데모 샘플이라 '나누지 못함' 배지를 숨긴다
	const demo = useDemo();
	const unknown = take.status === "unknown";
	const onStage = drama.shown?.id === take.id;
	// 줄마다 다른 접근 이름("{장면 이름} 10:42 무대에 올리기")
	const subject = `${normalizeText(take.request.sceneName) || DRAMA_TEXT.scenePlaceholder} ${takeTime(take.createdAt)}`;
	return (
		<li
			id={rowId(take.id)}
			aria-current={onStage ? "true" : undefined}
			className={cn(
				"flex flex-col gap-2 px-4 py-3 first:rounded-t-2xl last:rounded-b-2xl sm:flex-row sm:items-start sm:gap-3",
				onStage && "bg-primary-subtle",
			)}
		>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
					<span className="min-w-0 max-w-full truncate font-bold">
						{takeTitleOf(take)}
					</span>
					{unknown ? (
						<Badge variant="warning" className="shrink-0">
							{DRAMA_TEXT.unknownBadge}
						</Badge>
					) : null}
					{/* 색만으로 말하지 않는다(브리프 5.11) */}
					{onStage ? (
						<Badge variant="secondary" className="shrink-0">
							{DRAMA_TEXT.onStageBadge}
						</Badge>
					) : null}
					<OtherScriptBadge take={take} />
					{unknown ? null : <DemoBadge />}
					{!unknown && !demo && !splitOk(take) ? (
						<Badge variant="secondary" className="shrink-0">
							{DRAMA_TEXT.notSplitBadge}
						</Badge>
					) : null}
				</p>
				{/* 모델·화자 이름이 번역되지 않게 줄째 둔다 */}
				<p
					className="text-muted-foreground text-sm tabular-nums"
					translate="no"
				>
					{takeLineOf(take, now)}
				</p>
				{unknown ? (
					<p className="text-muted-foreground text-sm">
						{unknownNoteOf(take.createdAt, now, DRAMA_TEXT.unknownExpired)}
					</p>
				) : null}
			</div>
			{/* 44px 버튼 가운데를 첫 줄에 맞추는 보정은 가로 배치에서만 */}
			<div className="flex shrink-0 items-center gap-1 self-end sm:-my-2.5 sm:self-auto">
				{unknown || onStage ? null : (
					<Button
						variant="neutral"
						size="lg"
						aria-label={`${subject} ${DRAMA_TEXT.putOnStage}`}
						onClick={() => {
							drama.show(take.id);
							drama.focusStage();
						}}
					>
						{DRAMA_TEXT.putOnStage}
					</Button>
				)}
				<RowAction
					label={`${subject} ${DRAMA_TEXT.remove}`}
					tip={DRAMA_TEXT.remove}
					icon={Trash2}
					onClick={onRemove}
				/>
			</div>
		</li>
	);
}

// 이전 테이크(브리프 5.11): 최근 20개(완료·미확인). 받는 중이거나 0개면 구역을 그리지 않는다(무대가 빈 상태를 말한다).
// 첫 받기에 실패하면 제목 + 경고 + '다시 불러오기'. 지우기는 확인 창이 client.dramaDelete를 부르고 성공하면 removeTake로 무대·받기 기억을 정리한다(Ruling 15).
// 지운 뒤 포커스는 다음 줄 → 이전 줄의 첫 버튼 → 무대 제목(구역이 사라진다)
export function DramaTakes() {
	const demo = useDemo();
	const drama = useDrama();
	// 목록을 받은 시각을 '지금'으로 본다(렌더 중 new Date()는 React Compiler가 첫 값으로 기억한다).
	// 같은 쿼리의 두 번째 관찰자라 다시 받지 않고(OWNED_LIST 30초), 미확인 15초 다시 받기는 provider 관찰자가 한다
	const list = useQuery(orpc.dramaList.queryOptions(OWNED_LIST));
	const remove = useMutation(orpc.dramaDelete.mutationOptions());
	const [removing, setRemoving] = useState<{
		take: DramaItem;
		done: string;
	} | null>(null);
	const openerRef = useRef<HTMLButtonElement | null>(null);
	// 지운 뒤 포커스할 이웃 줄. 다시 받은 목록에는 지운 id가 없으므로 지우기를 누를 때 정한다
	const nextRef = useRef<string | null>(null);
	const takes = drama.takes;
	const failed = drama.takesLoad === "failed";
	if (!takes?.length && !failed) return null;
	const now = new Date(list.dataUpdatedAt);

	return (
		<section aria-labelledby={DRAMA_TAKES_ID} className="flex flex-col gap-3">
			{/* 스크립트 포커스 자리('이전 테이크 보기'). Tab 순서에는 없다. 옮긴 포커스는 :focus-visible일 때 ring으로 보인다(audit P2-2) */}
			<h2
				id={DRAMA_TAKES_ID}
				tabIndex={-1}
				// w-fit: 포커스 윤곽이 줄 전체가 아니라 제목 글에 붙는다
				className="w-fit font-bold text-xl outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid focus-visible:outline-offset-2"
			>
				{DRAMA_TEXT.takes}
			</h2>
			{takes ? (
				<>
					<ul className={cn(boxClass, "divide-y divide-border")}>
						{takes.map((take) => (
							<TakeRow
								key={take.id}
								take={take}
								now={now}
								onRemove={(button) => {
									openerRef.current = button;
									nextRef.current = neighborId(
										takes.map((each) => each.id),
										take.id,
									);
									// 이 테이크를 고른 줄이 있으면 그 줄들이 무대의 테이크로 돌아간다고 말한다(조용히 바뀌지 않게)
									const picked = Object.values(drama.picks).filter(
										(id) => id === take.id,
									).length;
									setRemoving({
										take,
										done:
											picked > 0
												? DRAMA_TEXT.removedPicked(picked)
												: DRAMA_TEXT.removed,
									});
								}}
							/>
						))}
					</ul>
					{/* 공개 데모는 매일 처음 상태로 돌아가 보관 기한이 없다 */}
					{demo ? null : (
						<p className="text-muted-foreground text-sm">
							{DRAMA_TEXT.takesCap}
						</p>
					)}
				</>
			) : (
				<TakesFailed headingId={DRAMA_TAKES_ID} />
			)}
			{removing ? (
				<ConfirmDialog
					title={DRAMA_TEXT.removeQuestion}
					description={DRAMA_TEXT.removeDetail}
					action={DRAMA_TEXT.remove}
					pendingText={DRAMA_TEXT.removing}
					failedText={DRAMA_TEXT.removeFailed}
					doneText={removing.done}
					pending={remove.isPending}
					send={(handlers) => remove.mutate({ id: removing.take.id }, handlers)}
					openerRef={openerRef}
					// 이웃이 없으면 주 버튼에 닿는 것은 DramaBody에서 무대가 이전 테이크 앞이라 돌려줄 때 무대 구역이 이미 사라져서다. 이 차례를 지킨다
					focusAfterDone={() =>
						(nextRef.current
							? document
									.getElementById(rowId(nextRef.current))
									?.querySelector("button")
							: null) ?? stageOrMain()
					}
					onClose={(done) => {
						// 지웠거나 이미 없으면 무대·받기 기억에서 내리고 목록을 다시 받는다(무대에 있었으면 같은 대본의 가장 새 테이크로)
						if (done) drama.removeTake(removing.take.id);
						setRemoving(null);
					}}
				/>
			) : null}
		</section>
	);
}
