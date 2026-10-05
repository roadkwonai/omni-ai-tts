// 시험 생성 결과의 blob: 주소(결과 id마다 하나). 지우거나 화면을 떠날 때 해제한다(tts-provider 화면 절, 스펙 AC9)
export function blobUrls(
	create = (blob: Blob) => URL.createObjectURL(blob),
	revoke = (url: string) => URL.revokeObjectURL(url),
) {
	const urls = new Map<string, string>();
	return {
		get: (id: string) => urls.get(id),
		ensure(id: string, blob: Blob) {
			const known = urls.get(id);
			if (known) return known;
			for (const old of urls.values()) revoke(old);
			urls.clear();
			const url = create(blob);
			urls.set(id, url);
			return url;
		},
		forget(id: string) {
			const url = urls.get(id);
			if (url === undefined) return;
			revoke(url);
			urls.delete(id);
		},
		clear() {
			for (const url of urls.values()) revoke(url);
			urls.clear();
		},
	};
}
