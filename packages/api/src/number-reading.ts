// packages/api/src/number-reading.ts
import { SEND_TAGS } from "./paragraph-tags";

// 한국어 숫자 읽기 엔진(T11 스펙 3·4절): 원문에서 읽기 방식을 정해야 하는 숫자 표기(교정 항목)를 찾고 제안 읽기를 만든다.
// 순수 함수다. 사용자의 결정은 여기서 다루지 않는다(paragraph-script). 화면 문구는 두지 않고 이유는 키로만 돌려준다.
// 읽기 글은 앞뒤 글과 띄어 쓰는 것을 전제로 한 글이고, 실제 띄어쓰기는 spokenOf가 넣는다. 조사는 항목 밖이라 그대로 붙는다.

export type ReadingKind =
	| "money"
	| "phone"
	| "date"
	| "time"
	| "count"
	| "percent"
	| "decimal"
	| "temperature"
	| "range"
	| "fraction"
	| "product"
	| "number";
// 확인 필요인 이유(화면이 키로 문구를 고른다)
export type CheckReason =
	| "range"
	| "fraction"
	| "product"
	| "negative"
	| "unit"
	| "large"
	| "precision"
	| "leading_zero"
	// 쉼표로 이은 수 목록(1,2,3)이나 이어 쓴 단위가 작아지지 않는 수(3만 5만, 1억 20000만)라 한 수인지 나열인지 알 수 없다
	| "list"
	// 시각처럼 보이지만 비율·점수일 수 있다(16:10)
	| "time"
	// 단위 뒤에 조사가 아닌 한글이 붙어 단위인지 단어 일부인지 알 수 없다(30원칙)
	| "unit_join";
export type ReadingItem = {
	start: number;
	end: number;
	original: string;
	kind: ReadingKind;
	// 첫째가 기본 제안이다. 확인 필요 항목은 후보가 없을 수 있다
	readings: string[];
	needsCheck: boolean;
	reason?: CheckReason;
};
// keep: 매치 앞에서 이만큼(글자 수)만 항목으로 삼는다(뒤에 붙은 단위를 항목에서 뺄 때)
type Made = Omit<ReadingItem, "start" | "end" | "original"> & {
	keep?: number;
};

// 단위 표(고유어 수를 받는 단위 / 한자어 수를 받는 단위). 모르는 단위는 수만 한자어로 읽는다
const UNITS = {
	native: [
		"시간",
		"번째",
		"그릇",
		"마리",
		"켤레",
		"송이",
		"가지",
		"바퀴",
		"포기",
		"접시",
		"그루",
		"군데",
		"개",
		"명",
		"시",
		"살",
		"잔",
		"권",
		"대",
		"장",
		"병",
		"곳",
		"채",
		"벌",
		"통",
		"번",
		"달",
		"배",
	],
	sino: [
		"세기",
		"개월",
		"학년",
		"달러",
		"위안",
		"킬로",
		"미터",
		"리터",
		"그램",
		"분",
		"초",
		"원",
		"년",
		"일",
		"층",
		"호",
		"도",
		"점",
		"회",
		"주",
		"세",
		"엔",
		"위",
		"등",
		"반",
		"쪽",
		"편",
		"부",
		"평",
		"%",
	],
};
const NATIVE = new Set(UNITS.native);
const MONEY = new Set(["원", "달러", "엔", "위안"]);
// 셈과 번호·연령대가 갈려 자동으로 정하지 않는 단위(번: 횟수·번호, 대: 대수·연령대)
const AMBIGUOUS = new Set(["번", "대"]);
const UNIT_READ: Record<string, string> = { "%": "퍼센트" };
// 긴 단위가 먼저 맞게(시간 > 시, 개월 > 개)
const UNIT_RE = [...UNITS.native, ...UNITS.sino]
	.sort((a, b) => b.length - a.length)
	.join("|");

