'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import { ConfigTreeItem } from './configTreeProvider';

export class ConfigTreeCommands {

    /**
     * Comando para editar una variable desde el tree view
     */
    public static async editConfigVariable(item: ConfigTreeItem): Promise<void> {
        if (!item.configPath) {
            return;
        }

        const varName = item.varName || '';
        const currentValue = item.value === '(no definido)' ? '' : item.value || '';
        const isEnabled = item.isEnabled;
        const varDef = item.varDefinition;

        // Si la variable tiene opciones predefinidas, mostrarlas
        if (varDef && varDef.options && varDef.options.length > 0) {
            await ConfigTreeCommands.editWithOptions(item, varDef, currentValue, isEnabled);
        } else {
            // Si no tiene opciones, mostrar el QuickPick tradicional
            await ConfigTreeCommands.editWithQuickPick(item, varName, currentValue, isEnabled);
        }
    }

    /**
     * Editar variable con opciones predefinidas
     */
    private static async editWithOptions(item: ConfigTreeItem, varDef: any, currentValue: string, isEnabled?: boolean): Promise<void> {
        const varName = item.varName || '';
        
        const quickPick = vscode.window.createQuickPick();
        quickPick.title = `Configurar ${varName}`;
        quickPick.placeholder = varDef.description || 'Selecciona una opción';
        
        const items: Array<vscode.QuickPickItem & { value: any; action: string }> = [];
        
        // Añadir opciones predefinidas
        varDef.options.forEach((opt: any) => {
            const isCurrent = String(opt.value) === currentValue;
            items.push({
                label: isCurrent ? `$(check) ${opt.value}` : `${opt.value}`,
                description: opt.description,
                value: opt.value,
                action: 'setValue'
            });
        });
        
        // Añadir opción de toggle
        items.push({
            label: '',
            kind: vscode.QuickPickItemKind.Separator
        } as any);
        
        items.push({
            label: isEnabled ? '$(circle-slash) Deshabilitar' : '$(check) Habilitar',
            description: isEnabled ? 'Comentar esta variable' : 'Descomentar esta variable',
            value: null,
            action: 'toggle'
        });
        
        quickPick.items = items;
        
        quickPick.onDidAccept(async () => {
            const selected = quickPick.selectedItems[0] as any;
            quickPick.hide();

            if (selected.action === 'setValue') {
                await ConfigTreeCommands.updateConfigValue(item.configPath!, item.lineNumber!, varName, String(selected.value), isEnabled);
            } else if (selected.action === 'toggle') {
                await ConfigTreeCommands.toggleVariable(item.configPath!, item.lineNumber!, isEnabled);
            }
        });

        quickPick.show();
    }

