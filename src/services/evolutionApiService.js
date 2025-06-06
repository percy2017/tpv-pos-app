import axios from 'axios';

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
    console.log(apiUrl + '| '+ apiKey)
    const endpoint = `${apiUrl.replace(/\/$/, '')}/instance/fetchInstances`; // Asegurar que no haya doble slash

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
            return []; // Devolver array vacío si el formato no es el esperado
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
 * Envía un mensaje de texto usando Evolution API.
 * @param {string} apiUrl - La URL base de la Evolution API.
 * @param {string} apiKey - La API Key para autenticación.
 * @param {string} instanceName - El nombre de la instancia desde la cual enviar el mensaje.
 * @param {string} phoneNumber - El número de teléfono del destinatario (formato internacional, ej: 591XXXXXXXXX).
 * @param {string} messageText - El texto del mensaje a enviar.
 * @param {object} [options] - Opciones adicionales para el envío (delay, presence, etc.).
 * @returns {Promise<object>} La respuesta de la API de Evolution.
 * @throws {Error} Si hay un error en la comunicación o la API devuelve un error.
 */
export async function sendWhatsAppMessage(apiUrl, apiKey, instanceName, phoneNumber, messageText, options = {}) {
    if (!apiUrl || !apiKey || !instanceName || !phoneNumber || !messageText) {
        throw new Error('Faltan parámetros requeridos para enviar el mensaje de WhatsApp.');
    }

    const endpoint = `${apiUrl.replace(/\/$/, '')}/message/sendText/${instanceName}`;
    const payload = {
        number: phoneNumber,
        options: {
            delay: options.delay || 1200, // Default delay
            presence: options.presence || 'composing', // Default presence
            linkPreview: options.linkPreview !== undefined ? options.linkPreview : true,
        },
        textMessage: {
            text: messageText
        }
    };

    try {
        console.log(`[EvolutionAPI Service] Sending message to ${phoneNumber} via instance ${instanceName} from ${endpoint}`);
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
            } else if (error.response.data.message) {
                errorMessage = error.response.data.message;
            } else if (error.response.data.error) {
                errorMessage = error.response.data.error;
            }
        } else if (error.message) {
            errorMessage = error.message;
        }
        throw new Error(errorMessage);
    }
}
