"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tts-pilot-app/ui/components/tooltip";
import {
	ArrowRight,
	ExternalLink,
	type LucideIcon,
	Pencil,
	Plus,
	Trash2,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRef, useState } from "react";

import {
	byName,
	emptyMessage,
	GROUP_TEXT,
	type Group,
	listFailedMessage,
	neighborId,
	shortUrl,
} from "@/lib/classes-view";
import { voiceCountText } from "@/lib/saved-voice-view";

import { ClassDeleteDialog } from "./class-delete-dialog";
import { ClassFormDialog } from "./class-form-dialog";
import { ReloadButton } from "./voice-problem";

export type ClassItem = {
	id: string;
	name: string;
	memo: string | null;
	url?: string | null;
	// 연결된 담은 성우 수(T7). 0이면 '성우 N명' 링크가 없다
	voiceCount?: number;
};

// 행의 아이콘 버튼(44px, 툴팁). 접근 이름은 '{이름} 고치기'처럼 항목 이름을 담는다(사용자 결정 2026-10-06, T5 결과 행과 같다).
// busy(작업실 이전 결과의 받는 중)면 같은 버튼의 아이콘만 스피너로 바꾼다(다른 요소로 바꾸면 포커스를 잃는다, 브리프 5.8). busy·disabled면 포커스는 받고 눌리지 않는다
export function RowAction({
	id,
	label,
	tip,
	icon: Icon,
	busy = false,
	disabled = false,
	onClick,
}: {
	id?: string;
	label: string;
	tip: string;
	icon: LucideIcon;
	busy?: boolean;
	disabled?: boolean;
	onClick: (button: HTMLButtonElement) => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						id={id}
						variant="ghost"
						size="icon-lg"
						focusableWhenDisabled
						disabled={busy || disabled}
						aria-busy={busy || undefined}
						// 행 이름보다 가볍게 회색으로 두고 가리키거나 포커스하면 진해진다(critique P2)
						className="text-muted-foreground hover:text-foreground focus-visible:text-foreground aria-disabled:pointer-events-none"
						aria-label={label}
						onClick={(event) => onClick(event.currentTarget)}
					/>
				}
			>
				{busy ? <Spinner aria-hidden="true" /> : <Icon aria-hidden="true" />}
			</TooltipTrigger>
			<TooltipContent>{tip}</TooltipContent>
		</Tooltip>
	);
}

// 지운 뒤 다음 행으로 포커스를 옮길 때 찾는 id(그 행의 고치기 버튼)
const editButtonId = (id: string) => `class-${id}-edit`;

// 행의 글자 링크('성우 N명', 채널 주소). 글자는 14px이고 누르는 영역은 44px이다
const linkClass =
	"flex min-h-11 w-fit items-center gap-1 rounded-md text-primary text-sm underline-offset-4 outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring";

// 목록 그릇. 빈 상태도 같은 그릇이라 첫 항목을 만들 때 자리가 튀지 않는다(브리프 5절 B1)
export const boxClass = "rounded-2xl bg-card ring-1 ring-border ring-inset";

