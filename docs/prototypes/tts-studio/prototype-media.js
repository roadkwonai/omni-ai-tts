(() => {
	const urls = new Set();
	let activeStop = null;
	let mountCount = 0;
	const el = (tag, text) => {
		const node = document.createElement(tag);
		if (text !== undefined) node.textContent = text;
		return node;
	};
	const revoke = (source) => {
		if (source?.url && urls.has(source.url)) {
			URL.revokeObjectURL(source.url);
			urls.delete(source.url);
		}
	};
	const stopAll = () => {
		activeStop?.();
		activeStop = null;
		document.querySelectorAll("audio").forEach((audio) => {
			audio.pause();
		});
	};
	document.addEventListener(
		"play",
		(event) => {
			if (event.target instanceof HTMLMediaElement)
				document.querySelectorAll("audio,video").forEach((other) => {
					if (other !== event.target) other.pause();
				});
		},
		true,
	);
	window.addEventListener("beforeunload", () => {
		stopAll();
		urls.forEach((url) => {
			URL.revokeObjectURL(url);
		});
	});
	const mount = (host, options = {}) => {
		let source = options.source || null;
		let disposed = false;
		let recorder = null;
		let stream = null;
		let timer = null;
		let started = 0;
		let cancelled = false;
		let operation = 0;
		let resetRecorderButtons = () => {};
		let stopMeter = () => {};
		let removeDeviceListener = () => {};
		const uid = `prototype-media-${++mountCount}`;
		const setBusy = (value) => options.onBusy?.(value);
		const root = el("section");
		root.className = "prototype-media";
		const title = el("h3", options.label || "원본 음성");
		const hint = el(
			"p",
			"파일은 이 브라우저에서만 확인합니다. 서버 전송은 하지 않습니다. 녹음 중 화면을 떠나면 녹음이 취소됩니다.",
		);
		hint.className = "form-note";
		const error = el("p");
		error.className = "prototype-media-error";
		error.setAttribute("role", "alert");
		const controls = el("div");
		controls.className = "prototype-media-controls";
		const fileLabel = el("div");
		fileLabel.className = "prototype-media-file";
		const filePick = el("button", "음성 파일 선택");
		filePick.type = "button";
		filePick.className = "button button-secondary";
		const fileName = el("span");
		fileName.className = "prototype-media-filename";
		const file = el("input");
		file.type = "file";
		file.hidden = true;
		file.setAttribute("aria-label", "원본 음성 파일");
		filePick.addEventListener("click", () => file.click());
		file.accept = ".wav,.mp3,.m4a,.ogg,.webm,.mp4,audio/*";
		fileLabel.append(filePick, fileName, file);
		controls.append(fileLabel);
		const demo = el("button", "예시 원본 사용");
		demo.type = "button";
		demo.className = "button button-secondary";
		controls.append(demo);
		const preview = el("div");
		preview.className = "prototype-media-preview";
		const status = el("p");
		status.setAttribute("role", "status");
		const renderSource = () => {
			filePick.textContent = source ? "다른 음성 파일 선택" : "음성 파일 선택";
			fileName.textContent = source?.name || "준비된 원본 없음";
			preview.replaceChildren();
			if (!source) {
				preview.append(el("p", "원본을 선택해 주세요."));
				return;
			}
			preview.append(
				el("strong", source.name),
				el(
					"p",
					source.kind === "demo"
						? "시연용 원본 정보 · 실제 음성 없음"
						: source.kind === "url"
							? "URL만 확인했습니다. 아직 다운로드하거나 분석하지 않았습니다."
							: `${source.mime || "오디오"} · ${(source.size / 1024).toFixed(0)} KB${Number.isFinite(source.duration) ? ` · ${source.duration.toFixed(1)}초` : ""}`,
				),
			);
			if (source.url) {
				const audio = el("audio");
				audio.controls = true;
				audio.preload = "metadata";
				audio.src = source.url;
				audio.setAttribute("aria-label", "선택한 원본 음성 재생");
				preview.append(audio);
			}
			const remove = el("button", "원본 지우기");
			remove.type = "button";
			remove.className = "mini-button";
			remove.addEventListener("click", () => {
				operation++;
				cancelRecording();
				revoke(source);
				source = null;
				options.onChange?.(null);
				renderSource();
			});
			preview.append(remove);
		};
		const publish = (next) => {
			revoke(source);
			source = next;
			error.textContent = "";
			status.textContent = "원본 준비됨";
			options.onChange?.(source);
			window.TTSStudio?.announce?.(`${source.name} 원본이 준비됐습니다.`);
			renderSource();
		};
		const stopTracks = () => {
			stream?.getTracks().forEach((track) => {
				track.stop();
			});
			stream = null;
			stopMeter();
			clearInterval(timer);
			timer = null;
			setBusy(false);
		};
		const cancelRecording = () => {
			cancelled = true;
			resetRecorderButtons();
			setBusy(false);
			if (recorder?.state === "recording") recorder.stop();
			stopTracks();
		};
		activeStop = cancelRecording;
		file.addEventListener("change", () => {
			const selected = file.files[0];
			if (!selected) return;
			cancelRecording();
			const run = ++operation;
			const limit = options.maxBytes || 25 * 1024 * 1024;
			if (
				selected.size === 0 ||
				selected.size > limit ||
				!/\.(wav|mp3|m4a|ogg|webm|mp4)$/i.test(selected.name)
			) {
				error.textContent = `WAV, MP3, M4A, OGG, WebM 중 비어 있지 않은 ${(limit / 1024 / 1024).toFixed(0)} MB 이하 파일을 선택해 주세요.`;
				file.value = "";
				return;
			}
			status.textContent = "원본 파일 확인 중…";
			setBusy(true);
			const url = URL.createObjectURL(selected);
			urls.add(url);
			const audio = new Audio();
			audio.preload = "metadata";
			const release = () => {
				setBusy(false);
				audio.removeAttribute("src");
				audio.load();
			};
			audio.addEventListener(
				"loadedmetadata",
				() => {
					const duration = audio.duration;
					release();
					if (disposed || run !== operation) {
						revoke({ url });
						return;
					}
					if (!Number.isFinite(duration) || duration <= 0) {
						revoke({ url });
						error.textContent =
							"음성 길이를 확인하지 못했습니다. 다른 파일을 선택해 주세요.";
						return;
					}
					publish({
						kind: "file",
						name: selected.name,
						url,
						duration,
						size: selected.size,
						mime: selected.type || "audio",
						ready: true,
					});
				},
				{ once: true },
			);
			audio.addEventListener(
				"error",
				() => {
					release();
					revoke({ url });
					if (!disposed && run === operation) {
						error.textContent =
							"이 브라우저에서 재생할 수 없는 파일입니다. WAV 또는 MP3로 다시 선택해 주세요.";
						status.textContent = "원본 확인 실패";
					}
				},
				{ once: true },
			);
			audio.src = url;
		});
		demo.addEventListener("click", () => {
			operation++;
			cancelRecording();
			publish({
				kind: "demo",
				name: "깨끗한 단일 화자 · 시연 원본",
				duration: 30,
				size: 480000,
				mime: "audio/wav",
				ready: true,
			});
		});
		if (options.allowUrl) {
			const wrap = el("label", "참고 음성·영상 URL");
			const input = el("input");
			input.type = "url";
			input.placeholder = "https://…";
			input.value = source?.remoteUrl || "";
			const use = el("button", "URL 확인");
			use.type = "button";
			use.className = "button button-secondary";
			use.addEventListener("click", () => {
				try {
					const url = new URL(input.value);
					if (url.protocol !== "https:") throw new Error();
					operation++;
					cancelRecording();
					publish({
						kind: "url",
						name: url.hostname,
						remoteUrl: url.href,
						ready: true,
					});
				} catch {
					error.textContent = "https://로 시작하는 올바른 URL을 입력해 주세요.";
					input.focus();
				}
			});
			wrap.append(input);
			controls.append(wrap, use);
		}
		const level = el("div");
		level.className = "prototype-media-level";
		level.hidden = true;
		if (options.allowRecording !== false) {
			const record = el("button", "녹음 시작");
			record.type = "button";
			record.className = "button button-secondary";
			const stop = el("button", "녹음 중지");
			stop.type = "button";
			stop.className = "button button-secondary";
			stop.disabled = true;
			const deviceField = el("div");
			deviceField.className = "prototype-media-device";
			const deviceLabel = el("label", "입력 장치");
			deviceLabel.htmlFor = `${uid}-device`;
			const device = el("select");
			device.id = `${uid}-device`;
			device.append(new Option("기본 마이크", ""));
			const deviceNote = el(
				"small",
				"녹음을 시작하면 권한을 확인한 뒤 장치 목록을 불러옵니다.",
			);
			deviceNote.id = `${uid}-device-note`;
			device.setAttribute("aria-describedby", deviceNote.id);
			deviceField.append(deviceLabel, device);
			const levelLabel = el("span", "입력 레벨");
			levelLabel.id = `${uid}-level`;
			const meter = el("meter");
			Object.assign(meter, { min: 0, max: 1, low: 0.1, high: 0.85 });
			meter.optimum = 0.5;
			meter.value = 0;
			meter.setAttribute("aria-labelledby", levelLabel.id);
			level.append(levelLabel, meter);
			resetRecorderButtons = () => {
				record.disabled = false;
				stop.disabled = true;
				device.disabled = false;
			};
			let audioContext = null;
			let frame = 0;
			stopMeter = () => {
				cancelAnimationFrame(frame);
				frame = 0;
				audioContext?.close().catch(() => {});
				audioContext = null;
				meter.value = 0;
				level.hidden = true;
			};
			const startMeter = (captured) => {
				const Context = window.AudioContext || window.webkitAudioContext;
				if (!Context) return;
				audioContext = new Context();
				audioContext.resume?.().catch(() => {});
				const analyser = audioContext.createAnalyser();
				analyser.fftSize = 1024;
				audioContext.createMediaStreamSource(captured).connect(analyser);
				const samples = new Float32Array(analyser.fftSize);
				level.hidden = false;
				const tick = () => {
					analyser.getFloatTimeDomainData(samples);
					let sum = 0;
					for (const sample of samples) sum += sample * sample;
					const rms = Math.sqrt(sum / samples.length);
					// -60 dBFS..0 dBFS → 0..1
					meter.value =
						rms > 0
							? Math.min(1, Math.max(0, (20 * Math.log10(rms) + 60) / 60))
							: 0;
					frame = requestAnimationFrame(tick);
				};
				tick();
			};
			const fillDevices = async () => {
				const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
					(item) =>
						item.kind === "audioinput" &&
						item.deviceId &&
						item.deviceId !== "default",
				);
				const current = device.value;
				device.replaceChildren(
					new Option("기본 마이크", ""),
					...inputs.map(
						(item, index) =>
							new Option(item.label || `마이크 ${index + 1}`, item.deviceId),
					),
				);
				const kept =
					!current || inputs.some((item) => item.deviceId === current);
				device.value = kept ? current : "";
				deviceNote.textContent = inputs.length
					? `입력 장치 ${inputs.length}개를 찾았습니다. 바꾸면 다음 녹음부터 적용됩니다.`
					: "기본 마이크만 사용할 수 있습니다.";
				return kept;
			};
			const onDeviceChange = async () => {
				if (disposed) return;
				const kept = await fillDevices();
				if (!kept)
					error.textContent =
						"선택한 입력 장치가 연결 해제되어 기본 마이크로 바꿨습니다.";
				window.TTSStudio?.announce?.("입력 장치 목록이 바뀌었습니다.");
			};
			const watchDevices = () => {
				if (!navigator.mediaDevices.addEventListener) return;
				removeDeviceListener();
				navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
				removeDeviceListener = () => {
					navigator.mediaDevices.removeEventListener(
						"devicechange",
						onDeviceChange,
					);
					removeDeviceListener = () => {};
				};
			};
			const failure = (reason) => {
				const name = reason?.name;
				if (name === "NotAllowedError" || name === "SecurityError")
					return [
						"마이크 권한이 거부됐습니다. 주소창의 사이트 권한에서 마이크를 허용한 뒤 다시 시도하거나 파일을 선택해 주세요.",
						"권한 거부",
					];
				if (name === "NotFoundError")
					return [
						"연결된 마이크가 없습니다. 마이크를 연결한 뒤 다시 시도하거나 파일을 선택해 주세요.",
						"장치 없음",
					];
				if (name === "OverconstrainedError") {
					device.value = "";
					return [
						"선택한 입력 장치를 찾지 못해 기본 마이크로 바꿨습니다. 다시 녹음해 주세요.",
						"장치 없음",
					];
				}
				if (name === "NotReadableError")
					return [
						"다른 앱이 마이크를 쓰고 있어 열 수 없습니다. 그 앱을 닫고 다시 시도해 주세요.",
						"녹음 준비 실패",
					];
				return [
					"마이크를 사용할 수 없습니다. 권한을 허용하고 다시 시도하거나 파일을 선택해 주세요.",
					"녹음 준비 실패",
				];
			};
			record.addEventListener("click", async () => {
				if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
					error.textContent =
						"이 브라우저는 녹음을 지원하지 않습니다. 파일 선택을 사용해 주세요.";
					return;
				}
				cancelRecording();
				cancelled = false;
				const run = ++operation;
				record.disabled = true;
				device.disabled = true;
				error.textContent = "";
				status.textContent = "마이크 권한 확인 중…";
				setBusy(true);
				try {
					const captured = await navigator.mediaDevices.getUserMedia({
						audio: device.value ? { deviceId: { exact: device.value } } : true,
					});
					if (disposed || run !== operation) {
						captured.getTracks().forEach((track) => {
							track.stop();
						});
						return;
					}
					stream = captured;
					await fillDevices().catch(() => true);
					watchDevices();
					const chunks = [];
					recorder = new MediaRecorder(stream);
					recorder.addEventListener("dataavailable", (event) => {
						if (event.data.size) chunks.push(event.data);
					});
					recorder.addEventListener("stop", () => {
						const duration = (performance.now() - started) / 1000;
						stopTracks();
						resetRecorderButtons();
						if (disposed || cancelled || run !== operation) return;
						const blob = new Blob(chunks, { type: recorder.mimeType });
						if (
							blob.size === 0 ||
							blob.size > (options.maxBytes || 25 * 1024 * 1024)
						) {
							error.textContent =
								"녹음이 비어 있거나 크기 제한을 넘었습니다. 짧게 다시 녹음해 주세요.";
							return;
						}
						const url = URL.createObjectURL(blob);
						urls.add(url);
						publish({
							kind: "recording",
							name: "내 녹음",
							url,
							duration,
							size: blob.size,
							mime: blob.type,
							ready: true,
						});
					});
					stream.getAudioTracks()[0]?.addEventListener("ended", () => {
						if (recorder?.state !== "recording" || run !== operation) return;
						error.textContent =
							"입력 장치 연결이 끊겨 녹음을 멈췄습니다. 그때까지 녹음한 내용을 확인해 주세요.";
						stop.click();
					});
					recorder.start();
					started = performance.now();
					stop.disabled = false;
					startMeter(stream);
					status.textContent = "녹음 중 · 0초";
					timer = setInterval(() => {
						const seconds = Math.floor((performance.now() - started) / 1000);
						status.textContent = `녹음 중 · ${seconds}초`;
						if (seconds >= 149) stop.click();
					}, 500);
				} catch (reason) {
					stopTracks();
					resetRecorderButtons();
					if (!disposed) {
						const [text, state] = failure(reason);
						error.textContent = text;
						status.textContent = state;
					}
				}
			});
			stop.addEventListener("click", () => {
				if (recorder?.state === "recording") {
					cancelled = false;
					recorder.stop();
					stop.disabled = true;
				}
			});
			const recorderRow = el("div");
			recorderRow.className = "prototype-media-recorder";
			recorderRow.append(deviceField, record, stop, deviceNote);
			controls.append(recorderRow);
		}
		root.append(title, hint, controls, level, error, status, preview);
		host.append(root);
		renderSource();
		return () => {
			disposed = true;
			operation++;
			cancelRecording();
			removeDeviceListener();
			root.querySelectorAll("audio").forEach((audio) => {
				audio.pause();
			});
			if (activeStop === cancelRecording) activeStop = null;
		};
	};
	const GUIDE_RULES = {
		Typecast:
			"Typecast: WAV/MP3 1개, 5~150초, 25 MiB 이하. 실제 연결 시 계정 조건을 다시 확인합니다.",
		ElevenLabs:
			"ElevenLabs 인스턴트: 깨끗한 단일 화자 녹음 1~2분을 권장합니다. 실제 업로드 제한은 연결 시 확인합니다.",
		"Fish Audio":
			"Fish Audio: 클립당 최소 10초, 권장 1~2분의 깨끗한 단일 화자 음성. 배경음악·잔향·겹치는 목소리는 피합니다.",
	};
	const GUIDE_SCRIPT = [
		"안녕하세요. 이 녹음은 제 목소리를 등록하려고 준비한 낭독입니다. 저는 채널에서 경제와 생활 정보를 짧게 정리해 전하고 있습니다. 오늘은 평소에 말하는 속도와 높이 그대로, 꾸미지 않고 읽어 보겠습니다. 문장이 끝나는 곳에서는 잠깐 숨을 고르고, 숫자나 이름이 나오면 조금 더 또박또박 발음하겠습니다. 중간에 실수를 해도 멈추지 않고 다음 문장으로 자연스럽게 이어 가겠습니다.",
		"영상을 만들 때 가장 오래 걸리는 일은 대본을 다듬는 과정입니다. 같은 내용이라도 어떤 순서로 말하느냐에 따라 듣는 사람이 이해하는 속도가 달라집니다. 그래서 먼저 핵심을 한 문장으로 적고, 그 뒤에 예시와 배경을 덧붙입니다. 마지막으로 소리 내어 읽으면서 어색한 곳을 고칩니다. 이렇게 하면 처음 듣는 분도 이야기의 흐름을 놓치지 않고 따라올 수 있습니다.",
		"요즘은 아침에 날씨를 확인하고, 점심에는 짧게 산책을 합니다. 비가 오는 날에는 창밖을 보며 따뜻한 차를 마시기도 합니다. 작은 습관이지만 하루의 속도를 조절하는 데 도움이 됩니다. 궁금한 점이 있으신가요? 그렇다면 댓글로 남겨 주세요. 다음에는 조금 더 긴 이야기로 찾아오겠습니다. 끝까지 들어 주셔서 감사합니다.",
	];
	const GUIDE_TIPS = [
		"입과 마이크 사이를 10~15cm로 유지해 주세요.",
		"에어컨·음악·알림음이 없는 조용한 곳에서 녹음해 주세요.",
		"연기하지 말고 평소 말하는 목소리와 속도로 읽어 주세요.",
		"한 사람 목소리만 담기게 해 주세요.",
		"다 읽으면 바로 ‘녹음 중지’를 눌러 끝의 무음을 줄여 주세요. 이 화면의 녹음은 150초가 되기 전에 자동으로 멈춥니다.",
	];
	const mountRecordingGuide = (container, { provider } = {}) => {
		const uid = `recording-guide-${++mountCount}`;
		let full = false;
		const root = el("details");
		root.className = "recording-guide";
		root.open = true;
		const summary = el("summary", "녹음 가이드 · 추천 낭독 대본");
		const rules = el("ul");
		rules.className = "recording-guide-rules";
		(GUIDE_RULES[provider]
			? [GUIDE_RULES[provider]]
			: Object.values(GUIDE_RULES)
		).forEach((rule) => {
			rules.append(el("li", rule));
		});
		const toggle = el("div");
		toggle.className = "recording-guide-toggle";
		toggle.setAttribute("role", "group");
		toggle.setAttribute("aria-label", "대본 분량");
		const time = el("p");
		time.className = "recording-guide-time";
		time.setAttribute("role", "status");
		const script = el("div");
		script.className = "recording-guide-script";
		script.id = `${uid}-script`;
		script.tabIndex = 0;
		script.setAttribute("aria-label", "추천 낭독 대본");
		const render = () => {
			const paragraphs = GUIDE_SCRIPT.slice(0, full ? 3 : 2);
			const length = paragraphs.join(" ").length;
			script.replaceChildren(...paragraphs.map((text) => el("p", text)));
			time.textContent = `${full ? "전체 대본" : "권장 분량"} · ${length.toLocaleString()}자 · 예상 낭독 시간 약 ${Math.round(length / 6.6)}초 (한국어 초당 약 6.6자 기준 추정)`;
			toggle.querySelectorAll("button").forEach((item) => {
				item.setAttribute(
					"aria-pressed",
					String((item.value === "full") === full),
				);
			});
		};
		[
			["recommended", "권장 분량"],
			["full", "전체 대본"],
		].forEach(([value, label]) => {
			const item = el("button", label);
			item.type = "button";
			item.value = value;
			item.className = "filter-chip recording-guide-chip";
			item.setAttribute("aria-controls", script.id);
			item.addEventListener("click", () => {
				full = value === "full";
				render();
			});
			toggle.append(item);
		});
		const tipsTitle = el("h4", "녹음 팁");
		const tips = el("ul");
		tips.className = "recording-guide-tips";
		GUIDE_TIPS.forEach((tip) => {
			tips.append(el("li", tip));
		});
		const body = el("div");
		body.className = "recording-guide-body";
		body.append(rules, toggle, time, script, tipsTitle, tips);
		root.append(summary, body);
		container.append(root);
		render();
		return root;
	};
	window.TTSPrototypeMedia = { mount, mountRecordingGuide, stopAll, revoke };
})();
