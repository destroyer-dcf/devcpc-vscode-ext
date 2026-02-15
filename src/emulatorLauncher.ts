'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as devCpcEmulator from './devCpcEmulator';

interface ConfigValues {
    [key: string]: string | undefined;
}

/**
 * Cargar y parsear el archivo devcpc.conf
 */
function parseConfigFile(configPath: string): ConfigValues {
    const values: ConfigValues = {};
    
    if (!fs.existsSync(configPath)) {
        return values;
    }

    const content = fs.readFileSync(configPath, 'utf8');
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        
        // Ignorar líneas vacías
        if (!trimmed) continue;
        
        // Variables habilitadas
        if (trimmed.includes('=') && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            const value = valueParts.join('=').trim();
            values[key.trim()] = value;
        }
    }

    return values;
}

/**
 * Buscar el archivo devcpc.conf en el workspace
 */
function findConfigPath(rootPath: string): string | undefined {
    // Buscar devcpc.conf en el workspace (raíz primero)
    const configPath = path.join(rootPath, 'devcpc.conf');
    if (fs.existsSync(configPath)) {
        return configPath;
    }

    // Buscar recursivamente en subdirectorios (hasta 2 niveles)
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
        console.error('Error buscando devcpc.conf:', error);
    }

    return undefined;
}

/**
 * Lanzar el emulador según la configuración EMULATOR_TYPE
 */
export async function launchEmulator(context: vscode.ExtensionContext, binaryPath?: string): Promise<void> {
    console.log('[EmulatorLauncher] launchEmulator called with binaryPath:', binaryPath);
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No hay workspace abierto');
        return;
    }

    const configPath = findConfigPath(workspaceFolder.uri.fsPath);
    if (!configPath) {
        console.log('[EmulatorLauncher] No se encontró devcpc.conf, usando emulador integrado por defecto');
        await launchIntegratedEmulator(context, binaryPath);
        return;
    }

    console.log('[EmulatorLauncher] Config path:', configPath);

    const config = parseConfigFile(configPath);
    const emulatorType = config['EMULATOR_TYPE']?.toLowerCase() || 'integrated';

    console.log('[EmulatorLauncher] EMULATOR_TYPE:', emulatorType);

    if (emulatorType === 'rvm') {
        console.log('[EmulatorLauncher] Lanzando RVM...');
        await launchRvmEmulator(config, binaryPath);
    } else if (emulatorType === 'integrated') {
        console.log('[EmulatorLauncher] Lanzando emulador integrado...');
        await launchIntegratedEmulator(context, binaryPath);
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
async function launchIntegratedEmulator(context: vscode.ExtensionContext, binaryPath?: string): Promise<void> {
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
        console.log('[EmulatorLauncher] Cargando archivo:', binaryPath);
        await devCpcEmulator.loadBinaryInEmulator(binaryPath);
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
