"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cleanText } from "@tts-pilot-app/api/classification-rules";
import { codePoints } from "@tts-pilot-app/api/providers/trial-options";
import { SCRIPT_TITLE_MAX, scriptBody } from "@tts-pilot-app/api/script-rules";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tts-pilot-app/ui/components/dialog";
import { Input } from "@tts-pilot-app/ui/components/input";
import { Label } from "@tts-pilot-app/ui/components/label";
import { type RefObject, useId, useRef, useState } from "react";
import { toast } from "sonner";

import {
	byName,
	type Group,
	type Named,
	saveFailure,
} from "@/lib/classes-view";
import type { Work } from "@/lib/paragraph-script";
import { PRESET_TEXT } from "@/lib/preset-view";
import { SCRIPT_TEXT } from "@/lib/script-text";
import {
	fingerprintOf,
	firstSentenceTitle,
	toScriptWork,
} from "@/lib/script-work";
import { client, OWNED_LIST, orpc } from "@/utils/orpc";

import { ClassChecklist } from "./class-checklist";
import {
	DIALOG_BODY,
	DialogButtons,
	fieldClass,
	isComposingEnter,
} from "./class-form-dialog";
import { useWork } from "./paragraph-provider";
import { RadioMenu } from "./voice-conditions";

// RadioMenu 값은 문자열이라 '채널 없음'을 빈 문자열로 둔다
const NO_CHANNEL = "";
// 채널은 위 RadioMenu가 따로 하나 고르므로 체크 목록은 카테고리·타입만 둔다(계획 리뷰 P11)
const CLASS_GROUPS: readonly Group[] = ["category", "type"];

// 제목·채널·분류 칸. '새 대본으로 저장' 창과 보관함의 고치기·'보관함에 저장' 창이 함께 쓴다(상태는 부른 쪽이 갖는다)
export function ScriptFields({
	title,
	onTitle,
	problem,
	tooLong,
	titleRef,
	pending,
	channelId,
	onChannel,
	channelNote,
	category,
	type,
	onToggle,
}: {
	title: string;
	onTitle: (title: string) => void;
	problem: string | null;
	tooLong: boolean;
	titleRef: RefObject<HTMLInputElement | null>;
	pending: boolean;
	channelId: string | null;
	onChannel: (id: string | null) => void;
	// 채널 칸 아래 회색 한 줄(채널 목록 실패가 아닐 때)
	channelNote?: string;
	category: readonly string[];
	type: readonly string[];
	onToggle: (group: Group, entry: Named, on: boolean) => void;
}) {
	const channels = useQuery(orpc.channelList.queryOptions(OWNED_LIST));
	const ids = useId();
	const known = byName(channels.data ?? []).map((item) => ({
		value: item.id,
		label: item.name,
	}));
	// 고른 채널이 목록에 없으면(받는 중·실패) id 대신 '고른 채널'로 보인다
	const options = [
		{ value: NO_CHANNEL, label: SCRIPT_TEXT.noChannel },
		...known,
		...(channelId !== null && !known.some((item) => item.value === channelId)
			? [{ value: channelId, label: PRESET_TEXT.chosenChannel }]
			: []),
	];
	return (
		<>
			<div className="flex flex-col gap-2">
				<Label htmlFor={`${ids}-title`} className="font-bold text-sm">
					{SCRIPT_TEXT.fieldTitle}
				</Label>
				<Input
					ref={titleRef}
					id={`${ids}-title`}
					name="title"
					autoComplete="off"
					className={fieldClass}
					value={title}
					readOnly={pending}
					aria-invalid={problem || tooLong ? true : undefined}
					aria-describedby={
						problem || tooLong ? `${ids}-title-error` : undefined
					}
					onChange={(event) => onTitle(event.target.value)}
				/>
				{problem || tooLong ? (
					<p
						id={`${ids}-title-error`}
						role="alert"
						className="text-sm text-warning"
					>
						{problem ?? SCRIPT_TEXT.titleTooLong}
					</p>
				) : null}
			</div>
			<div className="flex flex-col gap-2">
				{/* 칸 이름은 RadioMenu 버튼의 '채널 · …'이 맡는다(프리셋 창과 같다) */}
				<RadioMenu
					label={SCRIPT_TEXT.fieldChannel}
					value={channelId ?? NO_CHANNEL}
					options={options}
					disabled={pending || !channels.isSuccess}
					className="w-full justify-between"
					onChange={(next) => onChannel(next === NO_CHANNEL ? null : next)}
				/>
				{channels.isError ? (
					<p className="text-sm text-warning">{PRESET_TEXT.channelsFailed}</p>
				) : channelNote ? (
					<p className="text-muted-foreground text-sm">{channelNote}</p>
				) : null}
			</div>
			<div className="flex flex-col gap-2">
				<span className="font-bold text-sm">{SCRIPT_TEXT.fieldClasses}</span>
				<ClassChecklist
					groups={CLASS_GROUPS}
					selected={{ channel: [], category, type }}
					onToggle={onToggle}
				/>
			</div>
		</>
	);
}

