export interface MonitorInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  is_primary: boolean;
}

export interface CaptureResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface AppSettings {
  save_directory: string;
  screenshot_format: string;
  video_quality: string;
  capture_microphone: boolean;
  capture_system_audio: boolean;
  open_editor_after_screenshot: boolean;
  hotkey_fullscreen: string;
  hotkey_region: string;
  hotkey_window: string;
  hotkey_start_recording: string;
}

export interface HistoryItem {
  id: string;
  path: string;
  filename: string;
  capture_type: string;
  timestamp: string;
  size_bytes: number;
}

export type CaptureMode = 'fullscreen' | 'region' | 'window' | 'recording';
