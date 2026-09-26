import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  Monitor,
  Camera,
  Video,
  Settings as SettingsIcon,
  History as HistoryIcon,
  Circle,
  Square,
  StopCircle,
} from 'lucide-react';
import './App.css';
import type { AppSettings, CaptureResult, HistoryItem } from './types';
import { AnnotationEditor } from './AnnotationEditor';

type View = 'capture' | 'history' | 'settings' | 'editor';

function App() {
  const [view, setView] = useState<View>('capture');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);
  const [isRegionSelecting, setIsRegionSelecting] = useState(false);
  const [editorImagePath, setEditorImagePath] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    checkRecordingStatus();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await invoke<AppSettings>('get_settings');
      setSettings(data);
    } catch (error) {
      showNotification('Failed to load settings', 'error');
    }
  };

  const checkRecordingStatus = async () => {
    try {
      const recording = await invoke<boolean>('is_recording');
      setIsRecording(recording);
    } catch (error) {
      console.error('Failed to check recording status:', error);
    }
  };

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleCaptureFullscreen = async () => {
    try {
      const result = await invoke<CaptureResult>('capture_fullscreen', {
        monitorId: null,
      });
      if (result.success && result.path) {
        setEditorImagePath(result.path);
        setView('editor');
      } else {
        showNotification(result.error || 'Capture failed', 'error');
      }
    } catch (error) {
      showNotification(`Error: ${error}`, 'error');
    }
  };

  const handleCaptureRegion = async () => {
    try {
      const win = getCurrentWindow();
      await win.setFullscreen(true);
      setIsRegionSelecting(true);
    } catch (error) {
      showNotification(`Failed to start region select: ${error}`, 'error');
    }
  };

  const exitRegionSelectUi = async () => {
    setIsRegionSelecting(false);
    try {
      const win = getCurrentWindow();
      await win.setFullscreen(false);
      await win.show();
      await win.setFocus();
    } catch (error) {
      console.error('Failed to restore window after region select:', error);
    }
  };

  const handleCaptureWindow = async () => {
    try {
      const result = await invoke<CaptureResult>('capture_window');
      if (result.success && result.path) {
        setEditorImagePath(result.path);
        setView('editor');
      } else {
        showNotification(
          result.error || 'Window capture failed. Try Select Region instead.',
          'error'
        );
      }
    } catch (error) {
      showNotification(`Error: ${error}`, 'error');
    }
  };

  const handleStartRecording = async () => {
    try {
      void await invoke<string>('start_recording', {
        monitorId: 0,
        includeAudio: settings?.capture_system_audio || false,
      });
      setIsRecording(true);
      showNotification('Recording started!', 'success');
    } catch (error) {
      showNotification(`Failed to start recording: ${error}`, 'error');
    }
  };

  const handleStopRecording = async () => {
    try {
      const result = await invoke<CaptureResult>('stop_recording');
      setIsRecording(false);
      if (result.success) {
        showNotification('Recording saved!', 'success');
      } else {
        showNotification(result.error || 'Failed to stop recording', 'error');
      }
    } catch (error) {
      showNotification(`Error stopping recording: ${error}`, 'error');
    }
  };

  return (
    <div className="app">
      {view !== 'editor' && (
        <header className="app-header">
          <h1>ScreenCap</h1>
          <nav className="app-nav">
            <button
              className={`nav-button ${view === 'capture' ? 'active' : ''}`}
              onClick={() => setView('capture')}
            >
              <Camera size={16} /> Capture
            </button>
            <button
              className={`nav-button ${view === 'history' ? 'active' : ''}`}
              onClick={() => setView('history')}
            >
              <HistoryIcon size={16} /> History
            </button>
            <button
              className={`nav-button ${view === 'settings' ? 'active' : ''}`}
              onClick={() => setView('settings')}
            >
              <SettingsIcon size={16} /> Settings
            </button>
          </nav>
        </header>
      )}

      <main className="app-content" style={view === 'editor' ? { padding: 0 } : {}}>
        {view === 'capture' && (
          <CaptureView
            isRecording={isRecording}
            onCaptureFullscreen={handleCaptureFullscreen}
            onCaptureRegion={handleCaptureRegion}
            onCaptureWindow={handleCaptureWindow}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
          />
        )}
        {view === 'history' && (
          <HistoryView
            onNotification={showNotification}
            onOpenInEditor={(path) => {
              setEditorImagePath(path);
              setView('editor');
            }}
          />
        )}
        {view === 'settings' && (
          <SettingsView
            settings={settings}
            onSettingsUpdate={loadSettings}
            onNotification={showNotification}
          />
        )}
        {view === 'editor' && editorImagePath && (
          <AnnotationEditor
            imagePath={editorImagePath}
            onSave={(newPath) => {
              showNotification(`Saved: ${newPath}`, 'success');
              setView('capture');
              setEditorImagePath(null);
            }}
            onCancel={() => {
              setView('capture');
              setEditorImagePath(null);
            }}
          />
        )}
      </main>

      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      {isRegionSelecting && (
        <RegionSelector
          onSelect={async (x, y, width, height) => {
            try {
              await exitRegionSelectUi();
              // Brief pause so fullscreen exit + hide can settle before capture
              await new Promise((r) => setTimeout(r, 120));
              const result = await invoke<CaptureResult>('capture_region', {
                x,
                y,
                width,
                height,
              });
              if (result.success && result.path) {
                setEditorImagePath(result.path);
                setView('editor');
              } else {
                showNotification(result.error || 'Capture failed', 'error');
              }
            } catch (error) {
              await exitRegionSelectUi();
              showNotification(`Error: ${error}`, 'error');
            }
          }}
          onCancel={() => {
            void exitRegionSelectUi();
          }}
        />
      )}
    </div>
  );
}

