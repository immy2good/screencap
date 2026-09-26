// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::Local;
use image::RgbaImage;
use screenshots::Screen;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, State,
};

#[cfg(all(target_os = "windows", feature = "scap"))]
use scap::{
    capturer::{Capturer, Options},
    frame::Frame,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AppSettings {
    save_directory: String,
    screenshot_format: String,
    video_quality: String,
    capture_microphone: bool,
    capture_system_audio: bool,
    hotkey_fullscreen: String,
    hotkey_region: String,
    hotkey_window: String,
    hotkey_start_recording: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        let pictures_dir = dirs::picture_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("ScreenCap");
        
        Self {
            save_directory: pictures_dir.to_string_lossy().to_string(),
            screenshot_format: "png".to_string(),
            video_quality: "high".to_string(),
            capture_microphone: false,
            capture_system_audio: true,
            hotkey_fullscreen: "Ctrl+Shift+1".to_string(),
            hotkey_region: "Ctrl+Shift+2".to_string(),
            hotkey_window: "Ctrl+Shift+3".to_string(),
            hotkey_start_recording: "Ctrl+Shift+R".to_string(),
        }
    }
}

struct AppState {
    settings: Arc<Mutex<AppSettings>>,
    is_recording: Arc<Mutex<bool>>,
    recording_capturer: Arc<Mutex<Option<RecordingState>>>,
}

struct RecordingState {
    #[cfg(all(target_os = "windows", feature = "scap"))]
    capturer: Capturer,
    output_path: PathBuf,
    start_time: std::time::Instant,
}

#[derive(Debug, Clone, Serialize)]
struct MonitorInfo {
    id: u32,
    name: String,
    width: u32,
    height: u32,
    is_primary: bool,
}

#[derive(Debug, Clone, Serialize)]
struct CaptureResult {
    success: bool,
    path: Option<String>,
    error: Option<String>,
}


fn save_capture(image: &RgbaImage, settings: &AppSettings, prefix: &str) -> Result<CaptureResult, String> {
    let save_dir = PathBuf::from(&settings.save_directory);
    std::fs::create_dir_all(&save_dir).map_err(|e| e.to_string())?;

    let timestamp = Local::now().format("%Y%m%d_%H%M%S");
    let ext = if settings.screenshot_format.eq_ignore_ascii_case("jpg")
        || settings.screenshot_format.eq_ignore_ascii_case("jpeg")
    {
        "jpg"
    } else {
        "png"
    };
    let filename = format!("{}_{}.{}", prefix, timestamp, ext);
    let filepath = save_dir.join(&filename);

    image.save(&filepath).map_err(|e| e.to_string())?;

    Ok(CaptureResult {
        success: true,
        path: Some(filepath.to_string_lossy().to_string()),
        error: None,
    })
}

/// Capture a screen rectangle.
/// `x`/`y`/`width`/`height` must be **physical** virtual-desktop pixels
/// (same space as Win32 `GetWindowRect` / Tauri `outerPosition`).
fn capture_screen_rect(x: i32, y: i32, width: u32, height: u32) -> Result<RgbaImage, String> {
    if width < 2 || height < 2 {
        return Err("Selection too small — drag a larger area".to_string());
    }

    let screens = Screen::all().map_err(|e| e.to_string())?;
    if screens.is_empty() {
        return Err("No screens found".to_string());
    }

    // display_info.x/y are physical virtual-screen origins; width/height are logical.
    // Physical span is width*scale_factor. Capture buffer is physical pixels.
    let screen = screens
        .into_iter()
        .find(|s| {
            let d = s.display_info;
            let scale = d.scale_factor.max(0.1) as f64;
            let phys_w = (d.width as f64 * scale).round() as i32;
            let phys_h = (d.height as f64 * scale).round() as i32;
            x >= d.x && y >= d.y && x < d.x + phys_w && y < d.y + phys_h
        })
        .ok_or_else(|| "Selection is outside any screen".to_string())?;

    let full = screen.capture().map_err(|e| e.to_string())?;
    let di = screen.display_info;
    let scale = di.scale_factor.max(0.1) as f64;
    let phys_w = (di.width as f64 * scale).max(1.0);
    let phys_h = (di.height as f64 * scale).max(1.0);

    let map_x = full.width() as f64 / phys_w;
    let map_y = full.height() as f64 / phys_h;

    let mut px = ((x as f64 - di.x as f64) * map_x).round() as i64;
    let mut py = ((y as f64 - di.y as f64) * map_y).round() as i64;
    let mut pw = (width as f64 * map_x).round() as i64;
    let mut ph = (height as f64 * map_y).round() as i64;

    if px < 0 {
        pw += px;
        px = 0;
    }
    if py < 0 {
        ph += py;
        py = 0;
    }

    let max_w = full.width() as i64;
    let max_h = full.height() as i64;
    if px >= max_w || py >= max_h {
        return Err("Selection is outside the screen".to_string());
    }

    pw = pw.min(max_w - px).max(0);
    ph = ph.min(max_h - py).max(0);
    if pw < 2 || ph < 2 {
        return Err("Selection too small or outside the screen".to_string());
    }

    Ok(image::imageops::crop_imm(&full, px as u32, py as u32, pw as u32, ph as u32).to_image())
}

