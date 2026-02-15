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
			console.log('toggleConfigVariable command called with item:', item);
			console.log('Item details:', {
				configPath: item?.configPath,
				lineNumber: item?.lineNumber,
				isEnabled: item?.isEnabled,
				varName: item?.varName
			});
			
			if (item && item.configPath && item.lineNumber !== undefined) {
				await ConfigTreeCommands.toggleVariable(
					item.configPath, 
					item.lineNumber, 
					item.isEnabled,
					item.varName,
					item.varDefinition
				);
				// Refrescar el tree view después del toggle
				configTreeProvider.refresh();
			} else {
				vscode.window.showErrorMessage(`Datos de configuración inválidos. Item: ${JSON.stringify({
					hasItem: !!item,
					hasPath: !!item?.configPath,
					lineNumber: item?.lineNumber,
					varName: item?.varName
				})}`);
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
	// Leer configuración para obtener rutas
	const configPath = findConfigFileInWorkspace(workspaceFolder.uri.fsPath);
	if (!configPath) {
		return;
	}

	try {
		const content = fs.readFileSync(configPath, 'utf8');
		const lines = content.split('\n');
		const config: any = {};

		// Parsear todas las variables de configuración
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
				const [key, ...valueParts] = trimmed.split('=');
				const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
				config[key.trim()] = value;
			}
		}

		// Buscar archivo generado en orden de prioridad: DSK, CDT, BIN
		let fileToLoad: string | undefined;
		let fileName: string | undefined;

		// 1. Buscar DSK (lo más común en DevCPC)
		if (config.DIST_DIR && config.DSK) {
			const distDir = path.isAbsolute(config.DIST_DIR)
				? config.DIST_DIR
				: path.join(workspaceFolder.uri.fsPath, config.DIST_DIR);
			const dskPath = path.join(distDir, config.DSK);
			
			if (fs.existsSync(dskPath)) {
				fileToLoad = dskPath;
				fileName = config.DSK;
			}
		}

		// 2. Buscar CDT si no hay DSK
		if (!fileToLoad && config.DIST_DIR && config.CDT) {
			const distDir = path.isAbsolute(config.DIST_DIR)
				? config.DIST_DIR
				: path.join(workspaceFolder.uri.fsPath, config.DIST_DIR);
			const cdtPath = path.join(distDir, config.CDT);
			
			if (fs.existsSync(cdtPath)) {
				fileToLoad = cdtPath;
				fileName = config.CDT;
			}
		}

		// 3. Buscar archivos .bin si no hay DSK/CDT
		if (!fileToLoad && config.OUTPUT_PATH) {
			const outputPath = path.isAbsolute(config.OUTPUT_PATH)
				? config.OUTPUT_PATH
				: path.join(workspaceFolder.uri.fsPath, config.OUTPUT_PATH);

			if (fs.existsSync(outputPath)) {
				if (fs.statSync(outputPath).isDirectory()) {
					// Buscar archivos en el directorio
					const files = fs.readdirSync(outputPath);
					const cpcFiles = files.filter(f => 
						f.endsWith('.bin') || f.endsWith('.dsk') || f.endsWith('.cdt')
					);

					if (cpcFiles.length > 0) {
						// Priorizar .dsk, luego .cdt, luego .bin
						const dskFile = cpcFiles.find(f => f.endsWith('.dsk'));
						const cdtFile = cpcFiles.find(f => f.endsWith('.cdt'));
						const binFile = cpcFiles.find(f => f.endsWith('.bin'));
						
						const selectedFile = dskFile || cdtFile || binFile;
						if (selectedFile) {
							fileToLoad = path.join(outputPath, selectedFile);
							fileName = selectedFile;
						}
					}
				} else if (outputPath.match(/\.(bin|dsk|cdt)$/i)) {
					// Si OUTPUT_PATH es directamente un archivo
					fileToLoad = outputPath;
					fileName = path.basename(outputPath);
				}
			}
		}

		// Si encontramos un archivo, preguntar si quiere cargarlo
		if (fileToLoad && fileName) {
			const answer = await vscode.window.showInformationMessage(
				`Build completado: ${fileName}. ¿Cargar en el emulador?`,
				'Sí',
				'No'
			);

			if (answer === 'Sí') {
				await emulatorLauncher.launchEmulator(context, fileToLoad);
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