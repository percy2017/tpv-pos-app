import axios from 'axios';
import { json } from 'express';

/**
 * Obtiene las instancias de Evolution API.
 * @param {string} apiUrl - La URL base de la Evolution API (ej: https://evolution.ejemplo.com)
 * @param {string} apiKey - La API Key para autenticación.
 * @returns {Promise<Array<string>>} Un array con los nombres de las instancias activas.
 * @throws {Error} Si hay un error en la comunicación o la API devuelve un error.
 */
export async function getEvolutionInstances(apiUrl, apiKey) {
    if (!apiUrl || !apiKey) {
        throw new Error('La URL de la API y la API Key de Evolution son requeridas.');
    }
    // console.log(apiUrl + '| '+ apiKey) // Log original, se puede mantener si es útil
    const endpoint = `${apiUrl.replace(/\/$/, '')}/instance/fetchInstances`;

    try {
        console.log(`[EvolutionAPI Service] Fetching instances from: ${endpoint}`);
        const response = await axios.get(endpoint, {
            headers: {
                'apikey': apiKey
            }
        });

        if (response.data && Array.isArray(response.data)) {
            const activeInstances = response.data
                .filter(item => item.instance && item.instance.status === 'open' && item.instance.instanceName)
                .map(item => item.instance.instanceName);
            console.log(`[EvolutionAPI Service] Active instances found:`, activeInstances);
            return activeInstances;
        } else {
            console.warn('[EvolutionAPI Service] Unexpected response format for fetchInstances:', response.data);
            return [];
        }
    } catch (error) {
        console.error('[EvolutionAPI Service] Error fetching Evolution API instances:', error.response ? error.response.data : error.message);
        let errorMessage = 'Error al conectar con Evolution API para obtener instancias.';
        if (error.response && error.response.data && error.response.data.message) {
            errorMessage = error.response.data.message;
        } else if (error.message) {
            errorMessage = error.message;
        }
        throw new Error(errorMessage);
    }
}

/**
 * Envía un mensaje de texto o multimedia usando Evolution API.
 * @param {string} apiUrl - La URL base de la Evolution API.
 * @param {string} apiKey - La API Key para autenticación.
 * @param {string} instanceName - El nombre de la instancia desde la cual enviar el mensaje.
 * @param {string} phoneNumber - El número de teléfono del destinatario.
 * @param {string} messageText - El texto del mensaje a enviar (caption si hay multimedia).
 * @param {object} [options] - Opciones adicionales (delay, presence, multimediaUrl).
 * @returns {Promise<object>} La respuesta de la API de Evolution.
 */
export async function sendWhatsAppMessage(apiUrl, apiKey, instanceName, phoneNumber, messageText, options = {}) {
    if (!apiUrl || !apiKey || !instanceName || !phoneNumber) {
        throw new Error('Faltan parámetros requeridos (apiUrl, apiKey, instanceName, phoneNumber) para enviar el mensaje de WhatsApp.');
    }

    let endpoint;
    let payload;
    // const forceTextOnly = false; // Asegurarse que esté en false o eliminar la línea

    if (options.multimediaUrl /* && !forceTextOnly */) { // forceTextOnly ya no es necesaria si siempre queremos intentar multimedia
        endpoint = `${apiUrl.replace(/\/$/, '')}/message/sendMedia/${instanceName}`;

        const getMediaTypeFromUrl = (url) => {
            if (!url) return 'document';
            const extension = url.split('.').pop().toLowerCase().split('?')[0].split('#')[0];
            if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(extension)) return 'image';
            if (['mp4', '3gp', 'mov', 'avi', 'mkv'].includes(extension)) return 'video';
            if (['mp3', 'ogg', 'aac', 'wav', 'm4a'].includes(extension)) return 'audio';
            if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(extension)) return 'document';
            console.warn(`[EvolutionAPI Service] No se pudo determinar mediatype para extensión: ${extension}, usando 'document' como fallback.`);
            return 'document';
        };
        
        const extractFileNameFromUrl = (url) => {
            if (!url) return 'file';
            try {
                const urlParts = new URL(url);
                const pathParts = urlParts.pathname.split('/');
                return pathParts.pop() || 'file';
            } catch (e) {
                const parts = url.split('/');
                return parts.pop() || 'file';
            }
        };
        payload = {
            method: 'POST',
            headers: {apikey: apiKey, 'Content-Type': 'application/json'},
            body: JSON.stringify(
                {
                    'number': phoneNumber,
                    'options': {
                        'delay': options.delay || 1200,
                        'presence': 'composing', // o options.presence || 'composing'
                    },
                    'mediaMessage': {
                        'mediatype': getMediaTypeFromUrl(options.multimediaUrl), // Corregido a minúscula
                        // 'fileName': extractFileNameFromUrl(options.multimediaUrl), // Opcional, si la API lo soporta bien
                        'media': options.multimediaUrl,
                        'caption': messageText || '',
                    }
                }
            )
        };
        
        console.log(`[EvolutionAPI Service] Sending MEDIA message to ${phoneNumber} via instance ${instanceName} from ${endpoint}. Payload:`, payload.body);
        try {
            const response = await axios.post(endpoint, JSON.parse(payload.body), { // Usar axios y parsear el body
                headers: {
                    'apikey': apiKey,
                    'Content-Type': 'application/json'
                }
            });
            console.log('[EvolutionAPI Service] Media message sent, API response:', response.data);
            return response.data;
        } catch (error) {
            console.error('[EvolutionAPI Service] Error sending MEDIA message:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
            let errorMessage = `Error al enviar mensaje multimedia vía Evolution API (Instancia: ${instanceName}).`;
            if (error.response && error.response.data) {
                if (typeof error.response.data === 'string') {
                    errorMessage = error.response.data;
                } else if (error.response.data.message) {
                    errorMessage = Array.isArray(error.response.data.message) ? error.response.data.message.join('; ') : error.response.data.message;
                } else if (error.response.data.error) {
                    errorMessage = error.response.data.error;
                }
            } else if (error.message) {
                errorMessage = error.message;
            }
            throw new Error(errorMessage);
        }
    } else {
        if (!messageText) {
            throw new Error('messageText es requerido si no se envía multimediaUrl.');
        }
        endpoint = `${apiUrl.replace(/\/$/, '')}/message/sendText/${instanceName}`;
        payload = {
            number: phoneNumber,
            options: {
                delay: options.delay || 1200,
                presence: options.presence || 'composing',
                linkPreview: options.linkPreview !== undefined ? options.linkPreview : true,
            },
            textMessage: {
                text: messageText
            }
        };
        console.log(`[EvolutionAPI Service] Sending TEXT message to ${phoneNumber} via instance ${instanceName} from ${endpoint}`);
        try {
            console.log(`[EvolutionAPI Service] Payload:`, JSON.stringify(payload));
            const response = await axios.post(endpoint, payload, {
                headers: {
                    'apikey': apiKey,
                    'Content-Type': 'application/json'
                }
            });
            console.log('[EvolutionAPI Service] Message sent, API response:', response.data);
            return response.data;
        } catch (error) {
            console.error('[EvolutionAPI Service] Error sending WhatsApp message:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
            let errorMessage = `Error al enviar mensaje vía Evolution API (Instancia: ${instanceName}).`;
            if (error.response && error.response.data) {
                if (typeof error.response.data === 'string') {
                    errorMessage = error.response.data;
                } else if (error.response.data.message) { // El error de Evolution API viene en message (array)
                    errorMessage = Array.isArray(error.response.data.message) ? error.response.data.message.join('; ') : error.response.data.message;
                } else if (error.response.data.error) {
                    errorMessage = error.response.data.error;
                }
            } else if (error.message) {
                errorMessage = error.message;
            }
            throw new Error(errorMessage);
        }
    }
}

