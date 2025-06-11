import axios from 'axios';

const CHATWOOT_CONVERSATIONS_PER_PAGE = 25;

async function getOnePageOfChatwootConversations(baseUrl, accountId, apiToken, page = 1) {
    if (!baseUrl || !accountId || !apiToken) {
        throw new Error('La URL base, el ID de cuenta y el token de API de Chatwoot son requeridos.');
    }
    let apiUrl = `${baseUrl.replace(/\/$/, '')}/api/v1/accounts/${accountId}/conversations?page=${page}&count=${CHATWOOT_CONVERSATIONS_PER_PAGE}`;
    console.log(`[ChatwootService] Fetching page ${page} of conversations (count: ${CHATWOOT_CONVERSATIONS_PER_PAGE}) from: ${apiUrl}`);

    try {
        const response = await axios.get(apiUrl, {
            headers: {
                'api_access_token': apiToken,
                'Content-Type': 'application/json'
            }
        });
        
        const payload = response.data && response.data.data && Array.isArray(response.data.data.payload) 
                        ? response.data.data.payload 
                        : [];
         
        if (payload.length > 0) {
            console.log(`[ChatwootService] Obtenidas ${payload.length} conversaciones en página ${page}.`);
        } else {
            console.log(`[ChatwootService] No se encontraron conversaciones en página ${page}.`);
        }
        return payload;
    } catch (error) {
        console.error(`[ChatwootService] Error al obtener página ${page} de conversaciones de Chatwoot: ${error.message}`);
        if (error.response) {
            console.error('[ChatwootService] Error Response Data (conversations):', error.response.data);
            console.error('[ChatwootService] Error Response Status (conversations):', error.response.status);
        }
        return []; 
    }
}

export async function getAttachmentsForConversation(baseUrl, accountId, conversationId, apiToken) {
    if (!baseUrl || !accountId || !conversationId || !apiToken) {
        console.error('[ChatwootService] getAttachmentsForConversation: Parámetros faltantes.');
        return [];
    }

    const apiUrlBase = `${baseUrl.replace(/\/$/, '')}/api/v1/accounts/${accountId}/conversations/${conversationId}/attachments`;
    let allAttachments = [];
    let currentPage = 1;
    const MAX_ATTACHMENT_PAGES_TO_FETCH = 50; 

    console.log(`[ChatwootService] Iniciando obtención de todos los adjuntos para conversación ${conversationId}.`);

    while (currentPage <= MAX_ATTACHMENT_PAGES_TO_FETCH) {
        const apiUrlWithPage = `${apiUrlBase}?page=${currentPage}`;
        try {
            const response = await axios.get(apiUrlWithPage, {
                headers: { 'api_access_token': apiToken, 'Content-Type': 'application/json' }
            });

            const attachmentsThisPage = response.data?.payload;

            if (attachmentsThisPage && Array.isArray(attachmentsThisPage) && attachmentsThisPage.length > 0) {
                console.log(`[ChatwootService] Conv ${conversationId}: Obtenidos ${attachmentsThisPage.length} adjuntos en página ${currentPage}.`);
                allAttachments.push(...attachmentsThisPage);
            } else {
                console.log(`[ChatwootService] Conv ${conversationId}: No se encontraron más adjuntos en página ${currentPage} o payload vacío/inválido. Fin de adjuntos para esta conversación.`);
                break;
            }
            currentPage++;
        } catch (error) {
            if (error.response && error.response.status === 404) {
                console.log(`[ChatwootService] Conv ${conversationId}: No se encontraron adjuntos en página ${currentPage} (404). Fin de adjuntos para esta conversación.`);
            } else {
                console.error(`[ChatwootService] Conv ${conversationId}: Error al obtener página ${currentPage} de adjuntos: ${error.message}`);
                if (error.response) {
                    console.error(`[ChatwootService] Conv ${conversationId}: Error Response Data:`, error.response.data);
                }
            }
            break; 
        }
    }
    if (currentPage > MAX_ATTACHMENT_PAGES_TO_FETCH) {
        console.warn(`[ChatwootService] Conv ${conversationId}: Se alcanzó el límite máximo de ${MAX_ATTACHMENT_PAGES_TO_FETCH} páginas de adjuntos.`);
    }
    console.log(`[ChatwootService] Conv ${conversationId}: Total de adjuntos obtenidos después de paginación: ${allAttachments.length}.`);
    return allAttachments;
}

