// apps/web/src/components/studio-editor.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import type { Preset } from "@tts-pilot-app/api/preset-contract";
import { DropdownMenuItem } from "@tts-pilot-app/ui/components/dropdown-menu";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import Link from "next/link";
import { useRef, useState } from "react";

import { byName } from "@/lib/classes-view";
import { PRESET_TEXT } from "@/lib/preset-view";
import { channelDefaultOf, STUDIO_TEXT } from "@/lib/studio-view";
import { failureOf } from "@/lib/voice-failure";
import { OWNED_LIST, orpc } from "@/utils/orpc";

import { LoopbackNotice } from "./notice";
import { PageHeader } from "./page-header";
import {
	LoadDialog,
	PresetLine,
	PresetMenu,
	usePresetLoad,
} from "./preset-menu";
import { usePresetList } from "./presets";
import { SamplePlayerProvider } from "./sample-player";
import { useSavedList } from "./saved-voices";
import { StudioBar } from "./studio-bar";
import { StudioCard } from "./studio-card";
import { StudioProvider, useStudio } from "./studio-provider";
import { StudioResults } from "./studio-results";
import { menuItem, RadioMenu } from "./voice-conditions";

// 채널 고르기(브리프 5.2, 프리셋 저장 창 채널 칸과 같은 말): '채널 없음'이 맨 위, 나머지는 이름순. 받는 중이면 잠긴다.
// 메뉴 끝: 채널이 없으면 '채널·분류에서 만들기', 받지 못하면 경고색 줄(누르면 다시 받는다). 둘 다 메뉴 항목이라 키보드로 닿는다.
// 그 채널의 Typecast 기본 프리셋이 있으면 T8 불러오기 창으로 바뀌는 값을 보이고 '불러오기'로 적용한다. 없으면 채널만 바뀐다
function ChannelPicker() {
	const studio = useStudio();
	const channels = useQuery(orpc.channelList.queryOptions(OWNED_LIST));
	const presets = usePresetList();
	const load = usePresetLoad(studio.presetHost);
	const [asking, setAsking] = useState<Preset | null>(null);
	const boxRef = useRef<HTMLDivElement>(null);
	// 불러오기 창이 닫히면 채널 버튼으로 돌아간다(브리프 7절). RadioMenu가 버튼 ref를 내주지 않아 감싼 칸에서 찾는다
	const openerRef = useRef<HTMLElement | null>(null);
	const list = byName(channels.data ?? []);
	// 첫 받기 실패는 실패 횟수로 본다. 데이터 없이 다시 받으면 TanStack이 status를 pending으로 되돌려,
	// isPending·isError로 보면 메뉴가 열린 채 버튼이 잠기고 경고 항목이 사라진다(포커스를 쥔 항목이 없어진다)
	const failed = !channels.data && channels.errorUpdateCount > 0;
	// 지운 채널을 기억하고 있으면 '채널 없음'으로 보인다(렌더 중 계산)
	const value = list.some((channel) => channel.id === studio.channelId)
		? (studio.channelId ?? "")
		: "";
	return (
		// contents: 머리 동작 묶음(flex-wrap)의 배치에 끼어들지 않는다
		<div ref={boxRef} className="contents">
			<RadioMenu
				label={STUDIO_TEXT.channel}
				value={value}
				strong={value !== ""}
				align="start"
				// 첫 받기 중에만 잠근다(그때는 메뉴를 열 수 없다)
				disabled={channels.isPending && !failed}
				options={[
					{ value: "", label: STUDIO_TEXT.noChannel },
					...list.map((channel) => ({
						value: channel.id,
						label: channel.name,
					})),
				]}
				onChange={(id) => {
					studio.setChannelId(id === "" ? null : id);
					const preset =
						id === "" ? null : channelDefaultOf(presets.data ?? [], id);
					if (!preset) return;
					openerRef.current = boxRef.current?.querySelector("button") ?? null;
					setAsking(preset);
				}}
				footer={
					channels.isSuccess && list.length === 0 ? (
						<DropdownMenuItem
							className={menuItem}
							render={<Link href="/classes" />}
						>
							{STUDIO_TEXT.toClasses}
						</DropdownMenuItem>
					) : failed ? (
						// 경고 줄도 메뉴 항목이라 키보드로 닿는다. 누르면 메뉴를 닫지 않고 다시 받는다(받으면 채널이 위에 나타난다).
						// 다시 받는 동안에도 같은 항목이 남아(스피너·aria-busy) 포커스를 지킨다. 연타는 진행 중 받기를 끊지 않게 거른다
						<DropdownMenuItem
							className={cn(menuItem, "flex-col items-start gap-0.5")}
							closeOnClick={false}
							aria-busy={channels.isFetching || undefined}
							onClick={() => {
								if (!channels.isFetching) void channels.refetch();
							}}
						>
							<span className="text-warning">{PRESET_TEXT.channelsFailed}</span>
							<span className="flex items-center gap-2 text-muted-foreground">
								{channels.isFetching ? <Spinner aria-hidden="true" /> : null}
								{PRESET_TEXT.retry}
							</span>
						</DropdownMenuItem>
					) : null
				}
			/>
			{asking ? (
				<LoadDialog
					preset={asking}
					view={studio.presetHost.loadView(asking)}
					openerRef={openerRef}
					onLoad={async () => {
						await load(asking);
						setAsking(null);
					}}
					onClose={() => setAsking(null)}
				/>
			) : null}
		</div>
	);
}

