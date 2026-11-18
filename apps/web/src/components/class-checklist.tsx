"use client";

import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import {
	type ClassificationKind,
	nameProblem,
} from "@tts-pilot-app/api/classification-rules";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Checkbox } from "@tts-pilot-app/ui/components/checkbox";
import { Input } from "@tts-pilot-app/ui/components/input";
import { Plus } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import {
	byName,
	emptyMessage,
	fieldMessage,
	GROUP_TEXT,
	type Group,
	groupLists,
	MESSAGES,
	type Named,
	saveFailure,
} from "@/lib/classes-view";
import { foldName, LIBRARY_TEXT, sameName } from "@/lib/saved-voice-view";
import { client, OWNED_LIST, orpc } from "@/utils/orpc";

import { invalidateClasses, useClassLists } from "./saved-voices";
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

// 검색·그룹·체크·'+ 만들기'를 그리는 controlled 목록(T12 계획 2.3). 무엇을 저장하는지는 모른다:
// 체크가 바뀌면 onToggle(group, 항목, 켬 여부)을 부르고, 만들기는 만든 항목을 켠 채로 onToggle에 넘긴다.
// 성우 연결은 ClassPicker, 대본 저장은 ScriptSaveDialog가 이 위에 붙인다. 펼침·스크롤 칸은 부른 쪽이 정한다
export function ClassChecklist({
	groups,
	selected,
	onToggle,
	autoFocus = false,
}: {
	groups: readonly Group[];
	selected: Record<Group, readonly string[]>;
	onToggle: (group: Group, entry: Named, on: boolean) => void;
	autoFocus?: boolean;
}) {
	const queryClient = useQueryClient();
	const searchId = useId();
	const searchRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const [creating, setCreating] = useState(false);
	const { channels, classes, loaded, failed, retry } = useClassLists();
	const typed = query.trim();
	const tooLong = typed !== "" && nameProblem(typed) === "too_long";
	const lists = groupLists(channels, classes);
	const listOf = (group: Group) =>
		byName(lists[group]).filter(
			(entry) => typed === "" || foldName(entry.name).includes(foldName(typed)),
		);
	const found = groups
		.map((group) => [group, listOf(group).length] as const)
		.filter(([, count]) => count > 0);
	const total = groups.reduce((sum, group) => sum + lists[group].length, 0);

	function create(group: Group) {
		const name = typed;
		setCreating(true);
		void createAndFind(group, name, queryClient)
			.then((id) => {
				// 실패하면 쓴 이름을 남겨 다시 해 볼 수 있게 한다
				if (!id) return;
				onToggle(group, { id, name }, true);
				setQuery("");
			})
			.finally(() => {
				setCreating(false);
				searchRef.current?.focus();
			});
	}

	return (
		<div className="flex flex-col gap-3">
			<label htmlFor={searchId} className="sr-only">
				분류 찾기
			</label>
			<Input
				id={searchId}
				ref={searchRef}
				name="class-search"
				autoComplete="off"
				autoFocus={autoFocus}
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
			{loaded && total === 0 ? (
				<p className="text-muted-foreground text-sm">
					{LIBRARY_TEXT.pickerFirst}
				</p>
			) : null}
			<p role="status" className="sr-only">
				{typed
					? found
							.map(([group, count]) => `${GROUP_TEXT[group].label} ${count}개`)
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
				groups.map((group) => {
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
										checked={selected[group].includes(entry.id)}
										onCheckedChange={(checked) =>
											onToggle(group, entry, checked === true)
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
									<Plus aria-hidden="true" />‘{typed}’ {GROUP_TEXT[group].label}{" "}
									만들기
								</Button>
							) : null}
						</fieldset>
					);
				})
			)}
		</div>
	);
}
