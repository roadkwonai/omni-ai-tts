(() => {
	const state = {
		recommend: {
			mode: "script",
			description: "",
			provider: "all",
			category: "all",
			type: "all",
			outcome: "success",
			status: "idle",
			results: [],
			compare: [],
		},
		discovery: {
			source: null,
			outcome: "success",
			status: "idle",
			results: [],
			compare: [],
		},
		changer: {
			source: null,
			voiceId: "",
			format: "mp3_44100_128",
			denoise: "off",
			consent: false,
			outcome: "success",
			status: "idle",
		},
		design: {
			gender: "any",
			age: "middle",
			accent: "ko",
			accentStrength: 50,
			emotion: "calm",
			pronunciation: "standard",
			speed: 1,
			pitch: 0,
			description: "",
			sample: "",
			status: "idle",
			results: [],
			resultKey: "",
			saved: {},
		},
	};
	const timers = new Map();
	const cleanups = new Map();
	let recommendationHost = null;

	function node(tag, className, text) {
		const item = document.createElement(tag);
		if (className) item.className = className;
		if (className?.includes("voice-tool-status"))
			item.setAttribute(
				"role",
				className.includes("error") ? "alert" : "status",
			);
		if (text !== undefined) item.textContent = text;
		return item;
	}

	function button(text, className = "button button-secondary") {
		const item = node("button", className, text);
		item.type = "button";
		return item;
	}

	function labelledInput(id, labelText, control) {
		const wrap = node("div", "voice-tool-field");
		const label = node("label", "voice-tool-label", labelText);
		label.htmlFor = id;
		control.id = id;
		wrap.append(label, control);
		return wrap;
	}

	function message(id, text = "") {
		const item = node("p", "voice-tool-error", text);
		item.id = id;
		item.setAttribute("role", "alert");
		return item;
	}

	function announce(text) {
		window.TTSStudio?.announce?.(text);
	}

	function notify(text, options) {
		if (typeof window.TTSStudio?.toast === "function")
			window.TTSStudio.toast(text, options);
		else announce(text);
	}

	function icon(id) {
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("aria-hidden", "true");
		const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
		use.setAttribute("href", `#i-${id}`);
		svg.append(use);
		return svg;
	}

	function voices() {
		const list = window.TTSStudio?.getVoices?.();
		return Array.isArray(list) ? list : [];
	}

	function classificationLabels(voice, group) {
		return window.TTSVoiceClassification?.getLabels?.(voice, group) || [];
	}

	function sourceTitle(source) {
		if (!source) return "원본을 선택하지 않았습니다.";
		if (source.kind === "url") return "HTTPS URL 참조 (가져오지 않음)";
		if (source.kind === "demo") return "내장 시연 원본";
		return source.name || "로컬 음성 원본";
	}

	function cancel(key, section) {
		window.clearTimeout(timers.get(key));
		timers.delete(key);
		section.requestVersion = null;
		section.timerKey = null;
		section.status = "idle";
		announce("시연 요청을 취소했습니다.");
	}

	function invalidate(section) {
		if (section.timerKey) {
			window.clearTimeout(timers.get(section.timerKey));
			timers.delete(section.timerKey);
		}
		section.timerKey = null;
		section.requestVersion = null;
		section.status = "idle";
		section.results = [];
		if (Array.isArray(section.compare)) section.compare = [];
	}

	function renderKeepingFocus(render, control) {
		const id = control.id;
		const selection =
			control instanceof HTMLTextAreaElement
				? { start: control.selectionStart, end: control.selectionEnd }
				: null;
		render();
		const next = document.getElementById(id);
		if (!next) return;
		next.focus({ preventScroll: true });
		if (selection && next instanceof HTMLTextAreaElement)
			next.setSelectionRange(selection.start, selection.end);
	}

	function updateMediaBusyButton(key, section) {
		document
			.querySelectorAll(`[data-voice-tool-run="${key}"]`)
			.forEach((item) => {
				item.disabled =
					section.status === "loading" || section.mediaBusy === true;
			});
	}

	function fixtureCandidates(kind) {
		const all = voices();
		const defaults = [
			{
				id: "minseo",
				provider: "Typecast",
				name: "민서",
				tone: "차분한 정보성",
				sample: false,
			},
			{
				id: "soyeon",
				provider: "ElevenLabs",
				name: "소연",
				tone: "또렷한 설명형",
				sample: false,
			},
			{
				id: "juno",
				provider: "Typecast",
				name: "주노",
				tone: "부드러운 내레이션",
				sample: false,
			},
		];
		const selected = all.length ? all : defaults;
		return selected.slice(0, 4).map((voice, index) => ({
			...voice,
			reason:
				kind === "discover"
					? [
							"참고 원본의 또렷한 발화와 비교할 수 있는 예시입니다.",
							"문장 끝 호흡이 안정적인 예시 후보입니다.",
							"정보 전달 톤을 함께 확인할 수 있는 예시입니다.",
						][index] || "비교 검토용 시연 후보입니다."
					: [
							"현재 대본의 정보 전달과 숫자 읽기에 어울리는 예시입니다.",
							"짧은 문장의 또렷한 호흡을 비교할 수 있습니다.",
							"설명형 문단의 연결감을 검토할 수 있습니다.",
						][index] || "대본 조건을 비교하기 위한 시연 후보입니다.",
		}));
	}

	function voiceKey(voice) {
		return `${voice.provider}:${voice.id}`;
	}

	function renderCompare(section, candidates, onRender) {
		const wrap = node("section", "voice-tool-compare", "");
		wrap.setAttribute("aria-label", "비교 목록");
		const title = node(
			"h3",
			"voice-tool-subtitle",
			`비교 목록 (${section.compare.length}/3)`,
		);
		wrap.append(title);
		if (!section.compare.length) {
			wrap.append(
				node(
					"p",
					"voice-tool-muted",
					"후보에서 최대 3명을 비교할 수 있습니다.",
				),
			);
			return wrap;
		}
		const list = node("div", "voice-tool-compare-list");
		section.compare.forEach((key) => {
			const voice = candidates.find((item) => voiceKey(item) === key);
			if (!voice) return;
			const row = node("div", "voice-tool-compare-row");
			const copy = node("div", "");
			copy.append(
				node("strong", "", `${voice.name} · ${voice.provider}`),
				node("span", "voice-tool-muted", voice.tone || "톤 정보 시연"),
			);
			const remove = button("비교에서 제거", "voice-tool-text-button");
			remove.addEventListener("click", () => {
				section.compare = section.compare.filter((item) => item !== key);
				onRender();
			});
			row.append(copy, remove);
			list.append(row);
		});
		wrap.append(list);
		return wrap;
	}

	function renderCandidates(section, candidates, onRender, label) {
		const list = node("div", "voice-tool-candidates");
		candidates.forEach((voice) => {
			const key = voiceKey(voice);
			const row = node("article", "voice-tool-candidate");
			const copy = node("div", "voice-tool-candidate-copy");
			const labels = classificationLabels(voice, "categories");
			copy.append(
				node("h3", "", `${voice.name} · ${voice.provider}`),
				node("p", "", voice.reason),
				node("p", "voice-tool-muted", voice.tone || "톤 정보 없음"),
				node(
					"p",
					"voice-tool-sample-state",
					voice.sample
						? "샘플 사용 가능 여부는 연결 후 다시 확인합니다."
						: "이 시연에는 공급자 샘플 오디오가 연결되지 않았습니다.",
				),
			);
			if (labels.length)
				copy.append(node("p", "voice-tool-tags", labels.join(" · ")));
			const actions = node("div", "voice-tool-actions");
			const compare = button(
				section.compare.includes(key) ? "비교에서 제거" : "비교에 추가",
				"button button-secondary",
			);
			compare.disabled =
				!section.compare.includes(key) && section.compare.length >= 3;
			compare.addEventListener("click", () => {
				section.compare = section.compare.includes(key)
					? section.compare.filter((item) => item !== key)
					: [...section.compare, key];
				onRender();
			});
			const select = button(
				label || "작업실 성우로 적용",
				"button button-primary",
			);
			select.addEventListener("click", () => {
				if (window.TTSStudio?.selectVoice?.(voice.id))
					announce(`${voice.name} 성우를 작업실에 적용했습니다.`);
				else announce("작업실 성우 목록에서 이 후보를 찾지 못했습니다.");
			});
			actions.append(compare, select);
			row.append(copy, actions);
			list.append(row);
		});
		return list;
	}

	function outcomeSelect(id, section, render) {
		const select = document.createElement("select");
		["success", "empty", "error"].forEach((value) => {
			const option = node(
				"option",
				"",
				value === "success" ? "성공" : value === "empty" ? "빈 결과" : "오류",
			);
			option.value = value;
			option.selected = section.outcome === value;
			select.append(option);
		});
		select.addEventListener("change", () => {
			section.outcome = select.value;
			invalidate(section);
			render();
		});
		return labelledInput(id, "결과 시연", select);
	}

	function focusResult(key, section) {
		const button = document.querySelector(`[data-voice-tool-run="${key}"]`);
		const panel = button?.closest(".voice-tool");
		const target =
			panel?.querySelector(".voice-tool-status") || panel?.querySelector("h2");
		if (target) {
			target.tabIndex = -1;
			target.focus({ preventScroll: true });
		}
		announce(
			section.status === "loading"
				? "시연을 준비하고 있습니다."
				: section.status === "success"
					? "시연 결과가 준비됐습니다."
					: section.status === "empty"
						? "조건에 맞는 시연 결과가 없습니다."
						: "시연 오류가 발생했습니다. 다시 시도할 수 있습니다.",
		);
	}
	function runDemo(key, section, ready, complete, render, errorTarget) {
		section.retry = () =>
			runDemo(key, section, ready, complete, render, errorTarget);
		if (!ready()) {
			errorTarget.textContent =
				"시연을 시작하기 전에 필요한 입력을 확인해 주세요.";
			return;
		}
		errorTarget.textContent = "";
		window.clearTimeout(timers.get(key));
		timers.delete(key);
		section.status = "loading";
		render();
		focusResult(key, section);
		const version = `${Date.now()}-${key}`;
		section.requestVersion = version;
		section.timerKey = key;
		timers.set(
			key,
			window.setTimeout(() => {
				if (section.requestVersion !== version) return;
				timers.delete(key);
				section.timerKey = null;
				const terminalStatus = complete();
				section.status = terminalStatus || section.outcome;
				render();
				focusResult(key, section);
			}, 560),
		);
	}

	function mountMedia(key, holder, section, render, label, allowUrl = true) {
		cleanups.get(key)?.();
		cleanups.delete(key);
		if (!window.TTSPrototypeMedia?.mount) {
			holder.append(
				node(
					"p",
					"voice-tool-muted",
					"공통 음원 입력 모듈을 불러오는 중입니다.",
				),
			);
			return;
		}
		const cleanup = window.TTSPrototypeMedia.mount(holder, {
			source: section.source,
			label,
			allowUrl,
			allowRecording: false,
			maxBytes: 25 * 1024 * 1024,
			onChange(source) {
				section.source = source;
				invalidate(section);
				render();
				document
					.querySelector(`[data-voice-tool-run="${key}"]`)
					?.closest(".voice-tool")
					?.querySelector(".prototype-media-file button")
					?.focus({ preventScroll: true });
			},
			onBusy(busy) {
				section.mediaBusy = busy;
				updateMediaBusyButton(key, section);
			},
		});
		if (typeof cleanup === "function") cleanups.set(key, cleanup);
	}

	function recommendation(host) {
		recommendationHost = host;
		const section = state.recommend;
		const render = () => recommendation(host);
		host.replaceChildren();
		const panel = node("section", "voice-tool voice-tool-recommend");
		panel.append(
			node("h2", "voice-tool-title", "대본 맞춤 추천"),
			node(
				"p",
				"voice-tool-lead",
				"입력 조건과 고정 후보를 비교하는 시연입니다. 실제 AI 분석이나 공급자 요청은 하지 않습니다.",
			),
		);
		const modeGroup = node("fieldset", "voice-tool-choice");
		modeGroup.append(node("legend", "", "추천 기준"));
		[
			["script", "현재 대본"],
			["description", "직접 설명"],
		].forEach(([value, label]) => {
			const labelNode = node("label", "voice-tool-radio");
			const radio = document.createElement("input");
			radio.type = "radio";
			radio.name = "voice-tool-recommend-mode";
			radio.value = value;
			radio.checked = section.mode === value;
			radio.addEventListener("change", () => {
				section.mode = value;
				invalidate(section);
				render();
			});
			labelNode.append(radio, document.createTextNode(label));
			modeGroup.append(labelNode);
		});
		panel.append(modeGroup);
		const inputError = message("voice-tool-recommend-error");
		if (section.mode === "script") {
			const script = node(
				"p",
				"voice-tool-source-copy",
				window.TTSStudio?.getSourceText?.() || "현재 대본이 비어 있습니다.",
			);
			script.tabIndex = 0;
			panel.append(node("p", "voice-tool-label", "현재 대본 미리보기"), script);
		} else {
			const description = document.createElement("textarea");
			description.rows = 3;
			description.maxLength = 500;
			description.value = section.description;
			description.placeholder = "예: 경제 브리핑을 차분하고 또렷하게 전달";
			description.setAttribute("aria-describedby", inputError.id);
			let composing = false;
			let changedWhileComposing = false;
			description.addEventListener("compositionstart", () => {
				composing = true;
			});
			description.addEventListener("compositionend", () => {
				composing = false;
				if (!changedWhileComposing) return;
				changedWhileComposing = false;
				renderKeepingFocus(render, description);
			});
			description.addEventListener("input", () => {
				section.description = description.value;
				invalidate(section);
				if (composing) changedWhileComposing = true;
				else renderKeepingFocus(render, description);
			});
			panel.append(
				labelledInput(
					"voice-tool-recommend-description",
					"성우에 바라는 설명",
					description,
				),
			);
		}
		const filters = node("div", "voice-tool-filter-grid");
		const provider = document.createElement("select");
		[
			["all", "모든 공급자"],
			["Typecast", "Typecast"],
			["ElevenLabs", "ElevenLabs"],
			["Fish Audio", "Fish Audio"],
		].forEach(([value, label]) => {
			const option = node("option", "", label);
			option.value = value;
			option.selected = section.provider === value;
			provider.append(option);
		});
		provider.addEventListener("change", () => {
			section.provider = provider.value;
			invalidate(section);
			renderKeepingFocus(render, provider);
		});
		const category = document.createElement("select");
		const categories =
			window.TTSVoiceClassification?.getItems?.("categories") || [];
		[
			["all", "모든 카테고리"],
			...categories.map((item) => [item.id, item.name]),
		].forEach(([value, label]) => {
			const option = node("option", "", label);
			option.value = value;
			option.selected = section.category === value;
			category.append(option);
		});
		category.addEventListener("change", () => {
			section.category = category.value;
			invalidate(section);
			renderKeepingFocus(render, category);
		});
		const type = document.createElement("select");
		const types = window.TTSVoiceClassification?.getItems?.("types") || [];
		[
			["all", "모든 타입"],
			...types.map((item) => [item.id, item.name]),
		].forEach(([value, label]) => {
			const option = node("option", "", label);
			option.value = value;
			option.selected = section.type === value;
			type.append(option);
		});
		type.addEventListener("change", () => {
			section.type = type.value;
			invalidate(section);
			renderKeepingFocus(render, type);
		});
		filters.append(
			labelledInput("voice-tool-recommend-provider", "공급자", provider),
			labelledInput("voice-tool-recommend-category", "카테고리", category),
			labelledInput("voice-tool-recommend-type", "타입", type),
			outcomeSelect("voice-tool-recommend-outcome", section, render),
		);
		panel.append(filters, inputError);
		const actions = node("div", "voice-tool-actions");
		const run = button(
			section.status === "loading" ? "추천 시연 중" : "추천 시연 시작",
			"button button-primary",
		);
		run.dataset.voiceToolRun = "recommend";
		run.disabled = section.status === "loading";
		run.addEventListener("click", () =>
			runDemo(
				"recommend",
				section,
				() =>
					section.mode === "script"
						? Boolean(window.TTSStudio?.getSourceText?.().trim())
						: section.description.trim().length > 0,
				() => {
					section.results =
						section.outcome === "success"
							? fixtureCandidates("recommend").filter((voice) => {
									const assignment =
										window.TTSVoiceClassification?.getAssignments?.(voice) ||
										{};
									return (
										(section.provider === "all" ||
											voice.provider === section.provider) &&
										(section.category === "all" ||
											assignment.categories?.includes(section.category)) &&
										(section.type === "all" ||
											assignment.types?.includes(section.type))
									);
								})
							: [];
					return section.outcome === "success" && !section.results.length
						? "empty"
						: undefined;
				},
				render,
				inputError,
			),
		);
		actions.append(run);
		if (section.status === "loading") {
			const stop = button("취소", "button button-secondary");
			stop.addEventListener("click", () => {
				cancel("recommend", section);
				render();
			});
			actions.append(stop);
		}
		panel.append(
			actions,
			renderResultState(section, "추천", () => recommendation(host)),
		);
		if (section.status === "success") {
			panel.append(
				renderCandidates(section, section.results, render),
				renderCompare(section, section.results, render),
			);
		}
		host.append(panel);
	}

	function renderResultState(section, noun, retry) {
		const resultStatus = (tag, className, text, role = "status") => {
			const element = node(tag, className, text);
			element.setAttribute("role", role);
			return element;
		};
		if (section.status === "loading")
			return resultStatus(
				"p",
				"voice-tool-status",
				`${noun} 후보를 준비하고 있습니다. 이 시연은 로컬 타이머만 사용합니다.`,
			);
		if (section.status === "empty")
			return resultStatus(
				"p",
				"voice-tool-status",
				`현재 조건에서는 ${noun} 시연 후보가 없습니다. 조건을 바꾸고 다시 실행해 주세요.`,
			);
		if (section.status === "error") {
			const wrap = resultStatus(
				"div",
				"voice-tool-status voice-tool-status-error",
				undefined,
				"alert",
			);
			wrap.append(
				node(
					"p",
					"",
					`${noun} 시연 중 오류 상태입니다. 입력을 유지한 채 다시 시도할 수 있습니다.`,
				),
			);
			const retryButton = button("다시 시도", "button button-secondary");
			retryButton.addEventListener("click", () => {
				if (section.retry) section.retry();
				else retry();
			});
			wrap.append(retryButton);
			return wrap;
		}
		return resultStatus(
			"p",
			"voice-tool-status",
			section.status === "success"
				? `${noun} 시연 결과가 준비됐습니다. 아래 결과를 확인해 주세요.`
				: "조건을 확인한 뒤 시연을 시작해 주세요.",
		);
	}

	function discovery(host) {
		const section = state.discovery;
		const render = () => discovery(host);
		host.replaceChildren();
		const panel = node("section", "voice-tool voice-tool-discovery");
		panel.append(
			node("h2", "voice-tool-title", "목소리 찾기"),
			node(
				"p",
				"voice-tool-lead",
				"로컬 음성 또는 HTTPS URL을 참고해 유사 후보를 비교하는 시연입니다. URL을 가져오거나 동일 화자를 식별하지 않습니다.",
			),
			node(
				"p",
				"voice-tool-muted",
				"영상 파일은 음성만 사용하며, 분석 구간은 연결 후 공급자 기준을 따릅니다.",
			),
		);
		const media = node("div", "voice-tool-media");
		panel.append(media);
		mountMedia("discovery", media, section, render, "참고 음성", true);
		const error = message("voice-tool-discovery-error");
		const actions = node("div", "voice-tool-actions");
		const run = button(
			section.status === "loading" ? "찾는 중" : "유사 후보 찾기",
			"button button-primary",
		);
		run.dataset.voiceToolRun = "discovery";
		run.disabled = section.status === "loading" || section.mediaBusy === true;
		run.addEventListener("click", () =>
			runDemo(
				"discovery",
				section,
				() => Boolean(section.source?.ready && !section.mediaBusy),
				() => {
					section.results =
						section.outcome === "success" ? fixtureCandidates("discover") : [];
				},
				render,
				error,
			),
		);
		actions.append(run);
		if (section.status === "loading") {
			const stop = button("취소", "button button-secondary");
			stop.addEventListener("click", () => {
				cancel("discovery", section);
				render();
			});
			actions.append(stop);
		}
		panel.append(
			outcomeSelect("voice-tool-discovery-outcome", section, render),
			error,
			actions,
			renderResultState(section, "검색", () => discovery(host)),
		);
		if (section.source)
			panel.append(
				node(
					"p",
					"voice-tool-source-summary",
					`참고 원본: ${sourceTitle(section.source)}`,
				),
			);
		if (section.status === "success")
			panel.append(
				renderCandidates(section, section.results, render),
				renderCompare(section, section.results, render),
			);
		host.append(panel);
	}

	function changer(host) {
		const section = state.changer;
		const render = () => changer(host);
		host.replaceChildren();
		const panel = node("section", "voice-tool voice-tool-changer");
		panel.append(
			node("h2", "voice-tool-title", "보이스 체인저"),
			node(
				"p",
				"voice-tool-lead",
				"ElevenLabs 대상 성우만 시연합니다. Typecast 공개 STS 지원은 확인되지 않아 대상에서 제외했습니다. 실제 변환·업로드·API 요청은 없습니다.",
			),
		);
		const media = node("div", "voice-tool-media");
		panel.append(media);
		mountMedia("changer", media, section, render, "변환할 원본 음성", true);
		const elevenVoices = voices().filter(
			(voice) => voice.provider === "ElevenLabs",
		);
		const controls = node("div", "voice-tool-filter-grid");
		const target = document.createElement("select");
		target.setAttribute("aria-describedby", "voice-tool-changer-error");
		const emptyOption = node(
			"option",
			"",
			elevenVoices.length
				? "대상 성우를 선택하세요"
				: "ElevenLabs 성우를 불러오는 중",
		);
		emptyOption.value = "";
		target.append(emptyOption);
		elevenVoices.forEach((voice) => {
			const option = node(
				"option",
				"",
				`${voice.name} · ${voice.tone || "톤 정보 없음"}`,
			);
			option.value = voice.id;
			option.selected = section.voiceId === voice.id;
			target.append(option);
		});
		target.addEventListener("change", () => {
			section.voiceId = target.value;
			invalidate(section);
			renderKeepingFocus(render, target);
		});
		const format = document.createElement("select");
		[
			["mp3_44100_128", "MP3 · 44.1kHz · 128kbps"],
			["pcm_44100", "PCM · 44.1kHz"],
		].forEach(([value, label]) => {
			const option = node("option", "", label);
			option.value = value;
			option.selected = section.format === value;
			format.append(option);
		});
		format.addEventListener("change", () => {
			section.format = format.value;
			invalidate(section);
			renderKeepingFocus(render, format);
		});
		const denoise = document.createElement("select");
		[
			["on", "배경 소음 제거"],
			["off", "사용 안 함"],
		].forEach(([value, label]) => {
			const option = node("option", "", label);
			option.value = value;
			option.selected = section.denoise === value;
			denoise.append(option);
		});
		denoise.addEventListener("change", () => {
			section.denoise = denoise.value;
			invalidate(section);
			renderKeepingFocus(render, denoise);
		});
		controls.append(
			labelledInput(
				"voice-tool-changer-target",
				"ElevenLabs 대상 성우",
				target,
			),
			labelledInput("voice-tool-changer-format", "결과 형식", format),
			labelledInput("voice-tool-changer-denoise", "노이즈 처리", denoise),
			outcomeSelect("voice-tool-changer-outcome", section, render),
		);
		const consent = node("label", "voice-tool-consent");
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.id = "voice-tool-changer-consent";
		checkbox.setAttribute("aria-describedby", "voice-tool-changer-error");
		checkbox.checked = section.consent;
		checkbox.addEventListener("change", () => {
			section.consent = checkbox.checked;
			invalidate(section);
			renderKeepingFocus(render, checkbox);
		});
		consent.append(
			checkbox,
			document.createTextNode("변환 권한과 원본 사용 범위를 확인했습니다."),
		);
		const error = message("voice-tool-changer-error");
		const actions = node("div", "voice-tool-actions");
		const run = button(
			section.status === "loading" ? "변환 시연 중" : "변환 시연 시작",
			"button button-primary",
		);
		run.dataset.voiceToolRun = "changer";
		run.disabled = section.status === "loading" || section.mediaBusy === true;
		run.addEventListener("click", () =>
			runDemo(
				"changer",
				section,
				() =>
					Boolean(
						section.source?.ready &&
							!section.mediaBusy &&
							section.voiceId &&
							section.consent,
					),
				() => {},
				render,
				error,
			),
		);
		actions.append(run);
		if (section.status === "loading") {
			const stop = button("취소", "button button-secondary");
			stop.addEventListener("click", () => {
				cancel("changer", section);
				render();
			});
			actions.append(stop);
		}
		panel.append(
			controls,
			consent,
			error,
			actions,
			renderResultState(section, "변환", () => changer(host)),
			changerComparison(section, elevenVoices),
		);
		host.append(panel);
	}

	function changerComparison(section, elevenVoices) {
		const selected = elevenVoices.find((voice) => voice.id === section.voiceId);
		const wrap = node("section", "voice-tool-comparison");
		wrap.append(node("h3", "voice-tool-subtitle", "원본과 결과 비교"));
		const grid = node("div", "voice-tool-comparison-grid");
		[
			[
				"원본",
				sourceTitle(section.source),
				section.source
					? "로컬 미리보기는 공통 입력 모듈에서만 재생합니다."
					: "원본을 먼저 준비해 주세요.",
			],
			[
				"대상",
				selected ? `${selected.name} · ElevenLabs` : "대상 성우 미선택",
				"모델: eleven_multilingual_sts_v2",
			],
			[
				"결과",
				section.status === "success" ? "시연 완료" : "변환 전",
				"실제 출력 파일이 없어 플레이어와 다운로드는 비활성화됩니다.",
			],
		].forEach(([title, value, detail]) => {
			const item = node("div", "voice-tool-comparison-item");
			item.append(
				node("span", "voice-tool-label", title),
				node("strong", "", value),
				node("p", "voice-tool-muted", detail),
			);
			if (title === "결과") {
				const player = document.createElement("button");
				player.type = "button";
				player.disabled = true;
				player.className = "button button-secondary";
				player.textContent = "결과 재생 불가";
				item.append(player);
			}
			grid.append(item);
		});
		wrap.append(grid);
		return wrap;
	}

	const DESIGN_OPTIONS = {
		gender: [
			["female", "여성"],
			["male", "남성"],
			["any", "지정 안 함"],
		],
		age: [
			["young", "청년"],
			["middle", "중년"],
			["old", "노년"],
		],
		accent: [
			["ko", "한국어 표준"],
			["us", "미국식 영어"],
			["uk", "영국식 영어"],
			["au", "호주식 영어"],
			["in", "인도식 영어"],
		],
		emotion: [
			["calm", "차분·진중"],
			["bright", "밝음"],
			["passion", "열정"],
			["sad", "슬픔"],
			["firm", "단호"],
			["whisper", "속삭임"],
		],
		pronunciation: [
			["standard", "표준 발음"],
			["foreign", "외국인 톤"],
		],
	};
	const DESIGN_STYLES = [
		[
			"다큐 내레이터",
			"다큐멘터리 내레이터처럼 낮고 안정적인 호흡으로 또박또박 전달하는 목소리",
		],
		["일상 브이로그", "일상 브이로그처럼 가볍고 친근하게 말을 거는 목소리"],
		["뉴스 앵커", "뉴스 앵커처럼 발음이 정확하고 속도가 일정한 목소리"],
		["심야 라디오", "심야 라디오 진행자처럼 낮고 부드럽게 이야기하는 목소리"],
		[
			"미스터리 스토리",
			"미스터리 이야기를 들려주듯 뜸을 들이며 긴장감을 만드는 목소리",
		],
		["테크 리뷰", "테크 리뷰어처럼 명료하고 빠르게 핵심을 짚는 목소리"],
		[
			"오디오북 낭독",
			"오디오북 낭독자처럼 장면과 인물을 차분하게 살려 읽는 목소리",
		],
		["게임 캐스터", "게임 캐스터처럼 에너지 있게 상황을 중계하는 목소리"],
	];
	const DESIGN_MIN = 20;
	const DESIGN_MAX = 1000;
	const SAMPLE_RECOMMENDED = 100;
	const optionLabel = (key, value) =>
		DESIGN_OPTIONS[key].find(([id]) => id === value)?.[1] || "";
	const designKey = (s) =>
		JSON.stringify([
			s.gender,
			s.age,
			s.accent,
			s.accentStrength,
			s.emotion,
			s.pronunciation,
			s.speed,
			s.pitch,
			s.description.trim(),
			s.sample.trim(),
		]);
	const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
	const formatSpeed = (value) => `${Number(value).toFixed(2)}배`;
	const formatPitch = (value) => (value > 0 ? `+${value}` : String(value));

	function designCandidates(s) {
		const age = optionLabel("age", s.age);
		const who =
			s.gender === "any"
				? `${age} 목소리`
				: `${age} ${optionLabel("gender", s.gender)}`;
		const accent =
			s.accent === "ko"
				? "한국어 표준 억양"
				: `${optionLabel("accent", s.accent)} 억양 ${s.accentStrength}%`;
		const emotion = optionLabel("emotion", s.emotion);
		const clue = s.description
			.trim()
			.split(/[.,!?\n]/)[0]
			.trim()
			.slice(0, 48);
		return [
			["A", "입력 그대로", 0, 0, `${emotion} 느낌을 그대로 살린 ${who}`],
			[
				"B",
				"낮고 느긋하게",
				-1,
				-0.05,
				`같은 묘사를 한 단계 낮고 느긋하게 푼 ${who}`,
			],
			[
				"C",
				"밝고 경쾌하게",
				1,
				0.05,
				`같은 묘사를 한 단계 밝고 경쾌하게 푼 ${who}`,
			],
		].map(([letter, variant, pitchStep, speedStep, line]) => ({
			letter,
			variant,
			line: `${line} · ${accent} · ${optionLabel("pronunciation", s.pronunciation)}`,
			clue,
			pitch: clamp(s.pitch + pitchStep, -6, 6),
			speed: clamp(Math.round((s.speed + speedStep) * 100) / 100, 0.7, 1.3),
			name: `디자인 ${letter} · ${who}`,
		}));
	}

	function designEstimate(s) {
		const estimate = window.TTSStudio?.estimate;
		if (typeof estimate !== "function") return "예상 사용량은 연결 후 확인";
		const text = s.sample.trim();
		if (!text)
			return "미리 들을 대사를 넣으면 후보당 예상 길이를 계산합니다. 예상 사용량은 연결 후 확인합니다.";
		const voiceId = voices().find(
			(voice) => voice.provider === "ElevenLabs",
		)?.id;
		const result = estimate(text, { voiceId, speed: s.speed, pauseAfter: 0 });
		if (!result) return "예상 사용량은 연결 후 확인";
		return `예상: 미리 들을 대사 ${result.usageLabel} · 후보당 약 ${result.seconds}초 × 3개.${result.basis ? ` 근거: ${result.basis}.` : ""} Voice Design 요청의 과금 방식은 연결 후 확인합니다.`;
	}

	function logDesign(s) {
		const log = window.TTSStudio?.logUsage;
		if (typeof log !== "function") return;
		const length = s.sample.trim().length;
		log({
			kind: "design",
			provider: "ElevenLabs",
			model: "eleven_multilingual_ttv_v2",
			units: length,
			unitLabel: "자",
			usageLabel: length
				? `미리 들을 대사 ${length}자 · 후보 3개`
				: "후보 3개 · 대사 없음",
			note: "보이스 디자인 시연 · 실제 청구 아님",
		});
	}

	function design(host) {
		const s = state.design;
		host.replaceChildren();
		const panel = node("section", "voice-tool voice-tool-design");
		panel.append(
			node("h2", "voice-tool-title", "보이스 디자인"),
			node(
				"p",
				"voice-tool-lead",
				"성별·연령·억양·감정과 목소리 묘사로 새 목소리 후보 3개를 만드는 흐름을 시연합니다. 실제 공급자 요청, 음성 생성, 과금은 하지 않습니다.",
			),
			node(
				"p",
				"voice-design-provider",
				"대상: ElevenLabs Voice Design(후보 미리듣기 생성 → 고른 후보 저장). Fish Audio는 요금표에서 Voice Design 단가만 확인해 지원 확인 전, Typecast도 지원 확인 전입니다.",
			),
		);
		let lastStale = false;
		const sync = () => {
			const descLength = description.value.trim().length;
			descCount.textContent = `${description.value.length.toLocaleString()} / ${DESIGN_MAX.toLocaleString()}자 · ${descLength >= DESIGN_MIN ? "최소 분량 충족" : `${DESIGN_MIN}자 이상 필요`}`;
			const sampleLength = sample.value.trim().length;
			sampleCount.textContent =
				sampleLength >= SAMPLE_RECOMMENDED
					? `${sampleLength}자 · 권장 분량 충족`
					: `${sampleLength}자 · ${SAMPLE_RECOMMENDED}자 이상 권장${sampleLength ? "(후보 차이를 듣기에 짧아요)" : ""}`;
			const korean = s.accent === "ko";
			const reason = korean
				? "한국어 표준 억양에는 강도를 적용하지 않습니다. 다른 억양을 고르면 조절할 수 있어요."
				: "억양이 얼마나 드러날지 정합니다.";
			strength.input.disabled = korean;
			strength.input.title = korean ? reason : "";
			strengthReason.textContent = reason;
			estimate.textContent = designEstimate(s);
			const stale = s.results.length > 0 && designKey(s) !== s.resultKey;
			if (s.status !== "loading" && stale !== lastStale) renderResults();
		};
		const segmented = (key, legendText) => {
			const set = node("fieldset", "voice-design-group");
			set.append(node("legend", "voice-tool-label", legendText));
			const row = node("div", "voice-design-chips");
			DESIGN_OPTIONS[key].forEach(([value, label]) => {
				const chip = button(label, "filter-chip voice-design-chip");
				chip.setAttribute("aria-pressed", String(s[key] === value));
				chip.addEventListener("click", () => {
					s[key] = value;
					row.querySelectorAll("button").forEach((item) => {
						item.setAttribute("aria-pressed", String(item === chip));
					});
					sync();
				});
				row.append(chip);
			});
			set.append(row);
			return set;
		};
		const range = (key, id, labelText, limits, format) => {
			const wrap = node("div", "voice-tool-field");
			const label = node("label", "voice-tool-label", labelText);
			label.htmlFor = id;
			const row = node("div", "range-control");
			const input = document.createElement("input");
			Object.assign(input, { type: "range", id, ...limits, value: s[key] });
			input.setAttribute("aria-valuetext", format(s[key]));
			const output = node("output", "", format(s[key]));
			output.setAttribute("for", id);
			input.addEventListener("input", () => {
				s[key] = Number(input.value);
				output.textContent = format(s[key]);
				input.setAttribute("aria-valuetext", format(s[key]));
				sync();
			});
			row.append(input, output);
			wrap.append(label, row);
			return { wrap, input };
		};
		const choices = node("div", "voice-design-choice-grid");
		choices.append(
			segmented("gender", "성별"),
			segmented("age", "연령대"),
			segmented("emotion", "감정"),
			segmented("pronunciation", "발음 스타일"),
		);
		const accent = document.createElement("select");
		DESIGN_OPTIONS.accent.forEach(([value, label]) => {
			const option = node("option", "", label);
			option.value = value;
			option.selected = s.accent === value;
			accent.append(option);
		});
		accent.addEventListener("change", () => {
			s.accent = accent.value;
			sync();
		});
		const strength = range(
			"accentStrength",
			"voice-design-accent-strength",
			"억양 강도",
			{ min: 0, max: 100, step: 10 },
			(value) => `${value}%`,
		);
		const strengthReason = node("p", "voice-tool-muted");
		strengthReason.id = "voice-design-accent-reason";
		strength.input.setAttribute("aria-describedby", strengthReason.id);
		strength.wrap.append(strengthReason);
		const tuning = node("div", "voice-tool-filter-grid voice-design-tuning");
		tuning.append(
			labelledInput("voice-design-accent", "억양", accent),
			strength.wrap,
			range(
				"speed",
				"voice-design-speed",
				"속도",
				{ min: 0.7, max: 1.3, step: 0.05 },
				formatSpeed,
			).wrap,
			range(
				"pitch",
				"voice-design-pitch",
				"피치",
				{ min: -6, max: 6, step: 1 },
				formatPitch,
			).wrap,
		);

		const description = document.createElement("textarea");
		description.rows = 4;
		description.maxLength = DESIGN_MAX;
		description.value = s.description;
		description.setAttribute("aria-required", "true");
		description.placeholder =
			"예: 30대 여성, 낮고 안정적인 목소리로 경제 소식을 또박또박 전하는 내레이터. 한국어나 영어로 적을 수 있어요.";
		const descCount = node("p", "voice-design-count");
		descCount.id = "voice-design-description-count";
		const descError = message("voice-design-description-error");
		description.setAttribute(
			"aria-describedby",
			`${descCount.id} ${descError.id}`,
		);
		description.addEventListener("input", () => {
			s.description = description.value;
			if (description.value.trim().length >= DESIGN_MIN) {
				descError.textContent = "";
				description.removeAttribute("aria-invalid");
			}
			sync();
		});
		const descField = labelledInput(
			"voice-design-description",
			`목소리 묘사 (필수, ${DESIGN_MIN}자 이상)`,
			description,
		);
		descField.append(descCount, descError);
		const appendStyle = (label, phrase) => {
			const before = description.value;
			const joiner = !before.trim()
				? ""
				: /\s$/.test(before)
					? ""
					: /[.!?]$/.test(before)
						? " "
						: ", ";
			const next = `${before}${joiner}${phrase}`;
			if (next.length > DESIGN_MAX) {
				descError.textContent = `묘사가 ${DESIGN_MAX.toLocaleString()}자를 넘어 ‘${label}’ 문장을 덧붙이지 못했어요. 묘사를 줄인 뒤 다시 눌러 주세요.`;
				return;
			}
			description.value = next;
			description.dispatchEvent(new Event("input"));
			notify(`‘${label}’ 문장을 묘사 끝에 덧붙였어요.`, {
				actionLabel: "되돌리기",
				onAction() {
					if (!description.isConnected || description.value !== next) return;
					description.value = before;
					description.dispatchEvent(new Event("input"));
					announce(`‘${label}’ 덧붙이기를 되돌렸어요.`);
				},
			});
		};
		const styles = node("div", "voice-design-styles");
		styles.setAttribute("role", "group");
		styles.setAttribute("aria-labelledby", "voice-design-styles-label");
		const stylesLabel = node(
			"p",
			"voice-tool-muted",
			"스타일 칩은 입력한 묘사를 지우지 않고 끝에 문장을 덧붙입니다.",
		);
		stylesLabel.id = "voice-design-styles-label";
		const styleRow = node("div", "voice-design-chips");
		DESIGN_STYLES.forEach(([label, phrase]) => {
			const chip = button("", "filter-chip voice-design-style");
			chip.append(icon("plus"), document.createTextNode(label));
			chip.setAttribute("aria-label", `${label} 문장 덧붙이기`);
			chip.addEventListener("click", () => appendStyle(label, phrase));
			styleRow.append(chip);
		});
		styles.append(stylesLabel, styleRow);

		const sample = document.createElement("textarea");
		sample.rows = 3;
		sample.maxLength = DESIGN_MAX;
		sample.value = s.sample;
		sample.placeholder =
			"예: 안녕하세요. 오늘은 이번 주 경제 소식을 세 가지로 정리해 드릴게요.";
		const sampleCount = node("p", "voice-design-count");
		sampleCount.id = "voice-design-sample-count";
		sample.setAttribute("aria-describedby", sampleCount.id);
		sample.addEventListener("input", () => {
			s.sample = sample.value;
			sync();
		});
		const sampleField = labelledInput(
			"voice-design-sample",
			"미리 들을 대사",
			sample,
		);
		sampleField.append(sampleCount);
		const estimate = node("p", "voice-design-estimate");
		estimate.id = "voice-design-estimate";
		const actions = node("div", "voice-tool-actions");
		const results = node("div", "voice-design-results");

		const statusLine = (text, extra = "") =>
			node("p", `voice-tool-status ${extra}`.trim(), text);
		const saveCandidate = (candidate) => {
			const add = window.TTSStudio?.addMyVoice;
			if (typeof add !== "function") {
				notify(
					"내 보이스 저장 연결이 아직 준비되지 않았습니다. 시연 후보는 이 화면에만 남아 있어요.",
				);
				return;
			}
			const id = add({
				name: candidate.name,
				provider: "ElevenLabs",
				origin: "design",
				note: `보이스 디자인 후보 ${candidate.letter} · ${candidate.line} · 시연(실제 음성 없음)`,
			});
			s.saved[candidate.letter] = id || true;
			renderResults();
			announce(`내 보이스에 저장했습니다: ${candidate.name} · 시연 항목`);
			results
				.querySelector(`[data-design-view="${candidate.letter}"]`)
				?.focus({ preventScroll: true });
		};
		const candidateCard = (candidate, stale) => {
			const card = node("article", "voice-design-candidate");
			const title = node(
				"h4",
				"",
				`후보 ${candidate.letter} · ${candidate.variant}`,
			);
			title.id = `voice-design-candidate-${candidate.letter}`;
			card.setAttribute("aria-labelledby", title.id);
			const tags = node("p", "voice-design-tags");
			tags.append(node("span", "tag", "시연 후보 — 실제 음성 없음"));
			if (stale)
				tags.append(node("span", "tag voice-design-stale", "이전 조건의 후보"));
			card.append(
				title,
				tags,
				node("p", "voice-design-line", candidate.line),
				node(
					"p",
					"voice-tool-muted",
					`${candidate.clue ? `묘사 반영: ‘${candidate.clue}’ · ` : ""}속도 ${formatSpeed(candidate.speed)} · 피치 ${formatPitch(candidate.pitch)}`,
				),
			);
			const row = node("div", "voice-tool-actions");
			const listen = button("", "button button-secondary");
			listen.append(icon("play"), document.createTextNode("듣기"));
			listen.disabled = true;
			listen.title = "시연 후보라 재생할 음성이 없습니다.";
			const reason = node(
				"span",
				"voice-tool-muted",
				"재생할 음성 없음 · 시연",
			);
			reason.id = `voice-design-listen-${candidate.letter}`;
			listen.setAttribute("aria-describedby", reason.id);
			row.append(listen);
			if (s.saved[candidate.letter]) {
				const view = button("", "button button-secondary");
				view.append(
					icon("arrow-up-right"),
					document.createTextNode("내 보이스에서 보기"),
				);
				view.dataset.designView = candidate.letter;
				view.addEventListener("click", () =>
					window.TTSStudio?.showView?.("mine"),
				);
				row.append(node("span", "voice-design-saved", "저장됨 · 시연"), view);
			} else {
				const save = button("", "button button-primary");
				save.append(icon("plus"), document.createTextNode("내 보이스로 저장"));
				save.addEventListener("click", () => saveCandidate(candidate));
				row.append(save);
			}
			card.append(row, reason);
			return card;
		};
		const renderResults = () => {
			results.replaceChildren();
			const stale = s.results.length > 0 && designKey(s) !== s.resultKey;
			lastStale = stale;
			if (s.status === "loading") {
				results.append(
					statusLine(
						"후보 3개를 준비하고 있습니다. 로컬 타이머만 쓰는 시연이며 공급자 요청은 없습니다.",
					),
				);
				return;
			}
			if (!s.results.length) {
				results.append(
					statusLine(
						`목소리 묘사를 ${DESIGN_MIN}자 이상 적은 뒤 후보를 만들어 주세요.`,
					),
				);
				return;
			}
			const heading = node(
				"h3",
				"voice-tool-subtitle",
				"디자인 후보 3개 · 시연",
			);
			heading.id = "voice-design-results-title";
			heading.tabIndex = -1;
			const list = node("div", "voice-design-candidates");
			s.results.forEach((candidate) => {
				list.append(candidateCard(candidate, stale));
			});
			results.append(
				heading,
				stale
					? statusLine(
							"입력이 바뀌었습니다. 아래는 이전 조건의 후보입니다. 다시 만들면 새 조건으로 바뀝니다.",
							"voice-design-stale-note",
						)
					: statusLine(
							"시연 후보라 실제 음성은 없습니다. 마음에 드는 설명을 내 보이스에 저장해 볼 수 있어요.",
						),
				list,
			);
		};
		const renderActions = () => {
			actions.replaceChildren();
			const run = button("", "button button-primary");
			run.append(
				icon("wand"),
				document.createTextNode(
					s.status === "loading"
						? "후보 만드는 중 · 시연"
						: "후보 3개 만들기 · 시연",
				),
			);
			run.dataset.voiceToolRun = "design";
			run.disabled = s.status === "loading";
			run.setAttribute("aria-describedby", estimate.id);
			run.addEventListener("click", start);
			actions.append(run);
			if (s.status !== "loading") return run;
			const stop = button("취소", "button button-secondary");
			stop.addEventListener("click", () => {
				cancel("design", s);
				renderActions().focus({ preventScroll: true });
				renderResults();
			});
			actions.append(stop);
			return stop;
		};
		const start = () => {
			const length = description.value.trim().length;
			if (length < DESIGN_MIN) {
				descError.textContent = `목소리 묘사를 ${DESIGN_MIN}자 이상 적어 주세요. 지금 ${length}자입니다.`;
				description.setAttribute("aria-invalid", "true");
				description.focus();
				return;
			}
			window.clearTimeout(timers.get("design"));
			const version = `${Date.now()}-design`;
			s.status = "loading";
			s.requestVersion = version;
			s.timerKey = "design";
			renderActions().focus({ preventScroll: true });
			renderResults();
			announce(
				"보이스 디자인 후보를 준비하고 있습니다. 시연이라 실제 요청은 없습니다.",
			);
			timers.set(
				"design",
				window.setTimeout(() => {
					if (s.requestVersion !== version) return;
					timers.delete("design");
					s.timerKey = null;
					s.requestVersion = null;
					s.results = designCandidates(s);
					s.resultKey = designKey(s);
					s.saved = {};
					s.status = "success";
					logDesign(s);
					renderActions();
					renderResults();
					results
						.querySelector("#voice-design-results-title")
						?.focus({ preventScroll: true });
					announce(
						"후보 3개가 준비됐습니다. 시연 후보라 실제 음성은 없습니다.",
					);
				}, 700),
			);
		};
		panel.append(
			choices,
			tuning,
			descField,
			styles,
			sampleField,
			estimate,
			actions,
			results,
		);
		host.append(panel);
		renderActions();
		renderResults();
		sync();
	}

	const RECOMMEND_SIGNALS = [
		{
			words: [
				"경제",
				"금리",
				"물가",
				"주가",
				"환율",
				"투자",
				"시장",
				"금융",
				"부동산",
				"달러",
			],
			traits: ["정보", "경제", "브리핑", "뉴스", "또렷", "신뢰"],
		},
		{
			words: ["뉴스", "발표", "보도", "속보", "정부", "기자", "공식"],
			traits: ["뉴스", "브리핑", "또렷", "선명", "신뢰"],
		},
		{
			words: ["설명", "방법", "이유", "살펴", "정리", "교육", "강의", "단계"],
			traits: ["설명", "교육", "정보", "따뜻"],
		},
		{
			words: ["역사", "다큐", "자연", "기록", "탐사", "문명"],
			traits: ["다큐", "중저음", "낮고", "안정", "내레이션"],
		},
		{
			words: ["일상", "여행", "친구", "맛집", "주말", "브이로그", "신나"],
			traits: ["밝은", "일상", "쇼츠", "친근", "활기"],
		},
		{
			words: ["마음", "기억", "위로", "조용", "편지", "그리움", "천천히"],
			traits: ["부드러운", "차분", "따뜻", "다감정", "내레이션"],
		},
	];

	function voiceTraits(voice) {
		return [
			voice.tone,
			...(Array.isArray(voice.tags) ? voice.tags : []),
			...(Array.isArray(voice.uses) ? voice.uses : []),
			...classificationLabels(voice, "categories"),
			...classificationLabels(voice, "types"),
		].filter((trait) => typeof trait === "string" && trait);
	}

	// ponytail: substring keyword table, swap for provider tags/embeddings when real voice metadata lands.
	function rankForParagraph(text, list) {
		const signals = RECOMMEND_SIGNALS.map((signal) => ({
			...signal,
			hits: signal.words.filter((word) => text.includes(word)),
		})).filter((signal) => signal.hits.length);
		return list
			.map((voice, index) => {
				const words = new Set();
				const traits = new Set();
				const own = voiceTraits(voice);
				signals.forEach((signal) => {
					const matched = own.filter((trait) =>
						signal.traits.some((key) => trait.includes(key)),
					);
					if (!matched.length) return;
					signal.hits.forEach((word) => {
						words.add(word);
					});
					matched.forEach((trait) => {
						traits.add(trait);
					});
				});
				return {
					voice,
					index,
					words: [...words],
					traits: [...traits],
					score: traits.size,
				};
			})
			.sort((a, b) => b.score - a.score || a.index - b.index);
	}

	function genderOf(voice) {
		const value = String(voice.gender || "");
		if (/^(f|여)/i.test(value)) return "female";
		if (/^(m|남)/i.test(value)) return "male";
		return "";
	}

	function openParagraphRecommend({
		text = "",
		currentVoiceId = "",
		onPick,
	} = {}) {
		document.querySelector(".voice-recommend-dialog")?.close();
		const opener = document.activeElement;
		const pool = voices().filter((voice) => voice.id !== currentVoiceId);
		const hasGender = pool.some((voice) => genderOf(voice));
		let filter = "all";
		const dialog = node("dialog", "dialog voice-recommend-dialog");
		dialog.setAttribute("aria-labelledby", "voice-recommend-title");
		const form = node("form");
		form.method = "dialog";
		const header = node("div", "dialog-header");
		const copy = node("div");
		const title = node("h2", "", "문단 성우 추천");
		title.id = "voice-recommend-title";
		copy.append(
			title,
			node(
				"p",
				"",
				"문단의 단어와 성우 톤·태그가 겹치는 정도로 고른 시연 추천입니다. 고르기만 해서는 사용량이 들지 않아요.",
			),
		);
		const close = button("", "icon-button");
		close.setAttribute("aria-label", "닫기");
		close.append(icon("close"));
		close.addEventListener("click", () => dialog.close());
		header.append(copy, close);
		const trimmed = text.trim();
		const excerpt = node(
			"p",
			"voice-recommend-excerpt",
			trimmed
				? `${trimmed.slice(0, 160)}${trimmed.length > 160 ? "…" : ""}`
				: "문단이 비어 있습니다.",
		);
		const summary = node("p", "voice-recommend-summary");
		summary.setAttribute("role", "status");
		const list = node("ol", "dialog-list voice-recommend-list");
		const renderList = () => {
			const scoped =
				filter === "all"
					? pool
					: pool.filter((voice) => genderOf(voice) === filter);
			const ranked = rankForParagraph(trimmed, scoped);
			const matched = ranked.filter((entry) => entry.score > 0).slice(0, 3);
			const picks = [
				...matched,
				...ranked
					.filter((entry) => entry.score === 0)
					.slice(0, 3 - matched.length),
			];
			summary.textContent = !picks.length
				? "이 조건에 맞는 성우가 없습니다."
				: matched.length === picks.length
					? "문단 단어와 성우 특징이 많이 겹치는 순서입니다."
					: `문단 단어와 특징이 겹치는 성우가 ${matched.length}명이라 나머지 ${picks.length - matched.length}명은 기본 추천으로 채웠어요.${picks.length < 3 ? ` 고를 수 있는 성우가 ${picks.length}명뿐입니다.` : ""}`;
			const used = new Set();
			list.replaceChildren(
				...picks.map((entry, index) => {
					const { voice } = entry;
					const item = node("li", "dialog-item voice-recommend-item");
					const body = node("div");
					const head = node("p", "voice-recommend-name");
					head.append(
						node("strong", "", `${index + 1}. ${voice.name}`),
						node("span", "meta-text", voice.provider),
					);
					if (entry.score)
						head.append(
							node("span", "tag tag-blue", `겹친 특징 ${entry.score}개`),
						);
					let reason = entry.score
						? `‘${entry.words.slice(0, 3).join("·")}’ 단어와 성우의 ‘${entry.traits.slice(0, 3).join("·")}’ 특징이 맞음`
						: `조건이 적어 기본 추천 · 톤 ‘${voice.tone || "정보 없음"}’`;
					if (used.has(reason)) reason += ` · 톤 ‘${voice.tone || voice.id}’`;
					used.add(reason);
					body.append(head, node("p", "", reason));
					const buttons = node("div", "dialog-item-actions");
					const listen = button("", "mini-button");
					listen.append(icon("play"), document.createTextNode("샘플 · 시연"));
					listen.setAttribute("aria-label", `${voice.name} 샘플 듣기 · 시연`);
					listen.addEventListener("click", () =>
						notify(
							`${voice.name} 샘플 듣기는 시연입니다. 실제 오디오는 연결 후 재생합니다.`,
						),
					);
					const apply = button("이 문단에 적용", "button button-primary");
					apply.setAttribute("aria-label", `${voice.name} 이 문단에 적용`);
					apply.autofocus = index === 0;
					apply.addEventListener("click", () => {
						onPick?.(voice.id);
						dialog.close();
					});
					buttons.append(listen, apply);
					item.append(body, buttons);
					return item;
				}),
			);
		};
		form.append(header, excerpt);
		if (hasGender) {
			const tabs = node("div", "voice-recommend-filter");
			tabs.setAttribute("role", "group");
			tabs.setAttribute("aria-label", "성별 필터");
			[
				["all", "전체"],
				["female", "여성"],
				["male", "남성"],
			].forEach(([value, label]) => {
				const chip = button(label, "filter-chip voice-design-chip");
				chip.setAttribute("aria-pressed", String(filter === value));
				chip.addEventListener("click", () => {
					filter = value;
					tabs.querySelectorAll("button").forEach((item) => {
						item.setAttribute("aria-pressed", String(item === chip));
					});
					renderList();
				});
				tabs.append(chip);
			});
			form.append(tabs);
		}
		form.append(summary, list);
		dialog.append(form);
		dialog.addEventListener("close", () => {
			dialog.remove();
			if (opener instanceof HTMLElement && opener.isConnected)
				opener.focus({ preventScroll: true });
		});
		document.body.append(dialog);
		renderList();
		dialog.showModal();
	}

	function leave() {
		for (const [key, timer] of timers) {
			window.clearTimeout(timer);
			timers.delete(key);
		}
		for (const [key, cleanup] of cleanups) {
			cleanup?.();
			cleanups.delete(key);
		}
		Object.values(state).forEach((section) => {
			if (section.status !== "loading") return;
			section.status = "idle";
			section.requestVersion = null;
			section.timerKey = null;
			section.retry = null;
		});
	}

	window.TTSVoiceTools = {
		renderRecommendation: recommendation,
		invalidateRecommendationForSourceChange() {
			if (state.recommend.mode !== "script") return;
			invalidate(state.recommend);
			if (recommendationHost?.isConnected) recommendation(recommendationHost);
		},
		renderDiscovery: discovery,
		renderChanger: changer,
		renderDesign: design,
		openParagraphRecommend,
		leave,
	};
})();
