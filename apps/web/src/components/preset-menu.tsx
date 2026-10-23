"use client";

import type { Preset } from "@tts-pilot-app/api/preset-contract";
import type { ProviderId, Voice } from "@tts-pilot-app/api/providers/contract";
import type { SettingsOf } from "@tts-pilot-app/api/providers/trial-options";
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
	type LoadView,
	loadedMessage,
	loadedName,
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
} from "@/lib/preset-view";

import { DialogButtons } from "./class-form-dialog";
import { ConfirmDialog } from "./confirm-dialog";
import { PresetFormDialog } from "./preset-form-dialog";
import { useCreatePreset, useOverwritePreset, usePresetList } from "./presets";
import type { LoadedPreset } from "./trial-provider";
import { conditionButton, menuItem } from "./voice-conditions";

// 프리셋 메뉴·불러온 줄·불러오기 창이 읽고 바꾸는 화면 상태(T9 스펙 2절). 캐스팅(TrialSection)은 설정만, 문단 작업실(WorkProvider)은
// 성우와 설정을 함께 불러온다. 같은 메뉴를 쓰고 차이는 apply·loadView가 맡는다(vercel-composition-patterns state-context-interface)
export type PresetHost = {
	// null이면 다섯 공급자 프리셋을 모두 보인다(문단 작업실)
	provider: ProviderId | null;
	// 지금 성우. 작업실에서 고르기 전이면 null이고 '새 프리셋 저장'·덮어쓰기가 꺼진다
	voice: Voice | null;
	settings: SettingsOf;
	loaded: LoadedPreset | null;
	// 프리셋 값을 지금 값으로 두고 기억한 뒤 옵션 칸을 다시 그린다(저장·불러오기·덮어쓰기 뒤, T8 '스펙과 다른 점' 2).
	// 불러오지 않았으면 false(문단 작업실: 성우 목록이 없어 막았다, 화면이 이유를 알린다). 불러오기 성공 알림을 띄우지 않는다
	apply: (preset: Preset) => undefined | false;
	loadView: (preset: Preset) => LoadView;
	// 불러오기 알림 문구. 주지 않으면 T8 "‘이름’ 설정을 불러왔어요."(캐스팅), 작업실은 "‘이름’ 프리셋을 불러왔어요."(브리프 DN-5)
	loadedMessage?: (name: string) => string;
};

type Open =
	| { kind: "save" }
	| { kind: "load"; preset: Preset }
	| { kind: "overwrite"; preset: Preset }
	| null;

// 불러오기: 다른 탭에서 지웠을 수 있어 최신 목록에서 한 번 더 찾는다(사용자 결정 2026-10-14, 스펙 S13).
// 받지 못하면 받아 둔 값으로 불러온다(설정만 바꾸므로 데이터는 상하지 않는다). 메뉴의 불러오기 창과 작업실 채널 고르기가 함께 쓴다
export function usePresetLoad(host: PresetHost) {
	const presets = usePresetList();
	return async (preset: Preset) => {
		const latest = await presets.refetch();
		const fresh = latest.data?.find((item) => item.id === preset.id);
		if (latest.isSuccess && !fresh) {
			toast.error(MESSAGES.notFound);
			return;
		}
		const chosen = fresh ?? preset;
		if (host.apply(chosen) === false) return;
		toast.success((host.loadedMessage ?? loadedMessage)(chosen.name));
	};
}

