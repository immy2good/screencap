# ScreenCap

A robust, modern screenshot and screen-recording desktop application built with Tauri 2, React, and TypeScript for Windows 11. Cross-platform friendly architecture for future expansion.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

### Screenshots
- **Full Screen Capture** - Capture your entire monitor
- **Region Select** - Interactively select any area of your screen
- **Active Window Capture** - Capture the currently focused window (partial implementation)

### Screen Recording
- **MP4 Recording** - Record your screen to high-quality MP4 files
- **Audio Support** - Optional microphone and system audio capture (Windows limitations apply)
- **Flexible Controls** - Start/stop recording from UI, system tray, or hotkeys

### User Experience
- **System Tray Integration** - Quick access to capture modes without opening the main window
- **Global Hotkeys** - Customizable keyboard shortcuts (framework in place for future activation)
- **Capture History** - Browse recent captures with quick file reveal
- **Persistent Settings** - All preferences saved across sessions
- **Dark UI** - Modern, clean interface optimized for dark mode and keyboard navigation

### File Management
- **Configurable Save Location** - Choose where captures are stored
- **Smart Naming** - Automatic timestamped filenames
- **Format Options** - PNG for screenshots, MP4 for recordings
- **Quality Settings** - Adjustable video quality (1080p, 720p, 480p)

## Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Rust (Tauri 2)
- **UI Components**: Lucide React icons
- **Screen Capture**: 
  - `screenshots` crate for cross-platform screenshots
  - `scap` crate for Windows screen recording
  - Windows GDI/Graphics Capture API for advanced features
- **Hotkeys**: `global-hotkey` crate (ready for activation)
- **System Tray**: Tauri 2 native tray support

## Prerequisites

### Windows 11 Requirements

> **Important**: This project requires **Rust 1.85+ or nightly** due to dependencies on Tauri 2 and modern crates that use Rust edition 2024 features. The stable Rust 1.83 will not work.

1. **Rust** (1.85+ or nightly)
   ```powershell
   # Install rustup
   winget install Rustlang.Rustup
   
   # Then switch to nightly or wait for Rust 1.85+ stable
   rustup default nightly
   
   # Or download from https://rustup.rs/
   ```

2. **Node.js** (v18 or later)
   ```powershell
   winget install OpenJS.NodeJS
   # Or download from https://nodejs.org/
   ```

3. **WebView2** (usually pre-installed on Windows 11)
   - If needed: https://developer.microsoft.com/en-us/microsoft-edge/webview2/

4. **Visual Studio Build Tools** (for Rust compilation)
   ```powershell
   # Option 1: Install Visual Studio Community
   winget install Microsoft.VisualStudio.2022.Community
   # During installation, select "Desktop development with C++"
   
   # Option 2: Just the build tools
   winget install Microsoft.VisualStudio.2022.BuildTools
   ```

5. **LLVM/Clang** (optional but recommended)
   ```powershell
   winget install LLVM.LLVM
   ```

### Permissions

The app requires screen capture permissions. Windows 11 will prompt when first run.

## Installation & Setup

### 1. Clone or Download

If you received this as a project:
```bash
cd /path/to/screencap
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Rust dependencies will be fetched during first build
```

### 3. Development Mode

Run the app in development mode with hot-reloading:

```bash
npm run tauri dev
```

This will:
- Start the Vite dev server (port 1421)
- Compile the Rust backend
- Launch the Tauri application window

**First build will take 5-10 minutes** as Cargo downloads and compiles all dependencies.

### 4. Production Build

Create an optimized production build:

```bash
npm run tauri build
```

The installer will be created in `src-tauri/target/release/bundle/`:
- `.msi` installer for Windows
- `.exe` standalone executable

## Usage

### Quick Start

1. **Launch the app** - Opens to the Capture view
2. **Take a screenshot**:
   - Click "Full Screen" for entire monitor
   - Click "Select Region" to drag a selection box
   - Click "Active Window" to capture current window (use region select for better results)
3. **Record your screen**:
   - Click "Start Recording"
   - Perform your actions
   - Click "Stop Recording" or use the system tray
4. **View captures** - Switch to "History" tab to see recent files
5. **Configure** - Go to "Settings" to customize save location, quality, and audio options

### System Tray

The app runs in the system tray. Right-click the tray icon for:
- Show Window
- Capture Screen (quick fullscreen)
- Open Save Folder
- Quit

### Keyboard Shortcuts

Default hotkeys (customizable in Settings, activation pending):
- `Ctrl+Shift+1` - Full screen capture
- `Ctrl+Shift+2` - Region select
- `Ctrl+Shift+3` - Active window capture
- `Ctrl+Shift+R` - Start/stop recording

**Note**: Global hotkey registration requires additional Windows permissions and is planned for a future update.

### Default Save Location

