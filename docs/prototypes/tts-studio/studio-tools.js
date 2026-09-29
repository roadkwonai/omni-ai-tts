(() => {
	const STORE_KEY = "tts-pilot.prototype.tool-rail.v1";
	const SUBTITLE = "시연 · 실제 요청 없음";
	const ROLE_REASON = "화자가 있는 대본에서 쓸 수 있어요";
	const NS = "http://www.w3.org/2000/svg";
	// [id, 이름, 아이콘 경로들, 도움말, 도구 드로어를 여는지(패널 도구)]
	const tools = [
		[
			"recommend",
			"맞춤 성우 추천",
			["M12 3l2.4 5.6L20 9l-4.2 3.9L17 19l-5-3-5 3 1.2-6.1L4 9l5.6-.4z"],
			"대본이나 직접 쓴 설명에 어울리는 성우를 최대 3명 비교해요. 지금은 규칙으로 고른 예시이고, 실제 AI 분석이나 요청은 하지 않아요.",
		],
		[
			"discover",
			"목소리 찾기",
			["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M20 20l-4-4"],
			"이 기기의 음성 파일이나 HTTPS 주소를 넣으면 비슷한 성우 후보를 보여 줘요. 파일은 서버로 보내지 않고, 화자가 누구인지 판별하지 않아요. 시연이에요.",
		],
		[
			"design",
			"보이스 디자인",
			["m15 4 5 5M4 20l12-12M6 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"],
			"성별·나이·분위기를 골라 새 목소리 후보 3개를 만드는 흐름을 보여 줘요. 실제로 목소리를 만들거나 과금되지 않는 시연이에요.",
		],
		[
			"changer",
			"보이스 체인저",
			["M4 12v2M8 8v8M12 5v14M16 8v8M20 10v4"],
			"원본 음성을 ElevenLabs 성우 목소리로 바꾸는 입력과 진행 상태를 보여 줘요. 변환은 하지 않아서 결과 재생과 내려받기는 없어요.",
		],
		[
			"clone",
			"내 목소리 복제",
			[
				"M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3z",
				"M6 11a6 6 0 0 0 12 0",
				"M12 17v3",
			],
			"내 보이스 화면으로 이동해요. 동의와 원본을 확인하는 단계까지 시연하고 실제 클론은 만들지 않아요.",
		],
		[
			"roles",
			"역할별 성우 배정",
			[
				"M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
				"M3 19a6 6 0 0 1 12 0",
				"M16 5a3 3 0 0 1 0 6",
				"M18 14a6 6 0 0 1 3 5",
			],
			"대본의 화자마다 성우를 한 번에 정해요. '이름: 대사' 형식처럼 화자가 나뉜 문단이 있을 때 쓸 수 있어요.",
		],
	];
	const menuOnly = [
		[
			"import",
			"대본 가져오기",
			["M12 4v11", "M8 11l4 4 4-4", "M5 19h14"],
			"붙여넣거나 TXT·CSV·SRT·DOCX 파일을 읽어 화자와 성우를 정한 뒤 문단으로 넣어요. 파일은 이 브라우저 안에서만 읽어요.",
		],
		[
			"emotion",
			"감정 자동화",
			[
				"M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
				"M9 10h.01",
				"M15 10h.01",
				"M9 14.5c1.5 1.5 4.5 1.5 6 0",
			],
			"문단마다 어울리는 감정을 규칙으로 제안해요. 고쳐서 적용해도 원문은 바뀌지 않아요. 시연이에요.",
		],
	];
	const panelRenderers = {
		recommend: (p) => window.TTSVoiceTools?.renderRecommendation(p),
		discover: (p) => window.TTSVoiceTools?.renderDiscovery(p),
		design: (p) => window.TTSVoiceTools?.renderDesign(p),
		changer: (p) => window.TTSVoiceTools?.renderChanger(p),
		import: (p) => window.TTSScriptTools?.renderImporter(p),
		emotion: (p) => window.TTSScriptTools?.renderEmotion(p),
	};
	const nameOf = (id) => [...tools, ...menuOnly].find((t) => t[0] === id)?.[1];
	let returnTarget = null;
	let seq = 0;

	const leave = () => {
		window.TTSVoiceTools?.leave();
		window.TTSScriptTools?.leave();
		window.TTSPrototypeMedia?.stopAll();
	};
	const rolesUsable = () =>
		(window.TTSParagraphs?.roleStats?.().roles ?? 0) > 0;

	const icon = (paths) => {
		const svg = document.createElementNS(NS, "svg");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("aria-hidden", "true");
		svg.setAttribute("focusable", "false");
		for (const d of paths) {
			const path = document.createElementNS(NS, "path");
			path.setAttribute("d", d);
			svg.append(path);
		}
		return svg;
	};

	// 팝오버는 top layer에 뜨므로 ? 버튼 기준으로 좌표를 직접 준다.
	const placePopover = (pop, anchor) => {
		const r = anchor.getBoundingClientRect();
		const width = Math.min(240, window.innerWidth - 16);
		pop.style.width = `${width}px`;
		pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - width - 8))}px`;
		pop.style.top = `${r.bottom + 6}px`;
	};

	const tile = ([id, label, paths, help], prefix, onPick) => {
		const wrap = document.createElement("div");
		wrap.className = "tool-tile";
		wrap.dataset.tool = id;
		const main = document.createElement("button");
		main.type = "button";
		main.className = "tool-tile-main";
		main.append(
			icon(paths),
			Object.assign(document.createElement("span"), { textContent: label }),
		);
		main.addEventListener("click", () => onPick(id, main));
		const popId = `${prefix}-help-${id}-${++seq}`;
		const help$ = document.createElement("button");
		help$.type = "button";
		help$.className = "tool-tile-help";
		help$.textContent = "?";
		help$.setAttribute("aria-label", `${label} 설명`);
		help$.setAttribute("popovertarget", popId);
		const pop = document.createElement("div");
		pop.id = popId;
		pop.className = "tool-tile-pop";
		pop.setAttribute("popover", "auto");
		const title = document.createElement("strong");
		title.textContent = label;
		const text = document.createElement("p");
		text.textContent = help;
		pop.append(title, text);
		pop.addEventListener("beforetoggle", (event) => {
			if (event.newState === "open") placePopover(pop, help$);
		});
		wrap.append(main, help$, pop);
		return wrap;
	};

	// 타일 목록. 레일과 메뉴가 같이 쓴다.
	const buildGrid = (list, prefix, onPick) => {
		const grid = document.createElement("div");
		grid.className = "tool-tile-grid";
		for (const entry of list) grid.append(tile(entry, prefix, onPick));
		const note = document.createElement("p");
		note.className = "tool-tile-note";
		note.id = `${prefix}-roles-note`;
		note.textContent = ROLE_REASON;
		const frag = document.createDocumentFragment();
		frag.append(grid, note);
		return frag;
	};
	const syncRoles = (scope) => {
		const usable = rolesUsable();
		for (const wrap of scope.querySelectorAll(
			'.tool-tile[data-tool="roles"]',
		)) {
			const main = wrap.querySelector(".tool-tile-main");
			const note = wrap.parentElement.nextElementSibling;
			if (usable) {
				main.removeAttribute("aria-disabled");
				main.removeAttribute("aria-describedby");
			} else {
				main.setAttribute("aria-disabled", "true");
				if (note) main.setAttribute("aria-describedby", note.id);
			}
			if (note?.classList.contains("tool-tile-note")) note.hidden = usable;
		}
	};

	const pick = (id, trigger) => {
		if (id === "clone") {
			window.TTSStudio?.closeDrawer?.();
			window.TTSStudio?.showView("mine");
			return;
		}
		if (id === "roles") {
			if (!rolesUsable()) {
				window.TTSStudio?.announce?.(ROLE_REASON);
				return;
			}
			window.TTSStudio?.closeDrawer?.();
			window.TTSParagraphs?.openRoleDialog?.(window.TTSStudio);
			return;
		}
		open(id, trigger);
	};

	function open(id, trigger) {
		const render = panelRenderers[id];
		const studio = window.TTSStudio;
		if (!render || !studio?.openDrawer) return;
		leave();
		studio.openDrawer({
			title: nameOf(id),
			subtitle: SUBTITLE,
			returnFocus: returnTarget?.isConnected
				? returnTarget
				: (trigger ?? document.activeElement),
			render: (body) => {
				const panel = document.createElement("section");
				panel.className = "production-tool-content";
				panel.setAttribute("aria-label", nameOf(id));
				body.append(panel);
				render(panel);
			},
			onClose: leave,
		});
	}

	function openMenu(trigger) {
		const studio = window.TTSStudio;
		if (!studio?.openDrawer) return;
		returnTarget = trigger ?? document.activeElement;
		const drawer = studio.openDrawer({
			title: "제작 도구",
			subtitle: SUBTITLE,
			returnFocus: returnTarget,
			render: (body) => {
				const host = document.createElement("div");
				host.className = "tool-menu";
				host.append(
					buildGrid([...menuOnly, ...tools], "menu", (id, btn) =>
						pick(id, btn),
					),
				);
				body.append(host);
				syncRoles(host);
			},
			onClose: () => {
				returnTarget = null;
			},
		});
		return drawer;
	}

	let railRoot = null;
	const refresh = () => {
		if (railRoot?.isConnected) syncRoles(railRoot);
	};

	const readCollapsed = () => {
		try {
			return localStorage.getItem(STORE_KEY) === "collapsed";
		} catch {
			return false;
		}
	};
	const saveCollapsed = (value) => {
		try {
			localStorage.setItem(STORE_KEY, value ? "collapsed" : "open");
		} catch {
			// 저장할 수 없으면 이번 화면에서만 기억한다.
		}
	};

	const init = () => {
		const rail = document.querySelector("#tool-rail");
		if (!rail) return;
		railRoot = rail;
		rail.replaceChildren();
		const head = document.createElement("div");
		head.className = "tool-rail-head";
		const title = document.createElement("h2");
		title.id = "tool-rail-title";
		title.textContent = "AI 보이스 도구";
		const toggle = document.createElement("button");
		toggle.type = "button";
		toggle.className = "tool-rail-toggle";
		toggle.setAttribute("aria-controls", "tool-rail-body");
		toggle.setAttribute("aria-label", "AI 보이스 도구 접기");
		const body = document.createElement("div");
		body.id = "tool-rail-body";
		body.append(
			buildGrid(tools, "rail", (id, btn) => {
				returnTarget = null;
				pick(id, btn);
			}),
		);
		const apply = (collapsed) => {
			body.hidden = collapsed;
			toggle.setAttribute("aria-expanded", String(!collapsed));
			toggle.setAttribute(
				"aria-label",
				collapsed ? "AI 보이스 도구 펼치기" : "AI 보이스 도구 접기",
			);
			toggle.dataset.collapsed = String(collapsed);
			if (!collapsed) refresh();
		};
		toggle.append(icon(["M6 9l6 6 6-6"]));
		toggle.addEventListener("click", () => {
			const collapsed = !body.hidden;
			apply(collapsed);
			saveCollapsed(collapsed);
		});
		head.append(title, toggle);
		rail.setAttribute("aria-labelledby", "tool-rail-title");
		rail.append(head, body);
		apply(readCollapsed());
		syncRoles(rail);
		// 좁은 화면에서 숨겨졌다가 다시 보일 때 역할 상태를 맞춘다.
		if ("IntersectionObserver" in window)
			new IntersectionObserver((entries) => {
				if (entries.some((e) => e.isIntersecting)) refresh();
			}).observe(rail);
	};

	window.TTSStudioTools = { init, leave, open, openMenu, refresh };
})();
