// apps/web/src/components/paragraph-make.tsx
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { comboSignature } from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { scriptWorkProblem } from "@tts-pilot-app/api/script-rules";
import type { StudioRequest } from "@tts-pilot-app/api/studio-contract";
import { type RefObject, useEffect, useRef, useState } from "react";

import {
	afterFailure,
	afterUnknownConfirmed,
	type FoundMap,
	type LiveMap,
	MAKE_IDLE,
	type MakeEvent,
	type MakePlan,
	type MakeState,
	makePlan,
	makeReducer,
	mergeFound,
	requestIdFor,
	runMakeAll,
	usageByProvider,
} from "@/lib/make-all";
import {
	blankFor,
	type Paragraph,
	paragraphRequest,
	type Work,
} from "@/lib/paragraph-script";
import { toScriptWork } from "@/lib/script-work";
import { savedOf } from "@/lib/studio-view";
import { client, orpc } from "@/utils/orpc";

import type { TrialPending } from "./trial-confirm";

// 문단 작업실 '전체 만들기'와 카드 '만들기'(T10 스펙 5.1, 계획 '스펙과 다른 점' 12·13·14·22·23). 유료 호출(studioCreate)은 여기서만 나간다.
// 순서·요청 id·상태는 lib/make-all의 순수 함수(makePlan·makeReducer·runMakeAll·requestIdFor·afterFailure·afterUnknownConfirmed)가 정하고,
// 이 훅은 그 함수에 ref·클라이언트를 넘기기만 한다. 멈춤 요청·실행 번호·마운트 여부는 ref다(await 뒤에는 렌더된 상태를 읽지 못한다)

// 확인 창 단계에서 화면이 그릴 값. all은 전체 만들기 확인 창(Task 13), one은 문단 하나 확인 창(TrialConfirm kind="studio")
export type Confirming =
	| {
			kind: "all";
			plan: MakePlan;
			usage: ReturnType<typeof usageByProvider>;
			opener: HTMLElement | null;
	  }
	| { kind: "one"; pending: TrialPending }
	| null;

// 계획을 세운 때의 값. at은 계획의 시각(보내기 직전 확인도 같은 시각의 요청으로 견준다)
type Staged = { plan: MakePlan; at: number } & (
	| { scope: "all"; opener: HTMLElement | null }
	| { scope: "one"; pending: TrialPending | null }
);
type LiveValue = NonNullable<ReturnType<LiveMap["get"]>>;

