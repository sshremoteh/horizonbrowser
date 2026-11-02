/**
 * Horizon Web — WASM Engine Loader
 * - Locates the game engine module (horizon.wasm) from the mounted VFS,
 *   same-origin folders of configurable mirrors
 * - Compiles it with streaming progress
 * - Boots it on #horizon-canvas, bridging VFS reads into the module
 * - Always resolves into a clear state: ready / unsupported / not found,
 *   so the UI never falls back to a silent black screen
 */

const ENGINE_MIRRORS = [
    "engine/",
    // Future: unpacked engine shipped inside the resource pack
    "horizon/engine/",
    // Configurable remote engine (override with window.HORIZON_ENGINE_URL)
    window.HORIZON_ENGINE_URL || "https://cdn.playhorizon.dev/engine/"
];

const ENGINE_MANIFEST_KEY = "horizon_engine_manifest";

class HorizonEngineLoader {
    constructor(vfs) {
        this.vfs = vfs;
        this.state = "idle"; // idle | loading | ready | not-found | unsupported | error
        this.error = null;
        this.engine = null;
        this.deadMirrors = this.readDeadMirrors();
    }

    // Mirrors that were unreachable recently are skipped (~1 session TTL),
    // so a dead CDN does not stall every load attempt for a minute.
    static DEAD_KEY = "horizon_engine_dead_mirrors";
    static DEAD_TTL_MS = 30 * 60 * 1000;

    readDeadMirrors() {
        try {
            const raw = JSON.parse(sessionStorage.getItem(HorizonEngineLoader.DEAD_KEY) || "[]");
            const now = Date.now();
            return raw.filter(e => now - e.t < HorizonEngineLoader.DEAD_TTL_MS);
        } catch (_) { return []; }
    }

    markMirrorDead(base) {
        const url = new URL(base, location.href);
        if (url.origin === location.origin) return; // local files never skipped
        this.deadMirrors.push({ u: url.origin + url.pathname, t: Date.now() });
        try { sessionStorage.setItem(HorizonEngineLoader.DEAD_KEY, JSON.stringify(this.deadMirrors)); } catch (_) {}
    }

    isMirrorDead(base) {
        try {
            const url = new URL(base, location.href);
            const key = url.origin + url.pathname;
            return this.deadMirrors.some(e => e.u === key);
        } catch (_) { return false; }
    }

    escapeForRegex(base) {
        return base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/https?:\/\//g, "https?://");
    }

    async fetchWithTimeout(url, opts = {}, timeoutMs = 10000) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            return await fetch(url, { ...opts, signal: ctrl.signal });
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Load the engine. Calls onProgress({ stage, text, percent }) and returns the
     * engine module. Throws with a human-readable message on failure.
     */
    async load(onProgress = () => {}) {
        if (this.state === "ready" && this.engine) return this.engine;
        if (this.state === "loading") throw new Error("Загрузка движка уже идёт.");

        // 1. Hard feature checks — fail loudly instead of a black canvas
        if (!window.WebAssembly) {
            this.state = "unsupported";
            throw new Error("Ваш браузер не поддерживает WebAssembly. Обновите его до актуальной версии.");
        }

        onProgress({ stage: "probe", text: "Проверка графического API...", percent: 5 });
        if (!navigator.gpu || !navigator.gpu.requestAdapter) {
            this.state = "unsupported";
            throw new Error(
                "WebGPU недоступен. Движку Horizon нужен WebGPU: используйте Chrome/Edge 113+ (или включите флаг WebGPU)." +
                (navigator.userAgent.includes("Firefox") || navigator.userAgent.includes("Gecko/") ?
                    " В Firefox включите dom.webgpu.enabled." : "")
            );
        }
        try {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) throw new Error("no adapter");
        } catch (err) {
            this.state = "unsupported";
            throw new Error("WebGPU есть, но ни один GPU-адаптер не доступен (VRAM/драйвер?). " + err.message);
        }

        this.state = "loading";
        onProgress({ stage: "search", text: "Загрузка движка Horizon (Rust WebGPU)...", percent: 15 });