async fn with_main_window_hidden<F, T>(app: &AppHandle, f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String>,
{
    let window = app.get_webview_window("main");
    if let Some(ref w) = window {
        let _ = w.hide();
    }
    // Give Windows time to composite / activate the next window
    tokio::time::sleep(std::time::Duration::from_millis(280)).await;
    let result = f();
    if let Some(ref w) = window {
        let _ = w.show();
        let _ = w.set_focus();
    }
    result
}


#[derive(Debug, Clone, Serialize)]
struct HistoryItem {
    id: String,
    path: String,
    filename: String,
    capture_type: String,
    timestamp: String,
    size_bytes: u64,
}

// Command: Get available monitors
#[tauri::command]
fn get_monitors() -> Result<Vec<MonitorInfo>, String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;
    
    let monitors: Vec<MonitorInfo> = screens
        .iter()
        .enumerate()
        .map(|(idx, screen)| {
            let display = screen.display_info;
            MonitorInfo {
                id: idx as u32,
                name: format!("Display {}", idx + 1),
                width: display.width,
                height: display.height,
                is_primary: display.x == 0 && display.y == 0,
            }
        })
        .collect();
    
    Ok(monitors)
}

// Command: Capture full screen
#[tauri::command]
async fn capture_fullscreen(
    app: AppHandle,
    state: State<'_, AppState>,
    monitor_id: Option<u32>,
) -> Result<CaptureResult, String> {
    let settings = state.settings.lock().unwrap().clone();

    with_main_window_hidden(&app, move || {
        let screens = Screen::all().map_err(|e| e.to_string())?;
        if screens.is_empty() {
            return Err("No screens found".to_string());
        }

        // None / omitted => display at virtual origin (usually the primary).
        let screen = match monitor_id {
            Some(id) => screens
                .get(id as usize)
                .ok_or_else(|| "Monitor not found".to_string())?,
            None => screens
                .iter()
                .find(|s| s.display_info.x == 0 && s.display_info.y == 0)
                .or_else(|| screens.first())
                .ok_or_else(|| "No screens found".to_string())?,
        };

        let image = screen.capture().map_err(|e| e.to_string())?;
        save_capture(&image, &settings, "screenshot_fullscreen")
    })
    .await
}

// Command: Capture selected region (x/y are screen coordinates)
#[tauri::command]
async fn capture_region(
    app: AppHandle,
    state: State<'_, AppState>,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<CaptureResult, String> {
    let settings = state.settings.lock().unwrap().clone();

    with_main_window_hidden(&app, move || {
        let image = capture_screen_rect(x, y, width, height)?;
        save_capture(&image, &settings, "screenshot_region")
    })
    .await
}

// Command: Capture the window that becomes foreground after we hide ourselves
#[tauri::command]
async fn capture_window(app: AppHandle, state: State<'_, AppState>) -> Result<CaptureResult, String> {
    let settings = state.settings.lock().unwrap().clone();
    let window = app.get_webview_window("main");

    // Remember our HWND so we do not capture ourselves if focus does not move.
    // Tauri returns *mut c_void; windows::HWND.0 is isize — compare via usize.
    let our_hwnd_value: Option<usize> = window.as_ref().and_then(|w| {
        w.hwnd().ok().map(|h| h.0 as usize)
    });

    if let Some(ref w) = window {
        let _ = w.hide();
    }
    tokio::time::sleep(std::time::Duration::from_millis(350)).await;

    let result = (|| {
        #[cfg(target_os = "windows")]
        {
            use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowRect};

            unsafe {
                let hwnd = GetForegroundWindow();
                if hwnd.0 == 0 {
                    return Err("No active window found".to_string());
                }
                if our_hwnd_value == Some(hwnd.0 as usize) {
                    return Err(
                        "Still focused on ScreenCap. Focus another window, then try Active Window again — or use Select Region."
                            .to_string(),
                    );
                }

                let mut rect = windows::Win32::Foundation::RECT::default();
                GetWindowRect(hwnd, &mut rect).map_err(|e| e.to_string())?;

                let width = (rect.right - rect.left).max(0) as u32;
                let height = (rect.bottom - rect.top).max(0) as u32;
                if width < 2 || height < 2 {
                    return Err("Invalid window dimensions".to_string());
                }

                let image = capture_screen_rect(rect.left, rect.top, width, height)?;
                save_capture(&image, &settings, "screenshot_window")
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = settings;
            Err("Window capture only supported on Windows".to_string())
        }
    })();

    if let Some(ref w) = window {
        let _ = w.show();
        let _ = w.set_focus();
    }
    result
}

