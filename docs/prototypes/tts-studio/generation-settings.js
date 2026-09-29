(() => {
	const clone = (value) => structuredClone(value);
	const escapeHtml = (value) =>
		String(value).replace(
			/[&<>"']/g,
			(character) =>
				({
					"&": "&amp;",
					"<": "&lt;",
					">": "&gt;",
					'"': "&quot;",
					"'": "&#39;",
				})[character],
		);
	const typecastV30Languages =
		"ara ben bul ces dan deu ell eng fin fra hin hrv hun ind ita jpn kor msa nan nld nor pan pol por ron rus slk spa swe tam tgl tha tur ukr vie yue zho".split(
			" ",
		);
	const typecastV21Languages =
		"ara bul ces dan deu ell eng fin fra hrv ind ita jpn kor msa nld pol por ron rus slk spa swe tam tgl ukr zho".split(
			" ",
		);
	const languageLabel = (code) => {
		try {
			const name = new Intl.DisplayNames(["ko"], { type: "language" }).of(code);
			return name ? `${name} (${code})` : code;
		} catch {
			return code;
		}
	};
	const elevenFormats = [
		"mp3_22050_32",
		"mp3_24000_48",
		"mp3_44100_32",
		"mp3_44100_64",
		"mp3_44100_96",
		"mp3_44100_128",
		"mp3_44100_192",
		"pcm_8000",
		"pcm_16000",
		"pcm_22050",
		"pcm_24000",
		"pcm_32000",
		"pcm_44100",
		"pcm_48000",
		"wav_8000",
		"wav_16000",
		"wav_22050",
		"wav_24000",
		"wav_32000",
		"wav_44100",
		"wav_48000",
		"ulaw_8000",
		"alaw_8000",
		"opus_48000_32",
		"opus_48000_64",
		"opus_48000_96",
		"opus_48000_128",
		"opus_48000_192",
	];
	const typecastDefaults = {
		language: "auto",
		expressionMode: "smart",
		emotionPreset: "normal",
		emotionIntensity: "1",
		previousText: "",
		nextText: "",
		volumeMode: "default",
		volume: "100",
		targetLufs: "",
		audioFormat: "mp3",
		audioPitch: "0",
		audioTempo: "1",
		removeSilenceEnabled: false,
		removeSilenceMs: "100",
		seed: "",
	};
	const elevenDefaults = {
		languageCode: "ko",
		format: "mp3_44100_128",
		stability: "0.5",
		similarityBoost: "0.75",
		style: "0",
		speed: "1",
		useSpeakerBoost: true,
		audioTags: "",
		seed: "",
		applyTextNormalization: "auto",
		applyLanguageTextNormalization: false,
		pronunciationDictionaryId1: "",
		pronunciationDictionaryVersion1: "",
		pronunciationDictionaryId2: "",
		pronunciationDictionaryVersion2: "",
		pronunciationDictionaryId3: "",
		pronunciationDictionaryVersion3: "",
		previousText: "",
		nextText: "",
		previousRequestIds: "",
		nextRequestIds: "",
	};
	const fishDefaults = {
		prosodySpeed: "1",
		prosodyVolume: "0",
		temperature: "0.7",
		emotionTags: "",
		format: "mp3",
		sampleRate: "",
		mp3Bitrate: "128",
		opusBitrate: "-1000",
		latency: "normal",
		topP: "0.7",
		chunkLength: "300",
		normalize: true,
		normalizeLoudness: true,
		repetitionPenalty: "1.2",
	};
	const fishModelLabels = {
		"fish-s2.1-pro": "s2.1-pro · 기본·권장",
		"fish-s2.1-pro-free":
			"s2.1-pro-free · 개발·테스트용 무료, 공정 사용 한도·TTFA/DPA 보장 없음",
		"fish-s2-pro": "s2-pro",
		"fish-s1": "s1 · 구형, 한국어를 공식 13개 언어에 명시",
	};
	const defaultsFor = (modelId) => {
		if (modelId === "typecast-ssfm-v21")
			return { ...typecastDefaults, expressionMode: "preset" };
		if (modelId.startsWith("typecast")) return typecastDefaults;
		if (modelId.startsWith("fish-")) return fishDefaults;
		return elevenDefaults;
	};
	const valuesByModel = new Map();
	let currentModelId = "typecast-ssfm-v30";
	let onChange = () => {};
	const field = (label, input, hint = "") =>
		`<label class="setting-field">${label}${input}${hint ? `<small>${hint}</small>` : ""}</label>`;
	const range = (label, key, value, min, max, step, hint) =>
		field(
			label,
			`<span class="range-control"><input type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${escapeHtml(value)}" /><output data-output="${key}">${escapeHtml(value)}</output></span>`,
			hint,
		);
	const text = (label, key, value, type = "text", hint = "") =>
		field(
			label,
			`<input data-setting="${key}" type="${type}" value="${escapeHtml(value)}" />`,
			hint,
		);
	const select = (label, key, value, options, hint = "") =>
		field(
			label,
			`<select data-setting="${key}">${options.map(([optionValue, optionLabel]) => `<option value="${optionValue}"${optionValue === value ? " selected" : ""}>${optionLabel}</option>`).join("")}</select>`,
			hint,
		);
	const optionGroups = (value) => {
		const groups = [
			["MP3", elevenFormats.filter((item) => item.startsWith("mp3_"))],
			["PCM", elevenFormats.filter((item) => item.startsWith("pcm_"))],
			["WAV", elevenFormats.filter((item) => item.startsWith("wav_"))],
			[
				"통신용",
				elevenFormats.filter(
					(item) =>
						item.startsWith("ulaw_") ||
						item.startsWith("alaw_") ||
						item.startsWith("opus_"),
				),
			],
		];
		return groups
			.map(
				([label, formats]) =>
					`<optgroup label="${label}">${formats.map((format) => `<option value="${format}"${format === value ? " selected" : ""}>${formatLabel(format)}</option>`).join("")}</optgroup>`,
			)
			.join("");
	};
	const formatLabel = (format) => {
		const [codec, sampleRate, bitRate] = format.split("_");
		const rate = `${Number(sampleRate) / 1000} kHz`;
		if (codec === "mp3" || codec === "opus")
			return `${codec.toUpperCase()} · ${rate} · ${bitRate} kbps`;
		if (codec === "pcm" || codec === "wav")
			return `${codec.toUpperCase()} · ${rate}`;
		return `${codec === "ulaw" ? "μ-law" : "A-law"} · ${rate}`;
	};
	const modeNotice = (modelId) =>
		modelId === "eleven_v3"
			? "Eleven v3는 안정성(0~1)과 연출 태그를 조절합니다. 태그는 발음용 대본에서 확인할 수 있으며 효과는 실제 청취로 검수해야 합니다."
			: modelId.startsWith("eleven")
				? "Eleven v2·v2.5 계열의 voice_settings는 모델·계정에서 실제 적용 여부를 다시 확인합니다."
				: modelId.startsWith("fish-")
					? "Fish Audio는 감정 강도를 숫자가 아니라 대본 안 태그로만 표현합니다. 태그 효과는 실제 청취로 확인해야 합니다."
					: "Typecast는 v30·v21만 생성 대상으로 둡니다. v31은 문서 충돌로 이 시연에서 제외합니다.";
	const typecastMarkup = (modelId, settings) => {
		const languageOptions = (
			modelId === "typecast-ssfm-v21"
				? typecastV21Languages
				: typecastV30Languages
		).map((code) => [code, languageLabel(code)]);
		return `
		<div class="settings-grid">
			${select("언어", "language", settings.language, [["auto", "자동 감지 (전송 생략)"], ...languageOptions], "모델별 공식 지원 언어 전체를 표시합니다.")}
			${select("출력 형식", "audioFormat", settings.audioFormat, [
				["mp3", "MP3 · 작업실 기본"],
				["wav", "WAV · API 기본 형식"],
			])}
		</div>
		<details class="settings-section" open><summary>기본 설정</summary><div class="settings-grid">
			${range("음높이", "audioPitch", settings.audioPitch, -12, 12, 1)}
			${range("말하기 속도", "audioTempo", settings.audioTempo, 0.5, 2, 0.05)}
		</div></details>
		<details class="settings-section"><summary>감정·표현</summary><div class="settings-grid">
			${select(
				"표현 방식",
				"expressionMode",
				settings.expressionMode,
				modelId === "typecast-ssfm-v21"
					? [
							["preset", "지정 감정"],
							["default", "기본 (프롬프트 생략)"],
						]
					: [
							["smart", "자동 감정"],
							["preset", "지정 감정"],
						],
				"모드별 prompt 객체가 서로 달라 한 번에 하나만 보냅니다.",
			)}
			<div data-conditional="preset">${select(
				"지정 감정",
				"emotionPreset",
				settings.emotionPreset,
				modelId === "typecast-ssfm-v21"
					? [
							["normal", "보통"],
							["happy", "기쁨"],
							["sad", "슬픔"],
							["angry", "화남"],
						]
					: [
							["normal", "보통"],
							["happy", "기쁨"],
							["sad", "슬픔"],
							["angry", "화남"],
							["whisper", "속삭임"],
							["toneup", "높은 톤"],
							["tonedown", "낮은 톤"],
						],
			)}${range("감정 강도", "emotionIntensity", settings.emotionIntensity, 0, 2, 0.1)}</div>
			<div class="setting-field setting-field-wide" data-conditional="smart"><label for="typecast-previous-text">앞 문맥</label><textarea id="typecast-previous-text" data-setting="previousText" rows="2">${escapeHtml(settings.previousText)}</textarea><small>앞·현재·뒤 대본을 바탕으로 v30 Smart Emotion이 감정을 추론합니다. 말투 지시문 입력란이 아닙니다.</small></div>
			<div class="setting-field setting-field-wide" data-conditional="smart"><label for="typecast-next-text">뒤 문맥</label><textarea id="typecast-next-text" data-setting="nextText" rows="2">${escapeHtml(settings.nextText)}</textarea></div>
		</div></details>
		<details class="settings-section"><summary>발음·문맥·재현성 고급 설정</summary><div class="settings-grid">
			${text("시드", "seed", settings.seed, "number", "0 이상의 정수. 비우면 공급자 자동값입니다.")}
			${select(
				"음량 방식",
				"volumeMode",
				settings.volumeMode,
				[
					["default", "기본값 사용 (전송 생략)"],
					["volume", "상대 음량"],
					["lufs", "일정 음량 (LUFS)"],
				],
				"volume과 target_lufs는 동시에 보낼 수 없습니다.",
			)}
			<div data-conditional="volume">${range("상대 음량", "volume", settings.volume, 0, 200, 1)}</div>
			<div data-conditional="lufs">${text("목표 LUFS", "targetLufs", settings.targetLufs, "number", "-70~0. 예: -14는 권장 예시일 뿐 기본값이 아닙니다.")}</div>
			${field("무음 줄이기", `<input data-setting="removeSilenceEnabled" type="checkbox"${settings.removeSilenceEnabled ? " checked" : ""} />`, "끄면 전송하지 않습니다. 켜면 아래 값은 남길 무음 길이입니다.")}
			<div data-conditional="silence">${text("남길 무음", "removeSilenceMs", settings.removeSilenceMs, "number", "0~1,000ms 정수. 0은 감지한 무음을 모두 제거합니다.")}</div>
		</div></details>
	`;
	};
	const elevenMarkup = (modelId, settings) => {
		const v3 = modelId === "eleven_v3";
		const multilingualV2 = modelId === "eleven_multilingual_v2";
		const v25 =
			modelId === "eleven_flash_v2_5" || modelId === "eleven_turbo_v2_5";
		const dictionaries = [1, 2, 3]
			.map(
				(index) =>
					`<div class="dictionary-pair">${text(`${index}번 사전 ID`, `pronunciationDictionaryId${index}`, settings[`pronunciationDictionaryId${index}`], "text")}${text(`${index}번 버전 ID`, `pronunciationDictionaryVersion${index}`, settings[`pronunciationDictionaryVersion${index}`], "text", "비우면 최신 버전")}</div>`,
			)
			.join("");
		return `
			<div class="settings-grid">
				${
					multilingualV2
						? `<p class="model-limit"><strong>언어 코드</strong> Multilingual v2는 language_code를 지원하지 않아 요청에서 제외합니다.</p>`
						: text(
								"언어 코드",
								"languageCode",
								settings.languageCode,
								"text",
								"자동은 auto, 지정은 ISO 639-1 두 글자(예: ko, en, ja). 실제 모델의 지원 언어인지 연결 시 확인합니다.",
							)
				}
				${field("출력 형식", `<select data-setting="format">${optionGroups(settings.format)}</select>`, "28가지 형식 중 모델·계정에서 허용된 값만 실제 전송합니다.")}
			</div>
			<details class="settings-section" open><summary>기본 설정</summary><div class="settings-grid">
				${
					v3
						? `${range("안정성", "stability", settings.stability, 0, 1, 0.01, "낮을수록 다양한 표현, 높을수록 일관된 전달. Creative/Natural/Robust 명칭과 숫자의 고정 대응은 보장하지 않습니다.")}<p class="model-limit"><strong>모델 차이:</strong> v3의 속도·유사도·스타일·화자 부스트는 문서별 지원 설명이 달라 이 시안에서 조절하지 않습니다.</p>`
						: `${range("속도", "speed", settings.speed, 0.7, 1.2, 0.05, "보수적 UI 범위이며 API 절대 한도는 아닙니다.")}${range("안정성", "stability", settings.stability, 0, 1, 0.01)}${range("유사도", "similarityBoost", settings.similarityBoost, 0, 1, 0.01)}${range("스타일", "style", settings.style, 0, 1, 0.01, "0~1은 보수적 UI 범위입니다.")}${field("화자 부스트", `<input data-setting="useSpeakerBoost" type="checkbox"${settings.useSpeakerBoost ? " checked" : ""} />`, `${v25 ? "v2.5는 실제 적용·정규화 권한을 계정에서 확인합니다." : "v2 계열에서만 보냅니다."}`)}`
				}
			</div></details>
			<details class="settings-section"><summary>감정·표현</summary><div class="settings-grid">${v3 ? `<div class="setting-field setting-field-wide"><label for="eleven-tags">연출 태그</label><input id="eleven-tags" data-setting="audioTags" value="${escapeHtml(settings.audioTags)}" placeholder="예: [excited] 또는 [whispers]" /><small>입력한 태그는 원문을 보존한 채 발음용 대본 앞에 적용됩니다. 감정 효과는 성우에 따라 다르며 실제 청취가 필요합니다.</small></div>` : `<p class="model-limit">연출 태그는 Eleven v3에서 설정할 수 있습니다. 이 모델에서는 안정성·스타일 조절을 사용하세요.</p>`}</div></details>
			<details class="settings-section"><summary>발음·문맥·재현성 고급 설정</summary><div class="settings-grid">
				${text("시드", "seed", settings.seed, "number", "0 이상의 정수. 비우면 공급자 자동값입니다.")}
				${select(
					"텍스트 정규화",
					"applyTextNormalization",
					settings.applyTextNormalization,
					[
						["auto", "자동"],
						["on", "사용"],
						["off", "사용 안 함"],
					],
				)}
				${field("일본어 언어별 정규화", `<input data-setting="applyLanguageTextNormalization" type="checkbox"${settings.applyLanguageTextNormalization ? " checked" : ""}${!multilingualV2 && settings.languageCode !== "ja" ? " disabled" : ""} />`, "일본어만 지원하며 지연이 늘 수 있습니다.")}
				<div class="setting-field setting-field-wide"><span>발음 사전 locator (최대 3개)</span>${dictionaries}<small>사전 ID는 별도 사전 API에서 준비합니다. ID와 버전 ID를 함께 보관해 재현성을 높일 수 있습니다.</small></div>
				${v3 ? `<p class="model-limit setting-field-wide">Eleven v3는 request stitching을 지원하지 않습니다. 앞·뒤 문맥과 요청 ID는 이 모델의 요청에서 제외합니다.</p>` : `<div class="setting-field setting-field-wide"><label for="previous-text">이전 문맥</label><textarea id="previous-text" data-setting="previousText" rows="2">${escapeHtml(settings.previousText)}</textarea><small>앞·뒤 request ID가 있으면 이 텍스트는 API에서 무시됩니다. 프리셋에는 저장하지 않습니다.</small></div><div class="setting-field setting-field-wide"><label for="next-text">다음 문맥</label><textarea id="next-text" data-setting="nextText" rows="2">${escapeHtml(settings.nextText)}</textarea></div>${text("이전 요청 ID", "previousRequestIds", settings.previousRequestIds, "text", "쉼표로 최대 3개. 2시간 이내 완료 생성만 사용합니다.")}${text("다음 요청 ID", "nextRequestIds", settings.nextRequestIds, "text", "쉼표로 최대 3개. 프리셋에서는 제외합니다.")}`}
			</div></details>
			<details class="request-coverage"><summary>서버 자동 처리와 호환성 보류</summary><p><strong>자동:</strong> voice_id, text, model_id, xi-api-key, Content-Type, enable_logging과 request-id 기록은 서버가 처리합니다. optimize_streaming_latency와 use_pvc_as_ivc는 deprecated/문서 충돌로 신규 요청에서 보내지 않습니다.</p><p><strong>지원 확인:</strong> 출력 형식·계정 권한, v3 voice_settings와 태그 품질, 텍스트 정규화 권한은 실제 연결에서 확인합니다.</p></details>
		`;
	};
	const fishSampleRateOptions = (format) => {
		if (format === "opus") return [["48000", "48 kHz (고정, 유일 옵션)"]];
		if (format === "mp3")
			return [
				["", "기본값 사용 (44.1 kHz)"],
				["32000", "32 kHz"],
				["44100", "44.1 kHz"],
			];
		return [
			["", "기본값 사용 (44.1 kHz)"],
			["8000", "8 kHz"],
			["16000", "16 kHz"],
			["24000", "24 kHz"],
			["32000", "32 kHz"],
			["44100", "44.1 kHz"],
		];
	};
	const fishMarkup = (modelId, settings) => {
		const isS1 = modelId === "fish-s1";
		const isFree = modelId === "fish-s2.1-pro-free";
		return `
			<div class="settings-grid">
				${select("출력 형식", "format", settings.format, [
					["mp3", "MP3 · 기본"],
					["wav", "WAV"],
					["pcm", "PCM"],
					["opus", "Opus"],
				])}
			</div>
			<details class="settings-section" open><summary>기본 설정</summary><div class="settings-grid">
				${range("말하기 속도", "prosodySpeed", settings.prosodySpeed, 0.5, 2, 0.05, "prosody.speed")}
				${range("음량(dB)", "prosodyVolume", settings.prosodyVolume, -20, 20, 1, "prosody.volume. 문서에 범위가 없어 UI 보수 범위이며 API 절대 한도는 아닙니다.")}
				${range("표현력", "temperature", settings.temperature, 0, 1, 0.05, "temperature. 높을수록 다양하고 낮을수록 일관된 표현입니다.")}
			</div></details>
			<details class="settings-section"><summary>감정·연기 태그</summary><div class="settings-grid">
				<div class="setting-field setting-field-wide"><label for="fish-emotion-tags">감정·연출 태그</label><input id="fish-emotion-tags" data-setting="emotionTags" value="${escapeHtml(settings.emotionTags)}" placeholder="${isS1 ? "예: (happy)" : "예: [happy] 또는 [whispers sweetly]"}" /><small>${isS1 ? "s1은 괄호 태그 (happy)만 사용합니다." : "s2 계열은 대괄호 자연어 태그 [happy], [very excited]를 사용합니다."} 입력한 태그는 원문을 보존한 채 발음용 대본 앞에 적용됩니다. 휴지는 모델과 무관하게 (break), (long-break), (breath)처럼 괄호로 표기합니다. 효과는 성우·모델에 따라 다르며 실제 청취로 확인해야 합니다.</small></div>
				${!isS1 ? `<p class="model-limit setting-field-wide">s2 계열은 83개 이상 언어를 자동 감지합니다. 한국어를 이름으로 명시한 공식 지원 목록은 s1뿐이므로 한국어 품질은 실제 청취로 확인해 주세요.</p>` : ""}
			</div></details>
			<details class="settings-section"><summary>발음·형식·재현성 고급 설정</summary><div class="settings-grid">
				${select("샘플레이트", "sampleRate", settings.sampleRate, fishSampleRateOptions(settings.format), "형식을 바꾸면 선택을 다시 확인해 주세요.")}
				${
					settings.format === "mp3"
						? select("MP3 비트레이트", "mp3Bitrate", settings.mp3Bitrate, [
								["64", "64 kbps"],
								["128", "128 kbps · 기본"],
								["192", "192 kbps"],
							])
						: ""
				}
				${
					settings.format === "opus"
						? select(
								"Opus 비트레이트",
								"opusBitrate",
								settings.opusBitrate,
								[
									["-1000", "자동"],
									["24000", "24 kbps"],
									["32000", "32 kbps"],
									["48000", "48 kbps"],
									["64000", "64 kbps"],
								],
								"요청 필드 문서의 기본값은 자동(-1000)이지만 출력 형식 문서는 32kbps를 기본으로 설명해 문서 간 불일치가 있습니다.",
							)
						: ""
				}
				${select(
					"지연 모드",
					"latency",
					settings.latency,
					[
						["low", "낮음(low)"],
						["normal", "보통(normal) · 기본"],
						["balanced", "균형(balanced)"],
					],
					"문서마다 normal·balanced의 우선순위 설명이 달라 실제 체감은 연결 후 확인합니다.",
				)}
				${range("다양성(top_p)", "topP", settings.topP, 0, 1, 0.05)}
				${range("청크 길이", "chunkLength", settings.chunkLength, 100, 300, 10, "엔드포인트 문서 기본값은 300, 핵심 가이드 예시는 200으로 서로 달라 이 시연은 300을 기본값으로 둡니다.")}
				${field("텍스트 정규화", `<input data-setting="normalize" type="checkbox"${settings.normalize ? " checked" : ""} />`, "영어·중국어 대상 숫자·날짜 낭독을 안정화합니다.")}
				${field("음량 정규화", `<input data-setting="normalizeLoudness" type="checkbox"${settings.normalizeLoudness ? " checked" : ""} />`, "prosody.normalize_loudness")}
				${range("반복 억제", "repetitionPenalty", settings.repetitionPenalty, 1, 2, 0.05, "repetition_penalty. 1.0 초과 시 반복을 줄입니다. UI 보수 범위이며 API 절대 한도는 아닙니다.")}
			</div></details>
			<details class="request-coverage"><summary>서버 자동 처리와 호환성 보류</summary><p><strong>자동:</strong> 모델(${fishModelLabels[modelId] || modelId})은 body가 아니라 요청 헤더 model로 전송하며 서버가 처리합니다. max_new_tokens, min_chunk_length, early_stop_threshold, condition_on_previous_chunks, features는 서버 자동 또는 후속 범위로 이 시연에서 노출하지 않습니다.</p><p><strong>과금:</strong> ${isFree ? "s2.1-pro-free는 무료입니다." : "US $15.00 / 백만 UTF-8 바이트 기준입니다(문서 예시)."}</p></details>
		`;
	};
	const render = () => {
		const target = document.querySelector("#model-settings");
		if (!target) return;
		const settings = getSettings(currentModelId);
		target.innerHTML = `${
			currentModelId.startsWith("typecast")
				? typecastMarkup(currentModelId, settings)
				: currentModelId.startsWith("fish-")
					? fishMarkup(currentModelId, settings)
					: elevenMarkup(currentModelId, settings)
		}<p class="settings-capability">${modeNotice(currentModelId)}</p>`;
		const summary = document.querySelector("#settings-summary");
		if (summary) summary.textContent = summaryFor(currentModelId, settings);
		bindControls(target);
	};
	const bindControls = (target) => {
		target.addEventListener("input", updateFromControl);
		target.addEventListener("change", updateFromControl);
		const mode = target.querySelector('[data-setting="expressionMode"]');
		if (mode) applyConditionals();
		updateLanguageNormalization();
	};
	const updateFromControl = (event) => {
		const control = event.target.closest("[data-setting]");
		if (!control) return;
		const settings = getSettings(currentModelId);
		settings[control.dataset.setting] =
			control.type === "checkbox" ? control.checked : control.value;
		if (
			control.dataset.setting === "format" &&
			currentModelId.startsWith("fish-")
		) {
			render();
			showErrors([]);
			refreshSummary();
			onChange(clone(settings));
			return;
		}
		const output = document.querySelector(
			`[data-output="${control.dataset.setting}"]`,
		);
		if (output) output.value = control.value;
		if (
			["expressionMode", "volumeMode", "removeSilenceEnabled"].includes(
				control.dataset.setting,
			)
		)
			applyConditionals();
		if (control.dataset.setting === "languageCode") {
			if (settings.languageCode !== "ja")
				settings.applyLanguageTextNormalization = false;
			updateLanguageNormalization();
		}
		showErrors([]);
		refreshSummary();
		onChange(clone(settings));
	};
	const applyConditionals = () => {
		const settings = getSettings(currentModelId);
		document.querySelectorAll("[data-conditional]").forEach((element) => {
			const visible =
				element.dataset.conditional === settings.expressionMode ||
				element.dataset.conditional === settings.volumeMode ||
				(element.dataset.conditional === "silence" &&
					settings.removeSilenceEnabled);
			element.hidden = !visible;
		});
	};
	const updateLanguageNormalization = () => {
		const input = document.querySelector(
			'[data-setting="applyLanguageTextNormalization"]',
		);
		if (!input) return;
		const settings = getSettings(currentModelId);
		input.disabled =
			currentModelId !== "eleven_multilingual_v2" &&
			settings.languageCode !== "ja";
		input.checked = !input.disabled && settings.applyLanguageTextNormalization;
	};
	const getSettings = (modelId = currentModelId) => {
		if (!valuesByModel.has(modelId))
			valuesByModel.set(modelId, clone(defaultsFor(modelId)));
		return valuesByModel.get(modelId);
	};
	const summaryFor = (
		modelId = currentModelId,
		settings = getSettings(modelId),
	) =>
		modelId.startsWith("typecast")
			? `${modelId.includes("v21") ? "v21" : "v30"} · ${settings.audioFormat.toUpperCase()} · ${settings.expressionMode === "smart" ? "자동 감정" : settings.expressionMode === "preset" ? "지정 감정" : "기본"} · 속도 ${settings.audioTempo}`
			: modelId.startsWith("fish-")
				? `${modelId.replace("fish-", "")} · ${settings.format.toUpperCase()} · 표현력 ${settings.temperature} · 바이트 과금`
				: `${modelId === "eleven_v3" ? "Eleven v3 · 태그 검토" : `${modelId === "eleven_multilingual_v2" ? "Eleven Multilingual v2" : modelId === "eleven_flash_v2_5" ? "Eleven Flash v2.5" : "Eleven Turbo v2.5"} · ${settings.format} · 속도 ${settings.speed}`}`;
	const refreshSummary = () => {
		const summary = document.querySelector("#settings-summary");
		if (summary) summary.textContent = summaryFor();
	};
	const validate = (
		modelId = currentModelId,
		candidate = getSettings(modelId),
	) => {
		const errors = [];
		const value = (key) => String(candidate[key] ?? "").trim();
		const number = (key, label, min, max, integer = false) => {
			const n = Number(value(key));
			if (
				!value(key) ||
				!Number.isFinite(n) ||
				n < min ||
				n > max ||
				(integer && !Number.isInteger(n))
			)
				errors.push(
					`${label}: ${min}~${max} ${integer ? "정수" : "숫자"}를 입력해 주세요.`,
				);
		};
		const choice = (key, options, label) => {
			if (!options.includes(candidate[key]))
				errors.push(`${label}을 다시 선택해 주세요.`);
		};
		if (
			value("seed") &&
			(!/^\d+$/.test(value("seed")) || Number(value("seed")) > 4294967295)
		)
			errors.push("시드는 0~4,294,967,295 정수로 입력해 주세요.");
		if (modelId.startsWith("typecast")) {
			const v21 = modelId === "typecast-ssfm-v21";
			choice(
				"language",
				["auto", ...(v21 ? typecastV21Languages : typecastV30Languages)],
				"언어",
			);
			choice("audioFormat", ["wav", "mp3"], "출력 형식");
			choice(
				"expressionMode",
				v21 ? ["default", "preset"] : ["default", "smart", "preset"],
				"표현 방식",
			);
			choice("volumeMode", ["default", "volume", "lufs"], "음량 방식");
			number("audioPitch", "음높이", -12, 12, true);
			number("audioTempo", "말하기 속도", 0.5, 2);
			if (candidate.expressionMode === "preset") {
				choice(
					"emotionPreset",
					v21
						? ["normal", "happy", "sad", "angry"]
						: [
								"normal",
								"happy",
								"sad",
								"angry",
								"whisper",
								"toneup",
								"tonedown",
							],
					"감정",
				);
				number("emotionIntensity", "감정 강도", 0, 2);
			}
			if (
				candidate.expressionMode === "smart" &&
				(String(candidate.previousText ?? "").length > 2000 ||
					String(candidate.nextText ?? "").length > 2000)
			)
				errors.push("앞·뒤 문맥은 각각 2,000자 이하여야 합니다.");
			if (candidate.volumeMode === "volume")
				number("volume", "상대 음량", 0, 200, true);
			if (candidate.volumeMode === "lufs")
				number("targetLufs", "목표 LUFS", -70, 0);
			if (candidate.removeSilenceEnabled)
				number("removeSilenceMs", "남길 무음(ms)", 0, 1000, true);
		} else if (modelId.startsWith("fish-")) {
			choice("format", ["mp3", "wav", "pcm", "opus"], "출력 형식");
			number("prosodySpeed", "Fish 말하기 속도", 0.5, 2);
			number("prosodyVolume", "Fish 음량", -20, 20);
			number("temperature", "표현력", 0, 1);
			choice("latency", ["low", "normal", "balanced"], "지연 모드");
			number("topP", "Fish 다양성", 0, 1);
			number("chunkLength", "Fish 청크 길이", 100, 300, true);
			number("repetitionPenalty", "Fish 반복 억제", 1, 2);
			if (candidate.format === "mp3")
				choice("mp3Bitrate", ["64", "128", "192"], "MP3 비트레이트");
			if (candidate.format === "opus")
				choice(
					"opusBitrate",
					["-1000", "24000", "32000", "48000", "64000"],
					"Opus 비트레이트",
				);
			if (
				value("emotionTags").length > 400 ||
				!/^(?:\[[a-zA-Z][a-zA-Z\s-]*\]\s*|\([a-zA-Z][a-zA-Z\s-]*\)\s*)*$/.test(
					value("emotionTags"),
				)
			)
				errors.push(
					"감정·연출 태그는 [happy] 또는 (happy)처럼 대괄호·괄호로 입력해 주세요. 최대 400자이며 일반 문장은 원문에 작성하세요.",
				);
		} else {
			const v3 = modelId === "eleven_v3";
			choice("format", elevenFormats, "출력 형식");
			number("stability", "안정성", 0, 1);
			choice("applyTextNormalization", ["auto", "on", "off"], "텍스트 정규화");
			if (
				modelId !== "eleven_multilingual_v2" &&
				!/^(auto|[a-z]{2})$/.test(value("languageCode"))
			)
				errors.push(
					"언어 코드는 auto 또는 소문자 두 글자(ko, en, ja)를 입력해 주세요.",
				);
			if (v3) {
				if (
					value("audioTags").length > 400 ||
					!/^(?:\[[a-zA-Z][a-zA-Z\s-]*\]\s*)*$/.test(value("audioTags"))
				)
					errors.push(
						"연출 태그는 [excited]처럼 대괄호로 입력해 주세요. 최대 400자이며 일반 문장은 원문에 작성하세요.",
					);
			} else {
				number("similarityBoost", "유사도", 0, 1);
				number("style", "스타일", 0, 1);
				number("speed", "속도", 0.7, 1.2);
				for (const key of ["previousRequestIds", "nextRequestIds"])
					if (
						value(key)
							.split(",")
							.filter((id) => id.trim()).length > 3
					)
						errors.push("앞·뒤 요청 ID는 각각 최대 3개입니다.");
			}
			for (const i of [1, 2, 3])
				if (
					value(`pronunciationDictionaryVersion${i}`) &&
					!value(`pronunciationDictionaryId${i}`)
				)
					errors.push(
						`${i}번 발음 사전 ID를 입력하거나 버전 ID를 비워 주세요.`,
					);
		}
		return errors;
	};
	const showErrors = (errors) => {
		document.querySelector("#settings-errors")?.remove();
		document
			.querySelectorAll("[data-setting][aria-invalid]")
			.forEach((field) => {
				field.removeAttribute("aria-invalid");
				field.removeAttribute("aria-describedby");
			});
		if (!errors.length) return;
		const box = document.createElement("div");
		box.id = "settings-errors";
		box.className = "settings-errors";
		box.setAttribute("role", "alert");
		const fieldKeys = [
			["시드", "seed"],
			["남길 무음", "removeSilenceMs"],
			["목표 LUFS", "targetLufs"],
			["음높이", "audioPitch"],
			["말하기 속도", "audioTempo"],
			["감정 강도", "emotionIntensity"],
			["상대 음량", "volume"],
			["안정성", "stability"],
			["유사도", "similarityBoost"],
			["스타일", "style"],
			["속도", "speed"],
			["언어 코드", "languageCode"],
			["연출 태그", "audioTags"],
			["Fish 말하기 속도", "prosodySpeed"],
			["Fish 음량", "prosodyVolume"],
			["표현력", "temperature"],
			["Fish 다양성", "topP"],
			["Fish 청크 길이", "chunkLength"],
			["Fish 반복 억제", "repetitionPenalty"],
			["감정·연출 태그", "emotionTags"],
		];
		let first;
		for (const message of errors) {
			const paragraph = document.createElement("p");
			paragraph.textContent = message;
			box.append(paragraph);
			let key = fieldKeys.find(([label]) => message.startsWith(label))?.[1];
			if (/^[123]번 발음/.test(message))
				key = `pronunciationDictionaryId${message[0]}`;
			if (message.startsWith("앞·뒤"))
				key = message.includes("문맥")
					? getSettings().previousText.length > 2000
						? "previousText"
						: "nextText"
					: "previousRequestIds";
			const input = key && document.querySelector(`[data-setting="${key}"]`);
			if (input) {
				input.setAttribute("aria-invalid", "true");
				input.setAttribute("aria-describedby", "settings-errors");
				first ||= input;
			}
		}
		document.querySelector("#model-settings").prepend(box);
		// 설정은 드로어에 있다. 열어야 오류 칸으로 포커스를 옮길 수 있다.
		window.TTSStudio?.openSettingsDrawer?.();
		if (first) {
			let ancestor = first.parentElement;
			while (ancestor) {
				if (ancestor.tagName === "DETAILS") ancestor.open = true;
				ancestor = ancestor.parentElement;
			}
			first.focus();
			first.scrollIntoView({ block: "center" });
		}
	};
	const presetSettings = (modelId = currentModelId) => {
		const next = clone(getSettings(modelId));
		[
			"previousText",
			"nextText",
			"previousRequestIds",
			"nextRequestIds",
		].forEach((key) => {
			delete next[key];
		});
		return next;
	};
	window.TTSGenerationSettings = {
		init(options = {}) {
			onChange = options.onChange || (() => {});
			render();
		},
		setModel(modelId) {
			currentModelId = modelId;
			render();
		},
		getSettings: (modelId) => clone(getSettings(modelId)),
		getPresetSettings: (modelId) => presetSettings(modelId),
		applyPresetSettings(modelId, settings) {
			valuesByModel.set(modelId, {
				...clone(defaultsFor(modelId)),
				...clone(settings || {}),
			});
			currentModelId = modelId;
			render();
		},
		resetModel(modelId = currentModelId) {
			valuesByModel.set(modelId, clone(defaultsFor(modelId)));
			currentModelId = modelId;
			render();
			onChange(clone(getSettings(modelId)));
		},
		validate,
		showErrors,
		summaryFor,
		refreshSummary,
	};
})();