type Created =
	| { ok: true; id: string; title: string; version: number }
	| { ok: false; reason: "duplicate" | "not_found" | "failed" };

// 컴포넌트 밖에 둔다: 컴포넌트 안 try/catch는 React Compiler가 그 컴포넌트를 건너뛴다(class-checklist createAndFind와 같다)
async function createScript(input: {
	title: string;
	channelId: string | null;
	classificationIds: string[];
	work: ReturnType<typeof toScriptWork>;
}): Promise<Created> {
	try {
		return { ok: true, ...(await client.scriptCreate(input)) };
	} catch (error) {
		return { ok: false, reason: saveFailure(error) };
	}
}

// '새 대본으로 저장' 창(브리프 18.2). 열 때만 마운트되고, 열 때 작업을 한 번 잡아 요약·제목 처음 값을 정한다.
// 성공하면 작업 채널을 고른 채널로 바꾼 뒤(채널 기본 프리셋 '불러오기' 창은 띄우지 않는다) 그 채널이 든 같은 작업으로 지문을 떠 연결한다(계획 리뷰 R3-1)
export function ScriptSaveDialog({
	initialTitle,
	openerRef,
	onClose,
}: {
	// 충돌 창에서 넘어오면 '{제목} 사본'. 없으면 첫 문장
	initialTitle?: string;
	openerRef: RefObject<HTMLElement | null>;
	onClose: () => void;
}) {
	const work = useWork();
	const queryClient = useQueryClient();
	const [first] = useState(() => {
		const snap = work.snapshot();
		const { paragraphCount, charCount } = scriptBody(snap.paragraphs);
		return {
			title: initialTitle ?? firstSentenceTitle(snap.paragraphs),
			channelId: snap.channelId,
			paragraphCount,
			charCount,
		};
	});
	const [title, setTitle] = useState(first.title);
	const [channelId, setChannelId] = useState<string | null>(first.channelId);
	const [category, setCategory] = useState<string[]>([]);
	const [type, setType] = useState<string[]>([]);
	const [problem, setProblem] = useState<string | null>(null);
	const [failure, setFailure] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const titleRef = useRef<HTMLInputElement>(null);
	const sendingRef = useRef(false);
	const titleCount = codePoints(cleanText(title));
	const tooLong = titleCount > SCRIPT_TITLE_MAX;

	function toggle(group: Group, entry: Named, on: boolean) {
		const flip = (ids: string[]) =>
			on
				? ids.includes(entry.id)
					? ids
					: [...ids, entry.id]
				: ids.filter((id) => id !== entry.id);
		if (group === "category") setCategory(flip);
		else if (group === "type") setType(flip);
	}

	function submit() {
		if (sendingRef.current) return;
		setFailure(null);
		const cleaned = cleanText(title);
		if (cleaned === "" || tooLong) {
			setProblem(
				cleaned === "" ? SCRIPT_TEXT.titleEmpty : SCRIPT_TEXT.titleTooLong,
			);
			titleRef.current?.focus();
			return;
		}
		// 보내는 작업과 지문은 같은 것이다: 고른 채널이 든 Work(toScriptWork는 채널을 뺀다)
		const sent: Work = { ...work.snapshot(), channelId };
		sendingRef.current = true;
		setPending(true);
		void createScript({
			title: cleaned,
			channelId,
			classificationIds: [...category, ...type],
			work: toScriptWork(sent),
		})
			.then((result) => {
				if (result.ok) {
					work.setChannelId(channelId);
					work.markSaved({
						scriptId: result.id,
						title: result.title,
						version: result.version,
						fingerprint: fingerprintOf(sent),
					});
					void queryClient.invalidateQueries({
						queryKey: orpc.scriptList.key(),
					});
					toast.success(SCRIPT_TEXT.savedAs(result.title));
					onClose();
					return;
				}
				if (result.reason === "duplicate") {
					setProblem(SCRIPT_TEXT.duplicateName);
				} else if (result.reason === "not_found") {
					// 고른 채널·분류가 그사이 지워졌다: 목록을 다시 받고 채널은 비운다
					void queryClient.invalidateQueries({
						queryKey: orpc.channelList.key(),
					});
					void queryClient.invalidateQueries({
						queryKey: orpc.classificationList.key(),
					});
					setChannelId(null);
					setCategory([]);
					setType([]);
					setFailure(SCRIPT_TEXT.channelGone);
				} else {
					setFailure(SCRIPT_TEXT.saveFailed);
				}
				titleRef.current?.focus();
			})
			.finally(() => {
				sendingRef.current = false;
				setPending(false);
			});
	}

	return (
		<Dialog
			open
			// 제목만이 아니라 채널·분류를 바꿨어도 창 밖 클릭으로 닫지 않는다
			disablePointerDismissal={
				title !== first.title ||
				channelId !== first.channelId ||
				category.length > 0 ||
				type.length > 0
			}
			onOpenChange={(open) => {
				if (!open && !pending) onClose();
			}}
		>
			<DialogContent
				// 열 때 제목을 전체 선택한다(그대로 쓰거나 바로 덮어쓴다)
				initialFocus={() => {
					titleRef.current?.select();
					return titleRef.current ?? true;
				}}
				finalFocus={() => openerRef.current ?? true}
				className="md:flex md:max-w-lg md:flex-col"
			>
				<form
					noValidate
					className="flex flex-col gap-5 md:min-h-0"
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
					onKeyDown={(event) => {
						// 한글 조합 Enter와 분류 검색 칸 Enter는 저장이 아니다
						if (
							isComposingEnter(event) ||
							(event.key === "Enter" &&
								event.target instanceof HTMLInputElement &&
								event.target.name === "class-search")
						)
							event.preventDefault();
					}}
				>
					<DialogHeader>
						<DialogTitle className="wrap-anywhere break-keep">
							{SCRIPT_TEXT.saveTitle}
						</DialogTitle>
						<DialogDescription>
							{SCRIPT_TEXT.saveDescription(
								first.paragraphCount,
								first.charCount,
							)}
						</DialogDescription>
					</DialogHeader>
					<div className={DIALOG_BODY}>
						<ScriptFields
							title={title}
							onTitle={(next) => {
								setTitle(next);
								setProblem(null);
							}}
							problem={problem}
							tooLong={tooLong}
							titleRef={titleRef}
							pending={pending}
							channelId={channelId}
							onChannel={setChannelId}
							channelNote={SCRIPT_TEXT.channelNote}
							category={category}
							type={type}
							onToggle={toggle}
						/>
					</div>
					{failure ? (
						<p role="alert" className="text-sm text-warning">
							{failure}
						</p>
					) : null}
					<p role="status" className="sr-only">
						{pending ? SCRIPT_TEXT.saving : ""}
					</p>
					<DialogButtons
						pending={pending}
						label={SCRIPT_TEXT.saveNow}
						onCancel={onClose}
					/>
				</form>
			</DialogContent>
		</Dialog>
	);
}
