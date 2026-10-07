"use client";

import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import {
	type ClassificationKind,
	nameProblem,
} from "@tts-pilot-app/api/classification-rules";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Checkbox } from "@tts-pilot-app/ui/components/checkbox";
import { Input } from "@tts-pilot-app/ui/components/input";
import { Plus } from "lucide-react";
import { type RefObject, useId, useRef, useState } from "react";
import { toast } from "sonner";

import {
	byName,
	emptyMessage,
	fieldMessage,
	GROUP_TEXT,
	GROUPS,
	type Group,
	groupLists,
	MESSAGES,
	type Named,
	saveFailure,
} from "@/lib/classes-view";
import { foldName, LIBRARY_TEXT, sameName } from "@/lib/saved-voice-view";
import { client, OWNED_LIST, orpc } from "@/utils/orpc";

import { invalidateClasses, useClassLists, useLinkVoice } from "./saved-voices";
import { ReloadRow } from "./voice-problem";

// 만들고 그 id를 돌려준다. 같은 이름이 이미 있으면(CONFLICT) 목록을 다시 받아 그 항목 id를. 그 밖 실패는 알리고 null.
// 컴포넌트 밖에 둔다: 컴포넌트 안 try/finally는 React Compiler가 그 컴포넌트를 건너뛴다(계획 리뷰 E18, 실측)
export async function createAndFind(
	group: Group,
	name: string,
	queryClient: QueryClient,
): Promise<string | null> {
	try {
		const made =
			group === "channel"
				? await client.channelCreate({ name, memo: "", url: "" })
				: await client.classificationCreate({
						kind: group as ClassificationKind,
						name,
						memo: "",
					});
		return made.id;
	} catch (error) {
		if (saveFailure(error) !== "duplicate") {
			toast.error(MESSAGES.saveFailed);
			return null;
		}
		// 다시 받기도 실패하면 알리고 null(잡지 않으면 처리되지 않은 거부가 된다).
		// staleTime 0: 다른 탭에서 만든 이름은 30초 캐시에 없으므로 늘 서버에서 다시 받는다(스펙 5절)
		try {
			const fresh: readonly Named[] =
				group === "channel"
					? await queryClient.fetchQuery({
							...orpc.channelList.queryOptions(OWNED_LIST),
							staleTime: 0,
						})
					: (
							await queryClient.fetchQuery({
								...orpc.classificationList.queryOptions(OWNED_LIST),
								staleTime: 0,
							})
						).filter((entry) => entry.kind === group);
			return sameName(fresh, name)?.id ?? null;
		} catch {
			toast.error(MESSAGES.saveFailed);
			return null;
		}
	} finally {
		invalidateClasses(queryClient);
	}
}

