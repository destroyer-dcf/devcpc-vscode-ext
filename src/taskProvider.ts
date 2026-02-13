import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class TaskTreeDataProvider implements vscode.TreeDataProvider<TreeTask> {

	private _onDidChangeTreeData: vscode.EventEmitter<TreeTask | null> = new vscode.EventEmitter<TreeTask | null>();
	readonly onDidChangeTreeData: vscode.Event<TreeTask | null> = this._onDidChangeTreeData.event;

	private autoRefresh: boolean = true;

	constructor(private context: vscode.ExtensionContext) {
		this.autoRefresh = vscode.workspace.getConfiguration('devcpcTasks').get('autorefresh');
	}

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	public async getChildren(task?: TreeTask): Promise<TreeTask[]> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			return [];
		}

		const tasksCpcPath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'taskcpc.json');
		
		if (!fs.existsSync(tasksCpcPath)) {
			return [];
		}

		try {
			const fileContent = fs.readFileSync(tasksCpcPath, 'utf8');
			const tasksConfig = JSON.parse(fileContent);
			
			let taskNames: TreeTask[] = [];
			if (tasksConfig.tasks && tasksConfig.tasks.length > 0) {
				for (let i = 0; i < tasksConfig.tasks.length; i++) {
					const taskDef = tasksConfig.tasks[i];
					
					// Crear una tarea básica - la ejecución la manejaremos en el comando
					const task = new vscode.Task(
						{ type: 'shell', taskDef: taskDef },
						workspaceFolder,
						taskDef.label || `Task ${i}`,
						'shell'
					);
					
					const iconName = this.getIconForTask(taskDef.label || '');
					taskNames[i] = new TreeTask(
						'shell',
						taskDef.label || taskDef.script || `Task ${i}`,
						vscode.TreeItemCollapsibleState.None,
						{ command: 'devcpcTasks.executeTask', title: "Execute", arguments: [taskDef] },
						iconName
					);
				}
			}
			return taskNames;
		} catch (error) {
			console.error('Error al leer taskcpc.json:', error);
			return [];
		}
	}

	private getIconForTask(label: string): string {
		const lowerLabel = label.toLowerCase();
		if (lowerLabel.includes('build')) return 'tools';
		if (lowerLabel.includes('clean')) return 'trash';
		if (lowerLabel.includes('run')) return 'play';
		if (lowerLabel.includes('info')) return 'info';
		if (lowerLabel.includes('validate')) return 'check';
		if (lowerLabel.includes('help')) return 'question';
		if (lowerLabel.includes('version')) return 'tag';
		return 'gear';
	}

	getTreeItem(task: TreeTask): vscode.TreeItem {
		return task;
	}
}

class TreeTask extends vscode.TreeItem {
	type: string;

	constructor(
		type: string, 
		label: string, 
		collapsibleState: vscode.TreeItemCollapsibleState,
		command?: vscode.Command,
		icon?: string
	) {
		super(label, collapsibleState);
		this.type = type;
		this.command = command;
		if (icon) {
			this.iconPath = new vscode.ThemeIcon(icon);
		}
	}
	 
}
