'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import { ConfigTreeItem } from './configTreeProvider';

export class ConfigTreeCommands {

    /**
     * Comando para editar una variable desde el tree view
     */
    public static async editConfigVariable(item: ConfigTreeItem): Promise<void> {
        if (!item.configPath || item.lineNumber === undefined) {
            return;
        }

        const varName = item.varName || '';
        const currentValue = item.value || '';
        const isEnabled = item.isEnabled;

        // Crear QuickPick con opciones
        const quickPick = vscode.window.createQuickPick();
        quickPick.title = `Configurar ${varName}`;
        quickPick.placeholder = isEnabled ? 'Editar valor o deshabilitar' : 'Habilitar o cambiar valor';
        
        const items: Array<vscode.QuickPickItem & { action: string }> = [
            {
                label: `$(edit) Cambiar valor`,
                description: `Actual: ${currentValue || '(vacío)'}`,
                action: 'edit'
            },
            {
                label: isEnabled ? '$(circle-slash) Deshabilitar' : '$(check) Habilitar',
                description: isEnabled ? 'Comentar esta variable' : 'Descomentar esta variable',
                action: 'toggle'
            }
        ];

        quickPick.items = items;
        
        quickPick.onDidAccept(async () => {
            const selected = quickPick.selectedItems[0] as any;
            quickPick.hide();

            if (selected.action === 'edit') {
                await ConfigTreeCommands.editValue(item.configPath!, item.lineNumber!, varName, currentValue, isEnabled);
            } else if (selected.action === 'toggle') {
                await ConfigTreeCommands.toggleVariable(item.configPath!, item.lineNumber!, isEnabled);
            }
        });

        quickPick.show();
    }

    /**
     * Editar el valor de una variable
     */
    private static async editValue(configPath: string, lineNumber: number, varName: string, currentValue: string, isEnabled?: boolean): Promise<void> {
        const newValue = await vscode.window.showInputBox({
            prompt: `Nuevo valor para ${varName}`,
            value: currentValue,
            placeHolder: 'Introduce el nuevo valor',
            validateInput: (value) => {
                if (varName.includes('LEVEL') && value && !/^\d+$/.test(value)) {
                    return 'Debe ser un número';
                }
                if (varName === 'CPC_MODEL' && value && !['464', '664', '6128'].includes(value)) {
                    return 'Debe ser 464, 664 o 6128';
                }
                if (varName === 'MODE' && value && !['0', '1', '2'].includes(value)) {
                    return 'Debe ser 0, 1 o 2';
                }
                return null;
            }
        });

        if (newValue === undefined) {
            return;
        }

        // Leer el archivo
        const content = fs.readFileSync(configPath, 'utf8');
        const lines = content.split('\n');

        // Determinar si necesita comillas
        const needsQuotes = newValue.includes(' ') || newValue.includes('/') || 
                           varName.includes('PATH') || varName.includes('NAME') || 
                           varName.includes('FILE') || varName.includes('DIR') ||
                           varName.includes('DSK') || varName.includes('CDT') || 
                           varName.includes('CPR') || varName.includes('RVM');

        const formattedValue = needsQuotes && newValue !== '' ? `"${newValue}"` : newValue;
        const prefix = isEnabled ? '' : '# ';
        const newLine = `${prefix}${varName}=${formattedValue}`;

        // Reemplazar la línea
        lines[lineNumber] = newLine;

        // Guardar el archivo
        fs.writeFileSync(configPath, lines.join('\n'), 'utf8');

        vscode.window.showInformationMessage(`${varName} actualizado a: ${newValue || '(vacío)'}`);
    }

    /**
     * Habilitar/deshabilitar una variable (comentar/descomentar)
     */
    public static async toggleVariable(configPath: string, lineNumber: number, isCurrentlyEnabled?: boolean): Promise<void> {
        // Leer el archivo
        const content = fs.readFileSync(configPath, 'utf8');
        const lines = content.split('\n');
        const line = lines[lineNumber];

        let newLine: string;
        
        if (isCurrentlyEnabled) {
            // Deshabilitar: añadir #
            newLine = '# ' + line.trim();
        } else {
            // Habilitar: quitar #
            const trimmed = line.trim();
            if (trimmed.startsWith('#')) {
                newLine = trimmed.substring(1).trim();
            } else {
                newLine = line;
            }
        }

        // Reemplazar la línea
        lines[lineNumber] = newLine;

        // Guardar el archivo
        fs.writeFileSync(configPath, lines.join('\n'), 'utf8');

        const action = isCurrentlyEnabled ? 'deshabilitada' : 'habilitada';
        vscode.window.showInformationMessage(`Variable ${action}`);
    }
}
