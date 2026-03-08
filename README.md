# DevCPC for VS Code

![Demo](https://raw.githubusercontent.com/destroyer-dcf/devcpc-vscode-ext/main/doc/extension.gif)

VS Code extension to work with DevCPC projects from inside the editor.

## What It Includes

- **Project Setup view (DevCPC activity bar):**
  - `Pick a folder` to open an existing project folder
  - `Create New Project` to open a side wizard and generate a new DevCPC project
- **DevCPC tasks view (Explorer):** run tasks from `.vscode/taskcpc.json`
- **Integrated CPC emulator (KC CPC):** open, reset, focus, close, and load files
- **Auto-load after build:** if task flow and config allow it, generated artifacts are loaded automatically
- **Run in external emulator:** optional `RVM_PATH` support in `devcpc.conf`

## Requirements

- [DevCPC CLI](https://github.com/destroyer-dcf/DevCPC)
- VS Code `1.60.0` or higher

## Installation

1. Install the extension.
2. Open a folder with a DevCPC project (or create one from `Project Setup`).
3. Ensure your project has `.vscode/taskcpc.json` to use task execution in Explorer.

## Project Setup View

The DevCPC activity bar contains `Project Setup` with two actions:

- **Pick a folder**
  - Opens a folder picker.
  - Lets you choose `Open Here` or `Open in New Window`.
- **Create New Project**
  - Opens a side wizard (`WebviewPanel`) with:
    - Project name
    - Project type template
    - CPC model (`464`, `664`, `6128`)
    - `PATH Retro Virtual Machine` file picker (optional)
    - Default/custom destination folder

When project creation finishes, the extension can open the generated folder.

## Task Configuration

Create `.vscode/taskcpc.json` in your project root:

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

Composite tasks are supported using `dependsOn` and `dependsOrder`.

## Integrated Emulator

Commands:

- `DevCPC: Open Integrated Emulator`
- `DevCPC: Reset Emulator`
- `DevCPC: Focus Emulator`
- `DevCPC: Close Emulator`
- `DevCPC: Run File in Emulator`

Supported load formats:

- `.bin`
- `.sna`
- `.dsk`
- `.cdt`

Implementation pieces:

- `media/shell.html`
- `media/shell.js`
- `media/cpc-ui.js`
- `media/cpc-ui.wasm`
- `src/devCpcEmulator.ts`
- `src/emulatorLauncher.ts`

## `devcpc.conf` Runtime Behavior

The extension reads `devcpc.conf` from workspace context for emulator/runtime decisions.

### `CPC_MODEL`

- `6128`: default behavior
- `464`: prefers `CDT` over `DSK` in auto-selection
- `664`: currently falls back to `6128` behavior

### Auto-load priority

- For `CPC_MODEL=464`: `CDT -> DSK -> BIN`
- For other models: `DSK -> CDT -> BIN`

### `RUN_FILE`

After loading an artifact, the extension can auto-send a run command to emulator.

### External emulator

Use in `devcpc.conf`:

```conf
EMULATOR_TYPE=integrated
# EMULATOR_TYPE=rvm
# RVM_PATH="/path/to/RetroVirtualMachine"
```

## Known Notes

- The Explorer view now focuses on **tasks only** (`DevCPC`).
- Project setup and creation are handled in the DevCPC activity bar `Project Setup` view.

## Issues

Report issues here:

- https://github.com/destroyer-dcf/devcpc-vscode-ext/issues

## License

MIT