const DIGITS = ["영", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const POSITION = ["", "십", "백", "천"];
const GROUP = ["", "만", "억", "조"];
const NATIVE_ONES = [
	"",
	"한",
	"두",
	"세",
	"네",
	"다섯",
	"여섯",
	"일곱",
	"여덟",
	"아홉",
];
const NATIVE_TENS = [
	"",
	"열",
	"스물",
	"서른",
	"마흔",
	"쉰",
	"예순",
	"일흔",
	"여든",
	"아흔",
];
// 조(10¹²) 미만 정수만 읽는다
const INT_MAX = 12;

// 네 자리 묶음. 십·백·천 앞의 일은 생략한다
const sinoGroup = (group: string) =>
	[...group.padStart(4, "0")]
		.map((c, i) => {
			const d = Number(c);
			const pos = 3 - i;
			return d === 0
				? ""
				: (d === 1 && pos > 0 ? "" : (DIGITS[d] ?? "")) + (POSITION[pos] ?? "");
		})
		.join("");

// 한자어 수. 만·억 단위는 띄어 쓰고, 만 앞의 일은 생략, 억 앞은 남긴다
function sinoOf(digits: string): string {
	const n = digits.replace(/^0+(?=\d)/, "");
	if (n === "0") return "영";
	const padded = n.padStart(Math.ceil(n.length / 4) * 4, "0");
	const groups = padded.match(/\d{4}/g) ?? [];
	return groups
		.flatMap((g, i) => {
			if (Number(g) === 0) return [];
			const unit = GROUP[groups.length - 1 - i] ?? "";
			return [(g === "0001" && unit === "만" ? "" : sinoGroup(g)) + unit];
		})
		.join(" ");
}

// 고유어 수(관형형). 100 이상은 한자어 백·천 + 고유어 끝
function nativeOf(digits: string): string {
	const n = Number(digits);
	if (n === 0) return "영";
	const low = n % 100;
	const head = n - low > 0 ? sinoOf(String(n - low)) : "";
	if (low === 0) return head;
	return (
		head +
		(low === 20
			? "스무"
			: (NATIVE_TENS[Math.floor(low / 10)] ?? "") +
				(NATIVE_ONES[low % 10] ?? ""))
	);
}

// 쉼표 없는 숫자 글(소수 가능)을 읽는다. 소수는 단위와 상관없이 한자어, 정수 부분이 조 이상이면 null
function numberText(raw: string, native: boolean): string | null {
	const [int = "", frac] = raw.replace(/,/g, "").split(".");
	if (int.replace(/^0+/, "").length > INT_MAX) return null;
	if (frac !== undefined)
		return `${sinoOf(int)} 점 ${[...frac].map((c) => DIGITS[Number(c)]).join("")}`;
	return native ? nativeOf(int) : sinoOf(int);
}

const SMALL_MUL: Record<string, number> = { 천: 1000, 백: 100, 십: 10 };
const BIG_MUL: Record<string, number> = { 만: 1e4, 억: 1e8, 조: 1e12 };
const unitText = (unit: string) => UNIT_READ[unit] ?? unit;
const quantity = (raw: string, unit?: string): string | null => {
	if (raw === "1" && unit === "번째") return "첫 번째";
	const text = numberText(raw, unit !== undefined && NATIVE.has(unit));
	return text === null || unit === undefined
		? text
		: `${text} ${unitText(unit)}`;
};
const unique = (list: string[]) => [...new Set(list)];

// 단위 바로 뒤에 올 수 있는 조사·어미의 시작. 이 밖의 한글이 붙으면 단어의 일부일 수 있다(30원칙, 5분석)
const PARTICLE =
	/^(?:으로|부터|까지|처럼|보다|입니다|짜리|마다|밖에|정도|라도|라고|한테|[은는이가을를의에와과도만로씩째쯤간후전내뿐며면요고서께경])/;
const HANGUL = /^[가-힣]/;
// 매치 뒤 글. 단위가 단어 일부면 단위를 빼고(unit 없음) 그 앞까지만 항목으로 삼는다
// bad: 뒤 글이 조사가 아닌 한글. joined: 단위가 있는데 bad라 단위를 뺐다
function afterUnit(m: RegExpMatchArray, unit: string | undefined) {
	const rest = m.input?.slice((m.index ?? 0) + m[0].length) ?? "";
	// %는 단어의 일부일 수 없다: 뒤에 무엇이 붙어도(3.5%예요) 단위로 읽는다
	const bad = unit !== "%" && HANGUL.test(rest) && !PARTICLE.test(rest);
	return unit !== undefined && bad
		? {
				unit: undefined,
				bad,
				joined: true,
				keep: m[0].slice(0, -unit.length).trimEnd().length,
			}
		: { unit, bad, joined: false, keep: undefined };
}
function kindOf(unit: string | undefined, decimal: boolean): ReadingKind {
	if (unit === undefined) return decimal ? "decimal" : "number";
	if (MONEY.has(unit)) return "money";
	if (unit === "%") return "percent";
	return unit === "도" ? "temperature" : "count";
}

const NUMBER = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
// 앞에 영문자나 다른 숫자 조각이 붙은 수는 이 패턴들의 몫이 아니다
const NOT_AFTER = String.raw`(?<![A-Za-z]|\d|\d[.,])`;
const SIGN = String.raw`(?:(?<=^|[\s(\["'“‘])(-))?`;

const product = (): Made => ({
	kind: "product",
	readings: [],
	needsCheck: true,
	reason: "product",
});

// 긴 패턴이 먼저다. 겹치는 범위는 앞선 패턴이 가진다(스펙 4절)
const RULES: { re: RegExp; make: (m: RegExpMatchArray) => Made | null }[] = [
	// 영문자에 붙은 숫자(GPT-4o, v1.2.3, 4K, iPhone 16, 2026.06.10): 숫자 규칙으로 바꾸지 않는다
	{
		re: /(?<![A-Za-z0-9])[A-Za-z]+-?\d+(?:\.\d+)*[A-Za-z0-9]*/g,
		make: product,
	},
	// 띄어 쓴 제품명은 대문자가 든 단어일 때만(소문자 영어 문장의 "have 3"은 제외)
	{
		re: /(?<![A-Za-z0-9])[A-Za-z]*[A-Z][A-Za-z]* \d+(?:\.\d+)*[A-Za-z0-9]*/g,
		make: product,
	},
	{
		re: new RegExp(
			// 앞의 시각 꼴(3:05pm)까지 한 덩어리로 잡아 '05pm'만 떼어지지 않게 한다
			String.raw`${NOT_AFTER}(?:\d+:)?\d+(?:[.,]\d+)*[A-Za-z]+[A-Za-z0-9]*`,
			"g",
		),
		make: product,
	},
	{
		re: new RegExp(String.raw`${NOT_AFTER}\d+(?:\.\d+){2,}`, "g"),
		make: product,
	},
	// 쉼표로 이은 수(1,2,3 · 3,4명): 올바른 천 단위 묶음이 아니면 한 항목으로 잡고 후보 없이 확인 필요
	{
		re: new RegExp(String.raw`${NOT_AFTER}\d+(?:,\d+)+`, "g"),
		make: (m) =>
			/^\d{1,3}(?:,\d{3})+$/.test(m[0])
				? null
				: { kind: "number", readings: [], needsCheck: true, reason: "list" },
	},
	// 전화번호
	{
		re: /(?<![\d-])0\d{1,2}-\d{3,4}-\d{4}(?![\d-])/g,
		make: (m) => {
			const spell = (zero: string) =>
				m[0]
					.split("-")
					.map((g) =>
						[...g].map((c) => (c === "0" ? zero : DIGITS[Number(c)])).join(""),
					)
					.join(" ");
			return {
				kind: "phone",
				readings: [spell("공"), spell("영")],
				needsCheck: false,
			};
		},
	},
	// 날짜(월이 있는 것만). 6월 → 유월, 10월 → 시월
	{
		re: new RegExp(
			`${NOT_AFTER}(?:(\\d{1,4}) ?년 ?)?(0?[1-9]|1[0-2]) ?월(?: ?(0?[1-9]|[12]\\d|3[01]) ?일)?`,
			"g",
		),
		make: (m) => {
			const month = Number(m[2]);
			const parts = [
				...(m[1] ? [`${sinoOf(m[1])} 년`] : []),
				month === 6
					? "유월"
					: month === 10
						? "시월"
						: `${sinoOf(String(month))} 월`,
				...(m[3] ? [`${sinoOf(m[3])} 일`] : []),
			];
			return { kind: "date", readings: [parts.join(" ")], needsCheck: false };
		},
	},
	// 시각 H:MM (0~24시, 00~59분). 정각은 분을 읽지 않는다.
	// 앞에 오전·오후 따위가 있거나 뒤에 시간 조사(에·부터·까지·쯤)가 올 때만 확실하고, 그 밖(16:10 비율, 5:30 승)은 확인 필요
	{
		re: /(?<![\d:.])([01]?\d|2[0-4]):([0-5]\d)(?![\d:])/g,
		make: (m) => {
			const minute = Number(m[2]);
			// 24시는 24:00만(24:01~은 시각이 아니라 콜론 식 규칙이 받는다)
			if (m[1] === "24" && minute > 0) return null;
			const at = m.index ?? 0;
			const input = m.input ?? "";
			const sure =
				/(?:오전|오후|새벽|아침|낮|저녁|밤) ?$/.test(
					input.slice(Math.max(0, at - 4), at),
				) ||
				// 조사 바로 뒤에 한글이 오면 단어 일부다(2:10 경기의 '경', 3:05 에어컨의 '에')
				/^ ?(?:에서?|에는|에도|부터|까지|쯤|경|무렵|정각|이후|이전)(?![가-힣])/.test(
					input.slice(at + m[0].length, at + m[0].length + 6),
				);
			return {
				kind: "time",
				readings: [
					`${nativeOf(m[1] ?? "0")} 시${minute > 0 ? ` ${sinoOf(String(minute))} 분` : ""}`,
				],
				needsCheck: !sure,
				...(sure ? {} : { reason: "time" as const }),
			};
		},
	},
	// 범위(1~3개)
	{
		re: new RegExp(
			`${NOT_AFTER}(${NUMBER}) ?[~–] ?(${NUMBER})(${UNIT_RE})?`,
			"g",
		),
		make: (m) => {
			const [, a = "", b = "", unit] = m;
			const full = [quantity(a, unit), quantity(b, unit)];
			const bare = [numberText(a, false), numberText(b, false)];
			const [x, y] = full;
			const [p, q] = bare;
			const readings =
				x == null || y == null || p == null || q == null
					? []
					: unique([
							`${x}에서 ${y}`,
							`${p}에서 ${q}${unit === undefined ? "" : ` ${unitText(unit)}`}`,
						]);
			return { kind: "range", readings, needsCheck: true, reason: "range" };
		},
	},
	// 분수·식(1/2, 3·1, 3-1, 3:1, 2026-06-10): 1/2 꼴만 후보를 둔다
	{
		re: new RegExp(
			String.raw`${NOT_AFTER}\d+(?:[.,]\d+)*(?:[-·ㆍ/:]\d+(?:[.,]\d+)*)+`,
			"g",
		),
		make: (m) => {
			const [, a, b] = /^(\d+)\/(\d+)$/.exec(m[0]) ?? [];
			return {
				kind: "fraction",
				readings:
					a && b && a.length <= INT_MAX && b.length <= INT_MAX
						? [`${sinoOf(b)} 분의 ${sinoOf(a)}`]
						: [],
				needsCheck: true,
				reason: "fraction",
			};
		},
	},
	// 제N장·제N회: 한자어 서수. original에 제를 포함한다
	{
		re: new RegExp(`(?<![가-힣])제(\\d+)(${UNIT_RE}|과|절|항|조|차)?`, "g"),
		make: (m) => {
			const { unit, joined, keep } = afterUnit(m, m[2]);
			const num = numberText(m[1] ?? "", false);
			return {
				kind: "count",
				readings:
					num === null
						? []
						: [`제${num}${unit === undefined ? "" : ` ${unitText(unit)}`}`],
				needsCheck: num === null || joined,
				...(num === null ? { reason: "large" as const } : {}),
				...(num !== null && joined ? { reason: "unit_join" as const } : {}),
				...(keep === undefined ? {} : { keep }),
			};
		},
	},
	// 한글 수 단위가 섞인 표기(1억 원, 5천만 원, 1억 2천만 원, 2조 3억)를 한 항목으로
	{
		re: new RegExp(
			`${NOT_AFTER}((?:(?:${NUMBER})(?:[천백십][만억조]?|[만억조]))(?: ?(?:${NUMBER})(?:[천백십][만억조]?|[만억조]))*)(?: ?(${UNIT_RE}))?`,
			"g",
		),
		make: (m) => {
			const { unit, bad, joined, keep } = afterUnit(m, m[2]);
			// 단위가 없는데 한글이 붙으면(3만큼) 수량 표기가 아니다
			if (m[2] === undefined && bad) return null;
			// 천·백·십 조각을 묶음(group)에 모아 만·억·조를 한 번에 곱한다(3천5백만 = 3,500만).
			// 조각이 여럿인데 단위가 작아지지 않거나(3만 5만, 2천 3천) 묶음이 만 이상이면(1억 20000만) 한 수인지 나열인지 알 수 없다
			const pieces = [
				...(m[1] ?? "").matchAll(
					new RegExp(`(${NUMBER})([천백십]?)([만억조]?)`, "g"),
				),
			];
			let sum = 0;
			let group = 0;
			let under = Number.POSITIVE_INFINITY;
			let above = Number.POSITIVE_INFINITY;
			let ordered = true;
			for (const [, n = "", small = "", big] of pieces) {
				const mul = SMALL_MUL[small] ?? 1;
				const value = Number(n.replace(/,/g, "")) * mul;
				group += value;
				ordered &&= value < under && (group < 1e4 || pieces.length === 1);
				under = mul;
				if (!big) continue;
				const unit = BIG_MUL[big] ?? 1;
				ordered &&= unit < above;
				sum += Math.round(group * unit);
				group = 0;
				under = Number.POSITIVE_INFINITY;
				above = unit;
			}
			sum += Math.round(group);
			const safe = Number.isSafeInteger(sum);
			if (!ordered)
				return {
					kind: kindOf(unit, false),
					readings: [],
					needsCheck: true,
					reason: "list",
					...(keep === undefined ? {} : { keep }),
				};
			return {
				kind: kindOf(unit, false),
				readings: safe
					? [
							`${sinoOf(String(sum))}${unit === undefined ? "" : ` ${unitText(unit)}`}`,
						]
					: [],
				needsCheck: !safe || sum >= 1e12 || joined,
				...(!safe || sum >= 1e12
					? { reason: "large" as const }
					: joined
						? { reason: "unit_join" as const }
						: {}),
				...(keep === undefined ? {} : { keep }),
			};
		},
	},
	// 금액·단위 수량·비율·소수·온도·일반 수
	{
		re: new RegExp(`${NOT_AFTER}${SIGN}(${NUMBER})(${UNIT_RE})?`, "g"),
		make: (m) => {
			const [, sign, num = ""] = m;
			const { unit, joined, keep } = afterUnit(m, m[3]);
			const negative = sign === "-";
			const kind = kindOf(unit, num.includes("."));
			// 앞이 0인 수(007)는 수가 아니라 번호다: 숫자를 하나씩 읽는 후보만 둔다
			if (/^0\d/.test(num))
				return {
					kind,
					readings: /^\d+$/.test(num)
						? [[...num].map((c) => DIGITS[Number(c)]).join("")]
						: [],
					needsCheck: true,
					reason: "leading_zero",
				};
			const body = quantity(num, unit);
			const alt =
				unit !== undefined && AMBIGUOUS.has(unit)
					? `${numberText(num, false)} ${unitText(unit)}`
					: null;
			const prefixes = negative
				? unit === "도"
					? ["영하 ", "마이너스 "]
					: ["마이너스 "]
				: [""];
			const readings =
				body === null
					? []
					: unique(
							prefixes.flatMap((p) =>
								[body, ...(alt ? [alt] : [])].map((r) => p + r),
							),
						);
			const reason: CheckReason | undefined =
				body === null
					? "large"
					: negative && unit !== "도"
						? "negative"
						: joined
							? "unit_join"
							: unit !== undefined && AMBIGUOUS.has(unit)
								? "unit"
								: (num.split(".")[1]?.length ?? 0) > 2
									? "precision"
									: undefined;
			return {
				kind,
				readings,
				needsCheck: reason !== undefined,
				...(reason ? { reason } : {}),
				...(keep === undefined ? {} : { keep }),
			};
		},
	},
];

function find(text: string): ReadingItem[] {
	// 빼기표(U+2212)는 '-'와 같게 본다. 길이가 같아 위치는 그대로다
	const plain = text.replaceAll("\u{2212}", "-");
	// 태그(SEND_TAGS: [break 2] 같은 모양)는 먼저 가려 둔다. 전역 식이라 복사해서 matchAll만 쓴다
	const taken: [number, number][] = [
		...plain.matchAll(new RegExp(SEND_TAGS)),
	].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length]);
	const items: ReadingItem[] = [];
	for (const { re, make } of RULES) {
		for (const m of plain.matchAll(re)) {
			const start = m.index ?? 0;
			const end = start + m[0].length;
			if (taken.some(([a, b]) => start < b && a < end)) continue;
			const made = make(m);
			if (!made) continue;
			const { keep, ...rest } = made;
			const stop = keep === undefined ? end : start + keep;
			taken.push([start, stop]);
			items.push({
				start,
				end: stop,
				original: text.slice(start, stop),
				...rest,
				// 통화 기호 뒤 수는 기호를 어떻게 읽을지 모른다($5 → '$오'가 되지 않게)
				...(!rest.needsCheck &&
				/[$₩€£¥＄￦￡￥]-?$/.test(plain.slice(Math.max(0, start - 2), start))
					? { needsCheck: true, reason: "unit" as const }
					: {}),
			});
		}
	}
	return items.sort((a, b) => a.start - b.start);
}

// 결과 캐시: 같은 글이면 같은 배열(키 입력마다 200문단 전체를 다시 돌리지 않게, 계획 결정 1). 가장 오래 안 쓴 것부터 버린다
const CACHE = new Map<string, ReadingItem[]>();
const CACHE_MAX = 400;
const NONE: ReadingItem[] = [];

export function readingItems(text: string): ReadingItem[] {
	if (!/\d/.test(text)) return NONE;
	const hit = CACHE.get(text);
	if (hit) {
		// 적중하면 맨 뒤로 옮겨 최근 사용 순을 지킨다
		CACHE.delete(text);
		CACHE.set(text, hit);
		return hit;
	}
	const items = find(text);
	if (CACHE.size >= CACHE_MAX) {
		const oldest = CACHE.keys().next().value;
		if (oldest !== undefined) CACHE.delete(oldest);
	}
	CACHE.set(text, items);
	return items;
}