        // 1. Primary: load the genuine Horizon Rust WebAssembly build from ./pkg/
        try {
            onProgress({ stage: "download", text: "Загрузка WebAssembly модуля Horizon...", percent: 30 });
            const horizonWasm = await import("./pkg/horizon_client.js");
            onProgress({ stage: "compile", text: "Компиляция и линковка с WebGPU...", percent: 70 });
            await horizonWasm.default("./pkg/horizon_client_bg.wasm");
            onProgress({ stage: "init", text: "Инициализация подсистем ядра Rust...", percent: 90 });
            horizonWasm.horizon_init();

            this.engine = horizonWasm;
            this.state = "ready";
            window.horizon_engine = horizonWasm;
            onProgress({ stage: "ready", text: "Движок Horizon (Rust / WebGPU) готов!", percent: 100 });
            console.log("[HorizonEngine] Genuine Rust WASM engine loaded successfully from ./pkg/!");
            return horizonWasm;
        } catch (err) {
            console.warn("[HorizonEngine] Primary pkg/ load failed, trying fallback:", err);
        }

        // Locate the engine: in-VFS first (instant, local), then HTTP mirrors.
        // Mirrors are probed in parallel with hard timeouts so one dead CDN
        // cannot stall the whole load for a minute.
        let vfsError = null;
        if (this.vfs && this.vfs.isReady) {
            try {
                const bytes = await this.vfs.readFile("horizon/engine/horizon.wasm");
                if (bytes && bytes.length > 0) {
                    onProgress({ stage: "download", text: "Движок найден в horizon.zip, декодирование...", percent: 40 });
                    const module = await this.compileAndInstantiate(bytes, onProgress);
                    this.engine = module;
                    this.state = "ready";
                    onProgress({ stage: "ready", text: "Движок готов!", percent: 100 });
                    return module;
                }
            } catch (err) {
                vfsError = err;
            }
        }

        const mirrors = ENGINE_MIRRORS.filter(m => !this.isMirrorDead(m));
        let lastError = vfsError || new Error("движок отсутствует в horizon.zip");

        if (mirrors.length > 0) {
            try {
                const src = await Promise.any(mirrors.map(m =>
                    this.loadFromSource({ kind: "http", base: m }, onProgress)
                ));
                this.engine = src;
                this.state = "ready";
                onProgress({ stage: "ready", text: "Движок готов!", percent: 100 });
                return src;
            } catch (err) {
                // AggregateError: every mirror failed. Remember the dead ones.
                for (const m of mirrors) {
                    // loadFromSource rejects with a tagged error when unreachable
                    lastError = err.errors ? err.errors[err.errors.length - 1] : err;
                }
                mirrors.forEach(m => this.markMirrorDead(m));
            }
        } else {
            lastError = new Error("зеркала движка временно недоступны, повторите позже");
        }

