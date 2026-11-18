import type { ReactNode } from "react";

import { AppNav } from "./app-nav";
import { DemoBand, DemoProvider } from "./demo";

// 앱 틀: 건너뛰기 링크, 메뉴, `<main id="main-content">`(앱 화면과 소유자의 없는 주소 화면이 함께 쓴다).
// 루트 레이아웃은 html·body·Providers만 그리고, 소개 페이지·로그인은 각자 main을 둔다.
// 데모에서는 이메일을 클라이언트로 넘기지 않는다(readOwner도 빈 값을 준다).
export function AppFrame({
	email,
	demo,
	children,
}: {
	email: string;
	demo: boolean;
	children: ReactNode;
}) {
	return (
		<DemoProvider demo={demo}>
			<div className="min-h-svh md:flex">
				<a
					href="#main-content"
					className="fixed top-2 left-2 z-50 -translate-y-20 rounded-lg bg-card px-4 py-3 outline-ring focus:translate-y-0 focus:outline-2"
				>
					본문으로 건너뛰기
				</a>
				<AppNav email={demo ? "" : email} />
				<main
					id="main-content"
					tabIndex={-1}
					className="min-w-0 flex-1 outline-none"
				>
					{demo ? <DemoBand /> : null}
					{children}
				</main>
			</div>
		</DemoProvider>
	);
}
