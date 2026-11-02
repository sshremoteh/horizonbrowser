/* tslint:disable */
/* eslint-disable */

export function horizon_init(): void;

export function horizon_mount_resources(bytes: Uint8Array): void;

export function horizon_start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly horizon_init: () => void;
    readonly horizon_mount_resources: (a: number, b: number) => [number, number];
    readonly horizon_start: () => [number, number];
    readonly wasm_bindgen_4e6aedee96416aba___convert__closures_____invoke___js_sys_78c456de23f8d6ee___Array__web_sys_7394b976ea6a34b1___features__gen_ResizeObserver__ResizeObserver______true_: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen_4e6aedee96416aba___convert__closures_____invoke___wasm_bindgen_4e6aedee96416aba___JsValue__core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_4e6aedee96416aba___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_4e6aedee96416aba___convert__closures_____invoke___wasm_bindgen_4e6aedee96416aba___sys__JsNullable_wgpu_4f8a4b538460ac24___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_4e6aedee96416aba___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_4e6aedee96416aba___convert__closures_____invoke___wasm_bindgen_4e6aedee96416aba___sys__JsNullable_wgpu_4f8a4b538460ac24___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_4e6aedee96416aba___JsError___true__15: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_4e6aedee96416aba___convert__closures_____invoke___wasm_bindgen_4e6aedee96416aba___sys__JsNullable_wgpu_4f8a4b538460ac24___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_4e6aedee96416aba___JsError___true__16: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_4e6aedee96416aba___convert__closures_____invoke___wasm_bindgen_4e6aedee96416aba___JsValue______true_: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_4e6aedee96416aba___convert__closures_____invoke___wasm_bindgen_4e6aedee96416aba___JsValue______true__11: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_4e6aedee96416aba___convert__closures_____invoke___wasm_bindgen_4e6aedee96416aba___JsValue______true__12: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_4e6aedee96416aba___convert__closures_____invoke___wasm_bindgen_4e6aedee96416aba___JsValue______true__13: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_4e6aedee96416aba___convert__closures_____invoke___wasm_bindgen_4e6aedee96416aba___JsValue______true__14: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_4e6aedee96416aba___convert__closures_____invoke___wasm_bindgen_4e6aedee96416aba___JsValue______true__6: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_4e6aedee96416aba___convert__closures_____invoke___wasm_bindgen_4e6aedee96416aba___JsValue______true__7: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_4e6aedee96416aba___convert__closures_____invoke___wasm_bindgen_4e6aedee96416aba___JsValue______true__8: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_4e6aedee96416aba___convert__closures_____invoke___wgpu_4f8a4b538460ac24___backend__webgpu__webgpu_sys__gen_GpuDeviceLostInfo__GpuDeviceLostInfo______true_: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_4e6aedee96416aba___convert__closures_____invoke_______true_: (a: number, b: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
