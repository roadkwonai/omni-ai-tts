// packages/api/src/drama-autotag.ts
import { ACTING, type ActingFamily, type Feel } from "./drama-acting";
import {
	type DraftLine,
	type DraftSpeaker,
	newSpeaker,
	speakerNameOf,
} from "./drama-request";
import { cleanDirection } from "./drama-script";
import { normalizeText } from "./providers/trial-options";

// 전체 자동 태그(브리프 14절 배치 6, 스펙 14.5). 보낸 줄(그때의 줄 객체와 번호, 보낸 지시)을 기억해 미리 보기와 '모두 바꾸기'가 쓴다
export type AutoTagSent = { line: DraftLine; n: number; direction: string };
type AutoTagLine = Pick<DraftLine, "direction" | "text" | "feel">;
export type AutoTagChange = AutoTagSent & {
	fields: {
		field: "direction" | "text" | "feel";
		before: string;
		after: string;
	}[];
	// 바뀐 칸만 넣는다(바뀌지 않은 칸은 사용자 원문 그대로 둔다)
	patch: Partial<AutoTagLine>;
};

// 줄마다 보낼 지시. 지시 칸이 숨은 화자(front 없는 family)의 줄은 빈 값이다(고칠 칸이 없고 공급자로 가지도 않는다, 숨은 지시는 줄에 둔다)
export function directionSent(
	speakers: readonly DraftSpeaker[],
	cast: (index: number) => { family: ActingFamily },
) {
	const hidden = speakers.map(
		(_, i) => ACTING[cast(i).family].front.length === 0,
	);
	return (line: DraftLine) => (hidden[line.speaker] ? "" : line.direction);
}

// 입력. 빈 대사는 계약이 받지 않으므로 대사가 있는 줄만 보내고, 그 줄이 쓰는 화자만 번호를 다시 매긴다(requestOf와 같다).
// cast(i)는 화자 i의 연기 family·모델·받는 감정(DramaProvider.actingOf), 이름은 보이는 이름이다
export function autoTagInput(
	speakers: readonly DraftSpeaker[],
	lines: readonly DraftLine[],
	cast: (index: number) => {
		family: ActingFamily;
		model: string;
		emotions: string[] | null;
	},
	fishOnly: boolean,
) {
	const directionOf = directionSent(speakers, cast);
	const sent: AutoTagSent[] = [];
	lines.forEach((line, i) => {
		if (normalizeText(line.text) !== "")
			sent.push({ line, n: i + 1, direction: directionOf(line) });
	});
	const used = [...new Set(sent.map(({ line }) => line.speaker))].sort(
		(a, b) => a - b,
	);
	const renumbered = new Map(used.map((index, i) => [index, i]));
	return {
		sent,
		input: {
			mode: fishOnly ? ("scene" as const) : ("read" as const),
			speakers: used.map((index) => {
				const { model, emotions } = cast(index);
				return {
					name: speakerNameOf(speakers, index),
					provider: (speakers[index] ?? newSpeaker("")).provider,
					model,
					emotions,
				};
			}),
			lines: sent.map(({ line, direction }) => ({
				speaker: renumbered.get(line.speaker) ?? 0,
				direction,
				text: line.text,
				feel: line.feel,
			})),
		},
	};
}

// 미리 보기의 바뀐 줄(보낸 차례). 보낸 값과 답을 모두 정리해(normalizeText·cleanDirection) 견주고 넣을 값도 정리한 값이다
// (앞뒤·지시 공백만 다른 제안은 바뀐 칸이 아니다). 지시는 줄 값이 아니라 보낸 지시와 견준다(숨은 지시를 빈 답으로 지우지 않는다).
// 감정은 보이는 글(label: 그 줄 화자의 감정 칸 글, 칸이 없으면 null)로 견준다(성우 설정과 같은 값을 줄에 적는 제안은 바꾸지 않는다)
export function autoTagChanges(
	sent: readonly AutoTagSent[],
	reply: readonly AutoTagLine[],
	label: (line: DraftLine, feel: Feel | undefined) => string | null,
): AutoTagChange[] {
	return sent.flatMap((item, i) => {
		const { line } = item;
		const next = reply[i];
		if (!next) return [];
		const fields: AutoTagChange["fields"] = [];
		const patch: AutoTagChange["patch"] = {};
		const direction = cleanDirection(item.direction);
		const nextDirection = cleanDirection(next.direction);
		if (nextDirection !== direction) {
			fields.push({
				field: "direction",
				before: direction,
				after: nextDirection,
			});
			patch.direction = nextDirection;
		}
		const text = normalizeText(line.text);
		const nextText = normalizeText(next.text);
		if (nextText !== text) {
			fields.push({ field: "text", before: text, after: nextText });
			patch.text = nextText;
		}
		const before = label(line, line.feel);
		const after = label(line, next.feel);
		if (before !== null && after !== null && before !== after) {
			fields.push({ field: "feel", before, after });
			patch.feel = next.feel;
		}
		return fields.length > 0 ? [{ ...item, fields, patch }] : [];
	});
}

const sameFeel = (a: Feel | undefined, b: Feel | undefined) =>
	a?.typecast?.emotion === b?.typecast?.emotion &&
	a?.typecast?.intensity === b?.typecast?.intensity &&
	a?.airy?.style === b?.airy?.style;
// '모두 바꾸기': 보낸 뒤 바뀌지 않은 줄만 id로 찾아(옮긴 줄도 찾는다) 바뀐 칸을 넣는다.
// 그사이 고쳤거나(화자·지시·대사·감정) 지운 줄은 건너뛰고 센다(autoTagChanged)
export function autoTagApply(
	lines: readonly DraftLine[],
	changes: readonly AutoTagChange[],
): { lines: DraftLine[]; applied: number; changed: number } {
	const byId = new Map(lines.map((line) => [line.id, line]));
	const patches = new Map<string, AutoTagChange["patch"]>();
	for (const { line, patch } of changes) {
		const now = byId.get(line.id);
		if (
			now &&
			now.speaker === line.speaker &&
			now.direction === line.direction &&
			now.text === line.text &&
			sameFeel(now.feel, line.feel)
		)
			patches.set(line.id, patch);
	}
	return {
		lines: lines.map((line) => {
			const patch = patches.get(line.id);
			return patch ? { ...line, ...patch } : line;
		}),
		applied: patches.size,
		changed: changes.length - patches.size,
	};
}
