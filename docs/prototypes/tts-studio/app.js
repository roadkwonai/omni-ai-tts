(() => {
	const storageKey = "tts-pilot.prototype.scripts";
	const _sampleScript =
		"2026년 9월 26일, 하루 3분으로 시작하는 경제 이야기입니다. 커피 한 잔은 4,500원. 지난달보다 12.5% 올랐습니다. 오늘은 3가지 변화를 살펴볼게요.";
	// 가상 성우. 필드는 공급자 목록 API가 주는 값을 한국어 이름으로 옮긴 모양이다.
	// Typecast(GET /v3/voices): gender·age·use_cases·models, 언어 없음.
	// ElevenLabs(GET /v1/shared-voices): gender·age(청년·중년·장년)·use_case·language·accent·free_users_allowed(freeUsers), 정렬용 수치(created는 date_unix).
	// Fish Audio(GET /model): languages·tags·licensed, 정렬용 수치(created는 created_at). 성별·연령·용도 없음.
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
			gender: "여성",
			age: "청년",
			uses: ["뉴스", "교육·강의", "아나운서"],
			models: ["ssfm-v30", "ssfm-v21"],
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
			gender: "남성",
			age: "청년",
			uses: ["교육·강의", "오디오북", "대화"],
			models: ["ssfm-v30", "ssfm-v21"],
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
			gender: "남성",
			age: "장년",
			uses: ["다큐멘터리", "오디오북"],
			models: ["ssfm-v21"],
		},
		{
			id: "seoah",
			name: "서아",
			initial: "서",
			provider: "Typecast",
			tone: "맑고 장난스러운 목소리",
			tags: ["캐릭터"],
			favorite: false,
			sample: true,
			gender: "여성",
			age: "아동",
			uses: ["애니메이션", "게임"],
			models: ["ssfm-v30"],
		},
		{
			id: "dain",
			name: "다인",
			initial: "다",
			provider: "Typecast",
			tone: "통통 튀는 쇼츠형",
			tags: ["쇼츠", "밝은"],
			favorite: false,
			sample: true,
			gender: "여성",
			age: "청소년",
			uses: ["숏폼", "대화"],
			models: ["ssfm-v30"],
		},
		{
			id: "jihun",
			name: "지훈",
			initial: "지",
			provider: "Typecast",
			tone: "힘 있는 광고형",
			tags: ["광고"],
			favorite: false,
			sample: true,
			gender: "남성",
			age: "중년",
			uses: ["광고", "팟캐스트"],
			models: ["ssfm-v30"],
		},
		{
			id: "mira",
			name: "미라",
			initial: "미",
			provider: "Typecast",
			tone: "단정한 안내 방송",
			tags: ["안내"],
			favorite: false,
			sample: true,
			gender: "여성",
			age: "중년",
			uses: ["아나운서", "음성 안내"],
			models: ["ssfm-v30", "ssfm-v21"],
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
			accent: "표준",
			gender: "여성",
			age: "중년",
			uses: ["정보·교육"],
			freeUsers: true,
			stats: { created: "2026-03-02", usage: 1820000, trend: 41, cloned: 930 },
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
			accent: "미국식",
			gender: "여성",
			age: "청년",
			uses: ["소셜 미디어"],
			freeUsers: true,
			stats: { created: "2026-08-21", usage: 240000, trend: 88, cloned: 310 },
		},
		{
			id: "seojun",
			name: "서준",
			initial: "서",
			provider: "ElevenLabs",
			tone: "깊은 이야기꾼",
			tags: ["내레이션"],
			favorite: false,
			sample: true,
			language: "한국어",
			accent: "표준",
			gender: "남성",
			age: "중년",
			uses: ["내레이션·이야기"],
			freeUsers: false,
			stats: { created: "2025-11-17", usage: 3100000, trend: 12, cloned: 2400 },
		},
		{
			id: "yerin",
			name: "예린",
			initial: "예",
			provider: "ElevenLabs",
			tone: "만화 같은 캐릭터 톤",
			tags: ["캐릭터"],
			favorite: false,
			sample: true,
			language: "일본어",
			accent: "표준",
			gender: "여성",
			age: "청년",
			uses: ["캐릭터·애니메이션"],
			freeUsers: true,
			stats: { created: "2026-06-05", usage: 560000, trend: 63, cloned: 780 },
		},
		{
			id: "geonwoo",
			name: "건우",
			initial: "건",
			provider: "ElevenLabs",
			tone: "품위 있는 낭독",
			tags: ["낭독"],
			favorite: false,
			sample: true,
			language: "영어",
			accent: "영국식",
			gender: "남성",
			age: "장년",
			uses: ["내레이션·이야기"],
			freeUsers: false,
			stats: { created: "2025-09-30", usage: 980000, trend: 7, cloned: 1500 },
		},
		{
			id: "sora",
			name: "소라",
			initial: "소",
			provider: "ElevenLabs",
			tone: "상냥한 광고형",
			tags: ["광고"],
			favorite: false,
			sample: true,
			language: "한국어",
			accent: "표준",
			gender: "여성",
			age: "중년",
			uses: ["광고"],
			freeUsers: true,
			stats: { created: "2026-09-10", usage: 90000, trend: 95, cloned: 120 },
		},
		{
			id: "hyunwoo",
			name: "현우",
			initial: "현",
			provider: "ElevenLabs",
			tone: "편안한 대화형",
			tags: ["대화"],
			favorite: false,
			sample: true,
			language: "한국어",
			accent: "표준",
			gender: "남성",
			age: "청년",
			uses: ["대화"],
			freeUsers: false,
			stats: { created: "2026-04-18", usage: 720000, trend: 30, cloned: 640 },
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
			providerTags: ["내레이션", "감성"],
			licensed: true,
			stats: { created: "2026-05-11", usage: 45200, score: 92 },
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
			providerTags: ["뉴스", "경제"],
			licensed: false,
			stats: { created: "2026-08-03", usage: 8100, score: 71 },
		},
		{
			id: "bora",
			name: "보라",
			initial: "보",
			provider: "Fish Audio",
			tone: "속삭이는 차분한 톤",
			tags: ["차분한"],
			favorite: false,
			sample: true,
			language: "한국어",
			providerTags: ["ASMR", "차분함"],
			licensed: true,
			stats: { created: "2026-02-20", usage: 63800, score: 88 },
		},
		{
			id: "nari",
			name: "나리",
			initial: "나",
			provider: "Fish Audio",
			tone: "담담한 오디오북 낭독",
			tags: ["낭독"],
			favorite: false,
			sample: true,
			language: "한국어",
			providerTags: ["오디오북", "내레이션"],
			licensed: false,
			stats: { created: "2026-09-01", usage: 2300, score: 64 },
		},
		{
			id: "taeyang",
			name: "태양",
			initial: "태",
			provider: "Fish Audio",
			tone: "우렁찬 게임 캐릭터",
			tags: ["캐릭터"],
			favorite: false,
			sample: true,
			language: "한국어",
			providerTags: ["게임", "캐릭터"],
			licensed: false,
			stats: { created: "2026-07-07", usage: 17400, score: 77 },
		},
		{
			id: "haru",
			name: "하루",
			initial: "하",
			provider: "Fish Audio",
			tone: "귀여운 애니 톤",
			tags: ["캐릭터"],
			favorite: false,
			sample: true,
			language: "일본어",
			providerTags: ["애니", "캐릭터"],
			licensed: false,
			stats: { created: "2026-06-28", usage: 29500, score: 81 },
		},
		{
			id: "jiwoo",
			name: "지우",
			initial: "지",
			provider: "Fish Audio",
			tone: "친절한 튜토리얼 진행",
			tags: ["교육"],
			favorite: false,
			sample: true,
			language: "영어",
			providerTags: ["유튜브", "교육"],
			licensed: true,
			stats: { created: "2026-01-15", usage: 51000, score: 85 },
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
			facets: {},
		},
		voiceNotes: {},
		// 성우 캐스팅 페이지. script가 null이면 처음 열 때 작업실 첫 문단으로 채운다.
		// takes[성우 id]는 마지막 시험 생성 {script, status}. playing은 "sample:id"·"take:id".
		casting: {
			provider: "all",
			query: "",
			facets: {},
			channels: [],
			categories: [],
			types: [],
			view: "all",
			sort: "default",
			selected: null,
			script: null,
			takes: {},
			playing: null,
			// 둘러보기 인기에서 보는 공급자(전체 탭).
			popular: null,
		},
		clones: [],
		isGenerating: false,
		generationSnapshot: null,
		scriptSegments: null,
		tab: "paragraph",
		segmentUndo: null,
		usageLog: [],
		voiceSort: "default",
		voiceFacets: {},
		speakerDetect: true,
		player: { timer: 0, elapsed: 0, index: -1 },
		// 시연 설정(내비 하단 "시연 모드"): 실제 요청 없이 보여 줄 결과.
		demo: {
			generation: "success",
			tools: "success",
			emotion: "success",
			trial: "success",
		},
	};
	const recentVoicesKey = "tts-pilot.prototype.recent-voices.v1";
	const speakerDetectKey = "tts-pilot.prototype.speaker-detect.v1";
	// 필터는 공급자 목록 API의 조회 조건과 응답 필드만 쓴다(docs/briefs/tts-voice-provider-filters.md).
	// 내 보이스만 앱 기록(클론 소유 매핑)이다. 공용 키의 공급자 계정 목록에는 남의 클론이 섞인다.
	// [이름, 선택지 순서(null이면 성우 데이터에서 뽑음)]
	const facetDefs = {
		gender: ["성별", ["여성", "남성"]],
		age: ["연령", ["아동", "청소년", "청년", "중년", "장년"]],
		// API의 use_cases. Typecast 화면이 '콘텐츠'라고 부른다.
		uses: ["콘텐츠", null],
		language: ["언어", null],
		models: ["모델", null],
		accent: ["억양", null],
		providerTags: ["태그", null],
		licensed: ["보증 성우만", null],
		isNew: ["신규", null],
		freeUsers: ["체험", null],
		mine: ["내 보이스", null],
	};
	// ponytail: 시연 기준일(2026-09-29)에서 30일 전으로 고정. 실제 앱은 오늘 기준으로 센다.
	const NEW_SINCE = "2026-08-30";
	// 켜고 끄는 조건: [성우가 해당하는지, 칩 설명]
	// licensed: Fish Audio licensed / isNew: ElevenLabs date_unix·Fish Audio created_at
	// freeUsers: ElevenLabs free_users_allowed / mine: 앱의 클론 소유 기록
	const flagFacets = {
		licensed: [
			(voice) => voice.licensed,
			"Fish Audio가 목소리 주인의 권리를 확인한 성우",
		],
		isNew: [
			(voice) => voice.stats?.created >= NEW_SINCE,
			"최근 30일 안에 공개된 성우",
		],
		freeUsers: [(voice) => voice.freeUsers, "무료 플랜에서도 쓸 수 있는 성우"],
		mine: [(voice) => voice.mine, "내가 만들거나 연결한 클론 보이스"],
	};
	const providerFacets = {
		all: ["gender", "age", "uses", "language", "isNew", "freeUsers", "mine"],
		Typecast: ["gender", "age", "uses", "models", "mine"],
		ElevenLabs: [
			"gender",
			"age",
			"uses",
			"language",
			"accent",
			"isNew",
			"freeUsers",
			"mine",
		],
		"Fish Audio": ["language", "providerTags", "licensed", "isNew", "mine"],
	};
	// 공급자 API의 정렬(sort, sort_by). Typecast 목록에는 정렬이 없다.
	const providerSorts = {
		ElevenLabs: [
			["trend", "인기 급상승"],
			["usage", "사용량 많은 순"],
			["cloned", "클론 많은 순"],
			["created", "최신 순"],
		],
		"Fish Audio": [
			["score", "점수 순"],
			["usage", "사용량 많은 순"],
			["created", "최신 순"],
		],
	};
	// 조건 줄 끝의 탭 안내. Typecast 목록 API에는 설명 검색이 없고 추천 API가 따로 있다.
	const facetHints = {
		all: "공급자를 고르면 조건이 더 나와요",
		Typecast: "설명으로 찾기는 맞춤 성우 추천에서 해요",
	};
	// 실제 앱의 검색: Typecast는 받아 둔 전체 목록을 앱이 찾고, ElevenLabs는 search, Fish Audio는 title로 조회한다.
	const searchHints = {
		all: "이름·분위기·목소리 ID 검색",
		Typecast: "이름·분위기 검색",
		ElevenLabs: "이름·설명 검색",
		"Fish Audio": "이름 검색",
	};

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
	let announceTimer = 0;
	const announce = (message) => {
		// 모달 드로어가 열려 있으면 바깥은 inert라 드로어 안의 알림 영역에도 쓴다.
		// 읽은 뒤 비워서 지난 안내가 남지 않게 하고, 같은 문구도 다시 읽히게 한다.
		const regions = [$("#live-region"), $("#drawer-live")];
		for (const region of regions) region.textContent = message;
		clearTimeout(announceTimer);
		announceTimer = setTimeout(() => {
			for (const region of regions) region.textContent = "";
		}, 5000);
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
		// 열린 모달(드로어 등)은 top layer라 안에 붙여야 토스트가 보인다.
		(
			[...document.querySelectorAll("dialog[open]")].at(-1) || document.body
		).append(node);
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
		const tags = spokenTags();
		return tags ? `${tags} ${text}` : text;
	};
	const spokenTags = () => {
		const modelId = $("#model-select").value;
		const settings = window.TTSGenerationSettings?.getSettings();
		return modelId === "eleven_v3"
			? settings?.audioTags?.trim()
			: modelId.startsWith("fish-")
				? settings?.emotionTags?.trim()
				: "";
	};
	const updateScriptLength = () => {
		updateWorkbar();
		$("#script-length").textContent =
			`문단 ${state.scriptSegments?.length || 0}개 · 원문 ${fmt(originalText().length)}자 · 문단당 최대 2,000자`;
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
	// 빈 문단은 생성 대상에서 뺀다.
	const activeSegments = () =>
		(state.scriptSegments || []).filter((part) => part.text.trim());
	// 실제로 보내는 발음용 대본 기준: 적용한 발음 교정은 처음 나오는 문단에 반영하고 태그는 문단마다 붙인다.
	const spokenSegments = (items = activeSegments()) => {
		const tags = spokenTags();
		const pending = corrections.filter(
			(item) => item.decision === "applied" || item.decision === "manual",
		);
		return items.map((part) => {
			let text = part.text;
			for (const item of pending)
				if (text.includes(item.source)) {
					text = text.replace(item.source, item.proposal);
					pending.splice(pending.indexOf(item), 1);
				}
			return {
				...part,
				text: tags ? `${tags} ${text}` : text,
				sourceLength: part.text.length,
			};
		});
	};
	const summarize = (items = spokenSegments()) => {
		const rows = new Map();
		let seconds = 0;
		let chars = 0;
		let spokenChars = 0;
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
			chars += item.sourceLength ?? item.text.length;
			spokenChars += item.text.length;
		});
		const providerRows = [...rows.values()];
		return {
			count: items.length,
			chars,
			spokenChars,
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
	const RESULT_TEXT = {
		working: "생성 요청을 시연하는 중이에요.",
		success: "임시 생성 결과가 있어요 · 시연",
		lost: "생성 여부를 확인하지 못했어요.",
		error: "공급자 오류 상태예요 · 시연",
	};
	// 작업 요약: 우측 레일과 작업 바 팝오버가 같은 계산을 쓴다.
	const summaryNodes = (compact = false) => {
		const summary = summarize();
		const skipped = (state.scriptSegments?.length || 0) - summary.count;
		const facts = el("dl", "summary-facts");
		[
			["문단", `${summary.count}개`],
			["원문", `${fmt(summary.chars)}자`],
			["발음용", `${fmt(summary.spokenChars)}자`],
			["예상 길이", `약 ${formatDuration(summary.seconds)}`],
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
					`문단 ${row.count}개 · ${usageText(row.units, row.unitLabel)}`,
				),
			);
			list.append(item);
		});
		const nodes = [facts];
		if (skipped)
			nodes.push(
				el("p", "summary-basis", `빈 문단 ${skipped}개는 빼고 계산해요.`),
			);
		nodes.push(el("h3", "", "공급자별 예상 사용량"), list);
		if (compact) {
			nodes.push(
				el(
					"p",
					"summary-basis",
					"추정 · 발음 교정·태그 반영 · 실제 청구는 연결 후 확인",
				),
			);
			return nodes;
		}
		nodes.push(
			el(
				"p",
				"summary-basis",
				"사용량은 발음 교정과 감정 태그를 반영한 발음용 대본을 문단별로 세어 추정해요.",
			),
			...[
				...new Set(summary.rows.flatMap((row) => row.basis.split(" · "))),
			].map((basis) => el("p", "summary-basis", basis)),
			el(
				"p",
				"summary-basis",
				"문단별 추정의 합계라 실제 요청 단위와 다를 수 있어요. 실제 청구는 연결 후 공급자 내역에서 확인해요.",
			),
		);
		return nodes;
	};
	const reviewLink = (before) => {
		const left = pendingCorrections().length;
		if (!left) return el("p", "summary-basis", "발음 검수: 남은 건이 없어요.");
		const link = button(`발음 검수 남은 ${left}건 ›`, "text-button rail-link");
		link.addEventListener("click", () => {
			before?.();
			selectTab("pronunciation", { focus: true });
		});
		return link;
	};
	const estimateHeading = (tag) => {
		const heading = el("h2", "", "작업 요약 ");
		heading.id = tag;
		heading.append(el("span", "estimate-tag", "추정"));
		return heading;
	};
	const renderRailSummary = () => {
		const rail = $("#rail-summary");
		if (!rail) return;
		rail.replaceChildren(
			estimateHeading("rail-summary-title"),
			...summaryNodes(true),
			reviewLink(),
		);
	};
	const renderRailRoles = () => {
		const box = $("#rail-roles");
		const stats = window.TTSParagraphs?.roleStats?.();
		// 우측 레일이 접히는 1279px 이하에서는 툴바 버튼이 역할 창으로 가는 길이다.
		const toolbarRoles = $("#open-roles");
		toolbarRoles.hidden = !stats?.roles;
		if (stats?.roles) {
			const label = `역할 ${stats.assigned}/${stats.roles}`;
			$(".tb-label", toolbarRoles).textContent = label;
			toolbarRoles.setAttribute(
				"aria-label",
				`역할별 성우 · 지정 ${stats.assigned}/${stats.roles}`,
			);
		}
		box.hidden = !stats?.roles;
		if (!stats?.roles) return box.replaceChildren();
		const open = button(
			`역할별 성우 · 지정 ${stats.assigned}/${stats.roles} ›`,
			"text-button rail-link",
		);
		open.addEventListener("click", () =>
			window.TTSParagraphs.openRoleDialog(bridge),
		);
		box.replaceChildren(open);
	};
	const renderSummaryPanel = () => {
		const panel = $("#workbar-summary-panel");
		const ready = state.generationMode === "success";
		const heading = el("h2", "", "예상 요약 ");
		heading.append(el("span", "estimate-tag", "추정"));
		panel.replaceChildren(
			heading,
			...summaryNodes(),
			el("h3", "", "결과"),
			el(
				"p",
				"summary-basis",
				RESULT_TEXT[state.generationMode] || "아직 음성을 만들지 않았어요.",
			),
			reviewLink(() => panel.hidePopover()),
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
		const laterReason = "자막·문단별 ZIP 내보내기는 준비 중이에요";
		const later = el("p", "summary-basis", laterReason);
		later.id = "download-later-reason";
		const list = el("div", "download-options");
		[
			["MP3 전체", ""],
			["WAV 전체", ""],
			["SRT 자막", "준비 중"],
			["문단별 ZIP", "준비 중"],
		].forEach(([label, scope]) => {
			const option = button(label, "download-option", "download");
			// 준비 중 항목은 일괄 막대처럼 aria-disabled와 보이는 사유를 둔다. 성공 뒤에도 막는다.
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
			`문단 ${summary.count} · ${fmt(summary.chars)}자 · 약 ${formatDuration(summary.seconds)} · 예상 ${summary.usage}`;
		const pending = pendingCorrections().length;
		const empty = summary.chars === 0;
		const mode = empty ? "empty" : pending ? "review" : "make";
		const [long, short] = {
			empty: ["대본을 입력해 주세요", "대본을 입력해 주세요"],
			review: [`발음 검수 ${pending}건 확인`, `검수 ${pending}건`],
			make: ["음성 만들기 · 시연", "음성 만들기 · 시연"],
		}[mode];
		const make = $("#make-audio");
		make.dataset.mode = mode;
		// 만드는 중에도 disabled 대신 aria-disabled로 둬서 포커스가 버튼에 남는다.
		make.setAttribute("aria-disabled", String(empty || state.isGenerating));
		$(".mk-long", make).textContent = long;
		$(".mk-short", make).textContent = short;
		$("#make-audio-icon use").setAttribute(
			"href",
			mode === "review" ? "#i-check" : "#i-wand",
		);
		$("#make-audio-usage").textContent = mode === "make" ? summary.usage : "";
		const chip = $("#workbar-summary");
		const chipText = $("#workbar-summary-text").textContent;
		chip.title = chipText;
		chip.setAttribute("aria-label", `${chipText} · 추정`);
		const reason = ready
			? "자막·무음 편집은 준비 중이에요"
			: "생성 후 쓸 수 있어요 · 준비 중";
		$("#post-edit-reason").textContent = reason;
		$("#post-edit").title = reason;
		bar.classList.toggle("has-result", ready);
		if (!ready) stopPlayer();
		renderPlayer();
		renderRailSummary();
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
	const facetValues = (voice, key) => {
		const value = voice[key];
		if (flagFacets[key])
			return flagFacets[key][0](voice) ? [facetDefs[key][0]] : [];
		return Array.isArray(value) ? value : value ? [value] : [];
	};
	const facetKeys = (provider) => providerFacets[provider || "all"];
	// 콘텐츠별 묶음과 펼친 칩 줄에 쓰는 조건. Fish Audio는 용도 대신 태그가 있다.
	const contentKey = (provider) =>
		facetKeys(provider).includes("uses") ? "uses" : "providerTags";
	const facetMatches = (voice, selected, provider) =>
		facetKeys(provider).every(
			(key) =>
				!selected[key]?.length ||
				facetValues(voice, key).some((value) => selected[key].includes(value)),
		);
	const facetCount = (selected) =>
		Object.values(selected).reduce((sum, values) => sum + values.length, 0);
	// 전체 탭에서 고른 조건을 주지 않는 공급자는 성우가 모두 빠진다. [공급자, [조건 이름]] 목록.
	const missingFacets = (tab, selected) =>
		tab !== "all"
			? []
			: Object.entries(providerFacets)
					.filter(([name]) => name !== "all")
					.map(([name, keys]) => [
						name,
						facetKeys("all")
							.filter((key) => selected[key]?.length && !keys.includes(key))
							.map((key) => facetDefs[key][0]),
					])
					.filter(([, labels]) => labels.length);
	// 목록 한 줄 요약: 공급자와 API가 준 속성.
	const voiceMeta = (voice) =>
		[
			voice.provider,
			voice.gender,
			voice.age,
			voice.language,
			voice.licensed && "보증",
			flagFacets.isNew[0](voice) && "신규",
			voice.freeUsers && "체험",
		]
			.filter(Boolean)
			.join(" · ");
	// top layer에 뜨는 팝오버를 칩 아래에 두고, 열려 있는 동안 스크롤·크기 변경을 따라간다.
	const anchorPopover = (pop, trigger) => {
		// 아래 공간이 좁으면(화면 아래쪽 칩) 칩 위로 뒤집는다.
		const place = () => {
			const r = trigger.getBoundingClientRect();
			const width = Math.min(280, innerWidth - 16);
			const below = innerHeight - r.bottom - 14;
			const above = r.top - 14;
			const up = below < 240 && above > below;
			Object.assign(pop.style, {
				width: `${width}px`,
				left: `${Math.max(8, Math.min(r.left, innerWidth - width - 8))}px`,
				top: up ? "auto" : `${r.bottom + 6}px`,
				bottom: up ? `${innerHeight - r.top + 6}px` : "auto",
				maxHeight: `${up ? above : below}px`,
			});
		};
		pop.addEventListener("beforetoggle", (event) => {
			if (event.newState === "open") place();
		});
		pop.addEventListener("toggle", (event) => {
			const method =
				event.newState === "open" ? "addEventListener" : "removeEventListener";
			window[method]("scroll", place, true);
			window[method]("resize", place);
		});
	};
	// 드롭다운 칩 하나: 누르면 팝오버에 선택지 칩이 나오고 여러 개 고를 수 있다.
	// options는 [값, 이름], chosen()은 지금 고른 값 목록, onToggle(값)은 선택을 바꾼다.
	const dropChip = (id, label, options, chosen, onToggle) => {
		const pop = el("fieldset", "facet-pop");
		pop.id = id;
		pop.popover = "auto";
		pop.append(el("legend", "", label));
		const trigger = button("", "filter-chip facet-trigger");
		trigger.setAttribute("popovertarget", id);
		const caption = el("span");
		const nameOf = (value) =>
			options.find(([option]) => option === value)?.[1] ?? value;
		const setCaption = () => {
			const list = chosen();
			caption.textContent = !list.length
				? label
				: `${label} · ${nameOf(list[0])}${list.length > 1 ? ` 외 ${list.length - 1}` : ""}`;
			trigger.classList.toggle("is-selected", list.length > 0);
		};
		trigger.append(caption, icon("chevron-down"));
		const chips = el("div", "voice-facet-chips");
		for (const [value, name] of options) {
			const chip = button(name, "filter-chip");
			chip.setAttribute("aria-pressed", String(chosen().includes(value)));
			chip.addEventListener("click", () => {
				onToggle(value);
				chip.setAttribute("aria-pressed", String(chosen().includes(value)));
				setCaption();
			});
			chips.append(chip);
		}
		pop.append(chips);
		anchorPopover(pop, trigger);
		setCaption();
		return [trigger, pop];
	};
	// 켜고 끄는 조건 칩. 설명은 마우스에는 title, 스크린리더에는 aria-describedby로 준다.
	const appendFlag = (host, id, key, checked, onChange) => {
		const toggle = el("label", "filter-chip facet-toggle");
		toggle.title = flagFacets[key][1];
		const box = el("input");
		box.type = "checkbox";
		box.checked = checked;
		const tip = el("span", "sr-only", flagFacets[key][1]);
		tip.id = `${id}-tip`;
		box.setAttribute("aria-describedby", tip.id);
		box.addEventListener("change", () => onChange(box.checked));
		toggle.append(box, facetDefs[key][0]);
		host.append(toggle, tip);
	};
	// 콘텐츠 칩을 펼쳐 둔다. 접힌 동안은 앞 6개와 고른 칩만 보이고 더보기로 모두 연다.
	const CONTENT_LIMIT = 6;
	const renderContentChips = (host, label, values, chosen, onToggle) => {
		host.replaceChildren(el("legend", "sr-only", label));
		values.forEach((value, index) => {
			const chip = button(value, "filter-chip");
			chip.classList.toggle("is-extra", index >= CONTENT_LIMIT);
			chip.setAttribute("aria-pressed", String(chosen.includes(value)));
			chip.addEventListener("click", () => {
				onToggle(value);
				chip.setAttribute(
					"aria-pressed",
					String(chip.getAttribute("aria-pressed") !== "true"),
				);
			});
			host.append(chip);
		});
		if (values.length <= CONTENT_LIMIT) return;
		const more = button("", "filter-chip facet-more");
		const setLabel = () => {
			const open = host.classList.contains("is-open");
			more.replaceChildren(
				open ? "접기" : `더보기 ${values.length - CONTENT_LIMIT}`,
				icon("chevron-down"),
			);
			more.setAttribute("aria-expanded", String(open));
		};
		more.addEventListener("click", () => {
			host.classList.toggle("is-open");
			setLabel();
		});
		setLabel();
		host.append(more);
	};
	// 조건마다 드롭다운 칩. 선택지는 지금 공급자 탭의 성우에서 뽑는다.
	// 칩을 눌러도 줄을 다시 그리지 않아 팝오버와 포커스가 그대로 남는다.
	// 해제·빠짐 안내는 줄 아래 안내 줄(role=status)에 보이고, 빠진 공급자로 바로 옮길 수 있다.
	// 성우 캐스팅은 콘텐츠(태그)를 contentHost에 펼친 칩으로 두고, own 조건(내 보이스)은
	// 내 분류 줄이 그리므로 여기서는 그리지도, 세지도, 해제하지도 않는다.
	const makeFacetRow = (host, provider, selected, options) => {
		const { onChange, onProvider, contentHost, own = [] } = options;
		const tab = provider || "all";
		const keys = facetKeys(tab);
		const pool = voiceData.filter(
			(voice) => tab === "all" || voice.provider === tab,
		);
		const dropped = [];
		for (const key of Object.keys(selected)) {
			if (keys.includes(key)) continue;
			if (selected[key].length) dropped.push(facetDefs[key][0]);
			delete selected[key];
		}
		// 안내 줄은 한 번만 만들어 둬야 바뀐 내용이 읽힌다.
		if (!host.facetNote) {
			host.facetNote = el("p", "facet-note");
			host.facetNote.setAttribute("role", "status");
			host.after(host.facetNote);
		}
		const note = host.facetNote;
		host.replaceChildren(el("legend", "sr-only", "공급자 분류"));
		const chosenCount = () =>
			keys
				.filter((key) => !own.includes(key))
				.reduce((sum, key) => sum + (selected[key]?.length ?? 0), 0);
		const reset = button("조건 해제", "filter-chip facet-reset", "close");
		// 탭 안내는 고른 조건이 없을 때만 보이고, 고르면 그 자리에 조건 해제가 온다.
		const hint = el("span", "facet-hint", facetHints[tab] || "");
		let droppedText = "";
		const renderNote = () => {
			note.replaceChildren();
			if (droppedText) note.append(el("span", "", droppedText));
			for (const [name, labels] of missingFacets(tab, selected)) {
				note.append(
					el("span", "", `${name}는 ${labels.join("·")} 정보가 없어 빠졌어요.`),
				);
				const go = button(`${name} 보기`, "text-button facet-note-action");
				go.addEventListener("click", () => onProvider(name));
				note.append(go);
			}
		};
		const sync = () => {
			droppedText = "";
			reset.hidden = !chosenCount();
			hint.hidden = !reset.hidden;
			renderNote();
			onChange();
		};
		for (const key of keys) {
			const [label, order] = facetDefs[key];
			const present = new Set(pool.flatMap((voice) => facetValues(voice, key)));
			// 켜고 끄는 조건은 해당 성우가 없어도(내 보이스 0명) 칩을 둔다.
			const values = flagFacets[key]
				? [label]
				: order
					? order.filter((value) => present.has(value))
					: [...present].sort((a, b) => a.localeCompare(b, "ko"));
			// 새 탭에 없는 값은 칩이 안 보이므로 선택도 푼다.
			const kept = (selected[key] || []).filter((value) =>
				values.includes(value),
			);
			if (kept.length < (selected[key] || []).length) dropped.push(label);
			selected[key] = kept;
			if (!values.length || own.includes(key)) continue;
			const toggleValue = (value) => {
				const chosen = selected[key];
				selected[key] = chosen.includes(value)
					? chosen.filter((item) => item !== value)
					: [...chosen, value];
				sync();
			};
			if (flagFacets[key]) {
				appendFlag(host, `${host.id}-${key}`, key, kept.length > 0, (on) => {
					selected[key] = on ? [label] : [];
					sync();
				});
				continue;
			}
			if (contentHost && key === contentKey(tab)) {
				// 펼친 칩은 성우가 많은 값부터 보인다.
				const size = (value) =>
					pool.filter((voice) => facetValues(voice, key).includes(value))
						.length;
				renderContentChips(
					contentHost,
					label,
					values.toSorted((a, b) => size(b) - size(a)),
					selected[key],
					toggleValue,
				);
				continue;
			}
			host.append(
				...dropChip(
					`${host.id}-${key}`,
					label,
					values.map((value) => [value, value]),
					() => selected[key],
					toggleValue,
				),
			);
		}
		if (facetHints[tab]) host.append(hint);
		reset.addEventListener("click", () => {
			for (const key of Object.keys(selected))
				if (!own.includes(key)) delete selected[key];
			makeFacetRow(host, provider, selected, options);
			host.querySelector(".facet-trigger")?.focus();
			onChange();
		});
		reset.hidden = !chosenCount();
		hint.hidden = !reset.hidden;
		host.append(reset);
		if (dropped.length)
			droppedText = `${tab === "all" ? "전체" : tab}에 없는 ${[...new Set(dropped)].join("·")} 조건은 해제했어요.`;
		renderNote();
	};
	const renderVoiceFacets = () =>
		makeFacetRow($("#voice-facets"), state.provider, state.voiceFacets, {
			onChange: renderVoiceList,
			onProvider: (name) => {
				const tab = $(`.filter-row [data-provider="${name}"]`);
				tab.click();
				tab.focus();
			},
		});
	// 공급자 탭을 바꾸면 조건 줄, 검색 안내, 정렬 선택지를 그 공급자에 맞춘다.
	const setPickerProvider = (provider) => {
		state.provider = provider;
		$("#voice-search").placeholder = searchHints[provider];
		const sort = $("#voice-sort");
		for (const option of $$("option[data-provider-sort]", sort))
			option.remove();
		for (const [key, label] of providerSorts[provider] || []) {
			const option = el("option", "", label);
			option.value = `stat:${key}`;
			option.dataset.providerSort = "";
			sort.append(option);
		}
		if (![...sort.options].some((option) => option.value === state.voiceSort))
			state.voiceSort = "default";
		sort.value = state.voiceSort;
		renderVoiceFacets();
		renderVoiceList();
	};
	// 성우 선택 창과 성우 캐스팅이 같이 쓴다. classes는 채널·카테고리·타입 선택.
	const filterVoices = ({ provider, view, query, classes, facets, sort }) => {
		const voices = voiceData.filter(
			(voice) =>
				(provider === "all" || voice.provider === provider) &&
				viewMatches(voice, view) &&
				searchVoice(voice, query) &&
				classification().matches(voice, classes) &&
				facetMatches(voice, facets, provider),
		);
		// 공급자 정렬(stat:키)은 큰 값·최근 날짜가 먼저다.
		if (sort.startsWith("stat:")) {
			const key = sort.slice(5);
			return voices.sort((a, b) =>
				String(b.stats?.[key] ?? "").localeCompare(
					String(a.stats?.[key] ?? ""),
					"en",
					{ numeric: true },
				),
			);
		}
		if (sort === "recent") {
			const recent = getRecentVoices();
			const rank = (voice) =>
				recent.includes(voice.id) ? recent.indexOf(voice.id) : recent.length;
			return voices.sort((a, b) => rank(a) - rank(b));
		}
		if (sort === "favorites")
			return voices.sort(
				(a, b) =>
					Number(voiceFlags(b).favorite) - Number(voiceFlags(a).favorite),
			);
		return voices;
	};
	const getFilteredVoices = () =>
		filterVoices({
			provider: state.provider,
			view: state.voiceView,
			query: $("#voice-search").value,
			classes: state.studioFilters,
			facets: state.voiceFacets,
			sort: state.voiceSort,
		});
	const renderVoiceList = () => {
		const list = $("#voice-list");
		const voices = getFilteredVoices();
		const currentPick = picker?.currentVoiceId ?? state.selectedVoice;
		list.replaceChildren();
		$("#reset-voice-filters").hidden =
			state.provider === "all" &&
			state.voiceView === "all" &&
			state.voiceSort === "default" &&
			!facetCount(state.voiceFacets) &&
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
				`voice-row${voice.id === currentPick ? " is-selected" : ""}`,
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
			if (voice.id === currentPick)
				line.append(el("span", "tag tag-blue", "지금 선택"));
			main.setAttribute("aria-label", `${voice.name} 선택`);
			main.append(
				line,
				el("div", "voice-provider", voiceMeta(voice)),
				el(
					"div",
					"voice-detail",
					[
						voice.sample ? voice.tone : "기본 샘플이 없어요",
						...(voice.uses || voice.providerTags || [])
							.slice(0, 2)
							.map((tag) => `#${tag}`),
					].join(" "),
				),
			);
			main.addEventListener("click", () => pickVoice(voice));
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
		state.voiceView = "all";
		state.voiceSort = "default";
		state.voiceFacets = {};
		$("#studio-voice-view").value = "all";
		groups.forEach(([g]) => {
			state.studioFilters[g] = [];
		});
		renderStudioClassificationFilters();
		$("#voice-search").value = "";
		$$(".filter-row .filter-chip").forEach((chip) => {
			const selected = chip.dataset.provider === "all";
			chip.classList.toggle("is-selected", selected);
			chip.setAttribute("aria-pressed", String(selected));
		});
		setPickerProvider("all");
	};
	const renderReview = () => {
		const list = $("#review-list");
		list.replaceChildren();
		const candidates = corrections.filter((item) =>
			originalText().includes(item.source),
		);
		candidates.forEach((item, _index) => {
			const row = el("article", "review-item");
			if (item.decision === "pending") row.dataset.pending = "";
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
	const viewTabs = [
		["paragraph", "#paragraph-tab", "#segment-plan"],
		["source", "#source-tab", "#source-panel"],
		["pronunciation", "#pronunciation-tab", "#pronunciation-panel"],
	];
	const selectTab = (name, { focus = false } = {}) => {
		if (!viewTabs.some(([id]) => id === name)) return;
		const previous = state.tab;
		state.tab = name;
		for (const [id, tabSelector, panelSelector] of viewTabs) {
			const on = id === name;
			const tab = $(tabSelector);
			tab.classList.toggle("is-active", on);
			tab.setAttribute("aria-selected", String(on));
			tab.tabIndex = on ? 0 : -1;
			$(panelSelector).hidden = !on;
			if (on && focus) tab.focus();
		}
		// 숨겨진 동안 자란 카드 높이를 다시 맞추도록 문단 탭으로 돌아올 때 다시 그린다.
		// 문단 탭이 아니면 일괄 작업은 쓸 수 없다.
		$("#batch-rail").inert = name !== "paragraph";
		$("#batch-rail-note").hidden = name === "paragraph";
		if (name === "paragraph" && previous !== "paragraph")
			window.TTSParagraphs?.render?.($("#segment-plan"), bridge);
		if (name === "source") fitReadonlyEditor();
		if (name === "pronunciation") renderReview();
	};
	// 검수가 남았으면 생성 대신 첫 미검수 항목으로 안내한다(탭이 갑자기 넘어가지 않도록 버튼 라벨이 미리 알린다).
	const goReview = () => {
		const left = pendingCorrections().length;
		selectTab("pronunciation");
		(
			$("#review-list [data-pending] .mini-button") || $("#pronunciation-tab")
		).focus();
		announce(`발음 검수가 ${left}건 남았어요. 첫 항목으로 옮겼어요.`);
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
		if (mode === "working") {
			copy.append(
				el("h3", "", "생성 요청을 시연하고 있어요"),
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
				el("h3", "", "임시 생성 결과 · 시연"),
				el(
					"p",
					"",
					`${snapshot?.segments?.length ? `문단 ${snapshot.segments.length}개 계획 시연 · ` : ""}${snapshot?.voiceName || activeVoice().name} · ${snapshot?.modelLabel || "선택한 모델"} · 실제 오디오 파일은 없는 결과 화면 시연입니다.${snapshot && (snapshot.sourceText !== originalText() || snapshot.spokenText !== finalText() || snapshot.voiceId !== activeVoice().id || snapshot.modelId !== $("#model-select").value || JSON.stringify(snapshot.settings) !== JSON.stringify(window.TTSGenerationSettings?.getSettings?.()) || JSON.stringify(snapshot.segments) !== JSON.stringify(activeSegments())) ? " 이전 대본 또는 설정으로 만든 결과입니다." : ""}`,
				),
			);
		}
		if (mode === "lost") {
			copy.append(
				el("h3", "", "생성 여부를 확인하지 못했어요"),
				el(
					"p",
					"",
					"다시 만들면 사용량이 추가될 수 있어요. 실제 요청은 전송되지 않은 시연입니다.",
				),
			);
		}
		if (mode === "error") {
			copy.append(
				el("h3", "", "Typecast 연결 상태 시연: 지금은 만들 수 없어요"),
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
			const retry = button("다시 만들기", "button button-secondary", "refresh");
			retry.addEventListener("click", () => $("#make-audio").click());
			actions.append(retry);
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
		summarize(spokenSegments(items)).rows.forEach((row) => {
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
	const openConfirm = (title, message, actionLabel, action) => {
		const dialog = $("#confirm-dialog");
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
		if (name === "casting") renderCastingPage(view);
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
				if (key === "provider") renderFacets();
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
				facets: {},
			});
			renderVoicesPage(view);
		};
		const resetButton = button("필터 초기화", "mini-button");
		resetButton.addEventListener("click", reset);
		const providerFilter = selectFilter("provider", "공급자", [
			["", "전체"],
			["Typecast", "Typecast"],
			["ElevenLabs", "ElevenLabs"],
			["Fish Audio", "Fish Audio"],
		]);
		tools.append(
			search,
			providerFilter,
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
		const facetHost = el("fieldset", "facet-row");
		facetHost.id = "library-facets";
		const renderFacets = () =>
			makeFacetRow(facetHost, filters.provider, filters.facets, {
				onChange: () => render(),
				onProvider: (name) => {
					const select = providerFilter.querySelector("select");
					select.value = name;
					select.dispatchEvent(new Event("change"));
					select.focus();
				},
			});
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
					facetMatches(v, filters.facets, filters.provider) &&
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
					el("span", "", `${voiceMeta(voice)} · ${voice.tone}`),
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
		content.append(tools, facetHost, filterGroups, resultCount, list);
		view.append(content);
		renderFacets();
		render();
	};
	// 성우 캐스팅: 찾기 → 듣기 → 분류에 넣기 → 작업실에서 사용(docs/briefs/tts-voice-casting.md).
	// 목록에는 과금 없는 샘플과 즐겨찾기만 두고, 유료인 시험 생성은 성우 패널에서 누를 때만 한다.
	const TRIAL_LIMIT = 200;
	const castingNarrow = () => matchMedia("(max-width: 1023px)").matches;
	const renderCastingPage = (view) => {
		const c = state.casting;
		c.script ??= (
			state.scriptSegments?.[0]?.text ?? originalText().split(/\n\s*\n/)[0]
		)
			.trim()
			.slice(0, TRIAL_LIMIT);
		view.replaceChildren(
			pageHeader(
				"casting-title",
				"성우 캐스팅",
				"공급자 성우를 찾아 샘플과 내 대본으로 들어 보고, 채널·분류에 넣어 작업실로 가져가세요. 가상 성우 목록이며 실제 음성은 재생하지 않아요.",
			),
		);
		const content = el("div", "page-content casting-page");
		const main = el("div", "casting-main");
		const panel = el("aside", "casting-panel");
		panel.setAttribute("aria-labelledby", "casting-panel-title");
		// 다시 그린 뒤 같은 역할의 요소(data-focus)로 포커스를 돌려놓는다.
		const refresh = (focusKey = document.activeElement?.dataset?.focus) => {
			renderList();
			renderPanel();
			if (focusKey) $(`[data-focus="${CSS.escape(focusKey)}"]`)?.focus();
		};
		// 듣는 성우와 패널의 성우가 같도록, 넓은 화면에서는 재생을 시작하면 그 성우를 연다.
		const togglePlay = (key, message) => {
			c.playing = c.playing === key ? null : key;
			if (c.playing && !castingNarrow()) c.selected = key.split(":")[1];
			announce(c.playing ? message : "재생을 멈췄어요.");
			refresh();
		};
		const sampleButton = (voice, withLabel, prefix = "") => {
			const key = `sample:${voice.id}`;
			const playing = c.playing === key;
			const label = !voice.sample
				? "샘플 없음"
				: playing
					? "샘플 정지"
					: "기본 샘플 듣기";
			const glyph = voice.sample ? (playing ? "pause" : "play") : "";
			const node = withLabel
				? button(label, "button button-secondary", glyph)
				: button("", "voice-play", glyph || "play");
			if (!withLabel) node.setAttribute("aria-label", `${voice.name} ${label}`);
			node.setAttribute("aria-pressed", String(playing));
			node.dataset.focus = `${withLabel ? "panel-" : prefix}${key}`;
			node.disabled = !voice.sample;
			node.addEventListener("click", () =>
				togglePlay(
					key,
					`${voice.name} 기본 샘플을 재생하는 시연이에요. 실제 음성은 나오지 않아요.`,
				),
			);
			return node;
		};
		const favoriteButton = (voice, focusPrefix = "") => {
			const on = voiceFlags(voice).favorite;
			const node = button(
				"",
				`favorite-button${on ? " is-favorite" : ""}`,
				"star",
			);
			node.setAttribute("aria-label", `${voice.name} 즐겨찾기`);
			node.setAttribute("aria-pressed", String(on));
			node.dataset.focus = `${focusPrefix}favorite:${voice.id}`;
			node.addEventListener("click", () => setFlag(voice, "favorite"));
			return node;
		};
		const setFlag = (voice, flag) => {
			if (
				!classification().setFlags(voice, { [flag]: !voiceFlags(voice)[flag] })
			)
				toast("저장하지 못했습니다. 다시 시도해 주세요.");
			refresh();
		};
		const assign = (voice, group, ids, message) => {
			if (!classification().setAssignment(voice, group, ids)) {
				toast("저장하지 못했습니다. 다시 시도해 주세요.");
				return;
			}
			announce(message);
			refresh(`add:${group}`);
		};

		// 조건: 검색 → 공급자 탭 → 공급자 분류 → 내 분류 → 보기·정렬
		const searchField = el("label", "search-field casting-search");
		const search = el("input");
		search.type = "search";
		search.name = "casting-search";
		search.autocomplete = "off";
		search.spellcheck = false;
		search.value = c.query;
		search.setAttribute("aria-label", "성우 검색");
		searchField.append(icon("search"), search);
		search.addEventListener("input", () => {
			c.query = search.value;
			renderList();
		});
		const tabs = el("fieldset", "casting-providers");
		tabs.append(el("legend", "sr-only", "공급자"));
		for (const name of ["all", "Typecast", "ElevenLabs", "Fish Audio"]) {
			const total = voiceData.filter(
				(voice) => name === "all" || voice.provider === name,
			).length;
			const tab = button("", "filter-chip");
			tab.append(
				`${name === "all" ? "전체" : name} `,
				el("span", "casting-count", String(total)),
			);
			tab.dataset.castingProvider = name;
			tab.translate = false;
			tab.addEventListener("click", () => setProvider(name));
			tabs.append(tab);
		}
		const filterLine = (label, host) => {
			const line = el("div", "casting-filter-line");
			const caption = el("span", "casting-filter-label", label);
			caption.setAttribute("aria-hidden", "true");
			line.append(caption, host);
			return line;
		};
		const facetHost = el("fieldset", "facet-row");
		facetHost.id = "casting-facets";
		const contentHost = el("fieldset", "facet-row facet-content");
		contentHost.id = "casting-content";
		const contentLine = filterLine("", contentHost);
		const renderFacets = () => {
			makeFacetRow(facetHost, c.provider, c.facets, {
				onChange: () => renderList(),
				onProvider: (name) => {
					setProvider(name);
					$(`[data-casting-provider="${name}"]`)?.focus();
				},
				contentHost,
				own: ["mine"],
			});
			contentLine.firstChild.textContent = facetDefs[contentKey(c.provider)][0];
		};
		const mineHost = el("fieldset", "facet-row");
		mineHost.id = "casting-mine";
		const renderMine = () => {
			mineHost.replaceChildren(el("legend", "sr-only", "내 분류"));
			const reset = button("조건 해제", "filter-chip facet-reset", "close");
			const syncReset = () => {
				reset.hidden =
					groups.every(([group]) => !c[group].length) && !c.facets.mine?.length;
			};
			for (const [group, label] of groups) {
				const items = classification().getItems(group);
				if (!items.length) continue;
				mineHost.append(
					...dropChip(
						`casting-mine-${group}`,
						label,
						items.map((item) => [item.id, item.name]),
						() => c[group],
						(id) => {
							c[group] = c[group].includes(id)
								? c[group].filter((item) => item !== id)
								: [...c[group], id];
							syncReset();
							renderList();
						},
					),
				);
			}
			// 내 보이스는 공급자 목록이 아니라 앱 기록이라 내 분류 줄에 둔다.
			appendFlag(
				mineHost,
				"casting-mine-own",
				"mine",
				Boolean(c.facets.mine?.length),
				(on) => {
					c.facets.mine = on ? [facetDefs.mine[0]] : [];
					syncReset();
					renderList();
				},
			);
			reset.addEventListener("click", () => {
				for (const [group] of groups) c[group] = [];
				c.facets.mine = [];
				renderMine();
				mineHost.querySelector(".facet-trigger")?.focus();
				renderList();
			});
			syncReset();
			mineHost.append(reset);
		};
		// 767px 이하는 조건 줄을 접어 목록이 먼저 보이게 한다.
		const conditions = el("div", "casting-conditions");
		conditions.id = "casting-conditions";
		const conditionsToggle = button(
			"조건",
			"filter-chip casting-conditions-toggle",
			"sliders",
		);
		conditionsToggle.setAttribute("aria-controls", conditions.id);
		conditionsToggle.setAttribute("aria-expanded", "false");
		conditionsToggle.addEventListener("click", () => {
			const open = conditions.classList.toggle("is-open");
			conditionsToggle.setAttribute("aria-expanded", String(open));
		});
		// 조건이 없을 때만 목록 위에 인기와 콘텐츠별 묶음을 둔다(Typecast 보이스 캐스팅 첫 화면).
		// 인기는 공급자 API의 인기 정렬(providerSorts 첫 항목)이 있는 공급자만 보인다.
		const browse = el("div", "casting-browse");
		const listTitle = el("h2", "casting-browse-title", "전체 성우");
		const focusFirstRow = () =>
			$('.casting-list [data-focus^="pick:"]')?.focus();
		const voiceCard = (voice) => {
			const card = el(
				"li",
				`casting-card${voice.id === c.selected ? " is-selected" : ""}`,
			);
			const pick = button("", "casting-pick");
			pick.dataset.focus = `popular-pick:${voice.id}`;
			const copy = el("span", "casting-pick-copy");
			const first = (voice.uses || voice.providerTags || [])[0];
			copy.append(
				el("span", "voice-name", voice.name),
				el(
					"span",
					"voice-detail",
					[first && `#${first}`, voice.language].filter(Boolean).join(" · "),
				),
			);
			pick.append(el("span", "avatar", voice.initial), copy);
			pick.addEventListener("click", () => select(voice, pick.dataset.focus));
			card.append(sampleButton(voice, false, "popular-"), pick);
			return card;
		};
		const renderBrowse = () => {
			const popular = el("section", "casting-browse-section");
			const head = el("div", "casting-browse-head");
			head.append(el("h2", "casting-browse-title", "인기"));
			popular.append(head);
			const ranked = Object.keys(providerSorts).filter(
				(name) => c.provider === "all" || name === c.provider,
			);
			if (!ranked.length)
				popular.append(
					el("p", "meta-text", `${c.provider} 목록 API에는 인기 순이 없어요.`),
				);
			else {
				// 공급자마다 인기 기준이 달라 한 번에 한 공급자만 보인다.
				if (!ranked.includes(c.popular)) [c.popular] = ranked;
				const [key, label] = providerSorts[c.popular][0];
				const picks = el("div", "casting-popular-picks");
				for (const name of ranked) {
					const caption = `${name} · ${providerSorts[name][0][1]}`;
					if (ranked.length === 1) {
						picks.append(el("span", "meta-text", caption));
						break;
					}
					const chip = button(caption, "filter-chip");
					chip.setAttribute("aria-pressed", String(name === c.popular));
					chip.dataset.focus = `popular-provider:${name}`;
					chip.addEventListener("click", () => {
						c.popular = name;
						renderBrowse();
						$(`[data-focus="popular-provider:${name}"]`)?.focus();
					});
					picks.append(chip);
				}
				const all = button("모두 보기", "text-button");
				all.setAttribute("aria-label", `${c.popular} 성우 모두 보기, ${label}`);
				all.addEventListener("click", () => {
					c.sort = `stat:${key}`;
					setProvider(c.popular);
					focusFirstRow();
					announce(`${c.provider} 성우를 정렬했어요: ${label}.`);
				});
				head.append(picks, all);
				const cards = el("ul", "casting-cards");
				cards.setAttribute("aria-label", `${c.popular} ${label}`);
				for (const voice of filterVoices({
					...c,
					classes: c,
					provider: c.popular,
					sort: `stat:${key}`,
				}).slice(0, 6))
					cards.append(voiceCard(voice));
				popular.append(cards);
			}
			const key = contentKey(c.provider);
			const [label] = facetDefs[key];
			const groupsByValue = new Map();
			for (const voice of voiceData) {
				if (c.provider !== "all" && voice.provider !== c.provider) continue;
				for (const value of facetValues(voice, key))
					groupsByValue.set(value, [
						...(groupsByValue.get(value) || []),
						voice,
					]);
			}
			const topics = el("section", "casting-browse-section");
			topics.append(el("h2", "casting-browse-title", `${label}별 성우`));
			const tiles = el("ul", "casting-topics");
			// ponytail: 성우가 많은 6개만. 나머지는 위 콘텐츠 줄의 더보기에서 고른다.
			for (const [value, voices] of [...groupsByValue]
				.sort(
					(a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "ko"),
				)
				.slice(0, 6)) {
				const tile = button("", "casting-topic");
				const faces = el("span", "avatar-stack");
				for (const voice of voices.slice(0, 3))
					faces.append(el("span", "avatar", voice.initial));
				tile.append(
					faces,
					el("span", "casting-topic-name", value),
					el("span", "casting-topic-count", `${voices.length}명`),
					icon("chevron-right"),
				);
				tile.addEventListener("click", () => {
					c.facets[key] = [value];
					renderFacets();
					renderList();
					focusFirstRow();
					announce(`${label} ${value} 성우 ${voices.length}명을 보여 줘요.`);
				});
				const item = el("li");
				item.append(tile);
				tiles.append(item);
			}
			topics.append(tiles);
			browse.replaceChildren(popular, topics);
		};
		const bar = el("div", "casting-result-bar");
		const count = el("p", "meta-text casting-result-count");
		count.setAttribute("role", "status");
		const selectBox = (label, options, value, onChange) => {
			const wrap = el("label", "studio-voice-view", label);
			const select = el("select", "casting-select");
			for (const [id, name] of options) {
				const option = el("option", "", name);
				option.value = id;
				select.append(option);
			}
			select.value = value;
			select.addEventListener("change", () => onChange(select.value));
			wrap.append(select);
			return [wrap, select];
		};
		const [viewWrap] = selectBox(
			"보기",
			[
				["all", "전체 성우"],
				["favorites", "즐겨찾기"],
				["frequent", "자주 사용"],
			],
			c.view,
			(value) => {
				c.view = value;
				renderList();
			},
		);
		const [sortWrap, sortSelect] = selectBox(
			"정렬",
			[
				["default", "기본"],
				["recent", "최근 사용"],
				["favorites", "즐겨찾기 먼저"],
			],
			c.sort,
			(value) => {
				c.sort = value;
				renderList();
			},
		);
		bar.append(listTitle, count, viewWrap, sortWrap);
		const setProvider = (name) => {
			c.provider = name;
			for (const tab of $$("[data-casting-provider]", tabs)) {
				const on = tab.dataset.castingProvider === name;
				tab.classList.toggle("is-selected", on);
				tab.setAttribute("aria-pressed", String(on));
			}
			search.placeholder = searchHints[name];
			for (const option of $$("option[data-provider-sort]", sortSelect))
				option.remove();
			for (const [key, label] of providerSorts[name] || []) {
				const option = el("option", "", label);
				option.value = `stat:${key}`;
				option.dataset.providerSort = "";
				sortSelect.append(option);
			}
			if (![...sortSelect.options].some((option) => option.value === c.sort))
				c.sort = "default";
			sortSelect.value = c.sort;
			renderFacets();
			renderList();
		};
		const resetAll = () => {
			Object.assign(c, {
				provider: "all",
				query: "",
				facets: {},
				channels: [],
				categories: [],
				types: [],
				view: "all",
				sort: "default",
			});
			renderCastingPage(view);
			$("#casting-view .casting-search input")?.focus();
		};

		// 목록: 행을 누르면 성우 패널(좁은 폭은 드로어)에 그 성우가 뜬다.
		const list = el("ul", "casting-list");
		list.setAttribute("aria-label", "성우 목록");
		const select = (voice, focusKey) => {
			c.selected = voice.id;
			if (castingNarrow()) {
				renderList();
				renderPanel();
				openDrawer({
					title: "성우 자세히",
					subtitle: voice.name,
					node: panel,
					returnFocus: $(`[data-focus="${focusKey}"]`),
				});
				// 열자마자 Enter로 작업실로 넘어가지 않게 제목에서 시작한다.
				$("#drawer-title").focus();
				return;
			}
			refresh(focusKey);
			announce(`성우 패널에 ${voice.name} 성우를 열었어요.`);
		};
		const renderList = () => {
			const results = filterVoices({ ...c, classes: c });
			// 목록에서 빠진 성우는 패널에 남기지 않는다. 첫 결과로 옮기고 결과가 없으면 비운다.
			if (!results.some((voice) => voice.id === c.selected)) {
				c.selected = results[0]?.id ?? null;
				renderPanel();
			}
			const chosen =
				facetCount(c.facets) +
				groups.reduce((sum, [group]) => sum + c[group].length, 0);
			conditionsToggle.lastChild.textContent = chosen
				? `조건 ${chosen}`
				: "조건";
			const browsing = !chosen && !c.query.trim() && c.view === "all";
			count.textContent = `${browsing ? "" : "성우 "}${results.length}명`;
			browse.hidden = !browsing;
			listTitle.hidden = !browsing;
			if (browsing) renderBrowse();
			list.replaceChildren();
			if (!results.length) {
				const item = el("li");
				const noMine =
					c.facets.mine?.length && !voiceData.some((voice) => voice.mine);
				item.append(
					noMine
						? makeEmpty(
								"아직 내 보이스가 없어요",
								"내 보이스에서 클론을 만들거나 ElevenLabs 목소리를 연결하면 여기서 고를 수 있어요.",
								"내 보이스로 가기",
								() => {
									showView("mine");
									history.replaceState(null, "", "#mine");
								},
							)
						: makeEmpty(
								"조건에 맞는 성우가 없어요",
								"조건을 해제하거나 다른 공급자를 골라 보세요.",
								"조건 모두 해제",
								resetAll,
							),
				);
				list.append(item);
				return;
			}
			for (const voice of results) {
				const current = voice.id === c.selected;
				const row = el("li", `casting-row${current ? " is-selected" : ""}`);
				const pick = button("", "casting-pick");
				pick.dataset.focus = `pick:${voice.id}`;
				if (current) pick.setAttribute("aria-current", "true");
				const copy = el("span", "casting-pick-copy");
				const nameLine = el("span", "voice-name-line");
				nameLine.append(el("span", "voice-name", voice.name));
				if (c.playing?.endsWith(`:${voice.id}`))
					nameLine.append(el("span", "tag tag-blue", "재생 중"));
				// 성우를 옮겨 다녀도 어느 성우를 이미 들어 봤는지 목록에서 보인다.
				if (c.takes[voice.id]?.status === "success")
					nameLine.append(el("span", "tag", "시험 생성 결과"));
				const mine = groups.flatMap(([group]) =>
					classification().getLabels(voice, group),
				);
				copy.append(
					nameLine,
					el("span", "voice-provider", voiceMeta(voice)),
					el(
						"span",
						"voice-detail",
						[
							voice.tone,
							...(voice.uses || voice.providerTags || [])
								.slice(0, 2)
								.map((tag) => `#${tag}`),
						].join(" "),
					),
				);
				if (mine.length) {
					const tags = el("span", "casting-row-tags");
					for (const name of mine) tags.append(el("span", "tag", name));
					copy.append(tags);
				}
				pick.append(el("span", "avatar", voice.initial), copy);
				pick.addEventListener("click", () => select(voice, pick.dataset.focus));
				row.append(sampleButton(voice), pick, favoriteButton(voice));
				list.append(row);
			}
		};

		// 성우 패널: 머리 → 듣기(샘플, 내 대본으로 시험 생성) → 내 분류 → 작업실에서 사용
		const renderPanel = () => {
			panel.replaceChildren();
			const voice = getVoice(c.selected);
			if (!voice) {
				panel.append(
					el("p", "meta-text", "목록에서 성우를 고르면 여기서 듣고 분류해요."),
				);
				return;
			}
			const head = el("header", "casting-panel-head");
			const title = el("h2", "casting-panel-title", voice.name);
			title.id = "casting-panel-title";
			const headCopy = el("div");
			headCopy.append(title, el("p", "voice-provider", voiceMeta(voice)));
			// 패널이 길어도 늘 보이도록 주 동작은 이름 옆에 둔다.
			const use = button("작업실에서 사용", "button button-primary", "wand");
			use.addEventListener("click", () => {
				setDefaultVoice(voice);
				showView("studio");
				history.replaceState(null, "", "#studio");
			});
			head.append(
				el("span", "avatar", voice.initial),
				headCopy,
				favoriteButton(voice, "panel-"),
				use,
			);
			const traits = el("div", "tag-list");
			for (const value of [
				...(voice.uses || []),
				...(voice.providerTags || []),
				...(voice.models || []),
				voice.accent,
			].filter(Boolean))
				traits.append(el("span", "tag", value));
			panel.append(head, el("p", "casting-tone", voice.tone), traits);

			const listen = el("section", "casting-section");
			listen.append(el("h3", "", "듣기"), sampleButton(voice, true));
			if (!voice.sample)
				listen.append(
					el("p", "meta-text", "공급자가 이 성우의 기본 샘플을 주지 않았어요."),
				);
			const scriptLabel = el(
				"label",
				"casting-script-label",
				"내 대본으로 듣기",
			);
			scriptLabel.htmlFor = "casting-script";
			const area = el("textarea", "casting-script");
			area.id = "casting-script";
			area.name = "casting-script";
			area.autocomplete = "off";
			area.dataset.focus = "script";
			area.rows = 3;
			area.value = c.script;
			const meter = el("p", "casting-script-meta");
			meter.id = "casting-script-meta";
			area.setAttribute("aria-describedby", meter.id);
			const sources = el("div", "casting-script-sources");
			const fromStudio = button("작업실 첫 문단", "text-button", "script");
			fromStudio.addEventListener("click", () => {
				c.script = (
					state.scriptSegments?.[0]?.text ?? originalText().split(/\n\s*\n/)[0]
				)
					.trim()
					.slice(0, TRIAL_LIMIT);
				area.value = c.script;
				update();
				area.focus();
			});
			sources.append(fromStudio);
			if (state.scripts.length) {
				const [savedWrap, saved] = selectBox(
					"저장 대본",
					[
						["", "불러오기"],
						...state.scripts.map((script, index) => [
							String(index),
							script.name,
						]),
					],
					"",
					(value) => {
						if (!value) return;
						c.script = state.scripts[Number(value)].text.slice(0, TRIAL_LIMIT);
						area.value = c.script;
						saved.value = "";
						update();
						area.focus();
					},
				);
				savedWrap.className = "casting-saved-script";
				sources.append(savedWrap);
			}
			const trial = button("", "button button-secondary casting-trial", "wave");
			trial.dataset.focus = "trial";
			const trialText = el("span");
			trial.append(trialText);
			const takeLine = el("div", "casting-take");
			takeLine.setAttribute("role", "status");
			const update = () => {
				const take = c.takes[voice.id];
				const text = c.script.trim();
				const over = c.script.length > TRIAL_LIMIT;
				const usage = estimate(c.script, { voiceId: voice.id }).usageLabel;
				meter.textContent = `${fmt(c.script.length)}/${TRIAL_LIMIT}자 · 예상 사용량 ${usage}${over ? " · 200자까지 시험 생성할 수 있어요" : ""}`;
				meter.classList.toggle("is-over", over);
				area.setAttribute("aria-invalid", String(over));
				const pending = take?.status === "pending";
				trial.disabled = !text || over;
				// 요청 중에는 포커스가 남도록 disabled 대신 aria-disabled로 막는다.
				trial.setAttribute("aria-disabled", String(pending));
				trialText.textContent = pending
					? "요청 중"
					: take?.status === "success" && take.script === c.script
						? "다시 시험 생성"
						: "시험 생성";
				takeLine.replaceChildren();
				if (!take) {
					takeLine.append(
						el(
							"p",
							"meta-text",
							text
								? "시험 생성은 공급자 사용량이 들어요. 누를 때마다 한 번 요청해요."
								: "대본을 넣으면 이 성우로 시험 생성할 수 있어요.",
						),
					);
					return;
				}
				if (pending) {
					takeLine.append(el("p", "meta-text", "시험 생성을 요청하고 있어요."));
					return;
				}
				if (take.status !== "success") {
					takeLine.append(
						el(
							"p",
							"casting-take-error",
							take.status === "lost"
								? "응답을 받지 못했어요. 처리됐는지 알 수 없어 자동으로 다시 요청하지 않아요. 연결 상태의 사용 내역을 확인한 뒤 다시 시험 생성하세요."
								: "공급자 오류로 만들지 못했어요. 잠시 뒤 다시 시험 생성하세요.",
						),
					);
					return;
				}
				const key = `take:${voice.id}`;
				const playing = c.playing === key;
				const play = button(
					playing ? "결과 정지" : "결과 듣기",
					"mini-button",
					playing ? "pause" : "play",
				);
				play.setAttribute("aria-pressed", String(playing));
				play.dataset.focus = key;
				play.addEventListener("click", () =>
					togglePlay(
						key,
						`${voice.name} 시험 생성 결과를 재생하는 시연이에요. 실제 음성은 나오지 않아요.`,
					),
				);
				takeLine.append(
					el(
						"p",
						"meta-text",
						take.script === c.script
							? "이 대본으로 만든 결과예요."
							: "이전 대본으로 만든 결과예요. 지금 대본으로 들으려면 다시 시험 생성하세요.",
					),
					play,
				);
			};
			area.addEventListener("input", () => {
				c.script = area.value;
				update();
			});
			trial.addEventListener("click", () => {
				if (c.takes[voice.id]?.status === "pending") return;
				const script = c.script;
				c.takes[voice.id] = { script, status: "pending" };
				if (c.playing === `take:${voice.id}`) c.playing = null;
				update();
				announce(`${voice.name} 성우로 시험 생성을 요청했어요.`);
				// 실제 앱은 요청 id 하나로 한 번만 보낸다. 시연은 시연 설정의 결과로 끝낸다.
				setTimeout(() => {
					const outcome = state.demo.trial;
					c.takes[voice.id] = { script, status: outcome };
					if (outcome === "success") {
						const { units, unitLabel, usageLabel } = estimate(script, {
							voiceId: voice.id,
						});
						logUsage({
							kind: "generate",
							provider: voice.provider,
							model: "공급자 기본 모델",
							units,
							unitLabel,
							usageLabel,
							note: `시험 생성 · ${voice.name} · 시연`,
						});
					}
					announce(
						{
							success: `${voice.name} 시험 생성을 마쳤어요.`,
							lost: "시험 생성 응답을 받지 못했어요.",
							error: "시험 생성이 공급자 오류로 실패했어요.",
						}[outcome],
					);
					// 패널을 다시 그리지 않아 대본 칸의 입력과 버튼 포커스가 그대로 남는다.
					// 목록은 "시험 생성 결과" 태그를 붙이려고 다시 그린다.
					if (area.isConnected) {
						update();
						const key = document.activeElement?.dataset?.focus;
						renderList();
						if (key?.startsWith("pick:") || key?.startsWith("sample:"))
							$(`[data-focus="${CSS.escape(key)}"]`)?.focus();
					}
				}, 900);
			});
			const trialRow = el("div", "casting-trial-row");
			trialRow.append(trial, takeLine);
			listen.append(scriptLabel, area, meter, sources, trialRow);
			update();

			const mine = el("section", "casting-section");
			mine.append(el("h3", "", "내 분류"));
			const assigned = classification().getAssignments(voice);
			for (const [group, label] of groups) {
				const line = el("div", "casting-assign");
				line.append(el("span", "casting-assign-label", label));
				const chips = el("div", "casting-assign-chips");
				const items = classification().getItems(group);
				const ids = assigned[group];
				for (const item of items.filter((entry) => ids.includes(entry.id))) {
					const chip = el("span", "tag casting-assigned", item.name);
					const remove = button("", "casting-unassign", "close");
					remove.setAttribute("aria-label", `${item.name} ${label}에서 빼기`);
					remove.addEventListener("click", () =>
						assign(
							voice,
							group,
							ids.filter((id) => id !== item.id),
							`${item.name} ${label}에서 뺐어요.`,
						),
					);
					chip.append(remove);
					chips.append(chip);
				}
				const pop = el("div", "facet-pop casting-add-pop");
				pop.id = `casting-add-${group}`;
				pop.popover = "auto";
				pop.append(el("p", "casting-add-title", `${label}에 넣기`));
				const rest = items.filter((entry) => !ids.includes(entry.id));
				const choices = el("div", "voice-facet-chips");
				for (const item of rest) {
					const choice = button(item.name, "filter-chip");
					choice.addEventListener("click", () => {
						pop.hidePopover();
						assign(
							voice,
							group,
							[...ids, item.id],
							`${item.name} ${label}에 넣었어요.`,
						);
					});
					choices.append(choice);
				}
				if (!rest.length)
					choices.append(
						el("p", "meta-text", `모든 ${label}에 이미 들어 있어요.`),
					);
				const form = el("form", "casting-add-form");
				const input = el("input");
				input.name = `casting-new-${group}`;
				input.autocomplete = "off";
				input.placeholder = `새 ${label} 이름…`;
				input.setAttribute("aria-label", `새 ${label} 이름`);
				const create = button("만들고 넣기", "mini-button");
				create.type = "submit";
				const error = el("p", "casting-take-error");
				error.setAttribute("role", "alert");
				form.append(input, create, error);
				form.addEventListener("submit", (event) => {
					event.preventDefault();
					error.textContent = "";
					const item = classification().addItem(group, input.value, error);
					if (!item) return;
					pop.hidePopover();
					renderMine();
					assign(
						voice,
						group,
						[...ids, item.id],
						`새 ${label} ${item.name}에 넣었어요.`,
					);
				});
				pop.append(choices, form);
				const add = button("추가", "filter-chip casting-add", "plus");
				add.setAttribute("aria-label", `${label} 추가`);
				add.setAttribute("popovertarget", pop.id);
				add.dataset.focus = `add:${group}`;
				anchorPopover(pop, add);
				chips.append(add, pop);
				line.append(chips);
				mine.append(line);
			}
			// 즐겨찾기는 이름 옆 별로 올렸다. 자주 사용만 여기 둔다.
			const frequent = voiceFlags(voice).frequent;
			const frequentToggle = button(
				"자주 사용",
				"filter-chip casting-flag",
				frequent ? "check" : "plus",
			);
			frequentToggle.setAttribute("aria-pressed", String(frequent));
			frequentToggle.dataset.focus = "panel-frequent";
			frequentToggle.addEventListener("click", () =>
				setFlag(voice, "frequent"),
			);
			// 메모는 적어 둔 것이 있을 때만 펼쳐 둔다.
			const noteBox = el("details", "casting-note-box");
			noteBox.open = Boolean(state.voiceNotes[voiceKey(voice)]);
			const noteSummary = el("summary", "", "메모");
			const note = el("textarea", "casting-note");
			note.id = "casting-note";
			note.name = "casting-note";
			note.autocomplete = "off";
			note.setAttribute("aria-label", `${voice.name} 메모`);
			note.dataset.focus = "note";
			note.rows = 2;
			note.placeholder = "이 성우를 쓸 때 기억할 점…";
			note.value = state.voiceNotes[voiceKey(voice)] || "";
			note.addEventListener("input", () => {
				state.voiceNotes[voiceKey(voice)] = note.value;
			});
			noteBox.append(noteSummary, note);
			mine.append(frequentToggle, noteBox);

			panel.append(listen, mine);
		};

		conditions.append(
			contentLine,
			filterLine("공급자 분류", facetHost),
			filterLine("내 분류", mineHost),
		);
		// 767px 이하에서는 조건 토글을 검색 칸 옆에 둔다.
		const searchRow = el("div", "casting-search-row");
		searchRow.append(searchField, conditionsToggle);
		main.append(searchRow, tabs, conditions, browse, bar, list);
		content.append(main, panel);
		view.append(content);
		renderMine();
		setProvider(c.provider);
		renderPanel();
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
	// 삽입은 선택하거나 포커스한 문단 뒤에 문단으로 더하고, 교체는 전체를 바꾸고 되돌리기를 남긴다.
	const insertScript = (text, replace) => {
		const incoming = toParagraphs(text, { blankLines: true }).map((part) => ({
			text: part,
			voiceId: activeVoice().id,
		}));
		const before = structuredClone(state.scriptSegments);
		const hadText = before?.some((part) => part.text.trim());
		if (!setSegments(mergeSegments(incoming, replace ? "replace" : "append")))
			return;
		selectTab("paragraph");
		showView("studio");
		if (replace && hadText)
			toast("대본을 교체했어요.", {
				actionLabel: "되돌리기",
				onAction: () =>
					setSegments(before, { label: "대본 교체를 되돌렸어요." }),
			});
		else
			toast(replace ? "대본을 불러왔어요." : "저장 대본을 문단으로 더했어요.");
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
	// 문단 배열이 한 번도 비지 않도록 텍스트를 카드 글자 수 한도(2,000자)에 맞춰 문단으로 만든다.
	const toParagraphs = (text, { blankLines = false } = {}) => {
		const source = String(text ?? "").replace(/\r\n?/g, "\n");
		const parts = blankLines
			? source
					.split(/\n\s*\n/)
					.map((part) => part.trim())
					.filter(Boolean)
			: [source];
		const fitted = parts.flatMap((part) =>
			part.length <= 2000
				? [part]
				: (window.TTSParagraphs?.splitText?.(part, "chars", 1800) ?? [
						part.slice(0, 2000),
					]),
		);
		return fitted.length ? fitted : [""];
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
	// 삽입 기준: 선택한 문단(여러 개면 마지막) → 마지막으로 포커스한 문단 → 없으면 끝.
	let lastFocusedSegmentId = "";
	const anchorSegmentId = () => {
		const cards = $$("#segment-plan .ps-card");
		const checked = cards.filter((card) => $(".ps-card-check", card)?.checked);
		const id =
			checked.at(-1)?.dataset.segmentId ||
			document.activeElement?.closest?.("#segment-plan .ps-card")?.dataset
				.segmentId ||
			lastFocusedSegmentId;
		return state.scriptSegments?.some((part) => part.id === id) ? id : "";
	};
	const mergeSegments = (incoming, mode) => {
		const current = structuredClone(state.scriptSegments || []);
		if (mode === "replace") return structuredClone(incoming);
		// 빈 카드 하나뿐이면 그 자리를 채운다.
		if (current.length === 1 && !current[0].text.trim())
			return structuredClone(incoming);
		const anchor = anchorSegmentId();
		const at = anchor
			? current.findIndex((part) => part.id === anchor) + 1
			: current.length;
		return [
			...current.slice(0, at),
			...structuredClone(incoming),
			...current.slice(at),
		];
	};
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
		const before = structuredClone(state.scriptSegments);
		const hadText = before?.some((part) => part.text.trim());
		const segments = mergeSegments(plan.segments, mode);
		if (segments.length > 200) {
			toast("합친 문단이 200개를 넘습니다. 분량을 줄여 주세요.");
			return false;
		}
		if (!setSegments(segments)) return false;
		selectTab("paragraph");
		showView("studio");
		announce("대본과 문단별 성우 배정을 작업실에 적용했습니다.");
		if (mode === "replace" && hadText)
			toast("대본을 교체했어요.", {
				actionLabel: "되돌리기",
				onAction: () =>
					setSegments(before, { label: "대본 교체를 되돌렸어요." }),
			});
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
	// 문단 0개 상태는 없다. 비었거나 null이면 원문 전체를 문단 1개(기본 성우)로 만든다.
	const setSegments = (segments, { label } = {}) => {
		const requested = segments?.length
			? segments
			: toParagraphs(originalText()).map((text) => ({
					text,
					voiceId: activeVoice().id,
				}));
		if (requested.length > 200) {
			toast("문단은 최대 200개까지 만들 수 있어요.");
			return false;
		}
		const invalid = requested.find(
			(part) =>
				typeof part?.text !== "string" ||
				part.text.length > 2000 ||
				!getVoice(part.voiceId),
		);
		if (invalid) {
			toast("문단 내용이나 성우를 확인해 주세요. 문단당 최대 2,000자입니다.");
			return false;
		}
		const next = structuredClone(requested).map((part, index) => ({
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
			pauseAfter: typeof part.pauseAfter === "number" ? part.pauseAfter : 0.3,
			instruction: typeof part.instruction === "string" ? part.instruction : "",
		}));
		const editor = $("#script-editor");
		const before = editor.value;
		editor.value = next.map((part) => part.text).join("\n\n");
		state.scriptSegments = next;
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
			editor.scrollTop + editor.clientHeight < editor.scrollHeight - 1,
		);
	};
	// 원문 전체 보기는 내용 높이만큼 키운다. CSS max-height(60vh)를 넘을 때만 칸 안에서 스크롤한다.
	// field-sizing을 지원하지 않는 Safari 때문에 JS로 맞춘다.
	const fitReadonlyEditor = () => {
		const editor = $("#script-editor");
		const hint = $("#readonly-more");
		if (!editor.getClientRects().length) return;
		editor.style.height = "auto";
		editor.style.height = `${editor.scrollHeight}px`;
		const clipped = editor.scrollHeight > editor.clientHeight + 1;
		hint.hidden = !clipped;
		if (clipped)
			hint.textContent = `전체 ${state.scriptSegments.length}문단 · 칸 안에서 스크롤하면 끝까지 볼 수 있어요`;
		syncClipped();
	};
	const renderRails = () => {
		const count = state.scriptSegments?.length || 0;
		$("#segment-count").textContent = `문단 ${count}`;
		const merge = $("#merge-all");
		merge.setAttribute("aria-disabled", String(count < 2));
		merge.title = count < 2 ? "문단이 하나뿐이에요" : "";
		updateWorkbar();
		renderRailRoles();
	};
	const renderWorkspace = () => {
		window.TTSParagraphs?.render?.($("#segment-plan"), bridge);
		updateScriptLength();
		fitReadonlyEditor();
		renderRails();
		window.TTSStudioTools?.refresh?.();
	};
	const mergeAllParagraphs = async () => {
		const previous = structuredClone(state.scriptSegments);
		if (previous.length < 2) {
			announce("문단이 하나뿐이라 합칠 게 없어요.");
			return;
		}
		const joined = previous.map((part) => part.text).join("\n");
		if (joined.length > 2000) {
			toast(
				`합치면 ${fmt(joined.length)}자라 한 문단의 최대 2,000자를 넘어요. 일부만 합쳐 주세요.`,
			);
			return;
		}
		const choice = await choose({
			title: "모두 합쳐 한 문단으로 만들까요?",
			message:
				"첫 문단의 성우와 속도·간격·감정을 남기고, 나머지 문단의 설정은 사라져요. 되돌릴 수 있어요.",
			actions: [
				{ label: "취소", value: "cancel" },
				{ label: "모두 합치기", value: "merge", variant: "primary" },
			],
		});
		if (choice !== "merge") return;
		if (
			!setSegments([{ ...previous[0], text: joined }], {
				label: "문단을 모두 합쳐 한 문단으로 만들었어요.",
			})
		)
			return;
		toast("문단을 모두 합쳤어요.", {
			actionLabel: "되돌리기",
			onAction: () =>
				setSegments(previous, { label: "문단 합치기를 되돌렸어요." }),
		});
	};

	// ---- 드로어 (오른쪽 시트 <dialog>) ----
	let drawerState = null;
	let lastPressed = null;
	document.addEventListener(
		"click",
		(event) => {
			const pressed = event.target.closest?.("button");
			if (pressed && !pressed.closest("#studio-drawer")) lastPressed = pressed;
		},
		true,
	);
	let picker = null;
	const returnBorrowed = (st) => {
		for (const { node, parent, next } of st.borrowed) {
			if (!parent.isConnected) continue;
			parent.insertBefore(node, next?.parentNode === parent ? next : null);
		}
	};
	const finishDrawer = (restoreFocus = true) => {
		const st = drawerState;
		if (!st) return;
		drawerState = null;
		returnBorrowed(st);
		st.onClose?.();
		if (!restoreFocus) return;
		// 트리거가 다시 그려져 사라졌으면 selector, 그것도 없으면 마지막으로 누른 버튼으로 돌아간다.
		const target = [
			st.returnFocus,
			st.returnFocusSelector && $(st.returnFocusSelector),
			lastPressed,
		].find((node) => node?.isConnected && node !== document.body);
		target?.focus();
	};
	const closeDrawer = () => {
		const dialog = $("#studio-drawer");
		if (!dialog.open) return;
		dialog.close();
		finishDrawer();
	};
	// node는 Node 하나나 배열. 드로어 본문으로 옮겨 쓰고 닫을 때 원래 자리로 돌려놓는다.
	const openDrawer = ({
		title,
		subtitle = "",
		node,
		render,
		onClose,
		returnFocus,
		returnFocusSelector,
	} = {}) => {
		const dialog = $("#studio-drawer");
		// JS click()처럼 포커스 없이 열리면 activeElement가 body라 마지막으로 누른 버튼으로 돌아온다.
		if (!returnFocus || returnFocus === document.body)
			returnFocus =
				document.activeElement !== document.body
					? document.activeElement
					: lastPressed;
		const body = $("#drawer-body");
		let target = returnFocus;
		let selector = returnFocusSelector;
		if (drawerState) {
			selector ||= drawerState.returnFocusSelector;
			target = drawerState.returnFocus;
			finishDrawer(false);
		}
		drawerState = {
			onClose,
			returnFocus: target,
			returnFocusSelector: selector,
			borrowed: [],
		};
		$("#drawer-title").textContent = title || "";
		const sub = $("#drawer-target");
		sub.textContent = subtitle;
		sub.hidden = !subtitle;
		body.replaceChildren();
		for (const item of [node].flat().filter(Boolean)) {
			drawerState.borrowed.push({
				node: item,
				parent: item.parentNode,
				next: item.nextSibling,
			});
			body.append(item);
		}
		render?.(body);
		if (!dialog.open) dialog.showModal();
		// 검색창이 있으면 그곳, 없으면 본문에서 DOM 순서상 첫 포커스 가능 요소. 스크롤은 맨 위로 둔다.
		(
			body.querySelector("input[type=search]") ||
			body.querySelector(
				"input:not([type=hidden]):not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled), a[href]",
			) ||
			$("#drawer-title")
		).focus({ preventScroll: true });
		body.scrollTop = 0;
		return { close: closeDrawer, body };
	};
	const pickVoice = (voice) => {
		if (picker?.onPick) {
			const { onPick } = picker;
			closeDrawer();
			onPick(voice.id);
			announce(`${voice.name} 성우를 적용했어요.`);
			return;
		}
		setDefaultVoice(voice);
	};
	// 새 문단 기본 성우로 정하고 되돌리기를 준다(성우 선택 창, 성우 캐스팅).
	const setDefaultVoice = (voice) => {
		const previous = state.selectedVoice;
		state.selectedVoice = voice.id;
		updateVoiceSelection();
		closeDrawer();
		// 받침 없음·ㄹ 받침이면 "로", 그 밖의 받침이면 "으로".
		const last = voice.name.charCodeAt(voice.name.length - 1) - 0xac00;
		const ro =
			last >= 0 && last < 11172 && last % 28 !== 0 && last % 28 !== 8
				? "으로"
				: "로";
		toast(`새 문단 기본 성우를 ${voice.name}${ro} 바꿨어요.`, {
			actionLabel: "되돌리기",
			onAction: () => {
				state.selectedVoice = previous;
				updateVoiceSelection();
				announce("새 문단 기본 성우를 되돌렸어요.");
			},
		});
	};
	const openVoicePicker = ({
		label = "새 문단 기본 성우",
		onPick,
		currentVoiceId,
		returnFocus = document.activeElement,
		returnFocusSelector,
	} = {}) => {
		const mine = {
			onPick,
			currentVoiceId: currentVoiceId || state.selectedVoice,
		};
		picker = mine;
		renderVoiceList();
		return openDrawer({
			title: "성우 찾기",
			subtitle: `적용 대상: ${label}`,
			node: $("#voice-picker-panel"),
			returnFocus,
			returnFocusSelector,
			onClose: () => {
				if (picker === mine) picker = null;
				renderVoiceList();
			},
		});
	};
	const narrowRail = matchMedia("(max-width: 1279px)");
	const openSettingsDrawer = (returnFocus = document.activeElement) => {
		const narrow = narrowRail.matches;
		return openDrawer({
			title: narrow ? "작업 설정" : "생성 설정",
			subtitle: "시연 · 실제 요청 없음",
			node: narrow
				? [$("#rail-settings"), $("#settings-inline")]
				: $("#settings-inline"),
			returnFocus,
		});
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
			mine: true,
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
			selectTab("paragraph");
			$("#segment-plan textarea")?.focus();
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
			// 한 덩어리로 저장된 예전 작업은 원문 전체를 문단 1개로 불러온다.
			setSegments(
				toParagraphs(
					typeof project.sourceText === "string" ? project.sourceText : "",
				).map((text) => ({ text, voiceId: activeVoice().id })),
			);
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
		selectTab("paragraph");
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
		openDrawer,
		closeDrawer,
		openVoicePicker,
		openSettingsDrawer,
		setTab: selectTab,
		isSpeakerDetectOn: () => state.speakerDetect,
		demoOutcome: (kind) => state.demo[kind],
	};
	// 좁은 화면에서만 보이는 ⋯ 메뉴. 넓은 화면에서는 CSS가 패널을 늘 펼쳐 둔다.
	const bindCollapsibleMenu = (trigger, panel, closeOn) => {
		const set = (open, refocus) => {
			panel.classList.toggle("is-open", open);
			trigger.setAttribute("aria-expanded", String(open));
			if (!open && refocus) trigger.focus();
		};
		trigger.addEventListener("click", () =>
			set(!panel.classList.contains("is-open")),
		);
		panel.addEventListener("click", (event) => {
			if (event.target.closest(closeOn)) set(false);
		});
		document.addEventListener("keydown", (event) => {
			if (event.key === "Escape" && panel.classList.contains("is-open"))
				set(false, true);
		});
		document.addEventListener("click", (event) => {
			if (
				panel.classList.contains("is-open") &&
				!panel.contains(event.target) &&
				!trigger.contains(event.target)
			)
				set(false);
		});
	};
	const volumeKey = "tts-pilot.prototype.volume.v1";
	const init = () => {
		loadStoredScripts();
		classification().init({
			voices: voiceData,
			onChange: () => {
				const previousFocus = document.activeElement;
				const focusLabel = previousFocus?.getAttribute("aria-label");
				for (const filters of [
					state.libraryFilters,
					state.studioFilters,
					state.casting,
				])
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
		// 768~1023px에서는 좌측 레일이 작업 영역 위에 붙어 따라오므로 툴바가 그 아래에 붙는다.
		new ResizeObserver(() =>
			document.documentElement.style.setProperty(
				"--left-rail-h",
				`${$("#left-rail").offsetHeight}px`,
			),
		).observe($("#left-rail"));
		// 767px 이하에서는 내비가 위쪽에 붙어 있어 툴바가 그 아래에 붙는다.
		const mobileBar = matchMedia("(max-width: 767px)");
		const syncNavInset = () =>
			document.documentElement.style.setProperty(
				"--nav-top-h",
				`${mobileBar.matches ? $(".side-nav").offsetHeight : 0}px`,
			);
		new ResizeObserver(syncNavInset).observe($(".side-nav"));
		mobileBar.addEventListener("change", syncNavInset);
		bindCollapsibleMenu($("#toolbar-more"), $("#toolbar-more-panel"), "button");
		bindCollapsibleMenu($("#header-more"), $("#header-tools"), ".button");
		bindCollapsibleMenu(
			$("#workbar-more"),
			$("#workbar-extras"),
			"#workbar-download",
		);
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
		$("#merge-all").addEventListener("click", mergeAllParagraphs);
		$("#copy-source").addEventListener("click", () =>
			navigator.clipboard?.writeText(originalText()).then(
				() => toast("원문 전체를 복사했어요."),
				() => toast("브라우저 정책으로 복사하지 못했어요."),
			),
		);
		$("#segment-plan").addEventListener("focusin", (event) => {
			const id = event.target.closest?.(".ps-card")?.dataset.segmentId;
			if (id) lastFocusedSegmentId = id;
		});
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
		// 새 방문자의 첫 화면은 예시 원문을 문장 단위로 나눈 문단 카드다. 문단 0개 상태는 없다.
		const firstParagraphs =
			window.TTSParagraphs?.splitText?.(originalText(), "sentence") || [];
		setSegments(
			firstParagraphs.map((text) => ({ text, voiceId: activeVoice().id })),
		);
		state.reviewDirty = false;
		$("#editor-help").textContent =
			"문단을 고치면 이전 발음 교정이 다시 검토 대상으로 바뀝니다.";
		$$(".nav-item, .brand").forEach((nav) => {
			nav.addEventListener("click", (event) => {
				const name = nav.dataset.nav;
				if (!name) return;
				event.preventDefault();
				showView(name);
				history.replaceState(null, "", `#${name}`);
			});
		});
		$$(".filter-row .filter-chip").forEach((chip) => {
			chip.addEventListener("click", () => {
				$$(".filter-row .filter-chip").forEach((item) => {
					const selected = item === chip;
					item.classList.toggle("is-selected", selected);
					item.setAttribute("aria-pressed", String(selected));
				});
				setPickerProvider(chip.dataset.provider);
			});
		});
		$("#voice-search").addEventListener("input", renderVoiceList);
		$("#reset-voice-filters").addEventListener("click", resetVoiceFilters);
		$("#show-empty-voices").addEventListener("click", () => {
			$("#voice-search").value = "없는 성우";
			renderVoiceList();
		});
		viewTabs.forEach(([id, tabSelector], index) => {
			const tab = $(tabSelector);
			tab.addEventListener("click", () => selectTab(id));
			tab.addEventListener("keydown", (event) => {
				const last = viewTabs.length - 1;
				const next = {
					ArrowRight: index === last ? 0 : index + 1,
					ArrowLeft: index === 0 ? last : index - 1,
					Home: 0,
					End: last,
				}[event.key];
				if (next === undefined) return;
				event.preventDefault();
				selectTab(viewTabs[next][0], { focus: true });
			});
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
		$("#open-import-tool").addEventListener("click", (event) =>
			window.TTSStudioTools?.open("import", event.currentTarget),
		);
		$("#open-emotion-tool").addEventListener("click", (event) =>
			window.TTSStudioTools?.open("emotion", event.currentTarget),
		);
		$("#open-tools-menu").addEventListener("click", (event) =>
			window.TTSStudioTools?.openMenu(event.currentTarget),
		);
		$("#open-settings-drawer").addEventListener("click", (event) =>
			openSettingsDrawer(event.currentTarget),
		);
		$("#toggle-settings").addEventListener("click", (event) =>
			openSettingsDrawer(event.currentTarget),
		);
		$("#change-default-voice").addEventListener("click", (event) =>
			openVoicePicker({
				label: "새 문단 기본 성우",
				currentVoiceId: state.selectedVoice,
				returnFocus: event.currentTarget,
			}),
		);
		$("#toolbar-select-all").addEventListener("click", () =>
			window.TTSParagraphs?.selectAll?.(),
		);
		$("#toolbar-split").addEventListener("click", () =>
			window.TTSParagraphs?.openSplit?.(),
		);
		for (const nav of $$(".nav-item[aria-label], .brand[aria-label]"))
			nav.title = nav.getAttribute("aria-label");
		$("#open-roles").addEventListener("click", () =>
			window.TTSParagraphs?.openRoleDialog?.(bridge),
		);
		$("#open-usage").addEventListener("click", () => showView("connections"));
		$("#open-preset-dialog").addEventListener("click", openPresetDialog);
		$("#open-voice-library").addEventListener("click", () => {
			closeDrawer();
			showView("voices");
		});
		$("#open-voice-casting").addEventListener("click", () => {
			closeDrawer();
			showView("casting");
			history.replaceState(null, "", "#casting");
		});
		$("#drawer-close").addEventListener("click", closeDrawer);
		$("#studio-drawer").addEventListener("click", (event) => {
			if (event.target === event.currentTarget) closeDrawer();
		});
		$("#studio-drawer").addEventListener("close", () => {
			if (!$("#studio-drawer").open) finishDrawer();
		});
		const volume = $("#player-volume");
		const savedVolume = readStored(volumeKey, 80);
		if (Number.isFinite(savedVolume)) volume.value = String(savedVolume);
		const syncVolume = () => {
			volume.setAttribute("aria-valuetext", `${volume.value}%`);
			volume.style.setProperty("--fill", `${volume.value}%`);
		};
		volume.addEventListener("input", () => {
			syncVolume();
			writeStored(volumeKey, Number(volume.value));
		});
		syncVolume();
		$("#post-edit").addEventListener("click", () =>
			announce($("#post-edit-reason").textContent),
		);
		$("#reset-settings").addEventListener("click", () => {
			window.TTSGenerationSettings?.resetModel($("#model-select").value);
			toast("현재 모델의 생성 설정을 기본값으로 되돌렸습니다.");
		});
		$("#model-select").addEventListener("change", () => {
			renderModelSettings();
			renderFinalScript();
			noteWorkChange();
		});
		for (const select of $$("#demo-settings select")) {
			select.addEventListener("change", () => {
				state.demo[select.dataset.demo] = select.value;
			});
		}
		// 트리거 옆에 연다. 화면 아래쪽(데스크톱 내비 하단)이면 위로 펼친다.
		$("#demo-settings").addEventListener("beforetoggle", (event) => {
			if (event.newState !== "open") return;
			const pop = event.currentTarget;
			const r = $("#demo-settings-toggle").getBoundingClientRect();
			const width = Math.min(300, innerWidth - 16);
			const above = r.top > innerHeight / 2;
			Object.assign(pop.style, {
				width: `${width}px`,
				left: `${Math.max(8, Math.min(r.left, innerWidth - width - 8))}px`,
				top: above ? "auto" : `${r.bottom + 6}px`,
				bottom: above ? `${innerHeight - r.top + 6}px` : "auto",
			});
		});
		$("#mobile-more-toggle")?.addEventListener("click", () => {
			const open = document.body.classList.toggle("show-mobile-more");
			$("#mobile-more-toggle").setAttribute("aria-expanded", String(open));
		});
		$("#make-audio").addEventListener("click", async () => {
			if (state.isGenerating) return;
			const active = activeSegments();
			if ($("#make-audio").dataset.mode === "review") return goReview();
			if (!active.length) {
				toast("대본을 입력한 뒤 음성을 만들어 주세요.");
				selectTab("paragraph");
				$("#segment-plan textarea")?.focus();
				return;
			}
			const settingErrors =
				window.TTSGenerationSettings?.validate($("#model-select").value) || [];
			if (settingErrors.length) {
				window.TTSGenerationSettings.showErrors(settingErrors);
				return;
			}
			const summary = summarize();
			const skipped = state.scriptSegments.length - active.length;
			const choice = await choose({
				title: "음성 만들기 확인 · 시연",
				message: `문단 ${summary.count}개 · 성우 ${summary.voices}명${skipped ? ` · 빈 문단 ${skipped}개 제외` : ""} · 약 ${formatDuration(summary.seconds)} · 예상 사용량 ${summary.usage}(추정). 실제 요청과 과금은 일어나지 않는 시연입니다.`,
				actions: [
					{ label: "취소", value: "cancel" },
					{ label: "만들기 시연", value: "generate", variant: "primary" },
				],
			});
			if (choice !== "generate" || state.isGenerating) return;
			state.isGenerating = true;
			state.generationSnapshot = {
				segments: structuredClone(active),
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
			showGeneration("working");
			window.setTimeout(() => {
				state.isGenerating = false;
				const outcome = state.demo.generation;
				showGeneration(outcome);
				if (outcome === "success") recordGenerationSuccess();
				// 결과 패널이 보이는 폭(1280px 이상)은 패널을 보이게 스크롤하고, 숨는 폭은 토스트로 알린다.
				const panel = $("#generation-result");
				if (panel.checkVisibility()) {
					panel.scrollIntoView({ block: "nearest" });
					announce(RESULT_TEXT[outcome]);
				} else {
					toast(
						RESULT_TEXT[outcome],
						outcome === "success"
							? {}
							: {
									actionLabel: "다시 만들기",
									// 토스트는 누르면 사라지므로 확인 창을 닫으면 돌아갈 곳을 음성 만들기로 둔다.
									onAction: () => {
										$("#make-audio").focus();
										$("#make-audio").click();
									},
								},
					);
				}
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
		// 열린 탭에서 주소의 #만 바꿔도(새로 고침 없이) 그 화면으로 옮긴다.
		const route = () => {
			const hash = location.hash.slice(1);
			if (
				[
					"studio",
					"casting",
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
		route();
		window.addEventListener("hashchange", route);
	};
	document.addEventListener("DOMContentLoaded", init);
})();
