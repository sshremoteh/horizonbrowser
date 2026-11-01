/**
 * Horizon Web VFS (Virtual File System) & Resource Downloader
 * Handles downloading horizon.zip from GitHub Releases,
 * unpacking it, and persisting it to OPFS / IndexedDB.
 */

const RESOURCE_ZIP_URL = "https://github.com/sshremoteh/HorizonAndroid/releases/download/v0.1.6-android/horizon.zip";
const DB_NAME = "HorizonVFS";
const DB_VERSION = 1;
const STORE_NAME = "files";
const META_KEY = "__horizon_resources_installed__";

class HorizonVFS {
    constructor() {
        this.db = null;
        this.opfsRoot = null;
        this.hasOPFS = false;
        this.files = new Map(); // In-memory fallback
    }

    async init() {
        // Check for OPFS support
        if (navigator.storage && navigator.storage.getDirectory) {
            try {
                this.opfsRoot = await navigator.storage.getDirectory();
                this.hasOPFS = true;
                console.log("[HorizonVFS] OPFS initialized successfully");
            } catch (err) {
                console.warn("[HorizonVFS] OPFS unavailable, falling back to IndexedDB:", err);
                this.hasOPFS = false;
            }
        }

        // Initialize IndexedDB fallback / metadata storage
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            req.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async isResourcesInstalled() {
        if (!this.db) await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(META_KEY);
            req.onsuccess = () => resolve(!!req.result);
            req.onerror = () => resolve(false);
        });
    }

    async setResourcesInstalled(val = true) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(val, META_KEY);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async writeFile(path, data) {
        // Normalize path
        path = path.replace(/\\/g, "/").replace(/^\/+/, "");
        
        // Write to OPFS if available
        if (this.hasOPFS && this.opfsRoot) {
            try {
                const parts = path.split("/");
                let dir = this.opfsRoot;
                for (let i = 0; i < parts.length - 1; i++) {
                    dir = await dir.getDirectoryHandle(parts[i], { create: true });
                }
                const fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(data);
                await writable.close();
            } catch (e) {
                console.warn("[HorizonVFS] OPFS write failed for", path, e);
            }
        }

        // Also store in memory map for synchronous WASM reads
        this.files.set(path, data);

        // Store in IndexedDB
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(data, path);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async readFile(path) {
        path = path.replace(/\\/g, "/").replace(/^\/+/, "");
        if (this.files.has(path)) {
            return this.files.get(path);
        }
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(path);
            req.onsuccess = () => {
                if (req.result) {
                    this.files.set(path, req.result);
                    resolve(req.result);
                } else {
                    resolve(null);
                }
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async downloadAndExtract(onProgress) {
        onProgress({ status: "downloading", percent: 0, loaded: 0, total: 44507165, speed: "" });

        const startTime = Date.now();
        let response;
        try {
            response = await fetch(RESOURCE_ZIP_URL, { mode: "cors" });
        } catch (fetchErr) {
            console.warn("[HorizonVFS] Direct download failed, trying CORS proxy fallback...", fetchErr);
            // Fallback via CORS proxy if needed
            const proxyUrl = "https://corsproxy.io/?" + encodeURIComponent(RESOURCE_ZIP_URL);
            response = await fetch(proxyUrl);
        }

        if (!response.ok) {
            throw new Error(`Failed to download resources: HTTP ${response.status} ${response.statusText}`);
        }

        const contentLength = response.headers.get("content-length");
        const total = contentLength ? parseInt(contentLength, 10) : 44507165;
        let loaded = 0;

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

            onProgress({
                status: "downloading",
                percent,
                loaded,
                total,
                speed: `${speedMB} MB/s`
            });
        }

        onProgress({ status: "unpacking", percent: 100, loaded, total, text: "Распаковка ресурсов игры..." });

        // Concatenate chunks
        const zipBlob = new Blob(chunks);
        const zipArrayBuffer = await zipBlob.arrayBuffer();

        // Extract using JSZip / fflate
        await this.unzipBuffer(zipArrayBuffer, (unpackedFiles, totalFiles) => {
            const p = Math.round((unpackedFiles / totalFiles) * 100);
            onProgress({
                status: "unpacking",
                percent: p,
                text: `Распаковано ${unpackedFiles} из ${totalFiles} файлов (${p}%)...`
            });
        });

        await this.setResourcesInstalled(true);
        onProgress({ status: "ready", percent: 100, text: "Все ресурсы готовы!" });
    }

    async unzipBuffer(arrayBuffer, onProgress) {
        // Load JSZip dynamically if not present
        if (typeof JSZip === "undefined") {
            await this.loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
        }

        const zip = await JSZip.loadAsync(arrayBuffer);
        const fileNames = Object.keys(zip.files).filter(k => !zip.files[k].dir);
        let count = 0;

        for (const fileName of fileNames) {
            const fileData = await zip.files[fileName].async("uint8array");
            await this.writeFile(fileName, fileData);
            count++;
            if (count % 25 === 0 || count === fileNames.length) {
                if (onProgress) onProgress(count, fileNames.length);
            }
        }
    }

    loadScript(url) {
        return new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = url;
            s.onload = () => resolve();
            s.onerror = (e) => reject(new Error("Failed to load script: " + url));
            document.head.appendChild(s);
        });
    }
}

window.HorizonVFS = HorizonVFS;
