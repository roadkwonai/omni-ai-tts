"use client";

import {
	type UseQueryResult,
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type {
	ProviderId,
	Voice,
	VoiceListResult,
} from "@tts-pilot-app/api/providers/contract";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	type Dispatch,
	type ReactNode,
	type RefObject,
	type SetStateAction,
	useRef,
	useState,
} from "react";

import { PROVIDER_LABEL } from "@/lib/connection-view";
import { keepFirstPage } from "@/lib/list-query";
import {
	initialList,
	type ServerProvider,
	withPeople,
	withSearch,
} from "@/lib/provider-conditions";
import {
	AGE_KEY_LABEL,
	GENDER_LABEL,
	hasConditions,
	labelOf,
	oneListFound,
} from "@/lib/voice-filter";
import { bundleOf } from "@/lib/voice-view";

import { CastingWorkspace } from "./casting-workspace";
import { SignInNotice } from "./notice";
import { ONE_LIST_OPTIONS } from "./one-list";
import { serverListOptions } from "./server-voice-list";
import { VoiceConditions } from "./voice-conditions";
import {
	RowSkeleton,
	StaleNotice,
	useSearchCommit,
	VoiceShelf,
} from "./voice-list-parts";
import { Problem, useListRecovery } from "./voice-problem";
import { RowList, type Select } from "./voice-row";

// '전체' 탭의 적용된 검색어와 공통 성별·연령 키(브리프 5절). 부모가 든다('모두 보기 →'가 그 공급자 탭으로 가져간다)
export type AllState = {
	search: string;
	gender: string | null;
	age: string | null;
};
export const EMPTY_ALL: AllState = { search: "", gender: null, age: null };
const picked = (value: string | null) => (value === null ? [] : [value]);
const people = ({ gender, age }: AllState) => ({
	gender: picked(gender),
	age: picked(age),
});
// 다섯 공급자에 공통인 값만(브리프 5절 '전체' 탭)
const choices = (labels: Map<string, string>, values: string[]) =>
	values.map((value) => ({ value, label: labelOf(labels, value) }));
const GENDER_OPTIONS = choices(GENDER_LABEL, ["female", "male"]);
const AGE_OPTIONS = choices(AGE_KEY_LABEL, ["young", "middle", "old"]);

const NO_MATCH = "조건에 맞는 성우가 없어요";

// 묶음 하나(브리프 5·8절 '전체' 탭)
type Bundle = {
	provider: ProviderId;
	query: Pick<
		UseQueryResult,
		"error" | "isError" | "isFetching" | "isRefetching" | "isRefetchError"
	>;
	// 지금 검색어의 첫 페이지(Typecast는 목록 하나). 받기 전이면 없다
	first: VoiceListResult | undefined;
	// 받는 중(공급자 탭이 같은 키로 받는 다음 페이지는 빼고)
	busy: boolean;
	voices: Voice[];
	countLabel: string | null;
	// 0명일 때 본문 한 줄
	emptyText: string;
	// 첫 페이지를 다시 받는다. 성공하면 그 페이지, 실패하면 undefined
	reload: () => Promise<VoiceListResult | undefined>;
};

// Typecast·Airy·Gemini 탭과 같은 쿼리(목록 하나)를 브라우저에서 거른다. 거르기는 그 탭과 같다(oneListFound)
// (묶음 인원과 '모두 보기 →' 뒤 탭 인원이 같다, 계획 리뷰 R4-5)
function useOneListBundle(
	provider: "typecast" | "airy" | "gemini",
	state: AllState,
): Bundle {
	const query = useQuery(ONE_LIST_OPTIONS[provider]);
	const all = query.data?.voices ?? [];
	const found = oneListFound(provider, all, state);
	return {
		provider,
		query,
		first: query.data,
		busy: query.isFetching,
		...bundleOf(found, {
			total: query.data ? found.length : null,
			totalExact: true,
			of: hasConditions(state.search, people(state)) ? all.length : undefined,
		}),
		// 연령으로 0명이 된 까닭을 그 묶음에서 바로 알린다(브리프 5절, critique P1)
		emptyText:
			provider !== "typecast" && state.age !== null
				? `${PROVIDER_LABEL[provider]}는 연령 정보가 없어 연령으로 찾을 수 없어요`
				: NO_MATCH,
		reload: () =>
			query
				.refetch({ cancelRefetch: false })
				.then((result) => (result.isError ? undefined : result.data)),
	};
}

