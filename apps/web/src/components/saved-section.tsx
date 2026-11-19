"use client";

import { MEMO_MAX, memoProblem } from "@tts-pilot-app/api/classification-rules";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Label } from "@tts-pilot-app/ui/components/label";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { Switch } from "@tts-pilot-app/ui/components/switch";
import { Textarea } from "@tts-pilot-app/ui/components/textarea";
import { Toggle } from "@tts-pilot-app/ui/components/toggle";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tts-pilot-app/ui/components/tooltip";
import { Star, X } from "lucide-react";
import { type RefObject, useId, useRef, useState } from "react";
import { toast } from "sonner";

import {
	fieldMessage,
	GROUP_TEXT,
	type Group,
	neighborId,
} from "@/lib/classes-view";
import { presetCountOf, presetRemoveNote } from "@/lib/preset-view";
import {
	chipGroups,
	LIBRARY_TEXT,
	linkMessage,
	removedMessage,
	removeQuestion,
	savedKey,
} from "@/lib/saved-voice-view";

import { ClassPicker } from "./class-picker";
import { ConfirmDialog } from "./confirm-dialog";
import { usePresetList } from "./presets";
import {
	useClassLists,
	useLinkVoice,
	useRemoveVoice,
	useSavedItem,
	useSavedList,
	useSaveVoice,
	useSaving,
} from "./saved-voices";
import { ReloadRow } from "./voice-problem";

// 패널의 '담기' 칸(스펙 4절, 브리프 B2). 담은 성우 목록이 오기 전에는 그리지 않는다: 빈 메모로 시작해 '메모 저장'이 기존 메모를 지우던 문제(계획 리뷰 E1).
// 목록 전에는 칸 자리 뼈대 3줄(토글 줄·칩 줄·메모, 브리프 6절). 성우마다 메모 초안이 새로 시작하게 key로 다시 마운트한다
export function SavedSection({ voice }: { voice: Voice }) {
	const list = useSavedList();
	if (list.isPending)
		return (
			<div aria-hidden="true" className="flex flex-col gap-3">
				<Skeleton className="h-11 w-full rounded-xl" />
				<Skeleton className="h-11 w-full rounded-xl" />
				<Skeleton className="h-20 w-full rounded-xl" />
			</div>
		);
	// 실패 줄은 데이터가 없을 때만이다. 백그라운드 재조회 실패(저장 실패 뒤 무효화)로 칸을 내리면 메모 초안·펼침·확인 창·포커스가 사라진다(스펙 5절)
	if (list.isLoadingError)
		return (
			<ReloadRow
				text={LIBRARY_TEXT.listFailed}
				reloading={list.isFetching}
				onReload={() => void list.refetch()}
			/>
		);
	return <SavedFields key={savedKey(voice)} voice={voice} />;
}

