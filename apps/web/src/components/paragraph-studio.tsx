// apps/web/src/components/paragraph-studio.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { familyOf } from "@tts-pilot-app/api/drama-acting";
import { unsentCount } from "@tts-pilot-app/api/paragraph-tags";
import type { Preset } from "@tts-pilot-app/api/preset-contract";
import {
	comboSignature,
	DEFAULT_SETTINGS,
	PARAGRAPHS_MAX,
} from "@tts-pilot-app/api/providers/trial-options";
import { DropdownMenuItem } from "@tts-pilot-app/ui/components/dropdown-menu";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import Link from "next/link";
import {
	type RefObject,
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { byName } from "@/lib/classes-view";
import type { ParagraphStatus } from "@/lib/make-all";
import {
	batchSpeaker,
	blockOf,
	followDefault,
	followedSpeaker,
	followOf,
	idleSpeakerCount,
	insertAfter,
	mergeNext,
	move,
	ownSettings,
	type Paragraph,
	pasteAt,
	removeAt,
	sameVoice,
	setupRequest,
	splitAt,
	voiceOf,
	type Work,
} from "@/lib/paragraph-script";
import { PRESET_TEXT } from "@/lib/preset-view";
import { gapText } from "@/lib/sound-join";
import {
	blockText,
	failShortOf,
	makeProblemText,
	PARAGRAPH_TEXT,
	unknownExpiredOf,
} from "@/lib/studio-text";
import {
	channelDefaultOf,
	STUDIO_TEXT,
	savedOf,
	unknownRefetch,
} from "@/lib/studio-view";
import { insertTagSpaced } from "@/lib/tag-view";
import { needsConfirm } from "@/lib/trial-view";
import { failureOf } from "@/lib/voice-failure";
import { OWNED_LIST, orpc } from "@/utils/orpc";

import { GAP_HELP_ID } from "./drama-gap";
import { SignInNotice } from "./notice";
import { NumberReview } from "./number-review";
import { PageHeader } from "./page-header";
import { ParagraphAutoTag } from "./paragraph-autotag";
import { ParagraphBar } from "./paragraph-bar";
import { type CardActions, ParagraphCard } from "./paragraph-card";
import { focusText, paragraphTextId } from "./paragraph-focus";
import { useParagraphs, useWork, WorkProvider } from "./paragraph-provider";
import {
	ParagraphCount,
	WorkBand,
	WorkSettings,
	WorkSummary,
} from "./paragraph-rails";
import {
	focusSelectToggle,
	ParagraphSelectBar,
	SelectToggle,
} from "./paragraph-select-bar";
import {
	LoadDialog,
	type PresetHost,
	PresetMenu,
	usePresetLoad,
} from "./preset-menu";
import { usePresetList } from "./presets";
import { SamplePlayerProvider } from "./sample-player";
import { useSavedList } from "./saved-voices";
import { ScriptMenu } from "./script-menu";
import { menuItem, RadioMenu } from "./voice-conditions";

// 문단 작업실(T10 스펙 5.1, 브리프 docs/briefs/studio.md 5·6·7절). 본문 래퍼가 컨테이너이고 안쪽 격자(studio-grid)가 3·2·1단을 바꾼다.
// DOM은 폭과 상관없이 하나이고 JS는 배치를 바꾸지 않는다(폭마다 DOM을 바꾸면 작업 설정이 다시 마운트되어 열린 대화상자·입력·포커스를 잃는다).
// 순서: 머리 → 건너뛰기 링크 둘 → 작업 띠(1단) → 작업 설정 aside → 문단 목록·막대 → 작업 요약 aside. CSS order는 쓰지 않고 격자 행·열로만 놓는다.
// 3단(@6xl): 작업 설정 왼쪽 열 · 목록 가운데 · 작업 요약 오른쪽 열(포커스 순서 = 시각 순서).
// 2단(@4xl): 목록이 왼쪽 열, 오른쪽 열에 작업 요약(위) → 작업 설정(아래)을 쌓는다. 한계: 시각 순서가 요약 위·설정 아래라 Tab은 설정 → 목록 → 요약이 된다
// (요약을 위에 두는 것이 진행·사용량을 먼저 보이는 쪽이다. 순수 CSS로 DOM 순서를 어기지 않고 이 둘을 모두 만족하는 배치는 없다). 1단: aside 둘은 숨는다(작업 띠가 맡는다).
// 행은 index.css의 studio-grid가 2단부터 머리 · 머리 아래 · 나머지(1fr) 셋으로 정한다. 2단 배치: 머리 c1·r1, 요약 c2·r1~2(머리 옆에서 시작), 목록·막대 c1·r2~3, 설정 c2·r3.
// 3단은 두 레일이 r1~3을 덮어 행 높이에 끼어들지 않는다(1fr 행을 지나는 칸은 앞 행을 키우지 않는다)

// 건너뛰기 링크(화면 밖, 포커스 때 보임). 본문 래퍼(relative)가 위치의 기준이다
const SKIP_LINK =
	"absolute top-2 left-4 z-50 rounded-lg bg-card px-4 py-3 outline-ring not-focus:sr-only focus:outline-2";
// 레일 칸: 3단은 머리 제목과 위를 맞추고(44px) 위에 붙어 따라온다. 스크롤 칸이 포커스 윤곽을 자르지 않게 4px 여백
const RAIL = "hidden @4xl:block @4xl:-mx-1 @4xl:p-1";
const RAIL_STICKY = "@6xl:studio-rail-sticky @6xl:mt-10";

// 채널 고르기(브리프 5.2). 고른 채널에 기본 프리셋이 있으면 T8 불러오기 창으로 기본 성우에 적용한다(공급자 제한 없음).
// 메뉴 끝: 채널이 없으면 '채널·분류에서 만들기', 받지 못하면 경고색 줄(누르면 다시 받는다). 첫 받기 실패는 실패 횟수로 본다(교훈 2026-10-21)
function ChannelPicker({ host }: { host: PresetHost }) {
	const work = useWork();
	const channels = useQuery(orpc.channelList.queryOptions(OWNED_LIST));
	const presets = usePresetList();
	const load = usePresetLoad(host);
	const [asking, setAsking] = useState<Preset | null>(null);
	const boxRef = useRef<HTMLDivElement>(null);
	// 불러오기 창이 닫히면 채널 버튼으로 돌아간다. RadioMenu가 버튼 ref를 내주지 않아 감싼 칸에서 찾는다
	const openerRef = useRef<HTMLElement | null>(null);
	const list = byName(channels.data ?? []);
	const failed = !channels.data && channels.errorUpdateCount > 0;
	const { channelId } = work.work;
	// 지운 채널을 기억하고 있으면 '채널 없음'으로 보인다
	const value = list.some((channel) => channel.id === channelId)
		? (channelId ?? "")
		: "";
	return (
		// contents: 머리 동작 묶음(flex-wrap)의 배치에 끼어들지 않는다
		<div ref={boxRef} className="contents">
			<RadioMenu
				label={STUDIO_TEXT.channel}
				value={value}
				strong={value !== ""}
				align="start"
				disabled={channels.isPending && !failed}
				options={[
					{ value: "", label: STUDIO_TEXT.noChannel },
					...list.map((channel) => ({
						value: channel.id,
						label: channel.name,
					})),
				]}
				onChange={(id) => {
					work.setChannelId(id === "" ? null : id);
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
					view={host.loadView(asking)}
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

// 대본 칸 요소(없으면 null)
const textField = (id: string) => {
	const element = document.getElementById(paragraphTextId(id));
	return element instanceof HTMLTextAreaElement ? element : null;
};

// 카드 고침(브리프 5.4 ⋯ 메뉴, 7절 포커스, 8절 단축키). 판단은 lib 순수 함수(splitAt·mergeNext·sameVoice·pasteAt·…)만 부른다.
// 이벤트에서 최신 문단·작업을 ref로 읽어 늘 같은 함수다(카드 props, advanced-event-handler-refs)
function useCardActions(
	setOpenId: (update: (open: string | null) => string | null) => void,
	// 마지막으로 '만들기'를 누른 카드(막대의 문단 하나 확인 창이 닫힐 때 돌아갈 숨은 제목)
	madeFrom: RefObject<string | null>,
	setTagTarget: (id: string) => void,
	pick: CardActions["pick"],
): CardActions {
	const work = useWork();
	const { paragraphs, edit, setText } = useParagraphs();
	const latest = useRef(paragraphs);
	const workRef = useRef(work);
	// 태그 대상 문단의 마지막 커서. 입력·선택마다 바뀌므로 다시 그리지 않는 ref에 둔다(rerender-use-ref-transient-values)
	const caretRef = useRef<{ id: string; start: number; end: number } | null>(
		null,
	);
	useLayoutEffect(() => {
		latest.current = paragraphs;
		workRef.current = work;
	});
	return useMemo(() => {
		const all = (): Work => ({
			...workRef.current.work,
			paragraphs: latest.current,
		});
		const indexOf = (id: string) =>
			latest.current.findIndex((p) => p.id === id);
		// 지금 배열로 셈한 다음 배열로 고친다(알림 문구·포커스 목적지가 결과에 달려 있다). 그사이 배열이 바뀌었으면 고치지 않는다.
		// 곧바로 그려(flushSync) 돌려준 착지가 새 카드 대본 칸을 바로 찾는다(다음 프레임으로 미루면 숨은 탭에서 돌지 않는다).
		// 실제로 바뀌었는지를 돌려준다(안 바뀐 붙여 넣기는 브라우저에 맡긴다)
		function change(next: Paragraph[], message?: string) {
			const base = latest.current;
			if (next === base) return false;
			flushSync(() =>
				edit(
					(ps) => (ps === base ? next : ps),
					message ? { message } : undefined,
				),
			);
			return latest.current === next;
		}
		// 문단 하나만 바꾼다(같은 문단이 돌아오면 그대로)
		function changeOne(id: string, fn: (p: Paragraph) => Paragraph) {
			edit((ps) => {
				const i = ps.findIndex((p) => p.id === id);
				const next = i < 0 ? undefined : fn(ps[i]);
				return !next || next === ps[i]
					? ps
					: ps.map((p, k) => (k === i ? next : p));
			});
		}
		return {
			text: setText,
			neighbor: (id, dir) => {
				const target = latest.current[indexOf(id) + dir];
				if (!target) return false;
				focusText(target.id, dir < 0 ? "end" : 0);
				return true;
			},
			// 새 문단 맨 앞(200개면 splitAt이 그대로 돌려준다)
			split: (id, caret) => {
				const i = indexOf(id);
				const next = splitAt(latest.current, id, caret);
				return change(next, PARAGRAPH_TEXT.split)
					? () => focusText(next[i + 1].id, 0)
					: null;
			},
			// 합친 문단의 이은 자리. 성우·설정은 앞 문단, 쉼은 뒤 문단('스펙과 다른 점' 26)
			merge: (id, dir, sameOnly = false) => {
				const ps = latest.current;
				const i = indexOf(id);
				const head = ps[dir < 0 ? i - 1 : i];
				const tail = ps[dir < 0 ? i : i + 1];
				if (!head || !tail || (sameOnly && !sameVoice(head, tail, all())))
					return null;
				const merged = mergeNext(ps, head.id);
				return merged && change(merged.ps, PARAGRAPH_TEXT.merged)
					? () => focusText(head.id, merged.caret)
					: null;
			},
			// 포커스는 ⋯ 메뉴가 옮긴 카드의 단추로 돌려준다
			move: (id, dir) => {
				change(move(latest.current, id, dir));
			},
			insert: (id) => {
				const i = indexOf(id);
				const next = insertAfter(latest.current, id);
				return change(next) ? () => focusText(next[i + 1].id, 0) : null;
			},
			// 다음 문단 대본 칸, 없으면 앞 문단(하나뿐이면 남은 빈 문단)
			remove: (id) => {
				const ps = latest.current;
				const i = indexOf(id);
				const next = removeAt(ps, id);
				const after = ps[i + 1];
				const target = after ?? ps[i - 1] ?? next[0];
				return change(next, PARAGRAPH_TEXT.removed)
					? () => focusText(target.id, after ? 0 : "end")
					: null;
			},
			// 카드 대본 칸에 빈 줄이 든 글을 붙여 넣으면 나눈다(스펙 5.1). 캐럿은 붙여 넣은 글 끝(마지막 새 문단의 커서 뒤 글 앞)
			paste: (id, selection, raw) => {
				const ps = latest.current;
				const i = indexOf(id);
				const p = ps[i];
				if (!p) return false;
				const pasted = pasteAt(
					ps,
					id,
					selection,
					raw,
					all(),
					PARAGRAPHS_MAX - ps.length,
				);
				if (!pasted) return false;
				// 문단 200개나 화자 20명을 넘게 되면 글을 넣지 않고 알림만(기본 붙여 넣기도 막는다)
				if (pasted.blocked) {
					toast(
						pasted.blocked === "full"
							? PARAGRAPH_TEXT.paragraphsMax
							: PARAGRAPH_TEXT.speakersMax(
									idleSpeakerCount(all().speakers ?? [], ps),
								),
					);
					return true;
				}
				const count = pasted.ps.length - ps.length + 1;
				// 화자만 정했으면 그 말을, 200개라 나누지 못했으면(지금 문단에 첫 조각만) 그 말을 한다
				const message = pasted.named
					? PARAGRAPH_TEXT.speakerSet(pasted.named)
					: count > 1
						? PARAGRAPH_TEXT.splitInto(count, pasted.extra)
						: PARAGRAPH_TEXT.pasteFull(pasted.extra);
				if (!change(pasted.ps, message)) return false;
				// 화자 목록은 없는 이름만 더한다(되돌리기는 문단만 되돌리고 이름은 목록에 남는다, 계획 2.2)
				if (pasted.speakers) workRef.current.setSpeakers(pasted.speakers);
				const end = pasted.ps[i + count - 1];
				focusText(end.id, end.text.length - (p.text.length - selection.end));
				return true;
			},
			voice: (id, setup) => changeOne(id, (p) => ({ ...p, voice: setup })),
			followDefault: (id) => changeOne(id, followDefault),
			// ⋯ 메뉴 '화자'(문단 하나). 일괄 작업과 같은 순수 함수다. 성우는 그대로 둔다
			speaker: (id, name) =>
				edit((ps) => batchSpeaker(ps, new Set([id]), name)),
			pick,
			settings: (id, patch) =>
				changeOne(id, (p) => ownSettings(p, all(), patch)),
			// 그 공급자 처음 값(기본을 따르던 문단은 자기 성우가 된다). 불러온 프리셋 표시는 기본 성우 것이라 건드리지 않는다
			reset: (id) =>
				changeOne(id, (p) => {
					const setup = voiceOf(p, all());
					return setup
						? ownSettings(p, all(), DEFAULT_SETTINGS[setup.provider])
						: p;
				}),
			gap: (id, gap) => changeOne(id, (p) => ({ ...p, gap })),
			toggle: (id) => setOpenId((open) => (open === id ? null : id)),
			open: (id) => setOpenId(() => id),
			listen: (id) => workRef.current.listen(id),
			make: (id, opener) => {
				madeFrom.current = id;
				workRef.current.makeOne(id, opener);
			},
			review: (id, opener) => workRef.current.openReview(id, opener),
			caret: (id, start, end) => {
				caretRef.current = { id, start, end };
				setTagTarget(id);
			},
			// 드라마 applyBadge의 소리 갈래와 같은 길이다(스펙 15.1 '넣기'): 칸에 포커스를 주고 커서 자리(고른 글은 지우지 않고 그 앞)에
			// insertText로 넣어 브라우저 되돌리기(Ctrl+Z)에 남긴다. 칸이 포커스를 받지 못하거나 execCommand가 false면 setText로 넣는다(되돌리기 없음)
			insertTag: (value) => {
				const at = caretRef.current;
				const p = at && latest.current.find((item) => item.id === at.id);
				if (!at || !p) return;
				const from = Math.min(at.start, p.text.length);
				const { text, caret } = insertTagSpaced(p.text, from, value);
				const element = textField(p.id);
				element?.focus();
				let undoable = false;
				if (element && document.activeElement === element) {
					element.setSelectionRange(from, from);
					// 넣는 글(태그와 둘레 공백)은 insertTagSpaced가 정한 조각이다. input 이벤트가 칸의 onChange → setText로 이어진다
					undoable = document.execCommand(
						"insertText",
						false,
						text.slice(from, caret),
					);
				}
				if (!undoable) setText(p.id, text);
				caretRef.current = { id: p.id, start: caret, end: caret };
				// 다시 그린 뒤 커서를 넣은 글 뒤에 둔다(setText로 넣었으면 값이 바뀌며 커서가 끝으로 간다)
				requestAnimationFrame(() => {
					const target = textField(p.id);
					target?.focus();
					target?.setSelectionRange(caret, caret);
				});
			},
		};
	}, [edit, setText, setOpenId, madeFrom, setTagTarget, pick]);
}

// 문단 목록(브리프 5.4·5.5). 카드마다 상태·성우·막는 이유·실패 줄을 셈해 원시 값으로 내린다(카드는 useWork를 구독하지 않는다, E10).
// 판단은 lib 순수 함수(statusOf·blockOf·blockText·makeProblemText·unknownExpiredOf·needsConfirm)만 부른다. 펼친 설정 카드 id 하나는 여기 둔다
// (컨텍스트에 두면 펼칠 때마다 모든 소비자가 다시 그려진다). 복원 전에는 카드 자리 뼈대 셋
// 고르기 중이 아닐 때와 처음 값(같은 빈 집합이라 카드·막대가 다시 그리지 않는다)
const NO_PICKED: ReadonlySet<string> = new Set();

function ParagraphList({
	madeFrom,
	playingId,
	selecting,
	onEndSelecting,
}: {
	madeFrom: RefObject<string | null>;
	// 이어 듣기가 지금 들려주는 문단 id. 값이 바뀔 때만 목록이 다시 그리고 그 카드 둘의 playing 프롭만 바뀐다
	playingId: string | null;
	// 고르기 모드(머리·작업 띠의 '고르기'가 켠다). 고른 문단 id 집합은 이 목록이 든다(계획 2.4: 체크마다 다른 소비자가 다시 그려지지 않게)
	selecting: boolean;
	onEndSelecting: () => void;
}) {
	const work = useWork();
	const { paragraphs } = useParagraphs();
	const [openId, setOpenId] = useState<string | null>(null);
	// 태그 대상(마지막으로 대본 칸에 포커스한 문단, 스펙 15.1). 바뀌면 그 전과 새 대상 두 카드만 다시 그린다
	const [tagTarget, setTagTarget] = useState<string | null>(null);
	const [picked, setPicked] = useState<ReadonlySet<string>>(NO_PICKED);
	// 고르기를 끄면 고른 것을 비운다(렌더 중에 맞춘다, rerender-derived-state-no-effect)
	const [wasSelecting, setWasSelecting] = useState(selecting);
	if (wasSelecting !== selecting) {
		setWasSelecting(selecting);
		if (!selecting) setPicked(NO_PICKED);
	}
	const pick = useCallback((id: string, on: boolean) => {
		setPicked((current) => {
			if (current.has(id) === on) return current;
			const next = new Set(current);
			if (on) next.add(id);
			else next.delete(id);
			return next;
		});
	}, []);
	const actions = useCardActions(setOpenId, madeFrom, setTagTarget, pick);
	const { work: meta, voices, now, make, found, live } = work;
	// 화자 이름들(목록이 바뀔 때만 바뀌는 같은 배열이라 카드 memo가 유지된다)
	const speakerNames = useMemo(
		() => (meta.speakers ?? []).map((s) => s.name),
		[meta.speakers],
	);
	// 고른 문단: 지금 문단 id로 거른다(지운 문단에 고른 표시가 남지 않게)
	const chosen = useMemo(
		() =>
			selecting
				? new Set(paragraphs.filter((p) => picked.has(p.id)).map((p) => p.id))
				: NO_PICKED,
		[selecting, paragraphs, picked],
	);
	const open = openId ? paragraphs.find((p) => p.id === openId) : undefined;
	// 실제 성우(자기 성우 → 화자 성우 → 기본 성우). meta는 문단을 뺀 작업이라 voiceOf가 필요한 칸을 모두 든다
	const openSetup = open ? voiceOf(open, meta) : null;
	// 펼친 카드의 설정 칸 요청(그 성우가 받는 값으로 맞춤). 대본을 쳐도 다시 만들지 않는다
	const openRequest = useMemo(
		() =>
			openSetup &&
			voices &&
			savedOf(voices, openSetup.voiceId, openSetup.provider)
				? setupRequest(openSetup, voices, "", now)
				: null,
		[openSetup, voices, now],
	);
	if (!work.restored)
		return (
			<div aria-hidden="true" className="flex flex-col gap-3">
				<Skeleton className="h-28 w-full rounded-2xl" />
				<Skeleton className="h-28 w-full rounded-2xl" />
				<Skeleton className="h-28 w-full rounded-2xl" />
			</div>
		);
	const all = { ...meta, paragraphs };
	// 목록·찾기가 실패하면 '확인 중' 칸을 비운다(막대와 레일이 이유를 말한다, 브리프 6.2)
	const quiet = work.voicesLoad === "failed" || work.findState === "failed";
	const locked = make.phase !== "idle" && make.phase !== "stopped";
	const running = make.phase === "making" || make.phase === "stopping";
	const currentId = running ? make.queue[make.at]?.id : undefined;
	const full = paragraphs.length >= PARAGRAPHS_MAX;
	// 막힘의 짧은 이유(카드는 문단 번호 없이 짧게, 빈 문단은 이유 없음)
	function reasonOf(p: Paragraph) {
		const block = voices ? blockOf(p, all, voices) : null;
		return block && block !== "empty" ? blockText(block, true) : null;
	}
	// 실패·미확인 한 줄과 실패 상태 칸의 짧은 이유. 실패는 이번 화면의 공급자별 문구, 미확인은 다시 찾는 창(6분) 안이면 사용 기록 안내, 지나면 확인 시간 지남
	function problemOf(p: Paragraph, status: ParagraphStatus) {
		if (status !== "failed" && status !== "unknown") return null;
		const request = work.requestOf(p);
		if (!request) return null;
		const signature = comboSignature(request);
		const mine = live.get(signature);
		const hit = found.get(signature);
		const expired =
			hit?.status === "unknown" && unknownRefetch([hit], now) === false;
		if (status === "failed" && mine?.state === "failed")
			return {
				...makeProblemText(request.provider, mine.problem),
				short: failShortOf(request.provider, mine.problem),
				expired,
			};
		return {
			short: null,
			text: expired
				? unknownExpiredOf(request.provider)
				: PARAGRAPH_TEXT.unknownOutcome(request.provider),
			connections: false,
			expired,
		};
	}
	return (
		<>
			{selecting ? (
				<ParagraphSelectBar
					total={paragraphs.length}
					chosen={chosen}
					locked={locked}
					speakers={speakerNames}
					onAll={(on) =>
						setPicked(on ? new Set(paragraphs.map((p) => p.id)) : NO_PICKED)
					}
					onEnd={onEndSelecting}
				/>
			) : null}
			<ol
				id="paragraph-list"
				tabIndex={-1}
				className="flex flex-col gap-2 focus-visible:outline-2 focus-visible:outline-ring"
			>
				{paragraphs.map((p, i) => {
					const status = work.statusOf(p);
					const setup = voiceOf(p, meta);
					const request =
						status === "unmade" || status === "failed" || status === "unknown"
							? work.requestOf(p)
							: null;
					const problem = problemOf(p, status);
					// 태그 family는 성우 설정으로 정한다(blankFor와 같은 근거: requestOf가 바꾸는 모델은 태그 판정이 같다)
					const family = setup
						? familyOf(setup.provider, setup.settings.model)
						: null;
					return (
						<ParagraphCard
							key={p.id}
							paragraph={p}
							n={i + 1}
							first={i === 0}
							last={i === paragraphs.length - 1}
							full={full}
							follow={followOf(p, meta)}
							speaker={followedSpeaker(p, meta)}
							speakerName={
								p.speaker !== undefined && speakerNames.includes(p.speaker)
									? p.speaker
									: null
							}
							speakerNames={speakerNames}
							selecting={selecting}
							selected={chosen.has(p.id)}
							playing={p.id === playingId}
							defaultGap={meta.gap}
							saved={
								setup && voices
									? savedOf(voices, setup.voiceId, setup.provider)
									: null
							}
							voicesLoad={work.voicesLoad}
							status={status === "checking" && quiet ? "quiet" : status}
							reason={
								status === "blocked" ? reasonOf(p) : (problem?.short ?? null)
							}
							problem={problem?.text ?? null}
							connections={problem?.connections ?? false}
							expired={problem?.expired ?? false}
							free={request ? !needsConfirm(request, now) : false}
							locked={locked}
							current={p.id === currentId}
							since={p.id === currentId ? make.since : null}
							open={p.id === openId}
							request={p.id === openId ? openRequest : null}
							tagTarget={p.id === tagTarget}
							family={family}
							unsent={family ? unsentCount(family, p.text) : 0}
							actions={actions}
						/>
					);
				})}
			</ol>
			{/* 가름선 숫자 칸들이 잇는 설명 하나(LineGap의 aria-describedby) */}
			<p id={GAP_HELP_ID} className="sr-only">
				{PARAGRAPH_TEXT.gapLineHelp(gapText(meta.gap))}
			</p>
		</>
	);
}

function RailSkeleton() {
	return (
		<div aria-hidden="true" className="flex flex-col gap-3">
			<Skeleton className="h-5 w-24" />
			<Skeleton className="h-40 w-full rounded-2xl" />
		</div>
	);
}

function StudioBody() {
	const work = useWork();
	// 프리셋을 불러올 때마다(머리 메뉴·채널·성우 창) 올라 기본 성우 설정 칸을 다시 그린다(같은 프리셋을 다시 불러와도, T9 resetKey)
	const [loads, setLoads] = useState(0);
	const madeFrom = useRef<string | null>(null);
	// 이어 듣기 재생 위치의 문단 id(막대 플레이어가 쓰고 목록이 읽는다). 작업 상태에 넣지 않는다(계획 2.5)
	const [playingId, setPlayingId] = useState<string | null>(null);
	// 고르기 모드: 머리·작업 띠의 '고르기'와 목록이 함께 읽는다(고른 문단 집합은 목록이 든다)
	const [selecting, setSelecting] = useState(false);
	// 끝내기·Esc: 바로 그려 보이는 '고르기' 단추로 포커스를 돌려준다(브리프 16.4)
	function endSelecting() {
		flushSync(() => setSelecting(false));
		focusSelectToggle();
	}
	const toggle = (
		<SelectToggle
			selecting={selecting}
			onToggle={() => (selecting ? endSelecting() : setSelecting(true))}
		/>
	);
	const host: PresetHost = {
		...work.presetHost,
		// 불러오지 않았으면(false, 성우 목록 없음) 칸을 다시 그리지 않고 그대로 돌려준다(usePresetLoad가 성공 알림을 띄우지 않게)
		apply: (preset) => {
			const result = work.presetHost.apply(preset);
			if (result !== false) setLoads((count) => count + 1);
			return result;
		},
	};
	return (
		// 본문 래퍼: 앱 메뉴를 뺀 칸, 여백 바깥. 격자는 그 안쪽 요소다(컨테이너 쿼리는 자기 자신에 걸리지 않는다)
		<div className="@container relative">
			<div className="studio-grid @6xl:px-6 px-4 md:px-11">
				<div className="@4xl:col-start-1 @6xl:col-start-2 @4xl:row-start-1">
					<PageHeader
						flush
						title={STUDIO_TEXT.title}
						description={PARAGRAPH_TEXT.description}
						actions={
							<>
								<ScriptMenu />
								<ChannelPicker host={host} />
								<PresetMenu host={host} trigger="condition" />
								{/* 3단·2단: '고르기'가 머리 오른쪽 끝 회색 문단 수 앞에 온다. 1단은 작업 띠 끝에 있다 */}
								<div className="ml-auto @4xl:flex hidden items-center gap-3">
									{work.restored ? toggle : null}
									<ParagraphCount />
								</div>
							</>
						}
					/>
				</div>
				<a href="#paragraph-list" className={SKIP_LINK}>
					{PARAGRAPH_TEXT.toList}
				</a>
				<a href="#paragraph-bar" className={SKIP_LINK}>
					{PARAGRAPH_TEXT.toBar}
				</a>
				<div className="@4xl:hidden">
					{work.restored ? (
						<WorkBand host={host} settingsKey={loads} tail={toggle} />
					) : (
						<Skeleton aria-hidden="true" className="mb-4 h-11 w-full" />
					)}
				</div>
				{/* 작업 설정: 3단 왼쪽 열(세 행을 덮는다), 2단 오른쪽 열 셋째 행. DOM에서 목록 앞이다 */}
				<aside
					aria-label={PARAGRAPH_TEXT.settingsLabel}
					className={cn(
						RAIL,
						"@4xl:col-start-2 @6xl:col-start-1 @6xl:row-span-3 @4xl:row-start-3 @6xl:row-start-1",
						"@4xl:studio-rail-sticky @6xl:mt-10",
					)}
				>
					{work.restored ? (
						<WorkSettings host={host} settingsKey={loads} />
					) : (
						<RailSkeleton />
					)}
				</aside>
				{/* 목록과 막대를 한 래퍼(왼쪽·가운데 열, 둘째 행부터 끝까지)에 두어 막대의 sticky bottom-0이 이 안에서 움직인다 */}
				<div className="@4xl:col-start-1 @6xl:col-start-2 @4xl:row-span-2 @4xl:row-start-2 flex flex-col">
					<ParagraphList
						madeFrom={madeFrom}
						playingId={playingId}
						selecting={selecting}
						onEndSelecting={endSelecting}
					/>
					<ParagraphBar madeFrom={madeFrom} onPlaying={setPlayingId} />
				</div>
				{/* 작업 요약: 3단 오른쪽 열(세 행을 덮는다), 2단 오른쪽 열 1~2행(설정 위). DOM에서 목록 뒤다 */}
				<aside
					aria-label={PARAGRAPH_TEXT.summary}
					className={cn(
						RAIL,
						"@4xl:col-start-2 @6xl:col-start-3 @4xl:row-span-2 @6xl:row-span-3 @4xl:row-start-1 @4xl:mt-10 @4xl:mb-8 @6xl:mb-0",
						RAIL_STICKY,
					)}
				>
					{work.restored ? <WorkSummary /> : <RailSkeleton />}
				</aside>
			</div>
			{/* 숫자 검수 창은 작업실에 하나다. 버튼(레일·작업 띠)과 카드 숫자 줄·만들기 확인 창이 work.openReview로 연다. 전체 만들기가 도는 중에는 결정을 잠근다 */}
			<NumberReview
				locked={work.make.phase !== "idle" && work.make.phase !== "stopped"}
			/>
		</div>
	);
}

// 음성 작업실(문단 작업실). 소유자가 없으면 머리와 주소 안내 하나다(담은 성우 목록의 UNAUTHORIZED로 판정, T9와 같다).
// WorkProvider는 듣기에 페이지 플레이어(usePlayer)를 쓰므로 SamplePlayerProvider 안에 둔다
export function ParagraphStudio() {
	const saved = useSavedList();
	if (failureOf(saved.error) === "unauthorized")
		return (
			<>
				<PageHeader
					title={STUDIO_TEXT.title}
					description={PARAGRAPH_TEXT.description}
				/>
				<div className="px-4 pb-10 md:px-11">
					<SignInNotice />
				</div>
			</>
		);
	return (
		<SamplePlayerProvider>
			<WorkProvider>
				{/* 자동 태그 창 둘은 작업실에 하나다. 버튼(레일·작업 띠)이 컨텍스트로 연다 */}
				<ParagraphAutoTag>
					<StudioBody />
				</ParagraphAutoTag>
			</WorkProvider>
		</SamplePlayerProvider>
	);
}
