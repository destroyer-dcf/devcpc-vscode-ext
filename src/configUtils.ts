'use strict';

import * as fs from 'fs';
import * as path from 'path';

export interface ConfigValues {
    [key: string]: string | undefined;
}

function stripQuotes(value: string): string {
    return value.trim().replace(/^["']|["']$/g, '');
}

function stripInlineComment(value: string): string {
    let inSingle = false;
    let inDouble = false;
    let escaped = false;

    for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch === '\\') {
            escaped = true;
            continue;
        }
        if (ch === '"' && !inSingle) {
            inDouble = !inDouble;
            continue;
        }
        if (ch === '\'' && !inDouble) {
            inSingle = !inSingle;
            continue;
        }
        if (ch === '#' && !inSingle && !inDouble) {
            return value.slice(0, i).trim();
        }
    }
    return value.trim();
}

export function parseConfigFile(configPath: string): ConfigValues {
    const values: ConfigValues = {};

    if (!fs.existsSync(configPath)) {
        return values;
    }

    const content = fs.readFileSync(configPath, 'utf8');
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
            continue;
        }
        const [key, ...valueParts] = trimmed.split('=');
        const rawValue = stripInlineComment(valueParts.join('='));
        values[key.trim()] = stripQuotes(rawValue);
    }

    return resolveConfigVariables(values);
}

export function resolveConfigVariables(config: ConfigValues): ConfigValues {
    const result: ConfigValues = { ...config };
    const varRegex = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

    for (let pass = 0; pass < 5; pass++) {
        let changed = false;

        for (const [key, value] of Object.entries(result)) {
            if (!value) {
                continue;
            }
            const resolved = value.replace(varRegex, (_, varName: string) => result[varName] ?? '');
            if (resolved !== value) {
                result[key] = resolved;
                changed = true;
            }
        }

        if (!changed) {
            break;
        }
    }

    return result;
}

export function resolveConfigPath(baseConfigPath: string, configPathValue: string): string {
    if (path.isAbsolute(configPathValue)) {
        return configPathValue;
    }
    return path.join(path.dirname(baseConfigPath), configPathValue);
}

export function findConfigFileInWorkspace(rootPath: string): string | undefined {
    const configPath = path.join(rootPath, 'devcpc.conf');
    return fs.existsSync(configPath) ? configPath : undefined;
}