// 묶음 하나(머리, 행 목록 또는 로딩·빈·오류). 입력 창과 삭제 확인을 열 때만 마운트하고(계획 리뷰 P12), 연 버튼을 기억한다(E6).
// 닫힌 뒤 포커스: 취소·저장은 연 버튼, 지운 뒤는 다음 행 → 이전 행 → '만들기'(사용자 결정), 없어진 항목은 '만들기'
export function ClassGroup({
	group,
	items,
	failed,
	retrying,
	onRetry,
}: {
	group: Group;
	items: ClassItem[] | undefined;
	failed: boolean;
	retrying: boolean;
	onRetry: () => Promise<boolean>;
}) {
	const text = GROUP_TEXT[group];
	const headingId = `class-group-${group}`;
	const headingRef = useRef<HTMLHeadingElement>(null);
	const createRef = useRef<HTMLButtonElement>(null);
	const openerRef = useRef<HTMLButtonElement | null>(null);
	// 지운 뒤 포커스할 이웃 행. 무효화를 기다린 뒤에는 새 목록에 지운 id가 없어 이웃을 못 찾으므로 휴지통을 누를 때 정한다(사전 점검 P1)
	const nextRef = useRef<string | null>(null);
	const [editing, setEditing] = useState<ClassItem | "new" | null>(null);
	const [removing, setRemoving] = useState<ClassItem | null>(null);
	const sorted = items ? byName(items) : undefined;

	function open(button: HTMLButtonElement, show: () => void) {
		openerRef.current = button;
		show();
	}
	function afterRemove(): HTMLElement | null {
		return (
			(nextRef.current &&
				document.getElementById(editButtonId(nextRef.current))) ||
			createRef.current
		);
	}
	// 다시 받기에 성공하면 버튼이 사라지므로 포커스를 묶음 머리로 옮긴다(계획 리뷰 D6)
	async function retry() {
		if (await onRetry()) headingRef.current?.focus();
	}

	let body: React.ReactNode;
	if (failed && !sorted)
		body = (
			<div className="flex flex-wrap items-center gap-3">
				<p className="text-muted-foreground text-sm">
					{listFailedMessage(group)}
				</p>
				<ReloadButton reloading={retrying} onReload={() => void retry()} />
			</div>
		);
	else if (!sorted)
		body = <Skeleton aria-hidden="true" className="h-16 w-full rounded-2xl" />;
	else if (sorted.length === 0)
		body = (
			<div className={`${boxClass} p-4`}>
				<p className="text-muted-foreground text-sm">{emptyMessage(group)}</p>
			</div>
		);
	else
		body = (
			<ul className={`divide-y overflow-hidden ${boxClass}`}>
				{sorted.map((item) => {
					const voices = voiceCountText(item.voiceCount ?? 0);
					return (
						<li key={item.id} className="flex items-start gap-3 p-4">
							<div className="min-w-0 flex-1">
								<p className="wrap-break-word font-bold">{item.name}</p>
								{item.memo ? (
									<p className="wrap-break-word mt-1 text-muted-foreground text-sm">
										{item.memo}
									</p>
								) : null}
								{voices || item.url ? (
									// 44px 타깃은 지키고 음수 여백으로 보이는 간격을 메모(mt-1)와 맞춘다(critique P2).
									// '성우 N명'과 주소 링크는 한 줄에 놓고 좁으면 줄을 바꾼다(위아래로 쌓으면 음수 여백끼리 누르는 영역이 겹친다)
									<div className="-mt-2 -mb-3 flex flex-wrap items-center gap-x-4">
										{voices ? (
											<Link
												href={`/voices?${group}=${item.id}` as Route}
												// 링크 목록에서 구별되게 항목 이름을 더한다. 보이는 글자로 시작한다(QA F6, WCAG 2.5.3)
												aria-label={`${voices}, ${item.name}`}
												className={linkClass}
											>
												{voices}
												<ArrowRight
													aria-hidden="true"
													className="size-3.5 shrink-0"
												/>
											</Link>
										) : null}
										{item.url ? (
											<a
												href={item.url}
												target="_blank"
												rel="noopener noreferrer"
												title={item.url}
												className={`${linkClass} max-w-full`}
											>
												<span className="truncate">{shortUrl(item.url)}</span>
												<ExternalLink
													aria-hidden="true"
													className="size-3.5 shrink-0"
												/>
												<span className="sr-only">(새 탭)</span>
											</a>
										) : null}
									</div>
								) : null}
							</div>
							{/* 44px 버튼 가운데를 이름 첫 줄(24px)에 맞춘다(critique P2) */}
							<div className="-my-2.5 flex shrink-0">
								<RowAction
									id={editButtonId(item.id)}
									label={`${item.name} 고치기`}
									tip="고치기"
									icon={Pencil}
									onClick={(button) => open(button, () => setEditing(item))}
								/>
								<RowAction
									label={`${item.name} 지우기`}
									tip="지우기"
									icon={Trash2}
									onClick={(button) => {
										nextRef.current = neighborId(
											sorted.map((i) => i.id),
											item.id,
										);
										open(button, () => setRemoving(item));
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
			aria-labelledby={headingId}
			aria-busy={!sorted && !failed ? true : undefined}
			className="flex flex-col gap-3"
		>
			<div className="flex flex-col gap-1">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2
						id={headingId}
						ref={headingRef}
						tabIndex={-1}
						className="flex items-baseline gap-2 font-bold text-xl outline-none"
					>
						{text.label}{" "}
						{sorted ? (
							<span className="font-normal text-muted-foreground text-sm tabular-nums">
								{sorted.length}개
							</span>
						) : null}
					</h2>
					<Button
						ref={createRef}
						size="lg"
						variant="outline"
						onClick={(event) =>
							open(event.currentTarget, () => setEditing("new"))
						}
					>
						<Plus aria-hidden="true" data-icon="inline-start" />
						{text.label} 만들기
					</Button>
				</div>
				{/* 묶음 예시는 항목이 있어도 남겨 카테고리·타입의 뜻을 보인다(브리프 critique 반영) */}
				<p className="text-muted-foreground text-sm">{text.example}</p>
			</div>
			{body}
			{editing ? (
				<ClassFormDialog
					group={group}
					editing={editing}
					openerRef={openerRef}
					createRef={createRef}
					onClose={() => setEditing(null)}
				/>
			) : null}
			{removing ? (
				<ClassDeleteDialog
					group={group}
					item={removing}
					openerRef={openerRef}
					focusAfterDelete={afterRemove}
					onClose={() => setRemoving(null)}
				/>
			) : null}
		</section>
	);
}
