'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as devCpcEmulator from './devCpcEmulator';
import { ConfigValues, findConfigFileInWorkspace, parseConfigFile } from './configUtils';

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
    console.log('[EmulatorLauncher] isEmulatorActive:', devCpcEmulator.isEmulatorActive());
    
    // Inicializar el emulador si no está activo
    if (!devCpcEmulator.isEmulatorActive()) {
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
        if (options?.resetBeforeLoad && devCpcEmulator.isEmulatorActive()) {
            console.log('[EmulatorLauncher] Reset antes de run (integrated)');
            devCpcEmulator.resetEmulator();
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        console.log('[EmulatorLauncher] Cargando archivo:', binaryPath);
        await devCpcEmulator.loadBinaryInEmulator(binaryPath);
        const runFile = config['RUN_FILE'];
        if (runFile) {
            // Tras reset+load el firmware tarda más en aceptar teclado; si no, se comen los primeros chars.
            const runFileDelayMs = options?.resetBeforeLoad ? 1200 : 400;
            await new Promise(resolve => setTimeout(resolve, runFileDelayMs));
            devCpcEmulator.sendRunFileToEmulator(runFile);
        }
    } else {
        console.log('[EmulatorLauncher] No hay archivo para cargar');
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
