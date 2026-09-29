(() => {
	const MAX_SEGMENTS = 200;
	const MAX_TEXT = 2000;
	const MAX_INSTRUCTION = 300;
	const MAX_HISTORY = 20;
	const TEXT_DELAY = 400;
	const DEFAULT_PAUSE = 0.3;
	const DEFAULT_CHARS = 150;
	// script-tools.js는 감정 목록을 내보내지 않아 같은 키와 이름을 둔다.
	const EMOTIONS = [
		["normal", "기본"],
		["happy", "밝게"],
		["sad", "차분하게"],
		["angry", "강조"],
		["whisper", "낮게"],
		["toneup", "톤 올림"],
		["tonedown", "톤 내림"],
		["smart", "문맥 시연"],
	];
	const EMOTION_IDS = new Set(EMOTIONS.map(([id]) => id));
	const INTENSITIES = ["약하게", "보통", "강하게"];
	const CHIPS = ["강조", "끊어 읽기", "또박또박", "차분하게", "당당하게"];
	const NO_INTENSITY = new Set(["ElevenLabs", "Fish Audio"]);
	const PREVIEW_REASON =
		"문단 미리 생성은 시연입니다. 과금 가능한 생성은 전체 생성 확인에서만 시연합니다.";
	const LIMIT_REASON = `문단은 ${MAX_SEGMENTS}개까지 만들 수 있어요.`;
	const SPLIT_MODES = [
		["speaker", "화자 기준"],
		["sentence", "마침표 기준"],
		["line", "줄바꿈 기준"],
		["both", "둘 다"],
		["chars", "글자 수 기준"],
		["manual", "직접 자르기"],
	];
	const FIELD_LABELS = {
		text: "문단 내용 수정",
		instruction: "연기 지시 수정",
		speed: "문단 속도 변경",
		pauseAfter: "문단 뒤 간격 변경",
		emotion: "문단 감정 변경",
		intensity: "감정 강도 변경",
	};
	const SVG_NS = "http://www.w3.org/2000/svg";

	const state = {
		bridge: null,
		container: null,
		root: null,
		bar: null,
		selected: new Set(),
		history: [],
		lastJson: undefined,
		busy: null,
		renders: 0,
		rendering: false,
		pending: null,
		timer: 0,
		composing: false,
		session: "",
		menu: null,
		playing: null,
		batchValues: {},
		observer: null,
		listening: false,
	};
	let uid = 0;

	const node = (tag, className, text) => {
		const element = document.createElement(tag);
		if (className) element.className = className;
		if (text !== undefined) element.textContent = text;
		return element;
	};
	const nextId = (prefix) => {
		uid += 1;
		return `ps-${prefix}-${uid}`;
	};
	const makeId = () =>
		`para-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	const round1 = (value) => Math.round(value * 10) / 10;
	const toNumber = (value) =>
		value === null || value === undefined || value === ""
			? Number.NaN
			: Number(value);
	const formatCount = (value) => value.toLocaleString("ko-KR");
	const api = () => state.bridge || window.TTSStudio || {};
	const voices = () => {
		const list = api().getVoices?.();
		return Array.isArray(list) ? list : [];
	};
	const voiceOf = (id) =>
		id
			? api().getVoice?.(id) || voices().find((voice) => voice.id === id)
			: undefined;
	const voiceName = (voice) =>
		voice ? `${voice.name} · ${voice.provider}` : "성우 미지정";
	const announce = (message) => api().announce?.(message);
	const notify = (message, undoable = false) => {
		const bridge = api();
		if (typeof bridge.toast !== "function") return announce(message);
		bridge.toast(
			message,
			undoable ? { actionLabel: "되돌리기", onAction: undo } : undefined,
		);
	};

	// index.html 스프라이트의 i-* 아이콘. up·down·trash·split·merge·undo·chevron-down도 쓴다.
	const icon = (id) => {
		const svg = document.createElementNS(SVG_NS, "svg");
		svg.setAttribute("aria-hidden", "true");
		const use = document.createElementNS(SVG_NS, "use");
		use.setAttribute("href", `#i-${id}`);
		svg.append(use);
		return svg;
	};
	const button = (label, className, iconId) => {
		const element = node("button", className, label);
		element.type = "button";
		if (iconId) element.prepend(icon(iconId));
		return element;
	};
	const iconButton = (
		iconId,
		label,
		className = "icon-button ps-icon-button",
	) => {
		const element = node("button", className);
		element.type = "button";
		element.setAttribute("aria-label", label);
		element.title = label;
		element.dataset.label = label;
		element.append(icon(iconId));
		return element;
	};
	const focusKey = (element, key) => {
		element.dataset.focus = key;
		return element;
	};
	// 비활성 사유를 보여 주려고 aria-disabled를 쓴다. 포커스는 남고 누르면 사유를 알린다.
	const setBlocked = (element, reason) => {
		if (reason) {
			element.setAttribute("aria-disabled", "true");
			element.title = reason;
			return;
		}
		element.removeAttribute("aria-disabled");
		if (element.dataset.label) element.title = element.dataset.label;
		else element.removeAttribute("title");
	};
	const onPress = (element, handler) =>
		element.addEventListener("click", () => {
			if (element.getAttribute("aria-disabled") === "true")
				notify(element.title);
			else handler();
		});
	const field = (labelText, control, className = "") => {
		const wrap = node("div", `ps-field ${className}`.trim());
		const label = node("label", "ps-field-label", labelText);
		if (!control.id) control.id = nextId("field");
		label.htmlFor = control.id;
		wrap.append(label, control);
		return wrap;
	};
	const numberInput = (value, min, max, placeholder = "") => {
		const control = document.createElement("input");
		control.type = "number";
		control.className = "ps-input";
		control.min = String(min);
		control.max = String(max);
		control.step = "0.1";
		control.inputMode = "decimal";
		control.value = value === null || value === undefined ? "" : String(value);
		control.placeholder = placeholder;
		return control;
	};
	const selectInput = (options, value) => {
		const control = document.createElement("select");
		control.className = "ps-select";
		for (const [optionValue, label] of options)
			control.append(new Option(label, optionValue));
		control.value = value;
		return control;
	};
	// 빈 값은 null, 범위 밖이나 숫자가 아니면 undefined.
	const parseNumber = (control, min, max) => {
		if (control.validity?.badInput) return undefined;
		const text = String(control.value).trim();
		if (!text) return null;
		const value = Number(text);
		return Number.isFinite(value) && value >= min && value <= max
			? round1(value)
			: undefined;
	};
	const autoGrow = (area) => {
		if (window.CSS?.supports?.("field-sizing", "content")) return;
		area.style.height = "auto";
		area.style.height = `${area.scrollHeight + 2}px`;
	};

	// ---- 화자 감지와 문단 나누기 (순수 함수) ----
	const validName = (name) =>
		name.length >= 1 &&
		name.length <= 12 &&
		/\p{L}/u.test(name) &&
		!/[.,!?…"'“”‘’()<>{}=/\\]/.test(name);
	const parseSpeakerLine = (line) => {
		const bracket = line.match(/^\s*\[([^\]\n]{1,12})\]\s*(.*)$/);
		if (bracket) {
			const name = bracket[1].trim();
			const text = bracket[2].trim();
			return validName(name) ? { speaker: name, text, header: !text } : null;
		}
		const colon = line.match(/^\s*([^:：\n]{1,12}?)\s*[:：]\s*(.*)$/);
		if (!colon) return null;
		const name = colon[1].trim();
		const text = colon[2].trim();
		// 12:30, 3:2 같은 시간·비율과 https:// 같은 주소는 화자가 아니다.
		if (/\d$/.test(name) && /^\d/.test(text)) return null;
		if (text.startsWith("//")) return null;
		return validName(name) ? { speaker: name, text, header: !text } : null;
	};
	const detectSpeakers = (text) => {
		const segments = [];
		let current = null;
		let sticky = "";
		let hits = 0;
		const finish = () => {
			if (current?.text.trim())
				segments.push({ speaker: current.speaker, text: current.text.trim() });
			current = null;
		};
		for (const line of String(text ?? "")
			.replace(/\r\n?/g, "\n")
			.split("\n")) {
			if (!line.trim()) {
				finish();
				continue;
			}
			const hit = parseSpeakerLine(line);
			if (hit) {
				hits += 1;
				finish();
				sticky = hit.header ? hit.speaker : "";
				current = { speaker: hit.speaker, text: hit.text };
				continue;
			}
			if (current)
				current.text = current.text
					? `${current.text}\n${line.trim()}`
					: line.trim();
			else current = { speaker: sticky, text: line.trim() };
		}
		finish();
		if (hits < 2) return null;
		const speakers = [
			...new Set(segments.map((item) => item.speaker).filter(Boolean)),
		];
		return { segments, speakers };
	};
	const SENTENCE_END = /(?<=[.!?…。！？]["'”’)\]]*)\s+/;
	const clean = (parts) => parts.map((part) => part.trim()).filter(Boolean);
	const cutLong = (text, limit) => {
		const parts = [];
		let rest = text;
		while (rest.length > limit) {
			let cut = rest.lastIndexOf(" ", limit);
			if (cut < limit / 2) cut = limit;
			parts.push(rest.slice(0, cut).trim());
			rest = rest.slice(cut).trim();
		}
		if (rest) parts.push(rest);
		return parts;
	};
	// ponytail: 길이는 UTF-16 단위로 센다. 한글은 정확하고 이모지는 반으로 잘릴 수 있다.
	const packChars = (sentences, n) => {
		const limit = Math.floor(Number(n));
		if (!(limit >= 1)) return sentences;
		const out = [];
		let current = "";
		for (const sentence of sentences)
			for (const piece of cutLong(sentence, limit)) {
				if (current && current.length + 1 + piece.length <= limit)
					current = `${current} ${piece}`;
				else {
					if (current) out.push(current);
					current = piece;
				}
			}
		if (current) out.push(current);
		return out;
	};
	const splitText = (text, mode = "sentence", n = DEFAULT_CHARS) => {
		const source = String(text ?? "").replace(/\r\n?/g, "\n");
		if (mode === "line") return clean(source.split(/\n+/));
		if (mode === "sentence") return clean(source.split(SENTENCE_END));
		if (mode === "both")
			return clean(source.split(/\n+/)).flatMap((line) =>
				clean(line.split(SENTENCE_END)),
			);
		if (mode === "chars") return packChars(splitText(source, "both"), n);
		return clean([source]);
	};

	// ---- 문단 데이터 ----
	const normalize = (segment) => {
		const speed = toNumber(segment.speed);
		const pause = toNumber(segment.pauseAfter);
		const intensity = toNumber(segment.intensity);
		return {
			...segment,
			id: String(segment.id || makeId()),
			text: String(segment.text ?? ""),
			speaker: String(segment.speaker ?? "").trim(),
			voiceId: String(segment.voiceId ?? ""),
			provider: String(
				segment.provider || voiceOf(segment.voiceId)?.provider || "",
			),
			emotion: EMOTION_IDS.has(segment.emotion) ? segment.emotion : "normal",
			// 감정 도구의 0.05 단위 강도를 보존한다. 버튼 표시는 가까운 단계로만 한다.
			intensity: Number.isFinite(intensity)
				? Math.min(2, Math.max(0, intensity))
				: null,
			speed: speed >= 0.5 && speed <= 2 ? round1(speed) : null,
			pauseAfter: pause >= 0 && pause <= 5 ? round1(pause) : DEFAULT_PAUSE,
			instruction: String(segment.instruction ?? "").slice(0, MAX_INSTRUCTION),
		};
	};
	const read = () => {
		const list = api().getSegments?.();
		return Array.isArray(list) ? list.map(normalize) : [];
	};
	const rawJson = () => JSON.stringify(api().getSegments?.() ?? null);
	const newSegment = (base, text = "") => {
		const provider = base?.provider || voiceOf(base?.voiceId)?.provider || "";
		return normalize({
			id: makeId(),
			text,
			speaker: base?.speaker ?? "",
			voiceId: base?.voiceId ?? "",
			provider,
			emotion: base?.emotion,
			// app.js setSegments와 같은 기본값. 이어받은 값(사용자가 고른 null 포함)은 그대로 둔다.
			intensity:
				base?.intensity !== undefined
					? base.intensity
					: NO_INTENSITY.has(provider)
						? null
						: 1,
			speed: base?.speed,
			pauseAfter: base?.pauseAfter,
		});
	};
	// 역할마다 다른 성우를 준다. 이름이 같은 성우를 먼저 주고, 나머지는 선택한 성우의 공급자부터 아직 안 쓴 성우를
	// 앞 역할과 성별을 바꿔 가며 고른다. 성우가 모자랄 때만 다시 쓴다. reserved는 해설 문단처럼 이미 쓰는 성우.
	const assignRoleVoices = (speakers, list, active, reserved = []) => {
		const result = new Map();
		const used = new Set(reserved);
		for (const speaker of speakers) {
			const named = list.find((voice) => voice.name === speaker);
			if (!named) continue;
			result.set(speaker, named.id);
			used.add(named.id);
		}
		const provider = active?.provider;
		const pool = [
			...list.filter((voice) => voice.id === active?.id),
			...list.filter(
				(voice) => voice.id !== active?.id && voice.provider === provider,
			),
			...list.filter((voice) => voice.provider !== provider),
		];
		let last = null;
		let reuse = 0;
		for (const speaker of speakers) {
			if (result.has(speaker)) {
				last = list.find((voice) => voice.id === result.get(speaker));
				continue;
			}
			const free = pool.filter((voice) => !used.has(voice.id));
			const group = free.filter((voice) => voice.provider === free[0].provider);
			const voice =
				group.find(
					(item) => item.gender && last?.gender && item.gender !== last.gender,
				) ||
				group[0] ||
				pool[reuse++ % pool.length];
			if (!voice) continue;
			result.set(speaker, voice.id);
			used.add(voice.id);
			last = voice;
		}
		return result;
	};
	const roleGroups = (segments) => {
		const groups = new Map();
		for (const segment of segments) {
			if (!segment.speaker) continue;
			const group = groups.get(segment.speaker) || {
				speaker: segment.speaker,
				count: 0,
				voices: new Set(),
			};
			group.count += 1;
			group.voices.add(segment.voiceId);
			groups.set(segment.speaker, group);
		}
		return [...groups.values()].map((group) => ({
			speaker: group.speaker,
			count: group.count,
			voiceId: group.voices.size === 1 ? [...group.voices][0] : "",
			mixed: group.voices.size > 1,
		}));
	};
	const estimate = (segment) => {
		const result = api().estimate?.(segment.text, {
			voiceId: segment.voiceId,
			speed: segment.speed,
			pauseAfter: segment.pauseAfter,
		});
		if (result) return result;
		// 브리지에 estimate가 없을 때만 쓰는 같은 공식의 대체 계산.
		const seconds = round1(
			segment.text.length / (6.6 * (segment.speed ?? 1)) +
				(segment.pauseAfter ?? 0),
		);
		const provider = voiceOf(segment.voiceId)?.provider || segment.provider;
		if (provider === "Fish Audio") {
			const units = new TextEncoder().encode(segment.text).length;
			return {
				seconds,
				units,
				unitLabel: "바이트",
				usageLabel: `${formatCount(units)}바이트 · 약 $${((units * 15) / 1e6).toFixed(4)}`,
				basis:
					"한국어 초당 약 6.6자 기준 추정. Fish 문서 $15/백만 바이트, 실제 청구는 연결 후 확인",
			};
		}
		return {
			seconds,
			units: segment.text.length,
			unitLabel: "자",
			usageLabel: `${formatCount(segment.text.length)}자`,
			basis: "한국어 초당 약 6.6자 기준 추정. 실제 청구는 연결 후 확인",
		};
	};

	// ---- 변경, 되돌리기 ----
	const commit = (next, options = {}) => {
		const bridge = api();
		if (typeof bridge.setSegments !== "function") {
			notify("이 화면에서는 문단을 고칠 수 없어요.");
			return false;
		}
		const {
			label = "문단 수정",
			quiet = false,
			record = true,
			focus = [],
			message = "",
			say = "",
		} = options;
		if (record) state.history.push(bridge.getSegments?.() ?? null);
		state.busy = { quiet, focus };
		const renders = state.renders;
		let result;
		try {
			result = bridge.setSegments(next, { label });
		} finally {
			state.busy = null;
		}
		if (result === false) {
			if (record) state.history.pop();
			notify("문단을 반영하지 못했어요. 내용과 성우를 확인해 주세요.");
			return false;
		}
		if (state.history.length > MAX_HISTORY) state.history.shift();
		state.lastJson = rawJson();
		if (quiet) syncBatch();
		else if (state.renders === renders && state.container)
			render(state.container, bridge, focus);
		if (message) notify(message, record);
		if (say) announce(say);
		return true;
	};
	const undo = () => {
		flushText();
		if (!state.history.length) return;
		const previous = state.history.pop();
		if (
			commit(previous, {
				label: "되돌리기",
				record: false,
				focus: ["batch:undo", "batch:all"],
			})
		)
			notify("마지막 작업을 되돌렸어요.");
		else state.history.push(previous);
	};
	const pendingValue = (id, name, fallback) =>
		state.pending?.id === id && state.pending.field === name
			? state.pending.value
			: fallback;
	const saveField = (id, name, value) => {
		const segments = read();
		const segment = segments.find((item) => item.id === id);
		if (!segment || segment[name] === value) return;
		segment[name] = value;
		const key = `${id}:${name}`;
		commit(segments, {
			label: FIELD_LABELS[name] || "문단 수정",
			quiet: true,
			record: state.session !== key,
		});
		state.session = key;
	};
	const flushText = () => {
		window.clearTimeout(state.timer);
		const pending = state.pending;
		if (!pending) return;
		if (state.composing) {
			state.timer = window.setTimeout(flushText, TEXT_DELAY);
			return;
		}
		state.pending = null;
		saveField(pending.id, pending.field, pending.value);
	};
	const scheduleField = (id, name, value) => {
		if (
			state.pending &&
			(state.pending.id !== id || state.pending.field !== name)
		)
			flushText();
		state.pending = { id, field: name, value };
		window.clearTimeout(state.timer);
		state.timer = window.setTimeout(flushText, TEXT_DELAY);
	};
	const endEdit = () => {
		if (state.rendering) return;
		state.composing = false;
		flushText();
		state.session = "";
	};
	const bindTyping = (control) => {
		control.addEventListener("compositionstart", () => {
			state.composing = true;
		});
		control.addEventListener("compositionend", () => {
			state.composing = false;
		});
		control.addEventListener("blur", endEdit);
	};
	const mutate = (change, options) => {
		flushText();
		const segments = read();
		const result = change(segments);
		if (result === false) return false;
		state.session = "";
		return commit(Array.isArray(result) ? result : segments, options);
	};

	// ---- 문단 동작 ----
	const moveSegment = (id, step) => {
		const index = read().findIndex((item) => item.id === id);
		const to = index + step;
		const forward = step < 0 ? "up" : "down";
		const backward = step < 0 ? "down" : "up";
		mutate(
			(segments) => {
				if (index < 0 || to < 0 || to >= segments.length) return false;
				[segments[index], segments[to]] = [segments[to], segments[index]];
			},
			{
				label: "문단 이동",
				focus: [`${id}:${forward}`, `${id}:${backward}`],
				say: `${index + 1}번 문단을 ${to + 1}번으로 옮겼어요.`,
			},
		);
	};
	const deleteSegment = (id) => {
		const segments = read();
		const index = segments.findIndex((item) => item.id === id);
		if (index < 0) return;
		const neighbor = segments[index + 1] || segments[index - 1];
		mutate(
			(list) =>
				list.length > 1 ? list.filter((item) => item.id !== id) : false,
			{
				label: "문단 삭제",
				message: `${index + 1}번 문단을 삭제했어요.`,
				focus: [`${neighbor?.id}:check`, "batch:all"],
			},
		);
	};
	const addAfter = (id) => {
		flushText();
		const segments = read();
		if (segments.length >= MAX_SEGMENTS) return notify(LIMIT_REASON);
		const index = segments.findIndex((item) => item.id === id);
		const created = newSegment(segments[index] || segments.at(-1));
		segments.splice(index + 1, 0, created);
		state.session = "";
		commit(segments, {
			label: "문단 추가",
			focus: [`${created.id}:text`],
			say: `${index + 2}번에 새 문단을 추가했어요. 내용을 입력해 주세요.`,
		});
	};
	const setVoice = (id, voiceId) => {
		const voice = voiceOf(voiceId);
		if (!voice) return notify("성우를 찾지 못했어요.");
		const index = read().findIndex((item) => item.id === id);
		mutate(
			(segments) => {
				const segment = segments[index];
				if (!segment || segment.voiceId === voice.id) return false;
				segment.voiceId = voice.id;
				segment.provider = voice.provider;
			},
			{
				label: "문단 성우 변경",
				focus: [`${id}:voice`],
				message: `${index + 1}번 문단 성우를 바꿨어요 · ${voice.name}`,
			},
		);
	};
	const recommendFor = (id) => {
		flushText();
		const segment = read().find((item) => item.id === id);
		if (!segment) return;
		if (!segment.text.trim())
			return notify("문단 내용을 입력한 뒤 추천을 받을 수 있어요.");
		const tools = window.TTSVoiceTools;
		if (typeof tools?.openParagraphRecommend !== "function")
			return notify(
				"문단 성우 추천을 불러오지 못했어요. 성우 빠른 메뉴에서 직접 골라 주세요.",
			);
		tools.openParagraphRecommend({
			text: segment.text,
			currentVoiceId: segment.voiceId,
			onPick: (voiceId) => setVoice(id, voiceId),
		});
	};
	const applyToSelected = (update, options) => {
		const ids = new Set(state.selected);
		return mutate((segments) => {
			const targets = segments.filter((item) => ids.has(item.id));
			if (!targets.length) return false;
			targets.forEach(update);
		}, options);
	};
	const deleteSelected = () => {
		const ids = new Set(state.selected);
		mutate(
			(segments) => {
				const rest = segments.filter((item) => !ids.has(item.id));
				return rest.length ? rest : false;
			},
			{
				label: "선택 문단 삭제",
				message: `문단 ${ids.size}개를 삭제했어요.`,
				focus: ["batch:all"],
			},
		);
	};
	const choose = (options) => {
		const bridge = api();
		if (typeof bridge.choose === "function") return bridge.choose(options);
		const primary = options.actions.find((item) => item.variant === "primary");
		return Promise.resolve(
			window.confirm(`${options.title}\n\n${options.message}`)
				? primary.value
				: "cancel",
		);
	};
	const mergeSelected = async () => {
		flushText();
		const segments = read();
		const picked = segments.filter((item) => state.selected.has(item.id));
		if (picked.length < 2)
			return notify("합치기는 문단을 2개 이상 선택해야 해요.");
		const joined = picked
			.map((item) => item.text.trim())
			.filter(Boolean)
			.join(" ");
		if (joined.length > MAX_TEXT)
			return notify(
				`합치면 ${formatCount(joined.length)}자가 되어 2,000자를 넘어요. 선택을 줄여 주세요.`,
			);
		const first = segments.indexOf(picked[0]);
		const apart = picked.some(
			(item, offset) => segments.indexOf(item) !== first + offset,
		);
		const answer = await choose({
			title: `문단 ${picked.length}개 합치기`,
			message: `선택한 문단 ${picked.length}개를 ${first + 1}번 문단 하나로 합칩니다. 첫 문단의 성우·역할·설정을 유지하고 내용은 띄어쓰기로 잇습니다.${apart ? " 떨어져 있는 문단도 첫 문단 자리로 모입니다." : ""} 생성 결과가 있으면 다시 생성해야 합니다.`,
			actions: [
				{ label: "취소", value: "cancel", variant: "secondary" },
				{ label: "합치기", value: "merge", variant: "primary" },
			],
		});
		if (answer !== "merge") return;
		const ids = new Set(picked.map((item) => item.id));
		mutate(
			(list) => {
				const chosen = list.filter((item) => ids.has(item.id));
				if (chosen.length < 2) return false;
				chosen[0].text = chosen
					.map((item) => item.text.trim())
					.filter(Boolean)
					.join(" ");
				return list.filter((item) => item === chosen[0] || !ids.has(item.id));
			},
			{
				label: "문단 합치기",
				message: `문단 ${picked.length}개를 하나로 합쳤어요.`,
				focus: ["batch:merge", "batch:all"],
			},
		);
	};

	// ---- 대화상자 ----
	const createDialog = (title, description) => {
		const opener = document.activeElement;
		const openerKey = opener?.dataset?.focus;
		const dialog = node("dialog", "dialog ps-dialog");
		const inner = node("div", "ps-dialog-inner");
		const header = node("div", "dialog-header");
		const heading = node("div");
		const titleNode = node("h2", "", title);
		titleNode.id = nextId("dialog-title");
		dialog.setAttribute("aria-labelledby", titleNode.id);
		heading.append(titleNode);
		if (description) {
			const text = node("p", "", description);
			text.id = nextId("dialog-description");
			dialog.setAttribute("aria-describedby", text.id);
			heading.append(text);
		}
		const close = iconButton("close", "닫기", "icon-button");
		close.addEventListener("click", () => dialog.close("cancel"));
		header.append(heading, close);
		const body = node("div", "ps-dialog-body");
		const footer = node("div", "dialog-actions");
		const cancel = button("취소", "button button-secondary");
		cancel.addEventListener("click", () => dialog.close("cancel"));
		footer.append(cancel);
		inner.append(header, body, footer);
		dialog.append(inner);
		const handle = { dialog, body, footer, after: null };
		dialog.addEventListener("close", () => {
			dialog.remove();
			if (opener?.isConnected && opener.getClientRects().length) opener.focus();
			else if (!restoreFocus([openerKey]))
				state.root?.querySelector(".ps-card-check")?.focus();
			handle.after?.();
		});
		document.body.append(dialog);
		return handle;
	};

	const openRoleDialog = (bridge, focusSpeaker = "") => {
		if (bridge) state.bridge = bridge;
		flushText();
		closeMenu(false);
		const roles = roleGroups(read());
		if (!roles.length) return notify("역할이 지정된 문단이 없어요.");
		const handle = createDialog(
			"역할별 성우",
			"역할마다 성우를 고르면 그 역할의 대사 전체에 적용됩니다. 적용을 누르기 전에는 바뀌지 않습니다.",
		);
		const draft = new Map(roles.map((role) => [role.speaker, role.voiceId]));
		const progress = node("p", "ps-role-progress");
		progress.setAttribute("role", "status");
		// 막지 않는 안내: 두 역할 이상이 한 성우를 쓰면 알려 준다.
		const shared = node("p", "ps-problem");
		shared.setAttribute("role", "status");
		const syncProgress = () => {
			const done = [...draft.values()].filter(Boolean).length;
			progress.textContent = `${done}/${roles.length} 역할 성우 지정`;
			const byVoice = new Map();
			for (const [speaker, voiceId] of draft)
				if (voiceId)
					byVoice.set(voiceId, [...(byVoice.get(voiceId) || []), speaker]);
			const clashes = [...byVoice].filter(([, names]) => names.length > 1);
			shared.textContent = clashes.length
				? `${clashes
						.map(([voiceId, names]) => {
							const tail =
								names.at(-1).charCodeAt(names.at(-1).length - 1) - 0xac00;
							const particle =
								tail >= 0 && tail < 11172 && tail % 28 ? "이" : "가";
							return `${names.join("·")}${particle} 같은 성우(${voiceOf(voiceId)?.name || "알 수 없음"})를`;
						})
						.join(", ")} 써요 — 역할을 구분하려면 다른 성우를 고르세요`
				: "";
			shared.hidden = !clashes.length;
		};
		const list = node("div", "ps-role-list");
		const voiceOptions = voices().map((voice) => [voice.id, voiceName(voice)]);
		roles.forEach((role, index) => {
			const row = node("div", "ps-role-row");
			const select = selectInput(
				role.voiceId
					? voiceOptions
					: [
							["", role.mixed ? "여러 성우 사용 중" : "성우 미지정"],
							...voiceOptions,
						],
				role.voiceId,
			);
			select.id = nextId("role");
			const info = node("label", "ps-role-info");
			info.htmlFor = select.id;
			info.append(
				node("strong", "", role.speaker),
				node("span", "", `대사 ${role.count}개`),
			);
			const hint = node(
				"span",
				"ps-role-hint",
				`같은 역할 대사 ${role.count}개에 적용`,
			);
			hint.id = nextId("role-hint");
			select.setAttribute("aria-describedby", hint.id);
			select.addEventListener("change", () => {
				draft.set(role.speaker, select.value);
				syncProgress();
			});
			if (role.speaker === focusSpeaker || (!focusSpeaker && index === 0))
				select.autofocus = true;
			const pick = document.createElement("div");
			pick.className = "ps-role-pick";
			pick.append(select);
			if (typeof api().openVoicePicker === "function") {
				const find = button("찾기", "mini-button", "search");
				find.setAttribute("aria-label", `역할 ${role.speaker} 성우 찾기`);
				find.addEventListener("click", () =>
					api().openVoicePicker({
						label: `역할 '${role.speaker}' 대사 ${role.count}개`,
						currentVoiceId: draft.get(role.speaker),
						returnFocus: find,
						onPick: (voiceId) => {
							if (!voiceOf(voiceId)) return;
							draft.set(role.speaker, voiceId);
							if (![...select.options].some((item) => item.value === voiceId))
								select.append(new Option(voiceName(voiceOf(voiceId)), voiceId));
							select.value = voiceId;
							syncProgress();
						},
					}),
				);
				pick.append(find);
			}
			row.append(info, pick, hint);
			list.append(row);
		});
		const apply = button("적용", "button button-primary");
		apply.addEventListener("click", () => {
			const changes = roles.filter(
				(role) =>
					draft.get(role.speaker) && draft.get(role.speaker) !== role.voiceId,
			);
			if (!changes.length) return handle.dialog.close("apply");
			const speakers = new Set(changes.map((role) => role.speaker));
			const lines = changes.reduce((sum, role) => sum + role.count, 0);
			const done = mutate(
				(segments) => {
					for (const segment of segments) {
						if (!speakers.has(segment.speaker)) continue;
						const voice = voiceOf(draft.get(segment.speaker));
						if (!voice) continue;
						segment.voiceId = voice.id;
						segment.provider = voice.provider;
					}
				},
				{
					label: "역할별 성우 적용",
					message: `역할 ${changes.length}개의 성우를 바꿨어요 · 대사 ${lines}개`,
				},
			);
			if (done) handle.dialog.close("apply");
		});
		handle.footer.append(apply);
		handle.body.append(progress, list, shared);
		syncProgress();
		handle.dialog.showModal();
	};

	const openSplitDialog = ({
		targets,
		fromText = false,
		voice = null,
		detection = null,
	}) => {
		closeMenu(false);
		const handle = createDialog(
			fromText ? "문단으로 나누기" : `선택한 문단 ${targets.length}개 나누기`,
			fromText
				? "기준을 고르면 결과 문단 수를 바로 보여 줍니다. 직접 자르기에서는 줄바꿈 하나가 문단 경계가 됩니다."
				: "나눈 조각은 원래 문단의 성우·역할·속도·간격·감정·연기 지시를 이어받습니다. 직접 자르기에서는 줄바꿈 하나가 문단 경계가 됩니다.",
		);
		const existing = fromText ? 0 : read().length - targets.length;
		let mode = detection ? "speaker" : "sentence";
		let chars = DEFAULT_CHARS;
		let manualTouched = false;

		const modes = node("fieldset", "ps-split-modes");
		modes.append(node("legend", "", "나누는 기준"));
		const groupName = nextId("split-mode");
		for (const [value, label] of SPLIT_MODES) {
			if (value === "speaker" && !detection) continue;
			const option = node("label", "ps-radio");
			const radio = document.createElement("input");
			radio.type = "radio";
			radio.name = groupName;
			radio.value = value;
			radio.checked = value === mode;
			radio.autofocus = radio.checked;
			radio.addEventListener("change", () => {
				if (!radio.checked) return;
				if (value === "manual" && !manualTouched) fillManual();
				mode = value;
				update();
			});
			option.append(
				radio,
				node(
					"span",
					"",
					value === "speaker"
						? `${label} · ${detection.speakers.length}명`
						: label,
				),
			);
			modes.append(option);
		}
		const charsInput = numberInput(chars, 20, MAX_TEXT);
		charsInput.step = "10";
		charsInput.inputMode = "numeric";
		const charsField = field(
			"문단당 최대 글자 수",
			charsInput,
			"ps-split-chars",
		);
		charsInput.addEventListener("input", () => {
			chars = Number(charsInput.value);
			update();
		});
		const summary = node("p", "ps-split-summary");
		summary.setAttribute("role", "status");
		const problem = node("p", "ps-error");
		problem.setAttribute("role", "status");
		const editors = node("div", "ps-split-editors");
		const areas = targets.map((target) => {
			const wrap = node("div", "ps-split-editor");
			const area = document.createElement("textarea");
			area.className = "ps-text";
			area.rows = 4;
			area.addEventListener("input", () => {
				manualTouched = true;
				autoGrow(area);
				update();
			});
			const reset = button("원문으로 되돌리기", "text-button", "reset");
			reset.addEventListener("click", () => {
				area.value = target.text;
				manualTouched = true;
				autoGrow(area);
				update();
				area.focus();
			});
			wrap.append(
				field(fromText ? "원문" : `${target.position}번 문단`, area),
				reset,
			);
			editors.append(wrap);
			return area;
		});
		// 화자가 감지된 원문은 화자 표기를 빼고 화자별 대사 안에서만 나눈다.
		const piecesFor = (index) => {
			const target = targets[index];
			if (mode === "manual") {
				let speaker = target.speaker || "";
				return clean(areas[index].value.split("\n")).map((line) => {
					const hit = detection ? parseSpeakerLine(line) : null;
					if (!hit || hit.header) return { text: line, speaker };
					speaker = hit.speaker;
					return { text: hit.text, speaker };
				});
			}
			const parts = detection
				? detection.segments
				: [{ text: target.text, speaker: target.speaker || "" }];
			if (mode === "speaker") return parts.map((part) => ({ ...part }));
			return parts.flatMap((part) =>
				splitText(part.text, mode, chars).map((text) => ({
					text,
					speaker: part.speaker,
				})),
			);
		};
		const fillManual = () => {
			areas.forEach((area, index) => {
				area.value = piecesFor(index)
					.map((piece) => {
						const line = piece.text.replace(/\s*\n\s*/g, " ");
						return detection && piece.speaker
							? `${piece.speaker}: ${line}`
							: line;
					})
					.join("\n");
			});
		};
		const apply = button("적용", "button button-primary");
		const update = () => {
			charsField.hidden = mode !== "chars";
			editors.hidden = mode !== "manual";
			if (mode === "manual") areas.forEach(autoGrow);
			const badChars =
				mode === "chars" &&
				!(Number.isInteger(chars) && chars >= 20 && chars <= MAX_TEXT);
			const results = badChars
				? []
				: targets.map((_, index) => piecesFor(index));
			const total = results.reduce((sum, list) => sum + list.length, 0);
			const tooLong = results
				.flat()
				.filter((piece) => piece.text.length > MAX_TEXT).length;
			summary.textContent = badChars
				? `${targets.length}개 문단 → 계산할 수 없음`
				: `${targets.length}개 문단 → ${total}개 문단`;
			const reason = badChars
				? "글자 수는 20~2,000 사이 정수로 입력해 주세요."
				: results.some((list) => !list.length)
					? "비어 있는 문단이 있어요. 원문으로 되돌리거나 내용을 넣어 주세요."
					: tooLong
						? `2,000자를 넘는 조각이 ${tooLong}개 있어요. 글자 수 기준이나 직접 자르기로 더 나눠 주세요.`
						: existing + total > MAX_SEGMENTS
							? `나누면 ${existing + total}개가 되어 ${MAX_SEGMENTS}개를 넘어요.`
							: !fromText && total === targets.length
								? "이 기준으로는 나눌 곳이 없어요. 다른 기준을 고르거나 직접 잘라 주세요."
								: "";
			problem.textContent = reason;
			problem.hidden = !reason;
			setBlocked(apply, reason);
			return { results, total };
		};
		apply.addEventListener("click", () => {
			const { results, total } = update();
			if (apply.getAttribute("aria-disabled") === "true") return;
			let done = false;
			if (fromText) {
				const all = voices();
				const roles = assignRoleVoices(
					[...new Set(results[0].map((piece) => piece.speaker))].filter(
						Boolean,
					),
					all,
					voice,
					voice && results[0].some((piece) => !piece.speaker) ? [voice.id] : [],
				);
				const next = results[0].map((piece) => {
					const cast =
						all.find((item) => item.id === roles.get(piece.speaker)) || voice;
					return newSegment(
						{
							voiceId: cast?.id,
							provider: cast?.provider,
							speaker: piece.speaker,
						},
						piece.text,
					);
				});
				done = commit(next, {
					label: "문단으로 나누기",
					message: `대본을 문단 ${next.length}개로 나눴어요.`,
				});
			} else {
				const byId = new Map(
					targets.map((target, index) => [target.id, results[index]]),
				);
				done = mutate(
					(segments) =>
						segments.flatMap((segment) => {
							const pieces = byId.get(segment.id);
							if (!pieces) return [segment];
							return pieces.map((piece, index) =>
								index === 0
									? { ...segment, text: piece.text }
									: {
											...newSegment(segment, piece.text),
											instruction: segment.instruction,
										},
							);
						}),
					{
						label: "문단 분할",
						message: `문단 ${targets.length}개를 ${total}개로 나눴어요.`,
					},
				);
			}
			if (!done) return;
			if (fromText && results[0].some((piece) => piece.speaker))
				handle.after = () => openRoleDialog(api());
			handle.dialog.close("apply");
		});
		handle.footer.append(apply);
		handle.body.append(modes, charsField, summary, problem, editors);
		update();
		handle.dialog.showModal();
	};

	const openSplitFor = (ids) => {
		flushText();
		const segments = read();
		const targets = segments
			.map((segment, index) => ({ ...segment, position: index + 1 }))
			.filter((segment) => ids.has(segment.id));
		if (!targets.length) return notify("나눌 문단을 먼저 선택해 주세요.");
		openSplitDialog({ targets });
	};
	const startFromText = (text, bridge) => {
		if (bridge) state.bridge = bridge;
		const source = String(text ?? "")
			.replace(/\r\n?/g, "\n")
			.trim();
		if (!source)
			return notify("나눌 원문이 없어요. 대본을 먼저 입력해 주세요.");
		openSplitDialog({
			targets: [{ id: null, text: source, speaker: "", position: 1 }],
			fromText: true,
			voice: api().getActiveVoice?.() || voices()[0] || null,
			detection: detectSpeakers(source),
		});
	};

	// ---- 칩 문구와 붙여넣기 나누기 (순수 함수) ----
	const EMOTION_SHORT = {
		normal: "기본",
		happy: "밝게",
		sad: "차분",
		angry: "강조",
		whisper: "낮게",
		toneup: "톤 올림",
		tonedown: "톤 내림",
		smart: "문맥",
	};
	const speedLabel = (speed) =>
		speed === null ? "속도 기본" : `속도 ${speed.toFixed(1)}배`;
	const pauseLabel = (pause) => `뒤 ${pause}초`;
	const emotionLabel = (segment, noIntensity) => {
		if (segment.emotion === "normal") return "감정 기본";
		const short = EMOTION_SHORT[segment.emotion];
		if (noIntensity || segment.intensity === null) return short;
		return `${short} · ${INTENSITIES[Math.min(2, Math.max(0, Math.round(segment.intensity)))]}`;
	};
	const instructionLabel = (text) => (text.trim() ? "지시 있음" : "지시 +");
	const initialOf = (voice) => voice?.initial || voice?.name?.[0] || "?";
	// 빈 줄로 나뉜 덩어리들. 문단이 하나뿐이면 나눌 게 없다.
	const splitBlank = (text) =>
		String(text ?? "")
			.replace(/\r\n?/g, "\n")
			.split(/\n[ \t]*\n/)
			.map((part) => part.trim())
			.filter(Boolean);
	const roleStats = () => {
		const roles = roleGroups(read());
		return {
			roles: roles.length,
			assigned: roles.filter((role) => role.voiceId).length,
		};
	};

	// ---- 팝오버 (모달 아님): 성우 빠른 메뉴, 칩, ⋯ 메뉴가 함께 쓴다 ----
	const closeMenu = (returnFocus, flush = true) => {
		const menu = state.menu;
		if (!menu) return;
		state.menu = null;
		menu.element.remove();
		menu.trigger.setAttribute("aria-expanded", "false");
		if (flush) {
			flushText();
			state.session = "";
		}
		if (returnFocus) menu.trigger.focus();
	};
	// build(pop)이 처음 포커스를 받을 요소를 돌려준다.
	const openPopover = (card, trigger, label, build, className = "") => {
		closeMenu(false);
		flushText();
		const pop = node("div", `ps-menu ps-pop ${className}`.trim());
		pop.id = nextId("menu");
		pop.setAttribute("role", "dialog");
		pop.setAttribute("aria-label", label);
		pop.addEventListener("keydown", (event) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			closeMenu(true);
		});
		pop.addEventListener("focusout", (event) => {
			const next = event.relatedTarget;
			if (next && !pop.contains(next) && next !== trigger) closeMenu(false);
		});
		const first = build(pop);
		// 트리거의 위치 기준 조상(카드, 일괄 막대, 모바일 시트)에 붙인다.
		const host = trigger.offsetParent || card;
		host.append(pop);
		const room = host.clientWidth - pop.offsetWidth;
		// 작업 바(#workbar)와 일괄 시트 아래로 들어가지 않게, 모자라면 위로 뒤집고 안에서 스크롤한다.
		const rect = trigger.getBoundingClientRect();
		const workbar = document.getElementById("workbar")?.getBoundingClientRect();
		const sheet = Number.parseFloat(
			document.documentElement.style.getPropertyValue("--ps-sheet-height"),
		);
		const floor = Math.min(
			window.innerHeight,
			workbar?.height ? workbar.top : window.innerHeight,
		);
		const bottom = floor - (sheet || 0) - 8;
		const toolbar = document
			.getElementById("work-toolbar")
			?.getBoundingClientRect();
		const ceiling = Math.max(8, toolbar?.height ? toolbar.bottom : 0) + 8;
		const below = bottom - rect.bottom - 4;
		const above = rect.top - ceiling - 4;
		const natural = pop.scrollHeight;
		const flip = natural > below && above > below;
		const limit = Math.max(120, Math.floor(flip ? above : below));
		pop.style.maxHeight = `${limit}px`;
		pop.style.top = flip
			? `${trigger.offsetTop - Math.min(natural, limit) - 4}px`
			: `${trigger.offsetTop + trigger.offsetHeight + 4}px`;
		pop.style.setProperty(
			"--ps-pop-left",
			`${Math.max(0, Math.min(trigger.offsetLeft, room))}px`,
		);
		trigger.setAttribute("aria-controls", pop.id);
		trigger.setAttribute("aria-expanded", "true");
		state.menu = { element: pop, trigger };
		first?.focus();
	};
	const bindPopover = (card, trigger, label, build, className) =>
		trigger.addEventListener("click", () => {
			if (state.menu?.trigger === trigger) closeMenu(true);
			else openPopover(card, trigger, label, build, className);
		});

	const voiceMenu = (pop, trigger, id, number) => {
		pop.classList.add("ps-pop-voice");
		const segments = read();
		const segment = segments.find((item) => item.id === id);
		const usage = new Map();
		for (const item of segments)
			if (item.voiceId)
				usage.set(item.voiceId, (usage.get(item.voiceId) || 0) + 1);
		const all = voices();
		const search = document.createElement("input");
		search.type = "search";
		search.className = "ps-input ps-menu-search";
		search.placeholder = "이름·공급자·분위기·ID 검색";
		search.autocomplete = "off";
		search.setAttribute("aria-label", "성우 검색");
		const status = node("p", "sr-only");
		status.setAttribute("role", "status");
		const results = node("div", "ps-menu-results");
		const section = (title, list, note, emptyText) => {
			const group = node("div", "ps-menu-section");
			const heading = node("h3", "ps-menu-heading", title);
			heading.id = nextId("menu-heading");
			group.setAttribute("role", "group");
			group.setAttribute("aria-labelledby", heading.id);
			group.append(heading);
			if (!list.length) group.append(node("p", "ps-menu-empty", emptyText));
			for (const voice of list) {
				const item = node("button", "ps-menu-item");
				item.type = "button";
				item.setAttribute(
					"aria-pressed",
					String(voice.id === segment?.voiceId),
				);
				item.append(
					node("span", "ps-menu-name", voice.name),
					node(
						"span",
						"ps-menu-meta",
						[voice.provider, voice.tone].filter(Boolean).join(" · "),
					),
				);
				const extra = note?.(voice);
				if (extra) item.append(node("span", "ps-menu-count", extra));
				item.addEventListener("click", () => {
					closeMenu(true);
					setVoice(id, voice.id);
				});
				group.append(item);
			}
			return group;
		};
		const draw = () => {
			const query = search.value.trim().toLocaleLowerCase("ko");
			if (query) {
				const found = all.filter((voice) =>
					[voice.name, voice.provider, voice.tone, voice.id]
						.join(" ")
						.toLocaleLowerCase("ko")
						.includes(query),
				);
				status.textContent = `검색 결과 ${found.length}명`;
				results.replaceChildren(
					section(
						`검색 결과 ${found.length}명`,
						found,
						null,
						"맞는 성우가 없어요. 다른 이름이나 분위기로 찾아 보세요.",
					),
				);
				return;
			}
			status.textContent = "";
			const used = all
				.filter((voice) => usage.has(voice.id))
				.sort((a, b) => usage.get(b.id) - usage.get(a.id));
			const recentIds = api().getRecentVoices?.();
			const recent = (Array.isArray(recentIds) ? recentIds : [])
				.map((voiceId) => all.find((voice) => voice.id === voiceId))
				.filter(Boolean);
			results.replaceChildren(
				section(
					"이 대본에서 사용 중",
					used,
					(voice) => `${usage.get(voice.id)}곳`,
					"아직 배정한 성우가 없어요.",
				),
				section(
					"최근 사용",
					recent,
					null,
					"음성 생성에 성공한 성우가 여기에 표시돼요",
				),
				section("모든 성우", all, null, "성우 목록이 비어 있어요."),
			);
		};
		search.addEventListener("input", draw);
		search.addEventListener("keydown", (event) => {
			if (event.key !== "ArrowDown") return;
			const first = results.querySelector(".ps-menu-item");
			if (!first) return;
			event.preventDefault();
			first.focus();
		});
		results.addEventListener("keydown", (event) => {
			if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
			const items = [...results.querySelectorAll(".ps-menu-item")];
			const at = items.indexOf(document.activeElement);
			if (at < 0) return;
			event.preventDefault();
			if (event.key === "ArrowUp" && at === 0) return search.focus();
			items[
				Math.min(
					items.length - 1,
					Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)),
				)
			].focus();
		});
		pop.append(search, status, results);
		if (typeof api().openVoicePicker === "function") {
			const more = button(
				"전체 성우에서 찾기 · 필터·샘플",
				"button button-secondary ps-menu-more",
				"search",
			);
			more.addEventListener("click", () => {
				closeMenu(false);
				api().openVoicePicker({
					label: `${number}번 문단`,
					currentVoiceId: segment?.voiceId,
					returnFocus: trigger,
					onPick: (voiceId) => setVoice(id, voiceId),
				});
			});
			pop.append(more);
		}
		draw();
		return search;
	};

	const glyph = (path) => {
		const svg = document.createElementNS(SVG_NS, "svg");
		svg.setAttribute("aria-hidden", "true");
		svg.setAttribute("viewBox", "0 0 24 24");
		const shape = document.createElementNS(SVG_NS, "path");
		shape.setAttribute("d", path);
		svg.append(shape);
		return svg;
	};
	const stepButton = (path, label) => {
		const element = node("button", "ps-step");
		element.type = "button";
		element.setAttribute("aria-label", label);
		element.append(glyph(path));
		return element;
	};
	// 스테퍼: [−] [숫자] [+] + 기본값 버튼. set(value)는 값이 바뀔 때마다 불린다.
	const stepper = ({ label, min, max, get, empty, initial, set, note }) => {
		const box = node("div", "ps-pop-section");
		const row = node("div", "ps-stepper");
		const input = numberInput(
			get(),
			min,
			max,
			empty === null ? "기본" : String(empty),
		);
		input.setAttribute("aria-label", label);
		const error = node(
			"p",
			"ps-field-error",
			`${min}~${max} 사이로 입력해 주세요.`,
		);
		error.id = nextId("error");
		error.hidden = true;
		const apply = (value) => {
			input.value = value === null ? "" : String(value);
			input.removeAttribute("aria-invalid");
			input.removeAttribute("aria-describedby");
			error.hidden = true;
			set(value);
		};
		const bump = (delta) => {
			const now = parseNumber(input, min, max);
			const base = typeof now === "number" ? now : (get() ?? initial);
			apply(Math.min(max, Math.max(min, round1(base + delta))));
		};
		const down = stepButton("M5 12h14", `${label} 0.1 낮추기`);
		const up = stepButton("M12 5v14M5 12h14", `${label} 0.1 높이기`);
		down.addEventListener("click", () => bump(-0.1));
		up.addEventListener("click", () => bump(0.1));
		input.addEventListener("change", () => {
			const value = parseNumber(input, min, max);
			if (value === undefined) {
				input.setAttribute("aria-invalid", "true");
				input.setAttribute("aria-describedby", error.id);
				error.hidden = false;
				return;
			}
			apply(value ?? empty);
		});
		const reset = button("기본값으로", "mini-button");
		reset.addEventListener("click", () => apply(empty));
		row.append(down, input, up, reset);
		box.append(row, error);
		if (note) box.append(node("p", "ps-pop-note", note));
		return { box, input };
	};

	const speedPop = (pop, ctx) => {
		const { box, input } = stepper({
			label: `${ctx.number}번 문단 속도`,
			min: 0.5,
			max: 2,
			get: () => ctx.current.speed,
			empty: null,
			initial: 1,
			set: (value) => ctx.setValue("speed", value),
			note: "0.5~2.0배. 기본은 모델 설정의 속도를 따라요.",
		});
		pop.append(box);
		return input;
	};
	const pausePop = (pop, ctx) => {
		const { box, input } = stepper({
			label: `${ctx.number}번 문단 뒤 간격(초)`,
			min: 0,
			max: 5,
			get: () => ctx.current.pauseAfter,
			empty: DEFAULT_PAUSE,
			initial: DEFAULT_PAUSE,
			set: (value) => ctx.setValue("pauseAfter", value),
			note: "0~5초. 이 문단을 읽은 뒤 쉬는 시간이에요.",
		});
		pop.append(box);
		return input;
	};
	const emotionPop = (pop, ctx) => {
		const { current, number } = ctx;
		const provider = ctx.provider();
		const noIntensity = NO_INTENSITY.has(provider);
		const presets = node("div", "ps-pop-section");
		presets.append(node("p", "ps-pop-title", "감정"));
		const grid = node("div", "ps-option-grid");
		grid.setAttribute("role", "group");
		grid.setAttribute("aria-label", `${number}번 문단 감정`);
		const options = EMOTIONS.map(([emotionId, name]) => {
			const option = node("button", "ps-option", name);
			option.type = "button";
			option.setAttribute(
				"aria-pressed",
				String(current.emotion === emotionId),
			);
			option.addEventListener("click", () => {
				ctx.setValue("emotion", emotionId);
				for (const item of options)
					item.setAttribute("aria-pressed", String(item === option));
			});
			return option;
		});
		grid.append(...options);
		presets.append(grid);

		const strength = node("div", "ps-pop-section");
		const label = node("p", "ps-pop-title", "강도");
		label.id = nextId("intensity");
		const group = node("div", "ps-intensity");
		group.setAttribute("role", "group");
		group.setAttribute("aria-labelledby", label.id);
		const levels = INTENSITIES.map((name, level) => {
			const option = node("button", "ps-segment-button", name);
			option.type = "button";
			option.setAttribute("aria-label", `${number}번 문단 강도 ${name}`);
			option.setAttribute(
				"aria-pressed",
				String(
					current.intensity !== null && Math.round(current.intensity) === level,
				),
			);
			option.disabled = noIntensity;
			option.addEventListener("click", () => {
				const next =
					current.intensity !== null && Math.round(current.intensity) === level
						? null
						: level;
				levels.forEach((item, index) => {
					item.setAttribute("aria-pressed", String(index === next));
				});
				ctx.setValue("intensity", next);
				state.session = "";
			});
			return option;
		});
		group.append(...levels);
		strength.append(label, group);
		strength.append(
			node(
				"p",
				"ps-pop-note",
				noIntensity
					? `${provider}는 숫자 감정 강도를 받지 않아요. 감정은 태그로 표현합니다.`
					: "같은 강도를 다시 누르면 모델 기본으로 돌아가요.",
			),
		);
		pop.append(presets, strength);
		return options.find((item) => item.getAttribute("aria-pressed") === "true");
	};
	const instructionPop = (pop, ctx) => {
		const { current, id, number } = ctx;
		const box = node("div", "ps-pop-section");
		const input = document.createElement("input");
		input.type = "text";
		input.className = "ps-input";
		input.maxLength = MAX_INSTRUCTION;
		input.placeholder = "예: 끝을 살짝 올려서, 천천히";
		input.value = current.instruction;
		input.setAttribute("aria-label", `${number}번 문단 연기 지시`);
		const count = node("span", "ps-count");
		const paint = () => {
			count.textContent = `${input.value.length} / ${MAX_INSTRUCTION}자`;
		};
		input.addEventListener("input", () => {
			current.instruction = input.value;
			paint();
			ctx.paint();
			scheduleField(id, "instruction", input.value);
		});
		bindTyping(input);
		paint();
		const chips = node("div", "ps-quick");
		chips.setAttribute("role", "group");
		chips.setAttribute("aria-label", `${number}번 문단 연기 지시에 덧붙이기`);
		for (const label of CHIPS) {
			const chip = button(label, "ps-chip", "plus");
			chip.setAttribute("aria-label", `연기 지시에 ${label} 덧붙이기`);
			chip.title = `연기 지시 끝에 덧붙이기 · ${label}`;
			chip.addEventListener("click", () => {
				flushText();
				const value = input.value.trim();
				if (value.split(/\s*,\s*/).includes(label))
					return notify("이미 들어 있는 연기 지시예요.");
				const next = value ? `${value}, ${label}` : label;
				if (next.length > MAX_INSTRUCTION)
					return notify("연기 지시는 300자까지 쓸 수 있어요.");
				input.value = next;
				paint();
				ctx.setValue("instruction", next);
				state.session = "";
			});
			chips.append(chip);
		}
		box.append(input, count);
		pop.append(box, chips);
		return input;
	};
	const moreMenu = (pop, ctx) => {
		const { id, number, index, total } = ctx;
		const items = [];
		const add = (label, iconId, reason, run, className = "") => {
			const item = button(
				label,
				`ps-menu-item ps-menu-action ${className}`,
				iconId,
			);
			setBlocked(item, reason);
			item.addEventListener("click", () => {
				if (item.getAttribute("aria-disabled") === "true")
					return notify(reason);
				closeMenu(true);
				run();
			});
			items.push(item);
			return item;
		};
		add(
			"위로 옮기기",
			"up",
			index === 0 ? "첫 번째 문단이에요." : "",
			() => moveSegment(id, -1),
			"ps-mobile-only",
		);
		add(
			"아래로 옮기기",
			"down",
			index === total - 1 ? "마지막 문단이에요." : "",
			() => moveSegment(id, 1),
			"ps-mobile-only",
		);
		add("미리 생성 · 시연", "play", PREVIEW_REASON, () => {}, "ps-mobile-only");
		const first = add(
			"아래에 문단 추가",
			"plus",
			total >= MAX_SEGMENTS ? LIMIT_REASON : "",
			() => addAfter(id),
		);
		add("이 문단 나누기", "split", "", () => openSplitFor(new Set([id])));
		add(
			"삭제",
			"trash",
			total <= 1 ? "마지막 남은 문단은 지울 수 없어요." : "",
			() => deleteSegment(id),
			"ps-danger",
		);
		pop.setAttribute("aria-label", `${number}번 문단 더보기`);
		pop.append(...items);
		return first;
	};

	// ---- 카드 본문에 붙여넣기: 여러 문단이면 나눌지 묻는다 ----
	const pasteInto = async (event, id, area) => {
		const pasted = event.clipboardData?.getData("text/plain") || "";
		const found = api().isSpeakerDetectOn?.() ? detectSpeakers(pasted) : null;
		const parts = found ? [] : splitBlank(pasted);
		if (!found?.segments?.length && parts.length < 2) return;
		event.preventDefault();
		const { selectionStart: start, selectionEnd: end, value } = area;
		const count = found ? found.segments.length : parts.length;
		const choice = await choose(
			found
				? {
						title: `화자 ${found.speakers.length}명·문단 ${count}개를 감지했어요`,
						message:
							"문단으로 나누면 대사마다 문단이 생기고, 역할별로 성우를 고를 수 있어요. 화자 이름과 같은 성우가 있으면 먼저 배정해요.",
						actions: [
							{ label: "그대로 붙여넣기", value: "plain" },
							{ label: "문단으로 나누기", value: "split", variant: "primary" },
						],
					}
				: {
						title: `${count}개 문단으로 나눌까요?`,
						message:
							"빈 줄을 기준으로 나눠요. 나눈 문단은 이 문단의 성우와 설정을 이어받아요.",
						actions: [
							{ label: "그대로 붙여넣기", value: "plain" },
							{ label: "문단으로 나누기", value: "split", variant: "primary" },
						],
					},
		);
		if (choice === "split") {
			const before = value.slice(0, start).trim();
			const after = value.slice(end).trim();
			flushText();
			const segments = read();
			const index = segments.findIndex((item) => item.id === id);
			const base = segments[index];
			if (!base) return;
			const owner = voiceOf(base.voiceId) || api().getActiveVoice?.() || null;
			const roles = found
				? assignRoleVoices(
						found.speakers,
						voices(),
						owner,
						owner &&
							(before || after || found.segments.some((part) => !part.speaker))
							? [owner.id]
							: [],
					)
				: new Map();
			const pieces = found
				? [
						before && { text: before, speaker: base.speaker },
						...found.segments,
						after && { text: after, speaker: base.speaker },
					].filter(Boolean)
				: [before, ...parts, after].filter(Boolean).map((text) => ({ text }));
			if (segments.length - 1 + pieces.length > MAX_SEGMENTS)
				return notify(
					`나누면 ${segments.length - 1 + pieces.length}개가 되어 ${MAX_SEGMENTS}개를 넘어요.`,
				);
			const made = pieces.map((piece, offset) => {
				const cast = found ? voiceOf(roles.get(piece.speaker)) || owner : null;
				const seed = found
					? {
							...base,
							speaker: piece.speaker ?? "",
							voiceId: cast?.id ?? base.voiceId,
							provider: cast?.provider ?? base.provider,
						}
					: base;
				return !found && offset === 0
					? { ...base, text: piece.text }
					: { ...newSegment(seed, piece.text), instruction: base.instruction };
			});
			const done = mutate(
				(list) => {
					const at = list.findIndex((item) => item.id === id);
					if (at < 0) return false;
					list.splice(at, 1, ...made);
				},
				{
					label: "붙여넣은 대본 나누기",
					message: `문단 ${made.length}개로 나눴어요.`,
					focus: [`${made[0].id}:text`],
				},
			);
			if (done && found?.speakers.length) openRoleDialog(api());
			return;
		}
		area.focus();
		area.setRangeText(pasted, start, end, "end");
		area.dispatchEvent(new Event("input", { bubbles: true }));
	};

	// ---- 일괄 작업 (좌측 레일) ----
	const ZERO_REASON = "문단을 선택하면 쓸 수 있어요";
	const syncBatch = () => {
		const bar = state.bar;
		if (!bar) return;
		const total = bar.total;
		const count = state.selected.size;
		// 첫 선택으로 막대가 펼쳐져도 누른 자리가 밀리지 않게 한다. 포커스는 옮기지 않는다.
		const anchor =
			bar.root.classList.contains("has-selection") !== count > 0 &&
			bar.root.contains(document.activeElement)
				? document.activeElement
				: null;
		const before = anchor?.getBoundingClientRect().top;
		bar.root.classList.toggle("has-selection", count > 0);
		state.root?.classList.toggle("has-selection", count > 0);
		const shift = anchor ? anchor.getBoundingClientRect().top - before : 0;
		if (shift) window.scrollBy(0, shift);
		bar.all.checked = total > 0 && count === total;
		bar.all.indeterminate = count > 0 && count < total;
		bar.count.textContent = `선택 ${count}/${total}`;
		bar.sheetCount.textContent = `선택 ${count}개`;
		bar.undo.hidden = !state.history.length;
		const zero = count === 0 ? ZERO_REASON : "";
		const mergeReason =
			zero || (count === 1 ? "합치기는 문단을 2개 이상 선택해야 해요." : "");
		const removeReason =
			zero ||
			(count >= total
				? "문단을 모두 지울 수는 없어요. 1개 이상 남겨 주세요."
				: "");
		for (const key of ["voice", "speed", "pause"])
			setBlocked(bar.buttons[key], zero);
		setBlocked(bar.buttons.merge, mergeReason);
		setBlocked(bar.buttons.remove, removeReason);
		bar.hint.textContent = zero
			? ZERO_REASON
			: [mergeReason, removeReason].filter(Boolean).join(" ");
		bar.hint.hidden = !bar.hint.textContent;
		const applyButton = bar.applyRef.button;
		if (applyButton) {
			applyButton.textContent = `선택한 ${count}개에 적용`;
			setBlocked(applyButton, zero);
		}
	};
	const syncCards = () => {
		for (const card of state.root?.querySelectorAll(".ps-card") || []) {
			const selected = state.selected.has(card.dataset.segmentId);
			card.classList.toggle("is-selected", selected);
			const check = card.querySelector(".ps-card-check");
			if (check) check.checked = selected;
		}
		syncBatch();
	};
	const applyVoiceToSelected = (voice) =>
		applyToSelected(
			(segment) => {
				segment.voiceId = voice.id;
				segment.provider = voice.provider;
			},
			{
				label: "성우 일괄 변경",
				focus: ["batch:voice-apply"],
				message: `선택한 문단 ${state.selected.size}개의 성우를 바꿨어요 · ${voice.name}`,
			},
		);
	// 속도·간격: 버튼 그리드 아래 인라인 패널(스테퍼 + 기본값 + 적용). 적용을 눌러야 문단에 들어간다.
	const batchNumberPanel = (options, applyRef, close) => {
		const { name, label, min, max, empty, initial, note, focus, done } =
			options;
		const panel = node("div", "ps-batch-inline-body");
		panel.append(node("p", "ps-pop-title", `선택한 문단의 ${label}`));
		let draft = state.batchValues[name];
		const { box, input } = stepper({
			label: `선택 문단 ${label}`,
			min,
			max,
			get: () => (draft === undefined ? initial : draft),
			empty,
			initial,
			set: (value) => {
				draft = value;
				state.batchValues[name] = value;
			},
			note,
		});
		const apply = button("", "button button-primary ps-pop-apply");
		applyRef.button = apply;
		onPress(apply, () => {
			if (input.getAttribute("aria-invalid") === "true") return input.focus();
			const value = draft === undefined ? initial : draft;
			close(false);
			applyToSelected(
				(segment) => {
					segment[name] = value;
				},
				{
					label: `${label} 일괄 변경`,
					focus: [focus],
					message: done(value),
				},
			);
		});
		panel.append(box, apply);
		return { panel, input };
	};
	const buildBatch = (segments) => {
		const bar = node("div", "ps-batch");
		bar.setAttribute("role", "group");
		bar.setAttribute("aria-label", "문단 일괄 작업");
		const head = node("div", "ps-batch-head");
		const title = node("h2", "ps-batch-title", "문단 일괄 작업");
		const undoButton = button("되돌리기", "mini-button ps-undo", "undo");
		focusKey(undoButton, "batch:undo");
		undoButton.addEventListener("click", undo);
		head.append(title, undoButton);
		const top = node("div", "ps-batch-top");
		const allLabel = node("label", "ps-check ps-check-all");
		const all = document.createElement("input");
		all.type = "checkbox";
		focusKey(all, "batch:all");
		all.addEventListener("change", () => {
			state.selected = all.checked
				? new Set(read().map((item) => item.id))
				: new Set();
			syncCards();
		});
		allLabel.append(all, node("span", "", "전체 선택"));
		const count = node("span", "ps-batch-count");
		top.append(allLabel, count);

		const panel = node("div", "ps-batch-panel");
		const sheetHead = node("div", "ps-sheet-head");
		const sheetCount = node("strong", "ps-sheet-count");
		const clear = button("선택 해제", "mini-button", "close");
		clear.addEventListener("click", () => {
			state.selected.clear();
			syncCards();
			all.focus();
		});
		sheetHead.append(sheetCount, clear);

		const grid = node("div", "ps-batch-actions");
		const tile = (label, iconId, className, key) => {
			const element = button(
				label,
				`mini-button ps-batch-btn ${className}`,
				iconId,
			);
			focusKey(element, key);
			return element;
		};
		const voice = tile(
			"성우 고르기",
			"voice",
			"ps-voice-pick",
			"batch:voice-apply",
		);
		voice.setAttribute("aria-label", "선택 문단의 성우 고르기");
		onPress(voice, () => {
			if (typeof api().openVoicePicker !== "function")
				return notify("성우 고르기를 불러오지 못했어요.");
			api().openVoicePicker({
				label: `선택한 문단 ${state.selected.size}개`,
				returnFocus: voice,
				onPick: (voiceId) => {
					const picked = voiceOf(voiceId);
					if (picked) applyVoiceToSelected(picked);
					else notify("성우를 찾지 못했어요.");
				},
			});
		});
		const inline = node("div", "ps-batch-inline");
		inline.id = nextId("batch-inline");
		inline.hidden = true;
		const applyRef = { button: null };
		const tiles = [];
		let openName = "";
		const closeInline = (returnFocus) => {
			const owner = tiles.find((item) => item.name === openName);
			openName = "";
			inline.hidden = true;
			inline.replaceChildren();
			applyRef.button = null;
			for (const item of tiles)
				item.element.setAttribute("aria-expanded", "false");
			if (returnFocus) owner?.element.focus();
		};
		inline.addEventListener("keydown", (event) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			closeInline(true);
		});
		const numberTile = (label, iconId, key, options) => {
			const element = tile(label, iconId, "", key);
			element.setAttribute("aria-haspopup", "true");
			element.setAttribute("aria-expanded", "false");
			element.setAttribute("aria-controls", inline.id);
			element.setAttribute("aria-label", `선택 문단의 ${label} 바꾸기`);
			tiles.push({ name: options.name, element });
			onPress(element, () => {
				if (openName === options.name) return closeInline(true);
				closeInline(false);
				const { panel, input } = batchNumberPanel(
					{ ...options, focus: key },
					applyRef,
					closeInline,
				);
				openName = options.name;
				inline.replaceChildren(panel);
				inline.hidden = false;
				element.setAttribute("aria-expanded", "true");
				syncBatch();
				input.focus();
			});
			return element;
		};
		const speed = numberTile("속도", "sliders", "batch:speed-apply", {
			name: "speed",
			label: "속도",
			min: 0.5,
			max: 2,
			empty: null,
			initial: 1,
			note: "0.5~2.0배. 기본은 모델 설정을 따라요.",
			done: (value) =>
				value === null
					? `선택한 문단 ${state.selected.size}개가 모델 설정 속도를 따릅니다.`
					: `선택한 문단 ${state.selected.size}개의 속도를 바꿨어요 · ${value}`,
		});
		const pause = numberTile("간격", "wave", "batch:pauseAfter-apply", {
			name: "pauseAfter",
			label: "간격",
			min: 0,
			max: 5,
			empty: DEFAULT_PAUSE,
			initial: DEFAULT_PAUSE,
			note: "0~5초. 문단 뒤에 쉬는 시간이에요.",
			done: (value) =>
				`선택한 문단 ${state.selected.size}개의 문단 뒤 간격을 바꿨어요 · ${value}초`,
		});
		const split = tile("분할", "split", "ps-split", "batch:split");
		split.title = "선택한 문단을 나눠요. 선택이 없으면 전체 문단이 대상이에요.";
		onPress(split, () =>
			openSplitFor(
				state.selected.size
					? new Set(state.selected)
					: new Set(read().map((item) => item.id)),
			),
		);
		const merge = tile("합치기", "merge", "ps-merge", "batch:merge");
		onPress(merge, mergeSelected);
		const remove = tile(
			"선택 삭제",
			"trash",
			"ps-danger ps-remove",
			"batch:remove",
		);
		onPress(remove, deleteSelected);
		grid.append(voice, speed, pause, split, merge, remove);
		const hint = node("p", "ps-batch-hint");
		hint.id = nextId("batch-hint");
		const buttons = { voice, speed, pause, merge, remove };
		for (const element of Object.values(buttons))
			element.setAttribute("aria-describedby", hint.id);
		panel.append(sheetHead, grid, inline, hint);
		bar.append(head, top, panel);
		state.bar = {
			root: bar,
			panel,
			all,
			count,
			sheetCount,
			undo: undoButton,
			hint,
			buttons,
			applyRef,
			total: segments.length,
		};
		return bar;
	};

	// ---- 문단 카드 ----
	// 조절 툴바: 탭 정지는 하나(roving tabindex), ←/→/Home/End로 옮긴다.
	const setupToolbar = (toolbar) => {
		const all = () => [...toolbar.querySelectorAll("button")];
		const visible = () =>
			all().filter((item) => !item.disabled && item.getClientRects().length);
		const mark = (active) => {
			for (const item of all()) item.tabIndex = item === active ? 0 : -1;
		};
		toolbar.addEventListener("focusin", (event) => {
			const target = event.target.closest?.("button");
			if (target && toolbar.contains(target)) mark(target);
		});
		toolbar.addEventListener("keydown", (event) => {
			if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
				return;
			const list = visible();
			const at = list.indexOf(event.target.closest?.("button"));
			if (at < 0) return;
			event.preventDefault();
			const step = event.key === "ArrowRight" ? 1 : -1;
			const next =
				event.key === "Home"
					? 0
					: event.key === "End"
						? list.length - 1
						: (at + step + list.length) % list.length;
			list[next].focus();
		});
		mark(all()[0]);
	};
	const buildCard = (segment, index, total) => {
		const number = index + 1;
		const id = segment.id;
		const current = { ...segment };
		const card = node("li", "ps-card");
		card.dataset.segmentId = id;
		card.setAttribute("aria-label", `문단 ${number}`);
		card.classList.toggle("is-selected", state.selected.has(id));
		if (state.playing === id) {
			card.classList.add("is-playing");
			card.setAttribute("aria-current", "true");
		}
		const summary = node("div", "ps-summary");
		const checkLabel = node("label", "ps-check");
		const check = document.createElement("input");
		check.type = "checkbox";
		check.className = "ps-card-check";
		check.checked = state.selected.has(id);
		check.setAttribute("aria-label", `${number}번 문단 선택`);
		focusKey(check, `${id}:check`);
		check.addEventListener("change", () => {
			if (check.checked) state.selected.add(id);
			else state.selected.delete(id);
			card.classList.toggle("is-selected", check.checked);
			syncBatch();
		});
		checkLabel.append(check);
		const badge = node("span", "ps-num", String(number));
		badge.setAttribute("aria-hidden", "true");
		const len = node("span", "ps-len");
		const usage = node("span", "ps-usage");
		const tools = node("div", "ps-tools");
		tools.setAttribute("role", "toolbar");
		tools.setAttribute("aria-label", `${number}번 문단 조절`);

		const voice = voiceOf(segment.voiceId);
		const voiceButton = node("button", "ps-voice-button");
		voiceButton.type = "button";
		voiceButton.setAttribute("aria-haspopup", "dialog");
		voiceButton.setAttribute("aria-expanded", "false");
		voiceButton.title = voice
			? `${voice.name} · ${voice.provider}`
			: "성우 미지정";
		focusKey(voiceButton, `${id}:voice`);
		const avatar = node("span", "ps-avatar", initialOf(voice));
		avatar.setAttribute("aria-hidden", "true");
		voiceButton.append(
			node("span", "sr-only", `${number}번 문단 성우 `),
			avatar,
			node("span", "ps-voice-name", voice?.name || "성우 미지정"),
			icon("chevron-down"),
		);
		bindPopover(card, voiceButton, `${number}번 문단 성우 고르기`, (pop) =>
			voiceMenu(pop, voiceButton, id, number),
		);
		tools.append(voiceButton);
		if (segment.speaker) {
			const role = button(`역할 · ${segment.speaker}`, "ps-role");
			role.title = `‘${segment.speaker}’ 역할의 성우를 한 번에 바꿉니다`;
			focusKey(role, `${id}:role`);
			role.addEventListener("click", () =>
				openRoleDialog(api(), segment.speaker),
			);
			tools.append(role);
		}

		// 입력 전의 빈 카드는 오류가 아니다. 편집한 뒤 비웠을 때만 알린다.
		let edited = false;
		const text = document.createElement("textarea");
		text.className = "ps-text";
		text.placeholder = "문단 내용을 입력해 주세요";
		text.rows = 1;
		text.maxLength = MAX_TEXT;
		text.value = pendingValue(id, "text", segment.text);
		text.setAttribute("aria-label", `${number}번 문단 대사`);
		focusKey(text, `${id}:text`);
		const counter = node("span", "ps-count");
		const problem = node("p", "ps-problem");
		problem.id = nextId("problem");
		text.setAttribute("aria-describedby", problem.id);
		const meta = node("div", "ps-meta");
		meta.append(problem, counter);

		const chipButton = (key) => {
			const element = node("button", "ps-chip-btn");
			element.type = "button";
			element.setAttribute("aria-haspopup", "dialog");
			element.setAttribute("aria-expanded", "false");
			focusKey(element, `${id}:${key}`);
			return element;
		};
		const speedChip = chipButton("speed");
		const pauseChip = chipButton("pause");
		const emotionChip = chipButton("emotion");
		const instructionChip = chipButton("instruction");
		const providerOf = () =>
			voiceOf(current.voiceId)?.provider || current.provider;
		const setChip = (element, label, changed) => {
			element.textContent = label;
			element.classList.toggle("is-changed", changed);
			element.setAttribute("aria-label", `${number}번 문단 ${label} 바꾸기`);
		};
		const paint = () => {
			setChip(speedChip, speedLabel(current.speed), current.speed !== null);
			setChip(
				pauseChip,
				pauseLabel(current.pauseAfter),
				current.pauseAfter !== DEFAULT_PAUSE,
			);
			setChip(
				emotionChip,
				emotionLabel(current, NO_INTENSITY.has(providerOf())),
				current.emotion !== "normal",
			);
			setChip(
				instructionChip,
				instructionLabel(current.instruction),
				Boolean(current.instruction.trim()),
			);
		};
		const refresh = () => {
			const value = text.value;
			const over = value.length > MAX_TEXT;
			current.text = value;
			counter.textContent = `${formatCount(value.length)} / ${formatCount(MAX_TEXT)}자`;
			counter.hidden = value.length < MAX_TEXT * 0.75;
			problem.textContent = over
				? `${formatCount(value.length)}자로 2,000자를 넘었어요. 문단을 나누거나 줄여 주세요.`
				: value.trim() || !edited
					? ""
					: "내용을 입력해 주세요. 빈 문단은 생성할 수 없어요.";
			problem.classList.toggle("is-error", over);
			problem.hidden = !problem.textContent;
			meta.hidden = problem.hidden && counter.hidden;
			if (over) text.setAttribute("aria-invalid", "true");
			else text.removeAttribute("aria-invalid");
			card.classList.toggle("has-error", over);
			const result = estimate(current);
			len.replaceChildren(
				node("span", "sr-only", "예상 길이 약 "),
				document.createTextNode(`${Number(result.seconds).toFixed(1)}초`),
			);
			usage.replaceChildren(
				node("span", "sr-only", "예상 사용량 "),
				document.createTextNode(result.usageLabel),
			);
			len.title = usage.title = result.basis || "";
			paint();
		};
		const setValue = (name, value) => {
			current[name] = value;
			saveField(id, name, value);
			paint();
			refresh();
		};
		const ctx = {
			id,
			number,
			current,
			setValue,
			paint,
			provider: providerOf,
		};
		bindPopover(card, speedChip, `${number}번 문단 속도`, (pop) =>
			speedPop(pop, ctx),
		);
		bindPopover(card, pauseChip, `${number}번 문단 뒤 간격`, (pop) =>
			pausePop(pop, ctx),
		);
		bindPopover(card, emotionChip, `${number}번 문단 감정`, (pop) =>
			emotionPop(pop, ctx),
		);
		bindPopover(card, instructionChip, `${number}번 문단 연기 지시`, (pop) =>
			instructionPop(pop, ctx),
		);
		tools.append(speedChip, pauseChip, emotionChip, instructionChip);

		const recommend = node("button", "ps-action ps-recommend");
		recommend.type = "button";
		recommend.setAttribute("aria-label", `${number}번 문단 성우 추천`);
		recommend.title = "이 문단에 맞는 성우를 추천받아요";
		recommend.append(icon("search"), node("span", "ps-action-label", "추천"));
		focusKey(recommend, `${id}:recommend`);
		recommend.addEventListener("click", () => recommendFor(id));
		const preview = iconButton("play", `${number}번 문단 미리 생성 · 시연`);
		preview.classList.add("ps-act", "ps-preview");
		focusKey(preview, `${id}:preview`);
		setBlocked(preview, PREVIEW_REASON);
		onPress(preview, () => {});
		const up = iconButton("up", `${number}번 문단 위로 이동`);
		up.classList.add("ps-act", "ps-up");
		up.disabled = index === 0;
		focusKey(up, `${id}:up`);
		up.addEventListener("click", () => moveSegment(id, -1));
		const down = iconButton("down", `${number}번 문단 아래로 이동`);
		down.classList.add("ps-act", "ps-down");
		down.disabled = index === total - 1;
		focusKey(down, `${id}:down`);
		down.addEventListener("click", () => moveSegment(id, 1));
		const more = iconButton("more", `${number}번 문단 더보기`);
		more.classList.add("ps-act");
		more.setAttribute("aria-haspopup", "dialog");
		more.setAttribute("aria-expanded", "false");
		focusKey(more, `${id}:more`);
		bindPopover(
			card,
			more,
			`${number}번 문단 더보기`,
			(pop) => moreMenu(pop, { id, number, index, total }),
			"ps-pop-more",
		);
		tools.append(recommend, preview, up, down, more);
		setupToolbar(tools);

		text.addEventListener("input", () => {
			edited = true;
			autoGrow(text);
			refresh();
			scheduleField(id, "text", text.value);
		});
		text.addEventListener("paste", (event) => pasteInto(event, id, text));
		bindTyping(text);
		refresh();

		summary.append(checkLabel, badge, len, usage, tools);
		const body = node("div", "ps-card-body");
		body.append(text, meta);
		card.append(summary, body);
		return card;
	};
	const buildFooter = (segments) => {
		const footer = node("div", "ps-footer");
		const add = button("문단 추가", "button button-secondary", "plus");
		focusKey(add, "footer:add");
		setBlocked(add, segments.length >= MAX_SEGMENTS ? LIMIT_REASON : "");
		onPress(add, () => addAfter(segments.at(-1).id));
		footer.append(
			add,
			node(
				"span",
				"ps-footer-count",
				`${segments.length}/${MAX_SEGMENTS}개 문단`,
			),
		);
		return footer;
	};

	// ---- 그리기 ----
	// 모바일 시트 높이는 :root에 둔다. 알림(.toast)도 시트 위로 올라가야 한다. 시트가 아니면 0.
	const publishSheet = () => {
		const panel = state.bar?.panel;
		const sheet =
			panel && getComputedStyle(panel).position === "fixed"
				? panel.offsetHeight
				: 0;
		document.documentElement.style.setProperty(
			"--ps-sheet-height",
			`${sheet}px`,
		);
	};
	const observe = () => {
		if (typeof ResizeObserver !== "function" || !state.bar) return;
		state.observer ||= new ResizeObserver(() => {
			publishSheet();
			if (!state.bar || !state.root) return;
			state.root.style.setProperty(
				"--ps-bar-height",
				`${state.bar.root.offsetHeight}px`,
			);
		});
		state.observer.disconnect();
		state.observer.observe(state.bar.root);
		state.observer.observe(state.bar.panel);
	};
	const listenOnce = () => {
		if (state.listening) return;
		state.listening = true;
		document.addEventListener(
			"pointerdown",
			(event) => {
				const menu = state.menu;
				if (
					menu &&
					!menu.element.contains(event.target) &&
					!menu.trigger.contains(event.target)
				)
					closeMenu(false);
			},
			true,
		);
	};
	const findFocus = (key) => {
		const selector = `[data-focus="${CSS.escape(key)}"]`;
		return (
			state.container?.querySelector(selector) ||
			state.host?.querySelector(selector)
		);
	};
	const restoreFocus = (keys, selection) => {
		for (const key of keys) {
			if (!key || !state.container) continue;
			const target = findFocus(key);
			if (!target || target.disabled || !target.getClientRects().length)
				continue;
			target.focus({ preventScroll: true });
			target.scrollIntoView({ block: "nearest" });
			if (
				selection?.key === key &&
				typeof target.setSelectionRange === "function"
			)
				target.setSelectionRange(selection.start, selection.end);
			return true;
		}
		return false;
	};
	const render = (container, bridge, focus) => {
		if (!container) return;
		state.container = container;
		if (bridge) state.bridge = bridge;
		state.renders += 1;
		if (state.busy?.quiet && state.root && container.contains(state.root))
			return;
		listenOnce();
		const host = document.getElementById("batch-rail");
		state.host = host;
		const segments = read();
		// 다른 화면이 문단을 바꿨으면 이전 되돌리기 기록은 더 이상 맞지 않는다.
		if (!state.busy) {
			const json = rawJson();
			if (state.lastJson !== undefined && json !== state.lastJson)
				state.history = [];
			state.lastJson = json;
		}
		const keys = [...(focus || state.busy?.focus || [])];
		const active = document.activeElement;
		let selection = null;
		if (
			active?.dataset?.focus &&
			(container.contains(active) || host?.contains(active))
		) {
			keys.push(active.dataset.focus);
			if (
				(active.tagName === "TEXTAREA" || active.type === "text") &&
				typeof active.selectionStart === "number"
			)
				selection = {
					key: active.dataset.focus,
					start: active.selectionStart,
					end: active.selectionEnd,
				};
		}
		closeMenu(false, false);
		state.rendering = true;
		try {
			const ids = new Set(segments.map((item) => item.id));
			for (const id of state.selected)
				if (!ids.has(id)) state.selected.delete(id);
			container.hidden = !segments.length;
			if (!segments.length) {
				container.replaceChildren();
				host?.replaceChildren();
				state.root = null;
				state.bar = null;
				publishSheet();
				return;
			}
			const root = node("div", "ps-root");
			state.root = root;
			const list = node("ol", "ps-list");
			list.setAttribute("role", "list");
			segments.forEach((segment, index) => {
				list.append(buildCard(segment, index, segments.length));
			});
			const bar = buildBatch(segments);
			if (host) host.replaceChildren(bar);
			else root.append(bar);
			root.append(list, buildFooter(segments));
			container.replaceChildren(root);
			for (const area of root.querySelectorAll(".ps-text")) autoGrow(area);
			syncBatch();
			observe();
		} finally {
			state.rendering = false;
		}
		restoreFocus(keys, selection);
	};

	const setPlaying = (id) => {
		state.playing = id ?? null;
		const root = state.root;
		if (!root) return;
		for (const card of root.querySelectorAll(".ps-card.is-playing")) {
			card.classList.remove("is-playing");
			card.removeAttribute("aria-current");
		}
		if (!state.playing) return;
		const card = root.querySelector(
			`.ps-card[data-segment-id="${CSS.escape(state.playing)}"]`,
		);
		if (!card) return;
		card.classList.add("is-playing");
		card.setAttribute("aria-current", "true");
		const reduce = window.matchMedia?.(
			"(prefers-reduced-motion: reduce)",
		).matches;
		card.scrollIntoView({
			block: "nearest",
			behavior: reduce ? "auto" : "smooth",
		});
	};

	// node로 실행하는 자체 점검. 실패 수를 돌려준다.
	const selfTest = () => {
		let failures = 0;
		const check = (condition, label) => {
			console.assert(condition, label);
			if (!condition) failures += 1;
		};
		const same = (actual, expected) =>
			JSON.stringify(actual) === JSON.stringify(expected);
		const colon = detectSpeakers("지수: 안녕하세요\n민호: 반가워요");
		check(
			same(colon?.speakers, ["지수", "민호"]) && colon.segments.length === 2,
			"이름: 대사",
		);
		check(
			same(detectSpeakers("지수 : 안녕\n민호 : 네")?.segments[1], {
				speaker: "민호",
				text: "네",
			}),
			"이름 : 대사",
		);
		check(
			same(detectSpeakers("[지수] 안녕\n[민호] 반가워")?.speakers, [
				"지수",
				"민호",
			]),
			"[이름] 대사",
		);
		check(
			same(detectSpeakers("[지수]\n첫 줄\n둘째 줄\n[민호]\n대답")?.segments, [
				{ speaker: "지수", text: "첫 줄\n둘째 줄" },
				{ speaker: "민호", text: "대답" },
			]),
			"[이름] 다음 줄",
		);
		check(
			detectSpeakers(
				"회의는 12:30에 시작합니다.\n비율은 3:2입니다.\n오후 1:15",
			) === null,
			"시간·비율은 화자가 아님",
		);
		check(
			detectSpeakers("https://example.com\nhttp://example.org") === null,
			"URL은 화자가 아님",
		);
		check(
			detectSpeakers("1: 하나\n2: 둘") === null,
			"숫자만 이름은 화자가 아님",
		);
		check(detectSpeakers("지수: 혼자 말해요") === null, "화자 줄 1개면 null");
		const mixed = detectSpeakers("오늘 12:30 회의\n지수: 네\n민호: 좋아요");
		check(
			mixed?.segments[0].speaker === "" && mixed.speakers.length === 2,
			"화자 없는 앞줄",
		);
		check(
			same(splitText("첫 문장. 둘째 문장? 셋째!", "sentence"), [
				"첫 문장.",
				"둘째 문장?",
				"셋째!",
			]),
			"마침표 기준",
		);
		check(
			same(splitText("12.5% 올랐습니다. 끝.", "sentence"), [
				"12.5% 올랐습니다.",
				"끝.",
			]),
			"소수점에서 자르지 않음",
		);
		check(
			same(splitText("가\n\n나\n다", "line"), ["가", "나", "다"]),
			"줄바꿈",
		);
		check(
			same(splitText("하나. 둘\n셋. 넷", "both"), ["하나.", "둘", "셋.", "넷"]),
			"둘 다",
		);
		check(
			same(splitText("가나다. 라마바. 사아자.", "chars", 9), [
				"가나다. 라마바.",
				"사아자.",
			]),
			"글자 수: 문장 경계 우선",
		);
		check(
			same(
				splitText("가".repeat(25), "chars", 10).map((piece) => piece.length),
				[10, 10, 5],
			),
			"글자 수: 긴 문장 강제 자르기",
		);
		check(same(splitText("  \n ", "line"), []), "빈 조각 제거");
		const cast = [
			{ id: "a", name: "가", provider: "T", gender: "여성" },
			{ id: "b", name: "나", provider: "T", gender: "여성" },
			{ id: "c", name: "다", provider: "T", gender: "남성" },
			{ id: "d", name: "라", provider: "E", gender: "남성" },
		];
		check(
			same(
				[...assignRoleVoices(["지수", "민우"], cast, cast[0])],
				[
					["지수", "a"],
					["민우", "c"],
				],
			),
			"역할마다 다른 성우, 성별 번갈아",
		);
		check(
			same(
				[...assignRoleVoices(["지수", "나"], cast, cast[0], ["a"])],
				[
					["나", "b"],
					["지수", "c"],
				],
			),
			"이름이 같은 성우 우선, 해설 성우는 비움",
		);
		check(
			same(
				[...assignRoleVoices(["1", "2", "3"], cast.slice(0, 2), cast[0])].map(
					([, voiceId]) => voiceId,
				),
				["a", "b", "a"],
			),
			"성우가 모자랄 때만 다시 씀",
		);
		check(
			same(splitBlank("가\n\n나 다\n \n\n라"), ["가", "나 다", "라"]),
			"빈 줄로 덩어리 나누기",
		);
		check(splitBlank("한 줄\n다음 줄").length === 1, "줄바꿈만이면 한 덩어리");
		check(
			speedLabel(null) === "속도 기본" && speedLabel(1.2) === "속도 1.2배",
			"속도 칩 문구",
		);
		check(
			pauseLabel(0.3) === "뒤 0.3초" && pauseLabel(0) === "뒤 0초",
			"간격 칩 문구",
		);
		check(
			emotionLabel({ emotion: "normal", intensity: 1 }, false) ===
				"감정 기본" &&
				emotionLabel({ emotion: "sad", intensity: 1 }, false) ===
					"차분 · 보통" &&
				emotionLabel({ emotion: "sad", intensity: 1 }, true) === "차분" &&
				emotionLabel({ emotion: "happy", intensity: null }, false) === "밝게",
			"감정 칩 문구",
		);
		check(
			instructionLabel("") === "지시 +" &&
				instructionLabel("강조") === "지시 있음",
			"지시 칩 문구",
		);
		const stats = roleStats();
		check(
			stats.roles >= stats.assigned && stats.assigned >= 0,
			"역할 통계: 지정 수는 역할 수 이하",
		);
		return failures;
	};

	// 767px 이하에서는 일괄 줄이 숨어 있어 툴바 ⋯ 메뉴가 이 둘을 부른다.
	const selectAll = () => {
		flushText();
		state.selected = new Set(read().map((item) => item.id));
		syncCards();
		announce(`문단 ${state.selected.size}개를 모두 선택했어요.`);
		return state.selected.size;
	};
	const openSplit = () => {
		flushText();
		const ids = state.selected.size
			? new Set(state.selected)
			: new Set(read().map((item) => item.id));
		openSplitFor(ids);
	};

	window.TTSParagraphs = {
		render,
		selectAll,
		openSplit,
		roleStats,
		detectSpeakers,
		splitText,
		assignRoleVoices,
		startFromText,
		openRoleDialog,
		setPlaying,
		_selfTest: selfTest,
	};
})();
