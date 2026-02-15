'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface EmulatorState {
    panel: vscode.WebviewPanel;
    ready: boolean;
}

let state: EmulatorState | null = null;

/**
 * Inicializar el emulador integrado CPC
 */
export async function initEmulator(context: vscode.ExtensionContext): Promise<void> {
    if (state) {
        // Ya existe, solo hacer foco
        state.panel.reveal(vscode.ViewColumn.Beside, true);
        return;
    }

    await setupEmulator(context);
}

/**
 * Configurar el WebView Panel con el emulador
 */
async function setupEmulator(context: vscode.ExtensionContext): Promise<void> {
    const mediaPath = vscode.Uri.file(path.join(context.extensionPath, 'media'));
    
    const panel = vscode.window.createWebviewPanel(
        'devcpc_emu',
        'DevCPC - Amstrad CPC',
        {
            viewColumn: vscode.ViewColumn.Beside,
            preserveFocus: true,
        },
        {
            enableScripts: true,
            enableForms: false,
            retainContextWhenHidden: true,
            localResourceRoots: [mediaPath],
        }
    );

    // Icono del panel
    panel.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'media', 'cpc-logo-small.png'));

    // Cleanup al cerrar
    panel.onDidDispose(() => {
        state = null;
    });

    // Recibir mensajes del emulador
    panel.webview.onDidReceiveMessage((msg) => {
        if (msg.command === 'emu_ready') {
            if (state) {
                state.ready = msg.isReady;
                vscode.window.showInformationMessage('Emulador CPC listo');
            }
        } else if (msg.command === 'emu_error') {
            vscode.window.showErrorMessage(`Emulador: ${msg.error}`);
        }
    });

    // Cargar el HTML del emulador
    const emuUri = panel.webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'media', 'cpc-ui.js'))
    );
    const shellUri = panel.webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'media', 'shell.js'))
    );

    // Leer template HTML
    const shellHtmlPath = path.join(context.extensionPath, 'media', 'shell.html');
    let html = fs.readFileSync(shellHtmlPath, 'utf8');
    
    // Reemplazar placeholders
    html = html.replace('{{{emu}}}', emuUri.toString()).replace('{{{shell}}}', shellUri.toString());
    
    panel.webview.html = html;

    state = { panel, ready: false };
}

/**
 * Cargar un archivo binario en el emulador
 */
export async function loadBinaryInEmulator(binPath: string): Promise<void> {
    if (!state || !state.ready) {
        vscode.window.showWarningMessage('Emulador no está listo. Ábrelo primero con "DevCPC: Open Integrated Emulator"');
        return;
    }

    try {
        // Leer el archivo binario
        const binData = fs.readFileSync(binPath);
        const binArray = Array.from(binData);

        // Enviar al emulador
        state.panel.webview.postMessage({
            command: 'load_binary',
            data: binArray,
            startAddress: 0x4000 // Dirección por defecto para CPC
        });

        vscode.window.showInformationMessage(`Cargado: ${path.basename(binPath)}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Error cargando binario: ${error}`);
    }
}

/**
 * Resetear el emulador
 */
export function resetEmulator(): void {
    if (!state) {
        vscode.window.showWarningMessage('Emulador no está abierto');
        return;
    }

    state.panel.webview.postMessage({ command: 'reset' });
    vscode.window.showInformationMessage('Emulador reseteado');
}

/**
 * Hacer foco en el emulador
 */
export function focusEmulator(): void {
    if (!state) {
        vscode.window.showWarningMessage('Emulador no está abierto');
        return;
    }

    state.panel.reveal(vscode.ViewColumn.Beside, false);
}

/**
 * Cerrar el emulador
 */
export function closeEmulator(): void {
    if (state) {
        state.panel.dispose();
        state = null;
    }
}

/**
 * Verificar si el emulador está activo
 */
export function isEmulatorActive(): boolean {
    return state !== null;
}
