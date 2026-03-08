import * as vscode from 'vscode';

export class ProjectSetupTreeProvider implements vscode.TreeDataProvider<ProjectSetupItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ProjectSetupItem | undefined | null | void> =
        new vscode.EventEmitter<ProjectSetupItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ProjectSetupItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ProjectSetupItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ProjectSetupItem): Thenable<ProjectSetupItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        // Keep the tree empty so VS Code renders the contributed viewsWelcome content.
        return Promise.resolve([]);
    }
}

class ProjectSetupItem extends vscode.TreeItem {
    constructor(
        label: string,
        iconName: string,
        tooltip: string,
        commandId: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon(iconName);
        this.tooltip = tooltip;
        this.command = {
            command: commandId,
            title: label
        };
        this.contextValue = 'devcpcProjectAction';
    }
}
