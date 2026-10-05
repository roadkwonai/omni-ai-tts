import type {
	ConnectionStatus,
	ProviderId,
	ProviderStatusResult,
	RemainingQuota,
} from "@tts-pilot-app/api/providers/contract";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@tts-pilot-app/ui/components/card";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { CircleCheck, KeyRound, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { isUpcoming, PROVIDER_LABEL } from "@/lib/connection-view";

// 키 없음 안내에 보이는 변수 이름(apps/web/.env.schema). 키 값은 어디에도 보이지 않는다.
const ENV_KEY: Record<ProviderId, string> = {
	typecast: "TYPECAST_API_KEY",
	elevenlabs: "ELEVENLABS_API_KEY",
	fish_audio: "FISH_AUDIO_API_KEY",
};

export const STATUS_LABEL: Record<ConnectionStatus, string> = {
	connected: "연결됨",
	no_key: "키 없음",
	provider_auth: "키 오류",
	no_permission: "권한 부족",
	quota: "한도 부족",
	rate_limit: "요청 제한",
	provider_error: "공급자 장애",
	check_failed: "확인 실패",
};

// 문장 안의 변수 이름·경로와 오류 코드. 긴 코드는 320px에서 줄바꿈된다.
const codeClass = "rounded-md bg-muted px-1.5 py-0.5 font-mono text-sm";

// 소수는 둘째 자리까지 버림으로 보인다(실제보다 크게 보이지 않게, 브리프 7절).
const numberFormat = new Intl.NumberFormat("ko-KR", {
	maximumFractionDigits: 2,
	roundingMode: "trunc",
});
const dayFormat = new Intl.DateTimeFormat("ko-KR", {
	month: "long",
	day: "numeric",
});
// 같은 날은 초까지 보여 같은 결과가 다시 와도 확인이 돌았는지 알 수 있다.
const timeFormat = new Intl.DateTimeFormat("ko-KR", {
	hour: "numeric",
	minute: "2-digit",
	second: "2-digit",
});
const dayTimeFormat = new Intl.DateTimeFormat("ko-KR", {
	month: "long",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
});

function timeText(at: Date): string {
	const today = at.toDateString() === new Date().toDateString();
	return (today ? timeFormat : dayTimeFormat).format(at);
}

// 브리프 6절 문구. 연결됨과 키 없음은 따로 그린다.
function reasonText(
	provider: ProviderId,
	{ status, retryAfterSeconds, checkedAt }: ProviderStatusResult,
): string | null {
	const name = PROVIDER_LABEL[provider];
	switch (status) {
		case "provider_auth":
			return `키가 틀렸거나 만료됐어요. ${name} 대시보드에서 키를 확인해 주세요.`;
		case "no_permission":
			return `키는 맞지만 사용량 조회 권한이 없어요. ${name} 대시보드에서 키 권한을 확인해 주세요.`;
		case "quota":
			return `남은 사용량이 없어요. ${name}에서 플랜이나 충전 상태를 확인해 주세요.`;
		case "rate_limit":
			// 기다릴 초를 받으면 확인 시각에 더한 시각을 보인다.
			return retryAfterSeconds === null
				? "잠시 뒤 다시 확인해 주세요."
				: `${timeText(new Date(Date.parse(checkedAt) + retryAfterSeconds * 1000))} 이후 다시 확인해 주세요.`;
		case "provider_error":
			return `${name} 서버에 문제가 생겼어요. 잠시 뒤 다시 확인해 주세요.`;
		case "check_failed":
			return "연결 상태를 확인하지 못했어요. 잠시 뒤 다시 확인해 주세요.";
		default:
			return null;
	}
}

// 덩어리(이름표+숫자)는 줄바꿈 때 갈라지지 않게 nowrap으로 묶고, 구분자는 덩어리 사이에서만 줄이 바뀐다.
const chunk = (text: string) => (
	<span className="whitespace-nowrap">{text}</span>
);

// 브리프 7절 형식. 남은 값이 0 아래로 내려가도 0으로 보인다.
function quotaText(provider: ProviderId, quota: RemainingQuota): ReactNode {
	const remaining = numberFormat.format(Math.max(0, quota.remaining));
	const total = quota.total === null ? "" : numberFormat.format(quota.total);
	// 단위는 공급자 문서에 없어 붙이지 않는다. 웹 플랜 크레딧은 FishWebCredit이 따로 보인다.
	if (provider === "fish_audio") return chunk(`API 충전 잔액 ${remaining}`);
	if (provider === "typecast") {
		return (
			<>
				{chunk(`${quota.plan} 플랜`)} · {chunk(`남은 크레딧 ${remaining}`)} /{" "}
				{chunk(`전체 ${total}`)}
			</>
		);
	}
	const characters = (
		<>
			{chunk(`남은 글자 ${remaining}`)} / {chunk(`전체 ${total}`)}
		</>
	);
	if (quota.overageAllowed && quota.remaining <= 0) {
		// 요금 문구는 공급자 문서 근거가 없어 쓰지 않는다.
		return (
			<>
				{characters} · {chunk("한도를 넘겨 사용 중")}
			</>
		);
	}
	return quota.resetAt !== null && isUpcoming(quota.resetAt) ? (
		<>
			{characters} ·{" "}
			{chunk(`${dayFormat.format(new Date(quota.resetAt))} 초기화`)}
		</>
	) : (
		characters
	);
}

