'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

interface VarDefinition {
    type: string;
    description: string;
    options?: Array<{ value: any; description?: string }>;
}

interface VarsSchema {
    [section: string]: {
        [varName: string]: VarDefinition;
    };
}

export class ConfigTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'section' | 'variable',
        public readonly varName?: string,
        public readonly value?: string,
        public readonly isEnabled?: boolean,
        public readonly lineNumber?: number,
        public readonly configPath?: string,
        public readonly varDefinition?: VarDefinition
    ) {
        super(label, collapsibleState);

        if (type === 'variable') {
            this.contextValue = 'configVariable';
            this.iconPath = new vscode.ThemeIcon(
                isEnabled ? 'check' : 'circle-slash',
                isEnabled ? undefined : new vscode.ThemeColor('disabledForeground')
            );
            this.description = value || '(no definido)';
            
            // Tooltip mejorado con descripción de vars.yml
            let tooltipText = `${varName}\n${isEnabled ? 'Habilitado' : 'Deshabilitado'}\nValor: ${value || '(no definido)'}`;
            if (varDefinition) {
                tooltipText += `\n\n${varDefinition.description}`;
                tooltipText += `\nTipo: ${varDefinition.type}`;
                if (varDefinition.options && varDefinition.options.length > 0) {
                    tooltipText += '\n\nOpciones:';
                    varDefinition.options.forEach(opt => {
                        tooltipText += `\n  - ${opt.value}${opt.description ? ': ' + opt.description : ''}`;
                    });
                }
            }
            this.tooltip = tooltipText;
            
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
    private varsSchema: VarsSchema | null = null;

    constructor() {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        
        // Observar cambios en devcpc.conf
        const watcher = vscode.workspace.createFileSystemWatcher('**/devcpc.conf');
        watcher.onDidChange(() => this.refresh());
        watcher.onDidCreate(() => this.refresh());
        watcher.onDidDelete(() => this.refresh());
        
        // Cargar el esquema de vars.yml
        this.loadVarsSchema();
    }

    private loadVarsSchema(): void {
        try {
            const varsPath = path.join(__dirname, '..', 'vars.yml');
            if (fs.existsSync(varsPath)) {
                const varsContent = fs.readFileSync(varsPath, 'utf8');
                this.varsSchema = yaml.load(varsContent) as VarsSchema;
            }
        } catch (error) {
            console.error('Error cargando vars.yml:', error);
            vscode.window.showErrorMessage('Error cargando vars.yml');
        }
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
        if (!this.varsSchema) {
            return [new ConfigTreeItem(
                'Error: No se pudo cargar vars.yml',
                vscode.TreeItemCollapsibleState.None,
                'section'
            )];
        }

        const sections: ConfigTreeItem[] = [];
        
        // Crear items de sección desde vars.yml
        for (const sectionName in this.varsSchema) {
            // Capitalizar el nombre de la sección
            const displayName = sectionName.charAt(0).toUpperCase() + sectionName.slice(1);
            sections.push(new ConfigTreeItem(
                displayName,
                vscode.TreeItemCollapsibleState.Expanded,
                'section'
            ));
        }

        return sections;
    }

    private getVariablesFromSection(configPath: string, sectionName: string): ConfigTreeItem[] {
        if (!this.varsSchema) {
            return [];
        }

        // Buscar la sección en el schema (case-insensitive)
        const sectionKey = Object.keys(this.varsSchema).find(
            key => key.toLowerCase() === sectionName.toLowerCase()
        );

        if (!sectionKey) {
            return [];
        }

        const sectionVars = this.varsSchema[sectionKey];
        const variables: ConfigTreeItem[] = [];

        // Leer el contenido del devcpc.conf para obtener valores
        const configValues = this.parseConfigFile(configPath);

        // Para cada variable definida en vars.yml
        for (const varName in sectionVars) {
            const varDef = sectionVars[varName];
            const configValue = configValues.get(varName);

            let value = '';
            let isEnabled = false;
            let lineNumber = -1;

            if (configValue) {
                value = configValue.value;
                isEnabled = configValue.enabled;
                lineNumber = configValue.lineNumber;
                console.log(`Creating tree item for ${varName}: line=${lineNumber}, enabled=${isEnabled}`);
            } else {
                console.log(`Creating tree item for ${varName}: NOT FOUND in config file`);
            }

            variables.push(new ConfigTreeItem(
                varName,
                vscode.TreeItemCollapsibleState.None,
                'variable',
                varName,
                value || '(no definido)',
                isEnabled,
                lineNumber,
                configPath,
                varDef
            ));
        }

        return variables;
    }

    private parseConfigFile(configPath: string): Map<string, { value: string; enabled: boolean; lineNumber: number }> {
        const result = new Map<string, { value: string; enabled: boolean; lineNumber: number }>();
        
        if (!fs.existsSync(configPath)) {
            return result;
        }

        const content = fs.readFileSync(configPath, 'utf8');
        const lines = content.split('\n');

        console.log(`Parsing config file: ${configPath} (${lines.length} lines)`);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Saltar líneas vacías y comentarios puros (sin =)
            if (!trimmed || (trimmed.startsWith('#') && !trimmed.includes('='))) {
                continue;
            }

            const isCommented = trimmed.startsWith('#');
            const cleanLine = isCommented ? trimmed.substring(1).trim() : trimmed;

            // Detectar variables (formato VAR=VALUE)
            const match = cleanLine.match(/^([A-Z_]+)=(.*)$/);
            if (match) {
                const varName = match[1];
                let value = match[2].trim();
                
                // Limpiar comillas
                value = value.replace(/^["']|["']$/g, '');

                console.log(`Found var: ${varName} at line ${i}, enabled=${!isCommented}, value="${value}"`);

                result.set(varName, {
                    value: value,
                    enabled: !isCommented,
                    lineNumber: i
                });
            }
        }

        console.log(`Parsed ${result.size} variables from config file`);
        return result;
    }
}
