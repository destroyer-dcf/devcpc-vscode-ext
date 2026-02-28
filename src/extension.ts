'use strict';

import * as vscode from 'vscode';
import { TaskTreeDataProvider } from './taskProvider';
import { ConfigTreeProvider } from './configTreeProvider';
import { ConfigTreeCommands } from './configTreeCommands';
import * as devCpcEmulator from './devCpcEmulator';
import * as emulatorLauncher from './emulatorLauncher';
import * as fs from 'fs';
import * as path from 'path';
import { findConfigFileInWorkspace, parseConfigFile, resolveConfigPath } from './configUtils';

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

		const configPath = findConfigFileInWorkspace(workspaceFolder.uri.fsPath);
		const config = configPath ? parseConfigFile(configPath) : {};
		const emulatorType = String(config.EMULATOR_TYPE || 'integrated').trim().toLowerCase();
		const skipDependenciesForIntegratedRun = emulatorType === 'integrated' && isRunTask(taskDef);
		
		// Si la tarea tiene dependsOn, ejecutar primero las dependencias
		if (!skipDependenciesForIntegratedRun && taskDef.dependsOn && Array.isArray(taskDef.dependsOn)) {
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
		} else if (skipDependenciesForIntegratedRun && taskDef.dependsOn && Array.isArray(taskDef.dependsOn)) {
			console.log('[DevCPC] Dependencias omitidas para tarea run en emulador integrado');
		}
		
		// Ejecutar la tarea principal si tiene command
		if (taskDef.command) {
			await executeTaskDef(context, taskDef, workspaceFolder);
		}
	});
}