// '분류 붙이기'(스펙 4절, 사용자 결정 U4: 팝오버가 아니라 담기 칸 안에서 펼친다. 넓은 화면·서랍 모두 같고 겹침이 없다).
// 체크하면 바로 저장되고, 일치하는 이름이 없으면 그 자리에서 만들고 붙인다(T6 프로시저).
// 펼침은 최대 20rem이고 넘치면 펼침 안에서 스크롤한다. 애니메이션 없이 바로 열린다(브리프 B3)
export function ClassPicker({
	voice,
	item,
	triggerRef,
	onLinked,
}: {
	voice: Voice;
	item: SavedVoice | undefined;
	triggerRef: RefObject<HTMLButtonElement | null>;
	// 붙임·뗌 알림(화면 밖 role=status, 브리프 B5)
	onLinked: (name: string, group: Group, on: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const regionId = useId();
	const searchId = useId();
	const searchRef = useRef<HTMLInputElement>(null);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [creating, setCreating] = useState(false);
	const link = useLinkVoice(voice);
	const { channels, classes, loaded, failed, retry } = useClassLists();
	const typed = query.trim();
	const tooLong = typed !== "" && nameProblem(typed) === "too_long";
	const lists = groupLists(channels, classes);
	const listOf = (group: Group) =>
		byName(lists[group]).filter(
			(entry) => typed === "" || foldName(entry.name).includes(foldName(typed)),
		);
	const selected = (group: Group) =>
		group === "channel"
			? (item?.channelIds ?? [])
			: (item?.classificationIds ?? []);
	const found = GROUPS.map(
		(group) => [group, listOf(group).length] as const,
	).filter(([, count]) => count > 0);

	function toggle(group: Group, entry: Named, on: boolean) {
		// 알림은 저장된 뒤에만(실패하면 실패 토스트만 남는다)
		link.mutate(
			{ group, id: entry.id, on },
			{ onSuccess: () => onLinked(entry.name, group, on) },
		);
	}
	function create(group: Group) {
		const name = typed;
		setCreating(true);
		void createAndFind(group, name, queryClient)
			.then((id) => {
				// 실패하면 쓴 이름을 남겨 다시 해 볼 수 있게 한다
				if (!id) return;
				toggle(group, { id, name }, true);
				setQuery("");
			})
			.finally(() => {
				setCreating(false);
				searchRef.current?.focus();
			});
	}
	function close() {
		setOpen(false);
		triggerRef.current?.focus();
	}

	return (
		<div className="flex flex-col gap-2">
			<Button
				ref={triggerRef}
				variant="link"
				size="lg"
				className="self-start"
				aria-expanded={open}
				aria-controls={regionId}
				onClick={() => {
					if (open) close();
					else setOpen(true);
				}}
			>
				<Plus aria-hidden="true" />
				분류 붙이기
			</Button>
			{open ? (
				// biome-ignore lint/a11y/noStaticElementInteractions: 안의 검색 칸·체크박스·버튼에서 올라오는 Esc 하나만 받는다(펼침 접기)
				<div
					id={regionId}
					// 패널 카드 안에 둥근 테두리 상자를 또 두지 않고 위쪽 구분선으로 나눈다(critique B1). 가로 4px 여백은 스크롤 칸이 검색 칸 포커스 고리를 자르지 않게 한다
					className="flex max-h-80 flex-col gap-3 overflow-y-auto overscroll-contain border-t px-1 pt-3"
					// 펼침만 접는다. 서랍(Sheet) 안에서도 서랍은 닫지 않는다(브리프 B3)
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.stopPropagation();
							close();
						}
					}}
				>
					<label htmlFor={searchId} className="sr-only">
						분류 찾기
					</label>
					<Input
						id={searchId}
						ref={searchRef}
						name="class-search"
						autoComplete="off"
						autoFocus
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder={LIBRARY_TEXT.pickerPlaceholder}
						className="min-h-11 shrink-0 rounded-xl text-base md:text-sm"
					/>
					{tooLong ? (
						<p className="text-sm text-warning">
							{fieldMessage("name", "too_long")}
						</p>
					) : null}
					{loaded && channels.length + classes.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							{LIBRARY_TEXT.pickerFirst}
						</p>
					) : null}
					<p role="status" className="sr-only">
						{typed
							? found
									.map(
										([group, count]) => `${GROUP_TEXT[group].label} ${count}개`,
									)
									.join(", ")
									.concat(found.length > 0 ? " 찾았어요" : "") ||
								LIBRARY_TEXT.noMatchName
							: ""}
					</p>
					{failed ? (
						<ReloadRow
							text={LIBRARY_TEXT.classesFailed}
							reloading={false}
							onReload={retry}
						/>
					) : !loaded ? (
						<p role="status" className="text-muted-foreground text-sm">
							불러오는 중이에요
						</p>
					) : (
						GROUPS.map((group) => {
							const list = listOf(group);
							const canCreate =
								typed !== "" &&
								nameProblem(typed) === null &&
								!sameName(lists[group], typed);
							return (
								<fieldset key={group} className="flex flex-col">
									<legend className="mb-1 font-bold text-muted-foreground text-sm">
										{GROUP_TEXT[group].label}
									</legend>
									{list.length === 0 ? (
										<p className="text-muted-foreground text-sm">
											{typed ? LIBRARY_TEXT.noMatchName : emptyMessage(group)}
										</p>
									) : null}
									{list.map((entry) => (
										// biome-ignore lint/a11y/noLabelWithoutControl: Base UI Checkbox는 label 안의 button이다
										<label
											key={entry.id}
											className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-muted"
										>
											<Checkbox
												checked={selected(group).includes(entry.id)}
												onCheckedChange={(checked) =>
													toggle(group, entry, checked === true)
												}
											/>
											<span className="min-w-0 break-words">{entry.name}</span>
										</label>
									))}
									{canCreate ? (
										<Button
											variant="ghost"
											size="lg"
											className="h-auto min-h-11 justify-start whitespace-normal text-left"
											focusableWhenDisabled
											disabled={creating}
											onClick={() => create(group)}
										>
											<Plus aria-hidden="true" />‘{typed}’{" "}
											{GROUP_TEXT[group].label} 만들기
										</Button>
									) : null}
								</fieldset>
							);
						})
					)}
				</div>
			) : null}
		</div>
	);
}
