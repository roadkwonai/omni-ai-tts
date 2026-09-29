(() => {
	let active = null;
	const tools = [
		["import", "대본 가져오기", "대본 준비"],
		["emotion", "감정 자동화", "대본 준비"],
		["recommend", "맞춤 성우 추천", "성우 선택"],
		["discover", "목소리 찾기", "성우 선택"],
		["design", "보이스 디자인", "성우 선택"],
		["clone", "내 목소리 복제", "내 음성 활용"],
		["changer", "보이스 체인저", "내 음성 활용"],
	];
	const leave = () => {
		window.TTSVoiceTools?.leave();
		window.TTSScriptTools?.leave();
		window.TTSPrototypeMedia?.stopAll();
	};
	const syncNavigation = () => {
		for (const button of document.querySelectorAll("[data-production-tool]")) {
			if (button.dataset.productionTool === "clone") continue;
			button.setAttribute(
				"aria-expanded",
				String(button.dataset.productionTool === active),
			);
		}
	};
	const close = () => {
		leave();
		active = null;
		document.querySelector("#production-tool-workspace").hidden = true;
		syncNavigation();
		document.querySelector("#source-tab").click();
		document.querySelector("#script-editor").focus();
	};
	const open = (id) => {
		const tool = tools.find((t) => t[0] === id);
		if (!tool) return;
		leave();
		if (id === "clone") {
			active = null;
			document.querySelector("#production-tool-workspace").hidden = true;
			syncNavigation();
			window.TTSStudio?.showView("mine");
			return;
		}
		active = id;
		const host = document.querySelector("#studio-tools-content");
		host.replaceChildren();
		const panel = document.createElement("section");
		panel.className = "production-tool-content";
		panel.setAttribute("aria-label", tool[1]);
		host.append(panel);
		if (id === "recommend") window.TTSVoiceTools?.renderRecommendation(panel);
		if (id === "discover") window.TTSVoiceTools?.renderDiscovery(panel);
		if (id === "changer") window.TTSVoiceTools?.renderChanger(panel);
		if (id === "design") window.TTSVoiceTools?.renderDesign(panel);
		if (id === "import") window.TTSScriptTools?.renderImporter(panel);
		if (id === "emotion") window.TTSScriptTools?.renderEmotion(panel);
		document.querySelector("#production-tool-workspace").hidden = false;
		syncNavigation();
		const heading = panel.querySelector("h2");
		if (heading) {
			heading.tabIndex = -1;
			heading.focus({ preventScroll: true });
		}
		document.querySelector("#studio-tools").scrollIntoView({ block: "start" });
	};
	const init = () => {
		const nav = document.querySelector("#production-tools-nav");
		nav.replaceChildren();
		for (const group of new Set(tools.map((tool) => tool[2]))) {
			const fieldset = document.createElement("fieldset");
			const legend = document.createElement("legend");
			legend.textContent = group;
			fieldset.append(legend);
			for (const [id, label, category] of tools) {
				if (category !== group) continue;
				const button = document.createElement(id === "clone" ? "a" : "button");
				if (id === "clone") {
					button.href = "#mine";
					button.setAttribute(
						"aria-label",
						"내 목소리 복제 · 내 보이스로 이동",
					);
				} else button.type = "button";
				button.className = "button button-secondary";
				button.textContent = label;
				button.dataset.productionTool = id;
				if (id !== "clone")
					button.setAttribute("aria-controls", "production-tool-workspace");
				button.addEventListener("click", (event) => {
					event.preventDefault();
					open(id);
				});
				fieldset.append(button);
			}
			if (group === "내 음성 활용") {
				const note = document.createElement("small");
				note.className = "production-tools-note";
				note.textContent = "목소리 복제는 내 보이스 화면에서 관리합니다.";
				fieldset.append(note);
			}
			nav.append(fieldset);
		}
		syncNavigation();
		document
			.querySelector("#close-production-tool")
			.addEventListener("click", close);
	};
	window.TTSStudioTools = { init, leave, open };
})();