// 불러오기 창(T8 스펙 4절): 첫 줄(캐스팅 '설정만') → 바뀌는 값 → 알림 줄. 첫 포커스는 '불러오기', 닫히면 연 버튼으로.
// 비교 내용은 화면이 준다(view, PresetHost.loadView)
export function LoadDialog({
	preset,
	view,
	openerRef,
	onLoad,
	onClose,
}: {
	preset: Preset;
	view: LoadView;
	openerRef: RefObject<HTMLElement | null>;
	onLoad: () => Promise<void>;
	onClose: () => void;
}) {
	const loadRef = useRef<HTMLButtonElement>(null);
	const [pending, setPending] = useState(false);
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
						{view.lead ? (
							<p className="text-popover-foreground">{view.lead}</p>
						) : null}
						<p>
							{view.changes.length > 0
								? PRESET_TEXT.changesHead
								: PRESET_TEXT.sameSettings}
						</p>
						{view.changes.length > 0 ? (
							<ul className="flex flex-col gap-1 text-popover-foreground text-sm tabular-nums">
								{view.changes.map((line) => (
									<li key={line}>{line}</li>
								))}
							</ul>
						) : null}
						{view.notes.length > 0 ? (
							<ul className="flex flex-col gap-1 text-sm">
								{view.notes.map((note) => (
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
function OverwriteDetail({
	voice,
	settings,
	preset,
}: {
	voice: Voice;
	settings: SettingsOf;
	preset: Preset;
}) {
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
			presetSettingsOf(voice, settings).settings,
		).map(changeLine),
	];
	if (lines.length === 0) return PRESET_TEXT.sameSettings;
	return lines.map((line) => (
		<span key={line} className="block">
			{line}
		</span>
	));
}

// 프리셋 메뉴(T8 스펙 4절, T9 작업실 머리). 이 공급자 프리셋 불러오기, 새로 저장, 불러온 프리셋에 덮어쓰기, 관리 화면 링크.
// 저장·덮어쓰기는 지금 화면에 보이는 값(성우 맞춤 뒤)을 보낸다(사용자 결정 2026-10-14). 저장·불러오기·덮어쓰기 뒤에는 host.apply가
// 지금 값을 프리셋 값(서버가 정리한 값)으로 두고 옵션 칸을 다시 그린다(T8 '스펙과 다른 점' 2).
// 소유자가 없으면 두 화면 모두 주소 안내라 이 메뉴는 그려지지 않는다(T8 '스펙과 다른 점' 9)
export function PresetMenu({
	host,
	trigger = "outline",
}: {
	host: PresetHost;
	// 트리거 모양. 주지 않으면 outline(캐스팅). 작업실 머리는 옆 '채널' 고르기와 같은 무채색 조건 버튼이다(critique P2-3)
	trigger?: "outline" | "condition";
}) {
	const presets = usePresetList();
	const create = useCreatePreset();
	const overwrite = useOverwritePreset();
	const load = usePresetLoad(host);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const statusId = useId();
	const [open, setOpen] = useState<Open>(null);
	const { provider, voice } = host;
	const mine = byName(
		(presets.data ?? []).filter(
			(preset) => provider === null || preset.provider === provider,
		),
	);
	const loadedId = host.loaded?.id;
	const loaded = presets.data?.find((preset) => preset.id === loadedId);
	// 저장·덮어쓰기 값. 작업실에서 성우를 고르기 전이면 없다(프리셋은 성우와 함께 저장한다)
	const shown = voice ? presetSettingsOf(voice, host.settings) : null;
	// 서버 presetOverwrite는 공급자가 다르면 거절한다. 공급자 고정 화면은 목록이 이미 그 공급자만이다
	const canOverwrite =
		loaded &&
		shown &&
		(provider !== null || loaded.provider === voice?.provider);
	// 목록 자리의 상태 줄(받아 둔 목록이 없을 때 받는 중·받지 못함, 또는 없음). 목록이 있으면 null
	const status = presets.isPending
		? "loading"
		: presets.isError && !presets.data
			? "failed"
			: mine.length === 0
				? "none"
				: null;

	return (
		<>
			<DropdownMenu
				onOpenChange={(next) => {
					// 메뉴를 열 때 목록을 다시 받는다(다른 탭의 변경, 30초 캐시)
					if (next) void presets.refetch();
				}}
			>
				<DropdownMenuTrigger
					// 보조 동작 버튼 outline(브리프 5절 머리 줄). '처음 값으로'(되돌리기)는 ghost 그대로(계획 리뷰 D1).
					// condition은 RadioMenu의 고른 것 없는 조건 버튼과 같은 모양이다
					render={
						<Button
							ref={triggerRef}
							variant="outline"
							size="lg"
							className={
								trigger === "condition" ? conditionButton(0) : undefined
							}
						/>
					}
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
					{/* 작업실에서 성우를 고르기 전에는 꺼지고 둘째 줄이 이유다(T8 두 줄 항목, 브리프 DN-8). 설치본 Base UI 1.8.0 메뉴 항목은 꺼져도 포커스를 받아(focusableWhenDisabled) 둘째 줄까지 읽힌다 */}
					<DropdownMenuItem
						className={cn(menuItem, !shown && "flex-col items-start gap-0.5")}
						disabled={!shown}
						onClick={() => setOpen({ kind: "save" })}
					>
						{shown ? (
							PRESET_TEXT.saveNew
						) : (
							<>
								<span className="max-w-full truncate">
									{PRESET_TEXT.saveNew}
								</span>
								<span className="max-w-full truncate text-muted-foreground text-sm">
									{PRESET_TEXT.needVoice}
								</span>
							</>
						)}
					</DropdownMenuItem>
					{loaded && canOverwrite ? (
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
			{open?.kind === "save" && voice && shown ? (
				<PresetFormDialog
					title={PRESET_TEXT.saveTitle}
					presetId={null}
					initial={{ name: "", channelId: null, channelDefault: false }}
					summary={
						<>
							<p>
								<span translate="no">
									{PROVIDER_LABEL[provider ?? voice.provider]}
								</span>
								{` · ${voice.name} · ${presetSummary(shown)}`}
							</p>
							<p>{PRESET_TEXT.saveNote}</p>
						</>
					}
					save={(values) => create.mutateAsync({ ...values, voice, ...shown })}
					onSaved={(preset) => {
						host.apply(preset);
						toast.success(savedMessage(preset.name));
					}}
					openerRef={triggerRef}
					goneFocus={() => triggerRef.current}
					onClose={() => setOpen(null)}
				/>
			) : null}
			{open?.kind === "load" ? (
				<LoadDialog
					preset={open.preset}
					view={host.loadView(open.preset)}
					openerRef={triggerRef}
					onLoad={async () => {
						await load(open.preset);
						setOpen(null);
					}}
					onClose={() => setOpen(null)}
				/>
			) : null}
			{open?.kind === "overwrite" && voice && shown ? (
				<ConfirmDialog
					title={overwriteQuestion(open.preset.name)}
					description={
						<OverwriteDetail
							voice={voice}
							settings={host.settings}
							preset={open.preset}
						/>
					}
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
									host.apply(preset);
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
// 캐스팅은 설정만 불러와 같은 공급자의 다른 성우로 옮겨도 줄이 남으므로, 성우가 다르면 어느 성우의 프리셋인지 붙인다(critique P1).
// '바뀐 값 있음'이 생기고 사라지는 것을 보조기기에 알린다(계획 리뷰 D16)
export function PresetLine({ host }: { host: PresetHost }) {
	const presets = usePresetList();
	const { loaded } = host;
	const preset = loaded
		? presets.data?.find((item) => item.id === loaded.id)
		: undefined;
	if (!loaded || !preset) return null;
	// 공급자 없는 호스트(문단 작업실)는 목록에서 찾은 프리셋의 공급자로 비교한다(LoadedPreset에는 공급자가 없다)
	const provider = host.provider ?? preset.provider;
	const changed = !sameSettings(
		provider,
		host.settings[provider],
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
			{preset.voice?.voiceId !== host.voice?.voiceId
				? ` · ${savedVoiceLine(preset)}`
				: null}
		</p>
	);
}
