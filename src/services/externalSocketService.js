import { io } from 'socket.io-client';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

let socketClient = null;
let socketConfig = null; // Para almacenar la configuración del socket una vez leída

// Determinar la ruta al archivo de configuración de forma más robusta
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Navegar dos niveles arriba desde src/services/ para llegar a la raíz del proyecto, luego a data/app-config.json
const configPath = path.join(__dirname, '..', '..', 'data', 'app-config.json');


async function getSocketConfig() {
    if (socketConfig) {
        return socketConfig;
    }
    try {
        // console.log(`[ExternalSocketService] Leyendo configuración desde: ${configPath}`);
        const rawConfig = await fs.readFile(configPath, 'utf-8');
        const fullConfig = JSON.parse(rawConfig);
        if (!fullConfig.socket || !fullConfig.socket.url) {
            console.error('[ExternalSocketService] URL del servidor Socket.IO no encontrada en la configuración.');
            return null;
        }
        socketConfig = fullConfig.socket; // Guardar solo la parte del socket de la config
        return socketConfig;
    } catch (error) {
        console.error(`[ExternalSocketService] Error al leer o parsear el archivo de configuración app-config.json: ${error.message}`, error);
        console.error(`[ExternalSocketService] Ruta intentada: ${configPath}`);
        return null;
    }
}

async function initializeSocketClient() {
    if (socketClient && socketClient.connected) {
        return socketClient;
    }

    const currentSocketConf = await getSocketConfig();
    if (!currentSocketConf || !currentSocketConf.url) {
        console.error('[ExternalSocketService] No se pudo inicializar el cliente Socket.IO: configuración no disponible.');
        return null;
    }

    console.log(`[ExternalSocketService] Intentando conectar a Socket.IO en ${currentSocketConf.url}`);
    
    // Si ya existe un cliente, pero está desconectado, lo desconectamos explícitamente antes de recrear.
    if (socketClient) {
        socketClient.disconnect();
    }

    socketClient = io(currentSocketConf.url, {
        reconnectionAttempts: 5,
        transports: ['websocket'], // Forzar websocket puede ser útil si hay problemas con long-polling
    });

    socketClient.on('connect', () => {
        console.log(`[ExternalSocketService] Conectado al servidor Socket.IO externo: ${currentSocketConf.url}`);
    });

    socketClient.on('disconnect', (reason) => {
        console.log(`[ExternalSocketService] Desconectado del servidor Socket.IO externo: ${reason}`);
        // Podríamos intentar reconectar aquí o manejarlo de otra forma si es necesario.
    });

    socketClient.on('connect_error', (error) => {
        console.error(`[ExternalSocketService] Error de conexión con Socket.IO externo: ${error.message}`);
    });
    
    // Esperar a que la conexión se establezca o falle
    // Esto es opcional, pero puede ayudar a asegurar que el cliente esté listo.
    // await new Promise(resolve => {
    //     socketClient.once('connect', resolve);
    //     socketClient.once('connect_error', resolve); // también resuelve en error para no bloquear indefinidamente
    // });

    return socketClient;
}

export async function emitEventToExternalSocket(eventName, data) {
    try {
        let client = socketClient;
        if (!client || !client.connected) {
            // console.log('[ExternalSocketService] Cliente no conectado, intentando reconectar/inicializar...');
            client = await initializeSocketClient();
        }

        if (client && client.connected) {
            console.log(`[ExternalSocketService] Emitiendo evento '${eventName}' al socket externo. Datos adjuntos (primeros 50 caracteres): ${JSON.stringify(data).substring(0,150)}...`);
            client.emit(eventName, data);
        } else {
            console.error(`[ExternalSocketService] No se pudo emitir el evento '${eventName}'. Cliente Socket.IO no conectado o no inicializado.`);
        }
    } catch (error) {
        console.error(`[ExternalSocketService] Error al emitir evento '${eventName}': ${error.message}`);
    }
}

// Iniciar la conexión cuando se carga el módulo.
// Esto asegura que el cliente intente conectarse tan pronto como sea posible.
initializeSocketClient();
