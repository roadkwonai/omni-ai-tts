import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@tts-pilot-app/ui/components/empty";
import { Link2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// 본문 자리의 안내 하나(소유자 없음, 오류, 빈 상태). 제목은 h2(AF-05), 아래에 링크·버튼 묶음(children).
// 새로 나타나 알려야 하는 안내(오류 등)는 role="alert"를 넘긴다.
export function Notice({
	icon: Icon,
	title,
	description,
	children,
	role,
}: {
	icon?: LucideIcon;
	title: string;
	description?: ReactNode;
	children?: ReactNode;
	role?: "alert";
}) {
	return (
		<Empty className="border bg-card" role={role}>
			<EmptyHeader>
				{Icon ? (
					<EmptyMedia variant="icon">
						<Icon aria-hidden="true" />
					</EmptyMedia>
				) : null}
				<EmptyTitle>{title}</EmptyTitle>
				{description ? (
					<EmptyDescription>{description}</EmptyDescription>
				) : null}
			</EmptyHeader>
			{children ? (
				<EmptyContent className="flex-row flex-wrap justify-center">
					{children}
				</EmptyContent>
			) : null}
		</Empty>
	);
}

// 소유자 없음(루프백이 아닌 주소로 열었을 때) 안내. 제목만 화면마다 다르다.
export function LoopbackNotice({ title }: { title: string }) {
	return (
		<Notice
			icon={Link2}
			title={title}
			description={
				<>
					개발 서버(
					<code translate="no" className="font-mono">
						pnpm dev
					</code>
					)를 127.0.0.1 또는 localhost 주소로 열어 주세요.
				</>
			}
		/>
	);
}
