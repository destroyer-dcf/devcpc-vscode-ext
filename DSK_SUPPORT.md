# Soporte DSK en Emulador Integrado

## Estado actual

El soporte DSK del emulador integrado está operativo en esta extensión.

- Carga de `.dsk` vía `load_dsk` en `media/shell.js`
- Inserción de disco vía `_webapi_insert_disc`
- Auto-carga al abrir emulador y tras build (según `devcpc.conf`)
- Mensajes de éxito hacia el host (`dsk_loaded_success`)

## Flujo de carga

1. La extensión detecta archivo objetivo (`DSK/CDT/BIN`) desde `devcpc.conf`.
2. Envía datos Base64 al WebView (`cmd: load_dsk` para DSK).
3. `shell.js` decodifica, valida header DSK y copia al heap WASM.
4. Se llama `_webapi_insert_disc(ptr, size)`.
5. Si retorna `true`, el disco queda insertado y listo en el emulador.

## Requisitos de configuración

`devcpc.conf` debe estar en la **raíz del workspace**.

Ejemplo mínimo para DSK:

```ini
DIST_DIR="dist"
DSK="mi_juego.dsk"
EMULATOR_TYPE="integrated"
CPC_MODEL=6128
```

## Selección por modelo (`CPC_MODEL`)

- `464`: prioridad `CDT -> DSK -> BIN`
- `6128` / otros: prioridad `DSK -> CDT -> BIN`
- `664`: actualmente se usa fallback a 6128 en runtime integrado

## Auto-ejecución (`RUN_FILE`)

Después de cargar el archivo, se puede enviar un comando automático con `RUN_FILE`:

- Si es nombre de archivo: se envía `run"<RUN_FILE>`
- Si ya es comando (`|cpm`, `run"disc`, `call ...`): se envía tal cual
- Soporta `\n`, `\r`, `\t`
- Tiene debounce para evitar doble envío en secuencias rápidas

Ejemplos:

```ini
RUN_FILE="disc"
```

```ini
RUN_FILE="|cpm"
```

## Verificación rápida

Con el emulador abierto, en DevTools del WebView deberías ver:

```text
kcide_load_dsk: Iniciando carga de archivo DSK...
✓ DSK decodificado: ...
✓ Header DSK: "MV - CPC" (o "EXTENDED")
→ Llamando webapi_insert_disc()...
✓✓✓ ¡DSK CARGADO EXITOSAMENTE!
```

## Archivos relevantes

- `media/shell.js`
- `media/cpc-ui.js`
- `media/cpc-ui.wasm`
- `src/devCpcEmulator.ts`
- `src/emulatorLauncher.ts`
- `src/extension.ts`
