"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type {
	ProviderId,
	VoiceSource,
} from "@tts-pilot-app/api/providers/contract";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@tts-pilot-app/ui/components/tabs";
import { Toggle } from "@tts-pilot-app/ui/components/toggle";
import { ToggleGroup } from "@tts-pilot-app/ui/components/toggle-group";
import { type ComponentProps, useRef, useState } from "react";

import { PROVIDER_LABEL } from "@/lib/connection-view";
import {
	initialList,
	type ServerList,
	type ServerProvider,
	withPeople,
	withSearch,
} from "@/lib/provider-conditions";
import { failureOf } from "@/lib/voice-failure";
import { typecastPeople } from "@/lib/voice-filter";
import { plain } from "@/lib/voice-view";

import { AllProviders, type AllState, EMPTY_ALL } from "./all-providers";
import { SignInNotice } from "./notice";
import {
	type AiryState,
	AiryVoiceList,
	airyListOptions,
	EMPTY_AIRY,
	EMPTY_GEMINI,
	type GeminiState,
	GeminiVoiceList,
	geminiListOptions,
	typecastListOptions,
} from "./one-list";
import { SamplePlayerProvider } from "./sample-player";
import { useSavedList } from "./saved-voices";
import { ServerVoiceList, serverListOptions } from "./server-voice-list";
import { sourceItem } from "./setting-fields";
import { TrialProvider } from "./trial-provider";
import {
	EMPTY_TYPECAST,
	type TypecastState,
	TypecastVoiceList,
} from "./typecast-voice-list";

type Tab = "all" | ProviderId;
type ListKey = `${ServerProvider}:${VoiceSource}`;

const SERVER_TABS: ServerProvider[] = ["elevenlabs", "fish_audio"];
// 탭 내용은 숨긴 채 남긴다(keepMounted). 패널 자체는 키보드 정지점이 아니다(브리프 9절 순서: 탭 → 출처 전환 → 검색)
const Panel = (props: ComponentProps<typeof TabsContent>) => (
	<TabsContent keepMounted tabIndex={-1} {...props} />
);

// 목록 아래쪽에서 눌렀어도 로그인 안내가 보이게 옮긴다
const showNotice = (node: HTMLElement | null) =>
	node?.scrollIntoView({ block: "nearest" });

// 내 계정 목록 첫 페이지의 인원. 조건을 바꿔 받는 중(placeholder)이면 앞 조건의 수라 보이지 않는다
function totalOf(query: {
	isPlaceholderData: boolean;
	data?: { pages: { total: number | null; totalExact: boolean }[] };
}): string | null {
	const first = query.isPlaceholderData ? undefined : query.data?.pages[0];
	if (first?.total == null) return null;
	return `${plain.format(first.total)}${first.totalExact ? "" : " 이상"}`;
}

// 한 목록으로 받는 탭(Typecast·Airy·Gemini)의 이름과 인원. 인원은 받은 뒤에만 보인다
const countedLabel = (
	provider: "typecast" | "airy" | "gemini",
	count: number | undefined,
) => (
	<>
		<span translate="no">{PROVIDER_LABEL[provider]}</span>
		{count === undefined ? null : (
			<span className="font-normal text-muted-foreground text-sm tabular-nums">
				{plain.format(count)}
			</span>
		)}
	</>
);