// Fish Audio 웹 플랜 크레딧. 앱이 쓰는 값(API 충전 잔액)보다 낮은 위계로 보인다.
// 남은 값이 전체보다 클 수 있다(추가 크레딧). 공급자 웹 화면과 같게 그대로 보인다.
// 조회에 실패해도 두 값이 별개라는 안내는 남긴다(사용자가 공급자 웹의 값과 헷갈리지 않게).
function FishWebCredit({ web }: { web: RemainingQuota["webCredit"] }) {
	return (
		<>
			{web === undefined ? null : (
				<p className="tabular-nums">
					{/* '남은 웹 크레딧'은 이름표가 길어 숫자만 묶는다(320px에서 글자를 키워도 카드 밖으로 나가지 않게) */}
					웹 <span translate="no">{web.plan}</span> 플랜 · 남은 웹 크레딧{" "}
					{chunk(`${numberFormat.format(Math.max(0, web.remaining))} /`)}{" "}
					{chunk(`전체 ${numberFormat.format(web.total)}`)}
				</p>
			)}
			<p className="text-muted-foreground text-sm">
				<span translate="no">fish.audio</span> 웹 플랜 크레딧은{" "}
				{web === undefined ? "확인하지 못했어요. 이 값은 " : null}
				{chunk("API 충전 잔액")}과 별개예요.
			</p>
		</>
	);
}

function StatusBadge({ status }: { status: ConnectionStatus }) {
	// 색만으로 구분하지 않는다. 아이콘 모양과 글자가 함께 바뀐다.
	const [variant, Icon] =
		status === "connected"
			? (["success", CircleCheck] as const)
			: status === "no_key"
				? (["secondary", KeyRound] as const)
				: (["warning", TriangleAlert] as const);
	return (
		<Badge variant={variant}>
			<Icon data-icon="inline-start" aria-hidden="true" />
			{STATUS_LABEL[status]}
		</Badge>
	);
}

// 공급자 이름과 변수 이름은 카드의 provider로, 사용량 형식은 결과의 provider로 고른다(흉내 낸 응답 하나로 세 카드를 볼 때도 어긋나지 않는다).
function Details({
	provider,
	result,
}: {
	provider: ProviderId;
	result: ProviderStatusResult;
}) {
	const reason = reasonText(provider, result);
	return (
		<>
			{result.status === "no_key" ? (
				<p>
					서버에 키가 없어요.{" "}
					<code translate="no" className={codeClass}>
						apps/web/.env
					</code>
					에{" "}
					<code translate="no" className={`${codeClass} select-all`}>
						{ENV_KEY[provider]}
					</code>
					를 넣고 다시 확인해 주세요.
				</p>
			) : null}
			{reason === null ? null : <p>{reason}</p>}
			{result.providerCode === null ? null : (
				<p>
					<code
						translate="no"
						className={`${codeClass} break-all text-muted-foreground`}
					>
						{result.providerCode}
					</code>
				</p>
			)}
			{result.quota === null ? null : (
				// 값과 그 안내는 한 묶음이라 확인 시각보다 가깝게 붙인다.
				<div className="flex flex-col gap-1">
					<p className="font-bold tabular-nums">
						{quotaText(result.provider, result.quota)}
					</p>
					{result.provider === "fish_audio" ? (
						<FishWebCredit web={result.quota.webCredit} />
					) : null}
				</div>
			)}
		</>
	);
}

// 결과를 표시만 한다. 조회와 알림은 ConnectionStatus가 한다.
export function ProviderStatusCard({
	provider,
	result,
	checking,
	onRecheck,
}: {
	provider: ProviderId;
	// undefined면 아직 첫 확인이 끝나지 않았다.
	result: ProviderStatusResult | undefined;
	checking: boolean;
	onRecheck: () => void;
}) {
	const name = PROVIDER_LABEL[provider];
	return (
		<Card>
			<CardHeader className="gap-3">
				<CardTitle>
					<h2 translate="no">{name}</h2>
				</CardTitle>
				{result ? (
					<StatusBadge status={result.status} />
				) : (
					<Skeleton className="h-7 w-20" />
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				{result ? (
					<>
						<Details provider={provider} result={result} />
						<p className="text-muted-foreground text-sm tabular-nums">
							{timeText(new Date(result.checkedAt))} 확인
						</p>
					</>
				) : (
					<>
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-2/3" />
						<Skeleton className="h-4 w-24" />
					</>
				)}
			</CardContent>
			{/* 시안처럼 버튼이 카드 바닥에 붙어 세 카드에서 한 줄에 선다 */}
			<CardFooter className="mt-auto pt-0">
				{/* 확인 중에도 포커스는 남기고(focusableWhenDisabled) 누르기만 막는다. 같은 공급자로 두 번째 호출이 나가지 않는다 */}
				<Button
					variant="outline"
					size="lg"
					className="w-full aria-disabled:pointer-events-none"
					aria-label={`${name} ${checking ? "확인 중" : "다시 확인하기"}`}
					focusableWhenDisabled
					disabled={checking}
					onClick={onRecheck}
				>
					{checking ? (
						<Spinner data-icon="inline-start" aria-hidden="true" />
					) : null}
					{checking ? "확인 중" : "다시 확인하기"}
				</Button>
			</CardFooter>
		</Card>
	);
}
