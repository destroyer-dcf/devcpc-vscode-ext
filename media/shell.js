var Module = {
    preRun: [],
    postRun: [
        () => { kcide_init(); }
    ],
    print: (() => {
        return (...args) => {
            text = Array.prototype.slice.call(args).join(' ');
            console.log(text);
        };
    })(),
    printErr: (...args) => {
        text = Array.prototype.slice.call(args).join(' ');
        console.error(text);
    },
    canvas: (() => {
        var canvas = document.getElementById('canvas');
        canvas.addEventListener('webglcontextlost', function(e) { alert('FIXME: WebGL context lost, please reload the page'); e.preventDefault(); }, false);
        return canvas;
    })(),
    setStatus: () => { },
    monitorRunDependencies: () => { },
};

function kcide_init() {
    // see emu.ts
    window.addEventListener('message', ev => {
        const msg = ev.data;
        switch (msg.cmd) {
            case 'boot': kcide_boot(); break;
            case 'reset': kcide_reset(); break;
            case 'ready': kcide_ready(); break;
            case 'load': kcide_load(msg.data); break;
            case 'load_dsk': kcide_load_dsk(msg.data); break;
            case 'input': kcide_input(msg.text); break;
            case 'connect': kcide_dbgConnect(); break;
            case 'disconnect': kcide_dbgDisconnect(); break;
            case 'updateBreakpoints': kcide_dbgUpdateBreakpoints(msg.removeAddrs, msg.addAddrs); break;
            case 'pause': kcide_dbgPause(); break;
            case 'continue': kcide_dbgContinue(); break;
            case 'step': kcide_dbgStep(); break;
            case 'stepIn': kcide_dbgStepIn(); break;
            case 'cpuState': kcide_dbgCpuState(); break;
            case 'disassemble': kcide_dbgDisassemble(msg.addr, msg.offsetLines, msg.numLines); break;
            case 'readMemory': kcide_dbgReadMemory(msg.addr, msg.numBytes); break;
            default: console.log(`unknown cmd called: ${msg.cmd}`); break;
        }
    });
    Module.vsCodeApi = acquireVsCodeApi();
    Module.webapi_onStopped = (stop_reason, addr) => {
        Module.vsCodeApi.postMessage({ command: 'emu_stopped', stopReason: stop_reason, addr: addr });
    };
    Module.webapi_onContinued = () => {
        Module.vsCodeApi.postMessage({ command: 'emu_continued' });
    };
    Module.webapi_onReboot = () => {
        Module.vsCodeApi.postMessage({ command: 'emu_reboot' });
    };
    Module.webapi_onReset = () => {
        Module.vsCodeApi.postMessage({ command: 'emu_reset' });
    };
    Module._webapi_dbg_connect();
};

function kcide_dbgConnect() {
    Module._webapi_dbg_connect();
}

function kcide_dbgDisconnect() {
    Module._webapi_dbg_disconnect();
}

function kcide_boot() {
    Module._webapi_boot();
}

function kcide_reset() {
    Module._webapi_reset();
}

function kcide_ready() {
    const result = Module._webapi_ready();
    Module.vsCodeApi.postMessage({ command: 'emu_ready', isReady: result });
}

function kcide_input(text) {
    if (typeof Module._webapi_input === 'function') {
        Module._webapi_input(text || '');
    } else {
        console.warn('kcide_input: _webapi_input no disponible');
    }
}

function kcide_get_heap_u8() {
    if (Module.HEAPU8) {
        return Module.HEAPU8;
    }
    if (typeof HEAPU8 !== 'undefined') {
        return HEAPU8;
    }
    return null;
}

/**
 * @param {string} dataBase64
 * @param {boolean} start
 * @param {boolean} stopOnEntry
 */
function kcide_load(dataBase64, retryCount = 0) {
    // NOTE: transfering ArrayBuffer objects is broken when running as web extension,
    // thus any binary data needs to be transferred as base64 encoded string
    const binStr = atob(dataBase64);
    const bin = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
        bin[i] = binStr.charCodeAt(i);
    }
    const size = bin.length;
    const heapU8 = kcide_get_heap_u8();
    if (!heapU8) {
        if (retryCount < 20) {
            setTimeout(() => kcide_load(dataBase64, retryCount + 1), 150);
            return;
        }
        console.error('kcide_load: HEAPU8 no disponible, el WASM aún no está listo');
        return;
    }
    const ptr = Module._webapi_alloc(size);
    heapU8.set(bin, ptr);
    if (!Module._webapi_load(ptr, size)) {
        console.warn('_webapi_load() returned false');
    }
    Module._webapi_free(ptr);
}

