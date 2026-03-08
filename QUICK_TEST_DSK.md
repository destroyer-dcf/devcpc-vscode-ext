# Quick Test: Emulador Integrado (DSK/CDT)

## 1) Compilar extensión

```bash
npm run compile
```

## 2) Configurar `devcpc.conf` (raíz del workspace)

Ejemplo DSK (6128):

```ini
PROJECT_NAME="basic"
DIST_DIR="dist"
DSK="${PROJECT_NAME}.dsk"
EMULATOR_TYPE="integrated"
CPC_MODEL=6128
RUN_FILE="disc"
```

Ejemplo 464 (prioriza CDT):

```ini
DIST_DIR="dist"
CDT="basic.cdt"
DSK="basic.dsk"
EMULATOR_TYPE="integrated"
CPC_MODEL=464
RUN_FILE="|cpm"
```

## 3) Abrir emulador

Comando:

- `DevCPC: Open Integrated Emulator`

## 4) Qué debe pasar

- Se detecta el archivo según prioridad por modelo.
- Se carga automáticamente en el emulador.
- Si hay `RUN_FILE`, se envía comando automático tras la carga.

## 5) Probar desde build/run

- Ejecuta build desde el panel DevCPC (taskcpc).
- O usa `DevCPC: Launch Emulator` / `Run File in Emulator`.
- Debe cargar archivo y aplicar `RUN_FILE` también en run.

## 6) Ver logs correctos

Abrir DevTools del WebView:

- `Help -> Toggle Developer Tools`
- pestaña `Console`

Logs esperados para DSK:

```text
kcide_load_dsk: Iniciando carga de archivo DSK...
✓ DSK decodificado: ...
✓ Header DSK: "MV - CPC" (o "EXTENDED")
→ Llamando webapi_insert_disc()...
✓✓✓ ¡DSK CARGADO EXITOSAMENTE!
```

## 7) Resolución rápida de problemas

- No auto-carga nada:
  - Verifica que `devcpc.conf` esté en raíz del workspace.
  - Verifica rutas reales de `DIST_DIR`, `DSK`, `CDT`.

- Modelo 464 no usa cinta:
  - Revisa `CPC_MODEL=464` y que `CDT` exista.

- `RUN_FILE` no hace nada:
  - Prueba valor explícito: `RUN_FILE="run\"disc\n"` o `RUN_FILE="|cpm\n"`.

- Carga doble de comando:
  - Ya existe debounce en envío automático.

## 8) Referencias

- `README.md` (sección Integrated Emulator)
- `src/devCpcEmulator.ts`
- `src/emulatorLauncher.ts`
- `media/shell.js`
