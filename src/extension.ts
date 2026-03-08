'use strict';

import * as vscode from 'vscode';
import { TaskTreeDataProvider } from './taskProvider';
import { ProjectSetupTreeProvider } from './projectSetupProvider';
import * as devCpcEmulator from './devCpcEmulator';
import * as emulatorLauncher from './emulatorLauncher';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { findConfigFileInWorkspace, parseConfigFile, resolveConfigPath } from './configUtils';

export function activate(context: vscode.ExtensionContext) {

	// La extensión solo está soportada en macOS, Linux y WSL.
	// En WSL, process.platform reporta 'linux', por lo que únicamente
	// bloqueamos Windows nativo (win32).
	if (process.platform === 'win32') {
		vscode.window.showErrorMessage(
			'DevCPC no está disponible en Windows nativo. Usa macOS, Linux o WSL.'
		);
		return;
	}

	const taskTreeDataProvider = new TaskTreeDataProvider(context);
	const projectSetupTreeProvider = new ProjectSetupTreeProvider();

	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('devcpcProjectStart', projectSetupTreeProvider)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('devcpcProject.refresh', () => projectSetupTreeProvider.refresh())
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('devcpcProject.pickFolder', async () => {
			await pickFolderAndOpenInVsCode();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('devcpcProject.createNewProject', async () => {
			await createDevCpcProject(context);
		})
	);

	// Registrar proveedor de vista de tareas
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('devcpcTasks', taskTreeDataProvider)
	);
	
	// Comando para refrescar el árbol de tareas
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpcTasks.refresh', () => taskTreeDataProvider.refresh())
	);

	// Comando para ejecutar tarea desde botón inline
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpcTasks.runTask', async (item: any) => {
			if (item.taskDef) {
				await vscode.commands.executeCommand('devcpcTasks.executeTask', item.taskDef);
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
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.setEmulatorTypeRvm', async () => {
			const updated = await setWorkspaceConfigVariable('EMULATOR_TYPE', 'rvm');
			if (updated) {
				vscode.window.showInformationMessage('EMULATOR_TYPE actualizado a rvm');
			}
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.setRvmPath', async () => {
			const selected = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: false,
				openLabel: 'Select Retro Virtual Machine executable'
			});
			if (!selected || selected.length === 0) {
				return;
			}
			const updated = await setWorkspaceConfigVariable(
				'RVM_PATH',
				selected[0].fsPath,
				{ quoted: true, comment: 'Ruta al emulador Retro Virtual Machine' }
			);
			if (updated) {
				vscode.window.showInformationMessage('RVM_PATH actualizado');
			}
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.launchRvm', async () => {
			const updated = await setWorkspaceConfigVariable('EMULATOR_TYPE', 'rvm');
			if (!updated) {
				return;
			}
			await emulatorLauncher.launchEmulator(context);
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.setCpcModel464', async () => {
			const updated = await setWorkspaceConfigVariable('CPC_MODEL', '464', {
				comment: 'Modelo de CPC (464, 664, 6128)'
			});
			if (updated) {
				vscode.window.showInformationMessage('CPC_MODEL actualizado a 464');
			}
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.setCpcModel664', async () => {
			const updated = await setWorkspaceConfigVariable('CPC_MODEL', '664', {
				comment: 'Modelo de CPC (464, 664, 6128)'
			});
			if (updated) {
				vscode.window.showInformationMessage('CPC_MODEL actualizado a 664');
			}
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.setCpcModel6128', async () => {
			const updated = await setWorkspaceConfigVariable('CPC_MODEL', '6128', {
				comment: 'Modelo de CPC (464, 664, 6128)'
			});
			if (updated) {
				vscode.window.showInformationMessage('CPC_MODEL actualizado a 6128');
			}
		})
	);

	// Comandos de lanzamiento directo de RVM por modelo (usan settings de VS Code)
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.rvm.launch464', async () => {
			await emulatorLauncher.launchRvmWithModel(context, '464');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.rvm.launch664', async () => {
			await emulatorLauncher.launchRvmWithModel(context, '664');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.rvm.launch6128', async () => {
			await emulatorLauncher.launchRvmWithModel(context, '6128');
		})
	);

	// Comando para ejecutar archivo en emulador
	context.subscriptions.push(
		vscode.commands.registerCommand('devcpc.runInEmulator', async (fileUri?: vscode.Uri) => {
			const filePath = fileUri ? fileUri.fsPath : undefined;
			await emulatorLauncher.runInEmulator(context, filePath);
		})
	);

	// Comando para ejecutar tareas DevCPC
	context.subscriptions.push(
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
		})
	);
}

