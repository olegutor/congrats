// Copyright (c) 2026 Congrats Steg contributors
// SPDX-License-Identifier: GPL-3.0-only
//
//! Thin WASM bridge to phasm-core Ghost (J-UNIWARD + STC).
//! No host-domain lock (unlike upstream phasm-wasm for phasm.app).

use wasm_bindgen::prelude::*;

use phasm_core::{
    ghost_capacity, ghost_capacity_raw, ghost_decode, ghost_embed_raw, ghost_encode,
    ghost_extract_raw, JpegImage, StegoError,
};

/// Format a `StegoError` as `"CODE:detail"` for JS callers.
fn stego_error_message(err: &StegoError) -> String {
    let code = match err {
        StegoError::InvalidJpeg(_) | StegoError::NoLuminanceChannel => "INVALID_JPEG",
        StegoError::ImageTooSmall => "IMAGE_TOO_SMALL",
        StegoError::ImageTooLarge => "IMAGE_TOO_LARGE",
        StegoError::MessageTooLarge => "MESSAGE_TOO_LARGE",
        StegoError::FrameCorrupted => "FRAME_CORRUPTED",
        StegoError::DecryptionFailed => "DECRYPTION_FAILED",
        StegoError::InvalidUtf8 => "INVALID_UTF8",
        StegoError::Cancelled => "CANCELLED",
        StegoError::KeyDerivationFailed => "KEY_DERIVATION_FAILED",
        StegoError::DuplicatePassphrase => "DUPLICATE_PASSPHRASE",
        StegoError::InvalidVideo(_) => "INVALID_VIDEO",
        StegoError::ShadowEmbedFailed => "SHADOW_EMBED_FAILED",
    };
    let detail = match err {
        StegoError::InvalidJpeg(e) => format!("{e:?}"),
        StegoError::ImageTooSmall => "Image too small for steganography".into(),
        StegoError::ImageTooLarge => "Image too large (max 16384px / 200MP)".into(),
        StegoError::MessageTooLarge => "Message too large for this image".into(),
        StegoError::FrameCorrupted => "No hidden message found or data corrupted".into(),
        StegoError::DecryptionFailed => "Wrong passphrase or no hidden message".into(),
        StegoError::InvalidUtf8 => "Decoded text is not valid UTF-8".into(),
        StegoError::NoLuminanceChannel => "Image has no luminance channel".into(),
        StegoError::Cancelled => "Operation cancelled".into(),
        StegoError::KeyDerivationFailed => "Key derivation failed".into(),
        StegoError::DuplicatePassphrase => "Each layer must use a unique passphrase".into(),
        StegoError::InvalidVideo(s) => format!("Invalid video: {s}"),
        StegoError::ShadowEmbedFailed => {
            "Shadow embed failed: try fewer/shorter shadow messages or a different passphrase"
                .into()
        }
    };
    format!("{code}:{detail}")
}

/// Ghost (J-UNIWARD) capacity in UTF-8 message bytes for a cover JPEG.
#[wasm_bindgen]
pub fn ghost_capacity_bytes(image_bytes: &[u8]) -> Result<u32, JsError> {
    let img = JpegImage::from_bytes(image_bytes)
        .map_err(|jpeg_error| JsError::new(&stego_error_message(&StegoError::InvalidJpeg(jpeg_error))))?;
    let capacity = ghost_capacity(&img).map_err(|error| JsError::new(&stego_error_message(&error)))?;
    Ok(capacity as u32)
}

/// Embed a UTF-8 message into a JPEG via Ghost (J-UNIWARD + STC + AES).
#[wasm_bindgen]
pub fn ghost_embed(
    image_bytes: &[u8],
    message: &str,
    passphrase: &str,
) -> Result<Vec<u8>, JsError> {
    ghost_encode(image_bytes, message, passphrase)
        .map_err(|e| JsError::new(&stego_error_message(&e)))
}

/// Extract a UTF-8 message from a Ghost stego JPEG.
#[wasm_bindgen]
pub fn ghost_extract(image_bytes: &[u8], passphrase: &str) -> Result<String, JsError> {
    let payload =
        ghost_decode(image_bytes, passphrase).map_err(|e| JsError::new(&stego_error_message(&e)))?;
    Ok(payload.text)
}

/// Raw (no AES/CRC) Ghost capacity in payload bytes.
#[wasm_bindgen]
pub fn ghost_capacity_raw_bytes(image_bytes: &[u8]) -> Result<u32, JsError> {
    let img = JpegImage::from_bytes(image_bytes)
        .map_err(|jpeg_error| JsError::new(&stego_error_message(&StegoError::InvalidJpeg(jpeg_error))))?;
    let capacity =
        ghost_capacity_raw(&img).map_err(|error| JsError::new(&stego_error_message(&error)))?;
    Ok(capacity as u32)
}

/// Embed fixed-length raw bytes via Ghost STC (passphrase keys structure only).
#[wasm_bindgen]
pub fn ghost_embed_raw_bytes(
    image_bytes: &[u8],
    payload: &[u8],
    passphrase: &str,
) -> Result<Vec<u8>, JsError> {
    ghost_embed_raw(image_bytes, payload, passphrase)
        .map_err(|e| JsError::new(&stego_error_message(&e)))
}

/// Extract fixed-length raw bytes (always `length` bytes; no auth oracle).
#[wasm_bindgen]
pub fn ghost_extract_raw_bytes(
    image_bytes: &[u8],
    passphrase: &str,
    length: u32,
) -> Result<Vec<u8>, JsError> {
    ghost_extract_raw(image_bytes, passphrase, length as usize)
        .map_err(|e| JsError::new(&stego_error_message(&e)))
}
