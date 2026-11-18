// 본인용(owner) 배포는 검색 색인을 막고, 공개 데모(APP_MODE=demo)는 연다.
export function robotsHeaders(appMode: string | undefined) {
	if (appMode === "demo") return [];
	return [
		{
			source: "/:path*",
			headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
		},
	];
}