export async function getChatwootMediaAttachments(baseUrl, accountId, apiToken, chatwootPage = 1) {
    let foundAttachmentsOnThisPage = [];
    console.log(`[ChatwootService] Buscando adjuntos para la página ${chatwootPage} de conversaciones de Chatwoot.`);
    const conversationsOnThisPage = await getOnePageOfChatwootConversations(baseUrl, accountId, apiToken, chatwootPage);

    if (!conversationsOnThisPage) { 
        console.error(`[ChatwootService] Error al obtener conversaciones para la página ${chatwootPage}.`);
        return { attachments: [], hasMoreChatwootPages: false };
    }
    if (conversationsOnThisPage.length === 0 && chatwootPage > 1) { 
        console.log(`[ChatwootService] No hay conversaciones en la página ${chatwootPage} de Chatwoot.`);
         return { attachments: [], hasMoreChatwootPages: false };
    }

    for (const conv of conversationsOnThisPage) {
        if (!conv || !conv.id) continue;
        const attachmentsForThisConv = await getAttachmentsForConversation(baseUrl, accountId, conv.id, apiToken);
        if (attachmentsForThisConv.length > 0) {
            attachmentsForThisConv.forEach(att => {
                if (att.data_url) {
                    foundAttachmentsOnThisPage.push({
                        ...att,
                        sender_name: conv.meta?.sender?.name || 'Desconocido',
                        conversation_created_at: conv.created_at,
                        conversation_id: conv.id 
                    });
                }
            }); 
        }
    } 
    const hasMoreChatwootPages = conversationsOnThisPage.length === CHATWOOT_CONVERSATIONS_PER_PAGE;
    console.log(`[ChatwootService] Total de adjuntos encontrados en conversaciones de página ${chatwootPage}: ${foundAttachmentsOnThisPage.length}. ¿Más páginas de Chatwoot?: ${hasMoreChatwootPages}`);
    return { attachments: foundAttachmentsOnThisPage, hasMoreChatwootPages: hasMoreChatwootPages };
}

export async function getChatwootLabels(baseUrl, accountId, apiToken) {
    if (!baseUrl || !accountId || !apiToken) {
        throw new Error('La URL base, el ID de cuenta y el token de API de Chatwoot son requeridos para obtener etiquetas.');
    }
    const apiUrl = `${baseUrl.replace(/\/$/, '')}/api/v1/accounts/${accountId}/labels`;
    console.log(`[ChatwootService] Fetching labels from: ${apiUrl}`);
    try {
        const response = await axios.get(apiUrl, {
            headers: {
                'api_access_token': apiToken,
                'Content-Type': 'application/json'
            }
        });
        const labels = response.data?.payload || response.data || []; 
        if (Array.isArray(labels)) {
            console.log(`[ChatwootService] Obtenidas ${labels.length} etiquetas.`);
            return labels.map(label => ({ id: label.title, title: label.title, color: label.color }));
        } else {
            console.warn('[ChatwootService] Unexpected response format for labels:', response.data);
            return [];
        }
    } catch (error) {
        console.error(`[ChatwootService] Error al obtener etiquetas de Chatwoot: ${error.message}`);
        if (error.response) {
            console.error('[ChatwootService] Error Response Data (labels):', error.response.data);
        }
        throw new Error('Error al conectar con Chatwoot API para obtener etiquetas.');
    }
}

