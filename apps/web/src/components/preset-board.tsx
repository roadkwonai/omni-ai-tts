"use client";

import { useQuery } from "@tanstack/react-query";
import type { Preset } from "@tts-pilot-app/api/preset-contract";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { buttonVariants } from "@tts-pilot-app/ui/components/button";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { ArrowRight, Copy, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { byName, MESSAGES, neighborId, saveFailure } from "@/lib/classes-view";
import {
	copiedMessage,
	countLine,
	PRESET_TEXT,
	presetBadges,
	presetSummaryParts,
	providerVoiceLine,
	removeDefaultNote,
	removedMessage,
	removeQuestion,
	updatedMessage,
} from "@/lib/preset-view";
import { LIBRARY_TEXT } from "@/lib/saved-voice-view";
import { failureOf } from "@/lib/voice-failure";
import { OWNED_LIST, orpc } from "@/utils/orpc";

import { boxClass, RowAction } from "./class-group";
import { ConfirmDialog } from "./confirm-dialog";
import { EmptyState } from "./empty-state";
import { SignInNotice } from "./notice";
import { PresetFormDialog } from "./preset-form-dialog";
import {
	useDuplicatePreset,
	usePresetList,
	useRemovePreset,
	useUpdatePreset,
} from "./presets";
import { ReloadButton, ReloadRow } from "./voice-problem";

// 지운 뒤 포커스를 옮길 행의 고치기 버튼
const editButtonId = (id: string) => `preset-${id}-edit`;

// '프리셋' 본문(스펙 4절). 한 목록, 이름순(배치는 브리프 18행). 창은 열 때만 마운트하고 연 버튼을 기억한다(T6 ClassGroup과 같다).
// 지운 뒤 포커스: 다음 행 고치기 → 이전 행 → 개수 줄(지우기 확인이 NOT_FOUND여도 같다). 복제·고치기가 NOT_FOUND이면 개수 줄로(계획 리뷰 F4)
export function PresetBoard() {
	const presets = usePresetList();
	const channels = useQuery(orpc.channelList.queryOptions(OWNED_LIST));
	const update = useUpdatePreset();
	const duplicate = useDuplicatePreset();
	// 렌더를 기다리지 않고 두 번째 복제를 막는다(브리프 6절, preset-form-dialog sendingRef와 같다)
	const duplicatingRef = useRef(false);
	const remove = useRemovePreset();
	const countRef = useRef<HTMLParagraphElement | null>(null);
	// 목록 '다시 불러오기'가 성공하면 새로 그려지는 개수 줄로 포커스를 옮긴다(브리프 11절 결정 6).
	// refetch가 끝난 때 줄이 아직 그려지지 않았을 수 있어 줄이 붙을 때 옮긴다
	const focusCountRef = useRef(false);
	const openerRef = useRef<HTMLButtonElement | null>(null);
	const nextRef = useRef<string | null>(null);
	const [editing, setEditing] = useState<Preset | null>(null);
	const [removing, setRemoving] = useState<Preset | null>(null);
	if (failureOf(presets.error) === "unauthorized") return <SignInNotice />;
	const sorted = presets.data ? byName(presets.data) : undefined;
	const channelName = (id: string | null) =>
		id === null
			? null
			: (channels.data?.find((item) => item.id === id)?.name ?? null);
	function open(button: HTMLButtonElement, show: () => void) {
		openerRef.current = button;
		show();
	}

	let body: React.ReactNode;
	if (presets.isError && !sorted)
		body = (
			<ReloadRow
				text={PRESET_TEXT.listFailed}
				reloading={presets.isFetching}
				onReload={() => {
					focusCountRef.current = true;
					void presets.refetch().then((result) => {
						if (!result.isSuccess) focusCountRef.current = false;
					});
				}}
			/>
		);
	else if (!sorted)
		// 골격은 보조기기에 숨기고 받는 중임을 화면 밖 status로 알린다(보관함 첫 로딩과 같다, audit P3-4)
		body = (
			<>
				<Skeleton aria-hidden="true" className="h-24 w-full rounded-2xl" />
				<span className="sr-only" role="status">
					{PRESET_TEXT.loading}
				</span>
			</>
		);
	else if (sorted.length === 0)
		body = (
			<EmptyState
				art="list"
				title={PRESET_TEXT.empty}
				description={PRESET_TEXT.emptyDetail}
			>
				{/* 링크 버튼은 <Link>에 cn(buttonVariants)다. Button(nativeButton={false})으로 감싸면 <a>에 role="button"이 붙는다 */}
				<Link
					href="/casting"
					className={cn(buttonVariants({ variant: "neutral", size: "lg" }))}
				>
					{PRESET_TEXT.toCasting}
					<ArrowRight data-icon="inline-end" aria-hidden="true" />
				</Link>
			</EmptyState>
		);
	else
		body = (
			<ul className={`divide-y overflow-hidden ${boxClass}`}>
				{sorted.map((preset) => {
					const channel = channelName(preset.channelId);
					const badges = presetBadges(preset);
					return (
						// 동작 버튼은 모든 너비에서 제목 줄 오른쪽 끝이다(R2 브리프 4절. 휴대폰도 아래 줄로 내리지 않는다)
						<li key={preset.id} className="flex items-start gap-3 p-4">
							<div className="min-w-0 flex-1">
								{/* '기본' 배지는 이름 줄에 둔다. 채널 목록이 늦거나 실패해도 흔들리지 않는다(계획 리뷰 D4).
								    이름은 flex 항목이라 min-w-0이 있어야 띄어쓰기 없는 긴 이름도 줄바꿈된다 */}
								<p className="flex flex-wrap items-center gap-2">
									<span className="wrap-break-word min-w-0 font-bold">
										{preset.name}
									</span>
									{preset.channelDefault ? (
										<Badge variant="secondary">
											{PRESET_TEXT.defaultBadge}
										</Badge>
									) : null}
								</p>
								{/* 둘째 줄: 서비스·성우·채널. 공급자·성우 이름은 기계 번역하지 않는다(보관함 조건 줄과 같다, audit P3-5) */}
								<p
									translate="no"
									className="wrap-break-word mt-1 text-muted-foreground text-sm"
								>
									{providerVoiceLine(preset)}
									{channel ? ` · ${PRESET_TEXT.channel} ${channel}` : null}
								</p>
								{/* 셋째 줄: 설정 값(모델·속도·표현력)을 작은 값 칩으로 */}
								<ul
									aria-label="설정 값"
									className="mt-2 flex flex-wrap gap-1.5"
								>
									{presetSummaryParts(preset).map((value, index) => (
										// 같은 값이 둘 올 수 있어 순서를 섞는다
										<li key={`${index}-${value}`}>
											<Badge
												variant="secondary"
												className="min-h-6 max-w-full font-normal text-xs"
											>
												{value}
											</Badge>
										</li>
									))}
								</ul>
								{badges.length > 0 ? (
									<div className="mt-2 flex flex-wrap gap-2">
										{badges.map((badge) => (
											// '현재 이용 불가'는 회색(보관함 배지와 같다), 고칠 일이 있는 상태만 경고색(브리프 11절 결정 2)
											<Badge
												key={badge}
												variant={
													badge === LIBRARY_TEXT.unavailable
														? "secondary"
														: "warning"
												}
											>
												{badge}
											</Badge>
										))}
									</div>
								) : null}
							</div>
							{/* 고치기 → 복제 → 지우기(위험한 것이 맨 끝). 44px 가운데를 이름 첫 줄에 맞춘다 */}
							<div className="-my-2.5 flex shrink-0">
								<RowAction
									id={editButtonId(preset.id)}
									label={`${preset.name} 고치기`}
									tip="고치기"
									icon={Pencil}
									onClick={(button) => open(button, () => setEditing(preset))}
								/>
								<RowAction
									label={`${preset.name} 복제`}
									tip="복제"
									icon={Copy}
									onClick={() => {
										if (duplicatingRef.current) return;
										duplicatingRef.current = true;
										duplicate.mutate(
											{ id: preset.id },
											{
												onSettled: () => {
													duplicatingRef.current = false;
												},
												onSuccess: (copy) =>
													toast.success(copiedMessage(copy.name)),
												onError: (error) => {
													if (saveFailure(error) !== "not_found") {
														toast.error(MESSAGES.saveFailed);
														return;
													}
													toast.error(MESSAGES.notFound);
													countRef.current?.focus();
												},
											},
										);
									}}
								/>
								<RowAction
									label={`${preset.name} 지우기`}
									tip="지우기"
									icon={Trash2}
									onClick={(button) => {
										nextRef.current = neighborId(
											sorted.map((item) => item.id),
											preset.id,
										);
										open(button, () => setRemoving(preset));
									}}
								/>
							</div>
						</li>
					);
				})}
			</ul>
		);

	return (
		<section
			aria-label={PRESET_TEXT.listLabel}
			aria-busy={!sorted && !presets.isError ? true : undefined}
			className="flex max-w-3xl flex-col gap-3"
		>
			{/* 개수 줄은 목록을 받으면 늘 있다(마지막 줄을 지운 뒤 포커스가 갈 곳). 작게 둔다. 캐스팅 링크는 머리 설명 안에 있다(R2 브리프 4절) */}
			{sorted ? (
				<p
					ref={(node) => {
						countRef.current = node;
						if (node && focusCountRef.current) {
							focusCountRef.current = false;
							node.focus();
						}
					}}
					tabIndex={-1}
					className="text-muted-foreground text-sm tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid focus-visible:outline-offset-2"
				>
					{countLine(sorted.length)}
				</p>
			) : null}
			{/* 채널 이름을 받지 못하면 줄의 채널 이름만 빠진다. 그 사실과 다시 받기를 한 번 보인다(계획 리뷰 F7) */}
			{channels.isError && sorted && sorted.length > 0 ? (
				<div className="flex flex-wrap items-center gap-3">
					<p className="text-sm text-warning">{PRESET_TEXT.channelsFailed}</p>
					<ReloadButton
						reloading={channels.isFetching}
						onReload={() => void channels.refetch()}
					/>
				</div>
			) : null}
			{body}
			{editing ? (
				<PresetFormDialog
					title={PRESET_TEXT.editTitle}
					presetId={editing.id}
					initial={{
						name: editing.name,
						channelId: editing.channelId,
						channelDefault: editing.channelDefault,
					}}
					save={(values) => update.mutateAsync({ id: editing.id, ...values })}
					onSaved={(preset) => toast.success(updatedMessage(preset.name))}
					openerRef={openerRef}
					goneFocus={() => countRef.current}
					onClose={() => setEditing(null)}
				/>
			) : null}
			{removing ? (
				<ConfirmDialog
					title={removeQuestion(removing.name)}
					description={`${PRESET_TEXT.removeDetail}${removing.channelDefault ? removeDefaultNote(channelName(removing.channelId)) : ""}`}
					action="지우기"
					pendingText={PRESET_TEXT.removing}
					failedText={MESSAGES.deleteFailed}
					doneText={removedMessage(removing.name)}
					pending={remove.isPending}
					send={(handlers) => remove.mutate({ id: removing.id }, handlers)}
					openerRef={openerRef}
					focusAfterDone={() =>
						(nextRef.current &&
							document.getElementById(editButtonId(nextRef.current))) ||
						countRef.current
					}
					onClose={() => setRemoving(null)}
				/>
			) : null}
		</section>
	);
}
