/**
 * Script de prueba para verificar si las funciones WASM necesarias están disponibles
 * 
 * Ejecutar este script en la consola del WebView del emulador:
 * 1. Abrir el emulador integrado
 * 2. Help → Toggle Developer Tools
 * 3. Ir a la pestaña Console
 * 4. Copiar y pegar este código
 */

console.log('=== Test de funciones WASM para soporte DSK ===\n');

// Verificar que el módulo WASM está cargado
if (typeof Module === 'undefined') {
    console.error('❌ El módulo WASM no está cargado');
} else {
    console.log('✅ Módulo WASM cargado correctamente\n');
    
    // Lista de funciones a verificar
    const requiredFunctions = [
        '_webapi_alloc',
        '_webapi_free',
        '_webapi_load',
        '_cpc_insert_disc',
        '_fdd_cpc_insert_dsk'
    ];
    
    const optionalFunctions = [
        '_cpc_remove_disc',
        '_cpc_disc_inserted',
        '_webapi_insert_disc'
    ];
    
    console.log('--- Funciones Requeridas ---');
    requiredFunctions.forEach(name => {
        const exists = typeof Module[name] === 'function';
        const icon = exists ? '✅' : '❌';
        console.log(`${icon} ${name}: ${exists ? 'Disponible' : 'NO DISPONIBLE'}`);
    });
    
    console.log('\n--- Funciones Opcionales ---');
    optionalFunctions.forEach(name => {
        const exists = typeof Module[name] === 'function';
        const icon = exists ? '✅' : '⚠️';
        console.log(`${icon} ${name}: ${exists ? 'Disponible' : 'No disponible'}`);
    });
    
    // Verificar si kcide_load_dsk está definido
    console.log('\n--- Funciones JavaScript ---');
    console.log(`${typeof kcide_load_dsk === 'function' ? '✅' : '❌'} kcide_load_dsk: ${typeof kcide_load_dsk === 'function' ? 'Definida' : 'NO DEFINIDA'}`);
    
    // Resumen
    console.log('\n=== Resumen ===');
    const hasCpcInsertDisc = typeof Module._cpc_insert_disc === 'function';
    const hasFddInsertDsk = typeof Module._fdd_cpc_insert_dsk === 'function';
    
    if (hasCpcInsertDisc || hasFddInsertDsk) {
        console.log('✅ SOPORTE DSK DISPONIBLE');
        console.log(`   Función disponible: ${hasCpcInsertDisc ? '_cpc_insert_disc' : '_fdd_cpc_insert_dsk'}`);
    } else {
        console.log('❌ SOPORTE DSK NO DISPONIBLE');
        console.log('   El WASM necesita ser recompilado con las funciones exportadas.');
        console.log('   Ver DSK_SUPPORT.md para más información.');
    }
    
    // Listar todas las funciones exportadas que empiezan con _ (formato WASM)
    console.log('\n--- Todas las funciones exportadas del módulo ---');
    const exportedFunctions = Object.keys(Module)
        .filter(key => key.startsWith('_') && typeof Module[key] === 'function')
        .sort();
    
    if (exportedFunctions.length > 0) {
        console.log(`Total: ${exportedFunctions.length} funciones`);
        console.log(exportedFunctions.join('\n'));
    } else {
        console.log('No se encontraron funciones exportadas con prefijo _');
    }
}

console.log('\n=== Fin del test ===');