export async function getAllChatwootContacts(baseUrl, accountId, apiToken) {
    if (!baseUrl || !accountId || !apiToken) {
        throw new Error('La URL base, ID de cuenta y token API de Chatwoot son requeridos.');
    }
    let allContacts = [];
    let currentPage = 1;
    const CONTACTS_PER_PAGE = 15;
    console.log(`[ChatwootService] Fetching all contacts.`);
    try {
        while (true) {
            const apiUrl = `${baseUrl.replace(/\/$/, '')}/api/v1/accounts/${accountId}/contacts?page=${currentPage}`;
            console.log(`[ChatwootService] Fetching page ${currentPage} of all contacts from: ${apiUrl}`);
            const response = await axios.get(apiUrl, {
                headers: { 'api_access_token': apiToken, 'Content-Type': 'application/json' }
            });
            const contactsOnPage = response.data?.payload || [];
            if (contactsOnPage.length > 0) {
                allContacts.push(...contactsOnPage);
            }
            const meta = response.data?.meta;
            if (contactsOnPage.length < CONTACTS_PER_PAGE || (meta && meta.current_page * CONTACTS_PER_PAGE >= meta.count) || contactsOnPage.length === 0) {
                break; 
            }
            currentPage++;
        }
        console.log(`[ChatwootService] Total de ${allContacts.length} contactos encontrados.`);
        return allContacts.map(contact => ({
            id_chatwoot: contact.id,
            name: contact.name || '',
            phone: contact.phone_number || '',
            email: contact.email || '',
            status: 'pendiente'
        })).filter(c => c.phone);
    } catch (error) {
        console.error(`[ChatwootService] Error al obtener todos los contactos de Chatwoot: ${error.message}`);
        if (error.response) {
            console.error('[ChatwootService] Error Response Data (all contacts):', error.response.data);
        }
        return []; 
    }
}

export async function getChatwootContactsWithLabel(baseUrl, accountId, apiToken, labelName) {
    if (!baseUrl || !accountId || !apiToken || !labelName) {
        throw new Error('La URL base, ID de cuenta, token API y nombre de etiqueta son requeridos.');
    }
    let allContacts = [];
    let currentPage = 1;
    const CONTACTS_PER_PAGE = 15;
    console.log(`[ChatwootService] Fetching contacts with label "${labelName}"`);
    try {
        while (true) {
            const apiUrl = `${baseUrl.replace(/\/$/, '')}/api/v1/accounts/${accountId}/contacts?page=${currentPage}&labels=${encodeURIComponent(labelName)}`;
            console.log(`[ChatwootService] Fetching page ${currentPage} for label "${labelName}" from: ${apiUrl}`);
            const response = await axios.get(apiUrl, {
                headers: { 'api_access_token': apiToken, 'Content-Type': 'application/json' }
            });
            const contactsFromApiPage = response.data?.payload || [];
            if (contactsFromApiPage.length > 0) {
                // Los logs de DEBUG se quitaron al revertir a axios, ya que la lógica de filtro manual también se quitó.
                // Si la API con &labels= filtra correctamente, no necesitamos el filtro manual ni los logs detallados de ese filtro.
                allContacts.push(...contactsFromApiPage);
                console.log(`[ChatwootService] Pushed ${contactsFromApiPage.length} contacts from API page ${currentPage} for label "${labelName}". Total now: ${allContacts.length}`);
            } else {
                 console.log(`[ChatwootService] No contacts received on page ${currentPage} for label "${labelName}".`);
            }
            const meta = response.data?.meta;
            if (contactsFromApiPage.length === 0 || contactsFromApiPage.length < CONTACTS_PER_PAGE || (meta && meta.current_page * CONTACTS_PER_PAGE >= meta.count)) {
                break; 
            }
            currentPage++;
        }
        console.log(`[ChatwootService] Total de ${allContacts.length} contactos encontrados con la etiqueta "${labelName}".`);
        return allContacts.map(contact => ({
            id_chatwoot: contact.id,
            name: contact.name || '',
            phone: contact.phone_number || '', 
            email: contact.email || '',
            status: 'pendiente'
        })).filter(c => c.phone); 
    } catch (error) {
        console.error(`[ChatwootService] Error al obtener contactos de Chatwoot con etiqueta "${labelName}": ${error.message}`);
        if (error.response) {
            console.error('[ChatwootService] Error Response Data (contacts by label):', error.response.data);
        }
        return []; 
    }
}
