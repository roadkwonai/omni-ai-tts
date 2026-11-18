"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { useWork } from "./paragraph-provider";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 주소 `/studio?script=<id>`(보관함 '열기')를 받는다(계획 2.3). 임시 작업을 되살린 뒤(restored) 한 번만 열고 주소에서 `script`를 뺀다.
// ref가 StrictMode 두 번 실행과 주소가 갱신되는 사이의 되풀이를 막는다. useSearchParams 때문에 이 컴포넌트만 <Suspense>로 감싸 /studio의 나머지는 정적 그리기를 유지한다
export function ScriptOpener({ onOpen }: { onOpen: (id: string) => void }) {
	const id = useSearchParams().get("script");
	const { restored } = useWork();
	const done = useRef(false);
	useEffect(() => {
		if (id === null) {
			done.current = false;
			return;
		}
		if (!restored || done.current) return;
		done.current = true;
		const rest = new URLSearchParams(window.location.search);
		rest.delete("script");
		const query = rest.toString();
		window.history.replaceState(
			null,
			"",
			query ? `/studio?${query}` : "/studio",
		);
		if (UUID.test(id)) onOpen(id);
	}, [id, restored, onOpen]);
	return null;
}
