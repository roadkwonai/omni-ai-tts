// 로그인(T14) 전까지 쓰는 로컬 관리자 모드의 소유자다. 소유자는 서버가 정하고 클라이언트 입력으로 받지 않는다.
export const LOCAL_OWNER_ID = "local-admin";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

// development·test이면서 루프백 Host로 들어온 요청만 소유자를 받는다. 그 밖에는 null이라 protectedProcedure가 거절한다.
// - production(배포 환경): 로그인 없이 배포하지 않기 위해서다.
// - 다른 도메인 이름(DNS 리바인딩): 127.0.0.1로 풀리게 한 남의 사이트는 CSRF 헤더를 붙일 수 있어서 Host로 막는다.
export function localOwnerId(
	nodeEnv: string,
	host: string | null,
): string | null {
	if (nodeEnv !== "development" && nodeEnv !== "test") return null;
	const hostname = host?.replace(/:\d+$/, "") ?? "";
	return LOOPBACK_HOSTNAMES.has(hostname) ? LOCAL_OWNER_ID : null;
}
