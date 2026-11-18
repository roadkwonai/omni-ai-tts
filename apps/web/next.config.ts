import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";

const withVarlock = varlockNextConfigPlugin();

import type { NextConfig } from "next";
import { robotsHeaders } from "./next-headers";

const nextConfig: NextConfig = {
	typedRoutes: true,
	reactCompiler: true,
	devIndicators: { position: "bottom-right" },
	headers: async () => robotsHeaders(process.env.APP_MODE),
	// 데모 샘플 mp3를 서버리스 함수에 포함한다(동적 fs 읽기라 자동 추적이 못 잡는다).
	outputFileTracingIncludes: {
		"/api/rpc/[[...rest]]": ["./public/samples/**"],
	},
};

export default withVarlock(nextConfig);