interface ProjectTemplateOption {
	label: string;
	value: 'basic' | '8bp' | 'asm';
	description: string;
}

const PROJECT_TEMPLATES: ProjectTemplateOption[] = [
	{
		label: 'BASIC',
		value: 'basic',
		description: 'Proyecto BASIC'
	},
	{
		label: '8BP',
		value: '8bp',
		description: 'Proyecto librería 8BP'
	},
	{
		label: 'ASM',
		value: 'asm',
		description: 'Proyecto ASM'
	}
];

let createProjectPanel: vscode.WebviewPanel | undefined;

async function pickFolderAndOpenInVsCode(): Promise<void> {
	const selected = await vscode.window.showOpenDialog({
		canSelectFiles: false,
		canSelectFolders: true,
		canSelectMany: false,
		openLabel: 'Open Folder'
	});

	if (!selected || selected.length === 0) {
		return;
	}

	const folderUri = selected[0];
	const currentFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
	if (
		currentFolder &&
		vscode.workspace.workspaceFolders?.length === 1 &&
		currentFolder.fsPath === folderUri.fsPath
	) {
		vscode.window.showInformationMessage('That folder is already open.');
		return;
	}

	const openHere = 'Open Here';
	const openNewWindow = 'Open in New Window';
	const choice = await vscode.window.showInformationMessage(
		`Open "${path.basename(folderUri.fsPath)}"?`,
		openHere,
		openNewWindow
	);

	if (!choice) {
		return;
	}

	try {
		if (choice === openNewWindow) {
			await vscode.commands.executeCommand('vscode.openFolder', folderUri, true);
			return;
		}

		await vscode.commands.executeCommand('vscode.openFolder', folderUri, {
			forceReuseWindow: true,
			forceNewWindow: false,
			noRecentEntry: false
		} as any);
	} catch {
		// Fallback: opening in a new window is the most reliable path across VS Code versions.
		await vscode.commands.executeCommand('vscode.openFolder', folderUri, true);
	}
}

async function createDevCpcProject(context: vscode.ExtensionContext): Promise<void> {
	openCreateProjectPanel(context);
}