/**
 * Load a DSK disk image into the CPC emulator
 * @param {string} dataBase64 - Base64 encoded DSK file
 */
function kcide_load_dsk(dataBase64, retryCount = 0) {
    console.log('═══════════════════════════════════════════════════');
    console.log('kcide_load_dsk: Iniciando carga de archivo DSK...');
    console.log('═══════════════════════════════════════════════════');
    
    try {
        // Decodificar base64
        const binStr = atob(dataBase64);
        const bin = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) {
            bin[i] = binStr.charCodeAt(i);
        }
        const size = bin.length;
        console.log(`✓ DSK decodificado: ${size} bytes (${(size/1024).toFixed(2)} KB)`);
        
        // VVerificar header DSK
        const headerStr = String.fromCharCode.apply(null, bin.slice(0, 8));
        console.log(`✓ Header DSK: "${headerStr}"`);
        const isValidDsk = headerStr.includes('MV - CPC') || headerStr.includes('EXTENDED');
        console.log(`✓ Formato DSK válido: ${isValidDsk ? 'SÍ' : 'NO'}`);
        
        if (!isValidDsk) {
            console.error('✗✗✗ ERROR: El archivo no es un DSK válido');
            return;
        }
        
        // Verificar función disponible
        console.log('\n→ Verificando función WASM:');
        console.log(`  _webapi_insert_disc:  ${typeof Module._webapi_insert_disc === 'function' ? '✓ DISPONIBLE' : '✗ NO DISPONIBLE'}`);
        
        if (typeof Module._webapi_insert_disc !== 'function') {
            console.error('\n╔═══════════════════════════════════════════════════════════╗');
            console.error('║ ERROR: webapi_insert_disc() no está disponible           ║');
            console.error('║                                                           ║');
            console.error('║ El WASM del emulador no fue compilado correctamente.     ║');
            console.error('║ Asegúrate de usar el WASM con el soporte DSK.            ║');
            console.error('╚═══════════════════════════════════════════════════════════╝');
            return;
        }
        
        // Allocate memory in WASM
        console.log('→ Allocando memoria WASM...');
        const heapU8 = kcide_get_heap_u8();
        if (!heapU8) {
            if (retryCount < 20) {
                setTimeout(() => kcide_load_dsk(dataBase64, retryCount + 1), 150);
                return;
            }
            console.error('✗ HEAPU8 no disponible: el runtime WASM aún no está listo');
            return;
        }
        const ptr = Module._webapi_alloc(size);
        console.log(`✓ Memoria WASM alocada en ptr = 0x${ptr.toString(16)}`);
        
        // Copy DSK data to WASM memory
        heapU8.set(bin, ptr);
        console.log('✓ Datos copiados a memoria WASM');
        
        // ¡Insertar el disco usando la nueva función!
        console.log('\n→ Llamando webapi_insert_disc()...');
        let success = false;
        
        try {
            const result = Module._webapi_insert_disc(ptr, size);
            if (result) {
                console.log('✓✓✓ ¡DSK CARGADO EXITOSAMENTE!');
                success = true;
            } else {
                console.error('✗ webapi_insert_disc() retornó false');
                console.error('  Posibles razones:');
                console.error('  - Formato DSK corrupto o no soportado');
                console.error('  - Error interno del emulador');
            }
        } catch (e) {
            console.error('✗ Excepción al llamar webapi_insert_disc():', e);
        }
        
        // Free allocated memory
        Module._webapi_free(ptr);
        console.log('\n✓ Memoria WASM liberada');
        
        if (success) {
            console.log('\n═══════════════════════════════════════════════════');
            console.log('✓✓✓ DISCO DSK INSERTADO CORRECTAMENTE');
            console.log('═══════════════════════════════════════════════════\n');
            
            // Enviar mensaje de éxito
            if (Module.vsCodeApi) {
                Module.vsCodeApi.postMessage({ 
                    command: 'dsk_loaded_success',
                    filename: 'disk.dsk'
                });
            }
        } else {
            console.log('\n═══════════════════════════════════════════════════');
            console.log('✗✗✗ ERROR: No se pudo cargar el DSK');
            console.log('═══════════════════════════════════════════════════\n');
        }
        
    } catch (error) {
        console.error('\n✗✗✗ EXCEPCIÓN en kcide_load_dsk:', error);
        console.error('Stack trace:', error.stack);
    }
}