// 공급자 탭의 시작 조건(공개·한국어·기본 정렬) + 검색어·성별·연령과 같은 쿼리 인자라 브라우저 키가 같다(계획 리뷰 E15). 첫 페이지만 보인다
function useServerBundle(
	provider: ServerProvider,
	{ search, gender, age }: AllState,
): Bundle {
	const queryClient = useQueryClient();
	const options = serverListOptions(
		withPeople(
			withSearch(initialList(provider, "public"), search),
			gender,
			age,
		),
	);
	// 검색어를 바꿔 받는 동안 앞 검색어의 묶음을 끼우지 않고 뼈대를 보인다(브리프 8절).
	// placeholderData는 관찰자 옵션이라 끄더라도 키는 공급자 탭과 같다
	const query = useInfiniteQuery({ ...options, placeholderData: undefined });
	const first = query.data?.pages[0];
	return {
		provider,
		query,
		first,
		busy: query.isFetching && !query.isFetchingNextPage,
		...bundleOf(first?.voices ?? [], {
			total: first?.total ?? null,
			totalExact: first?.totalExact ?? true,
		}),
		emptyText: NO_MATCH,
		reload: () => {
			// 공급자 탭이 같은 키에 이어 붙인 페이지를 모두 다시 부르지 않는다(첫 페이지만)
			keepFirstPage(queryClient, { queryKey: options.queryKey, exact: true });
			return query
				.refetch({ cancelRefetch: false })
				.then((result) => (result.isError ? undefined : result.data?.pages[0]));
		},
	};
}

// 묶음 하나: 지난 목록이면 묶음 위 안내 줄, 머리(이름·인원·'모두 보기 →')는 늘, 본문은 사유 안내·뼈대·0명 한 줄·앞 5명 행 중 하나.
// 한 묶음의 상태가 다른 묶음을 바꾸지 않는다(AC2, REQ-02)
function ProviderBundle({
	bundle,
	onShowAll,
	searchRef,
	selectedKey,
	select,
	panelId,
}: {
	bundle: Bundle;
	onShowAll: () => void;
	searchRef: RefObject<HTMLInputElement | null>;
	selectedKey: string | null;
	select: Select;
	panelId?: string;
}) {
	const { provider, query, first } = bundle;
	const label = PROVIDER_LABEL[provider];
	const { unauthorized, problem, notice, retryAt, reload } = useListRecovery({
		query,
		first,
		refetch: bundle.reload,
		searchRef,
	});

	const shelf = (body: ReactNode) => (
		<VoiceShelf
			title={label}
			countLabel={bundle.countLabel}
			busy={bundle.busy}
			showAllLabel={`${label} 모두 보기`}
			onShowAll={onShowAll}
		>
			{body}
		</VoiceShelf>
	);
	// 세션 만료는 페이지가 탭 대신 로그인 안내로 바꾼다(Typecast 쿼리). 그 전에 이 묶음이 먼저 받으면 같은 안내를 본문에 보인다
	if (unauthorized) return shelf(<SignInNotice />);

	return (
		<div className="flex flex-col gap-3">
			{notice ? (
				<StaleNotice
					provider={provider}
					fetchedAt={notice.fetchedAt}
					reason={notice.reason}
					retryAt={retryAt}
					reloading={query.isFetching}
					onReload={reload}
				/>
			) : null}
			{shelf(
				problem ? (
					<Problem
						compact
						provider={provider}
						failure={problem.failure}
						reloading={query.isFetching}
						onReload={reload}
						retryAt={problem.retryAt}
					/>
				) : !first ? (
					<RowSkeleton announce={false} />
				) : bundle.voices.length === 0 ? (
					// 해제 수단은 조건 줄 끝의 '조건 모두 해제'와 검색 칸의 ×라 묶음에는 두지 않는다
					<p className="text-muted-foreground">{bundle.emptyText}</p>
				) : (
					<RowList
						voices={bundle.voices}
						selectedKey={selectedKey}
						select={select}
						panelId={panelId}
						// 같은 키를 다시 받는 동안 지금 행은 흐리게 두고 누를 수 없다(브리프 8절)
						refreshing={query.isRefetching}
					/>
				),
			)}
		</div>
	);
}

