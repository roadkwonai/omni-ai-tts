"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	cleanText,
	MEMO_MAX,
	memoProblem,
	nameProblem,
	urlProblem,
} from "@tts-pilot-app/api/classification-rules";
import { codePoints } from "@tts-pilot-app/api/providers/trial-options";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@tts-pilot-app/ui/components/dialog";
import { Input } from "@tts-pilot-app/ui/components/input";
import { Label } from "@tts-pilot-app/ui/components/label";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { Textarea } from "@tts-pilot-app/ui/components/textarea";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { type Ref, type RefObject, useId, useRef, useState } from "react";
import { toast } from "sonner";

import {
	doneMessage,
	duplicateMessage,
	type Field,
	fieldMessage,
	GROUP_TEXT,
	type Group,
	MESSAGES,
	readableUrl,
	saveFailure,
} from "@/lib/classes-view";
import { plain } from "@/lib/voice-view";
import { client, orpc } from "@/utils/orpc";

import type { ClassItem } from "./class-group";

type Values = { name: string; memo: string; url: string };
type Problems = Partial<Record<Field, string>>;

// 입력 칸 44px, 767px 이하 글자 16px(iOS 확대 방지, 계획 리뷰 D1). sentence-bar와 같다.
// 오류 테두리는 프리미티브의 destructive(빨강)를 덮어 오류 문구와 같은 warning으로 둔다(audit P2, 프리미티브는 다른 화면이 쓴다)
export const fieldClass =
	"min-h-11 rounded-xl text-base md:text-sm aria-invalid:border-warning aria-invalid:ring-warning/20 dark:aria-invalid:border-warning dark:aria-invalid:ring-warning/40";

// 한글 조합을 끝내는 Enter는 저장이 아니다. Safari는 compositionend 뒤에 keyCode 229로 온다(계획 리뷰 D12)
export const isComposingEnter = (event: React.KeyboardEvent) =>
	event.key === "Enter" &&
	(event.nativeEvent.isComposing || event.keyCode === 229);

// 창 아래 '취소'와 주 버튼(입력 창 둘, 프리셋 불러오기 창). 진행 중에는 둘 다 누를 수 없고(포커스는 간다) 주 버튼에 스피너가 돈다.
// 767px 이하 시트에서는 두 버튼이 가로 반반(브리프 5절 B3). onSubmit이 없으면 주 버튼은 form 제출이다
export function DialogButtons({
	pending,
	label,
	submitRef,
	onCancel,
	onSubmit,
}: {
	pending: boolean;
	label: string;
	submitRef?: Ref<HTMLButtonElement>;
	onCancel: () => void;
	onSubmit?: () => void;
}) {
	return (
		<DialogFooter>
			<Button
				type="button"
				size="lg"
				variant="neutral"
				disabled={pending}
				focusableWhenDisabled
				className="flex-1 md:flex-none"
				onClick={onCancel}
			>
				취소
			</Button>
			<Button
				ref={submitRef}
				type={onSubmit ? "button" : "submit"}
				size="lg"
				disabled={pending}
				focusableWhenDisabled
				className="flex-1 md:flex-none"
				onClick={onSubmit}
			>
				{pending ? (
					<Spinner data-icon="inline-start" aria-hidden="true" />
				) : null}
				{label}
			</Button>
		</DialogFooter>
	);
}

// 그룹의 목록 쿼리 키. 저장·삭제가 끝나면 이 키를 다시 받는다
export function listKey(group: Group) {
	return group === "channel"
		? orpc.channelList.key()
		: orpc.classificationList.key();
}

// 그룹과 만들기·고치기에 맞는 프로시저 하나를 부른다. 채널만 URL을 보낸다.
// 반환 꼴을 이름 하나로 좁혀 두 프로시저 결과의 합집합이 채널 타입으로 추론되지 않게 한다(계획 리뷰 E1)
function saveItem(
	group: Group,
	editing: ClassItem | "new",
	values: Values,
): Promise<{ name: string }> {
	if (group === "channel")
		return editing === "new"
			? client.channelCreate(values)
			: client.channelUpdate({ id: editing.id, ...values });
	const { name, memo } = values;
	return editing === "new"
		? client.classificationCreate({ kind: group, name, memo })
		: client.classificationUpdate({ id: editing.id, name, memo });
}

