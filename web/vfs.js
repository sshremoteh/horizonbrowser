/**
 * Horizon Web VFS (Virtual File System) & Resource Manager
 * - Downloads horizon.zip with real-time speed & progress
 * - Stores the zip archive in IndexedDB / OPFS as a persistent single blob
 * - Mounts the ZIP archive in memory for instant 0ms file lookups
 * - Supports custom worlds, settings and resource pack overrides
 */

const VFS_DB_NAME = "HorizonWebDB";
const VFS_DB_VERSION = 2;
const STORE_BLOBS = "blobs";
const STORE_WORLDS = "worlds";
const STORE_CONFIG = "config";
const ZIP_CACHE_KEY = "horizon_resources_zip_v2";

// Download sources in order of priority:
// 1. Same-origin (directly hosted on GitHub Pages alongside index.html)
// 2. Direct GitHub Release
// 3. CORS Proxies
const DOWNLOAD_MIRRORS = [
    "horizon.zip",
    "https://github.com/sshremoteh/HorizonAndroid/releases/download/v0.1.6-android/horizon.zip",
    "https://api.allorigins.win/raw?url=" + encodeURIComponent("https://github.com/sshremoteh/HorizonAndroid/releases/download/v0.1.6-android/horizon.zip"),
    "https://corsproxy.io/?" + encodeURIComponent("https://github.com/sshremoteh/HorizonAndroid/releases/download/v0.1.6-android/horizon.zip")
];

