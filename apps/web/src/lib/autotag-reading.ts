// apps/web/src/lib/autotag-reading.ts

// 숫자 검수 창의 'AutoTag 참고' 후보(T11 스펙 4절, 계획 결정 6). Typecast AutoTag(@neosapience/typecast-autotag, MIT)는 브라우저에서 도는 순수 변환이다(외부 요청 없음).
// 첫 화면 묶음에 싣지 않게 창을 열 때만 동적으로 불러온다. 불러오기·변환 실패는 null로 삼키고 앱은 console.error를 부르지 않는다.
// 항목 글과 같은 결과·빈 결과도 null이다(참고할 것이 없다). 돌려주는 배열은 originals와 같은 순서다
export async function autoTagReadings(
	originals: readonly string[],
): Promise<(string | null)[]> {
	if (originals.length === 0) return [];
	try {
		const { autoTag } = await import("@neosapience/typecast-autotag");
		// 같은 원문은 한 번만 변환한다(대본에 같은 표기가 여러 번 나온다)
		const done = new Map(
			[...new Set(originals)].map((original): [string, string | null] => {
				try {
					const reading = autoTag(original, { language: "ko" }).trim();
					return [
						original,
						reading === "" || reading === original ? null : reading,
					];
				} catch {
					return [original, null];
				}
			}),
		);
		return originals.map((original) => done.get(original) ?? null);
	} catch {
		return originals.map(() => null);
	}
}
