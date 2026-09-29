(() => {
	const storageKey = "tts-pilot.prototype.scripts";
	const _sampleScript =
		"2026년 9월 26일, 하루 3분으로 시작하는 경제 이야기입니다. 커피 한 잔은 4,500원. 지난달보다 12.5% 올랐습니다. 오늘은 3가지 변화를 살펴볼게요.";
	const voiceData = [
		{
			id: "minseo",
			name: "민서",
			initial: "민",
			provider: "Typecast",
			tone: "차분한 정보성",
			tags: ["경제 한 입", "내레이션"],
			favorite: true,
			sample: true,
			language: "한국어",
			gender: "여성",
			age: "청년",
			uses: ["뉴스", "강의", "안내"],
		},
		{
			id: "juno",
			name: "주노",
			initial: "주",
			provider: "Typecast",
			tone: "따뜻한 설명형",
			tags: ["교육", "차분한"],
			favorite: false,
			sample: true,
			language: "한국어",
			gender: "남성",
			age: "청년",
			uses: ["강의", "낭독", "안내"],
		},
		{
			id: "soyeon",
			name: "소연",
			initial: "소",
			provider: "ElevenLabs",
			tone: "또렷한 뉴스형",
			tags: ["브리핑", "선명한"],
			favorite: true,
			sample: true,
			language: "한국어",
			gender: "여성",
			age: "중년",
			uses: ["뉴스", "라디오"],
		},
		{
			id: "haneul",
			name: "하늘",
			initial: "하",
			provider: "ElevenLabs",
			tone: "밝은 일상형",
			tags: ["쇼츠", "친근한"],
			favorite: false,
			sample: false,
			language: "영어",
			gender: "여성",
			age: "청소년",
			uses: ["광고", "예능", "게임"],
		},
		{
			id: "taeho",
			name: "태호",
			initial: "태",
			provider: "Typecast",
			tone: "낮고 안정적인 톤",
			tags: ["다큐", "중저음"],
			favorite: false,
			sample: true,
			language: "한국어",
			gender: "남성",
			age: "장년",
			uses: ["다큐", "낭독"],
		},
		{
			id: "yuna",
			name: "유나",
			initial: "유",
			provider: "Fish Audio",
			tone: "부드러운 다감정 내레이션",
			tags: ["내레이션", "다감정"],
			favorite: false,
			sample: true,
			language: "한국어",
			gender: "여성",
			age: "청년",
			uses: ["낭독", "라디오", "다큐"],
		},
		{
			id: "dojin",
			name: "도진",
			initial: "도",
			provider: "Fish Audio",
			tone: "또렷한 정보 전달",
			tags: ["경제 한 입", "브리핑"],
			favorite: false,
			sample: false,
			language: "한국어",
			gender: "남성",
			age: "중년",
			uses: ["뉴스", "강의", "광고"],
		},
	];
	const corrections = [
		{
			source: "2026년",
			proposal: "이천이십육년",
			defaultProposal: "이천이십육년",
			rule: "연도",
			decision: "pending",
		},
		{
			source: "9월 26일",
			proposal: "구월 이십육일",
			defaultProposal: "구월 이십육일",
			rule: "날짜",
			decision: "pending",
		},
		{
			source: "4,500원",
			proposal: "사천오백원",
			defaultProposal: "사천오백원",
			rule: "금액",
			decision: "pending",
		},
		{
			source: "12.5%",
			proposal: "십이 점 오 퍼센트",
			defaultProposal: "십이 점 오 퍼센트",
			rule: "소수 · 퍼센트",
			decision: "pending",
		},
		{
			source: "3분",
			proposal: "삼 분",
			defaultProposal: "삼 분",
			rule: "시간",
			decision: "pending",
		},
		{
			source: "3가지",
			proposal: "세 가지",
			defaultProposal: "세 가지",
			rule: "수량",
			decision: "pending",
		},
	];
	const presetData = [
		{
			name: "경제 한 입 · 민서",
			detail: "Typecast ssfm-v30 · 자동 감정 · MP3",
			voice: "minseo",
			modelId: "typecast-ssfm-v30",
			settings: {},
			channel: "경제 한 입",
		},
		{
			name: "주말 레터 · 소연",
			detail: "Eleven Multilingual v2 · 기본 음성 설정 · MP3",
			voice: "soyeon",
			modelId: "eleven_multilingual_v2",
			settings: {},
			channel: "주말 레터",
		},
		{
			name: "경제 한 입 · 유나",
			detail: "Fish Audio s2.1-pro · 표현력 0.7 · MP3",
			voice: "yuna",
			modelId: "fish-s2.1-pro",
			settings: {},
			channel: "경제 한 입",
		},
	];
	const state = {
		activeView: "studio",
		provider: "all",
		selectedVoice: "minseo",
		playingVoice: null,
		reviewDirty: false,
		scripts: [],
		saveFail: false,
		currentScriptName: "오늘의 경제 브리핑",
		voiceView: "all",
		studioFilters: { channels: [], categories: [], types: [] },
		libraryFilters: {
			provider: "",
			view: "all",
			query: "",
			preset: "",
			channels: [],
			categories: [],
			types: [],
		},
		voiceNotes: {},
		clones: [],
		isGenerating: false,
		generationSnapshot: null,
		scriptSegments: null,
		segmentSource: "",
		segmentUndo: null,
		usageLog: [],
		voiceSort: "default",
		voiceFacets: { language: [], gender: [], age: [], uses: [] },
		speakerDetect: true,
		player: { timer: 0, elapsed: 0, index: -1 },
	};
	const recentVoicesKey = "tts-pilot.prototype.recent-voices.v1";
	const speakerDetectKey = "tts-pilot.prototype.speaker-detect.v1";
	const facetGroups = [
		["language", "언어", null],
		["gender", "성별", ["여성", "남성"]],
		["age", "연령", ["아동", "청소년", "청년", "중년", "장년"]],
		[
			"uses",
			"용도",
			[
				"다큐",
				"낭독",
				"강의",
				"안내",
				"광고",
				"게임",
				"라디오",
				"예능",
				"뉴스",
			],
		],
	];

	const $ = (selector, parent = document) => parent.querySelector(selector);
	const $$ = (selector, parent = document) => [
		...parent.querySelectorAll(selector),
	];
	const el = (tag, className, text) => {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	};
	const icon = (id) => {
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("aria-hidden", "true");
		const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
		use.setAttribute("href", `#i-${id}`);
		svg.append(use);
		return svg;
	};
	const button = (label, className, iconName) => {
		const node = el("button", className, label);
		node.type = "button";
		if (iconName) node.prepend(icon(iconName));
		return node;
	};
	const announce = (message) => {
		$("#live-region").textContent = message;
	};
	const toast = (message, { actionLabel, onAction, timeout } = {}) => {
		$(".toast")?.remove();
		const node = el("div", "toast");
		node.setAttribute("role", "status");
		node.append(el("span", "", message));
		let timer = 0;
		const dismiss = () => {
			window.clearTimeout(timer);
			node.remove();
		};
		const arm = () => {
			window.clearTimeout(timer);
			timer = window.setTimeout(
				dismiss,
				timeout ?? (actionLabel ? 8000 : 3400),
			);
		};
		if (actionLabel && onAction) {
			const action = button(actionLabel, "toast-action");
			action.addEventListener("click", () => {
				dismiss();
				onAction();
			});
			node.append(action);
			node.addEventListener("focusin", () => window.clearTimeout(timer));
			node.addEventListener("focusout", arm);
		}
		document.body.append(node);
		arm();
	};
	let pendingChoice = null;
	const choose = ({ title, message = "", actions = [] }) =>
		new Promise((resolve) => {
			const dialog = $("#choice-dialog");
			pendingChoice?.resolve("cancel");
			pendingChoice = {
				resolve,
				opener: pendingChoice?.opener || document.activeElement,
			};
			$("#choice-title").textContent = title;
			$("#choice-message").textContent = message;
			$("#choice-actions").replaceChildren(
				...actions.map((action) => {
					const node = button(
						action.label,
						`button ${action.variant === "primary" ? "button-primary" : action.variant === "danger" ? "button-danger" : "button-secondary"}`,
					);
					node.type = "submit";
					node.value = action.value;
					return node;
				}),
			);
			dialog.returnValue = "";
			if (!dialog.open) dialog.showModal();
		});
	const readStored = (key, fallback) => {
		try {
			const raw = localStorage.getItem(key);
			return raw === null ? fallback : JSON.parse(raw);
		} catch {
			return fallback;
		}
	};
	const writeStored = (key, value) => {
		try {
			localStorage.setItem(key, JSON.stringify(value));
			return true;
		} catch {
			return false;
		}
	};
	const getRecentVoices = () => {
		const saved = readStored(recentVoicesKey, []);
		return Array.isArray(saved)
			? saved.filter((id) => typeof id === "string").slice(0, 8)
			: [];
	};
	const noteVoiceUse = (voiceId) => {
		writeStored(
			recentVoicesKey,
			[voiceId, ...getRecentVoices().filter((id) => id !== voiceId)].slice(
				0,
				8,
			),
		);
	};
	const writeStoredScripts = (scripts = state.scripts) => {
		try {
			localStorage.setItem(storageKey, JSON.stringify(scripts));
			return true;
		} catch {
			return false;
		}
	};
	const loadStoredScripts = () => {
		try {
			const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
			state.scripts = Array.isArray(saved)
				? saved.filter(
						(item) =>
							typeof item?.name === "string" && typeof item?.text === "string",
					)
				: [];
		} catch {
			state.scripts = [];
		}
	};
	const activeVoice = () =>
		voiceData.find((voice) => voice.id === state.selectedVoice) || voiceData[0];
	const originalText = () => $("#script-editor").value;
	const finalText = () => {
		let text = originalText();
		corrections.forEach((item) => {
			if (item.decision === "applied" || item.decision === "manual")
				text = text.replace(item.source, item.proposal);
		});
		const modelId = $("#model-select").value;
		const settings = window.TTSGenerationSettings?.getSettings();
		const tags =
			modelId === "eleven_v3"
				? settings?.audioTags?.trim()
				: modelId.startsWith("fish-")
					? settings?.emotionTags?.trim()
					: "";
		return tags ? `${tags} ${text}` : text;
	};
	const updateScriptLength = () => {
		const length = originalText().length;
		const count = $("#script-length");
		const modelId = $("#model-select").value;
		const generatedText = finalText();
		updateWorkbar();
		if (state.scriptSegments?.length) {
			count.textContent = `문단 ${state.scriptSegments.length}개 · 원문 ${fmt(length)}자 · 문단당 최대 2,000자`;
			count.classList.remove("is-over");
			return;
		}
		if (modelId.startsWith("fish-")) {
			const bytes = new TextEncoder().encode(generatedText).length;
			const cost =
				modelId === "fish-s2.1-pro-free"
					? "무료"
					: `약 $${((bytes / 1_000_000) * 15).toFixed(4)}`;
			count.textContent = `원문 ${length.toLocaleString("ko-KR")}자 · 생성문 ${bytes.toLocaleString("ko-KR")}바이트(UTF-8) · 예상 ${cost} (문서 기준 $15/백만 바이트, 실제 청구는 연결 후 확인)`;
			count.classList.remove("is-over");
			return;
		}
		const generatedLength = generatedText.length;
		count.textContent = `원문 ${length.toLocaleString("ko-KR")}자 · 생성문 ${generatedLength.toLocaleString("ko-KR")} / 2,000자`;
		count.classList.toggle("is-over", generatedLength > 2000);
	};
	const fmt = (value) => value.toLocaleString("ko-KR");
	const round1 = (value) => Math.round(value * 10) / 10;
	const getVoice = (voiceId) => voiceData.find((voice) => voice.id === voiceId);
	const usageText = (units, unitLabel) =>
		unitLabel === "바이트"
			? `${fmt(units)}바이트 · 약 $${((units / 1_000_000) * 15).toFixed(4)}`
			: `${fmt(units)}자`;
	const estimate = (text = "", { voiceId, speed, pauseAfter } = {}) => {
		const voice = getVoice(voiceId) || activeVoice();
		const fish = voice.provider === "Fish Audio";
		const units = fish ? new TextEncoder().encode(text).length : text.length;
		const unitLabel = fish ? "바이트" : "자";
		return {
			seconds: round1(text.length / (6.6 * (speed || 1)) + (pauseAfter ?? 0)),
			units,
			unitLabel,
			usageLabel: usageText(units, unitLabel),
			basis: `한국어 초당 약 6.6자 기준 추정 · ${fish ? "Fish 문서 $15/백만 바이트, 실제 청구는 연결 후 확인" : `${voice.provider} 전송 글자 수 기준, 실제 청구는 연결 후 확인`}`,
		};
	};
	const formatDuration = (seconds) =>
		seconds < 60
			? `${seconds}초`
			: `${Math.floor(seconds / 60)}분 ${Math.round(seconds % 60)}초`;
	const clock = (seconds) =>
		`${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
	const workItems = () =>
		state.scriptSegments?.length
			? state.scriptSegments
			: [{ id: null, text: originalText(), voiceId: activeVoice().id }];
	const summarize = (items = workItems()) => {
		const rows = new Map();
		let seconds = 0;
		let chars = 0;
		items.forEach((item) => {
			const result = estimate(item.text, item);
			const provider = (getVoice(item.voiceId) || activeVoice()).provider;
			const row = rows.get(provider) || {
				provider,
				count: 0,
				units: 0,
				unitLabel: result.unitLabel,
				basis: result.basis,
			};
			row.count += 1;
			row.units += result.units;
			rows.set(provider, row);
			seconds += result.seconds;
			chars += item.text.length;
		});
		const providerRows = [...rows.values()];
		return {
			count: items.length,
			chars,
			seconds: round1(seconds),
			voices: new Set(items.map((item) => item.voiceId)).size,
			rows: providerRows,
			usage:
				["자", "바이트"]
					.map((unit) => [
						unit,
						providerRows
							.filter((row) => row.unitLabel === unit)
							.reduce((sum, row) => sum + row.units, 0),
					])
					.filter(([, units]) => units)
					.map(([unit, units]) => `${fmt(units)}${unit}`)
					.join(" + ") || "0자",
		};
	};
	const timeline = () => {
		const snapshot = state.generationSnapshot;
		const parts = snapshot?.segments?.length
			? snapshot.segments
			: [
					{
						id: null,
						text: snapshot?.sourceText || "",
						voiceId: snapshot?.voiceId,
					},
				];
		let start = 0;
		return parts.map((part) => {
			const length = Math.max(estimate(part.text, part).seconds, 0.5);
			const item = { id: part.id ?? null, start, end: start + length };
			start += length;
			return item;
		});
	};
	const renderPlayer = () => {
		const ready = state.generationMode === "success";
		const { player } = state;
		const parts = ready ? timeline() : [];
		const total = ready ? (parts.at(-1)?.end ?? 0) : summarize().seconds;
		$("#player-time").textContent =
			`${clock(player.elapsed)} / ${clock(total)}`;
		const toggle = $("#player-toggle");
		toggle.setAttribute(
			"aria-label",
			player.timer ? "일시정지" : "전체 재생 · 소리 없는 시연",
		);
		$("use", toggle).setAttribute(
			"href",
			player.timer ? "#i-pause" : "#i-play",
		);
		for (const id of ["#player-prev", "#player-toggle", "#player-next"]) {
			$(id).disabled = !ready;
			$(id).title = ready ? "" : "음성을 만든 뒤 재생할 수 있어요";
		}
		$("#player-note").textContent = ready
			? "소리 없는 시연 재생"
			: "음성을 만든 뒤 재생할 수 있어요";
	};
	const seekPlayer = (seconds) => {
		const { player } = state;
		const parts = timeline();
		player.elapsed = Math.max(0, seconds);
		const index = parts.findIndex((part) => player.elapsed < part.end);
		if (index !== player.index) {
			player.index = index;
			window.TTSParagraphs?.setPlaying?.(parts[index]?.id ?? null);
		}
		renderPlayer();
	};
	const stopPlayer = () => {
		const { player } = state;
		if (!player.timer && player.index === -1 && !player.elapsed) return;
		window.clearInterval(player.timer);
		Object.assign(player, { timer: 0, elapsed: 0, index: -1 });
		window.TTSParagraphs?.setPlaying?.(null);
		if ($("#player-time")) renderPlayer();
	};
	const togglePlayer = () => {
		const { player } = state;
		if (player.timer) {
			window.clearInterval(player.timer);
			player.timer = 0;
			announce("시연 재생을 멈췄어요.");
			renderPlayer();
			return;
		}
		const total = timeline().at(-1)?.end ?? 0;
		if (player.elapsed >= total) player.elapsed = 0;
		// ponytail: 고정 250ms 단계로 시간을 센다. 실제 오디오가 붙으면 audio.currentTime으로 바꾼다.
		player.timer = window.setInterval(() => {
			if (player.elapsed + 0.25 >= total) {
				stopPlayer();
				announce("소리 없는 시연 재생을 마쳤어요.");
				return;
			}
			seekPlayer(player.elapsed + 0.25);
		}, 250);
		announce("소리 없는 시연 재생을 시작했어요. 실제 소리는 나지 않아요.");
		seekPlayer(player.elapsed);
	};
	const stepPlayer = (direction) => {
		const parts = timeline();
		const { player } = state;
		const current = Math.max(player.index, 0);
		const target =
			direction < 0 && player.elapsed - (parts[current]?.start ?? 0) > 1.5
				? current
				: Math.min(Math.max(current + direction, 0), parts.length - 1);
		seekPlayer(parts[target]?.start ?? 0);
		announce(`문단 ${target + 1}/${parts.length} 위치로 옮겼어요.`);
	};
	const renderSummaryPanel = () => {
		const panel = $("#workbar-summary-panel");
		const summary = summarize();
		const paragraphs = Boolean(state.scriptSegments?.length);
		const ready = state.generationMode === "success";
		const heading = el("h2", "", "예상 요약 ");
		heading.append(el("span", "estimate-tag", "추정"));
		const facts = el("dl", "summary-facts");
		[
			["문단", paragraphs ? `${summary.count}개` : "한 덩어리 대본"],
			["글자", `${fmt(summary.chars)}자`],
			[
				"예상 길이",
				`약 ${formatDuration(summary.seconds)}${paragraphs ? " · 문단 뒤 간격 포함" : ""}`,
			],
			["성우", `${summary.voices}명`],
		].forEach(([term, value]) => {
			const row = el("div");
			row.append(el("dt", "", term), el("dd", "", value));
			facts.append(row);
		});
		const list = el("ul", "summary-providers");
		summary.rows.forEach((row) => {
			const item = el("li");
			item.append(
				el("strong", "", row.provider),
				el(
					"span",
					"",
					`${paragraphs ? `문단 ${row.count}개 · ` : ""}${usageText(row.units, row.unitLabel)}`,
				),
			);
			list.append(item);
		});
		panel.replaceChildren(
			heading,
			facts,
			el("h3", "", "공급자별 예상 사용량"),
			list,
			...[
				...new Set(summary.rows.flatMap((row) => row.basis.split(" · "))),
			].map((basis) => el("p", "summary-basis", basis)),
			el(
				"p",
				"summary-basis",
				"문단별 추정의 합계라 실제 요청 단위와 다를 수 있어요. 실제 청구는 연결 후 공급자 내역에서 확인합니다.",
			),
		);
		if (!ready)
			panel.append(
				el(
					"p",
					"summary-basis",
					"전체 재생과 내려받기는 음성을 만든 뒤 열려요.",
				),
			);
	};
	const renderDownloadMenu = () => {
		const menu = $("#workbar-download-menu");
		const ready = state.generationMode === "success";
		const laterReason = "P2 범위: 자막·ZIP 내보내기는 후속 구현";
		const later = el("p", "summary-basis", laterReason);
		later.id = "download-later-reason";
		const list = el("div", "download-options");
		[
			["MP3 전체", ""],
			["WAV 전체", ""],
			["SRT 자막", "P2"],
			["문단별 ZIP", "P2"],
		].forEach(([label, scope]) => {
			const option = button(label, "download-option", "download");
			// P2 항목은 일괄 막대처럼 aria-disabled와 보이는 사유를 둔다. 성공 뒤에도 막는다.
			if (scope) {
				option.append(el("span", "scope-tag", scope));
				option.setAttribute("aria-disabled", "true");
				option.setAttribute("aria-describedby", later.id);
				option.title = laterReason;
			} else option.disabled = !ready;
			option.addEventListener("click", () => {
				if (scope) return announce(laterReason);
				menu.hidePopover();
				toast("시연: 실제 파일은 만들지 않습니다");
			});
			list.append(option);
		});
		menu.replaceChildren(
			el("h2", "", "내려받기 형식"),
			el(
				"p",
				"summary-basis",
				ready
					? "시연이라 실제 파일은 만들지 않아요."
					: "음성을 만든 뒤 내려받을 수 있어요.",
			),
			list,
			later,
		);
	};
	const updateWorkbar = () => {
		const bar = $("#workbar");
		if (!bar) return;
		const summary = summarize();
		const ready = state.generationMode === "success";
		$("#workbar-summary-text").textContent =
			`${state.scriptSegments?.length ? `문단 ${summary.count}` : "한 덩어리"} · ${fmt(summary.chars)}자 · 약 ${formatDuration(summary.seconds)} · 예상 ${summary.usage}`;
		$("#make-audio-usage").textContent = summary.usage;
		bar.classList.toggle("has-result", ready);
		if (!ready) stopPlayer();
		renderPlayer();
		if ($("#workbar-summary-panel").matches(":popover-open"))
			renderSummaryPanel();
		if ($("#workbar-download-menu").matches(":popover-open"))
			renderDownloadMenu();
	};
	const setSaveStatus = (kind, message) => {
		const target = $("#save-status");
		target.replaceChildren();
		const dot = el(
			"span",
			`dot ${{ error: "dot-danger", saving: "dot-warning", unsaved: "dot-unsaved", idle: "dot-muted" }[kind] || "dot-success"}`,
		);
		dot.setAttribute("aria-hidden", "true");
		target.append(dot, document.createTextNode(message));
	};
	const updateVoiceSelection = () => {
		const voice = activeVoice();
		if (document.body.classList.contains("show-mobile-voices")) {
			document.body.classList.remove("show-mobile-voices");
			$("#mobile-voice-toggle").setAttribute("aria-expanded", "false");
			$("#mobile-voice-toggle").focus();
		}
		$("#selected-initial").textContent = voice.initial;
		$("#selected-voice-name").textContent = voice.name;
		$("#selected-voice-meta").textContent = `${voice.provider} · ${voice.tone}`;
		refreshModelOptions(voice.provider);
		renderVoiceList();
		renderFinalScript();
		noteWorkChange();
	};
	const modelOptionsFor = (provider) => {
		if (provider === "ElevenLabs")
			return [
				{ value: "eleven_v3", label: "Eleven v3" },
				{ value: "eleven_multilingual_v2", label: "Eleven Multilingual v2" },
				{ value: "eleven_flash_v2_5", label: "Eleven Flash v2.5" },
				{ value: "eleven_turbo_v2_5", label: "Eleven Turbo v2.5" },
			];
		if (provider === "Fish Audio")
			return [
				{ value: "fish-s2.1-pro", label: "Fish Audio s2.1-pro" },
				{
					value: "fish-s2.1-pro-free",
					label: "Fish Audio s2.1-pro-free (무료·개발용)",
				},
				{ value: "fish-s2-pro", label: "Fish Audio s2-pro" },
				{ value: "fish-s1", label: "Fish Audio s1 (구형)" },
			];
		return [
			{ value: "typecast-ssfm-v30", label: "Typecast ssfm-v30" },
			{ value: "typecast-ssfm-v21", label: "Typecast ssfm-v21" },
		];
	};
	const refreshModelOptions = (provider, requested) => {
		const select = $("#model-select");
		const options = modelOptionsFor(provider);
		const retained = requested ?? select.value;
		const next = options.some((option) => option.value === retained)
			? retained
			: options[0].value;
		select.replaceChildren();
		options.forEach((option) => {
			const node = el("option", "", option.label);
			node.value = option.value;
			select.append(node);
		});
		select.value = next;
		renderModelSettings();
	};
	const pendingCorrections = () =>
		corrections.filter(
			(item) =>
				originalText().includes(item.source) && item.decision === "pending",
		);
	const renderModelSettings = () => {
		window.TTSGenerationSettings?.setModel($("#model-select").value);
	};
	const classification = () => window.TTSVoiceClassification;
	const groups = [
		["channels", "채널"],
		["categories", "카테고리"],
		["types", "타입"],
	];
	const voiceKey = (voice) => `${voice.provider}:${voice.id}`;
	const voiceFlags = (voice) => classification().getFlags(voice);
	const viewMatches = (voice, view) =>
		view === "all" ||
		(view === "favorites"
			? voiceFlags(voice).favorite
			: voiceFlags(voice).frequent);
	const searchVoice = (voice, query) =>
		[
			voice.id,
			voice.name,
			voice.provider,
			voice.tone,
			...groups.flatMap(([group]) => classification().getLabels(voice, group)),
		]
			.join(" ")
			.toLocaleLowerCase("ko")
			.includes(query.toLocaleLowerCase("ko").trim());
	const makeClassificationFilters = (container, filters, onChange) => {
		groups.forEach(([group, label]) => {
			const details = el("details", "voice-filter-group");
			const summary = el(
				"summary",
				"",
				`${label}${filters[group].length ? ` · ${filters[group].length}` : " 전체"}`,
			);
			details.append(summary);
			const fieldset = el("fieldset");
			fieldset.append(el("legend", "sr-only", label));
			const items = classification().getItems(group);
			if (!items.length)
				fieldset.append(el("p", "meta-text", "등록된 항목이 없습니다."));
			items.forEach((item) => {
				const row = el("label", "voice-filter-choice");
				const input = el("input");
				input.type = "checkbox";
				input.value = item.id;
				input.checked = filters[group].includes(item.id);
				input.addEventListener("change", () => {
					filters[group] = input.checked
						? [...filters[group], item.id]
						: filters[group].filter((id) => id !== item.id);
					summary.textContent = `${label}${filters[group].length ? ` · ${filters[group].length}` : " 전체"}`;
					onChange();
				});
				row.append(input, document.createTextNode(item.name));
				fieldset.append(row);
			});
			details.append(fieldset);
			container.append(details);
		});
	};
	const renderStudioClassificationFilters = () => {
		const target = $("#studio-classification-filters");
		target.replaceChildren();
		makeClassificationFilters(target, state.studioFilters, renderVoiceList);
	};
	const facetValues = (voice, key) =>
		key === "uses" ? voice.uses || [] : voice[key] ? [voice[key]] : [];
	const facetMatches = (voice) =>
		facetGroups.every(
			([key]) =>
				!state.voiceFacets[key].length ||
				facetValues(voice, key).some((value) =>
					state.voiceFacets[key].includes(value),
				),
		);
	const facetCount = () =>
		facetGroups.reduce((sum, [key]) => sum + state.voiceFacets[key].length, 0);
	const renderVoiceFacets = () => {
		const host = $("#voice-facet-groups");
		if (!host) return;
		host.replaceChildren();
		facetGroups.forEach(([key, label, order]) => {
			const present = new Set(voiceData.flatMap((v) => facetValues(v, key)));
			const values = order
				? order.filter((value) => present.has(value))
				: [...present];
			const group = el("fieldset", "voice-facet-group");
			const selected = state.voiceFacets[key].length;
			group.append(
				el("legend", "", `${label}${selected ? ` · ${selected}개 선택` : ""}`),
			);
			const chips = el("div", "voice-facet-chips");
			values.forEach((value) => {
				const pressed = state.voiceFacets[key].includes(value);
				const chip = button(value, "filter-chip");
				chip.setAttribute("aria-pressed", String(pressed));
				chip.addEventListener("click", () => {
					state.voiceFacets[key] = pressed
						? state.voiceFacets[key].filter((item) => item !== value)
						: [...state.voiceFacets[key], value];
					renderVoiceFacets();
					renderVoiceList();
					$(`[data-facet="${key}:${value}"]`)?.focus();
				});
				chip.dataset.facet = `${key}:${value}`;
				chips.append(chip);
			});
			group.append(chips);
			host.append(group);
		});
		const count = facetCount();
		$("#voice-facet-count").textContent = count ? `· ${count}개 선택` : "";
	};
	const getFilteredVoices = () => {
		const voices = voiceData.filter(
			(voice) =>
				(state.provider === "all" || voice.provider === state.provider) &&
				viewMatches(voice, state.voiceView) &&
				searchVoice(voice, $("#voice-search").value) &&
				classification().matches(voice, state.studioFilters) &&
				facetMatches(voice),
		);
		if (state.voiceSort === "recent") {
			const recent = getRecentVoices();
			const rank = (voice) =>
				recent.includes(voice.id) ? recent.indexOf(voice.id) : recent.length;
			return voices.sort((a, b) => rank(a) - rank(b));
		}
		if (state.voiceSort === "favorites")
			return voices.sort(
				(a, b) =>
					Number(voiceFlags(b).favorite) - Number(voiceFlags(a).favorite),
			);
		return voices;
	};
	const renderVoiceList = () => {
		const list = $("#voice-list");
		const voices = getFilteredVoices();
		list.replaceChildren();
		$("#reset-voice-filters").hidden =
			state.provider === "all" &&
			state.voiceView === "all" &&
			state.voiceSort === "default" &&
			!facetCount() &&
			!$("#voice-search").value &&
			groups.every(([g]) => !state.studioFilters[g].length);
		const resultCount = $("#voice-result-count");
		if (resultCount)
			resultCount.textContent = `결과 ${voices.length}명${state.voiceSort === "recent" && !getRecentVoices().length ? " · 음성 생성에 성공한 성우가 여기에 표시돼요" : ""}`;
		if (!voices.length) {
			const empty = el("div", "empty-list");
			empty.append(el("p", "", "검색어 또는 필터에 맞는 성우가 없어요."));
			const reset = button("필터 초기화", "text-button");
			reset.addEventListener("click", resetVoiceFilters);
			empty.append(reset);
			list.append(empty);
			return;
		}
		voices.forEach((voice) => {
			const flags = voiceFlags(voice);
			const row = el(
				"div",
				`voice-row${voice.id === state.selectedVoice ? " is-selected" : ""}`,
			);
			const play = button(
				"",
				"voice-play",
				state.playingVoice === voice.id ? "pause" : "play",
			);
			play.setAttribute(
				"aria-label",
				voice.sample
					? `${voice.name} 샘플 시연 ${state.playingVoice === voice.id ? "정지" : "안내"}`
					: `${voice.name} 샘플 없음`,
			);
			play.disabled = !voice.sample;
			play.addEventListener("click", () => {
				if (state.playingVoice === voice.id) {
					state.playingVoice = null;
					announce("샘플 시연 안내를 닫았습니다.");
				} else {
					state.playingVoice = voice.id;
					announce(`${voice.name}의 실제 음성은 재생하지 않는 시연입니다.`);
					toast("실제 제공사 샘플은 재생하지 않는 시연입니다.");
				}
				renderVoiceList();
			});
			const main = button("", "voice-main");
			const line = el("div", "voice-name-line");
			line.append(el("span", "voice-name", voice.name));
			main.append(
				line,
				el("div", "voice-provider", voice.provider),
				el(
					"div",
					"voice-detail",
					voice.sample ? voice.tone : "기본 샘플이 없어요",
				),
			);
			main.addEventListener("click", () => {
				state.selectedVoice = voice.id;
				updateVoiceSelection();
				toast(`${voice.name} 성우를 선택했습니다.`);
			});
			const favorite = button(
				"",
				`favorite-button${flags.favorite ? " is-favorite" : ""}`,
				"star",
			);
			favorite.setAttribute(
				"aria-label",
				`${voice.name} ${flags.favorite ? "즐겨찾기 해제" : "즐겨찾기"}`,
			);
			favorite.setAttribute("aria-pressed", String(flags.favorite));
			favorite.addEventListener("click", () => {
				if (!classification().setFlags(voice, { favorite: !flags.favorite }))
					toast("저장하지 못했습니다. 다시 시도해 주세요.");
			});
			row.append(play, main, favorite);
			list.append(row);
		});
	};
	const resetVoiceFilters = () => {
		state.provider = "all";
		state.voiceView = "all";
		state.voiceSort = "default";
		$("#studio-voice-view").value = "all";
		$("#voice-sort").value = "default";
		groups.forEach(([g]) => {
			state.studioFilters[g] = [];
		});
		facetGroups.forEach(([key]) => {
			state.voiceFacets[key] = [];
		});
		renderVoiceFacets();
		renderStudioClassificationFilters();
		$("#voice-search").value = "";
		$$(".filter-chip").forEach((chip) => {
			const selected = chip.dataset.provider === "all";
			chip.classList.toggle("is-selected", selected);
			chip.setAttribute("aria-pressed", String(selected));
		});
		renderVoiceList();
	};
	const renderReview = () => {
		const list = $("#review-list");
		list.replaceChildren();
		const candidates = corrections.filter((item) =>
			originalText().includes(item.source),
		);
		candidates.forEach((item, _index) => {
			const row = el("article", "review-item");
			const content = el("div");
			content.append(
				el(
					"p",
					"review-rule",
					`${item.rule}${item.decision === "pending" ? " · 검수 대기" : ""}`,
				),
			);
			const pair = el("div", "change-pair");
			pair.append(
				el("span", "source-token", item.source),
				el("span", "arrow", "→"),
			);
			if (item.decision === "manual") {
				const input = el("input", "manual-input");
				input.value = item.proposal;
				input.setAttribute("aria-label", `${item.source} 직접 수정 발음`);
				input.addEventListener("input", () => {
					item.proposal = input.value;
					renderFinalScript();
				});
				pair.append(input);
			} else pair.append(el("span", "proposal-token", item.proposal));
			content.append(pair);
			const actions = el("div", "review-actions");
			const apply = button(
				"적용",
				`mini-button${item.decision === "applied" ? " is-applied" : ""}`,
			);
			apply.setAttribute("aria-pressed", String(item.decision === "applied"));
			apply.addEventListener("click", () => {
				item.decision = "applied";
				renderReview();
			});
			const keep = button(
				"유지",
				`mini-button${item.decision === "keep" ? " is-applied" : ""}`,
			);
			keep.setAttribute("aria-pressed", String(item.decision === "keep"));
			keep.addEventListener("click", () => {
				item.decision = "keep";
				renderReview();
			});
			const manual = button(
				"직접 수정",
				`mini-button${item.decision === "manual" ? " is-applied" : ""}`,
			);
			manual.setAttribute("aria-pressed", String(item.decision === "manual"));
			manual.addEventListener("click", () => {
				item.decision = "manual";
				renderReview();
			});
			actions.append(apply, keep, manual);
			row.append(content, actions);
			list.append(row);
		});
		$("#review-count").textContent = String(
			candidates.filter((item) => item.decision === "pending").length,
		);
		const bulkActions = $("#review-bulk-actions");
		if (bulkActions) {
			bulkActions.replaceChildren();
			if (candidates.length) {
				const applyAll = button("모두 적용", "mini-button");
				applyAll.addEventListener("click", () => {
					candidates.forEach((item) => {
						item.decision = "applied";
					});
					renderReview();
				});
				const keepAll = button("원문 유지", "mini-button");
				keepAll.addEventListener("click", () => {
					candidates.forEach((item) => {
						item.decision = "keep";
					});
					renderReview();
				});
				bulkActions.append(applyAll, keepAll);
			}
		}
		renderFinalScript();
	};
	const renderFinalScript = () => {
		$("#final-script-text").textContent = finalText();
		updateScriptLength();
		refreshResult();
	};
	const selectTab = (name) => {
		const source = name === "source";
		$("#source-tab").classList.toggle("is-active", source);
		$("#source-tab").setAttribute("aria-selected", String(source));
		$("#pronunciation-tab").classList.toggle("is-active", !source);
		$("#pronunciation-tab").setAttribute("aria-selected", String(!source));
		$("#source-panel").hidden = !source;
		$("#pronunciation-panel").hidden = source;
		if (!source) renderReview();
	};
	const refreshResult = () => {
		if (
			state.generationSnapshot &&
			state.generationMode &&
			state.generationMode !== "working"
		)
			showGeneration(state.generationMode);
	};
	const showGeneration = (mode) => {
		state.generationMode = mode;
		const panel = $("#generation-result");
		panel.className = "generation-result";
		panel.replaceChildren();
		const symbol = el("div", "result-icon");
		symbol.append(
			icon(mode === "error" ? "close" : mode === "success" ? "wave" : "wand"),
		);
		const copy = el("div", "result-copy");
		if (mode === "idle") {
			copy.append(
				el("h2", "", "생성 시연을 취소했어요"),
				el("p", "", "대본을 유지했습니다. 다시 시연할 수 있어요."),
			);
		}
		if (mode === "working") {
			copy.append(
				el("h2", "", "생성 요청을 시연하고 있어요"),
				el(
					"p",
					"",
					"진행률이나 실제 사용량은 표시하지 않습니다. 실제 API는 연결되지 않았습니다.",
				),
			);
		}
		if (mode === "success") {
			const snapshot = state.generationSnapshot;
			copy.append(
				el("h2", "", "임시 생성 결과 · 시연"),
				el(
					"p",
					"",
					`${snapshot?.segments?.length ? `문단 ${snapshot.segments.length}개 계획 시연 · ` : ""}${snapshot?.voiceName || activeVoice().name} · ${snapshot?.modelLabel || "선택한 모델"} · 실제 오디오 파일은 없는 결과 화면 시연입니다.${snapshot && (snapshot.sourceText !== originalText() || snapshot.spokenText !== finalText() || snapshot.voiceId !== activeVoice().id || snapshot.modelId !== $("#model-select").value || JSON.stringify(snapshot.settings) !== JSON.stringify(window.TTSGenerationSettings?.getSettings?.()) || JSON.stringify(snapshot.segments) !== JSON.stringify(state.scriptSegments)) ? " 이전 대본 또는 설정으로 만든 결과입니다." : ""}`,
				),
			);
		}
		if (mode === "lost") {
			copy.append(
				el("h2", "", "생성 여부를 확인하지 못했어요"),
				el(
					"p",
					"",
					"다시 만들면 사용량이 추가될 수 있어요. 실제 요청은 전송되지 않은 시연입니다.",
				),
			);
		}
		if (mode === "error") {
			copy.append(
				el("h2", "", "Typecast 연결 상태 시연: 지금은 만들 수 없어요"),
				el("p", "", "다른 공급자를 선택하거나 연결 상태를 확인해 주세요."),
			);
		}
		panel.append(symbol, copy);
		if (mode === "success") {
			panel.classList.add("result-success");
			const actions = el("div", "result-actions");
			const download = button(
				"다운로드 시연",
				"button button-secondary",
				"download",
			);
			download.addEventListener("click", () =>
				toast("시연용 다운로드입니다. 실제 파일은 만들지 않습니다."),
			);
			actions.append(download);
			panel.append(actions);
		}
		if (mode === "success" && state.generationSnapshot?.segments?.length) {
			const details = el("details", "segment-result");
			details.append(el("summary", "", "문단별 생성 계획 확인"));
			state.generationSnapshot.segments.forEach((part, index) => {
				const voice = voiceData.find((v) => v.id === part.voiceId);
				details.append(
					el(
						"p",
						"",
						`${index + 1}. ${part.speaker} · ${voice?.name || part.voiceId} · ${part.provider} · ${part.emotion} — 생성 완료 상태 예시, 실제 음성 없음`,
					),
				);
			});
			panel.append(details);
		}
		if (mode === "error" || mode === "lost") {
			panel.classList.add("result-error");
			const actions = el("div", "result-actions");
			const choose = button("상태 바꾸기", "button button-secondary");
			choose.addEventListener("click", showGenerationPicker);
			actions.append(choose);
			panel.append(actions);
		}
		updateWorkbar();
	};
	const recordGenerationSuccess = () => {
		const snapshot = state.generationSnapshot;
		if (!snapshot) return;
		const items = snapshot.segments?.length
			? snapshot.segments
			: [{ text: snapshot.spokenText, voiceId: snapshot.voiceId }];
		summarize(items).rows.forEach((row) => {
			logUsage({
				kind: "generate",
				provider: row.provider,
				model:
					row.provider === getVoice(snapshot.voiceId)?.provider
						? snapshot.modelLabel
						: "공급자 기본 모델",
				units: row.units,
				unitLabel: row.unitLabel,
				usageLabel: usageText(row.units, row.unitLabel),
				note: `${snapshot.segments?.length ? `문단 ${row.count}개` : "한 덩어리 대본"} · 생성 시연`,
			});
		});
		[...new Set(items.map((item) => item.voiceId))]
			.reverse()
			.forEach(noteVoiceUse);
		if (state.voiceSort === "recent") renderVoiceList();
	};
	const logUsage = (entry) => {
		state.usageLog.unshift({ ...entry, at: new Date().toISOString() });
		if (state.activeView === "connections")
			renderPage("connections", $("#connections-view"));
	};
	const showGenerationPicker = () => {
		openConfirm(
			"생성 상태 시연",
			"실제 요청 없이 검토할 상태를 선택합니다.",
			"완료 상태",
			() => {
				state.isGenerating = false;
				showGeneration("success");
				recordGenerationSuccess();
			},
		);
		const dialog = $("#confirm-dialog");
		const actions = $(".dialog-actions", dialog);
		const lost = button("응답 유실", "button button-secondary scenario-action");
		lost.value = "cancel";
		lost.addEventListener("click", () => {
			dialog.close();
			state.isGenerating = false;
			showGeneration("lost");
		});
		const error = button(
			"공급자 오류",
			"button button-secondary scenario-action",
		);
		error.value = "cancel";
		error.addEventListener("click", () => {
			dialog.close();
			state.isGenerating = false;
			showGeneration("error");
		});
		actions.prepend(error, lost);
	};
	const openConfirm = (title, message, actionLabel, action) => {
		const dialog = $("#confirm-dialog");
		$$(".scenario-action", dialog).forEach((node) => {
			node.remove();
		});
		$("#confirm-title").textContent = title;
		$("#confirm-message").textContent = message;
		const confirm = $("#confirm-action");
		confirm.textContent = actionLabel;
		confirm.onclick = () => {
			action();
		};
		dialog.showModal();
	};
	const showView = (viewName) => {
		if (viewName !== "studio") {
			window.TTSStudioTools?.leave();
			stopPlayer();
		}
		if (viewName !== "mine") {
			cloneMediaCleanup?.();
			cloneMediaCleanup = null;
		}
		window.TTSPrototypeMedia?.stopAll();
		state.activeView = viewName;
		$$(".view").forEach((view) => {
			const active = view.id === `${viewName}-view`;
			view.hidden = !active;
			view.classList.toggle("is-active", active);
		});
		$$(".nav-item").forEach((nav) => {
			nav.classList.toggle("is-active", nav.dataset.nav === viewName);
		});
		const view = $(`#${viewName}-view`);
		if (viewName !== "studio") renderPage(viewName, view);
		window.scrollTo({ top: 0, behavior: "instant" });
		$("#main-content").focus({ preventScroll: true });
	};
	const pageHeader = (_id, title, detail, actionLabel, action) => {
		const header = el("header", "page-header");
		const copy = el("div");
		const heading = el("h1", "", title);
		heading.id = _id;
		copy.append(heading, el("p", "", detail));
		header.append(copy);
		if (actionLabel) {
			const actionButton = button(actionLabel, "button button-primary", "plus");
			actionButton.addEventListener("click", action);
			header.append(actionButton);
		}
		return header;
	};
	const pageContent = () => el("div", "page-content");
	const renderPage = (name, view) => {
		view.replaceChildren();
		if (name === "voices") renderVoicesPage(view);
		if (name === "scripts") renderScriptsPage(view);
		if (name === "presets") renderPresetsPage(view);
		if (name === "library") renderLibraryPage(view);
		if (name === "mine") renderMinePage(view);
		if (name === "connections") renderConnectionsPage(view);
		if (name === "projects") {
			if (window.TTSProjectTools?.renderProjects)
				window.TTSProjectTools.renderProjects(view);
			else
				view.append(
					pageHeader(
						"projects-title",
						"프로젝트",
						"프로젝트 도구를 불러오지 못했어요. 페이지를 새로 고쳐 주세요.",
					),
				);
		}
	};
	const renderVoicesPage = (view) => {
		view.replaceChildren();
		view.append(
			pageHeader(
				"voices-title",
				"성우 보관함",
				"공급자별 성우를 채널과 용도에 맞게 정리하세요. 가상 성우 목록이며 분류는 이 브라우저에 저장됩니다.",
				"채널·분류 관리",
				() => showView("library"),
			),
		);
		const content = pageContent();
		const filters = state.libraryFilters;
		const tools = el("div", "voice-library-toolbar");
		const search = el("input", "voice-library-search");
		search.type = "search";
		search.placeholder = "성우 이름·분류 검색";
		search.setAttribute("aria-label", "성우 이름·분류 검색");
		search.value = filters.query;
		const selectFilter = (key, label, options) => {
			const wrap = el("label", "voice-select-filter", label);
			const select = el("select");
			options.forEach(([id, name]) => {
				const o = el("option", "", name);
				o.value = id;
				select.append(o);
			});
			select.value = filters[key];
			select.addEventListener("change", () => {
				filters[key] = select.value;
				render();
			});
			wrap.append(select);
			return wrap;
		};
		const reset = () => {
			Object.assign(filters, {
				provider: "",
				view: "all",
				query: "",
				preset: "",
				channels: [],
				categories: [],
				types: [],
			});
			renderVoicesPage(view);
		};
		const resetButton = button("필터 초기화", "mini-button");
		resetButton.addEventListener("click", reset);
		tools.append(
			search,
			selectFilter("provider", "공급자", [
				["", "전체"],
				["Typecast", "Typecast"],
				["ElevenLabs", "ElevenLabs"],
				["Fish Audio", "Fish Audio"],
			]),
			selectFilter("view", "보기", [
				["all", "전체 성우"],
				["favorites", "즐겨찾기"],
				["frequent", "자주 사용"],
			]),
			selectFilter("preset", "프리셋", [
				["", "전체"],
				["used", "사용 중"],
				["unused", "미사용"],
			]),
			resetButton,
		);
		const filterGroups = el("div", "voice-classification-filters");
		makeClassificationFilters(filterGroups, filters, () => render());
		const resultCount = el("p", "meta-text");
		resultCount.setAttribute("role", "status");
		const list = el("div", "voice-library-list");
		const render = () => {
			list.replaceChildren();
			const results = voiceData.filter((v) => {
				const inPreset = presetData.some((p) => p.voice === v.id);
				return (
					(!filters.provider || v.provider === filters.provider) &&
					viewMatches(v, filters.view) &&
					searchVoice(v, filters.query) &&
					classification().matches(v, filters) &&
					(!filters.preset || (filters.preset === "used") === inPreset)
				);
			});
			resultCount.textContent = `성우 ${results.length}명 · 같은 분류 안에서는 하나라도, 서로 다른 분류는 모두 일치하는 성우를 표시합니다.`;
			results.forEach((voice) => {
				const flags = voiceFlags(voice);
				const row = el("article", "voice-library-row");
				row.dataset.voiceKey = voiceKey(voice);
				const info = el("div", "data-title");
				info.append(el("span", "avatar", voice.initial));
				const copy = el("div");
				copy.append(
					el("strong", "", voice.name),
					el("span", "", `${voice.provider} · ${voice.tone}`),
				);
				info.append(copy);
				const tags = el("div", "voice-assignment-tags");
				groups.forEach(([group, label]) => {
					const line = el("div", "voice-tag-group");
					line.append(el("span", "voice-tag-label", label));
					const names = classification().getLabels(voice, group);
					if (!names.length) line.append(el("span", "meta-text", "미지정"));
					else
						names.forEach((name) => {
							line.append(el("span", "tag", name));
						});
					tags.append(line);
				});
				const actions = el("div", "voice-library-actions");
				const edit = button("분류 편집", "button button-secondary");
				edit.dataset.classifyKey = voiceKey(voice);
				edit.setAttribute("aria-label", `${voice.name} 분류 편집`);
				edit.addEventListener("click", () =>
					classification().openEditor(voice, edit),
				);
				const flagsRow = el("div", "voice-flag-actions");
				[
					["favorite", "즐겨찾기"],
					["frequent", "자주 사용"],
				].forEach(([key, label]) => {
					const toggle = button(label, "mini-button");
					toggle.setAttribute("aria-pressed", String(flags[key]));
					toggle.setAttribute("aria-label", `${voice.name} ${label}`);
					toggle.addEventListener("click", () => {
						if (!classification().setFlags(voice, { [key]: !flags[key] }))
							toast("저장하지 못했습니다. 다시 시도해 주세요.");
					});
					flagsRow.append(toggle);
				});
				const sample = button(
					voice.sample ? "미리듣기 시연" : "샘플 없음",
					"mini-button",
				);
				sample.disabled = !voice.sample;
				sample.addEventListener("click", () =>
					toast("가상 성우 시연입니다. 실제 음성은 재생하지 않습니다."),
				);
				const use = button("작업실 사용", "mini-button");
				use.addEventListener("click", () => {
					state.selectedVoice = voice.id;
					updateVoiceSelection();
					showView("studio");
				});
				const note = button("메모", "mini-button");
				note.addEventListener("click", () => {
					const value = window.prompt(
						`${voice.name} 메모`,
						state.voiceNotes[voiceKey(voice)] || "",
					);
					if (value !== null) {
						state.voiceNotes[voiceKey(voice)] = value;
						render();
					}
				});
				actions.append(edit, flagsRow, sample, use, note);
				row.append(info, tags, actions);
				if (state.voiceNotes[voiceKey(voice)])
					row.append(el("p", "voice-note", state.voiceNotes[voiceKey(voice)]));
				list.append(row);
			});
			if (!results.length)
				list.append(
					makeEmpty(
						"조건에 맞는 성우가 없어요",
						"분류 편집에서 성우에 항목을 연결하거나 필터를 초기화해 보세요.",
						"필터 초기화",
						reset,
					),
				);
		};
		search.addEventListener("input", () => {
			filters.query = search.value;
			render();
		});
		content.append(tools, filterGroups, resultCount, list);
		view.append(content);
		render();
	};
	const makeEmpty = (title, detail, actionLabel, action) => {
		const box = el("div", "empty-state");
		const i = el("div", "result-icon");
		i.append(icon("search"));
		box.append(i, el("h2", "", title), el("p", "", detail));
		if (actionLabel) {
			const btn = button(actionLabel, "button button-secondary");
			btn.addEventListener("click", action);
			box.append(btn);
		}
		return box;
	};
	const renderScriptsPage = (view) => {
		view.replaceChildren();
		view.append(
			pageHeader(
				"scripts-title",
				"대본 보관함",
				"로컬 브라우저에만 시연용 텍스트를 저장합니다. 실제 서버 보관함이 아닙니다.",
				"현재 대본 저장",
				saveCurrentScript,
			),
		);
		const content = pageContent();
		const notice = el("div", "notice");
		notice.append(
			icon("save"),
			document.createTextNode(
				"이 프로토타입은 API 키나 실제 음성 파일을 저장하지 않습니다.",
			),
		);
		content.append(notice);
		const scriptSearch = el("label", "search-field");
		scriptSearch.append(icon("search"));
		const scriptQuery = el("input");
		scriptQuery.placeholder = "대본 검색";
		scriptQuery.setAttribute("aria-label", "대본 검색");
		scriptSearch.append(scriptQuery);
		content.append(scriptSearch);
		const list = el("div", "data-list");
		const render = () => {
			list.replaceChildren();
			if (!state.scripts.length) {
				list.append(
					makeEmpty(
						"저장한 대본이 없어요",
						"작업실의 대본을 이름과 함께 저장해 보세요.",
						"작업실로 가기",
						() => showView("studio"),
					),
				);
				return;
			}
			state.scripts
				.filter((script) =>
					`${script.name} ${script.text}`
						.toLocaleLowerCase("ko")
						.includes(scriptQuery.value.toLocaleLowerCase("ko")),
				)
				.forEach((script) => {
					const row = el("article", "data-row");
					const title = el("div", "data-title");
					const i = el("span", "avatar");
					i.append(icon("script"));
					const copy = el("div");
					copy.append(
						el("strong", "", script.name),
						el(
							"span",
							"",
							`${script.text.slice(0, 42)}${script.text.length > 42 ? "…" : ""}`,
						),
					);
					title.append(i, copy);
					row.append(
						title,
						el(
							"span",
							"meta-text",
							`${script.text.length.toLocaleString("ko-KR")}자`,
						),
						el("span", "meta-text", "브라우저 저장"),
						el("span", "meta-text", script.savedAt),
					);
					const actions = el("div", "list-actions");
					const insert = button("삽입", "mini-button");
					insert.addEventListener("click", () =>
						insertScript(script.text, false),
					);
					const remove = button("삭제", "mini-button");
					remove.addEventListener("click", () =>
						openConfirm(
							"대본 삭제",
							`‘${script.name}’을(를) 브라우저 저장소에서 지울까요?`,
							"삭제",
							() => {
								const nextScripts = state.scripts.filter(
									(item) => item !== script,
								);
								if (!writeStoredScripts(nextScripts)) {
									toast("저장하지 못했어요. 다시 시도해 주세요.");
									return;
								}
								state.scripts = nextScripts;
								render();
								toast("대본을 삭제했습니다.");
							},
						),
					);
					const edit = button("수정", "mini-button");
					edit.addEventListener("click", () => {
						const next = window.prompt("대본 내용", script.text);
						if (next !== null) {
							const nextScripts = state.scripts.map((item) =>
								item === script
									? { ...item, text: next, savedAt: "방금 수정" }
									: item,
							);
							if (!writeStoredScripts(nextScripts)) {
								toast("저장하지 못했어요. 다시 시도해 주세요.");
								return;
							}
							state.scripts = nextScripts;
							render();
						}
					});
					const duplicate = button("복제", "mini-button");
					duplicate.addEventListener("click", () => {
						const nextScripts = [
							{
								name: `${script.name} 복제`,
								text: script.text,
								savedAt: "방금 복제",
							},
							...state.scripts,
						];
						if (!writeStoredScripts(nextScripts)) {
							toast("저장하지 못했어요. 다시 시도해 주세요.");
							return;
						}
						state.scripts = nextScripts;
						render();
					});
					actions.append(insert, edit, duplicate, remove);
					row.append(actions);
					list.append(row);
				});
		};
		scriptQuery.addEventListener("input", render);
		render();
		content.append(list);
		view.append(content);
	};
	const saveCurrentScript = () => {
		const text = originalText().trim();
		if (!text) {
			setSaveStatus("error", "저장하지 못했어요");
			toast("대본을 입력한 뒤 저장해 주세요.");
			return;
		}
		if (state.saveFail) {
			setSaveStatus("error", "저장하지 못했어요");
			toast("시연 중인 저장 실패 상태입니다. 다시 시도해 주세요.");
			state.saveFail = false;
			return;
		}
		const suggested = state.currentScriptName;
		const name = window.prompt("저장할 대본 이름", suggested);
		if (name === null) return;
		if (!name.trim()) {
			toast("대본 이름을 입력해 주세요.");
			return;
		}
		setSaveStatus("saving", "저장 중…");
		window.setTimeout(() => {
			const nextScripts = [
				{ name: name.trim(), text, savedAt: "방금 저장" },
				...state.scripts,
			];
			const succeeded = writeStoredScripts(nextScripts);
			if (!succeeded) {
				setSaveStatus("error", "저장하지 못했어요");
				toast("브라우저 저장소를 사용할 수 없어요. 다시 시도해 주세요.");
				return;
			}
			state.scripts = nextScripts;
			state.currentScriptName = name.trim();
			setSaveStatus("saved", "저장됨");
			toast("시연용 텍스트를 이 브라우저에 저장했습니다.");
		}, 340);
	};
	const insertScript = (text, replace) => {
		const editor = $("#script-editor");
		if (state.scriptSegments?.length && !replace) {
			setSegments(
				[...state.scriptSegments, { text, voiceId: activeVoice().id }],
				{ label: "저장 대본을 마지막 문단으로 추가했어요." },
			);
			selectTab("source");
			showView("studio");
			toast("문단 작업 중이라 저장 대본을 마지막 문단으로 추가했어요.");
			return;
		}
		if (replace) {
			setSegments(null);
			editor.value = text;
		} else {
			const start = editor.selectionStart ?? editor.value.length;
			editor.value = `${editor.value.slice(0, start)}${editor.value ? "\n" : ""}${text}${editor.value.slice(start)}`;
		}
		editor.dispatchEvent(new Event("input", { bubbles: true }));
		selectTab("source");
		showView("studio");
		toast(
			replace ? "대본을 교체했습니다." : "대본을 현재 위치에 삽입했습니다.",
		);
	};
	const applyPreset = (preset) => {
		const voice = voiceData.find((item) => item.id === preset.voice);
		if (!voice) {
			toast("프리셋의 성우를 사용할 수 없어요. 성우를 다시 선택해 주세요.");
			return false;
		}
		state.selectedVoice = voice.id;
		updateVoiceSelection();
		refreshModelOptions(voice.provider, preset.modelId);
		window.TTSGenerationSettings?.applyPresetSettings(
			preset.modelId,
			preset.settings,
		);
		renderFinalScript();
		return true;
	};
	const renderPresetsPage = (view) => {
		view.replaceChildren();
		const addPreset = () => {
			const errors = window.TTSGenerationSettings?.validate() || [];
			if (errors.length) {
				showView("studio");
				window.TTSGenerationSettings.showErrors(errors);
				return;
			}
			const name = window.prompt("프리셋 이름", `${activeVoice().name} 설정`);
			if (!name?.trim()) return;
			const model = $("#model-select");
			const modelName = model.options[model.selectedIndex].text;
			const settings =
				window.TTSGenerationSettings?.getPresetSettings(model.value) || {};
			const setting =
				window.TTSGenerationSettings?.summaryFor(model.value, settings) ||
				"기본 설정";
			presetData.unshift({
				name: name.trim(),
				detail: `${modelName} · ${setting}`,
				voice: activeVoice().id,
				modelId: model.value,
				settings: structuredClone(settings),
				channel: "개인 작업실",
			});
			renderPage("presets", view);
			toast("현재 선택을 프리셋으로 저장했습니다.");
		};
		view.append(
			pageHeader(
				"presets-title",
				"프리셋",
				"성우와 생성 설정을 함께 저장해 반복 작업을 줄입니다.",
				"현재 설정 저장",
				addPreset,
			),
		);
		const content = pageContent();
		const grid = el("div", "preset-grid");
		presetData.forEach((preset) => {
			const card = el("article", "preset-card");
			card.append(el("h2", "", preset.name), el("p", "", preset.detail));
			const footer = el("footer");
			footer.append(el("span", "tag tag-blue", preset.channel));
			const apply = button("내용 확인 · 적용", "mini-button");
			apply.addEventListener("click", () =>
				openConfirm(
					"프리셋 적용",
					`성우와 모델이 ‘${preset.name}’ 설정으로 바뀝니다. 대본은 변경하지 않습니다.`,
					"적용",
					() => {
						if (!applyPreset(preset)) return;
						showView("studio");
						toast("프리셋을 적용했습니다.");
					},
				),
			);
			footer.append(apply);
			card.append(footer);
			grid.append(card);
		});
		content.append(grid);
		view.append(content);
	};
	const renderLibraryPage = (view) => {
		view.replaceChildren();
		view.append(
			pageHeader(
				"library-title",
				"채널 · 분류",
				"분류 항목을 관리하고 연결된 성우를 확인하세요. 이름을 바꿔도 성우 연결은 유지됩니다.",
				"성우 보관함",
				() => showView("voices"),
			),
		);
		const content = pageContent();
		view.append(content);
		classification().renderManager(content);
	};
	let cloneMediaCleanup = null;
	const renderSegmentPlan = () => {
		const host = $("#segment-plan");
		if (!host) return;
		host.replaceChildren();
		host.hidden = !state.scriptSegments?.length;
		if (host.hidden) return;
		const head = el("div", "segment-plan-header");
		head.append(
			el("h2", "", `문단 제작 계획 · ${state.scriptSegments.length}개`),
		);
		const scriptEdit = button("대본·화자 편집", "button button-secondary");
		scriptEdit.addEventListener("click", () =>
			window.TTSStudioTools.open("import"),
		);
		const edit = button("감정 검토", "button button-secondary");
		edit.addEventListener("click", () => window.TTSStudioTools.open("emotion"));
		const clear = button("문단 계획 해제", "mini-button");
		clear.addEventListener("click", () =>
			setSegments(null, { label: "문단 계획을 해제했어요." }),
		);
		head.append(scriptEdit, edit, clear);
		host.append(
			head,
			el(
				"p",
				"segment-plan-note",
				"문단별 성우·감정 설정입니다. 음성 만들기는 이 계획의 생성 상태를 시연하며 실제 음성 파일은 생성하지 않습니다.",
			),
		);
		const list = el("div", "segment-plan-list");
		state.scriptSegments.forEach((part, index) => {
			const row = el("div", "segment-plan-row");
			const voice = voiceData.find((v) => v.id === part.voiceId);
			row.append(
				el(
					"strong",
					"",
					`${index + 1}. ${part.speaker || "내레이터"} · ${voice?.name || "성우 미지정"}`,
				),
				el("p", "", part.text),
				el(
					"span",
					"segment-plan-note",
					`${part.provider} · ${part.emotion || "normal"} · 강도 ${part.intensity ?? 1}`,
				),
			);
			list.append(row);
		});
		host.append(list);
	};
	const normalizePlanText = (text) =>
		text
			.replace(/\r\n/g, "\n")
			.split(/\n\s*\n/)
			.map((t) => t.trim())
			.filter(Boolean)
			.join("\n\n");
	const validSegments = (segments) =>
		Array.isArray(segments) &&
		segments.length > 0 &&
		segments.length <= 200 &&
		segments.every(
			(part) =>
				typeof part.text === "string" &&
				part.text.trim() &&
				voiceData.some(
					(v) => v.id === part.voiceId && v.provider === part.provider,
				),
		);
	const applyScriptPlan = (plan, mode) => {
		if (
			!validSegments(plan.segments) ||
			plan.text.length > 200000 ||
			normalizePlanText(plan.text) !==
				normalizePlanText(plan.segments.map((p) => p.text).join("\n\n"))
		) {
			toast("문단과 성우 배정을 확인해 주세요. 최대 200개 문단입니다.");
			return false;
		}
		if (mode !== "replace" && mode !== "append") return false;
		if (
			mode === "replace" &&
			originalText().trim() &&
			!window.confirm(
				"현재 작업실 대본을 교체할까요? 저장하지 않은 편집 내용은 바뀝니다.",
			)
		)
			return false;
		const previous = originalText();
		let segments = structuredClone(plan.segments);
		if (mode === "append" && previous.trim()) {
			const current = state.scriptSegments || [
				{
					id: `existing-${Date.now()}`,
					text: previous,
					speaker: "내레이터",
					voiceId: activeVoice().id,
					provider: activeVoice().provider,
					emotion: "normal",
					intensity: 1,
				},
			];
			segments = [...structuredClone(current), ...segments];
		}
		if (segments.length > 200) {
			toast("합친 문단이 200개를 넘습니다. 분량을 줄여 주세요.");
			return false;
		}
		if (!setSegments(segments)) return false;
		showView("studio");
		announce("대본과 문단별 성우 배정을 작업실에 적용했습니다.");
		return true;
	};
	const applyEmotionPlan = (segments) => {
		if (
			!validSegments(segments) ||
			normalizePlanText(segments.map((p) => p.text).join("\n\n")) !==
				normalizePlanText(originalText())
		) {
			toast("대본이 달라졌습니다. 현재 대본을 다시 불러와 검토해 주세요.");
			return false;
		}
		state.segmentUndo = state.scriptSegments
			? structuredClone(state.scriptSegments)
			: null;
		if (!setSegments(segments)) return false;
		announce("문단별 감정 계획을 적용했습니다. 원문은 변경하지 않았습니다.");
		return true;
	};
	const noteWorkChange = () => {
		if (window.TTSProjectTools?.noteChange) window.TTSProjectTools.noteChange();
		else setSaveStatus("unsaved", "저장 안 됨");
	};
	const markSourceChanged = (message) => {
		window.TTSVoiceTools?.invalidateRecommendationForSourceChange?.();
		state.reviewDirty = true;
		corrections.forEach((item) => {
			item.decision = "pending";
			item.proposal = item.defaultProposal;
		});
		$("#editor-help").textContent = message;
		renderReview();
	};
	const makeSegmentId = (index) =>
		`seg-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 7)}`;
	const setSegments = (segments, { label } = {}) => {
		if (segments?.length) {
			if (segments.length > 200) {
				toast("문단은 최대 200개까지 만들 수 있어요.");
				return false;
			}
			const invalid = segments.find(
				(part) =>
					typeof part?.text !== "string" ||
					part.text.length > 2000 ||
					!getVoice(part.voiceId),
			);
			if (invalid) {
				toast("문단 내용이나 성우를 확인해 주세요. 문단당 최대 2,000자입니다.");
				return false;
			}
		}
		const next = segments?.length
			? structuredClone(segments).map((part, index) => ({
					...part,
					id: part.id || makeSegmentId(index),
					speaker: part.speaker || "",
					provider: getVoice(part.voiceId).provider,
					emotion: part.emotion || "normal",
					// 숫자 강도를 받는 공급자(Typecast)는 보통(1), ElevenLabs·Fish는 모델 기본(null).
					intensity:
						part.intensity !== undefined
							? part.intensity
							: ["ElevenLabs", "Fish Audio"].includes(
										getVoice(part.voiceId).provider,
									)
								? null
								: 1,
					speed: typeof part.speed === "number" ? part.speed : null,
					pauseAfter:
						typeof part.pauseAfter === "number" ? part.pauseAfter : 0.3,
					instruction:
						typeof part.instruction === "string" ? part.instruction : "",
				}))
			: null;
		const editor = $("#script-editor");
		const before = editor.value;
		if (next) editor.value = next.map((part) => part.text).join("\n\n");
		state.scriptSegments = next;
		state.segmentSource = next ? editor.value : "";
		renderWorkspace();
		if (editor.value !== before)
			markSourceChanged(
				"문단을 수정했어요. 숫자 발음 교정을 다시 검토해 주세요.",
			);
		else renderFinalScript();
		noteWorkChange();
		if (label) announce(label);
		return true;
	};
	const syncClipped = () => {
		const editor = $("#script-editor");
		editor.classList.toggle(
			"is-clipped",
			editor.readOnly &&
				editor.scrollTop + editor.clientHeight < editor.scrollHeight - 1,
		);
	};
	// 문단 상태의 읽기 전용 보기는 내용 높이만큼 키운다. CSS max-height(60vh)를 넘을 때만 칸 안에서 스크롤한다.
	// field-sizing을 지원하지 않는 Safari 때문에 JS로 맞춘다.
	const fitReadonlyEditor = () => {
		const editor = $("#script-editor");
		const hint = $("#readonly-more");
		if (!editor.readOnly) {
			editor.style.height = "";
			editor.classList.remove("is-clipped");
			hint.hidden = true;
			return;
		}
		if (!editor.getClientRects().length) return;
		editor.style.height = "auto";
		editor.style.height = `${editor.scrollHeight}px`;
		const clipped = editor.scrollHeight > editor.clientHeight + 1;
		hint.hidden = !clipped;
		if (clipped)
			hint.textContent = `전체 ${state.scriptSegments.length}문단 · 칸 안에서 스크롤하면 끝까지 볼 수 있어요`;
		syncClipped();
	};
	const renderWorkspace = () => {
		const paragraphs = Boolean(state.scriptSegments?.length);
		const editor = $("#script-editor");
		editor.readOnly = paragraphs;
		if (paragraphs)
			editor.setAttribute("aria-describedby", "paragraph-mode-text");
		else editor.removeAttribute("aria-describedby");
		$("#paragraph-mode-notice").hidden = !paragraphs;
		$("#single-mode-tools").hidden = paragraphs;
		const host = $("#segment-plan");
		if (window.TTSParagraphs?.render) {
			host.hidden = !paragraphs;
			window.TTSParagraphs.render(host, bridge);
		} else renderSegmentPlan();
		updateScriptLength();
		fitReadonlyEditor();
	};
	const splitIntoParagraphs = () => {
		const text = originalText();
		if (!text.trim()) {
			toast("대본을 입력한 뒤 문단으로 나눠 주세요.");
			$("#script-editor").focus();
			return;
		}
		if (window.TTSParagraphs?.startFromText) {
			window.TTSParagraphs.startFromText(text, bridge);
			return;
		}
		setSegments(
			text
				.split(/\n\s*\n/)
				.map((part) => part.trim())
				.filter(Boolean)
				.map((part) => ({ text: part, voiceId: activeVoice().id })),
			{ label: "빈 줄을 기준으로 문단을 나눴어요." },
		);
	};
	const unsplitParagraphs = async () => {
		const previous = structuredClone(state.scriptSegments);
		const choice = await choose({
			title: "문단을 해제할까요?",
			message:
				"문단별 성우·속도·간격·감정·연기 지시가 사라지고, 이어 붙인 원문만 남아요.",
			actions: [
				{ label: "취소", value: "cancel" },
				{ label: "문단 해제", value: "unsplit", variant: "danger" },
			],
		});
		if (choice !== "unsplit") return;
		setSegments(null, {
			label: "문단을 해제했어요. 원문을 직접 편집할 수 있어요.",
		});
		$("#script-editor").focus();
		toast("문단을 해제했어요.", {
			actionLabel: "되돌리기",
			onAction: () =>
				setSegments(previous, { label: "문단 작업을 되돌렸어요." }),
		});
	};
	const pasteWithSpeakers = async (event) => {
		if (!state.speakerDetect || state.scriptSegments?.length) return;
		const pasted = event.clipboardData?.getData("text/plain") || "";
		const found = window.TTSParagraphs?.detectSpeakers?.(pasted);
		if (!found?.segments?.length) return;
		event.preventDefault();
		const editor = event.currentTarget;
		const { selectionStart: start, selectionEnd: end, value } = editor;
		const choice = await choose({
			title: `화자 ${found.speakers.length}명·문단 ${found.segments.length}개를 감지했어요`,
			message:
				"문단으로 나누면 대사마다 문단이 생기고, 역할별로 성우를 고를 수 있어요. 화자 이름과 같은 성우가 있으면 먼저 배정해요.",
			actions: [
				{ label: "그대로 붙여넣기", value: "plain" },
				{ label: "문단으로 나누기", value: "split", variant: "primary" },
			],
		});
		const before = value.slice(0, start).trim();
		const after = value.slice(end).trim();
		const narrated =
			before || after || found.segments.some((part) => !part.speaker);
		const roles = window.TTSParagraphs.assignRoleVoices(
			found.speakers,
			voiceData,
			activeVoice(),
			narrated ? [activeVoice().id] : [],
		);
		const voiceFor = (speaker) => roles.get(speaker) || activeVoice().id;
		if (
			choice === "split" &&
			setSegments(
				[
					before && { text: before, voiceId: activeVoice().id },
					...found.segments.map((part) => ({
						text: part.text,
						speaker: part.speaker,
						voiceId: voiceFor(part.speaker),
					})),
					after && { text: after, voiceId: activeVoice().id },
				].filter(Boolean),
				{
					label: `화자 ${found.speakers.length}명의 대사를 문단으로 나눴어요.`,
				},
			)
		) {
			window.TTSParagraphs?.openRoleDialog?.(bridge);
			return;
		}
		editor.focus();
		editor.setRangeText(pasted, start, end, "end");
		editor.dispatchEvent(new Event("input", { bubbles: true }));
	};
	const cloneUsable = (clone) =>
		clone.status === "사용 가능" ||
		clone.status === "사용 가능(시연)" ||
		clone.status === "연결됨(시연)";
	const ensureCloneVoice = (clone) => {
		if (getVoice(clone.id)) return;
		voiceData.push({
			id: clone.id,
			name: clone.name,
			initial: clone.name[0],
			provider: clone.provider,
			tone:
				clone.origin === "link"
					? "연결한 목소리 · 시연"
					: clone.origin === "design"
						? "디자인한 목소리 · 시연"
						: "내 클론 · 시연",
			tags: ["내 보이스"],
			sample: false,
			favorite: true,
			language: "한국어",
			gender: "",
			age: "",
			uses: [],
		});
		renderVoiceFacets();
		renderVoiceList();
	};
	const addMyVoice = ({ name, provider, origin = "clone", note = "" }) => {
		const clone = {
			id: `${origin}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
			name: String(name || "이름 없는 목소리").trim(),
			provider,
			origin,
			note,
			status:
				origin === "link"
					? "연결됨(시연)"
					: origin === "design"
						? "사용 가능(시연)"
						: "검증 필요",
		};
		state.clones.unshift(clone);
		if (cloneUsable(clone)) ensureCloneVoice(clone);
		if (state.activeView === "mine") renderPage("mine", $("#mine-view"));
		announce(`${clone.name}을(를) 내 보이스에 추가했어요.`);
		return clone.id;
	};
	const renderVoiceLinkPanel = () => {
		const panel = el("section", "voice-link-panel");
		panel.setAttribute("aria-labelledby", "voice-link-title");
		const title = el("h2", "", "기존 ElevenLabs 목소리 연결");
		title.id = "voice-link-title";
		title.tabIndex = -1;
		const field = (id, label, placeholder) => {
			const wrap = el("div", "form-field");
			const text = el("label", "", label);
			text.htmlFor = id;
			const input = el("input");
			input.id = id;
			input.placeholder = placeholder;
			input.autocomplete = "off";
			wrap.append(text, input);
			return [wrap, input];
		};
		const [nameField, nameInput] = field(
			"voice-link-name",
			"이 앱에서 부를 이름",
			"예: 내 ElevenLabs 내레이션…",
		);
		const [idField, idInput] = field(
			"voice-link-id",
			"Voice ID 또는 공유 링크",
			"20자 Voice ID 또는 https://elevenlabs.io/…",
		);
		idInput.setAttribute("aria-describedby", "voice-link-error");
		const error = el("p", "prototype-media-error");
		error.id = "voice-link-error";
		error.setAttribute("role", "alert");
		const submit = button(
			"확인 후 연결 · 시연",
			"button button-primary",
			"link",
		);
		submit.addEventListener("click", () => {
			const value = idInput.value.trim();
			const valid =
				/^[A-Za-z0-9]{20}$/.test(value) ||
				/^https:\/\/(www\.)?elevenlabs\.io\/\S+$/.test(value);
			idInput.setAttribute("aria-invalid", String(!valid));
			if (!nameInput.value.trim()) {
				error.textContent = "이 앱에서 부를 이름을 입력해 주세요.";
				nameInput.focus();
				return;
			}
			if (!valid) {
				error.textContent =
					"Voice ID는 영문·숫자 20자, 공유 링크는 https://elevenlabs.io/로 시작해야 해요.";
				idInput.focus();
				return;
			}
			error.textContent = "";
			addMyVoice({
				name: nameInput.value,
				provider: "ElevenLabs",
				origin: "link",
				note: value,
			});
			toast(
				"ElevenLabs 목소리를 연결했어요(시연). 실제 확인 요청은 보내지 않았어요.",
			);
			$("#voice-link-title")?.focus();
		});
		panel.append(
			title,
			el(
				"p",
				"form-note",
				"ElevenLabs에서 이미 만든 목소리를 이 앱에서 쓰도록 연결해요. 연결 해제는 이 앱의 연결만 지우고, ElevenLabs에 있는 원본 목소리는 삭제하지 않아요.",
			),
			el(
				"p",
				"form-note",
				"실제 앱에서는 서버가 이 계정에서 쓸 수 있는 목소리인지 확인한 뒤에만 연결해요. ID를 입력하는 것만으로 소유권을 주지 않습니다. 이 화면은 요청을 보내지 않는 시연입니다.",
			),
			nameField,
			idField,
			error,
			submit,
		);
		return panel;
	};
	const renderMinePage = (view) => {
		cloneMediaCleanup?.();
		cloneMediaCleanup = null;
		view.replaceChildren();
		const fresh = () => ({
			step: 1,
			name: "",
			provider: "Typecast",
			method: "",
			source: null,
			consent: false,
			processing: false,
			visibility: "private",
			enhanceAudioQuality: true,
			readText: "",
		});
		state.cloneDraft ||= fresh();
		const draft = state.cloneDraft;
		const redraw = () => renderMinePage(view);
		view.append(
			pageHeader(
				"mine-title",
				"내 보이스",
				"본인 목소리를 등록하고, 준비된 보이스로 대본을 읽어요.",
				"새 보이스 만들기",
				() => {
					window.TTSPrototypeMedia?.revoke(state.cloneDraft?.source);
					state.cloneDraft = fresh();
					redraw();
				},
			),
		);
		const content = pageContent();
		content.append(
			button("작업실로 돌아가기", "button button-secondary"),
			el(
				"p",
				"notice",
				"원본 선택·녹음·재생은 이 브라우저에서 가능합니다. 공급자 전송·보이스 생성·검증은 실제 요청 없는 시연입니다.",
			),
		);
		content.firstElementChild.addEventListener("click", () => {
			showView("studio");
			selectTab("source");
			$("#script-editor").focus();
		});
		content.append(
			el(
				"p",
				"form-note clone-slot-line",
				`사용 중: ${["Typecast", "ElevenLabs", "Fish Audio"].map((provider) => `${provider} ${state.clones.filter((clone) => clone.provider === provider).length}개`).join(" · ")}. 공급자 한도와 보관 기간은 연결 후 확인합니다.`,
			),
		);
		if (state.clones.length) {
			const list = el("div", "data-list");
			state.clones.forEach((clone) => {
				const row = el("article", "data-row");
				row.append(
					el("strong", "", clone.name),
					el("span", "meta-text", clone.provider),
					el("span", "meta-text", clone.status),
				);
				const actions = el("div", "list-actions");
				if ((clone.origin || "clone") === "clone") {
					const ready = button("검증 완료 시연", "mini-button");
					ready.addEventListener("click", () => {
						clone.status = "사용 가능";
						redraw();
					});
					const fail = button("실패 시연", "mini-button");
					fail.addEventListener("click", () => {
						clone.status = "검증 실패";
						redraw();
					});
					actions.append(ready, fail);
				}
				const use = button("작업실 사용", "mini-button");
				use.disabled = !cloneUsable(clone);
				use.addEventListener("click", () => {
					ensureCloneVoice(clone);
					state.selectedVoice = clone.id;
					updateVoiceSelection();
					showView("studio");
				});
				const linked = clone.origin === "link";
				const remove = button(linked ? "연결 해제" : "삭제", "mini-button");
				remove.addEventListener("click", () => {
					if (state.scriptSegments?.some((part) => part.voiceId === clone.id)) {
						toast(
							"문단에서 쓰고 있는 목소리예요. 문단 성우를 바꾼 뒤 다시 시도해 주세요.",
						);
						return;
					}
					openConfirm(
						linked ? "ElevenLabs 연결 해제" : "클론 보이스 삭제",
						linked
							? "이 앱의 연결만 지웁니다. ElevenLabs에 있는 원본 목소리는 삭제하지 않아요."
							: "시연 보이스를 삭제합니다. 연결된 프리셋은 성우를 다시 선택해야 합니다.",
						linked ? "연결 해제" : "삭제",
						() => {
							state.clones = state.clones.filter(
								(item) => item.id !== clone.id,
							);
							const i = voiceData.findIndex((v) => v.id === clone.id);
							if (i >= 0) voiceData.splice(i, 1);
							if (state.selectedVoice === clone.id) {
								state.selectedVoice = voiceData[0].id;
								updateVoiceSelection();
							}
							renderVoiceFacets();
							renderVoiceList();
							redraw();
						},
					);
				});
				actions.append(use, remove);
				row.append(actions);
				list.append(row);
			});
			content.append(list);
		}
		const steps = el("ol", "clone-steps");
		["정보 입력", "원본 준비", "확인 · 동의", "상태 확인"].forEach(
			(label, i) => {
				const step = el(
					"li",
					i + 1 === draft.step ? "active" : "",
					`${i + 1}. ${label}`,
				);
				if (i + 1 === draft.step) step.setAttribute("aria-current", "step");
				steps.append(step);
			},
		);
		content.append(steps);
		const form = el("form", "clone-form");
		form.addEventListener("submit", (e) => e.preventDefault());
		const actions = el("div", "dialog-actions");
		const back = button("이전", "button button-secondary");
		back.addEventListener("click", () => {
			draft.step -= 1;
			redraw();
		});
		if (draft.step > 1 && draft.step < 4) actions.append(back);
		if (draft.step === 1) {
			const field = el("label", "form-field", "보이스 이름");
			const input = el("input");
			input.id = "clone-name";
			input.value = draft.name;
			input.placeholder = "예: 내 경제 채널 목소리…";
			input.addEventListener("input", () => {
				draft.name = input.value;
			});
			field.append(input);
			form.append(field);
			const providerField = el("label", "form-field", "생성할 공급자");
			const provider = el("select");
			provider.id = "clone-provider";
			["Typecast", "ElevenLabs", "Fish Audio"].forEach((name) => {
				provider.append(el("option", "", name));
			});
			provider.value = draft.provider;
			provider.addEventListener("change", () => {
				draft.provider = provider.value;
				draft.consent = false;
				redraw();
			});
			providerField.append(provider);
			form.append(providerField);
			if (draft.provider === "Fish Audio") {
				const visibilityField = el("label", "form-field", "공개 범위");
				const visibility = el("select");
				visibility.id = "clone-visibility";
				[
					["private", "비공개(기본)"],
					["unlist", "링크 공개"],
					["public", "전체 공개"],
				].forEach(([value, label]) => {
					const optionEl = el("option", "", label);
					optionEl.value = value;
					visibility.append(optionEl);
				});
				visibility.value = draft.visibility;
				visibility.addEventListener("change", () => {
					draft.visibility = visibility.value;
					if (visibility.value === "public")
						toast(
							"전체 공개로 만들면 Fish Audio Voice Library에서 누구나 볼 수 있어요.",
						);
				});
				visibilityField.append(visibility);
				form.append(visibilityField);
				const enhanceField = el("label", "check-label");
				const enhanceCheck = el("input");
				enhanceCheck.type = "checkbox";
				enhanceCheck.checked = draft.enhanceAudioQuality;
				enhanceCheck.addEventListener("change", () => {
					draft.enhanceAudioQuality = enhanceCheck.checked;
				});
				enhanceField.append(
					enhanceCheck,
					document.createTextNode(
						"학습 전 배경 잡음 제거·레벨 정규화(enhance_audio_quality, 기본 켬)",
					),
				);
				form.append(enhanceField);
			}
			const next = button("원본 준비", "button button-primary");
			next.addEventListener("click", () => {
				if (!draft.name.trim()) {
					input.focus();
					toast("보이스 이름을 입력해 주세요.");
					return;
				}
				draft.step = 2;
				redraw();
			});
			actions.append(next);
		} else if (draft.step === 2) {
			form.append(
				el("h2", "", "원본 음성을 준비해 주세요"),
				el(
					"p",
					"form-note",
					draft.provider === "Typecast"
						? "Typecast API: WAV/MP3 1개, 5~150초, 25 MiB 이하. 실제 연결 시 계정 조건을 다시 확인합니다."
						: draft.provider === "Fish Audio"
							? "Fish Audio API: 오디오 파일 1~20개, 클립당 최소 10초(권장 1~2분) 깨끗한 단일 화자, WAV/MP3/M4A/OPUS. 파일 크기 상한은 문서에서 확인하지 못했습니다."
							: "ElevenLabs는 깨끗한 단일 화자 녹음 1~2분을 권장합니다. 실제 업로드 제한은 연결 시 확인합니다.",
				),
			);
			const guide = el("div", "recording-guide-host");
			const guideCleanup = window.TTSPrototypeMedia?.mountRecordingGuide?.(
				guide,
				{ provider: draft.provider },
			);
			const media = el("div");
			form.append(guide, media);
			if (draft.provider === "ElevenLabs") {
				const field = el("div", "form-field");
				const label = el("label", "", "녹음에서 읽은 문장 (선택)");
				label.htmlFor = "clone-read-text";
				const area = el("textarea", "clone-read-text");
				area.id = "clone-read-text";
				area.rows = 3;
				area.maxLength = 1000;
				area.value = draft.readText;
				area.placeholder = "예: 오늘은 세 가지 경제 소식을 전해 드릴게요…";
				area.setAttribute("aria-describedby", "clone-read-text-note");
				area.addEventListener("input", () => {
					draft.readText = area.value;
				});
				const note = el(
					"p",
					"form-note",
					"녹음에서 실제로 읽은 문장을 적어 두면 ElevenLabs 복제 품질에 도움이 돼요. 비워 둬도 됩니다.",
				);
				note.id = "clone-read-text-note";
				field.append(label, area, note);
				form.append(field);
			}
			const next = button("원본 확인", "button button-primary");
			next.disabled = !draft.source?.ready;
			const error = el("p", "prototype-media-error");
			error.setAttribute("role", "alert");
			form.append(error);
			const mediaCleanup = window.TTSPrototypeMedia.mount(media, {
				source: draft.source,
				allowRecording: true,
				maxBytes: 25 * 1024 * 1024,
				label: "내 목소리 원본",
				onBusy: (busy) => {
					next.disabled = busy || !draft.source?.ready;
				},
				onChange: (source) => {
					draft.source = source;
					draft.method = source?.kind || "";
					draft.consent = false;
					next.disabled = !source?.ready;
					error.textContent = "";
				},
			});
			cloneMediaCleanup = () => {
				mediaCleanup?.();
				if (typeof guideCleanup === "function") guideCleanup();
			};
			next.addEventListener("click", () => {
				const source = draft.source;
				if (!source?.ready) return;
				if (
					draft.provider === "Typecast" &&
					(source.duration < 5 || source.duration > 150)
				) {
					error.textContent =
						"Typecast 원본은 5~150초여야 합니다. 다른 원본을 선택해 주세요.";
					return;
				}
				if (
					draft.provider === "Typecast" &&
					source.kind === "file" &&
					!/\.(wav|mp3)$/i.test(source.name)
				) {
					error.textContent =
						"Typecast 파일 원본은 WAV 또는 MP3로 선택해 주세요.";
					return;
				}
				if (draft.provider === "Fish Audio" && source.duration < 10) {
					error.textContent =
						"Fish Audio 원본은 최소 10초 이상이어야 합니다. 다른 원본을 선택해 주세요.";
					return;
				}
				if (
					draft.provider === "Fish Audio" &&
					source.kind === "file" &&
					!/\.(wav|mp3|m4a|opus)$/i.test(source.name)
				) {
					error.textContent =
						"Fish Audio 파일 원본은 WAV, MP3, M4A, OPUS 중 하나로 선택해 주세요.";
					return;
				}
				draft.step = 3;
				redraw();
			});
			actions.append(next);
		} else if (draft.step === 3) {
			form.append(
				el("h2", "", "원본과 전송 대상을 확인해 주세요"),
				el("p", "form-note", `${draft.name} · ${draft.provider}`),
			);
			form.append(
				el(
					"p",
					"form-note",
					`${draft.source?.name || "원본"} · ${Number(draft.source?.duration || 0).toFixed(1)}초 · ${draft.source?.kind === "demo" ? "예시 정보, 실제 음성 없음" : "이 브라우저의 원본"}`,
				),
			);
			if (draft.source?.url) {
				const audio = el("audio");
				audio.controls = true;
				audio.src = draft.source.url;
				audio.setAttribute("aria-label", "복제 원본 음성 확인");
				form.append(audio);
			}
			if (
				draft.source?.kind === "recording" &&
				(draft.provider === "Typecast" || draft.provider === "Fish Audio")
			)
				form.append(
					el(
						"p",
						"form-note",
						`브라우저 녹음 형식은 ${draft.provider} 전송 전에 WAV/MP3${draft.provider === "Fish Audio" ? "/M4A/OPUS" : ""} 변환이 필요합니다. 현재는 변환·전송하지 않는 등록 시연입니다.`,
					),
				);
			if (draft.provider === "ElevenLabs")
				form.append(
					el(
						"p",
						"form-note",
						draft.readText.trim()
							? `읽은 문장: ${draft.readText.trim().length}자 입력함`
							: "읽은 문장: 입력하지 않음(선택)",
					),
				);
			if (draft.provider === "Fish Audio")
				form.append(
					el(
						"p",
						"form-note",
						`공개 범위: ${draft.visibility === "public" ? "전체 공개" : draft.visibility === "unlist" ? "링크 공개" : "비공개"} · 배경 잡음 제거·정규화(enhance_audio_quality): ${draft.enhanceAudioQuality ? "켬" : "끔"}`,
					),
				);
			const label = el("label", "check-label");
			const check = el("input");
			check.type = "checkbox";
			check.checked = draft.consent;
			label.append(
				check,
				document.createTextNode(
					"본인 음성이며 선택한 공급자로 클론을 만드는 데 동의합니다.",
				),
			);
			form.append(label);
			const create = button("클론 생성 시연", "button button-primary");
			create.disabled = !check.checked;
			check.addEventListener("change", () => {
				draft.consent = check.checked;
				create.disabled = !check.checked;
			});
			create.addEventListener("click", () => {
				if (!draft.consent || draft.processing) return;
				draft.step = 4;
				draft.processing = true;
				redraw();
				window.setTimeout(() => {
					if (state.cloneDraft !== draft) return;
					state.clones.unshift({
						id: `clone-${Date.now()}`,
						name: draft.name.trim(),
						provider: draft.provider,
						origin: "clone",
						status: "검증 필요",
					});
					logUsage({
						kind: "clone",
						provider: draft.provider,
						model: "인스턴트 복제",
						units: round1(Number(draft.source?.duration || 0)),
						unitLabel: "초",
						usageLabel: `원본 ${Number(draft.source?.duration || 0).toFixed(1)}초`,
						note: "클론 생성 시연 · 요청을 보내지 않음",
					});
					draft.processing = false;
					if (state.activeView === "mine") redraw();
					announce("클론 시연이 검증 필요 상태입니다.");
				}, 500);
			});
			actions.append(create);
		} else {
			form.append(
				el(
					"h2",
					"",
					draft.processing ? "클론 생성 처리 중…" : "검증 필요 · 시연",
				),
				el(
					"p",
					"form-note",
					draft.processing
						? "실제 API 호출 없이 상태 전환을 시연합니다."
						: "목록에서 ‘검증 완료 시연’을 누르면 사용 가능 상태와 작업실 적용을 살펴볼 수 있습니다. 실제 제공사의 본인 검증을 대신하지 않습니다.",
				),
			);
		}
		form.append(actions);
		content.append(form, renderVoiceLinkPanel());
		view.append(content);
	};
	const renderConnectionsPage = (view) => {
		view.replaceChildren();
		view.append(
			pageHeader(
				"connections-title",
				"연결 상태",
				"공급자 키는 실제 앱의 서버 환경변수에서 관리합니다. 이 화면에서는 입력하지 않습니다.",
			),
		);
		const content = pageContent();
		const grid = el("div", "connection-grid");
		["Typecast", "ElevenLabs", "Fish Audio"].forEach((provider) => {
			const card = el("article", "connection-card");
			const title = el("h2");
			title.append(
				el("span", "dot dot-muted"),
				document.createTextNode(`${provider} · 미연결`),
			);
			card.append(
				title,
				el(
					"p",
					"",
					"프로토타입에서는 키값을 받거나 연결을 시도하지 않습니다. 실제 서비스에서 서버 설정과 상태 확인이 필요합니다.",
				),
			);
			const action = button("후속 설정 안내", "button button-secondary");
			action.addEventListener("click", () =>
				toast("실제 앱: 서버 환경변수와 공급자 연결 상태를 확인합니다."),
			);
			card.append(action);
			grid.append(card);
		});
		content.append(grid);
		window.TTSProjectTools?.renderUsage?.(content, state.usageLog);
		view.append(content);
	};
	const openPresetDialog = () => {
		const list = $("#preset-dialog-list");
		list.replaceChildren();
		presetData.forEach((preset) => {
			const row = el("article", "dialog-item");
			const copy = el("div");
			copy.append(el("strong", "", preset.name), el("p", "", preset.detail));
			const apply = button("확인 · 적용", "mini-button");
			apply.addEventListener("click", () =>
				openConfirm(
					"프리셋 적용",
					`${preset.name}의 성우·모델 설정을 적용합니다. 대본은 유지됩니다.`,
					"적용",
					() => {
						if (!applyPreset(preset)) return;
						$("#preset-dialog").close();
						toast("프리셋을 적용했습니다.");
					},
				),
			);
			row.append(copy, apply);
			list.append(row);
		});
		$("#preset-dialog").showModal();
	};
	const openScriptDialog = () => {
		const list = $("#script-dialog-list");
		list.replaceChildren();
		if (!state.scripts.length) {
			list.append(
				makeEmpty("저장한 대본이 없어요", "현재 대본을 먼저 저장해 보세요."),
			);
		} else
			state.scripts.forEach((script) => {
				const row = el("article", "dialog-item");
				const copy = el("div");
				copy.append(
					el("strong", "", script.name),
					el(
						"p",
						"",
						`${script.text.slice(0, 45)}${script.text.length > 45 ? "…" : ""}`,
					),
				);
				const actions = el("div", "dialog-item-actions");
				const insert = button("삽입", "mini-button");
				insert.addEventListener("click", () => {
					$("#script-dialog").close();
					insertScript(script.text, false);
				});
				const replace = button("교체", "mini-button");
				replace.addEventListener("click", () =>
					openConfirm(
						"대본 교체",
						"현재 편집 중인 대본이 바뀝니다. 저장하지 않은 내용은 사라질 수 있어요.",
						"교체",
						() => {
							$("#script-dialog").close();
							insertScript(script.text, true);
						},
					),
				);
				actions.append(insert, replace);
				row.append(copy, actions);
				list.append(row);
			});
		$("#script-dialog").showModal();
	};
	let initialResult = [];
	const projectSnapshot = () => ({
		title: state.currentScriptName,
		sourceText: originalText(),
		segments: state.scriptSegments
			? structuredClone(state.scriptSegments)
			: null,
		voiceId: activeVoice().id,
		modelId: $("#model-select").value,
	});
	const restoreProject = (project) => {
		stopPlayer();
		state.currentScriptName = String(project.title || "").trim() || "새 작업";
		$("#rename-project").textContent = state.currentScriptName;
		if (getVoice(project.voiceId)) state.selectedVoice = project.voiceId;
		updateVoiceSelection();
		refreshModelOptions(activeVoice().provider, project.modelId);
		const saved = Array.isArray(project.segments) ? project.segments : [];
		const segments = saved.map((part) =>
			getVoice(part?.voiceId) ? part : { ...part, voiceId: activeVoice().id },
		);
		if (!segments.length || !setSegments(segments)) {
			setSegments(null);
			$("#script-editor").value =
				typeof project.sourceText === "string" ? project.sourceText : "";
			markSourceChanged("대본을 불러왔어요. 숫자 발음 교정을 검토해 주세요.");
		}
		Object.assign(state, {
			generationSnapshot: null,
			generationMode: null,
			isGenerating: false,
		});
		const panel = $("#generation-result");
		panel.className = "generation-result";
		panel.replaceChildren(...initialResult.map((node) => node.cloneNode(true)));
		updateWorkbar();
		selectTab("source");
		if (segments.some((part, index) => part !== saved[index]))
			toast("일부 문단의 성우를 찾지 못해 현재 성우로 바꿨어요.");
	};
	const bridge = {
		getVoices: () => voiceData.map((voice) => structuredClone(voice)),
		getSourceText: originalText,
		getActiveVoice: () => ({ ...activeVoice() }),
		getSegments: () =>
			state.scriptSegments ? structuredClone(state.scriptSegments) : null,
		applyScriptPlan,
		applyEmotionPlan,
		selectVoice(id) {
			const voice = voiceData.find((item) => item.id === id);
			if (!voice) return false;
			state.selectedVoice = voice.id;
			updateVoiceSelection();
			return true;
		},
		showView,
		announce,
		setSegments,
		estimate,
		getRecentVoices: () => getRecentVoices().filter(getVoice),
		noteVoiceUse,
		toast,
		choose,
		addMyVoice,
		logUsage,
		getVoice: (voiceId) => {
			const voice = getVoice(voiceId);
			return voice ? structuredClone(voice) : undefined;
		},
	};
	const init = () => {
		loadStoredScripts();
		classification().init({
			voices: voiceData,
			onChange: () => {
				const previousFocus = document.activeElement;
				const focusLabel = previousFocus?.getAttribute("aria-label");
				for (const filters of [state.libraryFilters, state.studioFilters])
					groups.forEach(([g]) => {
						const ids = new Set(
							classification()
								.getItems(g)
								.map((i) => i.id),
						);
						filters[g] = filters[g].filter((id) => ids.has(id));
					});
				renderStudioClassificationFilters();
				renderVoiceList();
				if (state.activeView === "voices") renderVoicesPage($("#voices-view"));
				if (previousFocus && !document.contains(previousFocus) && focusLabel) {
					const next = $$("[aria-label]").find(
						(node) => node.getAttribute("aria-label") === focusLabel,
					);
					next?.focus();
				}
			},
			onBrowse: (group, id) => {
				Object.assign(state.libraryFilters, {
					provider: "",
					view: "all",
					query: "",
					preset: "",
					channels: [],
					categories: [],
					types: [],
				});
				state.libraryFilters[group] = [id];
				showView("voices");
				history.replaceState(null, "", "#voices");
			},
		});
		renderStudioClassificationFilters();
		$("#studio-voice-view").addEventListener("change", (event) => {
			state.voiceView = event.target.value;
			renderVoiceList();
		});
		$("#voice-sort").addEventListener("change", (event) => {
			state.voiceSort = event.target.value;
			renderVoiceList();
		});
		initialResult = [...$("#generation-result").childNodes].map((node) =>
			node.cloneNode(true),
		);
		const workbar = $("#workbar");
		new ResizeObserver(() =>
			document.documentElement.style.setProperty(
				"--workbar-height",
				`${workbar.offsetHeight}px`,
			),
		).observe(workbar);
		$("#workbar-summary-panel").addEventListener("beforetoggle", (event) => {
			if (event.newState === "open") renderSummaryPanel();
		});
		$("#workbar-download-menu").addEventListener("beforetoggle", (event) => {
			if (event.newState === "open") renderDownloadMenu();
		});
		$("#player-prev").addEventListener("click", () => stepPlayer(-1));
		$("#player-next").addEventListener("click", () => stepPlayer(1));
		$("#player-toggle").addEventListener("click", togglePlayer);
		$("#choice-dialog").addEventListener("close", () => {
			const pending = pendingChoice;
			pendingChoice = null;
			pending?.resolve($("#choice-dialog").returnValue || "cancel");
			if (pending?.opener?.isConnected) pending.opener.focus();
		});
		state.speakerDetect = readStored(speakerDetectKey, true) !== false;
		const speakerToggle = $("#speaker-detect");
		const renderSpeakerDetect = () => {
			speakerToggle.setAttribute("aria-pressed", String(state.speakerDetect));
			$(".toggle-state", speakerToggle).textContent = state.speakerDetect
				? "켬"
				: "끔";
		};
		speakerToggle.disabled = !window.TTSParagraphs?.detectSpeakers;
		if (speakerToggle.disabled)
			speakerToggle.title =
				"문단 도구를 불러오지 못해 화자 감지를 쓸 수 없어요";
		speakerToggle.addEventListener("click", () => {
			state.speakerDetect = !state.speakerDetect;
			writeStored(speakerDetectKey, state.speakerDetect);
			renderSpeakerDetect();
			announce(
				state.speakerDetect
					? "화자 자동 감지를 켰어요. 대화 대본을 붙여 넣으면 문단으로 나눌지 물어봐요."
					: "화자 자동 감지를 껐어요.",
			);
		});
		renderSpeakerDetect();
		$("#split-paragraphs").addEventListener("click", splitIntoParagraphs);
		$("#unsplit-paragraphs").addEventListener("click", unsplitParagraphs);
		$("#script-editor").addEventListener("paste", pasteWithSpeakers);
		$("#script-editor").addEventListener("scroll", syncClipped, {
			passive: true,
		});
		// 탭·화면 전환으로 다시 보이거나 폭이 바뀌면 다시 맞춘다. 콜백 안에서 크기를 바꾸지 않도록 한 프레임 미룬다.
		new ResizeObserver(() => requestAnimationFrame(fitReadonlyEditor)).observe(
			$("#script-editor"),
		);
		document.fonts?.ready.then(fitReadonlyEditor);
		window.TTSGenerationSettings?.init({ onChange: renderFinalScript });

		refreshModelOptions(activeVoice().provider, $("#model-select").value);
		renderVoiceFacets();
		renderVoiceList();
		renderReview();
		renderWorkspace();
		$$(".nav-item, .brand").forEach((nav) => {
			nav.addEventListener("click", (event) => {
				const name = nav.dataset.nav;
				if (!name) return;
				event.preventDefault();
				showView(name);
				history.replaceState(null, "", `#${name}`);
			});
		});
		$$(".filter-chip").forEach((chip) => {
			chip.addEventListener("click", () => {
				state.provider = chip.dataset.provider;
				$$(".filter-chip").forEach((item) => {
					const selected = item === chip;
					item.classList.toggle("is-selected", selected);
					item.setAttribute("aria-pressed", String(selected));
				});
				renderVoiceList();
			});
		});
		$("#voice-search").addEventListener("input", renderVoiceList);
		$("#reset-voice-filters").addEventListener("click", resetVoiceFilters);
		$("#show-empty-voices").addEventListener("click", () => {
			$("#voice-search").value = "없는 성우";
			renderVoiceList();
		});
		$("#source-tab").addEventListener("click", () => selectTab("source"));
		$("#pronunciation-tab").addEventListener("click", () =>
			selectTab("pronunciation"),
		);
		[$("#source-tab"), $("#pronunciation-tab")].forEach((tab, index, tabs) => {
			tab.addEventListener("keydown", (event) => {
				if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
				event.preventDefault();
				const nextIndex =
					event.key === "ArrowRight"
						? (index + 1) % tabs.length
						: (index - 1 + tabs.length) % tabs.length;
				tabs[nextIndex].focus();
				selectTab(nextIndex === 0 ? "source" : "pronunciation");
			});
		});
		$("#script-editor").addEventListener("input", () => {
			if (state.scriptSegments && state.segmentSource !== originalText()) {
				state.scriptSegments = null;
				state.segmentSource = "";
				announce(
					"원문이 변경되어 문단별 계획을 해제했습니다. 다시 검토해 주세요.",
				);
				renderWorkspace();
			}
			markSourceChanged(
				"원문을 수정했어요. 숫자 발음 교정을 다시 검토해 주세요.",
			);
			noteWorkChange();
		});
		$("#revert-review").addEventListener("click", () => {
			corrections.forEach((item) => {
				item.decision = "pending";
			});
			renderReview();
			announce("모든 발음 교정을 검수 대기 상태로 되돌렸습니다.");
		});
		$("#copy-final-script").addEventListener("click", () => {
			navigator.clipboard?.writeText(finalText()).then(
				() => toast("발음용 대본을 복사했습니다."),
				() => toast("브라우저 정책으로 복사하지 못했어요."),
			);
		});
		$("#save-script").addEventListener("click", saveCurrentScript);
		$("#load-script").addEventListener("click", openScriptDialog);
		$("#open-import-tool").addEventListener("click", () =>
			window.TTSStudioTools.open("import"),
		);
		$("#open-preset-dialog").addEventListener("click", openPresetDialog);
		$("#open-voice-library").addEventListener("click", () =>
			showView("voices"),
		);
		$("#toggle-settings").addEventListener("click", () => {
			const settings = $("#settings-inline");
			settings.hidden = !settings.hidden;
			$("#toggle-settings").setAttribute(
				"aria-expanded",
				String(!settings.hidden),
			);
			$("#toggle-settings").lastChild.textContent = settings.hidden
				? "설정 펼치기"
				: "설정 접기";
		});
		$("#reset-settings").addEventListener("click", () => {
			window.TTSGenerationSettings?.resetModel($("#model-select").value);
			toast("현재 모델의 생성 설정을 기본값으로 되돌렸습니다.");
		});
		$("#model-select").addEventListener("change", () => {
			renderModelSettings();
			renderFinalScript();
			noteWorkChange();
		});
		$("#mobile-voice-toggle")?.addEventListener("click", () => {
			const open = document.body.classList.toggle("show-mobile-voices");
			$("#mobile-voice-toggle").setAttribute("aria-expanded", String(open));
		});
		$("#mobile-more-toggle")?.addEventListener("click", () => {
			const open = document.body.classList.toggle("show-mobile-more");
			$("#mobile-more-toggle").setAttribute("aria-expanded", String(open));
		});
		$("#confirm-dialog").addEventListener("close", () => {
			if (state.isGenerating && $("#confirm-dialog").returnValue === "cancel")
				state.isGenerating = false;
		});
		$("#confirm-dialog").addEventListener("close", () => {
			if (state.isGenerating) {
				state.isGenerating = false;
				$("#make-audio").disabled = false;
				showGeneration("idle");
			}
		});
		$("#make-audio").addEventListener("click", async () => {
			if (state.isGenerating) return;
			const paragraphs = Boolean(state.scriptSegments?.length);
			if (!originalText().trim()) {
				toast("대본을 입력한 뒤 음성을 만들어 주세요.");
				return;
			}
			if (
				paragraphs &&
				state.scriptSegments.some((part) => !part.text.trim())
			) {
				toast("내용이 없는 문단이 있어요. 채우거나 삭제한 뒤 만들어 주세요.");
				return;
			}
			if (!paragraphs && finalText().length > 2000) {
				toast("교정 후 생성문이 2,000자를 넘어요. 분량을 줄여 주세요.");
				return;
			}
			if (pendingCorrections().length) {
				selectTab("pronunciation");
				toast(
					"검수 대기 숫자를 적용하거나 원문 유지로 결정한 뒤 만들어 주세요.",
				);
				return;
			}
			const settingErrors =
				window.TTSGenerationSettings?.validate($("#model-select").value) || [];
			if (settingErrors.length) {
				window.TTSGenerationSettings.showErrors(settingErrors);
				return;
			}
			const summary = summarize();
			const choice = await choose({
				title: "음성 만들기 확인 · 시연",
				message: `${paragraphs ? `문단 ${summary.count}개 · 성우 ${summary.voices}명` : `한 덩어리 대본 · ${activeVoice().name}`} · 약 ${formatDuration(summary.seconds)} · 예상 사용량 ${summary.usage}(추정). 실제 요청과 과금은 일어나지 않는 시연입니다.`,
				actions: [
					{ label: "취소", value: "cancel" },
					{ label: "만들기 시연", value: "generate", variant: "primary" },
				],
			});
			if (choice !== "generate" || state.isGenerating) return;
			state.isGenerating = true;
			state.generationSnapshot = {
				segments: state.scriptSegments
					? structuredClone(state.scriptSegments)
					: null,
				sourceText: originalText(),
				spokenText: finalText(),
				voiceId: activeVoice().id,
				modelId: $("#model-select").value,
				voiceName: activeVoice().name,
				modelLabel: $("#model-select").selectedOptions[0].textContent,
				settings: window.TTSGenerationSettings?.getSettings(
					$("#model-select").value,
				),
			};
			$("#make-audio").disabled = true;
			showGeneration("working");
			window.setTimeout(() => {
				$("#make-audio").disabled = false;
				showGenerationPicker();
			}, 520);
		});
		window.TTSStudio = bridge;
		window.TTSStudioTools?.init();
		window.TTSProjectTools?.init({
			bridge,
			example: projectSnapshot(),
			snapshot: projectSnapshot,
			restore: restoreProject,
			setSaveStatus,
			getTitle: () => state.currentScriptName,
			setTitle: (name) => {
				state.currentScriptName = name;
				$("#rename-project").textContent = name;
			},
		});
		const hash = location.hash.slice(1);
		if (
			[
				"studio",
				"voices",
				"scripts",
				"presets",
				"library",
				"mine",
				"connections",
				"projects",
			].includes(hash)
		)
			showView(hash);
	};
	document.addEventListener("DOMContentLoaded", init);
})();
