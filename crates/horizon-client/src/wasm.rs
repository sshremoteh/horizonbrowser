//! WebAssembly browser entrypoints for Horizon Client (Minecraft Java 26.3 Rust rewrite).

use wasm_bindgen::prelude::*;

struct ConsoleLogger;
impl log::Log for ConsoleLogger {
    fn enabled(&self, _metadata: &log::Metadata) -> bool { true }
    fn log(&self, record: &log::Record) {
        web_sys::console::log_1(&format!("[RUST {}] {}", record.level(), record.args()).into());
    }
    fn flush(&self) {}
}
static LOGGER: ConsoleLogger = ConsoleLogger;

#[wasm_bindgen]
pub fn horizon_init() {
    console_error_panic_hook::set_once();
    let _ = log::set_logger(&LOGGER);
    log::set_max_level(log::LevelFilter::Info);
    web_sys::console::log_1(&"Horizon: WASM runtime initialized".into());
}

#[wasm_bindgen]
pub fn horizon_mount_resources(bytes: &[u8]) -> Result<(), JsValue> {
    horizon_client_render::zip::mount_zip(bytes.to_vec())
        .map_err(|e| JsValue::from_str(&format!("Failed to mount resources zip: {e}")))?;
    web_sys::console::log_1(
        &format!("Horizon: Successfully mounted resources ({} bytes)", bytes.len()).into(),
    );
    Ok(())
}

#[wasm_bindgen]
pub fn horizon_start() -> Result<(), JsValue> {
    web_sys::console::log_1(&"Horizon: Launching Minecraft engine...".into());
    crate::game::run()
        .map_err(|e| JsValue::from_str(&format!("Horizon runtime error: {e}")))?;
    Ok(())
}