interface CaptureViewProps {
  isRecording: boolean;
  onCaptureFullscreen: () => void;
  onCaptureRegion: () => void;
  onCaptureWindow: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

function CaptureView({
  isRecording,
  onCaptureFullscreen,
  onCaptureRegion,
  onCaptureWindow,
  onStartRecording,
  onStopRecording,
}: CaptureViewProps) {
  return (
    <div className="capture-section">
      <h2 className="section-title">Screenshot</h2>
      <div className="capture-grid">
        <div className="capture-card" onClick={onCaptureFullscreen}>
          <Monitor className="capture-card-icon" />
          <div className="capture-card-title">Full Screen</div>
          <div className="capture-card-description">
            Capture your entire screen
          </div>
        </div>

        <div className="capture-card" onClick={onCaptureRegion}>
          <Square className="capture-card-icon" />
          <div className="capture-card-title">Select Region</div>
          <div className="capture-card-description">
            Choose a specific area to capture
          </div>
        </div>

        <div className="capture-card" onClick={onCaptureWindow}>
          <Camera className="capture-card-icon" />
          <div className="capture-card-title">Active Window</div>
          <div className="capture-card-description">
            Capture the current window
          </div>
        </div>
      </div>

      <h2 className="section-title">Screen Recording</h2>
      <div className="recording-controls">
        {isRecording ? (
          <>
            <div className="recording-status">
              <div className="recording-indicator" />
              <span>Recording in progress...</span>
            </div>
            <div className="recording-buttons">
              <button
                className="button button-danger"
                onClick={onStopRecording}
              >
                <StopCircle size={18} />
                Stop Recording
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                Record your screen to an MP4 file
              </p>
            </div>
            <div className="recording-buttons">
              <button
                className="button button-primary"
                onClick={onStartRecording}
              >
                <Circle size={18} />
                Start Recording
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface HistoryViewProps {
  onNotification: (message: string, type: 'success' | 'error') => void;
  onOpenInEditor?: (path: string) => void;
}

function HistoryView({ onNotification, onOpenInEditor }: HistoryViewProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const items = await invoke<HistoryItem[]>('get_history');
      setHistory(items);
    } catch (error) {
      onNotification(`Failed to load history: ${error}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReveal = async (path: string) => {
    try {
      await invoke('reveal_in_explorer', { path });
    } catch (error) {
      onNotification(`Failed to reveal file: ${error}`, 'error');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return <div>Loading history...</div>;
  }

  if (history.length === 0) {
    return (
      <div className="empty-state">
        <HistoryIcon className="empty-state-icon" />
        <h3>No captures yet</h3>
        <p>Your screenshots and recordings will appear here</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="section-title">Recent Captures</h2>
      <div className="history-list">
        {history.map((item) => (
          <div key={item.id} className="history-item">
            {item.capture_type === 'recording' ? (
              <Video className="history-item-icon" />
            ) : (
              <Camera className="history-item-icon" />
            )}
            <div className="history-item-info">
              <div className="history-item-title">{item.filename}</div>
              <div className="history-item-meta">
                <span>{item.timestamp}</span>
                <span>{formatSize(item.size_bytes)}</span>
                <span>{item.capture_type}</span>
              </div>
            </div>
            <div className="history-item-actions">
              {item.capture_type !== 'recording' && onOpenInEditor && (
                <button
                  className="icon-button"
                  onClick={() => onOpenInEditor(item.path)}
                  title="Annotate"
                >
                  ✏️
                </button>
              )}
              <button
                className="icon-button"
                onClick={() => handleReveal(item.path)}
                title="Show in folder"
              >
                📁
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface SettingsViewProps {
  settings: AppSettings | null;
  onSettingsUpdate: () => void;
  onNotification: (message: string, type: 'success' | 'error') => void;
}

function SettingsView({
  settings,
  onSettingsUpdate,
  onNotification,
}: SettingsViewProps) {
  const [localSettings, setLocalSettings] = useState<AppSettings | null>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = async () => {
    if (!localSettings) return;

    try {
      await invoke('update_settings', { settings: localSettings });
      onSettingsUpdate();
      onNotification('Settings saved successfully!', 'success');
    } catch (error) {
      onNotification(`Failed to save settings: ${error}`, 'error');
    }
  };

  const handleBrowseFolder = async () => {
    try {
      // Note: File dialog requires @tauri-apps/plugin-dialog which needs to be properly configured
      // For now, users can manually enter the path
      const newPath = prompt('Enter save directory path:', localSettings?.save_directory);
      if (newPath && localSettings) {
        setLocalSettings({ ...localSettings, save_directory: newPath });
      }
    } catch (error) {
      onNotification(`Failed to select folder: ${error}`, 'error');
    }
  };

  if (!localSettings) {
    return <div>Loading settings...</div>;
  }

  return (
    <div>
      <h2 className="section-title">Settings</h2>
      <div className="settings-form">
        <div className="form-group">
          <label className="form-label">Save Directory</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              className="form-input"
              value={localSettings.save_directory}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  save_directory: e.target.value,
                })
              }
              style={{ flex: 1 }}
            />
            <button
              className="button button-secondary"
              onClick={handleBrowseFolder}
            >
              Browse
            </button>
          </div>
          <span className="form-help">
            Where screenshots and recordings will be saved
          </span>
        </div>

        <div className="form-group">
          <label className="form-label">Screenshot Format</label>
          <select
            className="form-select"
            value={localSettings.screenshot_format}
            onChange={(e) =>
              setLocalSettings({
                ...localSettings,
                screenshot_format: e.target.value,
              })
            }
          >
            <option value="png">PNG</option>
            <option value="jpg">JPEG</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Video Quality</label>
          <select
            className="form-select"
            value={localSettings.video_quality}
            onChange={(e) =>
              setLocalSettings({
                ...localSettings,
                video_quality: e.target.value,
              })
            }
          >
            <option value="high">High (1080p)</option>
            <option value="medium">Medium (720p)</option>
            <option value="low">Low (480p)</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-checkbox-wrapper">
            <input
              type="checkbox"
              className="form-checkbox"
              checked={localSettings.capture_microphone}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  capture_microphone: e.target.checked,
                })
              }
            />
            <span className="form-label">Capture Microphone</span>
          </label>
          <span className="form-help">Record audio from your microphone</span>
        </div>

        <div className="form-group">
          <label className="form-checkbox-wrapper">
            <input
              type="checkbox"
              className="form-checkbox"
              checked={localSettings.capture_system_audio}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  capture_system_audio: e.target.checked,
                })
              }
            />
            <span className="form-label">Capture System Audio</span>
          </label>
          <span className="form-help">
            Record audio playing on your computer (Windows limitations may apply)
          </span>
        </div>

        <div className="form-group">
          <label className="form-label">Hotkeys</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Full Screen
              </label>
              <input
                type="text"
                className="form-input"
                value={localSettings.hotkey_fullscreen}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    hotkey_fullscreen: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Select Region
              </label>
              <input
                type="text"
                className="form-input"
                value={localSettings.hotkey_region}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    hotkey_region: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Active Window
              </label>
              <input
                type="text"
                className="form-input"
                value={localSettings.hotkey_window}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    hotkey_window: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Start/Stop Recording
              </label>
              <input
                type="text"
                className="form-input"
                value={localSettings.hotkey_start_recording}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    hotkey_start_recording: e.target.value,
                  })
                }
              />
            </div>
          </div>
          <span className="form-help">
            Note: Global hotkeys will be implemented in a future update
          </span>
        </div>

        <button className="button button-primary" onClick={handleSave}>
          Save Settings
        </button>
      </div>
    </div>
  );
}

interface RegionSelectorProps {
  onSelect: (x: number, y: number, width: number, height: number) => void;
  onCancel: () => void;
}

function RegionSelector({ onSelect, onCancel }: RegionSelectorProps) {
  // screen* = virtual-desktop coords for the Rust capture command
  // client* = overlay-local coords for drawing the selection box
  const [startScreen, setStartScreen] = useState<{ x: number; y: number } | null>(null);
  const [currentScreen, setCurrentScreen] = useState<{ x: number; y: number } | null>(null);
  const [startClient, setStartClient] = useState<{ x: number; y: number } | null>(null);
  const [currentClient, setCurrentClient] = useState<{ x: number; y: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setStartScreen({ x: e.screenX, y: e.screenY });
    setCurrentScreen({ x: e.screenX, y: e.screenY });
    setStartClient({ x: e.clientX, y: e.clientY });
    setCurrentClient({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (startScreen) {
      setCurrentScreen({ x: e.screenX, y: e.screenY });
      setCurrentClient({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = async () => {
    if (startClient && currentClient) {
      const left = Math.min(startClient.x, currentClient.x);
      const top = Math.min(startClient.y, currentClient.y);
      const widthCss = Math.abs(currentClient.x - startClient.x);
      const heightCss = Math.abs(currentClient.y - startClient.y);
      if (widthCss < 2 || heightCss < 2) {
        return;
      }
      try {
        // Convert CSS/client pixels -> physical virtual-desktop pixels
        const win = getCurrentWindow();
        const factor = await win.scaleFactor();
        const pos = await win.outerPosition();
        const x = Math.round(pos.x + left * factor);
        const y = Math.round(pos.y + top * factor);
        const width = Math.round(widthCss * factor);
        const height = Math.round(heightCss * factor);
        onSelect(x, y, width, height);
      } catch (error) {
        console.error(error);
        // Fallback: raw screen coords (may be wrong on scaled displays)
        if (startScreen && currentScreen) {
          const x = Math.min(startScreen.x, currentScreen.x);
          const y = Math.min(startScreen.y, currentScreen.y);
          const width = Math.abs(currentScreen.x - startScreen.x);
          const height = Math.abs(currentScreen.y - startScreen.y);
          onSelect(x, y, width, height);
        }
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const box =
    startClient && currentClient
      ? {
          left: Math.min(startClient.x, currentClient.x),
          top: Math.min(startClient.y, currentClient.y),
          width: Math.abs(currentClient.x - startClient.x),
          height: Math.abs(currentClient.y - startClient.y),
        }
      : null;

  return (
    <div
      className="region-selector-overlay"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={() => { void handleMouseUp(); }}
    >
      {!startScreen && (
        <div className="region-selector-hint">
          Click and drag to select a region (ESC to cancel)
        </div>
      )}
      {box && (
        <div
          className="region-selector-box"
          style={{
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
          }}
        />
      )}
    </div>
  );
}

export default App;