function openCreateProjectPanel(context: vscode.ExtensionContext): void {
	if (createProjectPanel) {
		const logoUri = createProjectPanel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'devcpc.png')));
		createProjectPanel.webview.html = getCreateProjectPanelHtml(
			createProjectPanel.webview,
			logoUri.toString(),
			getDefaultProjectDestination() || ''
		);
		createProjectPanel.reveal(vscode.ViewColumn.Beside, false);
		return;
	}

	const panel = vscode.window.createWebviewPanel(
		'devcpcCreateProject',
		'DevCPC: Create New Project',
		{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
		{
			enableScripts: true,
			retainContextWhenHidden: false
		}
	);

	panel.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'media', 'cpc-logo-small.png'));
	const logoUri = panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'devcpc.png')));
	panel.webview.html = getCreateProjectPanelHtml(
		panel.webview,
		logoUri.toString(),
		getDefaultProjectDestination() || ''
	);

	panel.webview.onDidReceiveMessage(async message => {
		if (!message || typeof message !== 'object') {
			return;
		}

		if (message.type === 'cancel') {
			panel.dispose();
			return;
		}

		if (message.type === 'openHelp') {
			await vscode.env.openExternal(vscode.Uri.parse('https://github.com/destroyer-dcf/DevCPC'));
			return;
		}

		if (message.type === 'chooseRvmPath') {
			const selected = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: false,
				openLabel: 'Select Retro Virtual Machine executable'
			});
			if (selected && selected.length > 0) {
				await panel.webview.postMessage({
					type: 'rvmPathSelected',
					path: selected[0].fsPath
				});
			}
			return;
		}

		if (message.type !== 'create') {
			return;
		}

		const requestedName = typeof message.projectName === 'string' ? message.projectName : '';
		const template = resolveProjectTemplate(typeof message.template === 'string' ? message.template : '');
		const useDefaultLocation = Boolean(message.useDefaultLocation);
		const rvmPath = typeof message.rvmPath === 'string' ? message.rvmPath.trim() : '';
		const cpcModel = resolveCpcModel(typeof message.cpcModel === 'string' ? message.cpcModel : '');
		const cleanName = requestedName.trim();

		if (!cleanName) {
			await panel.webview.postMessage({ type: 'validationError', message: 'Project name is required' });
			return;
		}

		let targetFolder: string | undefined;
		if (useDefaultLocation) {
			targetFolder = getDefaultProjectDestination();
			if (!targetFolder) {
				await panel.webview.postMessage({ type: 'validationError', message: 'Default location is not available' });
				return;
			}
		} else {
			const targetFolders = await vscode.window.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				openLabel: 'Select Destination'
			});

			if (!targetFolders || targetFolders.length === 0) {
				return;
			}

			targetFolder = targetFolders[0].fsPath;
		}

		const validationError = validateProjectName(requestedName, targetFolder);
		if (validationError) {
			await panel.webview.postMessage({ type: 'validationError', message: validationError });
			return;
		}

		await panel.webview.postMessage({ type: 'busy', busy: true });

		try {
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'Creating DevCPC project...',
					cancellable: false
				},
				async () => {
					await runDevCpcCommand(['new', cleanName, `--template=${template}`], targetFolder);
				}
				);

				const projectPath = path.join(targetFolder, cleanName);
				await setProjectCpcModel(projectPath, cpcModel);
				if (rvmPath) {
					await setProjectRvmPath(projectPath, rvmPath);
				}
				const openHere = 'Open Here';
			const openNewWindow = 'Open in New Window';

			const selection = await vscode.window.showInformationMessage(
				`Project created successfully: ${cleanName}`,
				openHere,
				openNewWindow
			);

			if (selection === openHere) {
				await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectPath), false);
			} else if (selection === openNewWindow) {
				await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectPath), true);
			}

			panel.dispose();
		} catch (error: any) {
			const reason = error?.message || String(error);
			await panel.webview.postMessage({ type: 'createError', message: reason });
			vscode.window.showErrorMessage(`Could not create the DevCPC project: ${reason}`);
		} finally {
			if (panel.visible) {
				await panel.webview.postMessage({ type: 'busy', busy: false });
			}
		}
	});

	panel.onDidDispose(() => {
		if (createProjectPanel === panel) {
			createProjectPanel = undefined;
		}
	});

	createProjectPanel = panel;
}

function resolveProjectTemplate(value: string): ProjectTemplateOption['value'] {
	const normalized = value.trim().toLowerCase();
	const found = PROJECT_TEMPLATES.find(template => template.value === normalized);
	return found ? found.value : 'basic';
}

function resolveCpcModel(value: string): '464' | '664' | '6128' {
	const normalized = value.trim();
	if (normalized === '464' || normalized === '664' || normalized === '6128') {
		return normalized;
	}
	return '6128';
}