export function useMakeAll({
	paragraphs,
	meta,
	voices,
	found,
	changeFound,
	find,
	recheck,
	tick,
	rates,
	now,
}: {
	// 최신 값(이벤트·await 뒤에 읽는다)
	paragraphs: RefObject<Paragraph[]>;
	meta: RefObject<Omit<Work, "paragraphs">>;
	voices: RefObject<SavedVoice[] | null>;
	found: RefObject<FoundMap>;
	changeFound: (fn: (found: FoundMap) => FoundMap) => void;
	// 그 문단들의 저장된 결과를 모두 다시 찾아 표에 합친다. 실패하면 던진다
	find: (
		ps: Paragraph[],
		work: Work,
		voices: SavedVoice[],
		now: number,
	) => Promise<void>;
	// 서버 기록이 미확인이 되었을 수 있을 때 다시 찾는다(15초 다시 확인이 그 표 항목을 보고 돈다)
	recheck: () => void;
	// now를 지금 시각으로 바꾸고 그 값을 돌려준다
	tick: () => number;
	rates: (request: StudioRequest) => number | null;
	now: number;
}) {
	const queryClient = useQueryClient();
	const create = useMutation({
		...orpc.studioCreate.mutationOptions(),
		retry: false,
		// 같은 출처로만 붙으니 브라우저 offline 판단으로 멈추지 않게 한다(utils/orpc.ts QUIET와 같다)
		networkMode: "always",
	});
	const [make, setMake] = useState<MakeState>(MAKE_IDLE);
	const makeRef = useRef<MakeState>(MAKE_IDLE);
	const [live, setLive] = useState<LiveMap>(() => new Map());
	const [staged, setStaged] = useState<Staged | null>(null);
	// 서명 → 요청 id. 이 화면이 떠 있는 동안 다시 쓴다(두 번 눌러도 문단마다 1회, 스펙 5.1)
	const ids = useRef<ReadonlyMap<string, string>>(new Map());
	const stopRef = useRef(false);
	const runRef = useRef(0);
	const mounted = useRef(true);

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			// 보내던 루프는 다음 문단 전에 "gone"을 읽고 이벤트 없이 끝난다(보낸 요청은 서버에서 끝나고 저장된다, 스펙 2절 '화면을 떠날 때')
			runRef.current += 1;
		};
	}, []);

	// 상태는 리듀서로만 바꾼다. 무시한 이벤트는 같은 객체라 부른 쪽이 받아들여졌는지 안다(drama-read send와 같다)
	function send(event: MakeEvent): MakeState {
		const before = makeRef.current;
		const next = makeReducer(before, event);
		if (next === before) return before;
		makeRef.current = next;
		setMake(next);
		return next;
	}
	function mark(signature: string, value: LiveValue | null) {
		setLive((before) => {
			const next = new Map(before);
			if (value) next.set(signature, value);
			else next.delete(signature);
			return next;
		});
	}

	// 확인한 큐를 차례로 보낸다(runMakeAll). at은 계획의 시각이다
	async function begin(run: number, at: number) {
		runRef.current = run;
		let made = false;
		// 최근 대본 보관은 run당 한 번, 첫 요청을 보낼 때(스펙 4.5). 기다리지도 알리지도 않고, 실패해도 만들기는 계속한다(다음 만들기가 다시 보관한다).
		// 작업 id가 없거나 대본 상한을 넘으면 건너뛴다. 카드 만들기여도 문단 하나가 아니라 작업 전체를 보낸다
		let recorded = false;
		function recordRecent() {
			if (recorded) return;
			recorded = true;
			const work = { ...meta.current, paragraphs: paragraphs.current };
			const script = toScriptWork(work);
			if (!work.id || scriptWorkProblem(script)) return;
			void client
				.scriptRecordRecent({
					workId: work.id,
					channelId: work.channelId,
					work: script,
				})
				.catch(() => {});
		}
		await runMakeAll(makeRef.current.queue, run, {
			current: (id) => {
				const p = paragraphs.current.find((item) => item.id === id);
				if (!p) return "gone";
				const work = { ...meta.current, paragraphs: paragraphs.current };
				if (blankFor(p, work)) return "empty";
				const request = paragraphRequest(p, work, voices.current, at);
				// 요청을 만들 수 없으면(성우를 뺌) 확인한 서명과 다르다
				return { signature: request ? comboSignature(request) : "" };
			},
			// 서버 findStudio는 완료만 돌려준다
			find: async (request) => {
				const result = await client.studioFind(request);
				return result && { ...result, status: "done" };
			},
			send: async (item, requestId) => ({
				...(await create.mutateAsync({ requestId, request: item.request })),
				status: "done",
			}),
			idFor: (signature) => {
				const next = requestIdFor(ids.current, signature, () =>
					crypto.randomUUID(),
				);
				ids.current = next.ids;
				return next.id;
			},
			shouldContinue: () =>
				!mounted.current || runRef.current !== run
					? "gone"
					: stopRef.current
						? "stop"
						: "go",
			on: (event) => {
				switch (event.type) {
					// sent에는 item이 없다. 지금 보내는 문단은 큐의 at번째다
					case "sent": {
						recordRecent();
						const item = makeRef.current.queue[makeRef.current.at];
						if (item) mark(item.signature, { state: "making" });
						break;
					}
					case "done":
					case "skip":
						if (event.found) {
							changeFound((table) =>
								mergeFound(table, [event.item.request], [event.found]),
							);
							mark(event.item.signature, null);
						}
						if (event.type === "done") made = true;
						break;
					case "fail":
						// 보낸 뒤의 실패만 요청 id 표를 고친다(보내기 전 찾기 실패에 고치면 미확인 뒤 남긴 id가 지워진다, 14)
						if (event.sent)
							ids.current = afterFailure(
								ids.current,
								event.item.signature,
								event.problem.reason,
							);
						mark(event.item.signature, {
							state: "failed",
							problem: event.problem,
						});
						if (event.sent && event.problem.reason === "unknown_outcome")
							recheck();
						break;
				}
				send(event);
			},
		});
		// 성우 사용 이력이 바뀌었다(성우 창 정렬, T9 generate와 같다)
		if (made && mounted.current)
			void queryClient.invalidateQueries({
				queryKey: orpc.savedVoiceList.key(),
			});
	}

	// 전체 만들기(only 없음)와 카드 '만들기'(only = 문단 id)의 한 길(E3). 누른 때의 문단으로 저장된 결과를 모두 다시 찾고(무료),
	// 계획을 세워 유료이거나 미확인이면 확인 창, 아니면 바로 보낸다
	async function start(opener: HTMLElement | null, only?: string) {
		const list = voices.current;
		const all = paragraphs.current;
		const index = only === undefined ? -1 : all.findIndex((p) => p.id === only);
		if (!list || (only !== undefined && index < 0)) return;
		const before = makeRef.current;
		const started = send({ type: "start", run: before.run });
		if (started === before) return;
		const { run } = started;
		runRef.current = run;
		stopRef.current = false;
		const at = tick();
		const ps = only === undefined ? all : all.slice(index, index + 1);
		const work = { ...meta.current, paragraphs: ps };
		try {
			await find(ps, work, list, at);
		} catch {
			send({ type: "findFailed", run });
			return;
		}
		const latest = makeRef.current;
		if (!mounted.current || latest.run !== run || latest.phase !== "finding")
			return;
		const counted = makePlan(ps, work, list, found.current, at);
		// 항목 하나짜리 계획의 번호를 카드 번호로 돌린다(makePlan은 넘긴 배열의 차례로 센다)
		const plan =
			only === undefined
				? counted
				: {
						...counted,
						make: counted.make.map((item) => ({ ...item, n: index + 1 })),
						firstBlocked: counted.firstBlocked && {
							...counted.firstBlocked,
							n: index + 1,
						},
					};
		const item = plan.make[0];
		const voice =
			item && savedOf(list, item.request.voiceId, item.request.provider);
		setStaged(
			only === undefined
				? { scope: "all", plan, at, opener }
				: {
						scope: "one",
						plan,
						at,
						// 요청 id는 보낼 때 requestIdFor 표에서 받는다(이 창은 requestId를 읽지 않는다)
						pending:
							item && voice
								? {
										voice: voice.voice,
										request: item.request,
										requestId: "",
										regenerate: false,
										opener,
										unknownSame: plan.unknown.length > 0,
										unreviewed: plan.unreviewed,
									}
								: null,
					},
		);
		const after = send({
			type: "planned",
			run,
			queue: plan.make,
			blocked: plan.firstBlocked !== null,
			unknown: plan.unknown.length,
			unreviewed: plan.unreviewed,
			free: plan.free,
		});
		if (after.phase === "making") void begin(run, at);
	}

	// 확인 창 '만들기'. 두 번 눌러도 리듀서가 한 번만 받는다. 보낼 계획(카드면 창 값)이 없으면 making으로 바꾸지 않고 접는다
	// (making에 들어간 뒤 보내지 못하면 멈출 길 없이 잠긴다)
	function confirm() {
		const before = makeRef.current;
		if (before.phase !== "confirm") return;
		if (!staged || (staged.scope === "one" && !staged.pending)) {
			send({ type: "cancel", run: before.run });
			return;
		}
		const after = send({ type: "confirm", run: before.run });
		if (after === before) return;
		// 미확인 서명은 중복 과금 경고를 확인했으니 새 요청 id로 보낸다(같은 id는 늘 unknown_outcome이다, 22)
		ids.current = afterUnknownConfirmed(ids.current, staged.plan.unknown);
		void begin(after.run, staged.at);
	}

	const confirming: Confirming =
		make.phase !== "confirm" || !staged
			? null
			: staged.scope === "one"
				? staged.pending && { kind: "one", pending: staged.pending }
				: {
						kind: "all",
						plan: staged.plan,
						usage: usageByProvider(staged.plan.make, rates, now),
						opener: staged.opener,
					};

	return {
		make,
		live,
		confirming,
		makeAll: (opener: HTMLElement | null) => void start(opener),
		makeOne: (id: string, opener: HTMLElement | null) => void start(opener, id),
		// '멈추기': 지금 문단이 끝나면 멈춘다(보낸 요청은 끊지 않는다). 리듀서가 받았을 때만 멈춤 요청을 남긴다
		stop: () => {
			const before = makeRef.current;
			if (send({ type: "stop", run: before.run }) !== before)
				stopRef.current = true;
		},
		confirm,
		cancel: () => {
			send({ type: "cancel", run: makeRef.current.run });
		},
	};
}
