"use client";

import type { Preset } from "@tts-pilot-app/api/preset-contract";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tts-pilot-app/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@tts-pilot-app/ui/components/dropdown-menu";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { ArrowRight, Check, ChevronDown, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { type RefObject, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { byName, MESSAGES } from "@/lib/classes-view";
import { PROVIDER_LABEL } from "@/lib/connection-view";
import {
	changeLine,
	loadChanges,
	loadedMessage,
	loadedName,
	loadNotes,
	loadQuestion,
	overwriteItem,
	overwriteQuestion,
	overwrittenMessage,
	PRESET_TEXT,
	presetSettingsOf,
	presetSummary,
	sameSettings,
	savedMessage,
	savedVoiceLine,
	settingChanges,
	settingsOnly,
} from "@/lib/preset-view";

import { DialogButtons } from "./class-form-dialog";
import { ConfirmDialog } from "./confirm-dialog";
import { PresetFormDialog } from "./preset-form-dialog";
import { useCreatePreset, useOverwritePreset, usePresetList } from "./presets";
import { useTrial } from "./trial-provider";

type Open =
	| { kind: "save" }
	| { kind: "load"; preset: Preset }
	| { kind: "overwrite"; preset: Preset }
	| null;

// 메뉴 항목은 라디오 메뉴 항목과 같은 44px·14px·radius-6(library-filters.tsx와 같다)
const menuItem = "min-h-11 rounded-md text-sm";

