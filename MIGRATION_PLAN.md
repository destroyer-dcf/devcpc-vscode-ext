# Plan de migración: `devcpc.conf` -> variables de entorno

## Objetivo
Eliminar la dependencia de `devcpc.conf` y unificar la configuración en variables de entorno, disponibles:
- en procesos lanzados por la extensión,
- y en terminal integrado de VS Code (para nuevas sesiones).

## Alcance
- Proyecto 1: software/CLI `devcpc`.
- Proyecto 2: extensión VS Code `devcpc-vscode-ext`.

## Variables objetivo (contrato inicial)
Definir una lista estable de variables soportadas (ampliable):
- `CPC_MODEL`
- `DIST_DIR`
- `DSK`
- `CDT`
- `RUN_FILE`
- `EMULATOR_TYPE`
- `RVM_PATH`

Regla de precedencia en `devcpc`:
1. argumentos CLI,
2. variables de entorno,
3. valores por defecto.

## Fase 1 - Cambios en `devcpc` (CLI)
### 1.1 Capa de configuración por entorno
- Crear módulo único de lectura/validación (`config/env`).
- Tipar y validar valores (`CPC_MODEL`, rutas, valores permitidos).
- Normalizar defaults en un punto central.

### 1.2 Sustitución de `devcpc.conf`
- Reemplazar llamadas al parser de `devcpc.conf` por la nueva capa de entorno.
- Mantener temporalmente fallback opcional (solo durante transición).

### 1.3 Observabilidad y DX
- Añadir comando de diagnóstico, por ejemplo `devcpc config --print`.
- Mostrar configuración efectiva y origen (arg/env/default).

### 1.4 Testing
- Caso sin env: usa defaults.
- Caso con env: sobrescribe defaults.
- Caso con args: sobrescribe env.
- Caso inválido: error claro y código de salida no cero.

## Fase 2 - Cambios en la extensión VS Code
### 2.1 Nueva fuente de configuración en workspace
- Añadir setting `devcpc.env` en `package.json`.
- Estructura tipo objeto `Record<string, string>`.

Ejemplo:

```json
"devcpc.env": {
  "CPC_MODEL": "6128",
  "EMULATOR_TYPE": "integrated",
  "RUN_FILE": "GAME.BAS"
}
```

### 2.2 Mapper central de entorno
- Implementar helper en `src/configUtils.ts`:
  - lectura de `devcpc.env`,
  - resolución de placeholders (opcional: `${workspaceFolder}`, `${home}`),
  - merge final: `{ ...process.env, ...devcpcEnv }`.

### 2.3 Inyección de entorno en todos los lanzamientos
Aplicar `env` unificado en:
- `spawn('devcpc', ...)` de la extensión,
- tareas shell ejecutadas por VS Code (`ShellExecution`),
- terminales creados por la extensión (`createTerminal({ env })`),
- lanzamientos de emulador externo donde aplique.

### 2.4 Vista de configuración
- Añadir vista `DevCPC Env` con operaciones:
  - alta (`add`),
  - edición (`edit`),
  - borrado (`delete`).
- Persistir cambios en `devcpc.env` a nivel workspace.

### 2.5 Terminal integrado (sesiones nuevas)
- Comando para sincronizar `devcpc.env` con:
  - `terminal.integrated.env.osx`
  - `terminal.integrated.env.linux`
- Nota: solo afecta terminales nuevas; las abiertas deben recrearse.

## Fase 3 - Transición y compatibilidad
### 3.1 Versión N (compatibilidad activa)
- Soporte dual: `env` como fuente principal + fallback de `devcpc.conf`.
- Warning de deprecación cuando se detecte `devcpc.conf`.
- Comando de migración: importar `devcpc.conf` -> `devcpc.env`.

### 3.2 Versión N+1 (endurecimiento)
- Fallback desactivado por defecto (opt-in temporal para equipos atrasados).

### 3.3 Versión N+2 (retirada completa)
- Eliminar parser, edición y detección de `devcpc.conf`.
- Limpiar activation events y documentación antigua.

## Fase 4 - Documentación
- README de extensión:
  - explicar `devcpc.env`, vista y sincronización con terminal.
- Documentación de `devcpc`:
  - tabla de variables soportadas,
  - precedencia,
  - ejemplos reproducibles.

## Criterios de aceptación
- `devcpc run/build` funciona sin `devcpc.conf`.
- Tareas y comandos de la extensión usan la misma configuración efectiva.
- Emulador (integrado/RVM) funciona sin leer `devcpc.conf`.
- El usuario puede gestionar variables desde una vista de VS Code.
- Flujo manual en terminal integrado funciona al abrir terminal nueva.

## Riesgos y mitigaciones
- Riesgo: divergencia entre terminal manual y lanzamientos de extensión.
  - Mitigación: comando explícito de sincronización a `terminal.integrated.env.*`.
- Riesgo: roturas en proyectos existentes.
  - Mitigación: soporte dual por versiones N y N+1 + herramienta de migración.
- Riesgo: variables inválidas o incompletas.
  - Mitigación: validación estricta en CLI + mensajes accionables.

## Backlog sugerido (por PR)
1. PR1 `devcpc`: capa `env`, precedencia y tests.
2. PR2 extensión: `devcpc.env` + mapper + inyección en procesos.
3. PR3 extensión: vista `DevCPC Env` + comandos add/edit/delete.
4. PR4 extensión: migrador desde `devcpc.conf` y warnings.
5. PR5 cleanup: eliminación total de `devcpc.conf` y docs finales.
