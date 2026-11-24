"use client";

import { ORPCError } from "@orpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MyVoice } from "@tts-pilot-app/api/my-voice-contract";
import {
	CLONE_PROVIDERS,
	type CloneProvider,
	cloneLengthProblem,
	myVoiceNameProblem,
} from "@tts-pilot-app/api/my-voice-rules";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Checkbox } from "@tts-pilot-app/ui/components/checkbox";
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
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import {
	Fragment,
	type RefObject,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";

import { PROVIDER_LABEL } from "@/lib/connection-view";
import {
	GEMINI_CONSENT_SENTENCE,
	READING_PASSAGE,
	MY_VOICE_TEXT as T,
} from "@/lib/my-voice-text";
import { reasonText } from "@/lib/my-voice-view";
import { trialFailureOf } from "@/lib/trial-view";
import { retryTime } from "@/lib/voice-view";
import { orpc } from "@/utils/orpc";

import {
	AudioCapture,
	type CaptureValue,
	OriginalPlayer,
} from "./audio-capture";
import { fieldClass, isComposingEnter } from "./class-form-dialog";
import { DialogCloseButton } from "./dialog-close-button";
import { lockedButton, useCooldown } from "./voice-problem";

// 페이지의 '만들기' 버튼 id. 창을 닫을 때 포커스가 돌아갈 곳이고 들어보기 창도 쓴다
export const CREATE_ID = "my-voice-create";

// 공급자 이름은 번역하지 않는다. 문구 속 이름만 translate="no" span으로 감싼다(이름이 없으면 문구 그대로)
export function ProviderText({ text, name }: { text: string; name: string }) {
	return text.split(name).map((part, index) => (
		<Fragment key={index}>
			{index > 0 ? <span translate="no">{name}</span> : null}
			{part}
		</Fragment>
	));
}

type StepId = "provider" | "source" | "consent" | "confirm";
const STEP_NAME: Record<StepId, string> = {
	provider: T.stepProvider,
	source: T.stepSource,
	consent: T.stepConsent,
	confirm: T.stepConfirm,
};
// 동의 녹음은 Gemini만 있다
const stepsOf = (provider: CloneProvider | null): StepId[] =>
	provider === "gemini"
		? ["provider", "source", "consent", "confirm"]
		: ["provider", "source", "confirm"];

type Result =
	| { kind: "ready"; item: MyVoice }
	| { kind: "processing" }
	| { kind: "failed"; text: string }
	| { kind: "unknown"; text: string };
// 결과로 가지 않고 보내기 아래에 남는 안내. 다시 보낼 수 있다
type Inline = { text: string; retryAt: string | null };

function resultOf(item: MyVoice): Result {
	switch (item.status) {
		case "ready":
			return { kind: "ready", item };
		case "failed":
			return {
				kind: "failed",
				text: reasonText(item.reason, item.provider),
			};
		case "unknown":
			return {
				kind: "unknown",
				text: T.reasonUnknown(PROVIDER_LABEL[item.provider]),
			};
		default:
			return { kind: "processing" };
	}
}

// 서버가 사유로 답했으면(행이 생겼거나 거절) 결과 화면, 답을 못 받았거나 아직 막힌 것이면 보내기 아래 안내
function outcomeOf(
	error: unknown,
	provider: CloneProvider,
): { result: Result } | { inline: Inline } {
	const { reason, retryAt } = trialFailureOf(error);
	switch (reason) {
		case "rate_limit":
			return {
				inline: {
					text: retryAt ? T.retryAt(retryTime(retryAt)) : T.reasonRateLimit,
					retryAt,
				},
			};
		case "in_progress":
			return { inline: { text: T.busyCreating, retryAt: null } };
		case "no_key":
			return { inline: { text: T.reasonNoKey, retryAt: null } };
		case "unknown_outcome":
			return {
				result: {
					kind: "unknown",
					text: T.reasonUnknown(PROVIDER_LABEL[provider]),
				},
			};
		case "unexpected":
			// 사유 없는 BAD_REQUEST는 크기 초과(zod)다. 그 밖(연결 끊김 등)은 같은 요청 id로 다시 보낼 수 있다
			return error instanceof ORPCError && error.code === "BAD_REQUEST"
				? {
						result: {
							kind: "failed",
							text: reasonText("audio_size", provider),
						},
					}
				: { inline: { text: T.network, retryAt: null } };
		default:
			return {
				result: { kind: "failed", text: reasonText(reason, provider) },
			};
	}
}

type Inputs = {
	provider: CloneProvider;
	name: string;
	source: CaptureValue;
	consent: CaptureValue | null;
};
// 같은 시도의 재전송은 같은 요청 id를 쓴다. 입력이 하나라도 바뀌면 새 id
const sameInputs = (a: Inputs, b: Inputs) =>
	a.provider === b.provider &&
	a.name === b.name &&
	a.source === b.source &&
	a.consent === b.consent;

const wavFile = (value: CaptureValue, name: string) =>
	new File([value.wav], name, { type: "audio/wav" });

// 만들기 창(브리프 5절). 열릴 때만 안쪽이 마운트되어 닫으면 원본·마이크가 정리된다.
// SamplePlayerProvider 안에서 쓴다(원본 재생이 usePlayer를 쓴다)
export function MyVoiceCreate({
	open,
	onOpenChange,
	providers,
	onDone,
	onListen,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	providers: { fish_audio: boolean; gemini: boolean };
	onDone?: (item: MyVoice) => void;
	onListen?: (item: MyVoice) => void;
}) {
	const firstRef = useRef<HTMLInputElement>(null);
	return (
		// 창 밖을 눌러 닫히면 녹음이 사라진다(audit C6). 닫기와 Esc로만 닫는다
		<Dialog open={open} disablePointerDismissal onOpenChange={onOpenChange}>
			<DialogContent
				initialFocus={() => firstRef.current ?? true}
				// 빈 상태에서 만든 뒤처럼 연 버튼이 사라졌어도 페이지의 '만들기'로 돌아간다
				finalFocus={() => document.getElementById(CREATE_ID) ?? true}
				// 390px는 전체 높이 시트. 안쪽 단계 칸만 스크롤하고 버튼 줄은 아래에 둔다.
				// 768px 이상도 창이 최대 높이(알림 자리, MG-14·MG-16)에 걸리면 단계 칸만 줄어 스크롤한다(머리·버튼 줄 고정)
				className="flex h-dvh flex-col rounded-none max-md:overflow-hidden md:h-auto md:max-w-160 md:rounded-2xl"
			>
				<CreateFlow
					providers={providers}
					firstRef={firstRef}
					onClose={() => onOpenChange(false)}
					onDone={onDone}
					onListen={onListen}
				/>
			</DialogContent>
		</Dialog>
	);
}

function CreateFlow({
	providers,
	firstRef,
	onClose,
	onDone,
	onListen,
}: {
	providers: { fish_audio: boolean; gemini: boolean };
	firstRef: RefObject<HTMLInputElement | null>;
	onClose: () => void;
	onDone?: (item: MyVoice) => void;
	onListen?: (item: MyVoice) => void;
}) {
	const queryClient = useQueryClient();
	const ids = useId();
	const [provider, setProvider] = useState<CloneProvider | null>(
		() => CLONE_PROVIDERS.find((id) => providers[id]) ?? null,
	);
	const [name, setName] = useState("");
	const [nameBad, setNameBad] = useState(false);
	const [source, setSource] = useState<CaptureValue | null>(null);
	const [consent, setConsent] = useState<CaptureValue | null>(null);
	const [agreed, setAgreed] = useState(false);
	const [at, setAt] = useState(0);
	const [result, setResult] = useState<Result | null>(null);
	const [inline, setInline] = useState<Inline | null>(null);
	const attempt = useRef<({ id: string } & Inputs) | null>(null);
	// 렌더 전에 오는 두 번째 호출을 막는다(pending은 다음 렌더에야 켜진다)
	const sending = useRef(false);
	const headingRef = useRef<HTMLHeadingElement>(null);
	const moveFocus = useRef(false);
	const waiting = useCooldown(inline?.retryAt);

	// 요청이 끝나면 창이 닫혀 있어도 목록을 다시 받는다(mutation 단계 콜백은 창이 닫혀도 돈다)
	const create = useMutation({
		...orpc.myVoiceCreate.mutationOptions(),
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: orpc.myVoiceList.key() });
			void queryClient.invalidateQueries({
				queryKey: orpc.savedVoiceList.key(),
			});
		},
	});
	const pending = create.isPending;

	const steps = stepsOf(provider);
	const step = steps[at] ?? "provider";
	const last = at === steps.length - 1;

	// 단계·결과가 바뀌면 그 제목으로 포커스(처음 열 때는 첫 칸이 받는다)
	// biome-ignore lint/correctness/useExhaustiveDependencies: at·result는 바뀐 때를 알리는 신호다
	useEffect(() => {
		if (!moveFocus.current) return;
		moveFocus.current = false;
		headingRef.current?.focus();
	}, [at, result]);

	function go(next: number) {
		moveFocus.current = true;
		setInline(null);
		setAt(next);
	}

	function pickProvider(next: CloneProvider) {
		setProvider(next);
		// 공급자마다 길이 범위가 달라 범위를 벗어난 원본은 버린다. Fish에는 동의 녹음이 없다
		setSource((value) =>
			value && cloneLengthProblem(next, "source", value.seconds) === null
				? value
				: null,
		);
		if (next !== "gemini") setConsent(null);
	}

	function canNext(): boolean {
		if (step === "provider") return provider !== null && providers[provider];
		if (step === "source") return source !== null;
		if (step === "consent") return consent !== null;
		return false;
	}

	function next() {
		if (step === "provider" && myVoiceNameProblem(name)) {
			setNameBad(true);
			return;
		}
		if (canNext()) go(at + 1);
	}

	function send() {
		if (!provider || !source || !agreed || pending || waiting) return;
		if (provider === "gemini" && !consent) return;
		if (sending.current) return;
		sending.current = true;
		const inputs: Inputs = {
			provider,
			name,
			source,
			consent: provider === "gemini" ? consent : null,
		};
		const before = attempt.current;
		const requestId =
			before && sameInputs(before, inputs) ? before.id : crypto.randomUUID();
		attempt.current = { id: requestId, ...inputs };
		create.mutate(
			{
				requestId,
				provider,
				name,
				consent: true,
				source: wavFile(source, "source.wav"),
				consentAudio: inputs.consent
					? wavFile(inputs.consent, "consent.wav")
					: undefined,
			},
			{
				onSettled: () => {
					sending.current = false;
				},
				onSuccess: (item) => {
					moveFocus.current = true;
					setInline(null);
					setResult(resultOf(item));
					onDone?.(item);
				},
				onError: (error) => {
					const outcome = outcomeOf(error, provider);
					if ("result" in outcome) {
						moveFocus.current = true;
						setInline(null);
						setResult(outcome.result);
					} else {
						setInline(outcome.inline);
					}
				},
			},
		);
	}

	// 실패 결과에서 2단계로: 원본·동의 녹음을 비우고 새 요청 id로 다시 시작한다
	function pickAgain() {
		attempt.current = null;
		setSource(null);
		setConsent(null);
		setAgreed(false);
		setResult(null);
		go(1);
	}

	const heading = "font-bold text-lg break-keep outline-none";

	if (result) {
		return (
			<div className="flex flex-col gap-5">
				<Header />
				<section className="flex flex-col gap-2">
					<h3 ref={headingRef} tabIndex={-1} className={heading}>
						{result.kind === "ready"
							? T.resultReady(result.item.name)
							: result.kind === "processing"
								? T.resultProcessing
								: result.kind === "failed"
									? T.badgeFailed
									: T.badgeUnknown}
					</h3>
					{result.kind === "failed" || result.kind === "unknown" ? (
						<p className="text-muted-foreground text-sm/relaxed">
							<ProviderText
								text={result.text}
								name={PROVIDER_LABEL[provider ?? "fish_audio"]}
							/>
						</p>
					) : null}
				</section>
				<DialogFooter>
					{result.kind === "ready" && onListen ? (
						<Button
							type="button"
							size="lg"
							className="flex-1 md:flex-none"
							onClick={() => {
								onListen(result.item);
								onClose();
							}}
						>
							{T.listen}
						</Button>
					) : null}
					{result.kind === "failed" ? (
						<Button
							type="button"
							size="lg"
							className="flex-1 md:flex-none"
							onClick={pickAgain}
						>
							{T.pickSourceAgain}
						</Button>
					) : null}
					<Button
						type="button"
						size="lg"
						variant="neutral"
						className="flex-1 md:flex-none"
						onClick={onClose}
					>
						{T.close}
					</Button>
				</DialogFooter>
			</div>
		);
	}

	return (
		<form
			noValidate
			className="flex min-h-0 flex-col gap-5 max-md:flex-1"
			onSubmit={(event) => {
				event.preventDefault();
				if (last) send();
				else next();
			}}
			onKeyDown={(event) => {
				// 한글 조합을 끝내는 Enter는 다음이 아니다
				if (isComposingEnter(event)) event.preventDefault();
			}}
		>
			<Header />
			{/* biome-ignore lint/a11y/useSemanticElements: 누를 수 없는 단계 표시이고 입력 묶음이 아니라 fieldset이 아니다 */}
			<div role="group" aria-label={T.steps}>
				<ol className="hidden flex-wrap items-center gap-x-1 gap-y-1 text-sm md:flex">
					{steps.map((id, index) => (
						<li
							key={id}
							aria-current={index === at ? "step" : undefined}
							className={cn(
								"flex items-center gap-1",
								index === at
									? "font-bold text-foreground"
									: "text-muted-foreground",
							)}
						>
							<span className="tabular-nums">{index + 1}</span>
							{STEP_NAME[id]}
							{index < steps.length - 1 ? (
								<ChevronRight aria-hidden="true" className="size-4" />
							) : null}
						</li>
					))}
				</ol>
				<p aria-current="step" className="font-bold text-sm md:hidden">
					{T.stepShort(at + 1, steps.length, STEP_NAME[step])}
				</p>
			</div>

			{/* 스크롤 칸이 포커스 링을 자르지 않게 사방 4px */}
			<section className="-m-1 flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain p-1 max-md:flex-1">
				<h3 ref={headingRef} tabIndex={-1} className={heading}>
					{STEP_NAME[step]}
				</h3>

				{step === "provider" ? (
					<>
						<fieldset className="flex flex-col gap-1">
							<legend className="mb-1 font-bold text-sm">
								{T.providerLabel}
							</legend>
							{CLONE_PROVIDERS.map((id) => {
								const connected = providers[id];
								return (
									<label
										key={id}
										className={cn(
											"flex min-h-11 items-start gap-3 rounded-xl px-3 py-2",
											connected
												? "cursor-pointer hover:bg-muted"
												: "cursor-not-allowed opacity-50",
										)}
									>
										<span className="relative mt-0.5 grid size-5 shrink-0 place-items-center">
											<input
												ref={
													id === (provider ?? CLONE_PROVIDERS[0])
														? firstRef
														: undefined
												}
												type="radio"
												name={`${ids}-provider`}
												value={id}
												checked={provider === id}
												disabled={!connected}
												onChange={() => pickProvider(id)}
												className="peer absolute inset-0 m-0 size-5 cursor-pointer appearance-none rounded-full border border-input outline-offset-2 checked:border-foreground focus-visible:outline-2 focus-visible:outline-ring"
											/>
											<span className="pointer-events-none size-2.5 rounded-full bg-foreground opacity-0 peer-checked:opacity-100" />
										</span>
										<span className="flex min-w-0 flex-col">
											<span className="font-bold text-base md:text-sm">
												<span translate="no">{PROVIDER_LABEL[id]}</span>
											</span>
											<span className="text-muted-foreground text-sm">
												{id === "fish_audio"
													? T.providerHintFish
													: T.providerHintGemini}
												{connected ? "" : ` · ${T.notConnected}`}
											</span>
										</span>
									</label>
								);
							})}
						</fieldset>
						<div className="flex flex-col gap-2">
							<Label htmlFor={`${ids}-name`} className="font-bold text-sm">
								{T.nameLabel}
							</Label>
							<Input
								id={`${ids}-name`}
								name="name"
								autoComplete="off"
								className={fieldClass}
								value={name}
								aria-invalid={nameBad || undefined}
								aria-describedby={nameBad ? `${ids}-name-error` : undefined}
								onChange={(event) => {
									setName(event.target.value);
									setNameBad(false);
								}}
							/>
							{nameBad ? (
								<p
									id={`${ids}-name-error`}
									role="alert"
									className="text-sm text-warning"
								>
									{T.nameProblem}
								</p>
							) : null}
						</div>
					</>
				) : null}

				{step === "source" && provider ? (
					<>
						<AudioCapture
							kind="source"
							provider={provider}
							value={source}
							onChange={setSource}
						/>
						<div className="flex flex-col gap-2 rounded-xl bg-muted p-4">
							<p className="text-muted-foreground text-sm">{T.passageHint}</p>
							<p className="break-keep text-base/loose">{READING_PASSAGE}</p>
						</div>
					</>
				) : null}

				{step === "consent" && provider ? (
					<>
						<p className="break-keep font-bold text-lg/relaxed">
							{GEMINI_CONSENT_SENTENCE}
						</p>
						<p className="text-muted-foreground text-sm">{T.readAloud}</p>
						<AudioCapture
							kind="consent"
							provider={provider}
							value={consent}
							onChange={setConsent}
						/>
					</>
				) : null}

				{step === "confirm" && provider && source ? (
					<>
						{/* 보내기 직전 고지는 한 겹 패널 하나(중첩 카드 없음). 원본 플레이어가 '보낼 것' 줄이다 */}
						<dl className="flex flex-col gap-4 rounded-xl bg-muted p-4 text-sm">
							<div className="flex flex-col gap-2">
								<dt className="font-bold">{T.sendLabel}</dt>
								<dd className="flex flex-col gap-3">
									<OriginalPlayer label={T.sourceAudio} value={source} />
									{provider === "gemini" && consent ? (
										<OriginalPlayer label={T.consentAudio} value={consent} />
									) : null}
								</dd>
							</div>
							<div className="flex flex-col gap-1">
								<dt className="font-bold">{T.whereLabel}</dt>
								<dd className="break-keep">
									<ProviderText
										text={T.sendTo(PROVIDER_LABEL[provider])}
										name={PROVIDER_LABEL[provider]}
									/>
								</dd>
							</div>
							<div className="flex flex-col gap-1">
								<dt className="font-bold">{T.keepsLabel}</dt>
								<dd className="break-keep">{T.providerKeeps}</dd>
							</div>
							<div className="flex flex-col gap-1">
								<dt className="font-bold">{T.undoLabel}</dt>
								<dd className="break-keep">
									<ProviderText
										text={T.undoHow(PROVIDER_LABEL[provider])}
										name={PROVIDER_LABEL[provider]}
									/>
								</dd>
							</div>
							<div className="flex flex-col gap-1">
								<dt className="font-bold">{T.costLabel}</dt>
								<dd className="break-keep">{T.cloneCost}</dd>
							</div>
						</dl>
						{/* biome-ignore lint/a11y/noLabelWithoutControl: Base UI Checkbox는 label 안의 button이다 */}
						<label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-muted">
							<Checkbox
								checked={agreed}
								disabled={pending}
								onCheckedChange={(checked) => setAgreed(checked === true)}
							/>
							<span className="min-w-0 break-keep">
								<ProviderText
									text={T.consentCheck(PROVIDER_LABEL[provider])}
									name={PROVIDER_LABEL[provider]}
								/>
							</span>
						</label>
					</>
				) : null}
			</section>

			{inline ? (
				<p role="alert" className="text-sm text-warning">
					{inline.text}
				</p>
			) : null}
			<p role="status" className="sr-only">
				{pending ? T.sending : ""}
			</p>

			<DialogFooter className="max-md:border-t max-md:pt-3">
				{at > 0 ? (
					<Button
						type="button"
						size="lg"
						variant="neutral"
						disabled={pending}
						className="flex-1 md:flex-none"
						onClick={() => go(at - 1)}
					>
						{T.prev}
					</Button>
				) : null}
				{last ? (
					<Button
						type="submit"
						size="lg"
						disabled={!agreed || pending || waiting !== null}
						focusableWhenDisabled
						className={cn("flex-1 md:flex-none", lockedButton(!pending))}
					>
						{pending ? (
							<Spinner
								data-icon="inline-start"
								aria-hidden="true"
								className="motion-reduce:animate-none"
							/>
						) : null}
						{pending ? T.sending : inline ? T.retry : T.send}
					</Button>
				) : (
					<Button
						type="submit"
						size="lg"
						disabled={step !== "provider" && !canNext()}
						className="flex-1 md:flex-none"
					>
						{T.next}
					</Button>
				)}
			</DialogFooter>
		</form>
	);
}

// 오른쪽 위 닫기(44px)가 차지하는 자리만큼 제목 오른쪽을 비운다
function Header() {
	return (
		<>
			<DialogHeader className="pr-12">
				<DialogTitle className="break-keep">{T.createTitle}</DialogTitle>
			</DialogHeader>
			<DialogCloseButton label={T.close} />
		</>
	);
}