- **Windows**: `%USERPROFILE%\Pictures\ScreenCap\`

Change this in Settings → Save Directory.

## Project Structure

```
screencap/
├── src/                    # React frontend
│   ├── App.tsx            # Main application component
│   ├── App.css            # Styles
│   ├── types.ts           # TypeScript type definitions
│   └── main.tsx           # Entry point
├── src-tauri/             # Rust backend
│   ├── src/
│   │   └── main.rs        # Tauri app, capture logic, tray, commands
│   ├── Cargo.toml         # Rust dependencies
│   ├── tauri.conf.json    # Tauri configuration
│   └── build.rs           # Build script
├── index.html             # HTML shell
├── vite.config.ts         # Vite bundler config
├── package.json           # Node.js dependencies
└── README.md              # This file
```

## Known Limitations & Future Work

### Current Limitations

1. **Active Window Capture** - The Windows GDI implementation is simplified. Use "Select Region" for precise window captures.

2. **System Audio** - Windows WASAPI/loopback audio capture has API restrictions. Microphone input works; system audio capture is experimental.

3. **Global Hotkeys** - The `global-hotkey` crate is integrated but not activated. Requires additional Windows permissions handling.

4. **Linux/macOS** - The codebase is structured for cross-platform, but Windows capture libraries (`scap`, Windows API) need platform-specific alternatives:
   - Linux: Consider `scap` fallback or PipeWire API
   - macOS: Consider `AVFoundation` or `screencapturekit`

### Planned Features

- [ ] GIF export for short clips
- [ ] Basic annotation tools (arrows, text, shapes)
- [ ] Cloud upload integration (Imgur, S3, etc.)
- [ ] Countdown timer for screenshots
- [ ] Multi-monitor selection for recording
- [ ] Full global hotkey activation
- [ ] Pause/resume during recording
- [ ] Video compression options

## Troubleshooting

### Build Errors

**Problem**: `error: failed to compile` or missing libraries

**Solution**: Ensure Visual Studio Build Tools with C++ desktop development are installed.

---

**Problem**: `WebView2 not found`

**Solution**: Download from https://developer.microsoft.com/microsoft-edge/webview2/

---

**Problem**: Slow first build

**Solution**: Normal. Rust compiles everything from source. Subsequent builds are fast (<30 seconds).

### Runtime Issues

**Problem**: Screen capture permission denied

**Solution**: Windows Security → Privacy → Screen recording → Enable for ScreenCap.

---

**Problem**: No recordings appear after stopping

**Solution**: Check the save directory in Settings. Recording requires write permissions.

---

**Problem**: System audio not captured

**Solution**: Windows restricts loopback audio. Microphone capture is more reliable. This is a Windows API limitation.

### Performance

- **High CPU during recording**: Expected for real-time encoding. Lower quality in Settings if needed.
- **Large file sizes**: MP4 H.264 encoding is reasonably efficient. Adjust quality/resolution in Settings.

## Development

### Adding New Capture Modes

1. Add Rust command in `src-tauri/src/main.rs`:
   ```rust
   #[tauri::command]
   fn my_capture_mode() -> Result<CaptureResult, String> {
       // Implementation
   }
   ```

2. Register in `invoke_handler!`:
   ```rust
   .invoke_handler(tauri::generate_handler![
       // ... existing commands,
       my_capture_mode,
   ])
   ```

3. Call from React:
   ```typescript
   import { invoke } from '@tauri-apps/api/core';
   const result = await invoke<CaptureResult>('my_capture_mode');
   ```

### Testing on Windows 11

**Manual smoke tests**:
- [ ] Full screen capture saves PNG
- [ ] Region select works (drag to select)
- [ ] Recording starts/stops, saves MP4
- [ ] System tray icon shows menu
- [ ] Settings persist after restart
- [ ] History displays recent files
- [ ] "Show in folder" reveals file

Run through this checklist after major changes.

## Dependencies

### Frontend
- React 18.3
- TypeScript 5.6
- Vite 5.4
- Lucide React (icons)
- Tauri API 2.1

### Backend (Rust)
- Tauri 2.1
- `screenshots` - Cross-platform screen capture
- `scap` - Windows screen recording (Graphics Capture API wrapper)
- `image` - Image processing
- `chrono` - Timestamps
- `serde` / `serde_json` - Settings serialization
- `global-hotkey` - Hotkey registration
- `dirs` - Platform directories

## Contributing

This is a greenfield MVP. Areas for contribution:
- Improve window capture (extract bitmap from HBITMAP)
- Activate global hotkeys with proper permission handling
- Add GIF export
- Annotation UI
- Linux/macOS capture implementations
- Better video compression

## License

MIT License - see LICENSE file for details.

## Credits

Built with:
- [Tauri](https://tauri.app/) - Rust + web frontend framework
- [React](https://react.dev/) - UI library
- [Lucide](https://lucide.dev/) - Icon set
- [screenshots](https://crates.io/crates/screenshots) - Cross-platform capture
- [scap](https://crates.io/crates/scap) - Windows recording

---

**Need help?** Check the Troubleshooting section or open an issue.

**Windows 11 Home Edition**: Tested and supported.
