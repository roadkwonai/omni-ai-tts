"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	cleanText,
	NAME_MAX,
	nameProblem,
} from "@tts-pilot-app/api/classification-rules";
import type { Preset } from "@tts-pilot-app/api/preset-contract";
import { codePoints } from "@tts-pilot-app/api/providers/trial-options";
import { Checkbox } from "@tts-pilot-app/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tts-pilot-app/ui/components/dialog";
import { Input } from "@tts-pilot-app/ui/components/input";
import { Label } from "@tts-pilot-app/ui/components/label";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { type ReactNode, type RefObject, useId, useRef, useState } from "react";
import { toast } from "sonner";

import {
	byName,
	fieldMessage,
	MESSAGES,
	saveFailure,
} from "@/lib/classes-view";
import { defaultNote, PRESET_TEXT } from "@/lib/preset-view";
import { plain } from "@/lib/voice-view";
import { OWNED_LIST, orpc } from "@/utils/orpc";

import {
	DIALOG_BODY,
	DialogButtons,
	fieldClass,
	isComposingEnter,
} from "./class-form-dialog";
import { usePresetList } from "./presets";
import { RadioMenu } from "./voice-conditions";

export type PresetFormValues = {
	name: string;
	channelId: string | null;
	channelDefault: boolean;
};

// RadioMenu 값은 문자열이라 '채널 없음'을 빈 문자열로 둔다
const NO_CHANNEL = "";