function SavedFields({ voice }: { voice: Voice }) {
	const headingId = useId();
	const memoId = useId();
	const countId = useId();
	const memoErrorId = useId();
	const headingRef = useRef<HTMLHeadingElement>(null);
	const pickerRef = useRef<HTMLButtonElement>(null);
	const removeRef = useRef<HTMLButtonElement>(null);
	const item = useSavedItem(voice);
	const save = useSaveVoice(voice);
	// 메모 저장은 따로 둔다: 같은 observer를 토글이 다시 쓰면 메모의 호출별 onSuccess(토스트·초안 맞춤)가 불리지 않는다. scope가 같아 차례는 그대로다
	const saveMemo = useSaveVoice(voice);
	const link = useLinkVoice(voice);
	const saving = useSaving(voice);
	const { channels, classes } = useClassLists();
	const [memo, setMemo] = useState(item?.memo ?? "");
	const [removing, setRemoving] = useState(false);
	const [announce, setAnnounce] = useState("");
	const favorite = item?.favorite ?? false;
	const frequent = item?.frequent ?? false;
	const groups = item ? chipGroups(item, channels, classes) : [];
	const memoLength = [...memo].length;
	const memoChanged = memo !== (item?.memo ?? "");
	const problem = memoProblem(memo);
	// 칩 × 버튼 id. 숨긴 탭의 패널이 같은 분류를 보일 수 있어 칸마다 앞머리를 둔다
	const chipId = (id: string) => `${headingId}-chip-${id}`;

	// 뗀 뒤 포커스: 같은 그룹 다음 칩 → 이전 칩 → '분류 붙이기'(계획 리뷰 D5). 누를 때 정한다(무효화 뒤에는 뗀 칩이 없다)
	function unlink(group: Group, ids: string[], id: string, name: string) {
		const next = neighborId(ids, id);
		// 알림은 저장된 뒤에만(실패하면 실패 토스트만 남는다)
		link.mutate(
			{ group, id, on: false },
			{ onSuccess: () => setAnnounce(linkMessage(name, group, false)) },
		);
		(next ? document.getElementById(chipId(next)) : pickerRef.current)?.focus();
	}

	return (
		<section aria-labelledby={headingId} className="flex flex-col gap-3">
			<div className="flex items-center gap-2">
				<h3
					id={headingId}
					ref={headingRef}
					tabIndex={-1}
					className="font-bold outline-none"
				>
					담기
				</h3>
				{saving ? (
					<Spinner
						aria-hidden="true"
						className="size-4 text-muted-foreground"
					/>
				) : null}
				<p role="status" className="sr-only">
					{saving ? LIBRARY_TEXT.saving : announce}
				</p>
			</div>
			<div className="flex flex-wrap items-center gap-3">
				{/* packages/ui Toggle에는 variant가 없어 윤곽은 border로 준다(브리프 B2 '윤곽 토글').
				    켜짐 바탕(muted)은 카드와 거의 같아 윤곽선도 글자색으로 진하게 한다(audit P3-3). 접근 이름은 행 별과 같다(audit P3-4) */}
				<Toggle
					pressed={favorite}
					onPressedChange={(pressed) => save.mutate({ favorite: pressed })}
					aria-label={`${voice.name} 즐겨찾기`}
					className="gap-1.5 border px-3 data-pressed:border-foreground"
				>
					<Star
						aria-hidden="true"
						className={favorite ? "fill-current" : undefined}
					/>
					즐겨찾기
				</Toggle>
				<Label className="flex min-h-11 items-center gap-2 font-normal text-base">
					<Switch
						checked={frequent}
						onCheckedChange={(checked) => save.mutate({ frequent: checked })}
					/>
					{LIBRARY_TEXT.frequent}
				</Label>
			</div>
			{groups.map(({ group, items }) => {
				const ids = items.map((entry) => entry.id);
				return (
					<div key={group} className="flex min-h-11 items-start gap-3">
						<span className="w-16 shrink-0 pt-3 text-muted-foreground text-sm">
							{GROUP_TEXT[group].label}
						</span>
						<ul
							className="flex min-w-0 flex-wrap gap-1.5"
							aria-label={`붙인 ${GROUP_TEXT[group].label}`}
						>
							{items.map((entry) => (
								<li
									key={entry.id}
									className="flex min-h-11 min-w-0 items-center gap-0.5 rounded-full border bg-card pl-3 text-sm"
								>
									<span className="min-w-0 break-words">{entry.name}</span>
									<Tooltip>
										<TooltipTrigger
											render={
												<Button
													id={chipId(entry.id)}
													variant="ghost"
													size="icon-lg"
													className="rounded-full"
													aria-label={`${GROUP_TEXT[group].label} ${entry.name} 떼기`}
													onClick={() =>
														unlink(group, ids, entry.id, entry.name)
													}
												/>
											}
										>
											<X aria-hidden="true" />
										</TooltipTrigger>
										<TooltipContent>떼기</TooltipContent>
									</Tooltip>
								</li>
							))}
						</ul>
					</div>
				);
			})}
			<ClassPicker
				voice={voice}
				item={item}
				triggerRef={pickerRef}
				onLinked={(name, group, on) =>
					setAnnounce(linkMessage(name, group, on))
				}
			/>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={memoId} className="font-bold text-sm">
					메모 <span className="font-normal text-muted-foreground">(선택)</span>
				</Label>
				<Textarea
					id={memoId}
					name="saved-memo"
					autoComplete="off"
					value={memo}
					onChange={(event) => setMemo(event.target.value)}
					aria-describedby={problem ? `${countId} ${memoErrorId}` : countId}
					aria-invalid={problem ? true : undefined}
					className="min-h-20 rounded-xl text-base md:text-sm"
				/>
				{problem ? (
					<p id={memoErrorId} role="alert" className="text-sm text-warning">
						{fieldMessage("memo", problem)}
					</p>
				) : null}
				{/* 아래 줄: 왼쪽 저장하지 않은 변경, 오른쪽 글자 수(브리프 B2) */}
				<div className="flex flex-wrap items-center justify-between gap-x-3 text-sm">
					<span className="text-muted-foreground">
						{memoChanged ? LIBRARY_TEXT.memoUnsaved : null}
					</span>
					<span
						id={countId}
						className={
							memoLength >= MEMO_MAX - 10
								? "text-warning tabular-nums"
								: "text-muted-foreground tabular-nums"
						}
					>
						{memoLength} / {MEMO_MAX}자
					</span>
				</div>
				{/* focusableWhenDisabled는 disabled 속성 대신 aria-disabled라 Button 기본 비활성 모양이 붙지 않는다. 꺼지면 흐리게(critique P1) */}
				<Button
					variant="neutral"
					size="lg"
					className="self-start aria-disabled:opacity-50"
					focusableWhenDisabled
					disabled={!memoChanged || problem !== null}
					onClick={() =>
						saveMemo.mutate(
							{ memo },
							{
								// 서버가 정리한 값으로 초안을 맞춘다(그래야 '메모 저장'이 다시 꺼진다, 계획 리뷰 E13)
								onSuccess: (saved) => {
									setMemo(saved.memo ?? "");
									toast.success(LIBRARY_TEXT.memoSaved);
								},
							},
						)
					}
				>
					메모 저장
				</Button>
			</div>
			{item ? (
				<>
					<Button
						ref={removeRef}
						variant="ghost"
						size="lg"
						// 글자를 왼쪽 열(메모·분류 붙이기)에 맞춘다. 안쪽 여백만큼 당기고, 서랍(px-4)에서도 포커스 윤곽이 잘리지 않게 여백은 12px만 남긴다(audit P3-2)
						className="-ml-3 self-start px-3 text-muted-foreground hover:text-foreground"
						onClick={() => setRemoving(true)}
					>
						보관함에서 빼기
					</Button>
					{removing ? (
						<RemoveDialog
							item={item}
							name={voice.name}
							openerRef={removeRef}
							headingRef={headingRef}
							// 칸은 그대로 남으므로(캐스팅) 지운 메모가 초안에 남지 않게 비운다
							onRemoved={() => setMemo("")}
							onClose={() => setRemoving(false)}
						/>
					) : null}
				</>
			) : null}
		</section>
	);
}

