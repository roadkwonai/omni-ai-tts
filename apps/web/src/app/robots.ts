import type { MetadataRoute } from "next";

import { ENV } from "../env.server";

// 본인용은 검색에서 모두 빼고, 공개 데모만 허용한다(T15-a2). 빌드 때 정해진다(동적 API 없음).
export default function robots(): MetadataRoute.Robots {
	return ENV.APP_MODE === "demo"
		? { rules: { userAgent: "*", allow: "/" } }
		: { rules: { userAgent: "*", disallow: "/" } };
}
