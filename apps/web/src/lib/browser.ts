// apps/web/src/lib/browser.ts
// 화면이 함께 쓰는 브라우저 도우미(음성 작업실·드라마 작업실). studio-provider.tsx에서 그대로 옮겼다(계획 '스펙과 다른 점' 9)

// 이 브라우저 저장소(임시 작업). 사생활 보호 창·용량 초과·꺼짐이면 던지므로 조용히 넘긴다(client-localstorage-schema)
export function loadStored(key: string): string | null {
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}
export function store(key: string, value: string) {
	try {
		window.localStorage.setItem(key, value);
	} catch {
		// 저장하지 못해도 화면은 그대로 쓴다(새로 고침하면 처음 값)
	}
}
// 받은 오디오를 파일로 저장한다(생성 API를 부르지 않는다, REQ-10). 다운로드가 시작될 시간을 두고 주소를 푼다
export function saveBlob(blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 40_000);
}
