# DevCPC Tasks for VS Code

![Demo](https://raw.githubusercontent.com/destroyer-dcf/devcpc-vscode-ext/main/doc/extension.gif)

VS Code extension to view and run DevCPC tasks directly from the Explorer pane.

This extension adds a "DevCPC" view to your Explorer panel, allowing you to visualize and execute DevCPC tasks configured in your project with a single click. Perfect for developing games and applications for Amstrad CPC.

## Features

- **Visual Task List**: See all available DevCPC tasks at a glance
- **One-Click Execution**: Run any task directly from the Explorer panel
- **Task Icons**: Visual indicators for different task types (build, clean, run, etc.)
- **Composite Tasks Support**: Execute complex task chains with dependencies
- **Auto-Refresh**: Automatically updates the task list when configuration changes
- **Integrated CPC Emulator**: Built-in Amstrad CPC emulator powered by KC IDE
- **Multi-Format Support**: Load `.bin`, `.sna`, `.dsk`, and `.cdt` (auto-load flow)
- **Auto-Load After Build**: Automatically loads your program after successful compilation
- **Configuration Management**: Visual editor for devcpc.conf with toggle buttons

## Requirements

- [DevCPC](https://github.com/destroyer-dcf/DevCPC) installed on your system
- VS Code 1.60.0 or higher

## Installation

1. Install the extension from the VS Code Marketplace
2. Open a project with a `.vscode/taskcpc.json` file
3. The DevCPC panel will appear in the Explorer sidebar

## Configuration

Create a `.vscode/taskcpc.json` file in your project root with your DevCPC tasks:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "DevCPC: Build",
      "type": "shell",
      "command": "$HOME/.DevCPC/bin/devcpc",
      "args": ["build"],
      "presentation": {
        "reveal": "always",
        "panel": "shared",
        "focus": false,
        "clear": true
      },
      "problemMatcher": []
    },
    {
      "label": "DevCPC: Run",
      "type": "shell",
      "command": "$HOME/.DevCPC/bin/devcpc",
      "args": ["run"],
      "problemMatcher": []
    }
  ]
}
```

### Composite Tasks

You can create tasks that depend on other tasks:

```json
{
  "label": "DevCPC: Clean & Build",
  "dependsOn": ["DevCPC: Clean", "DevCPC: Build"],
  "dependsOrder": "sequence"
}
```

## Usage

### Task Execution

1. Open a project with DevCPC configuration
2. Find the **DevCPC** panel in the Explorer sidebar
3. Click on any task to execute it
4. Use the refresh button (⟳) to reload the task list

### Integrated Emulator

The extension includes a built-in Amstrad CPC emulator (KC CPC):

1. **Open Emulator**: Use command "DevCPC: Open Integrated Emulator"
2. **Auto-Load on Open**: if `devcpc.conf` exists in workspace root and output file exists, it is loaded automatically
3. **Auto-Load After Build**: from `taskcpc.json` build flow, extension can prompt and load generated output
4. **Supported file types**:
   - `.bin`
   - `.sna`
   - `.dsk`
   - `.cdt` (auto-load path)
5. **Controls**:
   - `DevCPC: Reset Emulator`
   - `DevCPC: Focus Emulator`
   - `DevCPC: Close Emulator`
   - `DevCPC: Run File in Emulator`

### Emulator Implementation Details

The integrated emulator is a VS Code WebView using:

- `media/shell.html` as host page
- `media/shell.js` as command bridge (`boot`, `reset`, `load`, `load_dsk`, `input`, debug commands)
- `media/cpc-ui.js` + `media/cpc-ui.wasm` as KC CPC runtime
- `src/devCpcEmulator.ts` and `src/emulatorLauncher.ts` as extension-side orchestration

#### Config source

- `devcpc.conf` is read from the **workspace root**.

#### CPC model selection (`CPC_MODEL`)

- `CPC_MODEL=6128` -> default runtime mode
- `CPC_MODEL=464` -> runtime starts in CPC 464 mode
- `CPC_MODEL=664` -> currently falls back to 6128 with warning

#### Auto-load priority

- For `CPC_MODEL=464`: `CDT -> DSK -> BIN`
- For other models: `DSK -> CDT -> BIN`

#### Auto run command (`RUN_FILE`)

After loading a file, the extension can auto-send input to emulator:

- If `RUN_FILE` is a filename, it sends `run"<RUN_FILE>`
- If `RUN_FILE` already looks like a command (`|cpm`, `run"disc`, `call ...`), it sends it as-is
- `\n`, `\r`, `\t` escapes are supported
- Duplicate automatic sends are debounced to avoid double execution in quick open/run sequences

### Configuration Management

Edit your `devcpc.conf` visually:

1. Open the **DevCPC Config** panel in Explorer
2. Click toggles to enable/disable variables
3. Double-click values to edit them
4. Variables are automatically created when toggled

### Emulator Selection

Configure `EMULATOR_TYPE` in your `devcpc.conf`:

```
EMULATOR_TYPE = integrated  # Use built-in KC CPC emulator
# EMULATOR_TYPE = rvm       # Use RetroVirtualMachine (requires RVM_PATH)
```

## Task Icons

Tasks are automatically assigned icons based on their names:

- 🔧 **Build** tasks
- 🗑️ **Clean** tasks
- ▶️ **Run** tasks
- ℹ️ **Info** tasks
- ✓ **Validate** tasks
- ❓ **Help** tasks
- 🏷️ **Version** tasks

## Known Issues

Please report issues at: https://github.com/destroyer-dcf/devcpc-vscode-ext/issues

## Release Notes

### 0.1.0

- Initial release
- Support for taskcpc.json configuration
- Visual task list with icons
- Composite task execution with dependencies

## License

MIT

---

**Enjoy coding for Amstrad CPC with DevCPC!**
