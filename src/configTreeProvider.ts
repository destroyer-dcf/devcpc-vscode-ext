'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class ConfigTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'section' | 'variable',
        public readonly varName?: string,
        public readonly value?: string,
        public readonly isEnabled?: boolean,
        public readonly lineNumber?: number,
        public readonly configPath?: string
    ) {
        super(label, collapsibleState);

        if (type === 'variable') {
            this.contextValue = 'configVariable';
            this.iconPath = new vscode.ThemeIcon(
                isEnabled ? 'check' : 'circle-slash',
                isEnabled ? undefined : new vscode.ThemeColor('disabledForeground')
            );
            this.description = value || '(vacío)';
            this.tooltip = `${varName}\n${isEnabled ? 'Habilitado' : 'Deshabilitado'}\nValor: ${value || '(vacío)'}`;
            
            this.command = {
                command: 'devcpc.editConfigVariable',
                title: 'Editar Variable',
                arguments: [this]
            };
        } else {
            this.contextValue = 'configSection';
            this.iconPath = new vscode.ThemeIcon('folder');
        }
    }
}

export class ConfigTreeProvider implements vscode.TreeDataProvider<ConfigTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ConfigTreeItem | undefined | null | void> = new vscode.EventEmitter<ConfigTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ConfigTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private workspaceRoot: string | undefined;

    constructor() {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        
        // Observar cambios en devcpc.conf
        const watcher = vscode.workspace.createFileSystemWatcher('**/devcpc.conf');
        watcher.onDidChange(() => this.refresh());
        watcher.onDidCreate(() => this.refresh());
        watcher.onDidDelete(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ConfigTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ConfigTreeItem): Thenable<ConfigTreeItem[]> {
        if (!this.workspaceRoot) {
            vscode.window.showInformationMessage('No hay workspace abierto');
            return Promise.resolve([]);
        }

        const configPath = this.findConfigPath(this.workspaceRoot);
        if (!configPath) {
            return Promise.resolve([]);
        }

        if (!element) {
            // Nivel raíz: mostrar secciones
            return Promise.resolve(this.getSections(configPath));
        } else {
            // Nivel de sección: mostrar variables
            return Promise.resolve(this.getVariablesFromSection(configPath, element.label));
        }
    }

    private findConfigPath(rootPath: string): string | undefined {
        // Buscar devcpc.conf en el workspace
        const configPath = path.join(rootPath, 'devcpc.conf');
        if (fs.existsSync(configPath)) {
            return configPath;
        }

        // Buscar en subdirectorios (test/my-game, etc.)
        const testPath = path.join(rootPath, 'test', 'my-game', 'devcpc.conf');
        if (fs.existsSync(testPath)) {
            return testPath;
        }

        return undefined;
    }

    private getSections(configPath: string): ConfigTreeItem[] {
        const content = fs.readFileSync(configPath, 'utf8');
        const lines = content.split('\n');
        const sections: ConfigTreeItem[] = [];
        const sectionMap = new Map<string, boolean>();

        let currentSection = 'General';
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Detectar cabeceras de sección
            if (trimmed.startsWith('# ===')) {
                const nextLine = lines[lines.indexOf(line) + 1];
                if (nextLine && nextLine.trim().startsWith('#')) {
                    currentSection = nextLine.trim().substring(1).trim();
                    if (!sectionMap.has(currentSection)) {
                        sectionMap.set(currentSection, true);
                    }
                }
            }
        }

        // Crear items de sección
        sectionMap.forEach((_, sectionName) => {
            sections.push(new ConfigTreeItem(
                sectionName,
                vscode.TreeItemCollapsibleState.Collapsed,
                'section'
            ));
        });

        return sections;
    }

    private getVariablesFromSection(configPath: string, sectionName: string): ConfigTreeItem[] {
        const content = fs.readFileSync(configPath, 'utf8');
        const lines = content.split('\n');
        const variables: ConfigTreeItem[] = [];
        
        let inSection = false;
        let currentSection = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Detectar inicio de sección
            if (trimmed.startsWith('# ===')) {
                const nextLine = lines[i + 1];
                if (nextLine && nextLine.trim().startsWith('#')) {
                    currentSection = nextLine.trim().substring(1).trim();
                    inSection = (currentSection === sectionName);
                }
                continue;
            }

            // Si estamos en la sección correcta, buscar variables
            if (inSection && trimmed) {
                const isCommented = trimmed.startsWith('#');
                const cleanLine = isCommented ? trimmed.substring(1).trim() : trimmed;

                // Detectar variables (formato VAR=VALUE)
                const match = cleanLine.match(/^([A-Z_]+)=(.*)$/);
                if (match) {
                    const varName = match[1];
                    let value = match[2].trim();
                    
                    // Limpiar comillas
                    value = value.replace(/^["']|["']$/g, '');

                    variables.push(new ConfigTreeItem(
                        varName,
                        vscode.TreeItemCollapsibleState.None,
                        'variable',
                        varName,
                        value,
                        !isCommented,
                        i,
                        configPath
                    ));
                }
            }

            // Salir de la sección si encontramos otra cabecera
            if (inSection && trimmed.startsWith('# ===')) {
                inSection = false;
            }
        }

        return variables;
    }
}