// 빼기 확인(T6 class-delete-dialog 구조, 계획 리뷰 D15). 실패 알림은 창이 맡는다(useRemoveVoice는 알리지 않는다)
function RemoveDialog({
	item,
	name,
	openerRef,
	headingRef,
	onRemoved,
	onClose,
}: {
	item: SavedVoice;
	name: string;
	openerRef: RefObject<HTMLButtonElement | null>;
	headingRef: RefObject<HTMLHeadingElement | null>;
	// 빠졌을 때(성공, 이미 없음)
	onRemoved: () => void;
	onClose: () => void;
}) {
	const remove = useRemoveVoice();
	const presets = usePresetList();
	const count = presetCountOf(presets.data ?? [], item.id);
	return (
		<ConfirmDialog
			title={removeQuestion(name)}
			// 프리셋 목록을 받지 못했으면 확인하지 못했다고 알린다(계획 리뷰 D10)
			description={`${LIBRARY_TEXT.removeDetail}${presetRemoveNote(count, presets.isError)}`}
			action="빼기"
			pendingText={LIBRARY_TEXT.removing}
			failedText={LIBRARY_TEXT.removeFailed}
			doneText={removedMessage(name)}
			pending={remove.isPending}
			send={(handlers) => remove.mutate({ id: item.id }, handlers)}
			openerRef={openerRef}
			// 뺀 뒤 '보관함에서 빼기'는 사라진다. 담기 칸 머리로(계획 리뷰 E9). 칸마저 사라지면(보관함에서 행이 빠짐) Task 9 규칙이 맡는다
			focusAfterDone={() => headingRef.current}
			onClose={(done) => {
				if (done) onRemoved();
				onClose();
			}}
		/>
	);
}
