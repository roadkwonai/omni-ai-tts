(() => {
	const STORAGE_KEY = "tts-pilot.prototype.voice-classification.v1";
	const GROUPS = ["channels", "categories", "types"];
	const GROUP_LABELS = {
		channels: "채널",
		categories: "카테고리",
		types: "타입",
	};
	const SEED_ITEMS = {
		channels: [
			{ id: "channel-economy-bite", name: "경제 한 입" },
			{ id: "channel-weekend-letter", name: "주말 레터" },
			{ id: "channel-brand-intro", name: "브랜드 소개" },
		],
		categories: [
			{ id: "category-economy", name: "경제" },
			{ id: "category-education", name: "교육" },
			{ id: "category-daily", name: "일상" },
		],
		types: [
			{ id: "type-calm", name: "차분함" },
			{ id: "type-trust", name: "신뢰감" },
			{ id: "type-lively", name: "활기참" },
		],
	};
	const SEED_ASSIGNMENTS = {
		"Typecast:minseo": {
			channels: ["channel-economy-bite"],
			categories: ["category-economy"],
			types: ["type-calm", "type-trust"],
		},
		"ElevenLabs:soyeon": {
			channels: ["channel-weekend-letter"],
			categories: ["category-economy"],
			types: ["type-trust"],
		},
	};
	const SEED_FLAGS = {
		"Typecast:minseo": { favorite: true, frequent: false },
		"ElevenLabs:soyeon": { favorite: true, frequent: false },
	};

	let voices = [];
	let onChange = () => {};
	let errorSequence = 0;
	let onBrowse = () => {};
	let data = createSeed();
	let itemCounter = 0;

	function copyItems(items) {
		return items.map((item) => ({ id: item.id, name: item.name }));
	}

	function emptyAssignment() {
		return { channels: [], categories: [], types: [] };
	}

	function createSeed() {
		return {
			version: 1,
			items: Object.fromEntries(
				GROUPS.map((group) => [group, copyItems(SEED_ITEMS[group])]),
			),
			assignments: Object.fromEntries(
				Object.entries(SEED_ASSIGNMENTS).map(([key, assignment]) => [
					key,
					copyAssignment(assignment),
				]),
			),
			flags: Object.fromEntries(
				Object.entries(SEED_FLAGS).map(([key, flags]) => [key, { ...flags }]),
			),
		};
	}

	function copyAssignment(assignment) {
		const copy = emptyAssignment();
		for (const group of GROUPS) copy[group] = [...assignment[group]];
		return copy;
	}

	function voiceKey(voice) {
		if (typeof voice === "string") return voice;
		if (
			!voice ||
			typeof voice.provider !== "string" ||
			typeof voice.id !== "string"
		)
			return "";
		return `${voice.provider}:${voice.id}`;
	}

	function validItem(item) {
		return (
			item &&
			typeof item.id === "string" &&
			item.id.length > 0 &&
			typeof item.name === "string" &&
			item.name.trim().length > 0 &&
			item.name.trim().length <= 80
		);
	}

	function validIdList(ids, knownIds) {
		if (!Array.isArray(ids)) return [];
		return [
			...new Set(
				ids.filter((id) => typeof id === "string" && knownIds.has(id)),
			),
		];
	}

	function validateStored(value) {
		if (!value || typeof value !== "object" || value.version !== 1) return null;
		if (!value.items || !value.assignments || !value.flags) return null;
		const result = createSeed();
		for (const group of GROUPS) {
			if (!Array.isArray(value.items[group])) return null;
			const seen = new Set();
			const items = [];
			for (const item of value.items[group]) {
				if (!validItem(item) || seen.has(item.id)) return null;
				seen.add(item.id);
				items.push({ id: item.id, name: item.name.trim() });
			}
			result.items[group] = items;
		}
		const idsByGroup = Object.fromEntries(
			GROUPS.map((group) => [
				group,
				new Set(result.items[group].map((item) => item.id)),
			]),
		);
		for (const [key, assignment] of Object.entries(value.assignments)) {
			if (key === "__proto__" || !assignment || typeof assignment !== "object")
				return null;
			result.assignments[key] = emptyAssignment();
			for (const group of GROUPS) {
				result.assignments[key][group] = validIdList(
					assignment[group],
					idsByGroup[group],
				);
			}
		}
		for (const [key, flags] of Object.entries(value.flags)) {
			if (key === "__proto__" || !flags || typeof flags !== "object")
				return null;
			result.flags[key] = {
				favorite: flags.favorite === true,
				frequent: flags.frequent === true,
			};
		}
		return result;
	}

	function announce(message, kind = "notice") {
		let region = document.getElementById("voice-classification-notice");
		if (!region) {
			region = document.createElement("div");
			region.id = "voice-classification-notice";
			region.className = "voice-classification-notice";
			region.setAttribute("role", "status");
			document.body.append(region);
		}
		region.dataset.kind = kind;
		region.textContent = message;
		window.setTimeout(() => {
			if (region.textContent === message) region.textContent = "";
		}, 4500);
	}

	function load() {
		try {
			const raw = window.localStorage.getItem(STORAGE_KEY);
			if (!raw) return createSeed();
			const parsed = validateStored(JSON.parse(raw));
			if (parsed) return parsed;
		} catch {
			// A damaged or inaccessible localStorage entry should never break the demo.
		}
		announce("저장된 분류 정보를 읽지 못해 기본값으로 시작합니다.", "error");
		return createSeed();
	}

	function persist(nextData, errorTarget) {
		try {
			const serialized = JSON.stringify(nextData);
			window.localStorage.setItem(STORAGE_KEY, serialized);
			data = nextData;
			return true;
		} catch {
			const message =
				"저장하지 못했습니다. 브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요.";
			if (errorTarget) errorTarget.textContent = message;
			else announce(message, "error");
			return false;
		}
	}

	function emit(detail) {
		onChange(detail);
	}

	function normalizeName(value) {
		return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
	}

	function makeId(group) {
		if (window.crypto?.randomUUID)
			return `${group}-${window.crypto.randomUUID()}`;
		itemCounter += 1;
		return `${group}-${Date.now().toString(36)}-${itemCounter}`;
	}

	function addItem(group, input, errorTarget) {
		const name = normalizeName(input);
		if (!GROUPS.includes(group)) return null;
		if (!name || name.length > 80) {
			if (errorTarget)
				errorTarget.textContent = "이름은 공백 없이 1~80자로 입력해 주세요.";
			return null;
		}
		if (data.items[group].some((item) => item.name === name)) {
			if (errorTarget)
				errorTarget.textContent = "같은 이름의 항목이 이미 있습니다.";
			return null;
		}
		const next = structuredClone(data);
		const item = { id: makeId(group), name };
		next.items[group].push(item);
		if (!persist(next, errorTarget)) return null;
		emit({ type: "item-added", group, id: item.id });
		return item;
	}

	function getItems(group) {
		return GROUPS.includes(group) ? copyItems(data.items[group]) : [];
	}

	function getAssignments(voice) {
		const key = voiceKey(voice);
		return copyAssignment(data.assignments[key] || emptyAssignment());
	}

	function getFlags(voice) {
		const key = voiceKey(voice);
		return {
			favorite: data.flags[key]?.favorite === true,
			frequent: data.flags[key]?.frequent === true,
		};
	}

	function setFlags(voice, patch) {
		const key = voiceKey(voice);
		if (!key || !patch || typeof patch !== "object") return false;
		const next = structuredClone(data);
		const flags = next.flags[key] || { favorite: false, frequent: false };
		if (typeof patch.favorite === "boolean") flags.favorite = patch.favorite;
		if (typeof patch.frequent === "boolean") flags.frequent = patch.frequent;
		next.flags[key] = flags;
		if (!persist(next)) return false;
		emit({ type: "flags", voice: key });
		return true;
	}

	// 편집기를 거치지 않고 한 그룹의 연결을 바로 바꾼다(성우 캐스팅의 넣기·빼기).
	function setAssignment(voice, group, ids) {
		const key = voiceKey(voice);
		if (!key || !GROUPS.includes(group)) return false;
		const next = structuredClone(data);
		const assignment = next.assignments[key] || emptyAssignment();
		assignment[group] = validIdList(
			ids,
			new Set(next.items[group].map((item) => item.id)),
		);
		next.assignments[key] = assignment;
		if (!persist(next)) return false;
		emit({ type: "assignment", voice: key });
		return true;
	}

	function getLabels(voice, group) {
		if (!GROUPS.includes(group)) return [];
		const items = new Map(
			data.items[group].map((item) => [item.id, item.name]),
		);
		return getAssignments(voice)
			[group].map((id) => items.get(id))
			.filter(Boolean);
	}

	function matches(voice, filters = {}) {
		const assignments = getAssignments(voice);
		return GROUPS.every((group) => {
			const selected = Array.isArray(filters[group])
				? filters[group].filter((id) => typeof id === "string")
				: [];
			return (
				selected.length === 0 ||
				selected.some((id) => assignments[group].includes(id))
			);
		});
	}

	function button(label, className = "button button-secondary") {
		const node = document.createElement("button");
		node.type = "button";
		node.className = className;
		node.textContent = label;
		return node;
	}

	function makeEditorGroup(group, draft, rerender) {
		const section = document.createElement("section");
		section.className = "voice-classification-group";
		const title = document.createElement("h3");
		title.textContent = GROUP_LABELS[group];
		section.append(title);
		const addHint = document.createElement("p");
		addHint.className = "voice-classification-add-hint";
		addHint.textContent =
			"새 항목은 지금 목록에 저장됩니다. 성우 연결은 저장을 눌러야 바뀝니다.";
		section.append(addHint);
		const search = document.createElement("input");
		search.type = "search";
		search.className = "voice-classification-search";
		search.placeholder = `${GROUP_LABELS[group]} 검색`;
		search.setAttribute("aria-label", `${GROUP_LABELS[group]} 검색`);
		section.append(search);
		const list = document.createElement("div");
		list.className = "voice-classification-check-list";
		const renderList = () => {
			list.replaceChildren();
			const query = search.value.trim().toLocaleLowerCase();
			const items = getItems(group).filter((item) =>
				item.name.toLocaleLowerCase().includes(query),
			);
			if (!items.length) {
				const empty = document.createElement("p");
				empty.className = "voice-classification-empty";
				empty.textContent = "일치하는 항목이 없습니다.";
				list.append(empty);
			}
			for (const item of items) {
				const label = document.createElement("label");
				label.className = "voice-classification-option";
				const checkbox = document.createElement("input");
				checkbox.type = "checkbox";
				checkbox.checked = draft[group].includes(item.id);
				checkbox.addEventListener("change", () => {
					draft[group] = checkbox.checked
						? [...new Set([...draft[group], item.id])]
						: draft[group].filter((id) => id !== item.id);
				});
				const name = document.createElement("span");
				name.textContent = item.name;
				label.append(checkbox, name);
				list.append(label);
			}
		};
		search.addEventListener("input", renderList);
		section.append(list);
		const addRow = document.createElement("div");
		addRow.className = "voice-classification-inline-add";
		const addInput = document.createElement("input");
		addInput.maxLength = 80;
		addInput.placeholder = `새 ${GROUP_LABELS[group]}`;
		addInput.setAttribute("aria-label", `새 ${GROUP_LABELS[group]} 이름`);
		const addButton = button("항목 추가");
		const error = document.createElement("p");
		error.className = "voice-classification-error";
		error.id = `classification-error-${++errorSequence}`;
		error.setAttribute("role", "alert");
		addButton.addEventListener("click", () => {
			error.textContent = "";
			const item = addItem(group, addInput.value, error);
			if (!item) {
				addInput.setAttribute("aria-invalid", "true");
				addInput.focus();
				return;
			}
			addInput.removeAttribute("aria-invalid");
			draft[group] = [...new Set([...draft[group], item.id])];
			addInput.value = "";
			renderList();
			rerender();
		});
		addInput.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				addButton.click();
			}
		});
		addInput.setAttribute("aria-describedby", error.id);
		addInput.addEventListener("input", () => {
			addInput.removeAttribute("aria-invalid");
			error.textContent = "";
		});
		addRow.append(addInput, addButton);
		section.append(addRow, error);
		return { section, renderList };
	}

	function restoreFocus(trigger) {
		const key = trigger?.dataset?.classifyKey;
		const target = key
			? document.querySelector(`[data-classify-key="${CSS.escape(key)}"]`)
			: trigger;
		if (target?.isConnected) target.focus();
		else {
			const heading = document.querySelector("#voices-title");
			if (heading) {
				heading.tabIndex = -1;
				heading.focus();
			}
		}
	}

	function openEditor(voice, trigger) {
		const key = voiceKey(voice);
		if (!key) return;
		const dialog = document.createElement("dialog");
		dialog.className = "voice-classification-drawer";
		dialog.setAttribute("aria-labelledby", "voice-classification-editor-title");
		const panel = document.createElement("div");
		panel.className = "voice-classification-drawer-panel";
		const header = document.createElement("header");
		header.className = "voice-classification-drawer-header";
		const heading = document.createElement("h2");
		heading.id = "voice-classification-editor-title";
		heading.textContent = `${voice.name || "성우"} 분류 편집`;
		const description = document.createElement("p");
		description.textContent = "저장하기 전까지 성우 연결은 바뀌지 않습니다.";
		const close = button("닫기", "button button-secondary");
		header.append(document.createElement("div"));
		header.firstChild.append(heading, description);
		header.append(close);
		const content = document.createElement("div");
		content.className = "voice-classification-drawer-content";
		const draft = getAssignments(key);
		const groups = [];
		const rerender = () => {
			for (const entry of groups) entry.renderList();
		};
		for (const group of GROUPS) {
			const entry = makeEditorGroup(group, draft, rerender);
			groups.push(entry);
			content.append(entry.section);
			entry.renderList();
		}
		const error = document.createElement("p");
		error.className = "voice-classification-error";
		error.id = `classification-error-${++errorSequence}`;
		error.setAttribute("role", "alert");
		const actions = document.createElement("footer");
		actions.className = "voice-classification-actions";
		const cancel = button("취소");
		const save = button("저장", "button button-primary");
		actions.append(cancel, save);
		panel.append(header, content, error, actions);
		dialog.append(panel);
		document.body.append(dialog);
		let closing = false;
		const closeDialog = () => {
			if (closing) return;
			closing = true;
			dialog.close();
		};
		close.addEventListener("click", closeDialog);
		cancel.addEventListener("click", closeDialog);
		dialog.addEventListener("cancel", (event) => {
			event.preventDefault();
			closeDialog();
		});
		dialog.addEventListener("close", () => {
			dialog.remove();
			restoreFocus(trigger);
		});
		save.addEventListener("click", () => {
			error.textContent = "";
			const next = structuredClone(data);
			const valid = Object.fromEntries(
				GROUPS.map((group) => [
					group,
					new Set(next.items[group].map((item) => item.id)),
				]),
			);
			next.assignments[key] = emptyAssignment();
			for (const group of GROUPS)
				next.assignments[key][group] = validIdList(draft[group], valid[group]);
			if (!persist(next, error)) return;
			emit({ type: "assignment", voice: key });
			closeDialog();
		});
		dialog.showModal();
		close.focus();
	}

	function connectedVoices(group, id) {
		return voices.filter((voice) => getAssignments(voice)[group].includes(id));
	}

	function renderManager(container) {
		if (!container) return;
		const focusManager = (group, id) => {
			const section = [
				...container.querySelectorAll("[data-classification-group]"),
			].find((node) => node.dataset.classificationGroup === group);
			const row =
				id &&
				[
					...(section?.querySelectorAll("[data-classification-item]") || []),
				].find((node) => node.dataset.classificationItem === id);
			const control = row
				? [...row.querySelectorAll("button")].find(
						(node) => node.textContent === "이름 변경",
					)
				: section?.querySelector("form input");
			control?.focus();
		};
		const render = () => {
			container.replaceChildren();
			container.classList.add("voice-classification-manager");
			for (const group of GROUPS) {
				const section = document.createElement("section");
				section.className = "voice-classification-manager-group";
				section.dataset.classificationGroup = group;
				const heading = document.createElement("h2");
				heading.textContent = GROUP_LABELS[group];
				section.append(heading);
				const form = document.createElement("form");
				form.className = "voice-classification-manager-add";
				const input = document.createElement("input");
				input.maxLength = 80;
				input.placeholder = `새 ${GROUP_LABELS[group]} 이름`;
				input.setAttribute("aria-label", `새 ${GROUP_LABELS[group]} 이름`);
				const add = button("추가", "button button-primary");
				add.type = "submit";
				const error = document.createElement("p");
				error.className = "voice-classification-error";
				error.id = `classification-error-${++errorSequence}`;
				error.setAttribute("role", "alert");
				form.addEventListener("submit", (event) => {
					event.preventDefault();
					error.textContent = "";
					if (addItem(group, input.value, error)) {
						render();
						focusManager(group);
					} else {
						input.setAttribute("aria-invalid", "true");
						input.focus();
					}
				});
				input.setAttribute("aria-describedby", error.id);
				input.addEventListener("input", () => {
					input.removeAttribute("aria-invalid");
					error.textContent = "";
				});
				form.append(input, add);
				section.append(form, error);
				const search = document.createElement("input");
				search.type = "search";
				search.className = "voice-classification-search";
				search.placeholder = `${GROUP_LABELS[group]} 검색`;
				search.setAttribute("aria-label", `${GROUP_LABELS[group]} 검색`);
				section.append(search);
				const list = document.createElement("div");
				list.className = "voice-classification-manager-list";
				const renderList = () => {
					list.replaceChildren();
					const query = search.value.trim().toLocaleLowerCase();
					const items = getItems(group).filter((item) =>
						item.name.toLocaleLowerCase().includes(query),
					);
					if (!items.length) {
						const empty = document.createElement("p");
						empty.className = "voice-classification-empty";
						empty.textContent = query
							? "일치하는 항목이 없습니다."
							: "등록한 항목이 없습니다.";
						list.append(empty);
					}
					for (const item of items) {
						const row = document.createElement("article");
						row.className = "voice-classification-manager-item";
						row.dataset.classificationItem = item.id;
						const details = document.createElement("div");
						const name = document.createElement("strong");
						name.textContent = item.name;
						const connected = connectedVoices(group, item.id);
						const meta = document.createElement("p");
						meta.textContent = `${connected.length}명 연결${connected.length ? ` · ${connected.map((voice) => voice.name).join(", ")}` : ""}`;
						details.append(name, meta);
						const actions = document.createElement("div");
						actions.className = "voice-classification-manager-actions";
						const browse = button("성우 보기");
						browse.addEventListener("click", () => onBrowse(group, item.id));
						const rename = button("이름 변경");
						rename.addEventListener("click", () => {
							const editor = document.createElement("input");
							editor.maxLength = 80;
							editor.value = item.name;
							editor.setAttribute("aria-label", `${item.name} 이름 변경`);
							const save = button("저장", "button button-primary");
							const cancelRename = button("취소");
							const renameError = document.createElement("p");
							renameError.className = "voice-classification-error";
							renameError.id = `classification-error-${++errorSequence}`;
							renameError.setAttribute("role", "alert");
							editor.setAttribute("aria-describedby", renameError.id);
							editor.addEventListener("input", () => {
								editor.removeAttribute("aria-invalid");
								renameError.textContent = "";
							});
							const finish = (shouldSave) => {
								if (shouldSave) {
									const newName = normalizeName(editor.value);
									if (!newName || newName.length > 80) {
										renameError.textContent = "이름은 1~80자로 입력해 주세요.";
										editor.setAttribute("aria-invalid", "true");
										editor.focus();
										return;
									}
									if (
										data.items[group].some(
											(other) => other.id !== item.id && other.name === newName,
										)
									) {
										renameError.textContent =
											"같은 이름의 항목이 이미 있습니다.";
										editor.setAttribute("aria-invalid", "true");
										editor.focus();
										return;
									}
									const next = structuredClone(data);
									next.items[group].find((other) => other.id === item.id).name =
										newName;
									if (!persist(next, renameError)) return;
									emit({ type: "item-renamed", group, id: item.id });
								}
								render();
								focusManager(group, item.id);
							};
							save.addEventListener("click", () => finish(true));
							cancelRename.addEventListener("click", () => finish(false));
							editor.addEventListener("keydown", (event) => {
								if (event.key === "Enter") finish(true);
								if (event.key === "Escape") finish(false);
							});
							row.classList.add("is-editing");
							row.replaceChildren(editor, save, cancelRename, renameError);
							editor.focus();
						});
						const remove = button("삭제");
						remove.addEventListener("click", () => {
							if (
								!window.confirm(
									`‘${item.name}’을 삭제할까요? 연결된 성우 ${connected.length}명의 이 분류만 해제되며 성우는 유지됩니다.`,
								)
							)
								return;
							const next = structuredClone(data);
							next.items[group] = next.items[group].filter(
								(other) => other.id !== item.id,
							);
							for (const assignment of Object.values(next.assignments))
								assignment[group] = assignment[group].filter(
									(id) => id !== item.id,
								);
							if (!persist(next)) return;
							emit({ type: "item-removed", group, id: item.id });
							render();
							focusManager(group);
						});
						actions.append(browse, rename, remove);
						row.append(details, actions);
						list.append(row);
					}
				};
				search.addEventListener("input", renderList);
				section.append(list);
				container.append(section);
				renderList();
			}
		};
		render();
	}

	window.TTSVoiceClassification = {
		init(options = {}) {
			voices = Array.isArray(options.voices) ? options.voices : [];
			onChange =
				typeof options.onChange === "function" ? options.onChange : () => {};
			onBrowse =
				typeof options.onBrowse === "function" ? options.onBrowse : () => {};
			data = load();
			return window.TTSVoiceClassification;
		},
		addItem,
		getItems,
		getAssignments,
		setAssignment,
		getFlags,
		setFlags,
		getLabels,
		matches,
		openEditor,
		renderManager,
		storage: { key: STORAGE_KEY, version: 1 },
	};
})();
