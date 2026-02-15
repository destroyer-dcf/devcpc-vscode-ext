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
            return Promise.resolve([
                new ConfigTreeItem(
                    'No hay workspace abierto',
                    vscode.TreeItemCollapsibleState.None,
                    'section'
                )
            ]);
        }

        const configPath = this.findConfigPath(this.workspaceRoot);
        if (!configPath) {
            return Promise.resolve([
                new ConfigTreeItem(
                    'No se encontró devcpc.conf',
                    vscode.TreeItemCollapsibleState.None,
                    'section'
                )
            ]);
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
        // Buscar devcpc.conf en el workspace (raíz primero)
        const configPath = path.join(rootPath, 'devcpc.conf');
        if (fs.existsSync(configPath)) {
            return configPath;
        }

        // Buscar recursivamente en subdirectorios (hasta 2 niveles)
        try {
            const dirs = fs.readdirSync(rootPath, { withFileTypes: true });
            for (const dir of dirs) {
                if (dir.isDirectory() && !dir.name.startsWith('.') && dir.name !== 'node_modules') {
                    const subPath = path.join(rootPath, dir.name, 'devcpc.conf');
                    if (fs.existsSync(subPath)) {
                        return subPath;
                    }
                    
                    // Buscar un nivel más profundo
                    try {
                        const subDirs = fs.readdirSync(path.join(rootPath, dir.name), { withFileTypes: true });
                        for (const subDir of subDirs) {
                            if (subDir.isDirectory() && !subDir.name.startsWith('.')) {
                                const deepPath = path.join(rootPath, dir.name, subDir.name, 'devcpc.conf');
                                if (fs.existsSync(deepPath)) {
                                    return deepPath;
                                }
                            }
                        }
                    } catch (e) {
                        // Ignorar errores de permisos
                    }
                }
            }
        } catch (e) {
            // Ignorar errores de permisos
        }

        return undefined;
    }

    private getSections(configPath: string): ConfigTreeItem[] {
        const content = fs.readFileSync(configPath, 'utf8');
        const lines = content.split('\n');
        const sections: ConfigTreeItem[] = [];
        const sectionMap = new Map<string, boolean>();

        // Primera sección por defecto (antes de cualquier cabecera)
        sectionMap.set('General', true);
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            
            // Detectar cabeceras de sección: # ============
            if (trimmed.startsWith('# ===') || trimmed.startsWith('# ====')) {
                // Buscar la línea siguiente que contiene el nombre de la sección
                if (i + 1 < lines.length) {
                    const nextLine = lines[i + 1].trim();
                    if (nextLine.startsWith('#') && !nextLine.startsWith('# ===')) {
                        // Es el nombre de la sección
                        const sectionName = nextLine.substring(1).trim();
                        if (!sectionMap.has(sectionName)) {
                            sectionMap.set(sectionName, true);
                        }
                    }
                }
            }
        }

        // Crear items de sección
        sectionMap.forEach((_, sectionName) => {
            sections.push(new ConfigTreeItem(
                sectionName,
                vscode.TreeItemCollapsibleState.Expanded,
                'section'
            ));
        });

        return sections;
    }

    private getVariablesFromSection(configPath: string, sectionName: string): ConfigTreeItem[] {
        const content = fs.readFileSync(configPath, 'utf8');
        const lines = content.split('\n');
        const variables: ConfigTreeItem[] = [];
        
        let inSection = (sectionName === 'General'); // General es la sección inicial
        let currentSection = 'General';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Detectar inicio de sección: # ==== seguido de nombre
            if (trimmed.startsWith('# ===') || trimmed.startsWith('# ====')) {
                if (i + 1 < lines.length) {
                    const nextLine = lines[i + 1].trim();
                    if (nextLine.startsWith('#') && !nextLine.startsWith('# ===')) {
                        currentSection = nextLine.substring(1).trim();
                        inSection = (currentSection === sectionName);
                    }
                }
                continue;
            }

            // Saltar líneas vacías y comentarios puros
            if (!trimmed || (trimmed.startsWith('#') && !trimmed.includes('='))) {
                continue;
            }

            // Si estamos en la sección correcta, buscar variables
            if (inSection) {
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
        }

        return variables;
    }
}