/**
 * Obtiene todos los contactos de una instancia de Evolution API.
 * @param {string} apiUrl - La URL base de la Evolution API.
 * @param {string} apiKey - La API Key para autenticación.
 * @param {string} instanceName - El nombre de la instancia.
 * @returns {Promise<Array<object>>} Un array con objetos de contacto { phone, nombre_cliente, status }.
 * @throws {Error} Si hay un error en la comunicación o la API devuelve un error.
 */
export async function getEvolutionContacts(apiUrl, apiKey, instanceName) {
    if (!apiUrl || !apiKey || !instanceName) {
        throw new Error('La URL de la API, la API Key y el nombre de la instancia de Evolution son requeridos.');
    }
    const endpoint = `${apiUrl.replace(/\/$/, '')}/chat/findContacts/${instanceName}`;
    console.log(`[EvolutionAPI Service] Fetching all contacts from instance ${instanceName} via: ${endpoint}`);

    try {
        const response = await axios.post(endpoint, 
            {}, // Body vacío, asumiendo que esto devuelve todos los contactos o una lista paginada.
            { 
                headers: {
                    'apikey': apiKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data && Array.isArray(response.data)) {
            const contacts = response.data
                .map(contact => {
                    if (contact.id && typeof contact.id === 'string' && contact.id.includes('@s.whatsapp.net')) {
                        const phoneNumber = contact.id.split('@')[0];
                        return {
                            phone: phoneNumber,
                            // Evolution API no parece devolver un nombre de contacto directamente en este endpoint de ejemplo.
                            // Usaremos un placeholder o el JID si es necesario.
                            nombre_cliente: contact.name || `EvoUser ${phoneNumber}`, // Asumir 'name' o usar placeholder
                            status: 'pendiente' 
                        };
                    }
                    return null; 
                })
                .filter(contact => contact && contact.phone); // Filtrar nulos y contactos sin teléfono

            console.log(`[EvolutionAPI Service] Found ${contacts.length} contacts for instance ${instanceName}.`);
            return contacts;
        } else {
            console.warn(`[EvolutionAPI Service] Unexpected response format when fetching contacts for instance ${instanceName}:`, response.data);
            return [];
        }
    } catch (error) {
        console.error(`[EvolutionAPI Service] Error fetching contacts for instance ${instanceName}:`, error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        let errorMessage = `Error al obtener contactos de Evolution API para la instancia ${instanceName}.`;
        if (error.response && error.response.data) {
            if (typeof error.response.data === 'string') {
                errorMessage = error.response.data;
            } else if (error.response.data.message) {
                errorMessage = Array.isArray(error.response.data.message) ? error.response.data.message.join('; ') : error.response.data.message;
            } else if (error.response.data.error) {
                errorMessage = error.response.data.error;
            }
        } else if (error.message) {
            errorMessage = error.message;
        }
        throw new Error(errorMessage);
    }
}
