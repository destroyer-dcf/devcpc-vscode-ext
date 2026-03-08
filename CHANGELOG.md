# Change Log
All notable changes to the "devcpc-tasks" extension will be documented in this file.

## [0.2.0] - 2026-02-13
### Changed
- Renombrada extensión de "Task Runner" a "Task DevCPC"
- Actualizados IDs y comandos para DevCPC
- Mejorada descripción para desarrollo de Amstrad CPC

## [Unreleased]
### Added
- Soporte operativo de carga DSK en emulador integrado (`load_dsk` + `_webapi_insert_disc`).
- Comando WebView `input` para enviar texto/comandos al emulador.
- Auto-ejecución post-carga basada en `RUN_FILE` en `devcpc.conf`.
- Soporte de `CPC_MODEL` en arranque del emulador (464/6128; 664 con fallback a 6128).
- Debounce para evitar doble envío automático de `RUN_FILE` en secuencias rápidas.

### Changed
- El selector de archivo a cargar ahora depende del modelo:
  - `CPC_MODEL=464`: prioridad `CDT -> DSK -> BIN`.
  - Resto: prioridad `DSK -> CDT -> BIN`.
- El flujo de `run` también aplica `RUN_FILE` (no solo al abrir emulador).
- Se eliminó el popup de advertencia antiguo sobre recompilación WASM durante carga DSK.
- `devcpc.conf` se toma desde la raíz del workspace para la lógica del emulador.
- Parser/config mejorado con expansión de variables `${...}` y resolución de rutas relativas al `devcpc.conf`.
- `launch.json` de desarrollo ajustado con `--disable-extensions` para reducir ruido de extensiones de terceros.

### Documentation
- README actualizado con implementación real del emulador integrado y su flujo.
- `DSK_SUPPORT.md` y `QUICK_TEST_DSK.md` actualizados y alineados con el comportamiento actual.
