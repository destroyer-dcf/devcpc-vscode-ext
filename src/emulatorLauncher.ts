'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, execSync } from 'child_process';
import * as devCpcEmulator from './devCpcEmulator';
import { ConfigValues, findConfigFileInWorkspace, parseConfigFile, resolveConfigPath } from './configUtils';

interface LaunchOptions {
    resetBeforeLoad?: boolean;
}

/**
 * Lanzar el emulador según la configuración EMULATOR_TYPE
 */
export async function launchEmulator(context: vscode.ExtensionContext, binaryPath?: string, options?: LaunchOptions): Promise<void> {
    console.log('[EmulatorLauncher] launchEmulator called with binaryPath:', binaryPath);
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No hay workspace abierto');
        return;
    }

    const configPath = findConfigFileInWorkspace(workspaceFolder.uri.fsPath);
    let config: ConfigValues = {};
    let emulatorType = 'integrated'; // Por defecto
    
    if (configPath) {
        console.log('[EmulatorLauncher] Config path:', configPath);
        config = parseConfigFile(configPath);
        emulatorType = config['EMULATOR_TYPE']?.toLowerCase() || 'integrated';
    } else {
        console.log('[EmulatorLauncher] No se encontró devcpc.conf en la raíz del workspace');
    }

    // Detectar si el archivo es DSK o CDT
    if (binaryPath) {
        const ext = path.extname(binaryPath).toLowerCase();
        console.log('[EmulatorLauncher] File extension:', ext);
        
        if (ext === '.dsk') {
            console.log('[EmulatorLauncher] DSK file detected - will be loaded using kcide_load_dsk');
        } else if (ext === '.cdt') {
            console.log('[EmulatorLauncher] CDT file detected');
        }
    }

    console.log('[EmulatorLauncher] EMULATOR_TYPE:', emulatorType);

    if (emulatorType === 'rvm') {
        console.log('[EmulatorLauncher] Lanzando RVM...');
        await launchRvmEmulator(config, binaryPath);
    } else if (emulatorType === 'integrated') {
        console.log('[EmulatorLauncher] Lanzando emulador integrado...');
        await launchIntegratedEmulator(context, config, binaryPath, options);
    } else {
        vscode.window.showErrorMessage(`Tipo de emulador desconocido: ${emulatorType}`);
    }
}

/**
 * Lanzar el emulador RVM (externo)
 */
async function launchRvmEmulator(config: ConfigValues, binaryPath?: string): Promise<void> {
    const rvmPath = config['RVM_PATH'];
    if (!rvmPath) {
        vscode.window.showErrorMessage('RVM_PATH no está definido en devcpc.conf');
        return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return;
    }

    // Construir el comando RVM
    let command = rvmPath;
    
    if (binaryPath) {
        // Si hay un binario, cargarlo
        command += ` "${binaryPath}"`;
    }

    // Ejecutar en un terminal
    const terminal = vscode.window.createTerminal({
        name: 'RVM Emulator',
        cwd: workspaceFolder.uri.fsPath
    });
    
    terminal.show();
    terminal.sendText(command);
    
    vscode.window.showInformationMessage('Emulador RVM lanzado');
}

/**
 * Lanzar el emulador integrado (KC CPC)
 */
