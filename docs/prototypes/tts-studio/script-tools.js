(() => {
	const MAX_TEXT = 200_000;
	const MAX_PARAGRAPHS = 200;
	const MAX_DOCX_BYTES = 5 * 1024 * 1024;
	const MAX_DOCX_OUTPUT = 1024 * 1024;
	const NARRATOR = "내레이터";
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

	const state = {
		importer: {
			draft: "",
			busy: false,
			sourceKind: "txt",
			sourceLabel: "붙여넣은 텍스트",
			paragraphs: [],
			parsedFrom: "",
			detection: true,
			mode: "replace",
			status: "",
			error: "",
			requestId: 0,
		},
		emotion: {
			original: [],
			segments: [],
			sourceText: "",
			selected: new Set(),
			history: [],
			status: "",
			error: "",
			requestId: 0,
			timer: 0,
			failureMode: "success",
		},
	};

	const node = (tag, className, text) => {
		const element = document.createElement(tag);
		if (className) element.className = className;
		if (text !== undefined) element.textContent = text;
		return element;
	};
	const button = (label, className = "button button-secondary") => {
		const element = node("button", className, label);
		element.type = "button";
		return element;
	};
	const input = (type, className) => {
		const element = document.createElement("input");
		element.type = type;
		if (className) element.className = className;
		return element;
	};
	const select = (className) => {
		const element = document.createElement("select");
		if (className) element.className = className;
		return element;
	};
	const option = (value, label) => {
		const element = node("option", "", label);
		element.value = value;
		return element;
	};
	const clone = (value) =>
		typeof structuredClone === "function"
			? structuredClone(value)
			: JSON.parse(JSON.stringify(value));
	const normalizeText = (value) =>
		String(value ?? "")
			.replace(/\r\n?/g, "\n")
			.replace(/^\s+|\s+$/g, "");
	const bridge = () => window.TTSStudio || {};
	const announce = (message) => bridge().announce?.(message);
	const status = (message, kind = "info") => {
		const element = node("p", `script-tool-status is-${kind}`, message);
		element.setAttribute("role", kind === "error" ? "alert" : "status");
		return element;
	};
	const paragraphsToText = (paragraphs) =>
		paragraphs
			.map((paragraph) => normalizeText(paragraph.text))
			.filter(Boolean)
			.join("\n\n");
	const currentSource = () => normalizeText(bridge().getSourceText?.() || "");
	const makeId = (prefix, index) =>
		`${prefix}-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 7)}`;
	const voices = () => {
		const entries = bridge().getVoices?.();
		return Array.isArray(entries) ? entries : [];
	};
	const activeVoice = () => bridge().getActiveVoice?.() || null;
	const voiceLabel = (voiceId) => {
		const voice = voices().find((entry) => entry.id === voiceId);
		return voice ? `${voice.name} · ${voice.provider}` : "성우를 선택해 주세요";
	};

	const splitPlainText = (text, detect) => {
		if (detect) {
			const paragraphs = [];
			let current = null;
			const finishCurrent = () => {
				if (current && normalizeText(current.text)) paragraphs.push(current);
				current = null;
			};
			normalizeText(text)
				.split("\n")
				.forEach((line) => {
					if (!normalizeText(line)) {
						finishCurrent();
						return;
					}
					const match = line.match(
						/^\s*(?:\[([^\]\n]{1,50})\]\s*|([^:\n]{1,40}):\s*)(.*)$/,
					);
					if (match) {
						finishCurrent();
						current = {
							speaker: normalizeText(match[1] || match[2]) || NARRATOR,
							text: normalizeText(match[3]),
						};
						return;
					}
					if (current)
						current.text = `${current.text}${current.text ? "\n" : ""}${line}`;
					else current = { speaker: NARRATOR, text: line };
				});
			finishCurrent();
			return paragraphs.map((paragraph, index) => ({
				id: makeId("import", index),
				text: normalizeText(paragraph.text),
				speaker: paragraph.speaker,
				voiceId: "",
			}));
		}
		const chunks = normalizeText(text)
			.split(/\n\s*\n+/)
			.map((chunk) => normalizeText(chunk))
			.filter(Boolean);
		return chunks.map((chunk, index) => {
			return {
				id: makeId("import", index),
				text: chunk,
				speaker: NARRATOR,
				voiceId: "",
			};
		});
	};
	const parseCsvRows = (text) => {
		const rows = [];
		let row = [];
		let cell = "";
		let quoted = false;
		for (let index = 0; index < text.length; index += 1) {
			const character = text[index];
			if (character === '"') {
				if (quoted && text[index + 1] === '"') {
					cell += '"';
					index += 1;
				} else quoted = !quoted;
			} else if (character === "," && !quoted) {
				row.push(cell);
				cell = "";
			} else if ((character === "\n" || character === "\r") && !quoted) {
				if (character === "\r" && text[index + 1] === "\n") index += 1;
				row.push(cell);
				rows.push(row);
				row = [];
				cell = "";
			} else cell += character;
		}
		if (quoted) throw new Error("CSV의 큰따옴표가 닫히지 않았습니다.");
		if (cell || row.length) rows.push([...row, cell]);
		return rows.filter((entry) => entry.some((value) => normalizeText(value)));
	};
	const parseCsv = (text) => {
		const rows = parseCsvRows(text);
		if (!rows.length) throw new Error("CSV에 읽을 행이 없습니다.");
		const headers = rows[0].map((value) =>
			normalizeText(value).toLocaleLowerCase("ko"),
		);
		const speakerIndex = headers.findIndex((value) =>
			["speaker", "화자"].includes(value),
		);
		const textIndex = headers.findIndex((value) =>
			["text", "대사"].includes(value),
		);
		if (textIndex < 0)
			throw new Error("CSV 첫 행에 text/대사 열이 필요합니다.");
		return rows
			.slice(1)
			.map((row, index) => ({
				id: makeId("csv", index),
				text: normalizeText(row[textIndex]),
				speaker:
					normalizeText(speakerIndex < 0 ? "" : row[speakerIndex]) || NARRATOR,
				voiceId: "",
			}))
			.filter((entry) => entry.text);
	};
	const parseSrt = (text) => {
		const cues = normalizeText(text).split(/\n\s*\n+/);
		const lines = cues.map((cue) => cue.split("\n"));
		return lines
			.map((cue) => {
				if (/^\d+$/.test(normalizeText(cue[0]))) cue.shift();
				if (/-->/.test(cue[0] || "")) cue.shift();
				return normalizeText(cue.join("\n"));
			})
			.filter(Boolean)
			.join("\n\n");
	};
	const readUint16 = (view, offset) => view.getUint16(offset, true);
	const readUint32 = (view, offset) => view.getUint32(offset, true);
	const locateDocxEntry = (buffer) => {
		const view = new DataView(buffer);
		for (
			let offset = view.byteLength - 22;
			offset >= Math.max(0, view.byteLength - 65_557);
			offset -= 1
		) {
			if (readUint32(view, offset) !== 0x06054b50) continue;
			const entries = readUint16(view, offset + 10);
			let pointer = readUint32(view, offset + 16);
			for (let count = 0; count < entries; count += 1) {
				if (
					pointer + 46 > view.byteLength ||
					readUint32(view, pointer) !== 0x02014b50
				)
					throw new Error("DOCX 중앙 디렉터리를 읽을 수 없습니다.");
				const flags = readUint16(view, pointer + 8);
				const compression = readUint16(view, pointer + 10);
				const compressedSize = readUint32(view, pointer + 20);
				const filenameLength = readUint16(view, pointer + 28);
				const extraLength = readUint16(view, pointer + 30);
				const commentLength = readUint16(view, pointer + 32);
				const localOffset = readUint32(view, pointer + 42);
				const filename = new TextDecoder().decode(
					new Uint8Array(buffer, pointer + 46, filenameLength),
				);
				if (filename === "word/document.xml")
					return { flags, compression, compressedSize, localOffset };
				pointer += 46 + filenameLength + extraLength + commentLength;
			}
			break;
		}
		throw new Error("DOCX에서 word/document.xml을 찾지 못했습니다.");
	};
	const inflateDocxEntry = async (buffer, entry) => {
		if (entry.flags & 0x1)
			throw new Error("암호화된 DOCX는 브라우저에서 읽을 수 없습니다.");
		const view = new DataView(buffer);
		if (readUint32(view, entry.localOffset) !== 0x04034b50)
			throw new Error("DOCX 로컬 파일 헤더가 올바르지 않습니다.");
		const filenameLength = readUint16(view, entry.localOffset + 26);
		const extraLength = readUint16(view, entry.localOffset + 28);
		const start = entry.localOffset + 30 + filenameLength + extraLength;
		const compressed = new Uint8Array(buffer, start, entry.compressedSize);
		if (entry.compression === 0) return compressed;
		if (entry.compression !== 8 || typeof DecompressionStream !== "function")
			throw new Error(
				"이 브라우저는 압축된 DOCX를 읽을 수 없습니다. TXT, CSV 또는 SRT를 사용해 주세요.",
			);
		const stream = new Blob([compressed])
			.stream()
			.pipeThrough(new DecompressionStream("deflate-raw"));
		const reader = stream.getReader();
		const chunks = [];
		let total = 0;
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > MAX_DOCX_OUTPUT) {
				await reader.cancel();
				throw new Error("DOCX 압축 해제 결과가 1MiB 제한을 넘었습니다.");
			}
			chunks.push(value);
		}
		const result = new Uint8Array(total);
		let pointer = 0;
		chunks.forEach((chunk) => {
			result.set(chunk, pointer);
			pointer += chunk.byteLength;
		});
		return result;
	};
	const parseDocx = async (file) => {
		if (file.size > MAX_DOCX_BYTES)
			throw new Error("DOCX는 압축 파일 크기 5MiB 이하만 읽을 수 있습니다.");
		const buffer = await file.arrayBuffer();
		const xml = new TextDecoder("utf-8", { fatal: false }).decode(
			await inflateDocxEntry(buffer, locateDocxEntry(buffer)),
		);
		if (/<!DOCTYPE|<!ENTITY/i.test(xml))
			throw new Error("DTD 또는 엔티티가 포함된 DOCX는 읽을 수 없습니다.");
		const documentXml = new DOMParser().parseFromString(xml, "application/xml");
		if (documentXml.querySelector("parsererror"))
			throw new Error("DOCX 문서 XML을 읽지 못했습니다.");
		const lines = Array.from(documentXml.getElementsByTagNameNS("*", "p"))
			.map((paragraph) => normalizeText(paragraph.textContent || ""))
			.filter(Boolean);
		return lines.join("\n\n");
	};
	const fileKind = (file) =>
		file.name.split(".").pop()?.toLocaleLowerCase("ko") || "";
	const parseImporterInput = async (value, kind, detect) => {
		let raw = value;
		if (normalizeText(raw).length > MAX_TEXT)
			throw new Error("읽은 대본은 200,000자 이하만 지원합니다.");
		let parsed;
		if (kind === "csv") parsed = parseCsv(raw);
		else {
			if (kind === "srt") raw = parseSrt(raw);
			parsed = splitPlainText(raw, detect);
		}
		if (!parsed.length) throw new Error("가져올 문단이 없습니다.");
		if (parsed.length > MAX_PARAGRAPHS)
			throw new Error("한 번에 200문단 이하만 가져올 수 있습니다.");
		return parsed;
	};
	const invalidateImport = () => {
		state.importer.paragraphs = [];
		state.importer.parsedFrom = "";
		state.importer.error = "";
		state.importer.status = "입력이 바뀌어 이전 미리보기를 다시 읽어야 합니다.";
	};
	const focusImportResult = (host) => {
		if (!host.isConnected) return;
		const heading =
			[...host.querySelectorAll("h3")].find(
				(h) => h.textContent === "문단 미리보기",
			) || host.querySelector("h2");
		if (heading) {
			heading.tabIndex = -1;
			heading.focus({ preventScroll: true });
		}
		announce(state.importer.error || state.importer.status);
	};
	const restoreDraftFocus = (host, control) => {
		const start = control.selectionStart;
		const end = control.selectionEnd;
		renderImporter(host);
		const next = host.querySelector('[aria-label="가져올 대본 붙여넣기"]');
		next?.focus({ preventScroll: true });
		next?.setSelectionRange(start, end);
	};
	const parseImporterDraft = async (host, file) => {
		const importer = state.importer;
		if (importer.busy && !file) return;
		importer.busy = false;
		const requestId = ++importer.requestId;
		importer.parsedFrom = null;
		if (file && file.size > MAX_DOCX_BYTES) {
			importer.error = "가져올 파일은 5MiB 이하만 지원합니다.";
			importer.status = "";
			renderImporter(host);
			focusImportResult(host);
			return;
		}
		importer.error = "";
		importer.busy = true;
		importer.status = "파일과 문단을 읽는 중입니다…";
		renderImporter(host);
		focusImportResult(host);
		try {
			const kind = file ? fileKind(file) : importer.sourceKind;
			if (file && !["txt", "csv", "srt", "docx"].includes(kind))
				throw new Error("TXT, CSV, SRT, DOCX 파일만 가져올 수 있습니다.");
			const text = file
				? kind === "docx"
					? await parseDocx(file)
					: await file.text()
				: importer.draft;
			if (requestId !== importer.requestId) return;
			const parsingKind = kind === "docx" ? "txt" : kind;
			const parsed = await parseImporterInput(
				text,
				parsingKind,
				importer.detection,
			);
			if (requestId !== importer.requestId) return;
			importer.draft = text;
			importer.sourceKind = kind === "docx" ? "txt" : kind;
			importer.sourceLabel = file
				? kind === "docx"
					? `${file.name}에서 추출한 텍스트`
					: file.name
				: importer.sourceLabel;
			importer.paragraphs = parsed;
			importer.parsedFrom = importer.draft;
			importer.status = `${parsed.length}개 문단을 검토용으로 만들었습니다.${
				kind === "docx"
					? " 이후 다시 읽기는 화자 표기를 보존한 추출 텍스트를 사용합니다."
					: ""
			}`;
			announce("대본 가져오기 미리보기를 만들었습니다.");
		} catch (error) {
			if (requestId !== importer.requestId) return;
			importer.error =
				error instanceof Error ? error.message : "대본을 읽지 못했습니다.";
			importer.status = "";
		}
		importer.busy = false;
		renderImporter(host);
		focusImportResult(host);
	};

	const voiceSelect = (value, label) => {
		const field = node("label", "script-tool-field");
		field.append(node("span", "script-tool-field-label", label));
		const control = select("script-tool-select");
		control.append(option("", "성우를 선택하세요"));
		voices().forEach((voice) => {
			control.append(option(voice.id, `${voice.name} · ${voice.provider}`));
		});
		control.value = value || "";
		field.append(control);
		return { field, control };
	};
	const importerSpeakerAssignments = () => {
		const groups = new Map();
		state.importer.paragraphs.forEach((paragraph) => {
			if (!groups.has(paragraph.speaker))
				groups.set(paragraph.speaker, paragraph.voiceId || "");
		});
		return groups;
	};
	const renderImportReview = (host, root) => {
		const importer = state.importer;
		if (!importer.paragraphs.length) return;
		const sourceChanged = importer.parsedFrom !== importer.draft;
		if (sourceChanged)
			root.append(
				status(
					"입력이 바뀌었습니다. 미리보기를 다시 읽어야 합니다.",
					"warning",
				),
			);
		const assignment = node("section", "script-tool-section");
		assignment.append(node("h3", "", "화자별 기본 성우"));
		assignment.append(
			node(
				"p",
				"script-tool-help",
				"화자별 선택은 해당 화자의 모든 문단에 적용됩니다. 문단별 선택은 아래에서 따로 바꿀 수 있어요.",
			),
		);
		importerSpeakerAssignments().forEach((voiceId, speaker) => {
			const { field, control } = voiceSelect(voiceId, speaker);
			control.addEventListener("change", () => {
				importer.paragraphs.forEach((paragraph) => {
					if (paragraph.speaker === speaker) paragraph.voiceId = control.value;
				});
				renderImporter(host);
			});
			assignment.append(field);
		});
		root.append(assignment);

		const preview = node("section", "script-tool-section");
		preview.append(node("h3", "", "문단 미리보기"));
		const list = node("div", "script-tool-paragraph-list");
		importer.paragraphs.forEach((paragraph, index) => {
			const row = node("article", "script-tool-paragraph");
			const meta = node("div", "script-tool-row-meta");
			meta.append(node("span", "script-tool-index", `${index + 1}`));
			const speaker = input("text", "script-tool-input");
			speaker.value = paragraph.speaker;
			speaker.maxLength = 50;
			speaker.setAttribute("aria-label", `${index + 1}번 문단 화자`);
			speaker.addEventListener("input", () => {
				paragraph.speaker = normalizeText(speaker.value) || NARRATOR;
			});
			meta.append(speaker);
			const controls = node("div", "script-tool-row-controls");
			const { field: voiceField, control: voiceControl } = voiceSelect(
				paragraph.voiceId,
				"성우",
			);
			voiceField.classList.add("script-tool-inline-field");
			voiceControl.addEventListener("change", () => {
				paragraph.voiceId = voiceControl.value;
			});
			controls.append(voiceField);
			const remove = button("삭제", "script-tool-text-button");
			remove.setAttribute("aria-label", `${index + 1}번 문단 삭제`);
			remove.addEventListener("click", () => {
				importer.paragraphs.splice(index, 1);
				renderImporter(host);
			});
			controls.append(remove);
			const text = document.createElement("textarea");
			text.className = "script-tool-textarea script-tool-paragraph-text";
			text.value = paragraph.text;
			text.rows = 3;
			text.maxLength = MAX_TEXT;
			text.setAttribute("aria-label", `${index + 1}번 문단 내용`);
			text.addEventListener("input", () => {
				paragraph.text = text.value;
			});
			row.append(meta, controls, text);
			list.append(row);
		});
		const add = button("문단 추가", "button button-secondary");
		add.addEventListener("click", () => {
			if (importer.paragraphs.length >= MAX_PARAGRAPHS) {
				importer.error = "문단은 200개까지만 추가할 수 있습니다.";
				return renderImporter(host);
			}
			importer.paragraphs.push({
				id: makeId("manual", importer.paragraphs.length),
				text: "",
				speaker: NARRATOR,
				voiceId: "",
			});
			renderImporter(host);
		});
		preview.append(list, add);
		root.append(preview);

		const finish = node("section", "script-tool-finish");
		finish.append(node("h3", "", "작업실에 반영"));
		const choice = node("fieldset", "script-tool-choice");
		choice.append(node("legend", "", "반영 방식"));
		[
			["replace", "현재 원문 교체"],
			["append", "선택한 문단 뒤에 추가"],
		].forEach(([value, label]) => {
			const item = node("label", "script-tool-radio");
			const radio = input("radio");
			radio.name = "script-tool-import-mode";
			radio.value = value;
			radio.checked = importer.mode === value;
			radio.addEventListener("change", () => {
				importer.mode = value;
			});
			item.append(radio, document.createTextNode(label));
			choice.append(item);
		});
		const confirm = button("문단 계획 확인 후 반영", "button button-primary");
		confirm.disabled = sourceChanged || importer.busy;
		confirm.addEventListener("click", () => {
			importer.error = "";
			if (importer.parsedFrom !== importer.draft) {
				importer.error =
					"입력이 바뀌었습니다. 미리보기를 다시 만든 뒤 반영해 주세요.";
				return renderImporter(host);
			}
			const plan = importer.paragraphs
				.map((paragraph, index) => ({
					...paragraph,
					id: paragraph.id || makeId("plan", index),
					text: normalizeText(paragraph.text),
					speaker: normalizeText(paragraph.speaker) || NARRATOR,
					provider:
						voices().find((voice) => voice.id === paragraph.voiceId)
							?.provider || "",
					emotion: paragraph.emotion || "normal",
					intensity: paragraph.intensity ?? 1,
				}))
				.filter((paragraph) => paragraph.text);
			if (!plan.length) {
				importer.error = "내용이 있는 문단을 하나 이상 남겨 주세요.";
				return renderImporter(host);
			}
			const unresolved = plan.find((paragraph) => !paragraph.voiceId);
			if (unresolved) {
				importer.error = `‘${unresolved.speaker}’ 화자에 성우를 배정해 주세요.`;
				return renderImporter(host);
			}
			const success = bridge().applyScriptPlan?.(
				{ text: paragraphsToText(plan), segments: plan },
				importer.mode,
			);
			if (success) {
				importer.status = `${importer.mode === "replace" ? "교체" : "삽입"} 계획을 작업실에 반영했습니다.`;
				importer.error = "";
				announce("문단 계획을 작업실에 반영했습니다.");
			} else
				importer.status =
					"반영하지 않았습니다. 수정한 초안은 유지됩니다. 문단과 성우 배정을 확인한 뒤 다시 반영할 수 있습니다.";
			renderImporter(host);
		});
		finish.append(
			choice,
			confirm,
			node(
				"p",
				"script-tool-footer-note",
				"실제 API나 파일 업로드는 연결하지 않았습니다. 브라우저 안에서만 읽고, 확인 전에는 원문을 바꾸지 않습니다.",
			),
		);
		root.append(finish);
	};
	const renderImporter = (host) => {
		if (!host) return;
		host.replaceChildren();
		const importer = state.importer;
		const root = node("section", "script-tool script-tool-importer");

		root.append(node("h2", "", "원문을 문단 계획으로 준비합니다"));
		root.append(
			node(
				"p",
				"script-tool-lead",
				"붙여넣거나 이 기기의 TXT, CSV, SRT, DOCX를 읽어 화자와 성우를 확인합니다. 파일은 전송하거나 저장하지 않습니다.",
			),
		);
		const source = node("section", "script-tool-section");
		const text = document.createElement("textarea");
		text.className = "script-tool-textarea script-tool-source";
		text.rows = 7;
		text.maxLength = MAX_TEXT;
		text.placeholder = "대본을 붙여넣으세요. 빈 줄마다 문단을 나눕니다.";
		text.value = importer.draft;
		text.setAttribute("aria-label", "가져올 대본 붙여넣기");
		text.addEventListener("input", (event) => {
			importer.requestId += 1;
			importer.busy = false;
			importer.draft = text.value;
			importer.sourceLabel = "직접 편집한 대본";
			if (importer.paragraphs.length) {
				invalidateImport();
				if (!event.isComposing) restoreDraftFocus(host, text);
			} else if (importer.status || importer.error) {
				importer.status = "";
				importer.error = "";
				if (!event.isComposing) restoreDraftFocus(host, text);
			}
		});
		text.addEventListener("compositionend", () =>
			restoreDraftFocus(host, text),
		);
		const controls = node("div", "script-tool-source-controls");
		const fromStudio = button("작업실 대본 불러오기");
		fromStudio.addEventListener("click", () => {
			const sourceText = currentSource();
			if (!sourceText) {
				importer.error =
					"작업실 대본이 비어 있습니다. 대본을 입력하거나 파일을 선택해 주세요.";
				renderImporter(host);
				return;
			}
			if (sourceText.length > MAX_TEXT) {
				importer.error =
					"대본은 200,000자까지 불러올 수 있습니다. 분량을 줄여 주세요.";
				renderImporter(host);
				return;
			}
			const segments = bridge().getSegments?.();
			const paragraphs = segments?.length
				? clone(segments)
				: splitPlainText(sourceText, importer.detection).map((part) => ({
						...part,
						voiceId: activeVoice()?.id || "",
					}));
			if (paragraphs.length > MAX_PARAGRAPHS) {
				importer.error =
					"문단은 200개까지 불러올 수 있습니다. 대본을 나눠 주세요.";
				renderImporter(host);
				return;
			}
			if (
				(importer.draft || importer.paragraphs.length) &&
				!window.confirm(
					"현재 가져오기 초안을 작업실 대본으로 바꿀까요? 아직 반영하지 않은 수정은 사라집니다.",
				)
			)
				return;
			importer.requestId += 1;
			importer.busy = false;
			importer.sourceKind = "txt";
			importer.sourceLabel = "작업실 대본";
			importer.draft = sourceText;
			importer.parsedFrom = sourceText;
			importer.paragraphs = paragraphs;
			importer.mode = "replace";
			importer.error = "";
			importer.status =
				"작업실 대본과 화자·성우·감정 설정을 불러왔습니다. 문단을 수정했다면 감정도 다시 검토해 주세요. 반영 전에는 원문이 유지됩니다.";
			renderImporter(host);
			const preview = [...host.querySelectorAll("h3")].find(
				(heading) => heading.textContent === "문단 미리보기",
			);
			if (preview) {
				preview.tabIndex = -1;
				preview.focus();
			}
		});
		const formatLabel = node("label", "script-tool-field");
		formatLabel.append(node("span", "", "입력 형식"));
		const format = select("script-tool-select");
		[
			["txt", "일반 대본"],
			["csv", "CSV 표"],
			["srt", "SRT 자막 원문"],
		].forEach(([value, name]) => {
			format.append(option(value, name));
		});
		format.value = importer.sourceKind;
		format.addEventListener("change", () => {
			importer.requestId++;
			importer.sourceKind = format.value;
			invalidateImport();
			renderImporter(host);
			host.querySelector('[aria-label="가져올 대본 붙여넣기"]')?.focus();
		});
		formatLabel.append(format);

		const file = input("file", "script-tool-file");
		file.accept =
			".txt,.csv,.srt,.docx,text/plain,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
		file.setAttribute("aria-label", "로컬 대본 파일 선택");
		file.hidden = true;
		const filePick = button(
			importer.sourceLabel !== "붙여넣은 텍스트"
				? "다른 대본 파일 선택"
				: "대본 파일 선택",
			"button button-secondary",
		);
		filePick.addEventListener("click", () => file.click());
		const sourceLabel = node(
			"span",
			"script-tool-source-label",
			importer.sourceLabel,
		);
		file.addEventListener("change", () => {
			const selected = file.files?.[0];
			if (selected) parseImporterDraft(host, selected);
		});
		const detection = node("label", "script-tool-check");
		const check = input("checkbox");
		check.checked = importer.detection;
		check.addEventListener("change", () => {
			importer.requestId += 1;
			importer.busy = false;
			importer.detection = check.checked;
			if (importer.paragraphs.length) invalidateImport();
			renderImporter(host);
		});
		detection.append(
			check,
			document.createTextNode("‘이름: 대사’와 ‘[이름] 대사’에서 화자 감지"),
		);
		const parse = button(
			importer.busy ? "읽는 중…" : "문단 미리보기 만들기",
			"button button-primary",
		);
		parse.disabled = importer.busy;
		parse.addEventListener("click", () => parseImporterDraft(host));
		controls.append(
			fromStudio,
			formatLabel,
			filePick,
			sourceLabel,
			file,
			detection,
			parse,
		);
		source.append(
			text,
			controls,
			node(
				"p",
				"script-tool-help",
				"화자 감지는 붙여넣기·TXT·SRT·DOCX 추출 텍스트에 적용합니다. CSV는 첫 행의 speaker/화자와 text/대사 열을 그대로 사용합니다. 파일을 다시 읽을 때 같은 형식을 유지하며, DOCX는 추출된 텍스트를 다시 읽습니다.",
			),
		);
		root.append(source);
		if (importer.error) root.append(status(importer.error, "error"));
		if (importer.status) root.append(status(importer.status));
		renderImportReview(host, root);
		host.append(root);
	};

	const sourceSegments = () => {
		const fromBridge = bridge().getSegments?.();
		if (Array.isArray(fromBridge) && fromBridge.length)
			return clone(fromBridge);
		const voice = activeVoice();
		return splitPlainText(currentSource(), false).map((paragraph, index) => ({
			id: paragraph.id || makeId("emotion", index),
			text: paragraph.text,
			speaker: paragraph.speaker || NARRATOR,
			voiceId: voice?.id || "",
			provider: voice?.provider || "",
			emotion: "normal",
			intensity: 1,
		}));
	};
	const proposalFor = (segment) => {
		const text = segment.text.toLocaleLowerCase("ko");
		if (/[!?]{1,}|축하|좋은|반가|기대/.test(text)) return ["happy", 1.25];
		if (/하지만|주의|위험|감소|하락|아쉽/.test(text)) return ["sad", 0.85];
		if (/반드시|중요|핵심|지금|기억/.test(text)) return ["angry", 1.2];
		if (/조용히|비밀|살며시/.test(text)) return ["whisper", 0.65];
		if (/\?$/.test(text)) return ["toneup", 1.1];
		return ["smart", 1];
	};
	const snapshotEmotion = () => {
		state.emotion.history.push(clone(state.emotion.segments));
		if (state.emotion.history.length > 12) state.emotion.history.shift();
	};
	const beginProposal = (host) => {
		const emotion = state.emotion;
		const text = currentSource();
		if (!text) {
			emotion.error = "작업실 원문이 비어 있어 감정 제안을 만들 수 없습니다.";
			return renderEmotion(host);
		}
		window.clearTimeout(emotion.timer);
		const requestId = ++emotion.requestId;
		emotion.status = "규칙 기반 시연 제안을 준비하고 있습니다…";
		emotion.error = "";
		emotion.sourceText = text;
		renderEmotion(host);
		emotion.timer = window.setTimeout(() => {
			if (requestId !== emotion.requestId) return;
			if (emotion.failureMode === "failure") {
				emotion.status = "";
				emotion.error = "시연 제안을 만들지 못했습니다. 다시 시도해 주세요.";
				return renderEmotion(host);
			}
			const candidates = sourceSegments();
			if (candidates.length > MAX_PARAGRAPHS) {
				emotion.status = "";
				emotion.error = "감정 제안은 한 번에 200문단 이하만 지원합니다.";
				return renderEmotion(host);
			}
			const segments = candidates
				.map((segment, index) => {
					const [emotionName, intensity] = proposalFor(segment);
					return {
						id: segment.id || makeId("emotion", index),
						text: normalizeText(segment.text),
						speaker: segment.speaker || NARRATOR,
						voiceId: segment.voiceId || activeVoice()?.id || "",
						provider: segment.provider || activeVoice()?.provider || "",
						emotion: emotionName,
						intensity,
					};
				})
				.filter((segment) => segment.text);
			if (!segments.length) {
				emotion.status = "";
				emotion.error = "제안할 문단이 없습니다.";
				return renderEmotion(host);
			}
			emotion.original = clone(segments);
			emotion.segments = segments;
			emotion.selected = new Set(segments.map((segment) => segment.id));
			emotion.history = [];
			emotion.status = `${segments.length}개 문단에 규칙 기반 시연 제안을 만들었습니다.`;
			renderEmotion(host);
		}, 260);
	};
	const emotionSelect = (value) => {
		const control = select("script-tool-select");
		EMOTIONS.forEach(([id, label]) => {
			control.append(option(id, label));
		});
		control.value = value;
		return control;
	};
	const applyEmotionPlan = (host) => {
		const emotion = state.emotion;
		if (!emotion.segments.length) return;
		if (currentSource() !== emotion.sourceText) {
			emotion.error =
				"원문이 바뀌었습니다. 이전 제안은 적용하지 않고 새로 제안해 주세요.";
			return renderEmotion(host);
		}
		const success = bridge().applyEmotionPlan?.(clone(emotion.segments));
		if (success) {
			emotion.status =
				"감정 계획을 작업실에 반영했습니다. 원문 텍스트는 바꾸지 않았습니다.";
			emotion.error = "";
			announce("감정 계획을 작업실에 반영했습니다.");
		} else
			emotion.error =
				"현재 원문과 문단 계획이 달라 반영하지 않았습니다. 제안을 새로 시작해 주세요.";
		renderEmotion(host);
	};
	const renderEmotionRows = (host, root) => {
		const emotion = state.emotion;
		if (!emotion.segments.length) return;
		const bulk = node("section", "script-tool-bulk");
		const all = node("label", "script-tool-check");
		const allCheck = input("checkbox");
		allCheck.checked = emotion.selected.size === emotion.segments.length;
		allCheck.indeterminate = emotion.selected.size > 0 && !allCheck.checked;
		allCheck.addEventListener("change", () => {
			emotion.selected = allCheck.checked
				? new Set(emotion.segments.map((segment) => segment.id))
				: new Set();
			renderEmotion(host);
		});
		all.append(allCheck, document.createTextNode("전체 선택"));
		const batchEmotion = emotionSelect("normal");
		batchEmotion.setAttribute("aria-label", "선택 문단 감정 일괄 적용");
		const batch = button("선택 문단에 적용", "button button-secondary");
		batch.disabled = !emotion.selected.size;
		batch.addEventListener("click", () => {
			snapshotEmotion();
			emotion.segments.forEach((segment) => {
				if (emotion.selected.has(segment.id))
					segment.emotion = batchEmotion.value;
			});
			emotion.status = `${emotion.selected.size}개 문단에 감정을 적용했습니다.`;
			renderEmotion(host);
		});
		const undo = button("마지막 수정 되돌리기", "button button-secondary");
		undo.disabled = !emotion.history.length;
		undo.addEventListener("click", () => {
			const before = emotion.history.pop();
			if (before) emotion.segments = before;
			renderEmotion(host);
		});
		const reset = button("제안 처음으로", "script-tool-text-button");
		reset.addEventListener("click", () => {
			emotion.segments = clone(emotion.original);
			emotion.history = [];
			emotion.selected = new Set(emotion.segments.map((segment) => segment.id));
			emotion.status = "처음 제안 상태로 되돌렸습니다.";
			renderEmotion(host);
		});
		bulk.append(all, batchEmotion, batch, undo, reset);
		root.append(bulk);

		const list = node("div", "script-tool-emotion-list");
		emotion.segments.forEach((segment, index) => {
			const row = node("article", "script-tool-emotion-row");
			const checkLabel = node(
				"label",
				"script-tool-check script-tool-row-check",
			);
			const check = input("checkbox");
			check.checked = emotion.selected.has(segment.id);
			check.setAttribute("aria-label", `${index + 1}번 문단 선택`);
			check.addEventListener("change", () => {
				if (check.checked) emotion.selected.add(segment.id);
				else emotion.selected.delete(segment.id);
				renderEmotion(host);
			});
			checkLabel.append(
				check,
				node("span", "script-tool-index", `${index + 1}`),
			);
			const copy = node("div", "script-tool-emotion-copy");
			copy.append(node("strong", "", segment.speaker));
			copy.append(node("p", "", segment.text));
			copy.append(node("small", "", voiceLabel(segment.voiceId)));
			const controls = node("div", "script-tool-emotion-controls");
			const emotionControl = emotionSelect(segment.emotion);
			emotionControl.setAttribute("aria-label", `${index + 1}번 문단 감정`);
			emotionControl.addEventListener("change", () => {
				snapshotEmotion();
				segment.emotion = emotionControl.value;
				renderEmotion(host);
			});
			const intensity = input("range", "script-tool-range");
			intensity.min = "0";
			intensity.max = "2";
			intensity.step = "0.05";
			intensity.value = String(segment.intensity);
			const noIntensity =
				segment.provider === "ElevenLabs" || segment.provider === "Fish Audio";
			intensity.disabled = noIntensity;
			intensity.setAttribute("aria-label", `${index + 1}번 문단 강도`);
			const output = node(
				"output",
				"script-tool-range-output",
				noIntensity
					? "태그 표현 · 수치 강도 없음"
					: `${Math.round(segment.intensity * 100)}%`,
			);
			let changingIntensity = false;
			intensity.addEventListener("input", () => {
				if (!changingIntensity) {
					snapshotEmotion();
					changingIntensity = true;
				}
				undo.disabled = false;
				segment.intensity = Number(intensity.value);
				output.textContent = `${Math.round(segment.intensity * 100)}%`;
			});
			intensity.addEventListener("change", () => {
				changingIntensity = false;
			});
			controls.append(emotionControl, intensity, output);
			row.append(checkLabel, copy, controls);
			list.append(row);
		});
		root.append(list);
		const apply = button("감정 계획을 작업실에 반영", "button button-primary");
		apply.addEventListener("click", () => applyEmotionPlan(host));
		root.append(
			apply,
			node(
				"p",
				"script-tool-footer-note",
				"반영은 문단의 감정 메타데이터만 바꿉니다. 이미 배정한 성우와 원문은 유지됩니다.",
			),
		);
	};
	const renderEmotion = (host) => {
		if (!host) return;
		host.replaceChildren();
		const emotion = state.emotion;
		const root = node("section", "script-tool script-tool-emotion");

		root.append(node("h2", "", "문단별 감정 계획을 검토합니다"));
		root.append(
			node(
				"p",
				"script-tool-lead",
				"AI 감정 추론이 아닙니다. 문장 부호와 일부 단어를 기준으로 만든 규칙 기반 시연 제안이며, 적용 전에 문단마다 직접 바꿀 수 있습니다.",
			),
		);
		const toolbar = node("div", "script-tool-emotion-toolbar");
		const simulation = select("script-tool-select");
		simulation.append(
			option("success", "정상 시연"),
			option("failure", "실패 상태 시연"),
		);
		simulation.value = emotion.failureMode;
		simulation.setAttribute("aria-label", "감정 제안 시연 상태");
		simulation.addEventListener("change", () => {
			emotion.failureMode = simulation.value;
		});
		const propose = button(
			emotion.status.includes("준비") ? "제안 준비 중…" : "규칙 기반 제안 시작",
			"button button-primary",
		);
		propose.disabled = emotion.status.includes("준비");
		propose.addEventListener("click", () => beginProposal(host));
		toolbar.append(simulation, propose);
		root.append(toolbar);
		const support = node("aside", "script-tool-provider-note");
		support.append(node("strong", "", "공급자 표현 범위"));
		support.append(
			node(
				"p",
				"",
				"이 문단 계획은 Typecast v30 감정·강도, Eleven v3 연출 태그, Fish Audio 인라인 태그([happy] 또는 (happy))를 기준으로 합니다. ElevenLabs와 Fish Audio에는 숫자 감정 강도를 보내지 않습니다. 실제 모델·성우 지원 여부와 표현 결과는 API 연결 후 확인합니다.",
			),
		);
		root.append(support);
		if (emotion.error) root.append(status(emotion.error, "error"));
		if (emotion.status) root.append(status(emotion.status));
		renderEmotionRows(host, root);
		root.append(
			node(
				"p",
				"script-tool-footer-note",
				"실제 API는 연결되지 않았습니다. 여러 화자가 있는 계획은 작업실의 다중 문단 생성 경로에서 별도로 확인합니다.",
			),
		);
		host.append(root);
	};
	const leave = () => {
		if (state.importer.busy) {
			state.importer.busy = false;
			state.importer.status =
				"파일 읽기를 취소했습니다. 다시 읽을 수 있습니다.";
		}
		state.importer.requestId += 1;
		state.emotion.requestId += 1;
		window.clearTimeout(state.emotion.timer);
		if (state.emotion.status.includes("준비"))
			state.emotion.status =
				"제안이 취소되었습니다. 입력과 이전 검토는 유지합니다.";
	};

	window.TTSScriptTools = { renderImporter, renderEmotion, leave };
})();