    /**
     * Editar variable con input manual
     */
    private static async editWithQuickPick(item: ConfigTreeItem, varName: string, currentValue: string, isEnabled?: boolean): Promise<void> {
        if (!item.configPath || item.lineNumber === undefined || item.lineNumber < 0) {
            // Variable no existe en el archivo, necesitamos crearla
            await ConfigTreeCommands.createVariable(item, varName);
            return;
        }

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
                await ConfigTreeCommands.editValue(item.configPath!, item.lineNumber!, varName, currentValue, isEnabled, item.varDefinition);
            } else if (selected.action === 'toggle') {
                await ConfigTreeCommands.toggleVariable(item.configPath!, item.lineNumber!, isEnabled);
            }
        });

        quickPick.show();
    }

    /**
     * Crear una variable que no existe en el archivo
     */
    private static async createVariable(item: ConfigTreeItem, varName: string): Promise<void> {
        const newValue = await vscode.window.showInputBox({
            prompt: `Valor para ${varName}`,
            value: '',
            placeHolder: 'Introduce el valor para esta variable',
            validateInput: (value) => ConfigTreeCommands.validateInput(varName, value, item.varDefinition)
        });

        if (newValue === undefined) {
            return;
        }

        if (!item.configPath) {
            return;
        }

        // Añadir la variable al final del archivo
        const content = fs.readFileSync(item.configPath, 'utf8');
        const needsQuotes = ConfigTreeCommands.needsQuotes(varName, newValue);
        const formattedValue = needsQuotes && newValue !== '' ? `"${newValue}"` : newValue;
        const newLine = `${varName}=${formattedValue}`;
        
        const newContent = content + (content.endsWith('\n') ? '' : '\n') + newLine + '\n';
        fs.writeFileSync(item.configPath, newContent, 'utf8');

        vscode.window.showInformationMessage(`${varName} creado con valor: ${newValue || '(vacío)'}`);
    }

    private static validateInput(varName: string, value: string, varDef?: any): string | null {
        if (varDef) {
            if (varDef.type === 'number' && value && !/^\d+$/.test(value)) {
                return 'Debe ser un número';
            }
        }
        
        // Validaciones legacy
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

    private static needsQuotes(varName: string, value: string): boolean {
        return value.includes(' ') || value.includes('/') || 
               varName.includes('PATH') || varName.includes('NAME') || 
               varName.includes('FILE') || varName.includes('DIR') ||
               varName.includes('DSK') || varName.includes('CDT') || 
               varName.includes('CPR') || varName.includes('RVM');
    }

    /**
     * Editar el valor de una variable
     */
    /**
     * Editar el valor de una variable con input manual
     */
    private static async editValue(configPath: string, lineNumber: number, varName: string, currentValue: string, isEnabled?: boolean, varDef?: any): Promise<void> {
        const newValue = await vscode.window.showInputBox({
            prompt: varDef?.description || `Nuevo valor para ${varName}`,
            value: currentValue,
            placeHolder: 'Introduce el nuevo valor',
            validateInput: (value) => ConfigTreeCommands.validateInput(varName, value, varDef)
        });

        if (newValue === undefined) {
            return;
        }

        await ConfigTreeCommands.updateConfigValue(configPath, lineNumber, varName, newValue, isEnabled);
    }

    /**
     * Actualizar el valor de una variable en el archivo
     */
    private static async updateConfigValue(configPath: string, lineNumber: number, varName: string, newValue: string, isEnabled?: boolean): Promise<void> {
        // Validar que existe el archivo
        if (!fs.existsSync(configPath)) {
            vscode.window.showErrorMessage('Archivo de configuración no encontrado');
            return;
        }

        // Leer el archivo
        const content = fs.readFileSync(configPath, 'utf8');
        const lines = content.split('\n');

        // Validar que el lineNumber está dentro del rango
        if (lineNumber < 0 || lineNumber >= lines.length) {
            vscode.window.showErrorMessage('Número de línea inválido. Intenta refrescar la configuración.');
            return;
        }

        // Determinar si necesita comillas
        const needsQuotes = ConfigTreeCommands.needsQuotes(varName, newValue);
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
     * Si lineNumber es -1, crea la variable en el archivo
     */
    public static async toggleVariable(configPath: string, lineNumber: number, isCurrentlyEnabled?: boolean, varName?: string, varDef?: any): Promise<void> {
        console.log(`toggleVariable called: configPath=${configPath}, lineNumber=${lineNumber}, isEnabled=${isCurrentlyEnabled}, varName=${varName}`);
        
        // Validar que existe el archivo
        if (!fs.existsSync(configPath)) {
            vscode.window.showErrorMessage('Archivo de configuración no encontrado');
            return;
        }

        // Si la variable no existe en el archivo (lineNumber = -1), crearla
        if (lineNumber < 0) {
            if (!varName) {
                vscode.window.showErrorMessage('No se puede crear la variable sin nombre');
                return;
            }
            await ConfigTreeCommands.createVariableInConfig(configPath, varName, varDef);
            return;
        }

        // Leer el archivo
        const content = fs.readFileSync(configPath, 'utf8');
        const lines = content.split('\n');
        
        console.log(`Total lines in file: ${lines.length}`);
        console.log(`Line ${lineNumber} content: "${lines[lineNumber]}"`);
        
        // Validar que el lineNumber está dentro del rango
        if (lineNumber >= lines.length) {
            vscode.window.showErrorMessage(`Número de línea inválido (${lineNumber}/${lines.length}). Intenta refrescar la configuración.`);
            return;
        }

        const line = lines[lineNumber];
        
        // Validar que la línea existe y no es undefined
        if (line === undefined) {
            vscode.window.showErrorMessage('La línea no existe. Intenta refrescar la configuración.');
            return;
        }

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

        console.log(`Replacing line ${lineNumber}: "${line}" -> "${newLine}"`);

        // Reemplazar la línea
        lines[lineNumber] = newLine;

        // Guardar el archivo
        fs.writeFileSync(configPath, lines.join('\n'), 'utf8');

        const action = isCurrentlyEnabled ? 'deshabilitada' : 'habilitada';
        vscode.window.showInformationMessage(`Variable ${action}`);
    }

    /**
     * Crear una variable nueva en el archivo de configuración
     */
    private static async createVariableInConfig(configPath: string, varName: string, varDef?: any): Promise<void> {
        // Pedir valor al usuario
        const defaultValue = varDef?.options?.[0]?.value || '';
        
        let newValue: string | undefined;
        
        if (varDef && varDef.options && varDef.options.length > 0) {
            // Si tiene opciones, mostrar QuickPick
            const items: Array<vscode.QuickPickItem & { value: string }> = varDef.options.map((opt: any) => ({
                label: String(opt.value),
                description: opt.description,
                value: String(opt.value)
            }));
            
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `Selecciona valor para ${varName}`
            });
            
            if (selected) {
                newValue = selected.value;
            }
        } else {
            // Si no tiene opciones, mostrar InputBox
            newValue = await vscode.window.showInputBox({
                prompt: varDef?.description || `Valor para ${varName}`,
                value: String(defaultValue),
                placeHolder: 'Introduce el valor para esta variable',
                validateInput: (value) => ConfigTreeCommands.validateInput(varName, value, varDef)
            });
        }

        if (newValue === undefined) {
            return;
        }

        // Añadir la variable al final del archivo
        const content = fs.readFileSync(configPath, 'utf8');
        const needsQuotes = ConfigTreeCommands.needsQuotes(varName, newValue);
        const formattedValue = needsQuotes && newValue !== '' ? `"${newValue}"` : newValue;
        const newLine = `${varName}=${formattedValue}`;
        
        const newContent = content + (content.endsWith('\n') ? '' : '\n') + newLine + '\n';
        fs.writeFileSync(configPath, newContent, 'utf8');

        vscode.window.showInformationMessage(`${varName} creada con valor: ${newValue}`);
    }
}
