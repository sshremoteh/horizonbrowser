/**
 * Horizon Browser — Main Application Controller
 * Handles Navigation, World Management, Audio, Controls, VFS & Mojang Official Installer
 */

(function () {
    // DOM Elements
    const canvas = document.getElementById("horizon-canvas");
    const menuOverlay = document.getElementById("menu-overlay");
    const uiToolbar = document.getElementById("ui-toolbar");
    const touchControls = document.getElementById("touch-controls");
    const splashTextEl = document.getElementById("splash-text");
    const resourceStatusBadge = document.getElementById("resource-status-badge");
    const resStateEl = document.getElementById("res-state");

    // Modal
    const modalDownload = document.getElementById("modal-download");
    const modalTitle = document.getElementById("download-modal-title");
    const modalStatus = document.getElementById("download-modal-status");
    const progressBar = document.getElementById("download-progress-bar");
    const speedText = document.getElementById("download-speed-text");
    const percentText = document.getElementById("download-percent-text");
    const btnCancelDownload = document.getElementById("btn-cancel-download");

    // Screens
    const screens = {
        title: document.getElementById("screen-title"),
        singleplayer: document.getElementById("screen-singleplayer"),
        createWorld: document.getElementById("screen-create-world"),
        multiplayer: document.getElementById("screen-multiplayer"),
        options: document.getElementById("screen-options"),
        resources: document.getElementById("screen-resources"),
        pause: document.getElementById("screen-pause")
    };

    // State
    let vfs = null;
    let mojangInstaller = null;
    let selectedWorldId = null;
    let isGameRunning = false;
    let isTouchDevice = ("ontouchstart" in window || navigator.maxTouchPoints > 0);

    // Fun Minecraft Splashes
    const SPLASHES = [
        "Rebuilt in Rust!",
        "WebGPU powered!",
        "100% Vanilla Parity!",
        "Now running in your browser!",
        "Java Edition 26.3!",
        "Zero Java Runtime needed!",
        "Chunks loading fast!",
        "Crafting tables included!",
        "Watch out for Creepers!",
        "Runs on GitHub Pages!",
        "WASM magic!"
    ];

    // =========================================================================
    // Screen Navigation
    // =========================================================================

    function showScreen(name) {
        Object.keys(screens).forEach(key => {
            if (screens[key]) {
                screens[key].classList.add("hidden");
                screens[key].classList.remove("active");
            }
        });

        if (screens[name]) {
            screens[name].classList.remove("hidden");
            screens[name].classList.add("active");
        }

        if (name === "singleplayer") {
            refreshWorldList();
        }
    }

    // Back buttons
    document.querySelectorAll(".btn-back").forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.getAttribute("data-target");
            if (target && screens[target.replace("screen-", "")]) {
                showScreen(target.replace("screen-", ""));
            } else {
                showScreen("title");
            }
        });
    });

    // Navigation buttons
    document.getElementById("btn-goto-singleplayer").addEventListener("click", () => showScreen("singleplayer"));
    document.getElementById("btn-goto-multiplayer").addEventListener("click", () => showScreen("multiplayer"));
    document.getElementById("btn-goto-options").addEventListener("click", () => showScreen("options"));
    document.getElementById("btn-goto-resources").addEventListener("click", () => showScreen("resources"));
    document.getElementById("btn-goto-create-world").addEventListener("click", () => showScreen("createWorld"));

    // =========================================================================
    // Resources & VFS Flow
    // =========================================================================

    async function initVFS() {
        vfs = new HorizonVFS();
        await vfs.init();
        mojangInstaller = new MojangInstaller(vfs);

        const hasCache = await vfs.hasCachedZip();
        if (hasCache) {
            updateResourceBadge(true, "Загрузка из кэша...");
            try {
                await vfs.loadFromCache((info) => {
                    if (resStateEl) resStateEl.textContent = info.text || "Чтение кэша...";
                });
                updateResourceBadge(true, `Готово (${vfs.totalFiles.toLocaleString()} файлов)`);
                return;
            } catch (err) {
                console.warn("[Horizon] Failed to mount cached zip, will need re-download:", err);
            }
        }

        updateResourceBadge(false, "Требуется загрузка ресурсов");
        // Start initial quick download automatically
        promptDownloadResources();
    }

    function updateResourceBadge(isReady, text) {
        if (resourceStatusBadge) {
            resourceStatusBadge.textContent = "Ресурсы: " + text;
            resourceStatusBadge.className = "badge-status " + (isReady ? "ready" : "missing");
        }
        if (resStateEl) {
            resStateEl.textContent = text;
            resStateEl.style.color = isReady ? "#55ff55" : "#ffaa00";
        }
    }

    // Quick download of horizon.zip
    function promptDownloadResources() {
        modalDownload.classList.remove("hidden");
        modalTitle.textContent = "Загрузка ресурсов игры (horizon.zip)";
        modalStatus.textContent = "Поиск лучшего источника...";
        progressBar.style.width = "0%";
        speedText.textContent = "0 МБ/с";
        percentText.textContent = "0%";

        vfs.downloadAndMount((info) => {
            if (info.speed) speedText.textContent = info.speed;
            if (typeof info.percent === "number") {
                progressBar.style.width = info.percent + "%";
                percentText.textContent = info.percent + "%";
            }
            if (info.text) modalStatus.textContent = info.text;

            if (info.status === "ready") {
                setTimeout(() => {
                    modalDownload.classList.add("hidden");
                    updateResourceBadge(true, `Готово (${vfs.totalFiles.toLocaleString()} файлов)`);
                }, 800);
            }
        }).catch(err => {
            console.error("[Horizon] Download failed:", err);
            modalStatus.textContent = "Ошибка: " + err.message + ". Вы можете запустить официальную загрузку с серверов Mojang.";
            speedText.textContent = "Сбой";
        });
    }

    // Official Mojang installation pipeline (from HORIZON_MINECRAFT_DOWNLOADER_GUIDE.md)
    async function startMojangOfficialInstall() {
        modalDownload.classList.remove("hidden");
        modalTitle.textContent = "Официальная установка с серверов Mojang";
        modalStatus.textContent = "Подключение к piston-meta.mojang.com...";
        progressBar.style.width = "0%";
        speedText.textContent = "Официальный CDN";
        percentText.textContent = "0%";

        try {
            await mojangInstaller.installOfficialPipeline((info) => {
                if (info.speed) speedText.textContent = info.speed;
                if (typeof info.percent === "number") {
                    progressBar.style.width = info.percent + "%";
                    percentText.textContent = info.percent + "%";
                }
                if (info.text) modalStatus.textContent = info.text;

                if (info.stage === "ready") {
                    setTimeout(() => {
                        modalDownload.classList.add("hidden");
                        updateResourceBadge(true, `Mojang 1.21.4 (${vfs.totalFiles.toLocaleString()} файлов)`);
                    }, 800);
                }
            });
        } catch (err) {
            console.error("[Horizon] Mojang install failed:", err);
            modalStatus.textContent = "Ошибка официальной загрузки: " + err.message;
            speedText.textContent = "Сбой";
        }
    }

    btnCancelDownload.addEventListener("click", () => {
        modalDownload.classList.add("hidden");
    });

    document.getElementById("btn-redownload-resources").addEventListener("click", async () => {
        await vfs.clearCache();
        promptDownloadResources();
    });

    document.getElementById("btn-install-mojang-official").addEventListener("click", async () => {
        await vfs.clearCache();
        startMojangOfficialInstall();
    });

    // File picker for local horizon.zip
    const inputZip = document.getElementById("input-zip-file");
    if (inputZip) {
        inputZip.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            modalDownload.classList.remove("hidden");
            modalTitle.textContent = "Чтение локального архива";
            modalStatus.textContent = `Загрузка ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} МБ)...`;
            progressBar.style.width = "50%";

            try {
                const buffer = await file.arrayBuffer();
                modalStatus.textContent = "Сохранение в кэш браузера...";
                await vfs.saveZipToCache(buffer);
                await vfs.mountZipBuffer(buffer, (info) => {
                    modalStatus.textContent = info.text;
                });
                updateResourceBadge(true, `Готово (${vfs.totalFiles.toLocaleString()} файлов)`);
                setTimeout(() => modalDownload.classList.add("hidden"), 600);
            } catch (err) {
                modalStatus.textContent = "Ошибка чтения архива: " + err.message;
            }
        });
    }

    // =========================================================================
    // World Management
    // =========================================================================

    async function refreshWorldList() {
        const listContainer = document.getElementById("world-list");
        const btnPlay = document.getElementById("btn-play-world");
        const btnDelete = document.getElementById("btn-delete-world");

        listContainer.innerHTML = "";
        selectedWorldId = null;
        btnPlay.disabled = true;
        btnDelete.disabled = true;

        let worlds = await vfs.listWorlds();
        if (worlds.length === 0) {
            const defaultWorld = {
                id: "world_" + Date.now(),
                name: "Мой первый мир",
                mode: "survival",
                created: new Date().toLocaleDateString("ru-RU"),
                seed: "12345678"
            };
            await vfs.saveWorld(defaultWorld);
            worlds = [defaultWorld];
        }

        worlds.forEach((world, index) => {
            const card = document.createElement("div");
            card.className = "world-card" + (index === 0 ? " selected" : "");
            if (index === 0) {
                selectedWorldId = world.id;
                btnPlay.disabled = false;
                btnDelete.disabled = false;
            }

            const modeLabel = world.mode === "creative" ? "Творческий режим" : "Выживание";
            card.innerHTML = `
                <div class="world-icon">🌍</div>
                <div class="world-meta">
                    <span class="world-meta-title">${escapeHtml(world.name)}</span>
                    <span class="world-meta-sub">${modeLabel} • Создан: ${world.created}</span>
                </div>
            `;

            card.addEventListener("click", () => {
                document.querySelectorAll(".world-card").forEach(c => c.classList.remove("selected"));
                card.classList.add("selected");
                selectedWorldId = world.id;
                btnPlay.disabled = false;
                btnDelete.disabled = false;
            });

            card.addEventListener("dblclick", () => {
                selectedWorldId = world.id;
                launchWorld(world);
            });

            listContainer.appendChild(card);
        });
    }

    document.getElementById("btn-play-world").addEventListener("click", async () => {
        if (!selectedWorldId) return;
        const worlds = await vfs.listWorlds();
        const world = worlds.find(w => w.id === selectedWorldId);
        if (world) launchWorld(world);
    });

    document.getElementById("btn-delete-world").addEventListener("click", async () => {
        if (!selectedWorldId) return;
        if (confirm("Вы уверены, что хотите удалить этот мир? Это действие необратимо.")) {
            await vfs.deleteWorld(selectedWorldId);
            refreshWorldList();
        }
    });

    // Create World
    let selectedCreateMode = "survival";
    document.querySelectorAll(".mc-btn-toggle").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".mc-btn-toggle").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            selectedCreateMode = btn.getAttribute("data-mode");
        });
    });

    document.getElementById("btn-confirm-create-world").addEventListener("click", async () => {
        const nameInput = document.getElementById("world-name-input");
        const seedInput = document.getElementById("world-seed-input");

        const worldName = nameInput.value.trim() || "Новый мир";
        const newWorld = {
            id: "world_" + Date.now(),
            name: worldName,
            mode: selectedCreateMode,
            seed: seedInput.value.trim() || Math.floor(Math.random() * 1000000000).toString(),
            created: new Date().toLocaleDateString("ru-RU")
        };

        await vfs.saveWorld(newWorld);
        showScreen("singleplayer");
    });

    // Quick Play
    document.getElementById("btn-quick-play").addEventListener("click", () => {
        launchWorld({
            id: "quick_world",
            name: "Быстрая игра",
            mode: "creative"
        });
    });

    // =========================================================================
    // In-Game & Lifecycle
    // =========================================================================

    async function launchWorld(world) {
        if (!vfs.isReady) {
            alert("Ресурсы игры еще загружаются. Пожалуйста, дождитесь окончания загрузки.");
            promptDownloadResources();
            return;
        }

        console.log("[Horizon] Launching world:", world);

        menuOverlay.classList.add("hidden");
        uiToolbar.classList.remove("hidden");
        isGameRunning = true;

        if (isTouchDevice) {
            touchControls.classList.remove("hidden");
        }

        // Unlock audio
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                const ctx = new AudioContext();
                if (ctx.state === "suspended") await ctx.resume();
            }
        } catch (_) {}

        // Request pointer lock
        try {
            await canvas.requestPointerLock();
        } catch (_) {}

        // Call WASM engine if loaded
        if (window.horizon_wasm_launch_world) {
            window.horizon_wasm_launch_world(world.id, world.mode);
        }
    }

    function pauseGame() {
        if (!isGameRunning) return;
        document.exitPointerLock();
        menuOverlay.classList.remove("hidden");
        showScreen("pause");
    }

    function resumeGame() {
        if (!isGameRunning) return;
        menuOverlay.classList.add("hidden");
        canvas.requestPointerLock().catch(() => {});
    }

    function quitToTitle() {
        isGameRunning = false;
        uiToolbar.classList.add("hidden");
        touchControls.classList.add("hidden");
        document.exitPointerLock();
        showScreen("title");
    }

    // Pause buttons
    document.getElementById("btn-resume-game").addEventListener("click", resumeGame);
    document.getElementById("btn-quit-to-title").addEventListener("click", quitToTitle);
    document.getElementById("btn-tb-pause").addEventListener("click", pauseGame);
    document.getElementById("btn-pause-options").addEventListener("click", () => showScreen("options"));

    // ESC Key Handler
    window.addEventListener("keydown", (e) => {
        if (e.code === "Escape") {
            if (isGameRunning) {
                if (menuOverlay.classList.contains("hidden")) {
                    pauseGame();
                } else if (screens.pause.classList.contains("active")) {
                    resumeGame();
                }
            }
        }
    });

    // Fullscreen toggles
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    }
    document.getElementById("btn-tb-fullscreen").addEventListener("click", toggleFullscreen);
    document.getElementById("btn-toggle-fullscreen").addEventListener("click", toggleFullscreen);

    // Touch controls toggle
    document.getElementById("btn-tb-touch").addEventListener("click", () => {
        touchControls.classList.toggle("hidden");
    });

    // Touch button bindings
    const bindTouch = (el, key, mouse) => {
        const onStart = (e) => {
            e.preventDefault();
            el.classList.add("active");
            if (key) window.dispatchEvent(new KeyboardEvent("keydown", { code: key, bubbles: true }));
            if (typeof mouse !== "undefined") {
                canvas.dispatchEvent(new MouseEvent("mousedown", { button: parseInt(mouse, 10), bubbles: true }));
            }
        };
        const onEnd = (e) => {
            e.preventDefault();
            el.classList.remove("active");
            if (key) window.dispatchEvent(new KeyboardEvent("keyup", { code: key, bubbles: true }));
            if (typeof mouse !== "undefined") {
                canvas.dispatchEvent(new MouseEvent("mouseup", { button: parseInt(mouse, 10), bubbles: true }));
            }
        };
        el.addEventListener("touchstart", onStart, { passive: false });
        el.addEventListener("touchend", onEnd, { passive: false });
        el.addEventListener("mousedown", onStart);
        el.addEventListener("mouseup", onEnd);
    };

    document.querySelectorAll("[data-key], [data-mouse]").forEach(el => {
        bindTouch(el, el.getAttribute("data-key"), el.getAttribute("data-mouse"));
    });

    // Options slider updates
    const bindSlider = (sliderId, valId, unit) => {
        const slider = document.getElementById(sliderId);
        const val = document.getElementById(valId);
        if (slider && val) {
            slider.addEventListener("input", () => {
                val.textContent = slider.value + unit;
            });
        }
    };
    bindSlider("opt-render-dist", "val-render-dist", " чанков");
    bindSlider("opt-fov", "val-fov", "°");
    bindSlider("opt-fps", "val-fps", " FPS");
    bindSlider("opt-volume", "val-volume", "%");

    // Canvas Resize
    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
    }
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize
    splashTextEl.textContent = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
    initVFS();
})();
