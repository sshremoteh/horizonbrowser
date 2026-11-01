/**
 * Horizon Browser Main Controller
 * Coordinates WebGPU, VFS, Pointer Lock, Audio and WASM engine
 */

(function () {
    const canvas = document.getElementById("horizon-canvas");
    const splashScreen = document.getElementById("splash-screen");
    const statusTitle = document.getElementById("status-title");
    const statusSpeed = document.getElementById("status-speed");
    const progressBar = document.getElementById("progress-bar-fill");
    const statusDetail = document.getElementById("status-detail");
    const statusPercent = document.getElementById("status-percent");
    const actionArea = document.getElementById("action-area");
    const btnStart = document.getElementById("btn-start");
    const btnRedownload = document.getElementById("btn-redownload");
    const uiToolbar = document.getElementById("ui-toolbar");
    const touchControls = document.getElementById("touch-controls");
    const btnFullscreen = document.getElementById("btn-fullscreen");
    const btnPause = document.getElementById("btn-pause");
    const btnToggleTouch = document.getElementById("btn-toggle-touch");

    let vfs = null;
    let isTouchDevice = false;

    // Detect touch device
    if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
        isTouchDevice = true;
    }

    async function checkWebGPU() {
        if (!navigator.gpu) {
            statusTitle.textContent = "WebGPU не поддерживается";
            statusTitle.style.color = "#ff5555";
            statusDetail.textContent = "Ваш браузер не поддерживает WebGPU. Пожалуйста, используйте актуальную версию Chrome, Edge или Safari 18+.";
            return false;
        }

        try {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                statusTitle.textContent = "WebGPU адаптер не найден";
                statusTitle.style.color = "#ffaa00";
                statusDetail.textContent = "Не удалось инициализировать графический адаптер WebGPU.";
                return false;
            }
            console.log("[Horizon] WebGPU Adapter detected:", adapter);
            return true;
        } catch (e) {
            statusTitle.textContent = "Ошибка WebGPU";
            statusDetail.textContent = e.message;
            return false;
        }
    }

    function updateProgress(info) {
        if (info.speed) {
            statusSpeed.textContent = info.speed;
        }
        if (typeof info.percent === "number") {
            progressBar.style.width = info.percent + "%";
            statusPercent.textContent = info.percent + "%";
        }
        if (info.status === "downloading") {
            statusTitle.textContent = "Скачивание ресурсов игры...";
            const loadedMB = (info.loaded / (1024 * 1024)).toFixed(1);
            const totalMB = (info.total / (1024 * 1024)).toFixed(1);
            statusDetail.textContent = `Загрузка horizon.zip: ${loadedMB} МБ из ${totalMB} МБ`;
        } else if (info.status === "unpacking") {
            statusTitle.textContent = "Распаковка ресурсов...";
            statusDetail.textContent = info.text || "Извлечение файлов текстур, моделей и данных...";
        } else if (info.status === "ready") {
            statusTitle.textContent = "Ресурсы готовы!";
            statusDetail.textContent = "Все компоненты игры успешно установлены в кэш браузера.";
        }
    }

    async function setupResources() {
        vfs = new HorizonVFS();
        await vfs.init();

        const isInstalled = await vfs.isResourcesInstalled();
        if (isInstalled) {
            statusTitle.textContent = "Ресурсы найдены в кэше!";
            progressBar.style.width = "100%";
            statusPercent.textContent = "100%";
            statusDetail.textContent = "Ресурсы игры уже загружены и готовы к запуску.";
            showReadyState();
            return;
        }

        // Start automatic download
        try {
            await vfs.downloadAndExtract(updateProgress);
            showReadyState();
        } catch (err) {
            console.error("[Horizon] Download error:", err);
            statusTitle.textContent = "Ошибка загрузки ресурсов";
            statusTitle.style.color = "#ff5555";
            statusDetail.textContent = err.message;
            actionArea.classList.remove("hidden");
            btnStart.classList.add("hidden");
            btnRedownload.textContent = "Повторить загрузку";
        }
    }

    function showReadyState() {
        actionArea.classList.remove("hidden");
        btnStart.classList.remove("hidden");
        btnStart.focus();
    }

    // Canvas & Pointer Lock
    function setupInput() {
        canvas.addEventListener("click", () => {
            if (!document.pointerLockElement) {
                canvas.requestPointerLock().catch(e => console.warn("Pointer lock error:", e));
            }
        });

        document.addEventListener("pointerlockchange", () => {
            const locked = document.pointerLockElement === canvas;
            console.log("[Horizon] Pointer Lock status:", locked);
        });

        // Touch controls setup
        if (isTouchDevice) {
            touchControls.classList.remove("hidden");
        }

        // D-Pad and Touch Buttons dispatching synthetic keyboard/mouse events
        const bindButton = (el, key, mouse) => {
            const startHandler = (e) => {
                e.preventDefault();
                el.classList.add("active");
                if (key) {
                    window.dispatchEvent(new KeyboardEvent("keydown", { code: key, bubbles: true }));
                }
                if (typeof mouse !== "undefined") {
                    canvas.dispatchEvent(new MouseEvent("mousedown", { button: parseInt(mouse, 10), bubbles: true }));
                }
            };
            const endHandler = (e) => {
                e.preventDefault();
                el.classList.remove("active");
                if (key) {
                    window.dispatchEvent(new KeyboardEvent("keyup", { code: key, bubbles: true }));
                }
                if (typeof mouse !== "undefined") {
                    canvas.dispatchEvent(new MouseEvent("mouseup", { button: parseInt(mouse, 10), bubbles: true }));
                }
            };

            el.addEventListener("touchstart", startHandler, { passive: false });
            el.addEventListener("touchend", endHandler, { passive: false });
            el.addEventListener("mousedown", startHandler);
            el.addEventListener("mouseup", endHandler);
        };

        document.querySelectorAll("[data-key], [data-mouse]").forEach(el => {
            bindButton(el, el.getAttribute("data-key"), el.getAttribute("data-mouse"));
        });

        // Toolbar buttons
        btnFullscreen.addEventListener("click", () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        });

        btnPause.addEventListener("click", () => {
            window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", bubbles: true }));
            window.dispatchEvent(new KeyboardEvent("keyup", { code: "Escape", bubbles: true }));
        });

        btnToggleTouch.addEventListener("click", () => {
            touchControls.classList.toggle("hidden");
        });
    }

    // Launch Game
    async function startGame() {
        splashScreen.classList.add("hidden");
        uiToolbar.classList.remove("hidden");

        // Unlock Web Audio context
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                const audioCtx = new AudioContext();
                if (audioCtx.state === "suspended") {
                    await audioCtx.resume();
                }
            }
        } catch (e) {
            console.warn("Audio unlock warning:", e);
        }

        // Request Pointer Lock on start
        try {
            await canvas.requestPointerLock();
        } catch (_) {}

        console.log("[Horizon] Launching Web Engine...");

        // If WASM bundle is loaded, invoke its entry point:
        if (window.horizon_wasm_init) {
            try {
                await window.horizon_wasm_init();
            } catch (wasmErr) {
                console.error("[Horizon] WASM run error:", wasmErr);
            }
        } else {
            console.log("[Horizon] Engine canvas initialized. Ready for WASM runtime frame loop.");
        }
    }

    btnStart.addEventListener("click", startGame);

    btnRedownload.addEventListener("click", async () => {
        actionArea.classList.add("hidden");
        await vfs.setResourcesInstalled(false);
        await vfs.downloadAndExtract(updateProgress);
        showReadyState();
    });

    // Resize canvas
    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
    }
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    // Init flow
    async function init() {
        const webGpuOk = await checkWebGPU();
        if (!webGpuOk) return;

        setupInput();
        await setupResources();
    }

    init();
})();