function getCreateProjectPanelHtml(webview: vscode.Webview, logoUri: string, defaultLocation: string): string {
	const nonce = getNonce();
	const templateOptions = PROJECT_TEMPLATES
		.map(template => `<option value="${template.value}">${escapeHtml(template.label)} - ${escapeHtml(template.description)}</option>`)
		.join('');
	const cpcModelOptions = ['464', '664', '6128']
		.map(model => `<option value="${model}"${model === '6128' ? ' selected' : ''}>${model}</option>`)
		.join('');
	const safeDefaultLocation = defaultLocation ? escapeHtml(defaultLocation) : 'No default location detected';

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>DevCPC: Create New Project</title>
	<style nonce="${nonce}">
		* { box-sizing: border-box; }

		body {
			margin: 0;
			height: 100vh;
			background: #1f2028;
			color: #d2d6df;
			font-family: var(--vscode-font-family);
		}

		button, input, select {
			font: inherit;
			color: inherit;
		}

		.wizard {
			height: 100%;
			display: flex;
			flex-direction: column;
		}

		.wizard-header {
			height: 72px;
			padding: 0 28px;
			display: flex;
			align-items: center;
			justify-content: space-between;
			border-bottom: 1px solid #343742;
			background: #1d1f26;
		}

		.wizard-title {
			font-size: 18px;
			font-weight: 600;
			letter-spacing: 0.2px;
		}

		.close-btn {
			border: none;
			background: transparent;
			color: #8b8f9b;
			width: 36px;
			height: 36px;
			padding: 0;
			font-size: 30px;
			line-height: 1;
			cursor: pointer;
		}

		.close-btn:hover {
			color: #c4c8d2;
		}

		.wizard-content {
			flex: 1;
			padding: 30px 34px 24px;
			overflow: auto;
		}

		.intro {
			margin: 0 0 18px;
			max-width: 900px;
			font-size: 15px;
			line-height: 1.55;
			color: #aaafb9;
		}

		.hero-logo-wrap {
			display: flex;
			justify-content: center;
			margin: 4px 0 18px;
		}

		.hero-logo {
			width: min(560px, 92%);
			max-height: 180px;
			object-fit: contain;
			image-rendering: pixelated;
		}

		.help-link {
			display: inline-block;
			margin-bottom: 16px;
			font-size: 13px;
			color: #6fa7ff;
			text-decoration: none;
			border-bottom: 1px dotted rgba(111, 167, 255, 0.55);
		}

		.help-link:hover {
			color: #9bc2ff;
		}

		.form-row {
			display: grid;
			grid-template-columns: 150px minmax(260px, 1fr);
			align-items: center;
			column-gap: 18px;
			row-gap: 10px;
			margin-bottom: 18px;
		}

		.field-label {
			justify-self: end;
			color: #c3c8d3;
			font-size: 15px;
			font-weight: 600;
		}

		.form-control {
			width: 100%;
			height: 50px;
			border: 1px solid #5b5f6c;
			border-radius: 9px;
			background: #23252f;
			color: #e2e5ec;
			font-size: 15px;
			padding: 0 14px;
			outline: none;
		}

		.form-control::placeholder {
			color: #8f95a4;
		}

		.form-control:focus {
			border-color: #83a9eb;
			box-shadow: 0 0 0 1px rgba(131, 169, 235, 0.25);
		}

		select.form-control {
			appearance: none;
			padding-right: 42px;
			background-image:
				linear-gradient(45deg, transparent 50%, #9499a7 50%),
				linear-gradient(135deg, #9499a7 50%, transparent 50%);
			background-position:
				calc(100% - 20px) calc(50% - 3px),
				calc(100% - 14px) calc(50% - 3px);
			background-size: 7px 7px, 7px 7px;
			background-repeat: no-repeat;
		}

		.path-row {
			align-items: start;
		}

		.path-picker {
			display: grid;
			grid-template-columns: 1fr auto;
			gap: 10px;
		}

		.path-picker .form-control {
			min-width: 0;
		}

		.path-btn {
			height: 50px;
			padding: 0 14px;
			border-radius: 9px;
			border: 1px solid #5f6472;
			background: #272b35;
			color: #d8dce6;
			font-size: 14px;
			font-weight: 600;
			cursor: pointer;
		}

		.path-btn:hover {
			background: #303542;
		}

		.location-wrap {
			display: flex;
			flex-direction: column;
			gap: 8px;
		}

		.checkbox {
			display: inline-flex;
			align-items: center;
			gap: 10px;
			font-size: 14px;
			color: #c4cad7;
			cursor: pointer;
		}

		.checkbox input {
			width: 16px;
			height: 16px;
			accent-color: #3f7bd8;
		}

		.location-path {
			font-size: 12px;
			color: #8e94a5;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.message {
			margin: -4px 0 0 168px;
			min-height: 18px;
			font-size: 12px;
			color: #ff7f7f;
		}

		.wizard-footer {
			height: 86px;
			padding: 0 32px;
			display: flex;
			align-items: center;
			justify-content: flex-end;
			gap: 12px;
			border-top: 1px solid #343742;
			background: #1d1f26;
		}

		.btn {
			min-width: 140px;
			height: 46px;
			border-radius: 8px;
			font-size: 16px;
			font-weight: 600;
			cursor: pointer;
		}

		.btn-secondary {
			border: 1px solid #5f6472;
			background: #1f222a;
			color: #d0d4de;
		}

		.btn-secondary:hover {
			background: #2b2f39;
		}

		.btn-primary {
			border: none;
			background: #3f7bd8;
			color: #eef4ff;
		}

		.btn-primary:hover {
			background: #4d8aeb;
		}

		.btn:disabled {
			opacity: 0.6;
			cursor: default;
		}

		@media (max-width: 860px) {
			.wizard-content {
				padding: 24px 18px;
			}

			.form-row {
				grid-template-columns: 1fr;
				margin-bottom: 14px;
			}

			.field-label {
				justify-self: start;
			}

			.message {
				margin-left: 0;
			}
		}
	</style>
</head>
<body>
	<div class="wizard">
		<div class="wizard-header">
			<div class="wizard-title">Project Wizard</div>
			<button id="close-btn" class="close-btn" type="button" aria-label="Close">&times;</button>
		</div>

		<div class="wizard-content">
			<div class="hero-logo-wrap">
				<img class="hero-logo" src="${logoUri}" alt="DevCPC" />
			</div>
			<p class="intro">
				This wizard allows you to <strong>create new</strong> DevCPC project templates.
				You can also disable default location and choose a custom destination on Finish.
			</p>
			<a href="#" id="help-link" class="help-link">Help and documentation: github.com/destroyer-dcf/DevCPC</a>

			<form id="create-form">
				<div class="form-row">
					<label class="field-label" for="project-name">Name:</label>
					<input id="project-name" class="form-control" type="text" placeholder="Project name" autocomplete="off" required />
				</div>

				<div class="form-row">
					<label class="field-label" for="project-type">Type:</label>
					<select id="project-type" class="form-control">${templateOptions}</select>
				</div>

				<div class="form-row">
					<label class="field-label" for="cpc-model">CPC Model:</label>
					<select id="cpc-model" class="form-control">${cpcModelOptions}</select>
				</div>

				<div class="form-row path-row">
					<label class="field-label" for="rvm-path">PATH Retro Virtual Machine:</label>
					<div class="path-picker">
						<input id="rvm-path" class="form-control" type="text" placeholder="Select Retro Virtual Machine executable" autocomplete="off" />
						<button id="rvm-path-btn" class="path-btn" type="button">Browse...</button>
					</div>
				</div>

				<div class="form-row">
					<label class="field-label" for="use-default-location">Location:</label>
					<div class="location-wrap">
						<label class="checkbox">
							<input id="use-default-location" type="checkbox" checked />
							<span>Use default location</span>
						</label>
						<div id="location-path" class="location-path">${safeDefaultLocation}</div>
					</div>
				</div>

				<div id="message" class="message"></div>
			</form>
		</div>

		<div class="wizard-footer">
			<button id="cancel-btn" class="btn btn-secondary" type="button">Cancel</button>
			<button id="create-btn" class="btn btn-primary" type="submit" form="create-form">Finish</button>
		</div>
	</div>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const form = document.getElementById('create-form');
		const createButton = document.getElementById('create-btn');
		const cancelButton = document.getElementById('cancel-btn');
		const closeButton = document.getElementById('close-btn');
		const helpLink = document.getElementById('help-link');
		const projectName = document.getElementById('project-name');
		const projectType = document.getElementById('project-type');
		const cpcModel = document.getElementById('cpc-model');
		const rvmPathInput = document.getElementById('rvm-path');
		const rvmPathButton = document.getElementById('rvm-path-btn');
		const useDefaultLocation = document.getElementById('use-default-location');
		const locationPath = document.getElementById('location-path');
		const initialDefaultPath = locationPath.textContent;
		const message = document.getElementById('message');

		const setBusy = (busy) => {
			createButton.disabled = busy;
			cancelButton.disabled = busy;
			closeButton.disabled = busy;
			projectName.disabled = busy;
			projectType.disabled = busy;
			cpcModel.disabled = busy;
			rvmPathInput.disabled = busy;
			rvmPathButton.disabled = busy;
			useDefaultLocation.disabled = busy;
			createButton.textContent = busy ? 'Creating...' : 'Finish';
		};

		const submitCreate = () => {
			message.textContent = '';
			vscode.postMessage({
				type: 'create',
				projectName: projectName.value,
				template: projectType.value,
				cpcModel: cpcModel.value,
				rvmPath: rvmPathInput.value,
				useDefaultLocation: useDefaultLocation.checked
			});
		};

		form.addEventListener('submit', (event) => {
			event.preventDefault();
			submitCreate();
		});

		cancelButton.addEventListener('click', () => {
			vscode.postMessage({ type: 'cancel' });
		});

		closeButton.addEventListener('click', () => {
			vscode.postMessage({ type: 'cancel' });
		});

		helpLink.addEventListener('click', (event) => {
			event.preventDefault();
			vscode.postMessage({ type: 'openHelp' });
		});

		rvmPathButton.addEventListener('click', () => {
			vscode.postMessage({ type: 'chooseRvmPath' });
		});

		useDefaultLocation.addEventListener('change', () => {
			if (useDefaultLocation.checked) {
				locationPath.textContent = initialDefaultPath;
			} else {
				locationPath.textContent = 'Destination will be selected after clicking Finish';
			}
		});

		window.addEventListener('message', (event) => {
			const data = event.data || {};
			if (data.type === 'busy') {
				setBusy(Boolean(data.busy));
				return;
			}
			if (data.type === 'rvmPathSelected') {
				rvmPathInput.value = data.path || '';
				return;
			}
			if (data.type === 'validationError' || data.type === 'createError') {
				message.textContent = data.message || 'Unknown error';
			}
		});
	</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function getNonce(length: number = 24): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let i = 0; i < length; i++) {
		nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
	}
	return nonce;
}

function getDefaultProjectDestination(): string | undefined {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (workspaceFolder && fs.existsSync(workspaceFolder)) {
		return workspaceFolder;
	}

	const home = os.homedir();
	if (home && fs.existsSync(home)) {
		return home;
	}

	return undefined;
}

async function setWorkspaceConfigVariable(
	varName: string,
	value: string,
	options?: { quoted?: boolean; comment?: string }
): Promise<boolean> {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		vscode.window.showErrorMessage('No hay workspace abierto');
		return false;
	}

	const configPath = findConfigFileInWorkspace(workspaceFolder.uri.fsPath);
	if (!configPath) {
		vscode.window.showErrorMessage('No se encontró devcpc.conf en el workspace');
		return false;
	}

	setConfigVariableInFile(configPath, varName, value, options);
	return true;
}

