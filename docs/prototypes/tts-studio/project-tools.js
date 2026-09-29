(() => {
	// 한글 받침으로 목적격 조사를 고른다. 한글이 아니면 병기한다.
	const objectParticle = (word) => {
		const code = String(word).trim().slice(-1).charCodeAt(0);
		if (code >= 0xac00 && code <= 0xd7a3)
			return (code - 0xac00) % 28 ? "을" : "를";
		return "을(를)";
	};
	const PROJECTS_KEY = "tts-pilot.prototype.projects.v1";
	const DRAFT_KEY = "tts-pilot.prototype.draft.v1";
	const THEME_KEY = "tts-pilot.prototype.theme.v1";
	let host = null;
	let currentId = null;
	let savedSig = "";
	let draftTimer = 0;
	let heldDraft = null;

	const $ = (selector, parent = document) => parent.querySelector(selector);
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
	const read = (key, fallback) => {
		try {
			const raw = localStorage.getItem(key);
			return { ok: true, value: raw === null ? fallback : JSON.parse(raw) };
		} catch {
			return { ok: false, value: fallback };
		}
	};
	const write = (key, value) => {
		try {
			if (value === null) localStorage.removeItem(key);
			else localStorage.setItem(key, JSON.stringify(value));
			return true;
		} catch {
			return false;
		}
	};
	const validWork = (item) =>
		item &&
		typeof item === "object" &&
		typeof item.sourceText === "string" &&
		(item.segments === null || Array.isArray(item.segments));
	const sig = (work) =>
		JSON.stringify([
			work.title,
			work.sourceText,
			work.segments?.length ? work.segments : null,
			work.voiceId,
			work.modelId,
		]);
	const when = (iso) =>
		new Date(iso).toLocaleString("ko-KR", {
			dateStyle: "medium",
			timeStyle: "short",
		});
	// 한 덩어리로 저장된 예전 작업은 문단 1개로 불러온다.
	const paragraphLabel = (work) => `문단 ${work.segments?.length || 1}개`;
	const mainVoice = (work) => {
		const counts = new Map();
		for (const part of work.segments || [])
			counts.set(part.voiceId, (counts.get(part.voiceId) || 0) + 1);
		const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || work.voiceId;
		return host.bridge.getVoice(top)?.name || "찾을 수 없는 성우";
	};
	const listProjects = () => {
		const { ok, value } = read(PROJECTS_KEY, []);
		return {
			ok: ok && Array.isArray(value),
			items: Array.isArray(value)
				? value.filter((item) => validWork(item) && item.id)
				: [],
		};
	};
	const isDirty = () => sig(host.snapshot()) !== savedSig;
	const refreshProjectsView = (focusSelector) => {
		const view = $("#projects-view");
		if (!view || view.hidden) return;
		renderProjects(view);
		if (focusSelector) $(focusSelector, view)?.focus();
	};

	const setBaseline = (baseline) => {
		savedSig = baseline ?? sig(host.snapshot());
		window.clearTimeout(draftTimer);
		if (!isDirty()) write(DRAFT_KEY, null);
		noteChange();
	};
	const writeDraft = () => {
		const work = host.snapshot();
		const current = sig(work);
		if (current === savedSig || current === sig(host.example)) {
			write(DRAFT_KEY, null);
			return;
		}
		const savedAt = new Date().toISOString();
		if (!write(DRAFT_KEY, { ...work, projectId: currentId, savedAt })) {
			host.setSaveStatus("error", "저장 안 됨 · 임시 저장 실패");
			return;
		}
		host.setSaveStatus(
			"unsaved",
			`저장 안 됨 · 임시 저장 ${new Date(savedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`,
		);
	};
	const noteChange = () => {
		if (!host) return;
		window.clearTimeout(draftTimer);
		if (!isDirty()) {
			host.setSaveStatus(
				currentId ? "saved" : "idle",
				currentId ? "프로젝트 저장됨" : "저장 전",
			);
			return;
		}
		if (heldDraft) {
			host.setSaveStatus("unsaved", "저장 안 됨 · 임시 저장 보류");
			return;
		}
		host.setSaveStatus("unsaved", "저장 안 됨");
		draftTimer = window.setTimeout(writeDraft, 800);
	};

	const saveProject = () => {
		const work = host.snapshot();
		const { ok, items } = listProjects();
		const existing = currentId && items.find((item) => item.id === currentId);
		const project = {
			...work,
			id: existing ? currentId : `project-${Date.now().toString(36)}`,
			updatedAt: new Date().toISOString(),
		};
		const next = existing
			? items.map((item) => (item.id === currentId ? project : item))
			: [project, ...items];
		if (!ok || !write(PROJECTS_KEY, next)) {
			host.setSaveStatus("error", "프로젝트 저장 실패");
			host.bridge.toast(
				"브라우저 저장소를 쓸 수 없어 저장하지 못했어요. 저장 공간이나 브라우저 설정을 확인해 주세요.",
			);
			return false;
		}
		currentId = project.id;
		heldDraft = null;
		$("#draft-notice")?.remove();
		setBaseline();
		host.bridge.toast(
			`‘${project.title}’ 프로젝트를 이 브라우저에 저장했어요.`,
		);
		refreshProjectsView();
		return true;
	};
	const openWork = (work, projectId, message, baseline) => {
		host.restore(work);
		currentId = projectId;
		heldDraft = null;
		$("#draft-notice")?.remove();
		setBaseline(baseline);
		host.bridge.showView("studio");
		history.replaceState(null, "", "#studio");
		host.bridge.announce(message);
	};
	const loadDraft = (draft) => {
		const project = listProjects().items.find(
			(item) => item.id === draft.projectId,
		);
		openWork(
			draft,
			project ? project.id : null,
			"임시 작업을 불러왔어요. 아직 프로젝트에 저장하지 않은 상태예요.",
			project ? sig(project) : sig(host.example),
		);
	};
	const confirmLeave = async (title, discardLabel) => {
		if (!isDirty()) return true;
		const choice = await host.bridge.choose({
			title,
			message:
				"지금 작업에 저장하지 않은 변경이 있어요. 저장하지 않으면 이 변경은 사라져요.",
			actions: [
				{ label: "취소", value: "cancel" },
				{ label: discardLabel, value: "discard", variant: "danger" },
				{ label: "저장 후 계속", value: "save", variant: "primary" },
			],
		});
		if (choice === "save") return saveProject();
		return choice === "discard";
	};
	const startNew = async () => {
		const choice = await host.bridge.choose({
			title: "새로 시작할까요?",
			message:
				"지금 작업을 비우고 빈 대본으로 시작해요. 저장하지 않으면 현재 작업은 사라져요.",
			actions: [
				{ label: "취소", value: "cancel" },
				{ label: "저장 없이 새로 시작", value: "discard", variant: "danger" },
				{ label: "저장 후 새로 시작", value: "save", variant: "primary" },
			],
		});
		if (choice === "cancel" || (choice === "save" && !saveProject())) return;
		const current = host.snapshot();
		openWork(
			{
				title: "새 작업",
				sourceText: "",
				segments: null,
				voiceId: current.voiceId,
				modelId: current.modelId,
			},
			null,
			"새 작업을 시작했어요. 문단 카드에 대본을 입력해 주세요.",
		);
		$("#segment-plan textarea")?.focus();
	};

	const renameInline = (row, project) => {
		const title = $(".project-title", row);
		const form = el("div", "project-rename");
		const input = el("input", "project-rename-input");
		input.value = project.title;
		input.maxLength = 80;
		input.setAttribute("aria-label", `${project.title} 새 이름`);
		const save = button("저장", "mini-button");
		const cancel = button("취소", "mini-button");
		const finish = (commit) => {
			const name = input.value.trim();
			if (commit && !name) {
				host.bridge.toast("프로젝트 이름을 입력해 주세요.");
				input.focus();
				return;
			}
			if (commit && name !== project.title) {
				const { ok, items } = listProjects();
				const next = items.map((item) =>
					item.id === project.id
						? { ...item, title: name, updatedAt: new Date().toISOString() }
						: item,
				);
				if (!ok || !write(PROJECTS_KEY, next)) {
					host.bridge.toast("저장소를 쓸 수 없어 이름을 바꾸지 못했어요.");
					return;
				}
				if (project.id === currentId) {
					host.setTitle(name);
					savedSig = sig(host.snapshot());
					noteChange();
				}
				host.bridge.announce(`프로젝트 이름을 ‘${name}’으로 바꿨어요.`);
			}
			refreshProjectsView(`[data-rename="${project.id}"]`);
		};
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				finish(true);
			}
			if (event.key === "Escape") {
				event.preventDefault();
				finish(false);
			}
		});
		save.addEventListener("click", () => finish(true));
		cancel.addEventListener("click", () => finish(false));
		form.append(input, save, cancel);
		title.replaceWith(form);
		input.focus();
		input.select();
	};
	const renderProjects = (view) => {
		view.replaceChildren();
		const header = el("header", "page-header");
		const copy = el("div");
		const heading = el("h1", "", "프로젝트");
		heading.id = "projects-title";
		copy.append(
			heading,
			el(
				"p",
				"",
				"작업을 이 브라우저에 저장하고 다시 열어요. 대본·문단·성우·모델만 저장하고 음성 파일과 키는 저장하지 않습니다.",
			),
		);
		const actions = el("div", "project-header-actions");
		const saveCurrent = button(
			"현재 작업 저장",
			"button button-secondary",
			"save",
		);
		saveCurrent.addEventListener("click", saveProject);
		const create = button("새 프로젝트", "button button-primary", "plus");
		create.addEventListener("click", startNew);
		actions.append(saveCurrent, create);
		header.append(copy, actions);
		const content = el("div", "page-content");
		content.append(
			el(
				"p",
				"notice",
				"보관 기간은 미정(P1-02)입니다. 지금은 이 브라우저의 로컬 저장소에만 남고, 브라우저 데이터를 지우면 함께 사라져요.",
			),
		);
		const { ok, items } = listProjects();
		if (!ok) {
			const box = el("div", "empty-state");
			box.append(
				el("h2", "", "프로젝트를 불러오지 못했어요"),
				el(
					"p",
					"",
					"브라우저 저장소를 쓸 수 없거나 저장된 내용이 손상됐어요. 사생활 보호 모드나 저장소 차단 설정을 확인한 뒤 다시 시도해 주세요.",
				),
			);
			const retry = button(
				"다시 불러오기",
				"button button-secondary",
				"refresh",
			);
			retry.addEventListener("click", () => renderProjects(view));
			box.append(retry);
			content.append(box);
		} else if (!items.length) {
			const box = el("div", "empty-state");
			box.append(
				el("h2", "", "저장한 프로젝트가 없어요"),
				el(
					"p",
					"",
					"작업실 위쪽의 ‘프로젝트 저장’을 누르면 지금 작업이 여기에 보관돼요.",
				),
			);
			const go = button("현재 작업 저장", "button button-secondary", "save");
			go.addEventListener("click", saveProject);
			box.append(go);
			content.append(box);
		} else {
			const list = el("ul", "project-list");
			items.forEach((project) => {
				const row = el("li", "project-row");
				const info = el("div", "project-info");
				const title = el("strong", "project-title", project.title);
				info.append(title);
				if (project.id === currentId)
					info.append(el("span", "tag tag-blue", "지금 여는 중"));
				info.append(
					el(
						"span",
						"project-meta",
						`${when(project.updatedAt)} 수정 · ${paragraphLabel(project)} · 주 성우 ${mainVoice(project)}`,
					),
				);
				const rowActions = el("div", "project-actions");
				const open = button("열기", "mini-button");
				open.setAttribute("aria-label", `${project.title} 열기`);
				open.addEventListener("click", async () => {
					if (
						!(await confirmLeave("다른 프로젝트를 열까요?", "저장 없이 열기"))
					)
						return;
					openWork(
						project,
						project.id,
						`‘${project.title}’${objectParticle(project.title)} 열었어요.`,
					);
				});
				const copyButton = button("복제", "mini-button");
				copyButton.setAttribute("aria-label", `${project.title} 복제`);
				copyButton.addEventListener("click", () => {
					const { ok: readable, items: current } = listProjects();
					const duplicate = {
						...structuredClone(project),
						id: `project-${Date.now().toString(36)}`,
						title: `${project.title} 복제`,
						updatedAt: new Date().toISOString(),
					};
					const index = current.findIndex((item) => item.id === project.id);
					current.splice(index + 1, 0, duplicate);
					if (!readable || !write(PROJECTS_KEY, current)) {
						host.bridge.toast("저장소를 쓸 수 없어 복제하지 못했어요.");
						return;
					}
					host.bridge.toast(
						`‘${duplicate.title}’${objectParticle(duplicate.title)} 만들었어요.`,
					);
					refreshProjectsView(`[data-rename="${duplicate.id}"]`);
				});
				const rename = button("이름 변경", "mini-button");
				rename.dataset.rename = project.id;
				rename.setAttribute("aria-label", `${project.title} 이름 변경`);
				rename.addEventListener("click", () => renameInline(row, project));
				const remove = button("삭제", "mini-button mini-danger");
				remove.setAttribute("aria-label", `${project.title} 삭제`);
				remove.addEventListener("click", async () => {
					const choice = await host.bridge.choose({
						title: "프로젝트를 삭제할까요?",
						message: `‘${project.title}’${objectParticle(project.title)} 이 브라우저에서 지워요. 삭제한 프로젝트는 되돌릴 수 없어요.`,
						actions: [
							{ label: "취소", value: "cancel" },
							{ label: "삭제", value: "delete", variant: "danger" },
						],
					});
					if (choice !== "delete") return;
					const { ok: readable, items: current } = listProjects();
					if (
						!readable ||
						!write(
							PROJECTS_KEY,
							current.filter((item) => item.id !== project.id),
						)
					) {
						host.bridge.toast("저장소를 쓸 수 없어 삭제하지 못했어요.");
						return;
					}
					if (project.id === currentId) {
						currentId = null;
						savedSig = "";
						noteChange();
					}
					host.bridge.announce(`‘${project.title}’ 프로젝트를 삭제했어요.`);
					refreshProjectsView(".project-header-actions .button-primary");
				});
				rowActions.append(open, copyButton, rename, remove);
				row.append(info, rowActions);
				list.append(row);
			});
			content.append(list);
		}
		view.append(header, content);
	};

	// 첫 진입을 막지 않도록 모달 대신 작업 영역 맨 위 배너로 알린다.
	const mountNotice = (notice) => {
		$("#draft-notice")?.remove();
		$("#main-content")?.prepend(notice);
	};
	const deleteDraft = async (draft, notice) => {
		const choice = await host.bridge.choose({
			title: "임시 작업을 삭제할까요?",
			message: `‘${draft.title || "제목 없음"}’ 임시 작업을 지워요. 삭제하면 되돌릴 수 없어요.`,
			actions: [
				{ label: "취소", value: "cancel" },
				{ label: "삭제", value: "delete", variant: "danger" },
			],
		});
		if (choice !== "delete") return;
		write(DRAFT_KEY, null);
		heldDraft = null;
		notice.remove();
		noteChange();
		host.bridge.toast("임시 작업을 삭제했어요.");
		$("#save-project")?.focus();
	};
	const openRecovery = (draft) => {
		const notice = el("section", "draft-notice draft-recovery");
		notice.id = "draft-notice";
		notice.setAttribute("aria-labelledby", "recovery-title");
		const copy = el("div", "draft-copy");
		const heading = el("strong", "", "저장하지 않은 최근 작업이 있어요");
		heading.id = "recovery-title";
		copy.append(
			heading,
			el(
				"p",
				"",
				`‘${draft.title || "제목 없음"}’ · ${draft.savedAt ? when(draft.savedAt) : "저장 시각 모름"} 임시 저장 · ${paragraphLabel(draft)}. 불러오면 지금 화면의 예시 대본을 바꿔요.`,
			),
		);
		const actions = el("div", "draft-actions");
		const load = button("불러오기", "button button-primary");
		const later = button("나중에", "button button-secondary");
		const remove = button("삭제", "button button-secondary");
		load.addEventListener("click", () => {
			notice.remove();
			loadDraft(draft);
		});
		later.addEventListener("click", () => {
			heldDraft = draft;
			showDraftNotice();
			noteChange();
			$("#draft-notice .mini-button")?.focus();
		});
		remove.addEventListener("click", () => deleteDraft(draft, notice));
		actions.append(load, later, remove);
		notice.append(copy, actions);
		mountNotice(notice);
	};
	// "나중에"를 누른 뒤에도 보관 중인 임시 작업을 불러올 수 있게 작은 알림을 남긴다.
	const showDraftNotice = () => {
		$("#draft-notice")?.remove();
		if (!heldDraft) return;
		const notice = el("section", "draft-notice");
		notice.id = "draft-notice";
		notice.setAttribute("aria-label", "보관 중인 임시 작업");
		const text = el(
			"p",
			"",
			`임시 작업 ‘${heldDraft.title || "제목 없음"}’${objectParticle(heldDraft.title || "제목 없음")} 보관하고 있어요. 불러오거나, 이 알림을 닫으면 지금 작업으로 임시 저장을 이어 가요.`,
		);
		const load = button("불러오기", "mini-button");
		load.addEventListener("click", async () => {
			if (
				!(await confirmLeave("임시 작업을 불러올까요?", "저장 없이 불러오기"))
			)
				return;
			loadDraft(heldDraft);
		});
		const close = button("", "icon-button", "close");
		close.setAttribute("aria-label", "임시 작업 알림 닫기");
		close.addEventListener("click", () => {
			heldDraft = null;
			notice.remove();
			noteChange();
			$("#save-project")?.focus();
		});
		notice.append(text, load, close);
		mountNotice(notice);
	};

	const renameProjectInline = () => {
		const trigger = $("#rename-project");
		const input = el("input", "crumb-rename-input");
		input.value = host.getTitle();
		input.maxLength = 80;
		input.setAttribute("aria-label", "작업 제목");
		let done = false;
		const finish = (commit, refocus) => {
			if (done) return;
			done = true;
			const name = input.value.trim();
			input.remove();
			trigger.hidden = false;
			if (commit && name && name !== host.getTitle()) {
				host.setTitle(name);
				noteChange();
				host.bridge.announce(`작업 제목을 ‘${name}’으로 바꿨어요.`);
			}
			if (refocus) trigger.focus();
		};
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				finish(true, true);
			}
			if (event.key === "Escape") {
				event.preventDefault();
				finish(false, true);
			}
		});
		input.addEventListener("blur", () => finish(true, false));
		trigger.hidden = true;
		trigger.after(input);
		input.focus();
		input.select();
	};

	const visible = (node) => Boolean(node?.getClientRects().length);
	const guideSteps = [
		{
			title: "성우 고르기",
			text: "문단 카드의 성우 칩을 눌러 성우를 고르고, 빠른 메뉴 아래 ‘전체 성우에서 찾기’에서 검색·필터·샘플을 써요. 새 문단의 기본 성우는 오른쪽 작업 설정의 ‘바꾸기’에서 정해요.",
			view: "studio",
			targets: ["#segment-plan .ps-voice-button", "#change-default-voice"],
			fallback: "#open-settings-drawer",
		},
		{
			title: "대본 쓰기",
			text: "문단 카드의 본문에 대본을 쓰거나 붙여 넣어요. 저장 대본과 대본 가져오기로 불러올 수도 있어요.",
			view: "studio",
			targets: ["#segment-plan textarea"],
		},
		{
			title: "문단 나누기",
			text: "여러 줄을 붙여 넣으면 나눌지 물어봐요. 왼쪽 일괄 작업의 ‘분할’은 선택한 문단을, 선택이 없으면 전체를 나눠요. 화자 자동 감지를 켜 두면 대화 대본에서 화자별로 나눠요.",
			view: "studio",
			targets: ["#speaker-detect"],
		},
		{
			title: "일괄 작업",
			text: "문단 카드를 여러 개 고르면 성우·속도·간격 변경, 분할, 합치기, 삭제를 한 번에 하고 되돌릴 수 있어요.",
			view: "studio",
			targets: ["#segment-plan input[type='checkbox']", "#batch-rail button"],
		},
		{
			title: "발음 검수",
			text: "발음용 대본 탭에서 숫자 읽기를 항목별로 적용하거나 원문 그대로 둬요. 오른쪽 작업 요약의 ‘발음 검수 남은 N건’으로도 바로 가요.",
			view: "studio",
			prepare: () => $("#pronunciation-tab")?.click(),
			targets: ["#pronunciation-tab"],
		},
		{
			title: "생성과 재생",
			text: "아래 작업 바에서 예상 길이와 사용량을 확인하고 ‘음성 만들기’를 눌러요. 만든 뒤 전체 재생으로 문단을 차례로 확인해요(소리 없는 시연).",
			view: "studio",
			prepare: () => $("#paragraph-tab")?.click(),
			targets: ["#make-audio"],
		},
		{
			title: "내려받기",
			text: "음성을 만든 뒤 작업 바의 내려받기에서 MP3·WAV를 골라요. 이 시연에서는 파일을 만들지 않아요.",
			view: "studio",
			targets: ["#workbar-download"],
			missing:
				"좁은 화면에서는 작업 바의 ⋯ 메뉴 안에 내려받기가 있어요. 음성을 만든 뒤 열어 주세요.",
			fallback: "#make-audio",
		},
		{
			title: "프로젝트",
			text: "‘프로젝트 저장’으로 작업을 이 브라우저에 보관하고, 프로젝트 화면에서 다시 열거나 복제해요.",
			view: "projects",
			targets: [
				"#projects-view .project-row button",
				"#projects-view .page-header .button",
			],
		},
		{
			title: "내 보이스",
			text: "내 목소리를 녹음해 복제하거나 기존 ElevenLabs 목소리를 연결해요. 공급자 전송은 하지 않는 시연이에요.",
			view: "mine",
			targets: ["#clone-name", "#mine-view .page-header .button"],
		},
		{
			title: "AI 보이스 도구",
			text: "왼쪽 AI 보이스 도구에서 맞춤 성우 추천, 목소리 찾기, 보이스 디자인 같은 도구를 열어요. 좁은 화면에서는 툴바의 ‘AI 도구’ 버튼을 써요.",
			view: "studio",
			targets: ["#tool-rail .tool-tile-main", "#open-tools-menu"],
		},
	];
	const jumpTo = (step) => {
		host.bridge.showView(step.view);
		history.replaceState(null, "", `#${step.view}`);
		step.prepare?.();
		const target = step.targets
			.map((selector) => [...document.querySelectorAll(selector)].find(visible))
			.find(Boolean);
		const focusTarget = target || (step.fallback && $(step.fallback));
		if (!target && step.missing) host.bridge.toast(step.missing);
		if (!focusTarget) return;
		focusTarget.scrollIntoView({ block: "center" });
		focusTarget.focus();
	};
	const openGuide = () => {
		let dialog = $("#guide-dialog");
		if (!dialog) {
			dialog = el("dialog", "dialog guide-dialog");
			dialog.id = "guide-dialog";
			dialog.setAttribute("aria-labelledby", "guide-title");
			const form = el("form");
			form.method = "dialog";
			const head = el("div", "dialog-header");
			const copy = el("div");
			const heading = el("h2", "", "사용법");
			heading.id = "guide-title";
			copy.append(
				heading,
				el(
					"p",
					"",
					"순서대로 따라 하면 대본 한 편을 음성으로 만들 수 있어요. ‘이동’을 누르면 해당 자리로 옮겨요.",
				),
			);
			const close = button("", "icon-button", "close");
			close.type = "submit";
			close.value = "cancel";
			close.setAttribute("aria-label", "닫기");
			head.append(copy, close);
			const list = el("ol", "guide-steps");
			guideSteps.forEach((step) => {
				const item = el("li", "guide-step");
				const text = el("div");
				text.append(el("strong", "", step.title), el("p", "", step.text));
				const go = button("이동", "mini-button");
				go.setAttribute("aria-label", `${step.title}(으)로 이동`);
				go.addEventListener("click", () => {
					dialog.close();
					jumpTo(step);
				});
				item.append(text, go);
				list.append(item);
			});
			form.append(head, list);
			dialog.append(form);
			document.body.append(dialog);
		}
		dialog.showModal();
	};

	const usageKinds = [
		["all", "전체"],
		["generate", "생성"],
		["voice", "클론·디자인"],
	];
	let usageTab = "all";
	const renderUsage = (container, log = []) => {
		const section = el("section", "usage-history");
		section.setAttribute("aria-labelledby", "usage-title");
		const heading = el("h2", "", "사용 내역 · 시연");
		heading.id = "usage-title";
		const tabs = el("div", "usage-tabs");
		tabs.setAttribute("role", "tablist");
		tabs.setAttribute("aria-label", "사용 내역 종류");
		const panel = el("div", "usage-panel");
		panel.id = "usage-panel";
		panel.setAttribute("role", "tabpanel");
		const renderPanel = () => {
			const entries = log.filter(
				(entry) =>
					usageTab === "all" ||
					(usageTab === "generate"
						? entry.kind === "generate"
						: entry.kind === "clone" || entry.kind === "design"),
			);
			panel.setAttribute("aria-labelledby", `usage-tab-${usageTab}`);
			panel.replaceChildren();
			if (!entries.length) {
				panel.append(
					el(
						"p",
						"usage-empty",
						{
							all: "이번 세션에 기록된 시연 내역이 없어요. 음성 만들기나 클론·보이스 디자인 시연을 마치면 여기에 남아요.",
							generate:
								"이번 세션에 기록된 생성 시연이 없어요. 작업실에서 음성 만들기 시연을 완료하면 여기에 남아요.",
							voice:
								"이번 세션에 기록된 클론·디자인 시연이 없어요. 내 보이스의 클론 생성이나 보이스 디자인 시연을 마치면 여기에 남아요.",
						}[usageTab],
					),
				);
				return;
			}
			const list = el("ul", "usage-list");
			entries.forEach((entry) => {
				const item = el("li", "usage-row");
				item.append(
					el(
						"span",
						"usage-time",
						new Date(entry.at).toLocaleTimeString("ko-KR", {
							hour: "2-digit",
							minute: "2-digit",
						}),
					),
					el(
						"strong",
						"",
						`${{ generate: "생성", clone: "클론", design: "디자인" }[entry.kind] || "기타"} · ${entry.provider || "공급자 미정"}`,
					),
					el(
						"span",
						"",
						`${entry.model || "모델 미정"} · ${entry.usageLabel || ""}`,
					),
					el("span", "usage-note", entry.note || "시연"),
				);
				list.append(item);
			});
			panel.append(list);
		};
		const tabButtons = usageKinds.map(([id, label]) => {
			const tab = button(label, "tab");
			tab.id = `usage-tab-${id}`;
			tab.setAttribute("role", "tab");
			tab.setAttribute("aria-controls", "usage-panel");
			return tab;
		});
		const select = (id, focus) => {
			usageTab = id;
			tabButtons.forEach((tab, index) => {
				const active = usageKinds[index][0] === id;
				tab.setAttribute("aria-selected", String(active));
				tab.tabIndex = active ? 0 : -1;
				tab.classList.toggle("is-active", active);
				if (active && focus) tab.focus();
			});
			renderPanel();
		};
		tabButtons.forEach((tab, index) => {
			tab.addEventListener("click", () => select(usageKinds[index][0]));
			tab.addEventListener("keydown", (event) => {
				const last = usageKinds.length - 1;
				const next = {
					ArrowRight: index === last ? 0 : index + 1,
					ArrowLeft: index === 0 ? last : index - 1,
					Home: 0,
					End: last,
				}[event.key];
				if (next === undefined) return;
				event.preventDefault();
				select(usageKinds[next][0], true);
			});
		});
		tabs.append(...tabButtons);
		section.append(
			heading,
			el(
				"p",
				"usage-note",
				"실제 청구 아님 · 연결 후 공급자 내역과 대조해 주세요. 이 목록은 새로 고치면 사라지는 이번 세션의 시연 기록입니다.",
			),
			tabs,
			panel,
		);
		select(usageTab);
		container.append(section);
	};

	// 테마: 시스템 설정 → 라이트 → 다크. 색은 styles.css의 light-dark() 토큰이 맡고 여기서는 모드만 바꾼다.
	const THEMES = [
		{
			id: "system",
			label: "시스템 설정",
			to: "시스템 설정으로",
			icon: "monitor",
		},
		{ id: "light", label: "라이트", to: "라이트로", icon: "sun" },
		{ id: "dark", label: "다크", to: "다크로", icon: "moon" },
	];
	// theme-color는 브라우저가 보는 색이라 CSS 토큰(light-dark)을 캔버스로 hex로 바꿔 넣는다.
	const schemeColor = (scheme) => {
		const probe = el("div");
		probe.style.cssText = `position:absolute;visibility:hidden;color-scheme:${scheme};background:var(--surface)`;
		document.body.append(probe);
		const ctx = document.createElement("canvas").getContext("2d");
		ctx.fillStyle = getComputedStyle(probe).backgroundColor;
		probe.remove();
		ctx.fillRect(0, 0, 1, 1);
		const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
		return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
	};
	const syncThemeColor = () => {
		const manual = document.documentElement.dataset.theme;
		for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
			const scheme = manual || (meta.media.includes("dark") ? "dark" : "light");
			meta.content = schemeColor(scheme);
		}
	};
	const applyTheme = (id) => {
		const index = Math.max(
			0,
			THEMES.findIndex((theme) => theme.id === id),
		);
		const theme = THEMES[index];
		const next = THEMES[(index + 1) % THEMES.length];
		if (theme.id === "system") delete document.documentElement.dataset.theme;
		else document.documentElement.dataset.theme = theme.id;
		const toggle = $("#theme-toggle");
		const label = `테마: ${theme.label} · 눌러서 ${next.to}`;
		toggle.setAttribute("aria-label", label);
		toggle.title = label;
		toggle.querySelector("use").setAttribute("href", `#i-${theme.icon}`);
		toggle.dataset.next = next.id;
		syncThemeColor();
	};
	const initTheme = () => {
		if (!$("#theme-toggle")) return;
		applyTheme(read(THEME_KEY, "system").value);
		$("#theme-toggle").addEventListener("click", (event) => {
			const next = event.currentTarget.dataset.next;
			write(THEME_KEY, next === "system" ? null : next);
			applyTheme(next);
			$("#live-region").textContent =
				`${THEMES.find((theme) => theme.id === next).label} 테마로 바꿨어요.`;
		});
		matchMedia("(prefers-color-scheme: dark)").addEventListener(
			"change",
			syncThemeColor,
		);
	};

	const init = (bridgeLike) => {
		host = bridgeLike;
		initTheme();
		savedSig = sig(host.example);
		$("#save-project")?.addEventListener("click", saveProject);
		$("#start-new")?.addEventListener("click", startNew);
		$("#open-guide")?.addEventListener("click", openGuide);
		$("#rename-project")?.addEventListener("click", renameProjectInline);
		noteChange();
		const { value } = read(DRAFT_KEY, null);
		if (
			validWork(value) &&
			sig(value) !== savedSig &&
			sig(value) !== sig(host.example)
		)
			openRecovery(value);
	};

	window.TTSProjectTools = { init, noteChange, renderProjects, renderUsage };
})();