// '전체' 탭(브리프 5·8절, 스펙 AC2): 검색 칸과 공통 성별·연령, 공급자 묶음 다섯(Typecast → ElevenLabs → Fish Audio → Airy → Gemini), 오른쪽 패널.
// 검색어·성별·연령은 부모가 든다('모두 보기 →'가 그 공급자 탭으로 가져간다)
export function AllProviders({
	state,
	onStateChange,
	onShowProvider,
	chosen,
	onChoose,
}: {
	state: AllState;
	onStateChange: Dispatch<SetStateAction<AllState>>;
	onShowProvider: (provider: ProviderId) => void;
	chosen: string | null;
	onChoose: (key: string) => void;
}) {
	const searchRef = useRef<HTMLInputElement>(null);
	// 검색·성별·연령을 한 번이라도 바꿨다. 처음 받은 인원은 알리지 않는다(첫 로딩은 '불러오고 있어요' 한 번)
	const [touched, setTouched] = useState(false);
	function change(update: SetStateAction<AllState>) {
		setTouched(true);
		onStateChange(update);
	}
	const draft = useSearchCommit(state.search, (search) =>
		change((all) => ({ ...all, search })),
	);
	const typecast = useOneListBundle("typecast", state);
	const elevenlabs = useServerBundle("elevenlabs", state);
	const fishAudio = useServerBundle("fish_audio", state);
	const airy = useOneListBundle("airy", state);
	const gemini = useOneListBundle("gemini", state);
	const bundles = [typecast, elevenlabs, fishAudio, airy, gemini];
	// 받기 전인 묶음이 있다(사유 안내가 뜬 묶음은 빼고). 묶음 뼈대는 알리지 않고 여기서 한 번만 알린다(첫 로딩이 다섯 번 읽히지 않게)
	const pending = bundles.some(
		(bundle) => !bundle.first && !bundle.query.isError,
	);
	const chosenPeople = people(state);
	// 처음 불러오는 중에만 잠근다(계획 리뷰 D4). 기준은 키가 바뀌지 않는 Typecast 목록이다.
	// 서버 묶음은 조건마다 새 키라 받는 중을 기준으로 삼으면 입력 중에 칸이 잠긴다
	const locked = !typecast.first && typecast.query.isFetching;
	// 다섯 묶음이 모두 받았거나 실패로 끝났다. 그 뒤에만 묶음별 인원을 한 문장으로 알린다(받는 중에는 비워 두어 끝난 뒤 한 번 읽힌다)
	const settled = bundles.every(
		(bundle) => (bundle.first || bundle.query.isError) && !bundle.busy,
	);
	const summary = bundles
		.map(
			(bundle) =>
				`${PROVIDER_LABEL[bundle.provider]} ${bundle.countLabel ?? "불러오지 못함"}`,
		)
		.join(", ");
	// 걸린 축만 이름을 댄다(브리프 5절, critique P3)
	const applied = [
		state.gender === null ? null : "성별",
		state.age === null ? null : "연령",
	]
		.filter((name) => name !== null)
		.join("·");

	function clearAll() {
		// 아직 보내지 않은 검색어도 지운다(적용된 검색어가 이미 비었으면 칸이 따라 바뀌지 않는다)
		draft.setDraft("");
		change(EMPTY_ALL);
		searchRef.current?.focus();
	}

	return (
		<div className="flex flex-col gap-4">
			{pending ? (
				<span className="sr-only" role="status">
					성우 목록을 불러오고 있어요
				</span>
			) : null}
			{/* 조건 줄 끝의 '조건 모두 해제'(브리프 5절, 상태 줄이 없다). 조건 줄이 남는 폭을 채우고, 좁으면 해제 링크가 다음 줄로 내려간다 */}
			<div className="flex flex-wrap items-center gap-2 [&>search]:min-w-0 [&>search]:grow [&>search]:basis-80">
				<VoiceConditions
					search={{
						value: draft.draft,
						placeholder: "이름으로 찾기",
						label: "모든 음성 서비스의 성우 이름으로 찾기",
						onChange: draft.setDraft,
						onSubmit: draft.submit,
					}}
					// 각각 하나만 고른다. 값은 공통 키이고 묶음마다 그 공급자 값으로 바꿔 건다
					axes={[
						{
							kind: "single",
							key: "gender",
							label: "성별",
							options: GENDER_OPTIONS,
							selected: chosenPeople.gender,
							onChange: ([gender]) =>
								change((all) => ({ ...all, gender: gender ?? null })),
						},
						{
							kind: "single",
							key: "age",
							label: "연령",
							options: AGE_OPTIONS,
							selected: chosenPeople.age,
							onChange: ([age]) =>
								change((all) => ({ ...all, age: age ?? null })),
						},
					]}
					disabled={locked}
					selectedCount={chosenPeople.gender.length + chosenPeople.age.length}
					searchRef={searchRef}
				/>
				{hasConditions(state.search, chosenPeople) ? (
					<Button variant="link" size="lg" onClick={clearAll}>
						조건 모두 해제
					</Button>
				) : null}
			</div>
			{applied ? (
				<p className="text-muted-foreground text-sm">
					다섯 음성 서비스 모두에 {applied} 조건을 적용했어요
				</p>
			) : null}
			<p className="sr-only" role="status">
				{touched && settled ? summary : ""}
			</p>
			<CastingWorkspace
				// 다섯 묶음의 앞 5명을 보이는 순서대로 잇는다
				voices={bundles.flatMap((bundle) => bundle.voices)}
				chosen={chosen}
				onChoose={onChoose}
				pending={pending}
			>
				{({ selectedKey, select, panelId }) => (
					<div className="flex flex-col gap-10">
						{bundles.map((bundle) => (
							<ProviderBundle
								key={bundle.provider}
								bundle={bundle}
								onShowAll={() => onShowProvider(bundle.provider)}
								searchRef={searchRef}
								selectedKey={selectedKey}
								select={select}
								panelId={panelId}
							/>
						))}
					</div>
				)}
			</CastingWorkspace>
		</div>
	);
}
