import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

// 쿠키 유무만 보는 낙관적 확인이다. 실제 판정은 (app)/layout과 protectedProcedure가 한다.
// `/`는 공개 랜딩이라 쿠키 없이 통과한다(로그인한 소유자를 /studio로 보내는 일은 페이지가 한다).
export function proxy(request: NextRequest) {
	const { pathname, search } = request.nextUrl;
	if (pathname === "/" || pathname === "/login" || getSessionCookie(request)) {
		return NextResponse.next();
	}
	const url = new URL("/login", request.url);
	url.searchParams.set("next", pathname + search);
	return NextResponse.redirect(url);
}

export const config = {
	// 공개 정적 파일(public/brand·screenshots, 앱 아이콘, 메타데이터 파일)은 proxy를 거치지 않는다
	matcher: [
		"/((?!api|_next/static|_next/image|favicon\\.ico$|brand/|screenshots/|icon\\.png$|apple-icon\\.png$|robots\\.txt$|sitemap\\.xml$).*)",
	],
};