function setConfigVariableInFile(
	configPath: string,
	varName: string,
	value: string,
	options?: { quoted?: boolean; comment?: string }
): void {
	if (!fs.existsSync(configPath)) {
		return;
	}

	const quoted = Boolean(options?.quoted);
	const escapedValue = quoted
		? value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
		: value;
	const valueText = quoted ? `"${escapedValue}"` : escapedValue;
	const line = `${varName}=${valueText}`;
	const content = fs.readFileSync(configPath, 'utf8');
	const varRegex = new RegExp(`^\\s*#?\\s*${escapeRegExp(varName)}\\s*=.*$`, 'm');

	if (varRegex.test(content)) {
		const updated = content.replace(varRegex, line);
		fs.writeFileSync(configPath, updated, 'utf8');
		return;
	}

	const separator = content.endsWith('\n') ? '' : '\n';
	const commentLine = options?.comment ? `\n# ${options.comment}` : '';
	const updated = `${content}${separator}${commentLine}\n${line}\n`;
	fs.writeFileSync(configPath, updated, 'utf8');
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function setProjectCpcModel(projectPath: string, cpcModel: '464' | '664' | '6128'): Promise<void> {
	const confPath = path.join(projectPath, 'devcpc.conf');
	if (!fs.existsSync(confPath)) {
		return;
	}

	setConfigVariableInFile(confPath, 'CPC_MODEL', cpcModel, {
		comment: 'Modelo de CPC (464, 664, 6128)'
	});
}

async function setProjectRvmPath(projectPath: string, rvmPath: string): Promise<void> {
	const confPath = path.join(projectPath, 'devcpc.conf');
	if (!fs.existsSync(confPath)) {
		return;
	}

	setConfigVariableInFile(confPath, 'RVM_PATH', rvmPath, {
		quoted: true,
		comment: 'Ruta al emulador Retro Virtual Machine'
	});
}

function validateProjectName(rawName: string, targetFolder: string): string | null {
	const name = rawName.trim();
	if (!name) {
		return 'Project name is required';
	}
	if (name !== rawName) {
		return 'Avoid leading or trailing spaces';
	}
	if (/[\\/:*?"<>|]/.test(name)) {
		return 'The name contains invalid path characters';
	}

	const targetPath = path.join(targetFolder, name);
	if (fs.existsSync(targetPath)) {
		return 'A folder with that name already exists';
	}

	return null;
}

function runDevCpcCommand(args: string[], cwd: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn('devcpc', args, {
			cwd,
			shell: process.platform === 'win32'
		});

		let stderr = '';

		child.stderr.on('data', data => {
			stderr += data.toString();
		});

		child.on('error', error => {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				reject(new Error('Command "devcpc" is not available in PATH'));
				return;
			}
			reject(error);
		});

		child.on('close', code => {
			if (code === 0) {
				resolve();
				return;
			}

			const message = stderr.trim() || `devcpc exited with code ${code}`;
			reject(new Error(message));
		});
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