// Command: Start recording
#[tauri::command]
async fn start_recording(
    state: State<'_, AppState>,
    monitor_id: Option<u32>,
    include_audio: bool,
) -> Result<String, String> {
    let mut is_recording = state.is_recording.lock().unwrap();
    if *is_recording {
        return Err("Already recording".to_string());
    }
    
    #[cfg(all(target_os = "windows", feature = "scap"))]
    {
        let settings = state.settings.lock().unwrap().clone();
        let save_dir = PathBuf::from(&settings.save_directory);
        std::fs::create_dir_all(&save_dir).map_err(|e| e.to_string())?;
        
        let timestamp = Local::now().format("%Y%m%d_%H%M%S");
        let filename = format!("recording_{}.mp4", timestamp);
        let output_path = save_dir.join(&filename);
        
        let targets = scap::get_all_targets();
        let target = targets
            .into_iter()
            .find(|t| t.is_default)
            .ok_or("No default display found")?;
        
        let options = Options {
            fps: 30,
            target: Some(target),
            show_cursor: true,
            show_highlight: true,
            excluded_targets: None,
            output_type: scap::frame::FrameType::BGRAFrame,
            output_resolution: scap::capturer::Resolution::_1080p,
            source_rect: None,
            crop_area: None,
        };
        
        let capturer = Capturer::new(options);
        
        let recording_state = RecordingState {
            capturer,
            output_path: output_path.clone(),
            start_time: std::time::Instant::now(),
        };
        
        *state.recording_capturer.lock().unwrap() = Some(recording_state);
        *is_recording = true;
        
        Ok(output_path.to_string_lossy().to_string())
    }
    
    #[cfg(not(all(target_os = "windows", feature = "scap")))]
    {
        Err("Recording feature not available. Requires Windows with scap feature enabled.".to_string())
    }
}

// Command: Stop recording
#[tauri::command]
async fn stop_recording(state: State<'_, AppState>) -> Result<CaptureResult, String> {
    let mut is_recording = state.is_recording.lock().unwrap();
    if !*is_recording {
        return Err("Not currently recording".to_string());
    }
    
    let mut capturer_guard = state.recording_capturer.lock().unwrap();
    let recording_state = capturer_guard.take().ok_or("No recording state")?;
    
    *is_recording = false;
    
    Ok(CaptureResult {
        success: true,
        path: Some(recording_state.output_path.to_string_lossy().to_string()),
        error: None,
    })
}

// Command: Get recording status
#[tauri::command]
fn is_recording(state: State<'_, AppState>) -> bool {
    *state.is_recording.lock().unwrap()
}

// Command: Get settings
#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> AppSettings {
    state.settings.lock().unwrap().clone()
}

// Command: Update settings
#[tauri::command]
fn update_settings(state: State<'_, AppState>, settings: AppSettings) -> Result<(), String> {
    *state.settings.lock().unwrap() = settings.clone();
    
    // Persist settings to file
    let config_dir = dirs::config_dir()
        .ok_or("Could not find config directory")?
        .join("screencap");
    
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let settings_path = config_dir.join("settings.json");
    
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(settings_path, json).map_err(|e| e.to_string())?;
    
    Ok(())
}

// Command: Get capture history
#[tauri::command]
fn get_history(state: State<'_, AppState>) -> Result<Vec<HistoryItem>, String> {
    let settings = state.settings.lock().unwrap();
    let save_dir = PathBuf::from(&settings.save_directory);
    
    if !save_dir.exists() {
        return Ok(Vec::new());
    }
    
    let mut items = Vec::new();
    
    if let Ok(entries) = std::fs::read_dir(&save_dir) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_file() {
                    let path = entry.path();
                    if let Some(ext) = path.extension() {
                        if ext == "png" || ext == "mp4" {
                            let filename = path
                                .file_name()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_string();
                            
                            let capture_type = if filename.contains("fullscreen") {
                                "fullscreen"
                            } else if filename.contains("region") {
                                "region"
                            } else if filename.contains("window") {
                                "window"
                            } else if filename.contains("recording") {
                                "recording"
                            } else {
                                "unknown"
                            };
                            
                            let timestamp = metadata
                                .modified()
                                .ok()
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|d| {
                                    chrono::DateTime::from_timestamp(d.as_secs() as i64, 0)
                                        .unwrap()
                                        .format("%Y-%m-%d %H:%M:%S")
                                        .to_string()
                                })
                                .unwrap_or_default();
                            
                            items.push(HistoryItem {
                                id: filename.clone(),
                                path: path.to_string_lossy().to_string(),
                                filename,
                                capture_type: capture_type.to_string(),
                                timestamp,
                                size_bytes: metadata.len(),
                            });
                        }
                    }
                }
            }
        }
    }
    
    items.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    items.truncate(50);
    
    Ok(items)
}