// 머리(제목·채널·'프리셋', 설명 아래) → 열(최대 896px, 왼쪽 정렬): 불러온 프리셋 줄 → 문단 카드 → 하단 막대 → 이전 결과.
// 막대는 화면 바닥에 고정되지만 DOM은 카드 바로 뒤라 Tab이 이전 결과를 지나지 않고 주 버튼에 닿는다(DN-1).
// 열 바닥 여백은 막대 높이 + 24px(studio-bar-space). 임시 작업을 읽기 전에는 카드 자리에 뼈대를 둔다(계획 '스펙과 다른 점' 14)
function StudioBody() {
	const studio = useStudio();
	const mainRef = useRef<HTMLButtonElement>(null);
	const resultsRef = useRef<HTMLHeadingElement>(null);
	return (
		<>
			<PageHeader
				title={STUDIO_TEXT.title}
				description={STUDIO_TEXT.description}
				actions={
					<>
						<ChannelPicker />
						{/* 채널 고르기와 같은 무채색 조건 버튼(채운 청록·청록 테두리는 막대 주 버튼 쪽, critique P2-3) */}
						<PresetMenu host={studio.presetHost} trigger="condition" />
					</>
				}
			/>
			<div className="studio-bar-space px-4 md:px-11">
				<div className="flex max-w-4xl flex-col gap-5">
					<PresetLine host={studio.presetHost} />
					{studio.restored ? (
						<StudioCard />
					) : (
						<Skeleton aria-hidden="true" className="h-56 w-full rounded-2xl" />
					)}
					<StudioBar mainRef={mainRef} resultsRef={resultsRef} />
					<StudioResults headRef={resultsRef} mainRef={mainRef} />
				</div>
			</div>
		</>
	);
}

// 음성 작업실(T9 스펙 4절). 소유자가 없으면 머리와 주소 안내 하나다(담은 성우 목록의 UNAUTHORIZED로 판정, /voices와 같다)
export function StudioEditor() {
	const saved = useSavedList();
	if (failureOf(saved.error) === "unauthorized")
		return (
			<>
				<PageHeader
					title={STUDIO_TEXT.title}
					description={STUDIO_TEXT.description}
				/>
				<div className="px-4 pb-10 md:px-11">
					<LoopbackNotice title={STUDIO_TEXT.loopback} />
				</div>
			</>
		);
	return (
		<SamplePlayerProvider>
			<StudioProvider>
				<StudioBody />
			</StudioProvider>
		</SamplePlayerProvider>
	);
}
