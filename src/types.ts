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

export type AnnotationType = 'arrow' | 'text' | 'rectangle' | 'number';

export interface BaseAnnotation {
  id: string;
  type: AnnotationType;
  color: string;
}

export interface ArrowAnnotation extends BaseAnnotation {
  type: 'arrow';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  strokeWidth: number;
}

export interface TextAnnotation extends BaseAnnotation {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export interface RectangleAnnotation extends BaseAnnotation {
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
  strokeWidth: number;
  filled: boolean;
}

export interface NumberAnnotation extends BaseAnnotation {
  type: 'number';
  x: number;
  y: number;
  number: number;
}

export type Annotation = ArrowAnnotation | TextAnnotation | RectangleAnnotation | NumberAnnotation;

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}
