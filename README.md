# DevCPC Tasks for VS Code

VS Code extension to view and run DevCPC tasks directly from the Explorer pane.

This extension adds a "DevCPC" view to your Explorer panel, allowing you to visualize and execute DevCPC tasks configured in your project with a single click. Perfect for developing games and applications for Amstrad CPC.

## Features

- **Visual Task List**: See all available DevCPC tasks at a glance
- **One-Click Execution**: Run any task directly from the Explorer panel
- **Task Icons**: Visual indicators for different task types (build, clean, run, etc.)
- **Composite Tasks Support**: Execute complex task chains with dependencies
- **Auto-Refresh**: Automatically updates the task list when configuration changes

![DevCPC Tasks](https://raw.githubusercontent.com/destroyer-dcf/devcpc-vscode-ext/main/assets/screenshot.png)

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

1. Open a project with DevCPC configuration
2. Find the **DevCPC** panel in the Explorer sidebar
3. Click on any task to execute it
4. Use the refresh button (⟳) to reload the task list

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
