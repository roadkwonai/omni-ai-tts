import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

// 쿠키 유무만 보는 낙관적 확인이다. 실제 판정은 (app)/layout과 protectedProcedure가 한다.
export function proxy(request: NextRequest) {
	const { pathname, search } = request.nextUrl;
	if (pathname === "/login" || getSessionCookie(request)) {
		return NextResponse.next();
	}
	const url = new URL("/login", request.url);
	url.searchParams.set("next", pathname + search);
	return NextResponse.redirect(url);
}

export const config = {
	matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