// 불러오기 창(스펙 4절): 바뀌는 값 → 알림 줄(성우 맞춤·성우 다름·처음 값으로 바뀐 값). 첫 포커스는 '불러오기', 닫히면 메뉴 버튼으로.
// 비교는 양쪽 모두 이 성우에서 듣는 값이다(성우 맞춤 뒤, 계획 리뷰 E1·재리뷰 N1)
function LoadDialog({
	voice,
	preset,
	openerRef,
	onLoad,
	onClose,
}: {
	voice: Voice;
	preset: Preset;
	openerRef: RefObject<HTMLButtonElement | null>;
	onLoad: () => Promise<void>;
	onClose: () => void;
}) {
	const trial = useTrial();
	const loadRef = useRef<HTMLButtonElement>(null);
	const [pending, setPending] = useState(false);
	const changes = loadChanges(voice, trial.settings, preset.settings);
	const notes = loadNotes(voice, preset);
	// 프리셋 성우가 빠졌거나 다른 성우면 불러와도 지금 성우 그대로라고 먼저 알린다(critique P1, 브리프 5절)
	const otherVoice = preset.voice?.voiceId !== voice.voiceId;
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !pending) onClose();
			}}
		>
			<DialogContent
				initialFocus={loadRef}
				finalFocus={() => openerRef.current ?? true}
			>
				<DialogHeader>
					<DialogTitle className="wrap-anywhere">
						{loadQuestion(preset.name)}
					</DialogTitle>
					{/* 설명(<p>)을 <div>로 열어 성우 안내·바뀌는 값·알림 줄을 모두 감싼다. 창을 열면 비교와 경고까지 읽힌다(덮어쓰기 확인과 같다, critique P2) */}
					<DialogDescription render={<div />} className="flex flex-col gap-4">
						{otherVoice ? (
							<p className="text-popover-foreground">
								{settingsOnly(voice.name)}
							</p>
						) : null}
						<p>
							{changes.length > 0
								? PRESET_TEXT.changesHead
								: PRESET_TEXT.sameSettings}
						</p>
						{changes.length > 0 ? (
							<ul className="flex flex-col gap-1 text-popover-foreground text-sm tabular-nums">
								{changes.map((item) => (
									<li key={item.label}>{changeLine(item)}</li>
								))}
							</ul>
						) : null}
						{notes.length > 0 ? (
							<ul className="flex flex-col gap-1 text-sm">
								{notes.map((note) => (
									<li
										key={note.text}
										className={cn(
											"flex gap-2",
											note.warn ? "text-warning" : "text-muted-foreground",
										)}
									>
										{note.warn ? (
											<TriangleAlert
												aria-hidden="true"
												className="mt-0.5 size-4 shrink-0"
											/>
										) : null}
										{note.text}
									</li>
								))}
							</ul>
						) : null}
					</DialogDescription>
				</DialogHeader>
				<DialogButtons
					pending={pending}
					label="불러오기"
					submitRef={loadRef}
					onCancel={onClose}
					onSubmit={() => {
						if (pending) return;
						setPending(true);
						void onLoad().finally(() => setPending(false));
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}

// 덮어쓰기 확인의 설명(프리셋 → 지금 화면 값). AlertDialog 설명은 <p>라 목록 대신 줄마다 block <span>이다(<ul>을 넣으면 DOM 중첩 오류).
// <br>로 이으면 보조기기가 한 문장으로 이어 읽는다(audit P2-3).
// 프리셋 성우가 비었으면 '성우 없음 → …'이다('성우'를 겹쳐 쓰지 않는다, 브리프 8절 초안과 다른 점 2)
function OverwriteDetail({ voice, preset }: { voice: Voice; preset: Preset }) {
	const trial = useTrial();
	const lines = [
		...(preset.voice?.voiceId === voice.voiceId
			? []
			: [
					preset.voice
						? `성우 ${preset.voice.name} → ${voice.name}`
						: `${PRESET_TEXT.noVoice} → ${voice.name}`,
				]),
		...settingChanges(
			voice.provider,
			preset.settings,
			presetSettingsOf(voice, trial.settings).settings,
		).map(changeLine),
	];
	if (lines.length === 0) return PRESET_TEXT.sameSettings;
	return lines.map((line) => (
		<span key={line} className="block">
			{line}
		</span>
	));
}

// '내 문장 듣기' 머리의 프리셋 메뉴(스펙 4절). 이 공급자 프리셋 불러오기, 새로 저장, 불러온 프리셋에 덮어쓰기, 관리 화면 링크.
// 저장·덮어쓰기는 지금 화면에 보이는 값(성우 맞춤 뒤)을 보낸다(사용자 결정 2026-10-14). 저장·불러오기·덮어쓰기 뒤에는 지금 설정을
// 프리셋 값(서버가 정리한 값)으로 두고 옵션 칸을 다시 그린다(onApplied, 계획 '스펙과 다른 점' 2).
// 소유자가 없으면 캐스팅 화면 전체가 주소 안내라(voice-casting.tsx) 이 메뉴는 그려지지 않는다(계획 '스펙과 다른 점' 9)
export function PresetMenu({
	voice,
	onApplied,
}: {
	voice: Voice;
	onApplied: () => void;
}) {
	const trial = useTrial();
	const presets = usePresetList();
	const create = useCreatePreset();
	const overwrite = useOverwritePreset();
	const triggerRef = useRef<HTMLButtonElement>(null);
	const statusId = useId();
	const [open, setOpen] = useState<Open>(null);
	const { provider } = voice;
	const mine = byName(
		(presets.data ?? []).filter((preset) => preset.provider === provider),
	);
	const loadedId = trial.loaded(provider)?.id;
	const loaded = presets.data?.find((preset) => preset.id === loadedId);
	const shown = presetSettingsOf(voice, trial.settings);
	// 목록 자리의 상태 줄(받아 둔 목록이 없을 때 받는 중·받지 못함, 또는 없음). 목록이 있으면 null
	const status = presets.isPending
		? "loading"
		: presets.isError && !presets.data
			? "failed"
			: mine.length === 0
				? "none"
				: null;

	function apply(preset: Preset) {
		trial.loadPreset(provider, { id: preset.id, settings: preset.settings });
		onApplied();
	}
	// 다른 탭에서 지웠을 수 있어 최신 목록에서 한 번 더 찾는다(사용자 결정 2026-10-14, 스펙 S13).
	// 받지 못하면 받아 둔 값으로 불러온다(설정만 바꾸므로 데이터는 상하지 않는다)
	async function load(preset: Preset) {
		const latest = await presets.refetch();
		const fresh = latest.data?.find((item) => item.id === preset.id);
		if (latest.isSuccess && !fresh) {
			toast.error(MESSAGES.notFound);
			setOpen(null);
			return;
		}
		const chosen = fresh ?? preset;
		apply(chosen);
		toast.success(loadedMessage(chosen.name));
		setOpen(null);
	}

	return (
		<>
			<DropdownMenu
				onOpenChange={(next) => {
					// 메뉴를 열 때 목록을 다시 받는다(다른 탭의 변경, 30초 캐시)
					if (next) void presets.refetch();
				}}
			>
				<DropdownMenuTrigger
					// 보조 동작 버튼 outline(브리프 5절 머리 줄). '처음 값으로'(되돌리기)는 ghost 그대로(계획 리뷰 D1)
					render={<Button ref={triggerRef} variant="outline" size="lg" />}
				>
					{PRESET_TEXT.menu}
					<ChevronDown data-icon="inline-end" aria-hidden="true" />
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="end"
					className="w-72 p-1"
					// 상태 줄은 그룹 이름표(aria-hidden)라 항목이 없으면 읽히지 않는다. 포커스를 받는 메뉴의 설명으로 잇는다(ChoiceMenu 안내와 같다, 브리프 11절 결정 4)
					aria-describedby={status ? statusId : undefined}
				>
					{/* 목록만 스크롤한다. 저장·덮어쓰기·관리는 늘 보인다(계획 리뷰 D15) */}
					<DropdownMenuGroup className="max-h-80 overflow-y-auto">
						{status === "loading" ? (
							<DropdownMenuLabel
								id={statusId}
								className="flex min-h-11 items-center gap-2 text-sm"
							>
								<Spinner aria-hidden="true" />
								{PRESET_TEXT.loading}
							</DropdownMenuLabel>
						) : status === "failed" ? (
							<>
								<DropdownMenuLabel
									id={statusId}
									className="flex min-h-11 items-center text-sm text-warning"
								>
									{PRESET_TEXT.listFailed}
								</DropdownMenuLabel>
								<DropdownMenuItem
									className={menuItem}
									closeOnClick={false}
									onClick={() => void presets.refetch()}
								>
									{PRESET_TEXT.retry}
								</DropdownMenuItem>
							</>
						) : status === "none" ? (
							// 세 상태 줄은 같은 44px 높이다(받는 중 → 없음·받지 못함으로 바뀔 때 메뉴가 흔들리지 않는다)
							<DropdownMenuLabel
								id={statusId}
								className="flex min-h-11 items-center text-sm"
							>
								{PRESET_TEXT.none}
							</DropdownMenuLabel>
						) : (
							mine.map((preset) => (
								<DropdownMenuItem
									key={preset.id}
									className={cn(
										menuItem,
										"flex-col items-start gap-0.5",
										preset.id === loadedId && "pr-8",
									)}
									onClick={() => setOpen({ kind: "load", preset })}
								>
									<span className="max-w-full truncate font-bold">
										{preset.name}
									</span>
									<span className="max-w-full truncate text-muted-foreground text-sm">
										{savedVoiceLine(preset)}
									</span>
									{/* 지금 불러온 프리셋: 덮어쓰기 항목이 가리키는 것을 목록에서 맞춰 본다(라디오 항목 표시 자리와 같다, 브리프 5절) */}
									{preset.id === loadedId ? (
										<>
											<Check
												aria-hidden="true"
												className="absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground"
											/>
											<span className="sr-only">{`, ${PRESET_TEXT.loadedMark}`}</span>
										</>
									) : null}
								</DropdownMenuItem>
							))
						)}
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className={menuItem}
						onClick={() => setOpen({ kind: "save" })}
					>
						{PRESET_TEXT.saveNew}
					</DropdownMenuItem>
					{loaded ? (
						<DropdownMenuItem
							className={menuItem}
							onClick={() => setOpen({ kind: "overwrite", preset: loaded })}
						>
							{overwriteItem(loaded.name)}
						</DropdownMenuItem>
					) : null}
					{/* 이름 고치기·복제·지우기는 관리 화면에서(계획 리뷰 D2). 화면을 떠나는 항목이라 가름선으로 나누고 링크 화살표를 붙인다(브리프 5절) */}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className={menuItem}
						render={<Link href="/presets" />}
					>
						{PRESET_TEXT.manage}
						<ArrowRight aria-hidden="true" />
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			{open?.kind === "save" ? (
				<PresetFormDialog
					title={PRESET_TEXT.saveTitle}
					presetId={null}
					initial={{ name: "", channelId: null, channelDefault: false }}
					summary={
						<>
							<p>
								<span translate="no">{PROVIDER_LABEL[provider]}</span>
								{` · ${voice.name} · ${presetSummary(shown)}`}
							</p>
							<p>{PRESET_TEXT.saveNote}</p>
						</>
					}
					save={(values) => create.mutateAsync({ ...values, voice, ...shown })}
					onSaved={(preset) => {
						apply(preset);
						toast.success(savedMessage(preset.name));
					}}
					openerRef={triggerRef}
					goneFocus={() => triggerRef.current}
					onClose={() => setOpen(null)}
				/>
			) : null}
			{open?.kind === "load" ? (
				<LoadDialog
					voice={voice}
					preset={open.preset}
					openerRef={triggerRef}
					onLoad={() => load(open.preset)}
					onClose={() => setOpen(null)}
				/>
			) : null}
			{open?.kind === "overwrite" ? (
				<ConfirmDialog
					title={overwriteQuestion(open.preset.name)}
					description={<OverwriteDetail voice={voice} preset={open.preset} />}
					action="덮어쓰기"
					pendingText={PRESET_TEXT.overwriting}
					failedText={MESSAGES.saveFailed}
					doneText={overwrittenMessage(open.preset.name)}
					pending={overwrite.isPending}
					send={(handlers) =>
						overwrite.mutate(
							{ id: open.preset.id, voice, ...shown },
							{
								...handlers,
								onSuccess: (preset) => {
									apply(preset);
									handlers.onSuccess();
								},
							},
						)
					}
					openerRef={triggerRef}
					focusAfterDone={() => triggerRef.current}
					onClose={() => setOpen(null)}
				/>
			) : null}
		</>
	);
}

// 칸 머리 아래 "프리셋 ‘{이름}’ · 바뀐 값 있음 · 저장할 때 성우 {이름}". 불러온 프리셋이 목록에 있을 때만(다른 탭에서 지웠으면 없다).
// 불러오기는 설정만 적용해 같은 공급자의 다른 성우로 옮겨도 줄이 남으므로, 성우가 다르면 어느 성우의 프리셋인지 붙인다(critique P1).
// '바뀐 값 있음'이 생기고 사라지는 것을 보조기기에 알린다(계획 리뷰 D16)
export function PresetLine({ voice }: { voice: Voice }) {
	const trial = useTrial();
	const presets = usePresetList();
	const loaded = trial.loaded(voice.provider);
	const preset = loaded
		? presets.data?.find((item) => item.id === loaded.id)
		: undefined;
	if (!loaded || !preset) return null;
	const changed = !sameSettings(
		voice.provider,
		trial.settings[voice.provider],
		loaded.settings,
	);
	return (
		<p aria-live="polite" className="text-muted-foreground text-sm">
			{loadedName(preset.name)}
			{changed ? (
				<>
					{" · "}
					<span className="font-bold text-foreground">
						{PRESET_TEXT.changed}
					</span>
				</>
			) : null}
			{preset.voice?.voiceId !== voice.voiceId
				? ` · ${savedVoiceLine(preset)}`
				: null}
		</p>
	);
}
