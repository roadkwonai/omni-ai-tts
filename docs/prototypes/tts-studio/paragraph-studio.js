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
		batchOpen: false,
		batchValues: { voice: "", speed: "", pause: "" },
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
	const fillEstimate = (target, segment) => {
		const result = estimate(segment);
		const tag = node("span", "ps-estimate-tag", "추정");
		target.replaceChildren(
			node("span", "", `예상 길이 약 ${Number(result.seconds).toFixed(1)}초`),
			node("span", "", `예상 사용량 ${result.usageLabel}`),
			tag,
		);
		target.title = result.basis || "";
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
	const invalid = (control, message) => {
		control.setAttribute("aria-invalid", "true");
		control.focus();
		notify(message);
	};
	const batchVoice = (control) => {
		const voice = voiceOf(control.value);
		if (!voice) return invalid(control, "적용할 성우를 골라 주세요.");
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
	};
	const batchNumber = (control, name, min, max, message, done) => {
		const value = parseNumber(control, min, max);
		if (value === undefined || value === null) return invalid(control, message);
		control.removeAttribute("aria-invalid");
		applyToSelected(
			(segment) => {
				segment[name] = value;
			},
			{
				label: name === "speed" ? "속도 일괄 변경" : "간격 일괄 변경",
				focus: [`batch:${name}-apply`],
				message: done(value),
			},
		);
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
				state.root?.querySelector(".ps-title")?.focus();
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
			row.append(info, select, hint);
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

	// ---- 성우 빠른 메뉴 (모달 아님) ----
	const closeMenu = (returnFocus) => {
		const menu = state.menu;
		if (!menu) return;
		state.menu = null;
		menu.element.remove();
		menu.trigger.setAttribute("aria-expanded", "false");
		if (returnFocus) menu.trigger.focus();
	};
	const openMenu = (wrap, trigger, id, number) => {
		closeMenu(false);
		flushText();
		const segments = read();
		const segment = segments.find((item) => item.id === id);
		if (!segment) return;
		const usage = new Map();
		for (const item of segments)
			if (item.voiceId)
				usage.set(item.voiceId, (usage.get(item.voiceId) || 0) + 1);
		const all = voices();
		const menu = node("div", "ps-menu");
		menu.id = nextId("menu");
		menu.setAttribute("role", "dialog");
		menu.setAttribute("aria-label", `${number}번 문단 성우 고르기`);
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
				item.setAttribute("aria-pressed", String(voice.id === segment.voiceId));
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
		menu.addEventListener("keydown", (event) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			closeMenu(true);
		});
		menu.append(search, status, results);
		wrap.append(menu);
		trigger.setAttribute("aria-controls", menu.id);
		trigger.setAttribute("aria-expanded", "true");
		state.menu = { element: menu, trigger, wrap };
		draw();
		search.focus();
	};

	// ---- 일괄 막대 ----
	const syncBatch = () => {
		const bar = state.bar;
		if (!bar) return;
		const total = bar.total;
		const count = state.selected.size;
		// 첫 선택으로 막대가 펼쳐져도 누른 자리가 밀리지 않게 한다. 포커스는 옮기지 않는다.
		const anchor =
			bar.root.classList.contains("has-selection") !== count > 0 &&
			state.root?.contains(document.activeElement)
				? document.activeElement
				: null;
		const before = anchor?.getBoundingClientRect().top;
		bar.root.classList.toggle("has-selection", count > 0);
		bar.root.classList.toggle("is-open", state.batchOpen);
		state.root?.classList.toggle("has-selection", count > 0);
		const shift = anchor ? anchor.getBoundingClientRect().top - before : 0;
		if (shift) window.scrollBy(0, shift);
		bar.empty.hidden = count > 0;
		bar.all.checked = total > 0 && count === total;
		bar.all.indeterminate = count > 0 && count < total;
		bar.count.textContent = `선택 ${count}/${total}`;
		bar.sheetCount.textContent = `선택 ${count}개`;
		bar.toggle.setAttribute("aria-expanded", String(state.batchOpen));
		bar.undo.hidden = !state.history.length;
		// 선택이 없으면 패널(설정·동작)이 숨어 있어 합치기·삭제 사유만 따진다.
		const mergeReason =
			count === 1 ? "합치기는 문단을 2개 이상 선택해야 해요." : "";
		const removeReason =
			count > 0 && count >= total
				? "문단을 모두 지울 수는 없어요. 1개 이상 남겨 주세요."
				: "";
		setBlocked(bar.buttons.merge, mergeReason);
		setBlocked(bar.buttons.remove, removeReason);
		bar.hint.textContent = [mergeReason, removeReason]
			.filter(Boolean)
			.join(" ");
		bar.hint.hidden = !bar.hint.textContent;
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
	const batchGroup = (labelText, control, ...actions) => {
		const group = node("div", "ps-batch-group");
		const label = node("label", "ps-field-label", labelText);
		control.id = nextId("batch");
		label.htmlFor = control.id;
		group.append(label, control, ...actions);
		return group;
	};
	const buildBatch = (segments) => {
		const bar = node("div", "ps-batch");
		bar.setAttribute("role", "group");
		bar.setAttribute("aria-label", "문단 일괄 작업");
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
		const empty = node(
			"p",
			"ps-batch-empty",
			"문단을 선택하면 성우·속도·간격을 한 번에 바꾸고 나누기·합치기·삭제를 할 수 있어요",
		);
		const undoButton = button("되돌리기", "mini-button ps-undo", "undo");
		focusKey(undoButton, "batch:undo");
		undoButton.addEventListener("click", undo);
		top.append(allLabel, count, empty, undoButton);

		const panel = node("div", "ps-batch-panel");
		const sheetHead = node("div", "ps-sheet-head");
		const sheetCount = node("strong", "ps-sheet-count");
		const settings = node("div", "ps-batch-settings");
		settings.id = nextId("batch-settings");
		const toggle = button(
			"설정 일괄 변경",
			"mini-button ps-sheet-toggle",
			"sliders",
		);
		toggle.setAttribute("aria-controls", settings.id);
		focusKey(toggle, "batch:toggle");
		toggle.addEventListener("click", () => {
			state.batchOpen = !state.batchOpen;
			syncBatch();
		});
		const clear = button("선택 해제", "mini-button", "close");
		clear.addEventListener("click", () => {
			state.selected.clear();
			syncCards();
			all.focus();
		});
		sheetHead.append(sheetCount, toggle, clear);

		const values = state.batchValues;
		const voiceSelect = selectInput(
			[
				["", "성우 선택"],
				...voices().map((voice) => [voice.id, voiceName(voice)]),
			],
			values.voice,
		);
		voiceSelect.addEventListener("change", () => {
			values.voice = voiceSelect.value;
			voiceSelect.removeAttribute("aria-invalid");
		});
		const voiceApply = button("적용", "mini-button");
		voiceApply.setAttribute("aria-label", "선택 문단에 성우 적용");
		focusKey(voiceApply, "batch:voice-apply");
		onPress(voiceApply, () => batchVoice(voiceSelect));

		const speed = numberInput(values.speed, 0.5, 2, "1.0");
		speed.addEventListener("input", () => {
			values.speed = speed.value;
			speed.removeAttribute("aria-invalid");
		});
		const speedApply = button("적용", "mini-button");
		speedApply.setAttribute("aria-label", "선택 문단에 속도 적용");
		focusKey(speedApply, "batch:speed-apply");
		onPress(speedApply, () =>
			batchNumber(
				speed,
				"speed",
				0.5,
				2,
				"속도는 0.5~2.0 사이로 입력해 주세요.",
				(value) =>
					`선택한 문단 ${state.selected.size}개의 속도를 바꿨어요 · ${value}`,
			),
		);
		const speedReset = button("모델 설정 따름", "text-button ps-reset");
		focusKey(speedReset, "batch:speed-reset");
		onPress(speedReset, () =>
			applyToSelected(
				(segment) => {
					segment.speed = null;
				},
				{
					label: "속도 일괄 변경",
					focus: ["batch:speed-reset"],
					message: `선택한 문단 ${state.selected.size}개가 모델 설정 속도를 따릅니다.`,
				},
			),
		);

		const pause = numberInput(values.pause, 0, 5, "0.3");
		pause.addEventListener("input", () => {
			values.pause = pause.value;
			pause.removeAttribute("aria-invalid");
		});
		const pauseApply = button("적용", "mini-button");
		pauseApply.setAttribute("aria-label", "선택 문단에 간격 적용");
		focusKey(pauseApply, "batch:pauseAfter-apply");
		onPress(pauseApply, () =>
			batchNumber(
				pause,
				"pauseAfter",
				0,
				5,
				"문단 뒤 간격은 0~5초 사이로 입력해 주세요.",
				(value) =>
					`선택한 문단 ${state.selected.size}개의 문단 뒤 간격을 바꿨어요 · ${value}초`,
			),
		);
		settings.append(
			batchGroup("성우", voiceSelect, voiceApply),
			batchGroup("속도", speed, speedApply, speedReset),
			batchGroup("간격(초)", pause, pauseApply),
		);

		const actions = node("div", "ps-batch-actions");
		const split = button("분할", "button button-secondary", "split");
		focusKey(split, "batch:split");
		onPress(split, () => openSplitFor(new Set(state.selected)));
		const merge = button("합치기", "button button-secondary", "merge");
		focusKey(merge, "batch:merge");
		onPress(merge, mergeSelected);
		const remove = button(
			"선택 삭제",
			"button button-secondary ps-danger",
			"trash",
		);
		focusKey(remove, "batch:remove");
		onPress(remove, deleteSelected);
		actions.append(split, merge, remove);
		const hint = node("p", "ps-batch-hint");
		hint.id = nextId("batch-hint");
		const buttons = {
			voice: voiceApply,
			speed: speedApply,
			reset: speedReset,
			pause: pauseApply,
			split,
			merge,
			remove,
		};
		for (const element of Object.values(buttons))
			element.setAttribute("aria-describedby", hint.id);
		panel.append(sheetHead, settings, actions, hint);
		bar.append(top, panel);
		state.bar = {
			root: bar,
			panel,
			all,
			count,
			empty,
			sheetCount,
			toggle,
			undo: undoButton,
			hint,
			buttons,
			total: segments.length,
		};
		return bar;
	};

	// ---- 문단 카드 ----
	const bindNumber = (control, wrap, options) => {
		const { id, name, min, max, empty, message, after } = options;
		const error = node("span", "ps-field-error", message);
		error.id = nextId("error");
		error.hidden = true;
		wrap.append(error);
		control.addEventListener("change", () => {
			const value = parseNumber(control, min, max);
			error.hidden = value !== undefined;
			if (value === undefined) {
				control.setAttribute("aria-invalid", "true");
				control.setAttribute("aria-describedby", error.id);
				return;
			}
			control.removeAttribute("aria-invalid");
			control.removeAttribute("aria-describedby");
			const next = value ?? empty;
			control.value = next === null ? "" : String(next);
			after(next);
			saveField(id, name, next);
		});
		control.addEventListener("blur", endEdit);
	};
	const buildControls = (segment, number, current, refresh) => {
		const id = segment.id;
		const controls = node("div", "ps-controls");

		const speed = numberInput(segment.speed, 0.5, 2, "모델 설정");
		speed.setAttribute("aria-label", `${number}번 문단 속도`);
		focusKey(speed, `${id}:speed`);
		const speedField = field("속도", speed, "ps-field-speed");
		bindNumber(speed, speedField, {
			id,
			name: "speed",
			min: 0.5,
			max: 2,
			empty: null,
			message: "0.5~2.0 사이로 입력하거나 비워 두세요.",
			after: (value) => {
				current.speed = value;
				refresh();
			},
		});
		const pause = numberInput(segment.pauseAfter, 0, 5, String(DEFAULT_PAUSE));
		pause.setAttribute("aria-label", `${number}번 문단 뒤 간격(초)`);
		focusKey(pause, `${id}:pause`);
		const pauseField = field("문단 뒤 간격(초)", pause, "ps-field-pause");
		bindNumber(pause, pauseField, {
			id,
			name: "pauseAfter",
			min: 0,
			max: 5,
			empty: DEFAULT_PAUSE,
			message: "0~5초 사이로 입력해 주세요.",
			after: (value) => {
				current.pauseAfter = value;
				refresh();
			},
		});

		const emotion = selectInput(EMOTIONS, segment.emotion);
		emotion.setAttribute("aria-label", `${number}번 문단 감정`);
		focusKey(emotion, `${id}:emotion`);
		emotion.addEventListener("change", () =>
			saveField(id, "emotion", emotion.value),
		);
		emotion.addEventListener("blur", endEdit);

		const provider = voiceOf(segment.voiceId)?.provider || segment.provider;
		const noIntensity = NO_INTENSITY.has(provider);
		const intensityField = node("div", "ps-field ps-field-intensity");
		const intensityLabel = node("span", "ps-field-label", "강도");
		intensityLabel.id = nextId("intensity");
		const intensity = node("div", "ps-intensity");
		intensity.setAttribute("role", "group");
		intensity.setAttribute("aria-labelledby", intensityLabel.id);
		const levels = INTENSITIES.map((label, level) => {
			const option = node("button", "ps-segment-button", label);
			option.type = "button";
			option.setAttribute("aria-label", `${number}번 문단 강도 ${label}`);
			option.setAttribute(
				"aria-pressed",
				String(
					segment.intensity !== null && Math.round(segment.intensity) === level,
				),
			);
			option.disabled = noIntensity;
			focusKey(option, `${id}:intensity-${level}`);
			option.addEventListener("click", () => {
				const next =
					current.intensity !== null && Math.round(current.intensity) === level
						? null
						: level;
				current.intensity = next;
				levels.forEach((item, index) => {
					item.setAttribute("aria-pressed", String(index === next));
				});
				saveField(id, "intensity", next);
				state.session = "";
			});
			return option;
		});
		intensity.append(...levels);
		intensityField.append(intensityLabel, intensity);
		if (noIntensity) {
			const reason = `${provider}는 숫자 감정 강도를 받지 않아요. 감정은 태그로 표현합니다.`;
			intensity.title = reason;
			intensityField.append(
				node("span", "ps-field-note", "강도 없음 · 태그로 표현"),
			);
		} else
			intensityField.append(
				node("span", "ps-field-note", "다시 누르면 모델 기본"),
			);

		const instruction = document.createElement("input");
		instruction.type = "text";
		instruction.className = "ps-input";
		instruction.maxLength = MAX_INSTRUCTION;
		instruction.placeholder = "예: 끝을 살짝 올려서, 천천히";
		instruction.value = pendingValue(id, "instruction", segment.instruction);
		instruction.setAttribute("aria-label", `${number}번 문단 연기 지시`);
		focusKey(instruction, `${id}:instruction`);
		instruction.addEventListener("input", () =>
			scheduleField(id, "instruction", instruction.value),
		);
		bindTyping(instruction);
		const instructionField = field(
			"연기 지시",
			instruction,
			"ps-field-instruction",
		);
		// 칩은 입력 칸이나 칩에 포커스가 있을 때(CSS) 또는 `지시 예시`를 눌렀을 때만 보인다.
		const chips = node("div", "ps-chips");
		chips.id = nextId("chips");
		chips.setAttribute("role", "group");
		chips.setAttribute("aria-label", `${number}번 문단 연기 지시에 덧붙이기`);
		const examples = button("지시 예시", "text-button ps-chip-toggle");
		examples.setAttribute("aria-expanded", "false");
		examples.setAttribute("aria-controls", chips.id);
		examples.setAttribute("aria-label", `${number}번 문단 연기 지시 예시`);
		examples.addEventListener("click", () => {
			const open = instructionField.classList.toggle("show-chips");
			examples.setAttribute("aria-expanded", String(open));
		});
		instructionField.querySelector(".ps-field-label").after(examples);
		for (const label of CHIPS) {
			const chip = button(label, "ps-chip", "plus");
			chip.setAttribute("aria-label", `연기 지시에 ${label} 덧붙이기`);
			chip.title = `연기 지시 끝에 덧붙이기 · ${label}`;
			focusKey(chip, `${id}:chip-${label}`);
			// 누르는 동안 입력 칸이 포커스를 잃어 칩이 사라지지 않게 한다(Safari는 버튼에 포커스를 주지 않는다).
			chip.addEventListener("mousedown", (event) => event.preventDefault());
			chip.addEventListener("click", () => {
				flushText();
				const value = instruction.value.trim();
				if (value.split(/\s*,\s*/).includes(label))
					return notify("이미 들어 있는 연기 지시예요.");
				const next = value ? `${value}, ${label}` : label;
				if (next.length > MAX_INSTRUCTION)
					return notify("연기 지시는 300자까지 쓸 수 있어요.");
				instruction.value = next;
				saveField(id, "instruction", next);
				state.session = "";
			});
			chips.append(chip);
		}
		instructionField.append(chips);
		controls.append(
			speedField,
			pauseField,
			field("감정", emotion, "ps-field-emotion"),
			intensityField,
			instructionField,
		);
		return controls;
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
		const main = node("div", "ps-card-main");

		const head = node("div", "ps-card-head");
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
		const voice = voiceOf(segment.voiceId);
		const wrap = node("div", "ps-voice");
		const trigger = node("button", "ps-voice-button");
		trigger.type = "button";
		trigger.setAttribute("aria-haspopup", "dialog");
		trigger.setAttribute("aria-expanded", "false");
		focusKey(trigger, `${id}:voice`);
		trigger.append(
			node("span", "sr-only", `${number}번 문단 성우 `),
			icon("voice"),
			node("span", "ps-voice-name", voice?.name || "성우 미지정"),
		);
		if (voice)
			trigger.append(node("span", "ps-voice-provider", voice.provider));
		trigger.append(icon("chevron-down"));
		trigger.addEventListener("click", () => {
			if (state.menu?.trigger === trigger) closeMenu(true);
			else openMenu(wrap, trigger, id, number);
		});
		wrap.addEventListener("focusout", (event) => {
			if (
				state.menu?.wrap === wrap &&
				event.relatedTarget &&
				!wrap.contains(event.relatedTarget)
			)
				closeMenu(false);
		});
		wrap.append(trigger);
		head.append(checkLabel, badge, wrap);
		if (segment.speaker) {
			const role = button(`역할 · ${segment.speaker}`, "ps-role");
			role.title = `‘${segment.speaker}’ 역할의 성우를 한 번에 바꿉니다`;
			focusKey(role, `${id}:role`);
			role.addEventListener("click", () =>
				openRoleDialog(api(), segment.speaker),
			);
			head.append(role);
		}
		const move = node("div", "ps-move");
		const up = iconButton("up", `${number}번 문단 위로 이동`);
		up.disabled = index === 0;
		focusKey(up, `${id}:up`);
		up.addEventListener("click", () => moveSegment(id, -1));
		const down = iconButton("down", `${number}번 문단 아래로 이동`);
		down.disabled = index === total - 1;
		focusKey(down, `${id}:down`);
		down.addEventListener("click", () => moveSegment(id, 1));
		move.append(up, down);
		head.append(move);

		const body = node("div", "ps-card-body");
		const text = document.createElement("textarea");
		text.className = "ps-text";
		text.rows = 2;
		text.maxLength = MAX_TEXT;
		text.value = pendingValue(id, "text", segment.text);
		text.setAttribute("aria-label", `${number}번 문단 대사`);
		focusKey(text, `${id}:text`);
		const meta = node("div", "ps-meta");
		const estimateLine = node("p", "ps-estimate");
		const counter = node("span", "ps-count");
		counter.id = nextId("count");
		const problem = node("p", "ps-problem");
		problem.id = nextId("problem");
		text.setAttribute("aria-describedby", `${counter.id} ${problem.id}`);
		const splitHere = button("이 문단 나누기", "mini-button", "split");
		focusKey(splitHere, `${id}:split`);
		splitHere.addEventListener("click", () => openSplitFor(new Set([id])));
		const refresh = () => {
			const value = text.value;
			const over = value.length > MAX_TEXT;
			current.text = value;
			counter.textContent = `${formatCount(value.length)} / ${formatCount(MAX_TEXT)}자`;
			problem.textContent = over
				? `${formatCount(value.length)}자로 2,000자를 넘었어요. 문단을 나누거나 줄여 주세요.`
				: value.trim()
					? ""
					: "내용을 입력해 주세요. 빈 문단은 생성할 수 없어요.";
			problem.classList.toggle("is-error", over);
			problem.hidden = !problem.textContent;
			splitHere.hidden = !over;
			if (over) text.setAttribute("aria-invalid", "true");
			else text.removeAttribute("aria-invalid");
			card.classList.toggle("has-error", over);
			fillEstimate(estimateLine, current);
		};
		text.addEventListener("input", () => {
			autoGrow(text);
			refresh();
			scheduleField(id, "text", text.value);
		});
		bindTyping(text);
		meta.append(estimateLine, counter);
		body.append(text, meta, problem, splitHere);
		refresh();

		const actions = node("div", "ps-card-actions");
		const recommend = iconButton("search", `${number}번 문단 성우 추천`);
		focusKey(recommend, `${id}:recommend`);
		recommend.addEventListener("click", () => recommendFor(id));
		const preview = iconButton("play", `${number}번 문단 미리 생성 · 시연`);
		focusKey(preview, `${id}:preview`);
		setBlocked(preview, PREVIEW_REASON);
		onPress(preview, () => {});
		const remove = iconButton("trash", `${number}번 문단 삭제`);
		focusKey(remove, `${id}:delete`);
		setBlocked(remove, total <= 1 ? "마지막 남은 문단은 지울 수 없어요." : "");
		onPress(remove, () => deleteSegment(id));
		const add = iconButton("plus", `${number}번 문단 아래에 문단 추가`);
		focusKey(add, `${id}:add`);
		setBlocked(add, total >= MAX_SEGMENTS ? LIMIT_REASON : "");
		onPress(add, () => addAfter(id));
		actions.append(recommend, preview, remove, add);

		main.append(head, body, buildControls(segment, number, current, refresh));
		card.append(main, actions);
		return card;
	};
	const buildHeader = (segments) => {
		const header = node("div", "ps-header");
		const title = node(
			"h2",
			"ps-title",
			`문단 제작 계획 · ${segments.length}개`,
		);
		title.tabIndex = -1;
		header.append(title);
		const roles = roleGroups(segments);
		if (roles.length) {
			const assigned = roles.filter((role) => role.voiceId).length;
			const open = button(
				`역할별 성우 · 지정 ${assigned}/${roles.length}`,
				"button button-secondary",
				"voice",
			);
			focusKey(open, "header:roles");
			open.addEventListener("click", () => openRoleDialog(api()));
			header.append(open);
		}
		header.append(
			node(
				"p",
				"ps-note",
				"문단마다 성우·속도·간격·감정·연기 지시를 따로 정합니다. 예상 길이와 예상 사용량은 추정치이고, 문단 미리 생성은 시연이라 실행하지 않습니다.",
			),
		);
		return header;
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
				if (state.menu && !state.menu.wrap.contains(event.target))
					closeMenu(false);
			},
			true,
		);
	};
	const restoreFocus = (keys, selection) => {
		for (const key of keys) {
			if (!key || !state.container) continue;
			const target = state.container.querySelector(
				`[data-focus="${CSS.escape(key)}"]`,
			);
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
		if (active?.dataset?.focus && container.contains(active)) {
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
		closeMenu(false);
		state.rendering = true;
		try {
			const ids = new Set(segments.map((item) => item.id));
			for (const id of state.selected)
				if (!ids.has(id)) state.selected.delete(id);
			container.hidden = !segments.length;
			if (!segments.length) {
				container.replaceChildren();
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
			root.append(
				buildHeader(segments),
				buildBatch(segments),
				list,
				buildFooter(segments),
			);
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
		return failures;
	};

	window.TTSParagraphs = {
		render,
		detectSpeakers,
		splitText,
		assignRoleVoices,
		startFromText,
		openRoleDialog,
		setPlaying,
		_selfTest: selfTest,
	};
})();