// 성우 캐스팅(브리프 5·9·13·14절): '전체'와 공급자 탭 다섯, ElevenLabs·Fish Audio 출처 전환, 탭마다 목록과 패널
export function VoiceCasting() {
	const [tab, setTab] = useState<Tab>("all");
	const tabListRef = useRef<HTMLDivElement>(null);
	// '전체' 탭의 적용된 검색어와 성별·연령. '모두 보기 →'가 그 공급자 탭으로 가져간다
	const [all, setAll] = useState<AllState>(EMPTY_ALL);
	// 탭마다 조건·출처·고른 성우를 따로 든다(같은 페이지 안, 브리프 9절). 탭 내용은 keepMounted라 검색 칸·대기 시각도 남는다
	const [sources, setSources] = useState<Record<ServerProvider, VoiceSource>>({
		elevenlabs: "public",
		fish_audio: "public",
	});
	const [lists, setLists] = useState<Record<ListKey, ServerList>>(() => ({
		"elevenlabs:public": initialList("elevenlabs", "public"),
		"elevenlabs:account": initialList("elevenlabs", "account"),
		"fish_audio:public": initialList("fish_audio", "public"),
		"fish_audio:account": initialList("fish_audio", "account"),
	}));
	const [typecast, setTypecast] = useState<TypecastState>(EMPTY_TYPECAST);
	const [airy, setAiry] = useState<AiryState>(EMPTY_AIRY);
	const [gemini, setGemini] = useState<GeminiState>(EMPTY_GEMINI);
	const [chosen, setChosen] = useState<Record<string, string | null>>({});
	const choose = (k: string) => ({
		chosen: chosen[k] ?? null,
		onChoose: (key: string) => setChosen((all) => ({ ...all, [k]: key })),
	});
	// '모두 보기 →'가 포커스를 넘길 목록 키(ElevenLabs·Fish Audio는 `${공급자}:public`, Typecast는 "typecast").
	// 그 목록이 인원 글자로 포커스를 옮기고 지운다(계획 리뷰 D8). 한 번 쓰고 없어지므로 다시 마운트된 목록이 포커스를 가져가지 않는다
	const [pendingFocus, setPendingFocus] = useState<
		ListKey | "typecast" | "airy" | "gemini" | null
	>(null);
	const clearFocus = () => setPendingFocus(null);
	// 탭 이름의 'Typecast 614'(받은 뒤 인원). '전체' 탭 Typecast 묶음·Typecast 탭과 같은 키라 따로 부르지 않는다
	const typecastList = useQuery({ ...typecastListOptions, enabled: false });
	// 탭 이름의 'Airy 104'. '전체' 탭 Airy 묶음·Airy 탭과 같은 키라 따로 부르지 않는다
	const airyList = useQuery({ ...airyListOptions, enabled: false });
	// 탭 이름의 'Gemini 147'. '전체' 탭 Gemini 묶음·Gemini 탭과 같은 키라 따로 부르지 않는다
	const geminiList = useQuery({ ...geminiListOptions, enabled: false });
	// 출처 칸 '내 계정 N'. 그 출처 목록과 같은 키의 캐시만 읽는다
	const elevenlabsAccount = useInfiniteQuery({
		...serverListOptions(lists["elevenlabs:account"]),
		enabled: false,
	});
	const fishAccount = useInfiniteQuery({
		...serverListOptions(lists["fish_audio:account"]),
		enabled: false,
	});
	const saved = useSavedList();
	const accountTotals: Record<ServerProvider, string | null> = {
		elevenlabs: totalOf(elevenlabsAccount),
		fish_audio: totalOf(fishAccount),
	};

	// 767px 이하 탭 줄은 가로로 넘친다. 탭을 바꾸면 고른 탭이 보이게 그 줄만 가로로 옮긴다(audit P2-2)
	function changeTab(next: Tab) {
		setTab(next);
		// 고른 탭은 굵어져 폭이 바뀐다. 그린 뒤에 옮긴다
		requestAnimationFrame(() =>
			tabListRef.current
				?.querySelector(`[data-tab="${next}"]`)
				?.scrollIntoView({ inline: "nearest", block: "nearest" }),
		);
	}

	// '전체' 묶음의 '모두 보기 →'(브리프 5·9절, 계획 리뷰 U4): 그 탭을 시작 조건(공개·한국어·기본 정렬)에 검색어·성별·연령을 더해 연다
	// (Airy·Gemini 탭은 성별만, 연령 조건이 없다). 그 탭에 전에 고른 조건은 풀린다. 포커스는 그 탭 상태 줄의 인원 글자로 간다
	function showProvider(provider: ProviderId) {
		changeTab(provider);
		const { search, gender, age } = all;
		const genders = gender === null ? [] : [gender];
		if (provider === "typecast") {
			setTypecast({
				query: search,
				filters: typecastPeople(gender, age),
				showAll: search === "",
			});
			setPendingFocus("typecast");
			return;
		}
		if (provider === "airy") {
			setAiry({ query: search, genders });
			setPendingFocus("airy");
			return;
		}
		if (provider === "gemini") {
			setGemini({
				query: search,
				filters: { ...EMPTY_GEMINI.filters, genders },
			});
			setPendingFocus("gemini");
			return;
		}
		const listKey: ListKey = `${provider}:public`;
		setSources((sources) => ({ ...sources, [provider]: "public" }));
		setLists((lists) => ({
			...lists,
			[listKey]: withPeople(
				withSearch(initialList(provider, "public"), search),
				gender,
				age,
			),
		}));
		setPendingFocus(listKey);
	}

	// 세션 만료: 탭과 조건 줄 대신 로그인 안내 하나다(T3). 처음 열리는 '전체' 탭이 늘 받는 Typecast 목록(같은 키)으로 판정한다.
	// 쓰던 문장을 든 TrialProvider는 남긴다
	if (failureOf(typecastList.error) === "unauthorized") {
		return (
			<SamplePlayerProvider>
				<TrialProvider>
					<SignInNotice />
				</TrialProvider>
			</SamplePlayerProvider>
		);
	}

	// 목록 밖 호출(별·담기·내 문장 듣기)의 401은 담은 성우 목록을 다시 받게 한다. 작업실과 같은 판정이고 쓰던 문장은 화면에 남긴다(audit C3)
	const signedOut = failureOf(saved.error) === "unauthorized";
	const typecastCount = typecastList.data?.voices.length;
	const airyCount = airyList.data?.voices.length;
	const geminiCount = geminiList.data?.voices.length;

	return (
		// 탭을 바꿔 그 탭의 행이 숨어도 재생은 이어진다. 페이지를 떠나면 멈춘다(T3)
		<SamplePlayerProvider>
			<TrialProvider>
				{signedOut ? (
					<div role="alert" ref={showNotice} className="mb-4">
						<SignInNotice />
					</div>
				) : null}
				<Tabs value={tab} onValueChange={changeTab} className="gap-4">
					{/* 767px 이하는 탭 줄만 가로로 넘긴다(페이지는 넘치지 않는다). 넘쳐서 더 있으면 오른쪽 끝이 흐리다(index.css tabs-overflow-fade). 스크롤바는 숨긴다.
				    방향키로 옮기고 Enter·Space로 연다(Base UI). 공급자 이름은 번역하지 않는다 */}
					<TabsList
						ref={tabListRef}
						className="tabs-overflow-fade overflow-x-auto"
					>
						<TabsTrigger value="all" data-tab="all">
							전체
						</TabsTrigger>
						<TabsTrigger value="typecast" data-tab="typecast">
							{countedLabel("typecast", typecastCount)}
						</TabsTrigger>
						{SERVER_TABS.map((p) => (
							<TabsTrigger key={p} value={p} data-tab={p}>
								<span translate="no">{PROVIDER_LABEL[p]}</span>
							</TabsTrigger>
						))}
						<TabsTrigger value="airy" data-tab="airy">
							{countedLabel("airy", airyCount)}
						</TabsTrigger>
						<TabsTrigger value="gemini" data-tab="gemini">
							{countedLabel("gemini", geminiCount)}
						</TabsTrigger>
					</TabsList>
					<Panel value="all">
						<AllProviders
							state={all}
							onStateChange={setAll}
							onShowProvider={showProvider}
							{...choose("all")}
						/>
					</Panel>
					<Panel value="typecast">
						<TypecastVoiceList
							state={typecast}
							onStateChange={setTypecast}
							{...choose("typecast")}
							focusRequested={pendingFocus === "typecast"}
							onFocusHandled={clearFocus}
						/>
					</Panel>
					{SERVER_TABS.map((p) => {
						const source = sources[p];
						const listKey: ListKey = `${p}:${source}`;
						return (
							<Panel key={p} value={p}>
								<div className="flex flex-col gap-4">
									<ToggleGroup
										value={[source]}
										// 하나 고르기. 고른 칸을 다시 눌러 비우는 것은 막는다
										onValueChange={(value) => {
											const next = value[0] as VoiceSource | undefined;
											if (next) setSources((all) => ({ ...all, [p]: next }));
										}}
										// 칸 글자가 '공개 라이브러리'·'내 계정'이라 그룹 이름만 단다(audit P2-3)
										aria-label="출처"
										className="bg-muted p-1"
									>
										<Toggle value="public" className={sourceItem}>
											공개 라이브러리
										</Toggle>
										<Toggle value="account" className={sourceItem}>
											내 계정
											{accountTotals[p] === null ? null : (
												<span className="font-normal text-muted-foreground tabular-nums">
													{accountTotals[p]}
												</span>
											)}
										</Toggle>
									</ToggleGroup>
									{/* 출처마다 새 목록이다(앞 출처의 목록이 흐리게 끼워지지 않고 검색 칸 상태도 따로다) */}
									<ServerVoiceList
										key={listKey}
										list={lists[listKey]}
										onListChange={(list) =>
											setLists((all) => ({ ...all, [listKey]: list }))
										}
										{...choose(listKey)}
										focusRequested={pendingFocus === listKey}
										onFocusHandled={clearFocus}
									/>
								</div>
							</Panel>
						);
					})}
					<Panel value="airy">
						<AiryVoiceList
							state={airy}
							onStateChange={setAiry}
							{...choose("airy")}
							focusRequested={pendingFocus === "airy"}
							onFocusHandled={clearFocus}
						/>
					</Panel>
					<Panel value="gemini">
						<GeminiVoiceList
							state={gemini}
							onStateChange={setGemini}
							{...choose("gemini")}
							focusRequested={pendingFocus === "gemini"}
							onFocusHandled={clearFocus}
						/>
					</Panel>
				</Tabs>
			</TrialProvider>
		</SamplePlayerProvider>
	);
}
