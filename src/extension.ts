'use strict';

import * as vscode from 'vscode';
import { TaskTreeDataProvider } from './taskProvider';
import { ConfigTreeProvider } from './configTreeProvider';
import { ConfigTreeCommands } from './configTreeCommands';
import * as devCpcEmulator from './devCpcEmulator';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {

	const taskTreeDataProvider = new TaskTreeDataProvider(context);

	vscode.window.registerTreeDataProvider('devcpcTasks', taskTreeDataProvider);
	vscode.commands.registerCommand('devcpcTasks.refresh', () => taskTreeDataProvider.refresh());

	// Registrar ConfigTreeProvider para devcpc.conf
	const configTreeProvider = new ConfigTreeProvider();
	vscode.window.registerTreeDataProvider('devcpcConfig', configTreeProvider);

	// Comandos de configuración
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.editConfigVariable', ConfigTreeCommands.editConfigVariable)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.refreshConfig', () => configTreeProvider.refresh())
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.toggleConfigVariable', async (item) => {
			if (item.configPath && item.lineNumber !== undefined) {
				await ConfigTreeCommands.toggleVariable(item.configPath, item.lineNumber, item.isEnabled);
			}
		})
	);

	// Comandos del emulador integrado
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.openIntegratedEmulator', async () => {
			await devCpcEmulator.initEmulator(context);
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.resetEmulator', () => {
			devCpcEmulator.resetEmulator();
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.focusEmulator', () => {
			devCpcEmulator.focusEmulator();
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.closeEmulator', () => {
			devCpcEmulator.closeEmulator();
		})
	);

	vscode.commands.registerCommand('devcpcTasks.executeTask', async function(taskDef: any) {
		console.log('Ejecutando tarea:', taskDef.label);
		
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			return;
		}
		
		// Si la tarea tiene dependsOn, ejecutar primero las dependencias
		if (taskDef.dependsOn && Array.isArray(taskDef.dependsOn)) {
			const tasksCpcPath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'taskcpc.json');
			if (fs.existsSync(tasksCpcPath)) {
				try {
					const fileContent = fs.readFileSync(tasksCpcPath, 'utf8');
					const tasksConfig = JSON.parse(fileContent);
					
					// Ejecutar cada dependencia en secuencia
					for (const depLabel of taskDef.dependsOn) {
						const depTaskDef = tasksConfig.tasks.find((t: any) => t.label === depLabel);
						if (depTaskDef) {
							console.log('Ejecutando dependencia:', depLabel);
							await executeTaskDef(depTaskDef, workspaceFolder);
						}
					}
				} catch (error) {
					console.error('Error al ejecutar dependencias:', error);
				}
			}
		}
		
		// Ejecutar la tarea principal si tiene command
		if (taskDef.command) {
			await executeTaskDef(taskDef, workspaceFolder);
		}
	});
}

async function executeTaskDef(taskDef: any, workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	return new Promise((resolve, reject) => {
		let execution;
		if (taskDef.type === 'npm') {
			execution = new vscode.ShellExecution(`npm run ${taskDef.script}`);
		} else {
			let commandLine = taskDef.command || '';
			if (taskDef.args && Array.isArray(taskDef.args)) {
				commandLine += ' ' + taskDef.args.join(' ');
			}
			execution = new vscode.ShellExecution(commandLine);
		}
		
		const task = new vscode.Task(
			{ type: taskDef.type || 'shell' },
			workspaceFolder,
			taskDef.label || 'Unnamed',
			taskDef.type || 'shell',
			execution
		);
		
		// Configurar presentation
		if (taskDef.presentation) {
			task.presentationOptions = {
				reveal: getRevealKind(taskDef.presentation.reveal),
				panel: getPanelKind(taskDef.presentation.panel),
				focus: taskDef.presentation.focus,
				clear: taskDef.presentation.clear
			};
		}
		
		vscode.tasks.executeTask(task).then(execution => {
			const disposable = vscode.tasks.onDidEndTask(e => {
				if (e.execution === execution) {
					disposable.dispose();
					resolve();
				}
			});
		}, reject);
	});
}

function getRevealKind(reveal?: string): vscode.TaskRevealKind {
	switch (reveal) {
		case 'always': return vscode.TaskRevealKind.Always;
		case 'silent': return vscode.TaskRevealKind.Silent;
		case 'never': return vscode.TaskRevealKind.Never;
		default: return vscode.TaskRevealKind.Always;
	}
}

function getPanelKind(panel?: string): vscode.TaskPanelKind {
	switch (panel) {
		case 'shared': return vscode.TaskPanelKind.Shared;
		case 'dedicated': return vscode.TaskPanelKind.Dedicated;
		case 'new': return vscode.TaskPanelKind.New;
		default: return vscode.TaskPanelKind.Shared;
	}
}

export function deactivate(): void {
	
}