// Command: Open file in system file explorer
#[tauri::command]
fn reveal_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(std::path::Path::new(&path).parent().unwrap_or(std::path::Path::new(".")))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

// Command: Save annotated image
#[tauri::command]
fn save_annotated_image(
    state: State<'_, AppState>,
    data_url: String,
    original_path: String,
) -> Result<CaptureResult, String> {
    let settings = state.settings.lock().unwrap().clone();
    
    // Remove the data URL prefix
    let data = data_url
        .strip_prefix("data:image/png;base64,")
        .ok_or("Invalid data URL format")?;
    
    // Decode base64
    let image_data = base64_decode(data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;
    
    // Parse the original path to get filename info
    let original_path_buf = PathBuf::from(&original_path);
    let original_filename = original_path_buf
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("Invalid original filename")?;
    
    // Create new filename with "_annotated" suffix
    let save_dir = PathBuf::from(&settings.save_directory);
    std::fs::create_dir_all(&save_dir).map_err(|e| e.to_string())?;
    
    let ext = original_path_buf
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("png");
    
    let filename = format!("{}_annotated.{}", original_filename, ext);
    let filepath = save_dir.join(&filename);
    
    // Write the image data
    std::fs::write(&filepath, image_data)
        .map_err(|e| format!("Failed to write image: {}", e))?;
    
    Ok(CaptureResult {
        success: true,
        path: Some(filepath.to_string_lossy().to_string()),
        error: None,
    })
}

// Simple base64 decoder
fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    const BASE64_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    
    let mut result = Vec::new();
    let mut buffer = 0u32;
    let mut bits_in_buffer = 0u8;
    
    for byte in input.bytes() {
        if byte == b'=' {
            break;
        }
        
        let value = BASE64_CHARS
            .iter()
            .position(|&c| c == byte)
            .ok_or("Invalid base64 character")? as u32;
        
        buffer = (buffer << 6) | value;
        bits_in_buffer += 6;
        
        if bits_in_buffer >= 8 {
            bits_in_buffer -= 8;
            result.push((buffer >> bits_in_buffer) as u8);
            buffer &= (1 << bits_in_buffer) - 1;
        }
    }
    
    Ok(result)
}

// Load settings from disk
fn load_settings() -> AppSettings {
    let config_dir = match dirs::config_dir() {
        Some(dir) => dir.join("screencap"),
        None => return AppSettings::default(),
    };
    
    let settings_path = config_dir.join("settings.json");
    
    if !settings_path.exists() {
        return AppSettings::default();
    }
    
    match std::fs::read_to_string(&settings_path) {
        Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
        Err(_) => AppSettings::default(),
    }
}

fn main() {
    let settings = Arc::new(Mutex::new(load_settings()));
    
    tauri::Builder::default()
        .setup(move |app| {
            let app_state = AppState {
                settings: settings.clone(),
                is_recording: Arc::new(Mutex::new(false)),
                recording_capturer: Arc::new(Mutex::new(None)),
            };
            
            app.manage(app_state);
            
            // Set up system tray
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_item = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let capture_item = MenuItem::with_id(app, "capture", "Capture Screen", true, None::<&str>)?;
            let folder_item = MenuItem::with_id(app, "folder", "Open Save Folder", true, None::<&str>)?;
            
            let menu = Menu::with_items(
                app,
                &[&show_item, &capture_item, &folder_item, &quit_item],
            )?;
            
            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .title("ScreenCap")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "capture" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("tray-capture", ());
                        }
                    }
                    "folder" => {
                        let app_handle = app.app_handle();
                        if let Some(state) = app_handle.try_state::<AppState>() {
                            let settings = state.settings.lock().unwrap();
                            let _ = reveal_in_explorer(settings.save_directory.clone());
                        }
                    }
                    _ => {}
                })
                .build(app)?;
            
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_monitors,
            capture_fullscreen,
            capture_region,
            capture_window,
            start_recording,
            stop_recording,
            is_recording,
            get_settings,
            update_settings,
            get_history,
            reveal_in_explorer,
            save_annotated_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
