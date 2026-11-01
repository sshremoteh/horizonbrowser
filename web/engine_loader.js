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
        onProgress({ stage: "search", text: "Поиск WASM-модуля движка...", percent: 10 });

        // 2. Locate the engine: in-VFS first, then same-origin, then mirrors
        const sources = [];
        if (this.vfs && this.vfs.isReady) sources.push({ kind: "vfs", base: "horizon/engine/" });
        for (const mirror of ENGINE_MIRRORS) sources.push({ kind: "http", base: mirror });

        let lastError = null;
        for (const src of sources) {
            try {
                const module = await this.loadFromSource(src, onProgress);
                if (module) {
                    this.engine = module;
                    this.state = "ready";
                    onProgress({ stage: "ready", text: "Движок готов!", percent: 100 });
                    return module;
                }
            } catch (err) {
                console.warn("[HorizonEngine] Source failed:", src.base, err);
                lastError = err;
            }
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
            const manifestResp = await fetch(src.base + "manifest.json", { cache: "no-cache" });
            if (manifestResp.ok) {
                const manifest = await manifestResp.json();
                if (manifest.wasm) wasmUrl = src.base + manifest.wasm;
                if (manifest.js) glueUrl = src.base + manifest.js;
            }
        } catch (_) {}

        // Glue script is optional (wasm-bindgen / custom ABI)
        let glueOk = false;
        try {
            const glueResp = await fetch(glueUrl, { cache: "no-cache" });
            if (glueResp.ok) {
                const text = await glueResp.text();
                if (text && text.length < 10_000_000 && /function|wasm/i.test(text)) {
                    // eslint-disable-next-line no-new-func
                    new Function(text + "\n//# sourceURL=" + glueUrl)();
                    glueOk = true;
                }
                onProgress({ stage: "download", text: "Загрузка WASM-модуля движка...", percent: 40 });
            }
        } catch (err) {
            glueOk = false;
        }

        const wasmResp = await fetch(wasmUrl, { cache: "no-cache" });
        if (!wasmResp.ok) throw new Error(`${wasmUrl}: HTTP ${wasmResp.status}`);
        const bytes = await this.readWithProgress(wasmResp, onProgress, 40, 80);
        console.log(`[HorizonEngine] Engine found at ${wasmUrl} (${(bytes.byteLength / 1048576).toFixed(2)} МБ), glue: ${glueOk}`);

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
}

window.HorizonEngineLoader = HorizonEngineLoader;
