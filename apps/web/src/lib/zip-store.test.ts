// apps/web/src/lib/zip-store.test.ts
import { cutWav, wavOf } from "@tts-pilot-app/api/drama-script";
import { describe, expect, it } from "vitest";

import { zipStore } from "./zip-store";

const enc = new TextEncoder();
const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;

describe("모두 받기 zip(저장 방식, 스펙 2절)", () => {
	it("지역 머리·중앙 디렉터리·끝 레코드가 맞고, 조각을 이어 붙이지 않아도 CRC·크기가 파일 전체다", async () => {
		const name1 = enc.encode("장면.wav");
		const name2 = enc.encode("빈.txt");
		// 앞에 다른 바이트가 있는 뷰(cutWav의 subarray처럼)도 그 범위만 담는다
		const he = enc.encode("xxhe").subarray(2);
		const blob = zipStore([
			{ name: "장면.wav", parts: [he, enc.encode("llo")] },
			{ name: "빈.txt", parts: [] },
		]);
		expect(blob.type).toBe("application/zip");
		const bytes = new Uint8Array(await blob.arrayBuffer());
		const v = new DataView(bytes.buffer);
		const u16 = (at: number) => v.getUint16(at, true);
		const u32 = (at: number) => v.getUint32(at, true);

		// 첫 지역 머리(30바이트 + 이름)와 데이터
		expect(u32(0)).toBe(LOCAL);
		expect(u16(6)).toBe(0x0800); // 이름이 UTF-8
		expect(u16(8)).toBe(0); // 저장(압축 없음)
		expect(u16(10)).toBe(0); // 시각 0
		expect(u16(12)).toBe(0x0021); // 1980-01-01
		expect(u32(14)).toBe(0x3610a686); // CRC32("hello")
		expect([u32(18), u32(22)]).toEqual([5, 5]);
		expect([u16(26), u16(28)]).toEqual([name1.length, 0]);
		expect(bytes.slice(30, 30 + name1.length)).toEqual(name1);
		const data1 = 30 + name1.length;
		expect(new TextDecoder().decode(bytes.slice(data1, data1 + 5))).toBe(
			"hello",
		);

		// 둘째 지역 머리: 빈 파일
		const local2 = data1 + 5;
		expect(u32(local2)).toBe(LOCAL);
		expect([u32(local2 + 14), u32(local2 + 18), u32(local2 + 22)]).toEqual([
			0, 0, 0,
		]);
		expect(bytes.slice(local2 + 30, local2 + 30 + name2.length)).toEqual(name2);

		// 끝 레코드(22바이트)
		const end = bytes.length - 22;
		expect(u32(end)).toBe(END);
		expect([u16(end + 8), u16(end + 10)]).toEqual([2, 2]);
		const size = u32(end + 12);
		const offset = u32(end + 16);
		expect(offset).toBe(local2 + 30 + name2.length);
		expect(size).toBe(46 + name1.length + 46 + name2.length);
		expect(offset + size).toBe(end);
		expect(u16(end + 20)).toBe(0);

		// 중앙 디렉터리 항목 둘: 지역 머리와 같은 값, 지역 머리 위치
		const c1 = offset;
		expect(u32(c1)).toBe(CENTRAL);
		expect([u16(c1 + 8), u16(c1 + 10), u16(c1 + 12), u16(c1 + 14)]).toEqual([
			0x0800, 0, 0, 0x0021,
		]);
		expect([u32(c1 + 16), u32(c1 + 20), u32(c1 + 24)]).toEqual([
			0x3610a686, 5, 5,
		]);
		expect([u16(c1 + 28), u16(c1 + 30), u16(c1 + 32)]).toEqual([
			name1.length,
			0,
			0,
		]);
		expect(u32(c1 + 42)).toBe(0);
		expect(bytes.slice(c1 + 46, c1 + 46 + name1.length)).toEqual(name1);
		const c2 = c1 + 46 + name1.length;
		expect(u32(c2)).toBe(CENTRAL);
		expect(u32(c2 + 42)).toBe(local2);
		expect(bytes.slice(c2 + 46, c2 + 46 + name2.length)).toEqual(name2);
	});
	it("장면 WAV에서 자른 줄 조각을 복사 없이 Blob·zip에 담는다(cutWav 조각이 BlobPart인지 타입 검사가 본다)", async () => {
		const pcm = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
		const parts = cutWav(wavOf(pcm), { cutStart: 0, cutEnd: 1 });
		expect(new Blob(parts, { type: "audio/wav" }).size).toBe(44 + 8);
		const name = enc.encode("1번.wav");
		const zip = zipStore([{ name: "1번.wav", parts }]);
		expect(zip.size).toBe(30 + name.length + 52 + 46 + name.length + 22);
		const bytes = new Uint8Array(await zip.arrayBuffer());
		const data = 30 + name.length + 44;
		expect(bytes.slice(data, data + 8)).toEqual(pcm);
	});
	it('CRC32 표준 검사값("123456789" → 0xcbf43926)', async () => {
		const bytes = new Uint8Array(
			await zipStore([
				{ name: "a", parts: [enc.encode("1234"), enc.encode("56789")] },
			]).arrayBuffer(),
		);
		expect(new DataView(bytes.buffer).getUint32(14, true)).toBe(0xcbf43926);
	});
});