async function launchIntegratedEmulator(context: vscode.ExtensionContext, config: ConfigValues, binaryPath?: string, options?: LaunchOptions): Promise<void> {
    console.log('[EmulatorLauncher] launchIntegratedEmulator called');
    console.log('[EmulatorLauncher] binaryPath:', binaryPath);
    const wasActiveBeforeLaunch = devCpcEmulator.isEmulatorActive();
    console.log('[EmulatorLauncher] isEmulatorActive:', wasActiveBeforeLaunch);
    
    // Si vamos a cargar un binario y el emulador se va a abrir ahora, bloquear la auto-carga al abrir.
    if (binaryPath && !wasActiveBeforeLaunch) {
        devCpcEmulator.setExternalLoadPending(true);
    }

    try {
        // Inicializar el emulador si no está activo
        if (!wasActiveBeforeLaunch) {
            console.log('[EmulatorLauncher] Inicializando emulador...');
            await devCpcEmulator.initEmulator(context);
            
            // Esperar a que esté listo si hay un binario para cargar
            if (binaryPath) {
                console.log('[EmulatorLauncher] Esperando 2 segundos para que el emulador esté listo...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } else {
            console.log('[EmulatorLauncher] Emulador ya está activo');
        }

        // Cargar el binario si se proporcionó
        if (binaryPath) {
            // Si el emulador ya estaba activo, ahora sí bloqueamos auto-run paralelo.
            if (wasActiveBeforeLaunch) {
                devCpcEmulator.setExternalLoadPending(true);
            }

            const shouldResetBeforeLoad = Boolean(options?.resetBeforeLoad && wasActiveBeforeLaunch);
            if (shouldResetBeforeLoad) {
                console.log('[EmulatorLauncher] Reset antes de run (integrated)');
                devCpcEmulator.resetEmulator();
                await new Promise(resolve => setTimeout(resolve, 250));
            }
            console.log('[EmulatorLauncher] Cargando archivo:', binaryPath);
            await devCpcEmulator.loadBinaryInEmulator(binaryPath);
            const runFile = config['RUN_FILE'];
            const cpcModel = config['CPC_MODEL'];
            const isCdt = path.extname(binaryPath).toLowerCase() === '.cdt';
            console.log('[EmulatorLauncher] RUN_FILE from config:', runFile, '| CPC_MODEL:', cpcModel);
            if (runFile || (cpcModel || '').trim() === '464' || isCdt) {
                // Tras reset+load el firmware tarda más en aceptar teclado; si no, se comen los primeros chars.
                const runFileDelayMs = shouldResetBeforeLoad ? 1200 : 600;
                console.log('[EmulatorLauncher] Esperando', runFileDelayMs, 'ms antes de ejecutar RUN_FILE...');
                await new Promise(resolve => setTimeout(resolve, runFileDelayMs));
                devCpcEmulator.sendRunFileToEmulator(runFile, cpcModel, binaryPath);
            } else {
                console.log('[EmulatorLauncher] No RUN_FILE configurado en devcpc.conf');
            }
        } else {
            console.log('[EmulatorLauncher] No hay archivo para cargar');
        }
    } finally {
        if (binaryPath) {
            devCpcEmulator.setExternalLoadPending(false);
        }
    }
}

/**
 * Comando para ejecutar/lanzar emulador con un archivo
 */
export async function runInEmulator(context: vscode.ExtensionContext, filePath?: string): Promise<void> {
    let binaryPath = filePath;

    // Si no se proporciona ruta, preguntar al usuario
    if (!binaryPath) {
        const result = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: {
                'CPC Files': ['bin', 'dsk', 'cdt', 'sna'],
                'All Files': ['*']
            },
            title: 'Selecciona el archivo a ejecutar'
        });

        if (result && result[0]) {
            binaryPath = result[0].fsPath;
        } else {
            return;
        }
    }

    await launchEmulator(context, binaryPath);
}

/**
 * Lanzar RVM directamente con un modelo CPC específico,
 * usando la ruta configurada en los settings de VS Code (devcpc.rvm.path).
 */
export async function launchRvmWithModel(context: vscode.ExtensionContext, model: '464' | '664' | '6128'): Promise<void> {
    const settings = vscode.workspace.getConfiguration('devcpc');
    const rvmPath = settings.get<string>('rvm.path', '').trim();
    const killExisting = settings.get<boolean>('rvm.killExistingInstance', true);

    if (!rvmPath) {
        const answer = await vscode.window.showErrorMessage(
            'No se ha configurado la ruta de Retro Virtual Machine.',
            'Abrir Configuración'
        );
        if (answer === 'Abrir Configuración') {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'devcpc.rvm.path');
        }
        return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const configPath = workspaceFolder ? findConfigFileInWorkspace(workspaceFolder.uri.fsPath) : undefined;
    const workspaceConfig: ConfigValues = configPath ? parseConfigFile(configPath) : {};

    // Para 464 preferir CDT, para el resto DSK
    const preferCdt = model === '464';
    const distDir = workspaceConfig.DIST_DIR && configPath
        ? resolveConfigPath(configPath, workspaceConfig.DIST_DIR)
        : undefined;

    let binaryPath: string | undefined;

    if (preferCdt && distDir && workspaceConfig.CDT) {
        const cdtPath = path.join(distDir, workspaceConfig.CDT);
        if (fs.existsSync(cdtPath)) { binaryPath = cdtPath; }
    }
    if (!binaryPath && distDir && workspaceConfig.DSK) {
        const dskPath = path.join(distDir, workspaceConfig.DSK);
        if (fs.existsSync(dskPath)) { binaryPath = dskPath; }
    }
    if (!binaryPath && distDir && workspaceConfig.CDT) {
        const cdtPath = path.join(distDir, workspaceConfig.CDT);
        if (fs.existsSync(cdtPath)) { binaryPath = cdtPath; }
    }

    const args = [`-b=cpc${model}`];

    if (killExisting) {
        try {
            if (process.platform === 'win32') {
                const execName = path.basename(rvmPath);
                execSync(`taskkill /F /IM "${execName}" /T 2>nul`, { shell: 'cmd.exe', stdio: 'pipe' });
            } else {
                // pkill -9 -f busca por ruta completa en la línea de comandos del proceso
                execSync(`pkill -9 -f "${rvmPath}"`, { stdio: 'pipe' });
            }
            // Delay para que el SO libere recursos antes de relanzar
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (_) {
            // No había instancia previa, ignorar
        }
    }

    const child = spawn(rvmPath, args, {
        detached: true,
        stdio: 'ignore',
        cwd: workspaceFolder?.uri.fsPath
    });
    child.unref();

    vscode.window.showInformationMessage(`Lanzando RVM con CPC ${model}${binaryPath ? '' : ' (sin archivo)'}...`);
}
