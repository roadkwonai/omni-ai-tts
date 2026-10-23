// apps/web/src/lib/zip-store.ts
// '모두 받기' zip(스펙 2절). WAV는 압축 효과가 작아 저장 방식(0)만 쓰고, 새 의존성 없이 PKZIP 머리를 직접 쓴다.
// 조각을 하나로 이어 붙이지 않고 Blob이 뷰를 그대로 담는다(계획 리뷰 E13)
// shortcut: zip64 없음(파일·전체 4GiB 미만). 드라마는 32MiB 장면 + 대사 50개라 넉넉하고, 문단 작업실은 문단 200개(결과마다 32MiB 상한)라
// 이론상 넘을 수 있다. 더 큰 묶음이 실제로 생기면 zip64 끝 레코드를 더한다

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const VERSION = 20;
// 이름이 UTF-8이다(한글 파일 이름)
const UTF8 = 0x0800;
// 1980-01-01, 시각 0. 만든 시각을 담지 않는다(파일 이름에 있다)
const DOS_DATE = 0x0021;

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(parts: readonly Uint8Array[]): number {
	let c = 0xffffffff;
	for (const part of parts)
		for (let i = 0; i < part.length; i++)
			c = CRC_TABLE[(c ^ part[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

// 지역 머리(4바이트부터)와 중앙 항목(6바이트부터)이 같은 차례로 쓰는 칸: 필요 판, 플래그, 방식, 시각, 날짜, CRC, 크기 둘, 이름 길이
function shared(
	v: DataView,
	at: number,
	crc: number,
	size: number,
	nameBytes: number,
) {
	v.setUint16(at, VERSION, true);
	v.setUint16(at + 2, UTF8, true);
	v.setUint16(at + 4, 0, true);
	v.setUint16(at + 6, 0, true);
	v.setUint16(at + 8, DOS_DATE, true);
	v.setUint32(at + 10, crc, true);
	v.setUint32(at + 14, size, true);
	v.setUint32(at + 18, size, true);
	v.setUint16(at + 22, nameBytes, true);
}

// 조각은 ArrayBuffer 위의 뷰다(TS 5+ BlobPart). 복사하지 않는다(계획 재리뷰 R3)
export function zipStore(
	files: readonly { name: string; parts: readonly Uint8Array<ArrayBuffer>[] }[],
): Blob {
	const encoder = new TextEncoder();
	const body: Uint8Array<ArrayBuffer>[] = [];
	const central: Uint8Array<ArrayBuffer>[] = [];
	let offset = 0;
	for (const file of files) {
		const name = encoder.encode(file.name);
		const size = file.parts.reduce((sum, part) => sum + part.length, 0);
		const crc = crc32(file.parts);
		const local = new Uint8Array(30 + name.length);
		const l = new DataView(local.buffer);
		l.setUint32(0, LOCAL, true);
		shared(l, 4, crc, size, name.length);
		local.set(name, 30);
		const entry = new Uint8Array(46 + name.length);
		const c = new DataView(entry.buffer);
		c.setUint32(0, CENTRAL, true);
		c.setUint16(4, VERSION, true);
		shared(c, 6, crc, size, name.length);
		c.setUint32(42, offset, true);
		entry.set(name, 46);
		body.push(local, ...file.parts);
		central.push(entry);
		offset += local.length + size;
	}
	const end = new Uint8Array(22);
	const e = new DataView(end.buffer);
	e.setUint32(0, END, true);
	e.setUint16(8, files.length, true);
	e.setUint16(10, files.length, true);
	e.setUint32(
		12,
		central.reduce((sum, entry) => sum + entry.length, 0),
		true,
	);
	e.setUint32(16, offset, true);
	return new Blob([...body, ...central, end], { type: "application/zip" });
}
