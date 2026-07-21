/* tslint:disable */
/* eslint-disable */

/**
 * Ghost (J-UNIWARD) capacity in UTF-8 message bytes for a cover JPEG.
 */
export function ghost_capacity_bytes(image_bytes: Uint8Array): number;

/**
 * Raw (no AES/CRC) Ghost capacity in payload bytes.
 */
export function ghost_capacity_raw_bytes(image_bytes: Uint8Array): number;

/**
 * Embed a UTF-8 message into a JPEG via Ghost (J-UNIWARD + STC + AES).
 */
export function ghost_embed(image_bytes: Uint8Array, message: string, passphrase: string): Uint8Array;

/**
 * Embed fixed-length raw bytes via Ghost STC (passphrase keys structure only).
 */
export function ghost_embed_raw_bytes(image_bytes: Uint8Array, payload: Uint8Array, passphrase: string): Uint8Array;

/**
 * Extract a UTF-8 message from a Ghost stego JPEG.
 */
export function ghost_extract(image_bytes: Uint8Array, passphrase: string): string;

/**
 * Extract fixed-length raw bytes (always `length` bytes; no auth oracle).
 */
export function ghost_extract_raw_bytes(image_bytes: Uint8Array, passphrase: string, length: number): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly ghost_capacity_bytes: (a: number, b: number, c: number) => void;
    readonly ghost_capacity_raw_bytes: (a: number, b: number, c: number) => void;
    readonly ghost_embed: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly ghost_embed_raw_bytes: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly ghost_extract: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly ghost_extract_raw_bytes: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly __wbindgen_export: (a: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export2: (a: number, b: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
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