class HorizonVFS {
    constructor() {
        this.db = null;
        this.zip = null;
        this.fileIndex = new Map(); // path -> zip entry or Uint8Array
        this.isReady = false;
        this.totalFiles = 0;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(VFS_DB_NAME, VFS_DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_BLOBS)) {
                    db.createObjectStore(STORE_BLOBS);
                }
                if (!db.objectStoreNames.contains(STORE_WORLDS)) {
                    db.createObjectStore(STORE_WORLDS, { keyPath: "id" });
                }
                if (!db.objectStoreNames.contains(STORE_CONFIG)) {
                    db.createObjectStore(STORE_CONFIG);
                }
            };
            req.onsuccess = async (e) => {
                this.db = e.target.result;
                resolve();
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async hasCachedZip() {
        if (!this.db) await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction(STORE_BLOBS, "readonly");
            const store = tx.objectStore(STORE_BLOBS);
            const req = store.get(ZIP_CACHE_KEY);
            req.onsuccess = () => resolve(!!req.result);
            req.onerror = () => resolve(false);
        });
    }

    async getCachedZip() {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_BLOBS, "readonly");
            const store = tx.objectStore(STORE_BLOBS);
            const req = store.get(ZIP_CACHE_KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async saveZipToCache(arrayBuffer) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_BLOBS, "readwrite");
            const store = tx.objectStore(STORE_BLOBS);
            const req = store.put(arrayBuffer, ZIP_CACHE_KEY);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async clearCache() {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_BLOBS, "readwrite");
            const store = tx.objectStore(STORE_BLOBS);
            const req = store.delete(ZIP_CACHE_KEY);
            req.onsuccess = () => {
                this.zip = null;
                this.fileIndex.clear();
                this.isReady = false;
                resolve();
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async loadJSZip() {
        if (typeof JSZip !== "undefined") return;
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
            script.onload = () => resolve();
            script.onerror = () => {
                // Secondary CDN
                const fallback = document.createElement("script");
                fallback.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
                fallback.onload = () => resolve();
                fallback.onerror = () => reject(new Error("Не удалось загрузить JSZip"));
                document.head.appendChild(fallback);
            };
            document.head.appendChild(script);
        });
    }

    async mountZipBuffer(arrayBuffer, onProgress) {
        await this.loadJSZip();
        if (onProgress) onProgress({ status: "indexing", text: "Индексация структуры архива..." });

        this.zip = await JSZip.loadAsync(arrayBuffer);
        this.fileIndex.clear();

        let count = 0;
        this.zip.forEach((relativePath, file) => {
            if (!file.dir) {
                // Normalize path to lowercase and forward slashes for robust matching
                const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
                this.fileIndex.set(normalized, file);
                count++;
            }
        });

        this.totalFiles = count;
        this.isReady = true;
        console.log(`[HorizonVFS] Successfully mounted ${count} game resources from zip.`);
        if (onProgress) onProgress({ status: "ready", text: `Загружено ${count} файлов ресурсов!` });
    }

    async loadFromCache(onProgress) {
        const cachedBuffer = await this.getCachedZip();
        if (!cachedBuffer) return false;
        if (onProgress) onProgress({ status: "indexing", text: "Загрузка ресурсов из кэша браузера..." });
        await this.mountZipBuffer(cachedBuffer, onProgress);
        return true;
    }

    async downloadAndMount(onProgress) {
        let lastError = null;
        let downloadedBuffer = null;

        for (let i = 0; i < DOWNLOAD_MIRRORS.length; i++) {
            const url = DOWNLOAD_MIRRORS[i];
            console.log(`[HorizonVFS] Attempting download from mirror [${i + 1}/${DOWNLOAD_MIRRORS.length}]: ${url}`);
            try {
                downloadedBuffer = await this.fetchWithProgress(url, onProgress);
                if (downloadedBuffer && downloadedBuffer.byteLength > 1000000) {
                    console.log(`[HorizonVFS] Download succeeded from ${url} (${downloadedBuffer.byteLength} bytes)`);
                    break;
                }
            } catch (err) {
                console.warn(`[HorizonVFS] Mirror ${url} failed:`, err.message);
                lastError = err;
            }
        }

        if (!downloadedBuffer) {
            throw lastError || new Error("Не удалось скачать архив ресурсов ни с одного из зеркал.");
        }

        // Save to cache
        if (onProgress) onProgress({ status: "saving", text: "Сохранение архива в локальный кэш браузера..." });
        await this.saveZipToCache(downloadedBuffer);

        // Mount
        await this.mountZipBuffer(downloadedBuffer, onProgress);
    }

    async fetchWithProgress(url, onProgress) {
        const response = await fetch(url, { mode: "cors", cache: "default" });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const contentLength = response.headers.get("content-length");
        const total = contentLength ? parseInt(contentLength, 10) : 44507165;
        let loaded = 0;
        const startTime = Date.now();

        const reader = response.body.getReader();
        const chunks = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.length;

            const elapsedSec = (Date.now() - startTime) / 1000;
            const speedBytes = elapsedSec > 0 ? loaded / elapsedSec : 0;
            const speedMB = (speedBytes / (1024 * 1024)).toFixed(1);
            const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;

            if (onProgress) {
                onProgress({
                    status: "downloading",
                    percent,
                    loaded,
                    total,
                    speed: `${speedMB} МБ/с`,
                    text: `Загрузка horizon.zip: ${(loaded / (1024 * 1024)).toFixed(1)} МБ из ${(total / (1024 * 1024)).toFixed(1)} МБ`
                });
            }
        }

        const blob = new Blob(chunks);
        return await blob.arrayBuffer();
    }

    // Read a file from the virtual file system
    async readFile(path) {
        const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
        
        // Exact match
        let entry = this.fileIndex.get(normalized);
        if (!entry) {
            // Try prefix matching (with horizon/resources/ or without)
            if (this.fileIndex.has("horizon/resources/" + normalized)) {
                entry = this.fileIndex.get("horizon/resources/" + normalized);
            } else if (normalized.startsWith("horizon/resources/")) {
                const sub = normalized.replace("horizon/resources/", "");
                if (this.fileIndex.has(sub)) entry = this.fileIndex.get(sub);
            }
        }

        if (!entry) return null;

        if (entry instanceof Uint8Array) {
            return entry;
        }

        // JSZip object
        const bytes = await entry.async("uint8array");
        return bytes;
    }

    async readTextFile(path) {
        const bytes = await this.readFile(path);
        if (!bytes) return null;
        return new TextDecoder("utf-8").decode(bytes);
    }

    async readJsonFile(path) {
        const text = await this.readTextFile(path);
        if (!text) return null;
        return JSON.parse(text);
    }

    // World Management
    async listWorlds() {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_WORLDS, "readonly");
            const store = tx.objectStore(STORE_WORLDS);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async saveWorld(world) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_WORLDS, "readwrite");
            const store = tx.objectStore(STORE_WORLDS);
            const req = store.put(world);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async deleteWorld(id) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_WORLDS, "readwrite");
            const store = tx.objectStore(STORE_WORLDS);
            const req = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e.target.error);
        });
    }
}

window.HorizonVFS = HorizonVFS;