/**
 * @param {number[]} removeAddrs
 * @param {number[]} addAddrs
 */
function kcide_dbgUpdateBreakpoints(removeAddrs, addAddrs) {
    removeAddrs.forEach((addr) => Module._webapi_dbg_remove_breakpoint(addr));
    addAddrs.forEach((addr) => Module._webapi_dbg_add_breakpoint(addr));
}

function kcide_dbgPause() {
    Module._webapi_dbg_break();
}

function kcide_dbgContinue() {
    Module._webapi_dbg_continue();
}

function kcide_dbgStep() {
    Module._webapi_dbg_step_next();
}

function kcide_dbgStepIn() {
    Module._webapi_dbg_step_into();
}

function kcide_dbgCpuState() {
    // see chips-test webapi.h/webapi_cpu_state_t
    const u16idx = Module._webapi_dbg_cpu_state()>>1;
    let state = { type: 'unknown' };
    const cpuType = Module.HEAPU16[u16idx + 0];
    if (cpuType === 1) {
        // must match types.ts/CPUState
        state = {
            type: 'Z80',
            z80: {
                af:  Module.HEAPU16[u16idx + 1],
                bc:  Module.HEAPU16[u16idx + 2],
                de:  Module.HEAPU16[u16idx + 3],
                hl:  Module.HEAPU16[u16idx + 4],
                ix:  Module.HEAPU16[u16idx + 5],
                iy:  Module.HEAPU16[u16idx + 6],
                sp:  Module.HEAPU16[u16idx + 7],
                pc:  Module.HEAPU16[u16idx + 8],
                af2: Module.HEAPU16[u16idx + 9],
                bc2: Module.HEAPU16[u16idx + 10],
                de2: Module.HEAPU16[u16idx + 11],
                hl2: Module.HEAPU16[u16idx + 12],
                im:  Module.HEAPU16[u16idx + 13],
                ir:  Module.HEAPU16[u16idx + 14],
                iff: Module.HEAPU16[u16idx + 15],
            }
        };
    } else if (cpuType === 2) {
        state = {
            type: '6502',
            m6502: {
                a: Module.HEAPU16[u16idx + 1],
                x: Module.HEAPU16[u16idx + 2],
                y: Module.HEAPU16[u16idx + 3],
                s: Module.HEAPU16[u16idx + 4],
                p: Module.HEAPU16[u16idx + 5],
                pc: Module.HEAPU16[u16idx + 6],
            }
        };
    }
    Module.vsCodeApi.postMessage({ command: 'emu_cpustate', state });
}

function kcide_dbgDisassemble(addr, offset_lines, num_lines) {
    // NOTE: ptr points to an array of webapi_dasm_line_t structs:
    //
    //  uint16_t addr;
    //  uint8_t num_bytes;
    //  uint8_t num_addr;
    //  uint8_t bytes[8];
    //  uint8_t chars[32];
    //
    const ptr = Module._webapi_dbg_request_disassembly(addr, offset_lines, num_lines);
    const result = [];
    for (let line_idx = 0; line_idx < num_lines; line_idx++) {
        const p = ptr + line_idx * 44;
        const addr = Module.HEAPU16[p>>1];
        const num_bytes = Module.HEAPU8[p + 2];
        const num_chars = Module.HEAPU8[p + 3];
        const bytes = [];
        let chars = '';
        for (let i = 0; i < num_bytes; i++) {
            bytes.push(Module.HEAPU8[p + 4 + i]);
        }
        for (let i = 0; i < num_chars; i++) {
            chars += String.fromCharCode(Module.HEAPU8[p + 12 + i]);
        }
        result.push({ addr, bytes, chars });
    }
    Module._webapi_free(ptr);
    Module.vsCodeApi.postMessage({ command: 'emu_disassembly', result });
}

// result is a base64 encoded string!
function kcide_dbgReadMemory(addr, numBytes) {
    const toBase64 = (data) => {
        return btoa(String.fromCodePoint(...data));
    };
    const ptr = Module._webapi_dbg_read_memory(addr, numBytes);
    const bytes = Module.HEAPU8.slice(ptr, ptr + numBytes);
    const base64Data = toBase64(bytes);
    Module._webapi_free(ptr);
    // type: emu.ts/ReadMemoryResult
    const result = { addr, base64Data };
    Module.vsCodeApi.postMessage({ command: 'emu_memory', result });
}
