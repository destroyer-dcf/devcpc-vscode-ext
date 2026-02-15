'use strict';

import * as vscode from 'vscode';
import { TaskTreeDataProvider } from './taskProvider';
import { ConfigTreeProvider } from './configTreeProvider';
import { ConfigTreeCommands } from './configTreeCommands';
import * as devCpcEmulator from './devCpcEmulator';
import * as emulatorLauncher from './emulatorLauncher';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {

	const taskTreeDataProvider = new TaskTreeDataProvider(context);

	vscode.window.registerTreeDataProvider('devcpcTasks', taskTreeDataProvider);
	vscode.commands.registerCommand('devcpcTasks.refresh', () => taskTreeDataProvider.refresh());

	// Comando para ejecutar tarea desde botón inline
	vscode.commands.registerCommand('devcpcTasks.runTask', async (item: any) => {
		if (item.taskDef) {
			await vscode.commands.executeCommand('devcpcTasks.executeTask', item.taskDef);
		}
	});

	// Registrar ConfigTreeProvider para devcpc.conf
	const configTreeProvider = new ConfigTreeProvider();
	vscode.window.registerTreeDataProvider('devcpcConfig', configTreeProvider);

	// Comandos de configuración
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.editConfigVariable', async (item) => {
			await ConfigTreeCommands.editConfigVariable(item);
			// Refrescar el tree view después de editar
			configTreeProvider.refresh();
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.refreshConfig', () => configTreeProvider.refresh())
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.toggleConfigVariable', async (item) => {
			if (item && item.configPath && item.lineNumber !== undefined && item.lineNumber >= 0) {
				await ConfigTreeCommands.toggleVariable(item.configPath, item.lineNumber, item.isEnabled);
				// Refrescar el tree view después del toggle
				configTreeProvider.refresh();
			} else {
				vscode.window.showErrorMessage('Datos de configuración inválidos. Intenta refrescar la vista.');
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

	// Comando para lanzar emulador según configuración
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.launchEmulator', async () => {
			await emulatorLauncher.launchEmulator(context);
		})
	);

	// Comando para ejecutar archivo en emulador
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.runInEmulator', async (fileUri?: vscode.Uri) => {
			const filePath = fileUri ? fileUri.fsPath : undefined;
			await emulatorLauncher.runInEmulator(context, filePath);
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
							await executeTaskDef(context, depTaskDef, workspaceFolder);
						}
					}
				} catch (error) {
					console.error('Error al ejecutar dependencias:', error);
				}
			}
		}
		
		// Ejecutar la tarea principal si tiene command
		if (taskDef.command) {
			await executeTaskDef(context, taskDef, workspaceFolder);
		}
	});
}

async function executeTaskDef(context: vscode.ExtensionContext, taskDef: any, workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
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
			const disposable = vscode.tasks.onDidEndTask(async e => {
				if (e.execution === execution) {
					disposable.dispose();
					
					// Auto-cargar binario si la tarea fue de build
					if (taskDef.label && taskDef.label.toLowerCase().includes('build')) {
						await autoLoadBinaryAfterBuild(context, workspaceFolder);
					}
					
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

/**
 * Auto-cargar binario en el emulador después de un build exitoso
 */
async function autoLoadBinaryAfterBuild(context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	// Leer configuración para obtener OUTPUT_PATH
	const configPath = findConfigFileInWorkspace(workspaceFolder.uri.fsPath);
	if (!configPath) {
		return;
	}

	try {
		const content = fs.readFileSync(configPath, 'utf8');
		const lines = content.split('\n');
		let outputPath: string | undefined;

		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith('OUTPUT_PATH=') && !trimmed.startsWith('#')) {
				outputPath = trimmed.split('=')[1].trim();
				break;
			}
		}

		if (!outputPath) {
			return;
		}

		// Resolver ruta completa
		const fullOutputPath = path.isAbsolute(outputPath)
			? outputPath
			: path.join(workspaceFolder.uri.fsPath, outputPath);

		// Buscar archivos .bin en el directorio de salida
		if (fs.existsSync(fullOutputPath) && fs.statSync(fullOutputPath).isDirectory()) {
			const files = fs.readdirSync(fullOutputPath);
			const binFiles = files.filter(f => f.endsWith('.bin'));

			if (binFiles.length > 0) {
				// Tomar el archivo más reciente
				const binPath = path.join(fullOutputPath, binFiles[0]);
				
				// Preguntar al usuario si quiere cargar
				const answer = await vscode.window.showInformationMessage(
					`Build completado: ${binFiles[0]}. ¿Cargar en el emulador?`,
					'Sí',
					'No'
				);

				if (answer === 'Sí') {
					await emulatorLauncher.launchEmulator(context, binPath);
				}
			}
		} else if (fs.existsSync(fullOutputPath) && fullOutputPath.endsWith('.bin')) {
			// Si OUTPUT_PATH es directamente un archivo .bin
			const answer = await vscode.window.showInformationMessage(
				`Build completado: ${path.basename(fullOutputPath)}. ¿Cargar en el emulador?`,
				'Sí',
				'No'
			);

			if (answer === 'Sí') {
				await emulatorLauncher.launchEmulator(context, fullOutputPath);
			}
		}
	} catch (error) {
		console.error('Error en autoLoadBinaryAfterBuild:', error);
	}
}

/**
 * Buscar devcpc.conf en el workspace
 */
function findConfigFileInWorkspace(rootPath: string): string | undefined {
	const configPath = path.join(rootPath, 'devcpc.conf');
	if (fs.existsSync(configPath)) {
		return configPath;
	}

	// Buscar en subdirectorios
	try {
		const dirs = fs.readdirSync(rootPath, { withFileTypes: true });
		for (const dir of dirs) {
			if (dir.isDirectory()) {
				const subPath = path.join(rootPath, dir.name, 'devcpc.conf');
				if (fs.existsSync(subPath)) {
					return subPath;
				}
			}
		}
	} catch (error) {
		// Ignorar errores
	}

	return undefined;
}

export function deactivate(): void {
	
}