async function executeTaskDef(context: vscode.ExtensionContext, taskDef: any, workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	const configPath = findConfigFileInWorkspace(workspaceFolder.uri.fsPath);
	const config = configPath ? parseConfigFile(configPath) : {};
	const emulatorType = String(config.EMULATOR_TYPE || 'integrated').trim().toLowerCase();
	const runTask = isRunTask(taskDef);
	console.log(`[DevCPC] executeTaskDef: label="${taskDef?.label || ''}" emulatorType="${emulatorType}" isRunTask=${runTask}`);

	// Si es tarea de run y el emulador es integrado, no ejecutar "devcpc run" en terminal.
	// Se resuelve el artefacto y se carga directamente en el emulador integrado.
	if (emulatorType === 'integrated' && runTask) {
		const runMode = getRunModeFromTask(taskDef);
		const resolved = resolveOutputFileToLoad(workspaceFolder, configPath, config, runMode);
		console.log(`[DevCPC] Interceptando tarea run para emulador integrado (mode=${runMode}). File=${resolved?.filePath || 'auto'}`);
		await emulatorLauncher.launchEmulator(context, resolved?.filePath, { resetBeforeLoad: true });
		return;
	}

	return new Promise((resolve, reject) => {
		let execution;
		if (taskDef.type === 'npm') {
			execution = new vscode.ShellExecution(`npm run ${taskDef.script}`);
		} else {
			let commandLine = taskDef.command || '';
			if (taskDef.args && Array.isArray(taskDef.args)) {
				commandLine += ' ' + taskDef.args.join(' ');
			}
			console.log(`[DevCPC] Ejecutando shell task: ${commandLine}`);
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

function isRunTask(taskDef: any): boolean {
	const label = (taskDef?.label || '').toLowerCase();
	const command = (taskDef?.command || '').toLowerCase();
	const args = Array.isArray(taskDef?.args) ? taskDef.args.map((a: any) => String(a).toLowerCase()) : [];
	const script = String(taskDef?.script || '').toLowerCase();

	if (args.includes('run')) {
		return true;
	}
	if (args.some(a => a === '--run' || a.includes('run:') || a.includes('run-'))) {
		return true;
	}
	if (command.includes('devcpc') && command.includes('run')) {
		return true;
	}
	if (script.includes('run')) {
		return true;
	}
	// fallback por etiqueta cuando el task está orientado a run
	return label.includes('run');
}

function getRunModeFromTask(taskDef: any): 'auto' | 'dsk' | 'cdt' {
	const label = (taskDef?.label || '').toLowerCase();
	const args = Array.isArray(taskDef?.args) ? taskDef.args.map((a: any) => String(a).toLowerCase()) : [];

	if (args.includes('--dsk') || label.includes('run dsk')) {
		return 'dsk';
	}
	if (args.includes('--cdt') || label.includes('run cdt')) {
		return 'cdt';
	}
	return 'auto';
}

function resolveOutputFileToLoad(
	workspaceFolder: vscode.WorkspaceFolder,
	configPath: string | undefined,
	config: any,
	runMode: 'auto' | 'dsk' | 'cdt'
): { filePath: string; fileName: string } | undefined {
	if (!configPath) {
		return undefined;
	}

	const preferCdtByModel = (config.CPC_MODEL || '').trim() === '464';
	const distDir = config.DIST_DIR ? resolveConfigPath(configPath, config.DIST_DIR) : undefined;
	const explicitMode = runMode !== 'auto' ? runMode : (preferCdtByModel ? 'cdt' : 'dsk');

	const tryFile = (candidate?: string) => {
		if (!candidate) return undefined;
		if (fs.existsSync(candidate)) {
			return { filePath: candidate, fileName: path.basename(candidate) };
		}
		return undefined;
	};

	if (distDir) {
		const dskPath = config.DSK ? path.join(distDir, config.DSK) : undefined;
		const cdtPath = config.CDT ? path.join(distDir, config.CDT) : undefined;

		if (explicitMode === 'cdt') {
			return tryFile(cdtPath) || tryFile(dskPath);
		}
		if (explicitMode === 'dsk') {
			return tryFile(dskPath) || tryFile(cdtPath);
		}
	}

	if (config.OUTPUT_PATH) {
		const outputPath = resolveConfigPath(configPath, config.OUTPUT_PATH);
		if (fs.existsSync(outputPath)) {
			if (fs.statSync(outputPath).isDirectory()) {
				const files = fs.readdirSync(outputPath);
				const dskFile = files.find(f => f.endsWith('.dsk'));
				const cdtFile = files.find(f => f.endsWith('.cdt'));
				const binFile = files.find(f => f.endsWith('.bin'));
				const selected = explicitMode === 'cdt'
					? (cdtFile || dskFile || binFile)
					: (dskFile || cdtFile || binFile);
				if (selected) {
					return { filePath: path.join(outputPath, selected), fileName: selected };
				}
			} else if (outputPath.match(/\.(bin|dsk|cdt)$/i)) {
				return { filePath: outputPath, fileName: path.basename(outputPath) };
			}
		}
	}

	return undefined;
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
	console.log('[DevCPC] autoLoadBinaryAfterBuild iniciado');
	
	// Leer configuración para obtener rutas
	const configPath = findConfigFileInWorkspace(workspaceFolder.uri.fsPath);
	if (!configPath) {
		console.log('[DevCPC] No se encontró devcpc.conf en la raíz del workspace');
		return;
	}

	console.log('[DevCPC] Config encontrado en:', configPath);

	try {
		const config = parseConfigFile(configPath);
		const emulatorType = (config.EMULATOR_TYPE || 'integrated').toLowerCase();

		console.log('[DevCPC] Configuración parseada:', JSON.stringify(config, null, 2));

		// Si no es emulador integrado, no lanzar el emulador de VS Code desde post-build.
		// En ese caso debe seguir el flujo normal de tareas/comando (por ejemplo: devcpc run para RVM).
		if (emulatorType !== 'integrated') {
			console.log(`[DevCPC] EMULATOR_TYPE=${emulatorType}. Se omite auto-load del emulador integrado.`);
			return;
		}

		// Buscar archivo generado en orden de prioridad según modelo:
		// CPC 464 => CDT, DSK, BIN
		// otros     => DSK, CDT, BIN
		let fileToLoad: string | undefined;
		let fileName: string | undefined;
		const preferCdt = (config.CPC_MODEL || '').trim() === '464';
		const distDir = config.DIST_DIR ? resolveConfigPath(configPath, config.DIST_DIR) : undefined;

		if (preferCdt) {
			if (distDir && config.CDT) {
				const cdtPath = path.join(distDir, config.CDT);
				console.log('[DevCPC] (CPC 464) Buscando CDT en:', cdtPath);
				if (fs.existsSync(cdtPath)) {
					fileToLoad = cdtPath;
					fileName = config.CDT;
					console.log('[DevCPC] (CPC 464) CDT encontrado:', cdtPath);
				} else {
					console.log('[DevCPC] (CPC 464) CDT no existe en esa ruta');
				}
			}
			if (!fileToLoad && distDir && config.DSK) {
				const dskPath = path.join(distDir, config.DSK);
				console.log('[DevCPC] (CPC 464) Buscando DSK fallback en:', dskPath);
				if (fs.existsSync(dskPath)) {
					fileToLoad = dskPath;
					fileName = config.DSK;
					console.log('[DevCPC] (CPC 464) DSK fallback encontrado:', dskPath);
				} else {
					console.log('[DevCPC] (CPC 464) DSK fallback no existe en esa ruta');
				}
			}
		} else {
			// 1. Buscar DSK (lo más común en DevCPC)
			if (distDir && config.DSK) {
				const dskPath = path.join(distDir, config.DSK);
				
				console.log('[DevCPC] Buscando DSK en:', dskPath);
				
				if (fs.existsSync(dskPath)) {
					fileToLoad = dskPath;
					fileName = config.DSK;
					console.log('[DevCPC] DSK encontrado:', dskPath);
				} else {
					console.log('[DevCPC] DSK no existe en esa ruta');
				}
			}

			// 2. Buscar CDT si no hay DSK
			if (!fileToLoad && distDir && config.CDT) {
				const cdtPath = path.join(distDir, config.CDT);
				
				console.log('[DevCPC] Buscando CDT en:', cdtPath);
				
				if (fs.existsSync(cdtPath)) {
					fileToLoad = cdtPath;
					fileName = config.CDT;
					console.log('[DevCPC] CDT encontrado:', cdtPath);
				} else {
					console.log('[DevCPC] CDT no existe en esa ruta');
				}
			}
		}

		// 3. Buscar archivos .bin si no hay DSK/CDT
		if (!fileToLoad && config.OUTPUT_PATH) {
			const outputPath = resolveConfigPath(configPath, config.OUTPUT_PATH);

			console.log('[DevCPC] Buscando en OUTPUT_PATH:', outputPath);

			if (fs.existsSync(outputPath)) {
				if (fs.statSync(outputPath).isDirectory()) {
					// Buscar archivos en el directorio
					const files = fs.readdirSync(outputPath);
					const cpcFiles = files.filter(f => 
						f.endsWith('.bin') || f.endsWith('.dsk') || f.endsWith('.cdt')
					);

					console.log('[DevCPC] Archivos CPC encontrados:', cpcFiles);

					if (cpcFiles.length > 0) {
						// Priorizar .dsk, luego .cdt, luego .bin
						const dskFile = cpcFiles.find(f => f.endsWith('.dsk'));
						const cdtFile = cpcFiles.find(f => f.endsWith('.cdt'));
						const binFile = cpcFiles.find(f => f.endsWith('.bin'));
						
						const selectedFile = dskFile || cdtFile || binFile;
						if (selectedFile) {
							fileToLoad = path.join(outputPath, selectedFile);
							fileName = selectedFile;
							console.log('[DevCPC] Archivo seleccionado:', fileToLoad);
						}
					}
				} else if (outputPath.match(/\.(bin|dsk|cdt)$/i)) {
					// Si OUTPUT_PATH es directamente un archivo
					fileToLoad = outputPath;
					fileName = path.basename(outputPath);
					console.log('[DevCPC] OUTPUT_PATH es archivo directo:', fileToLoad);
				}
			}
		}

		// Si encontramos un archivo, preguntar si quiere cargarlo
		if (fileToLoad && fileName) {
			console.log('[DevCPC] Preguntando al usuario si quiere cargar:', fileName);
			
			const answer = await vscode.window.showInformationMessage(
				`Build completado: ${fileName}. ¿Cargar en el emulador?`,
				'Sí',
				'No'
			);

			if (answer === 'Sí') {
				console.log('[DevCPC] Usuario aceptó, lanzando emulador...');
				await emulatorLauncher.launchEmulator(context, fileToLoad);
			} else {
				console.log('[DevCPC] Usuario canceló');
			}
		} else {
			console.log('[DevCPC] No se encontró ningún archivo para cargar');
		}
	} catch (error) {
		console.error('[DevCPC] Error en autoLoadBinaryAfterBuild:', error);
	}
}

export function deactivate(): void {
	
}