// 프리셋 저장(캐스팅)·고치기(/presets) 창(스펙 4절). ClassFormDialog와 같은 틀이다:
// 열 때만 마운트, 저장 중 읽기 전용(포커스는 간다), 값을 바꾼 동안 바깥 누르기로 닫히지 않음, 두 번 누름은 렌더를 기다리지 않고 막음,
// 이름 중복은 이름 칸에. NOT_FOUND면 채널 목록을 다시 받는다(스펙 5절). 원인이 지워진 채널이면(새로 저장, 또는 프리셋이 아직 있는 고치기)
// 창을 두고 채널을 '채널 없음'으로 되돌린다(계획 리뷰 F2·재리뷰 N2). 프리셋이 지워졌으면 알리고 닫은 뒤 포커스를 goneFocus로(행이 사라진다, F4).
// 저장 결과의 처리는 onSaved가 한다
export function PresetFormDialog({
	title,
	presetId,
	initial,
	summary,
	save,
	onSaved,
	openerRef,
	goneFocus,
	onClose,
}: {
	title: string;
	// 고치는 프리셋(새로 저장이면 null). '지금 기본' 안내에서 자기 자신을 뺀다
	presetId: string | null;
	initial: PresetFormValues;
	// 새로 저장할 때 무엇이 저장되는지(계획 리뷰 D5). 고치기 창은 넘기지 않는다
	summary?: ReactNode;
	save: (values: PresetFormValues) => Promise<Preset>;
	onSaved: (preset: Preset) => void;
	openerRef: RefObject<HTMLElement | null>;
	goneFocus: () => HTMLElement | null;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const channels = useQuery(orpc.channelList.queryOptions(OWNED_LIST));
	const presets = usePresetList();
	const [values, setValues] = useState(initial);
	const [problem, setProblem] = useState<string | null>(null);
	const [failure, setFailure] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const nameRef = useRef<HTMLInputElement>(null);
	const sendingRef = useRef(false);
	const goneRef = useRef(false);
	const ids = useId();
	const dirty =
		values.name !== initial.name ||
		values.channelId !== initial.channelId ||
		values.channelDefault !== initial.channelDefault;
	// 이 채널의 다른 기본 프리셋(체크하면 이것으로 바뀐다)
	const current =
		values.channelId === null
			? undefined
			: presets.data?.find(
					(preset) =>
						preset.channelId === values.channelId &&
						preset.channelDefault &&
						preset.id !== presetId,
				);
	const nameCount = codePoints(cleanText(values.name));
	const known = byName(channels.data ?? []).map((item) => ({
		value: item.id,
		label: item.name,
	}));
	// 고른 채널이 목록에 없으면(받는 중·실패) id 대신 '고른 채널'로 보인다(계획 리뷰 F7)
	const options = [
		{ value: NO_CHANNEL, label: PRESET_TEXT.noChannel },
		...known,
		...(values.channelId !== null &&
		!known.some((item) => item.value === values.channelId)
			? [{ value: values.channelId, label: PRESET_TEXT.chosenChannel }]
			: []),
	];

	function submit() {
		if (sendingRef.current) return;
		const found = nameProblem(values.name);
		setFailure(null);
		if (found) {
			setProblem(fieldMessage("name", found));
			nameRef.current?.focus();
			return;
		}
		sendingRef.current = true;
		setPending(true);
		save(values)
			.then(
				(preset) => {
					onSaved(preset);
					onClose();
				},
				async (error: unknown) => {
					const kind = saveFailure(error);
					if (kind === "not_found") {
						void queryClient.invalidateQueries({
							queryKey: orpc.channelList.key(),
						});
						// 새로 저장이면 원인은 지워진 채널뿐이다. 고치기는 프리셋이 아직 목록에 있으면 채널 탓이다(계획 재리뷰 N2).
						// 목록을 받지 못하면 받아 둔 목록으로 판단하고, 받아 둔 목록도 없으면 창을 지킨다
						const presetGone =
							presetId !== null &&
							(await presets.refetch()).data?.some(
								(item) => item.id === presetId,
							) === false;
						if (!presetGone) {
							setValues((all) => ({
								...all,
								channelId: null,
								channelDefault: false,
							}));
							setFailure(PRESET_TEXT.channelGone);
							nameRef.current?.focus();
							return;
						}
						toast.error(MESSAGES.notFound);
						goneRef.current = true;
						onClose();
						return;
					}
					if (kind === "duplicate") setProblem(PRESET_TEXT.duplicate);
					else setFailure(MESSAGES.saveFailed);
					nameRef.current?.focus();
				},
			)
			.finally(() => {
				sendingRef.current = false;
				setPending(false);
			});
	}

	return (
		<Dialog
			open
			disablePointerDismissal={dirty}
			onOpenChange={(open) => {
				if (!open && !pending) onClose();
			}}
		>
			<DialogContent
				initialFocus={nameRef}
				finalFocus={() =>
					(goneRef.current ? goneFocus() : openerRef.current) ?? true
				}
				className="md:flex md:flex-col"
			>
				<form
					noValidate
					className="flex flex-col gap-5 md:min-h-0"
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
					onKeyDown={(event) => {
						if (isComposingEnter(event)) event.preventDefault();
					}}
				>
					<DialogHeader>
						<DialogTitle className="wrap-anywhere">{title}</DialogTitle>
					</DialogHeader>
					<div className={DIALOG_BODY}>
						{/* 요약 두 줄이 창의 설명이다(창을 열면 읽힌다, critique P2). 설명은 <p>라 <div>로 연다 */}
						{summary ? (
							<DialogDescription
								render={<div />}
								className="flex flex-col gap-1 text-sm"
							>
								{summary}
							</DialogDescription>
						) : null}
						<div className="flex flex-col gap-2">
							<div className="flex items-baseline justify-between gap-3">
								<Label htmlFor={`${ids}-name`} className="font-bold text-sm">
									이름
								</Label>
								<span
									id={`${ids}-count`}
									className={cn(
										"text-sm tabular-nums",
										nameCount > NAME_MAX
											? "text-warning"
											: "text-muted-foreground",
									)}
								>
									{plain.format(nameCount)} / {NAME_MAX}자
								</span>
							</div>
							<Input
								ref={nameRef}
								id={`${ids}-name`}
								name="name"
								autoComplete="off"
								className={fieldClass}
								value={values.name}
								readOnly={pending}
								aria-invalid={problem ? true : undefined}
								aria-describedby={
									problem ? `${ids}-name-error ${ids}-count` : `${ids}-count`
								}
								onChange={(event) => {
									const { value } = event.target;
									setValues((all) => ({ ...all, name: value }));
									setProblem(null);
								}}
							/>
							{problem ? (
								<p
									id={`${ids}-name-error`}
									role="alert"
									className="text-sm text-warning"
								>
									{problem}
								</p>
							) : null}
						</div>
						<div className="flex flex-col gap-2">
							{/* 칸 이름은 RadioMenu 버튼의 '채널 · …'이 맡는다(위 글자 라벨을 두지 않는다, 계획 리뷰 D6) */}
							<RadioMenu
								label={PRESET_TEXT.channel}
								value={values.channelId ?? NO_CHANNEL}
								options={options}
								// 받는 중이거나 받지 못하면(받아 둔 목록이 있어도) 누를 수 없다(브리프 5절)
								disabled={pending || !channels.isSuccess}
								className="w-full justify-between"
								// 채널을 바꾸면 기본 체크를 푼다(다른 채널의 기본을 모르고 바꾸지 않게, 계획 리뷰 E6)
								onChange={(next) =>
									setValues((all) => ({
										...all,
										channelId: next === NO_CHANNEL ? null : next,
										channelDefault: false,
									}))
								}
							/>
							{channels.isError ? (
								<p className="text-sm text-warning">
									{PRESET_TEXT.channelsFailed}
								</p>
							) : channels.data?.length === 0 ? (
								<p className="text-muted-foreground text-sm">
									{PRESET_TEXT.noChannels}
								</p>
							) : null}
							{/* 줄 전체가 눌림 영역이다(44px, 계획 리뷰 D7). 채널이 없어 꺼지면 라벨도 회색이다(누를 수 있는 줄로 보이지 않게, 브리프 5절) */}
							<Label
								className={cn(
									"flex min-h-11 items-center gap-3 text-sm",
									values.channelId === null && "text-muted-foreground",
								)}
							>
								<Checkbox
									checked={values.channelDefault}
									disabled={pending || values.channelId === null}
									aria-describedby={
										values.channelId === null ? `${ids}-default-why` : undefined
									}
									onCheckedChange={(on) =>
										setValues((all) => ({
											...all,
											channelDefault: on === true,
										}))
									}
								/>
								{PRESET_TEXT.channelDefault}
							</Label>
							{values.channelId === null ? (
								<p
									id={`${ids}-default-why`}
									className="text-muted-foreground text-sm"
								>
									{PRESET_TEXT.defaultNeedsChannel}
								</p>
							) : current ? (
								<p className="text-muted-foreground text-sm">
									{defaultNote(current.name)}
								</p>
							) : null}
						</div>
					</div>
					{failure ? (
						<p role="alert" className="text-sm text-warning">
							{failure}
						</p>
					) : null}
					<p role="status" className="sr-only">
						{pending ? "저장하는 중이에요" : ""}
					</p>
					<DialogButtons
						pending={pending}
						label="저장하기"
						onCancel={onClose}
					/>
				</form>
			</DialogContent>
		</Dialog>
	);
}