        this.state = "not-found";
        throw new Error(
            "WASM-модуль движка (horizon.wasm) не найден: " + (lastError ? lastError.message : "источники недоступны") +
            ". Загрузите актуальный horizon.zip в разделе «Ресурсы» или разместите engine/ рядом с сайтом."
        );
    }

    async loadFromSource(src, onProgress) {
        if (src.kind === "vfs") {
            const bytes = await this.vfs.readFile(src.base + "horizon.wasm");
            if (!bytes || bytes.length === 0) throw new Error("в архиве нет horizon/engine/horizon.wasm");
            onProgress({ stage: "download", text: "Движок найден в horizon.zip, декодирование...", percent: 40 });
            return await this.compileAndInstantiate(bytes, onProgress);
        }

        // HTTP: try manifest first, else plain wasm
        let wasmUrl = src.base + "horizon.wasm";
        let glueUrl = src.base + "horizon.js";
        try {
            const manifestResp = await this.fetchWithTimeout(src.base + "manifest.json", { cache: "no-cache" }, 8000);
            if (manifestResp.ok) {
                const manifest = await manifestResp.json();
                if (manifest.wasm) wasmUrl = src.base + manifest.wasm;
                if (manifest.js) glueUrl = src.base + manifest.js;
            }
        } catch (_) {}

        // Glue script is optional (wasm-bindgen / custom ABI)
        try {
            const glueResp = await this.fetchWithTimeout(glueUrl, { cache: "no-cache" }, 10000);
            if (glueResp.ok) {
                const text = await glueResp.text();
                if (text && text.length < 10_000_000 && /function|wasm/i.test(text)) {
                    // eslint-disable-next-line no-new-func
                    new Function(text + "\n//# sourceURL=" + glueUrl)();
                    onProgress({ stage: "download", text: "Загрузка WASM-модуля движка...", percent: 40 });
                }
            }
        } catch (_) {}

        const wasmResp = await this.fetchWithTimeout(wasmUrl, { cache: "no-cache" }, 15000);
        if (!wasmResp.ok) throw new Error(`${wasmUrl}: HTTP ${wasmResp.status}`);
        const bytes = await this.readWithProgress(wasmResp, onProgress, 40, 80);
        console.log(`[HorizonEngine] Engine found at ${wasmUrl} (${(bytes.byteLength / 1048576).toFixed(2)} МБ)`);

        return await this.compileAndInstantiate(bytes, onProgress);
    }

    async readWithProgress(response, onProgress, pctFrom, pctTo) {
        const total = parseInt(response.headers.get("content-length") || "0", 10);
        if (!response.body || !total) return await response.arrayBuffer();

        const reader = response.body.getReader();
        const chunks = [];
        let loaded = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.length;
            onProgress({
                stage: "download",
                text: `Загрузка движка: ${(loaded / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} МБ`,
                percent: pctFrom + (loaded / total) * (pctTo - pctFrom)
            });
        }
        const blob = new Blob(chunks);
        return await blob.arrayBuffer();
    }

    async compileAndInstantiate(bytes, onProgress) {
        onProgress({ stage: "compile", text: "Компиляция WASM-модуля...", percent: 82 });

        const imports = this.buildImports();
        const raw = WebAssembly.instantiateStreaming
            ? await WebAssembly.instantiate(new Response(new Uint8Array(bytes), { headers: { "content-type": "application/wasm" } }), imports)
            : await WebAssembly.instantiate(new Uint8Array(bytes), imports);
        const result = await raw;

        const instance = result.instance || result;
        const exports = (result.exports !== undefined) ? result.exports : Object.values(instance.exports);

        return this.finalizeModule(instance, Array.isArray(exports) ? exports[0] : exports, onProgress);
    }

    /** VFS bridge handed to the engine via imports (horizon_vfs_*). */
    buildImports() {
        const env = {};
        if (this.vfs) {
            env.horizon_vfs_file_count = () => this.vfs.totalFiles;
            env.horizon_vfs_has_file = (path) => (this.vfs.fileIndex.has(String(path)) ? 1 : 0);
            env.horizon_vfs_log = (msg) => console.log("[HorizonEngine]", msg);
        }
        return { env };
    }

    /**
     * Wire the compiled module into window.horizon_wasm_launch_world.
     * Supports several common ABI shapes so the loader survives engine refactors.
     */
    finalizeModule(instance, exports, onProgress) {
        onProgress({ stage: "boot", text: "Инициализация движка...", percent: 92 });

        const mod = { instance, exports };
        const pick = (...names) => names.map(n => exports && exports[n]).find(f => typeof f === "function");

        const init = pick("init", "horizon_wasm_init", "start", "default");
        const launch = pick("horizon_wasm_launch_world", "launch_world");
        const canvasEl = document.getElementById("horizon-canvas");

        if (init && init.length >= 1) {
            // Common glue signature: init(canvas, ...)
            try { init(canvasEl, this.vfs); } catch (_) { init(canvasEl); }
        }

        mod.launchWorld = (worldId, mode) => {
            if (launch) launch(worldId, mode);
        };
        window.horizon_wasm_launch_world = mod.launchWorld;
        window.horizon_engine = mod;

        console.log("[HorizonEngine] Engine module ready, exports:", Object.keys(exports || {}).length);
        return mod;
    }

    /** Full reset used by the UI's "Повторить загрузку": re-probe dead mirrors too. */
    resetToIdle() {
        this.state = "idle";
        this.engine = null;
        this.error = null;
        this.deadMirrors = [];
        try { sessionStorage.removeItem(HorizonEngineLoader.DEAD_KEY); } catch (_) {}
    }
}

window.HorizonEngineLoader = HorizonEngineLoader;