function initialValues(editing: ClassItem | "new"): Values {
	return editing === "new"
		? { name: "", memo: "", url: "" }
		: {
				name: editing.name,
				memo: editing.memo ?? "",
				// 목록과 같은 푼 주소로 보이고 그대로 저장한다(critique P1, 사용자 선택)
				url: editing.url ? readableUrl(editing.url) : "",
			};
}

function problemsOf(group: Group, values: Values): Problems {
	const problems: Problems = {};
	const name = nameProblem(values.name);
	if (name) problems.name = fieldMessage("name", name);
	const url = group === "channel" ? urlProblem(values.url) : null;
	if (url) problems.url = fieldMessage("url", url);
	const memo = memoProblem(values.memo);
	if (memo) problems.memo = fieldMessage("memo", memo);
	return problems;
}

// 선택 칸 라벨 뒤 회색 '(선택)'(브리프 5절 B5)
function Optional() {
	return <span className="font-normal text-muted-foreground">(선택)</span>;
}

// 만들기·고치기 입력 창(스펙 4절). 열 때만 마운트되어 값은 처음 한 번 정한다(계획 리뷰 P12).
// 저장 중에는 칸을 읽기 전용으로 두고(포커스는 갈 수 있게, E4·D5) 창을 닫지 않는다. 값을 바꾼 동안은 바깥 누르기로 닫히지 않는다(사용자 결정).
// 닫힌 뒤 포커스: 없어진 항목(NOT_FOUND)이면 묶음 '만들기', 아니면 연 버튼(E6)
export function ClassFormDialog({
	group,
	editing,
	openerRef,
	createRef,
	onClose,
}: {
	group: Group;
	editing: ClassItem | "new";
	openerRef: RefObject<HTMLButtonElement | null>;
	createRef: RefObject<HTMLButtonElement | null>;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [initial] = useState(() => initialValues(editing));
	const [values, setValues] = useState(initial);
	const [problems, setProblems] = useState<Problems>({});
	const [failure, setFailure] = useState<string | null>(null);
	const nameRef = useRef<HTMLInputElement>(null);
	// 두 번 누름·Enter 연타는 렌더를 기다리지 않고 막는다(계획 리뷰 E11)
	const sendingRef = useRef(false);
	const goneRef = useRef(false);
	const ids = useId();
	const action = editing === "new" ? "create" : "update";
	const dirty =
		values.name !== initial.name ||
		values.memo !== initial.memo ||
		values.url !== initial.url;
	const save = useMutation({
		mutationFn: (input: Values) => saveItem(group, editing, input),
		// 실패해도 처리됐을 수 있으므로 목록을 다시 받는다(스펙 5절)
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: listKey(group) }),
	});

	function submit() {
		if (sendingRef.current) return;
		const found = problemsOf(group, values);
		setProblems(found);
		setFailure(null);
		const first = (Object.keys(found) as Field[])[0];
		if (first) {
			// 오류 문구는 role="alert"라 포커스보다 늦게 붙어도 읽힌다(D5)
			document.getElementById(`${ids}-${first}`)?.focus();
			return;
		}
		sendingRef.current = true;
		save.mutate(values, {
			onSuccess: (saved) => {
				toast.success(doneMessage(group, saved.name, action));
				onClose();
			},
			onError: (error) => {
				const kind = saveFailure(error);
				if (kind === "not_found") {
					goneRef.current = true;
					toast.error(MESSAGES.notFound);
					onClose();
					return;
				}
				if (kind === "duplicate")
					setProblems({ name: duplicateMessage(group) });
				else setFailure(MESSAGES.saveFailed);
				// 칸이 읽기 전용(disabled 아님)이라 바로 포커스된다(E4)
				nameRef.current?.focus();
			},
			onSettled: () => {
				sendingRef.current = false;
			},
		});
	}

	const errorId = (name: Field) => `${ids}-${name}-error`;
	const bind = (name: Field) => ({
		id: `${ids}-${name}`,
		name,
		value: values[name],
		readOnly: save.isPending,
		"aria-invalid": problems[name] ? true : undefined,
		"aria-describedby":
			[
				problems[name] ? errorId(name) : null,
				name === "memo" ? `${ids}-memo-count` : null,
			]
				.filter(Boolean)
				.join(" ") || undefined,
		onChange: (
			event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
		) => {
			const { value } = event.target;
			setValues((current) => ({ ...current, [name]: value }));
			setProblems((current) => ({ ...current, [name]: undefined }));
		},
	});
	const error = (name: Field) =>
		problems[name] ? (
			<p id={errorId(name)} role="alert" className="text-sm text-warning">
				{problems[name]}
			</p>
		) : null;
	const memoCount = codePoints(cleanText(values.memo));

	return (
		<Dialog
			open
			disablePointerDismissal={dirty}
			onOpenChange={(open) => {
				if (!open && !save.isPending) onClose();
			}}
		>
			<DialogContent
				initialFocus={nameRef}
				finalFocus={() =>
					(goneRef.current ? createRef.current : openerRef.current) ?? true
				}
			>
				<form
					noValidate
					className="flex flex-col gap-5"
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
					onKeyDown={(event) => {
						if (isComposingEnter(event)) {
							event.preventDefault();
							return;
						}
						// 메모(여러 줄 칸)에서도 Enter는 저장이다. 줄바꿈은 저장할 때 공백으로 정리된다(사용자 결정 2026-10-06)
						if (
							event.key === "Enter" &&
							event.target instanceof HTMLTextAreaElement
						) {
							event.preventDefault();
							submit();
						}
					}}
				>
					<DialogHeader>
						<DialogTitle>
							{GROUP_TEXT[group].label}{" "}
							{editing === "new" ? "만들기" : "고치기"}
						</DialogTitle>
					</DialogHeader>
					<div className="flex flex-col gap-2">
						<Label htmlFor={`${ids}-name`} className="font-bold text-sm">
							이름
						</Label>
						<Input
							ref={nameRef}
							autoComplete="off"
							className={fieldClass}
							{...bind("name")}
						/>
						{error("name")}
					</div>
					{group === "channel" ? (
						<div className="flex flex-col gap-2">
							<Label htmlFor={`${ids}-url`} className="font-bold text-sm">
								채널 주소 <Optional />
							</Label>
							<Input
								type="url"
								inputMode="url"
								autoComplete="url"
								spellCheck={false}
								placeholder="https://youtube.com/@…"
								className={fieldClass}
								{...bind("url")}
							/>
							{error("url")}
						</div>
					) : null}
					<div className="flex flex-col gap-2">
						<div className="flex items-baseline justify-between gap-3">
							<Label htmlFor={`${ids}-memo`} className="font-bold text-sm">
								메모 <Optional />
							</Label>
							<span
								id={`${ids}-memo-count`}
								className={cn(
									"text-sm tabular-nums",
									memoCount >= 190 ? "text-warning" : "text-muted-foreground",
								)}
							>
								{plain.format(memoCount)} / {MEMO_MAX}자
							</span>
						</div>
						<Textarea
							autoComplete="off"
							className={cn(fieldClass, "min-h-20")}
							{...bind("memo")}
						/>
						{error("memo")}
					</div>
					{failure ? (
						<p role="alert" className="text-sm text-warning">
							{failure}
						</p>
					) : null}
					{/* 저장 중은 버튼 스피너로만 보이므로 보조기기에 따로 알린다(audit P2) */}
					<p role="status" className="sr-only">
						{save.isPending ? "저장하는 중이에요" : ""}
					</p>
					<DialogButtons
						pending={save.isPending}
						label={editing === "new" ? "만들기" : "저장하기"}
						onCancel={onClose}
					/>
				</form>
			</DialogContent>
		</Dialog>
	);
}
