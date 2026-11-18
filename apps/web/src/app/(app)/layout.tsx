import { redirect } from "next/navigation";

import { AppFrame } from "@/components/app-frame";
import { getOwnerSession } from "@/context";
import { ENV } from "@/env.server";

// 앱 화면 보호(스펙 5.2)와 앱 틀(건너뛰기 링크·메뉴·main). 세션이 없거나 소유자가 아니면 /login으로 보낸다(접근 권한 없음 판은 /login이 그린다).
// 쿠키가 없을 때의 next는 proxy가 붙인다. 쿠키는 있는데 세션이 무효인 드문 경우만 next 없이 간다(layout은 경로를 모른다).
// 세션을 못 읽으면(DB 멈춤) 던지고 global-error가 받는다.
export default async function AppLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const owner = await getOwnerSession();
	if (owner.state !== "owner") redirect("/login");
	return (
		<AppFrame email={owner.email} demo={ENV.APP_MODE === "demo"}>
			{children}
		</AppFrame>
	);
}
