import axios from 'axios';

/**
 * Crea una instancia de Axios preconfigurada para llamar a la API del plugin de WP.
 * @param {string} wpSiteUrl - La URL base del sitio WordPress (ej: https://susitio.com)
 * @param {string} apiToken - El token de API para autenticación.
 * @returns {axios.AxiosInstance}
 */
const getApiClient = (wpSiteUrl, apiToken) => {
    if (!wpSiteUrl || !apiToken) {
        throw new Error('wpSiteUrl y apiToken son requeridos para crear el cliente API.');
    }
    const pluginApiPath = process.env.WP_PLUGIN_API_PATH || '/wp-json/tvp-pos-connector/v1';
    
    return axios.create({
        baseURL: `${wpSiteUrl}${pluginApiPath}`,
        headers: {
            'X-TVP-Token': apiToken,
            'Content-Type': 'application/json'
        }
    });
};

/**
 * Obtiene la lista de ventas (pedidos) desde la API de WordPress.
 * @param {string} wpSiteUrl - La URL base del sitio WordPress.
 * @param {string} apiToken - El token de API para autenticación.
 * @param {number} [page=1] - Número de página a solicitar.
 * @param {number} [perPage=10] - Número de ítems por página.
 * @param {number|null} [customerId=null] - ID del cliente para filtrar ventas (opcional).
 * @param {string} [searchTerm=''] - Término de búsqueda.
 * @param {string} [orderBy='date'] - Campo por el cual ordenar.
 * @param {string} [orderDir='DESC'] - Dirección del orden (asc/desc).
 * @returns {Promise<object>} Un objeto con { data: array_de_ventas, recordsTotal: numero_total, recordsFiltered: numero_filtrado }
 */
export const getWPSales = async (wpSiteUrl, apiToken, page = 1, perPage = 10, customerId = null, searchTerm = '', orderBy = 'date', orderDir = 'DESC', dtColumns = null, dtOrder = null) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        const params = { 
            page: page, 
            per_page: perPage,
        };
        if (customerId) {
            params.customer_id = customerId;
        }
        if (searchTerm) {
            params.search = searchTerm;
        }
        if (orderBy) params.orderby = orderBy;
        if (orderDir) params.order = orderDir;

        const response = await apiClient.get('/sales', { params });
        return response.data;
    } catch (error) {
        console.error("Error al obtener ventas desde WP API:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw error;
    }
};

export const getWPUsers = async (wpSiteUrl, apiToken, page = 1, perPage = 10, role = '', searchTerm = '', orderBy = 'display_name', orderDir = 'asc') => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        const params = { 
            page: page, 
            per_page: perPage,
        };
        if (role) {
            params.role = role;
        }
        if (searchTerm) {
            params.search = searchTerm; 
        }
        if (orderBy) {
            params.orderby = orderBy;
        }
        if (orderDir) {
            params.order = orderDir;
        }
        const response = await apiClient.get('/users', { params });
        return response.data; 
    } catch (error) {
        console.error("Error al obtener usuarios desde WP API:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw error;
    }
};

export const getWPOrderStatusCounts = async (wpSiteUrl, apiToken) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        const response = await apiClient.get('/dashboard/order-status-counts');
        return response.data; 
    } catch (error) {
        console.error("Error al obtener contadores de estado de pedidos desde WP API:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        return { processing: 'N/A', on_hold: 'N/A', completed: 'N/A', error: true };
    }
};

export const getWPSubscriptionEvents = async (wpSiteUrl, apiToken, startDate, endDate, searchTerm) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    const pluginApiPath = process.env.WP_PLUGIN_API_PATH || '/wp-json/tvp-pos-connector/v1';
    const endpointUrl = `${wpSiteUrl}${pluginApiPath}/subscription-events`;
    try {
        const params = {};
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
        if (searchTerm) params.search = searchTerm;
        
        console.log(`[Node DEBUG wpApiService] getWPSubscriptionEvents - Llamando a: ${endpointUrl} con params:`, params, `Token: ${apiToken ? 'Presente' : 'Ausente'}`);
        const response = await apiClient.get('/subscription-events', { params });
        console.log(`[Node DEBUG wpApiService] getWPSubscriptionEvents - Respuesta de WP API. Status: ${response.status}, Datos:`, JSON.stringify(response.data, null, 2));
        return response.data || [];
    } catch (error) {
        console.error(`[Node DEBUG wpApiService] getWPSubscriptionEvents - Error al obtener eventos de suscripción desde ${endpointUrl}:`, error.message);
        if (error.response) {
            console.error(`[Node DEBUG wpApiService] getWPSubscriptionEvents - Error Status: ${error.response.status}, Error Data:`, JSON.stringify(error.response.data, null, 2));
        }
        return []; 
    }
};

export const getWPProducts = async (wpSiteUrl, apiToken, page = 1, perPage = 10, search = '', featured = false, category = '') => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        const params = { 
            page, 
            per_page: perPage,
        };
        if (search) params.search = search;
        if (featured) params.featured = true;
        if (category) params.category = category;

        const response = await apiClient.get('/products', { params });
        return {
            data: response.data,
            total: parseInt(response.headers['x-wp-total'], 10) || 0,
            totalPages: parseInt(response.headers['x-wp-totalpages'], 10) || 0
        };
    } catch (error) {
        console.error("Error al obtener productos desde WP API:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw error;
    }
};

export const getWPPaymentGateways = async (wpSiteUrl, apiToken) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        const response = await apiClient.get('/payment-gateways');
        return response.data || [];
    } catch (error) {
        console.error("Error al obtener pasarelas de pago desde WP API:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw error;
    }
};

export const searchWPCustomers = async (wpSiteUrl, apiToken, searchTerm = '', perPage = 10, page = 1) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    const pluginApiPath = process.env.WP_PLUGIN_API_PATH || '/wp-json/tvp-pos-connector/v1';
    try {
        const params = {
            search: searchTerm,
            per_page: perPage,
            page: page,
        };
        console.log(`[Node DEBUG wpApiService] Intentando buscar clientes en WP. URL base: ${wpSiteUrl}${pluginApiPath}/users, Token: ${apiToken ? 'Presente' : 'Ausente'}, Params:`, params); 
        const response = await apiClient.get('/users', { params });
        console.log('[Node DEBUG wpApiService] Respuesta de WP API para /users. Status:', response.status, 'Datos recibidos:', JSON.stringify(response.data, null, 2)); 
        const responseData = response.data || {};
        return {
            data: responseData.data || [], 
            total: responseData.recordsTotal || parseInt(response.headers['x-wp-total'], 10) || 0,
            totalPages: responseData.recordsFiltered && perPage > 0 ? Math.ceil(responseData.recordsFiltered / perPage) : (parseInt(response.headers['x-wp-totalpages'], 10) || 0)
        };
    } catch (error) {
        console.error("[Node DEBUG wpApiService] Error al buscar clientes desde WP API:", error.message); 
        if (error.response) {
            console.error("[Node DEBUG wpApiService] Error response status:", error.response.status);
            console.error("[Node DEBUG wpApiService] Error response data:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error("[Node DEBUG wpApiService] Error sin objeto response (ej: error de red):", error);
        }
        throw error;
    }
};

export const getWPSaleById = async (wpSiteUrl, apiToken, orderId) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        const response = await apiClient.get(`/sales/${orderId}`);
        let saleDetails = response.data;
        if (saleDetails && saleDetails.line_items && typeof saleDetails.line_items === 'object' && !Array.isArray(saleDetails.line_items)) {
            console.log(`[wpApiService] Transformando line_items de objeto a array para venta ID: ${orderId}`);
            saleDetails.line_items = Object.values(saleDetails.line_items);
        }
        return saleDetails; 
    } catch (error) {
        console.error(`Error al obtener detalles de la venta ${orderId} desde WP API:`, error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        if (error.response && error.response.status === 404) {
            return null;
        }
        throw error;
    }
};

export const createWPCustomer = async (wpSiteUrl, apiToken, customerData) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        const response = await apiClient.post('/users', customerData);
        return response.data;
    } catch (error) {
        console.error("Error al crear cliente en WP API:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw error;
    }
};

export const updateWPCustomer = async (wpSiteUrl, apiToken, customerId, customerData) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        const response = await apiClient.put(`/users/${customerId}`, customerData);
        return response.data;
    } catch (error) {
        console.error(`Error al actualizar cliente ${customerId} en WP API:`, error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw error;
    }
};

export const getWPCustomerById = async (wpSiteUrl, apiToken, customerId) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        const response = await apiClient.get(`/users/${customerId}`);
        console.log('[TVP-POS DEBUG] wpApiService.js - getWPCustomerById - Respuesta de WP API:', response.data);
        return response.data;
    } catch (error) {
        console.error(`Error al obtener cliente ${customerId} desde WP API:`, error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw error;
    }
};

export const deleteWPUser = async (wpSiteUrl, apiToken, userId) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        const response = await apiClient.delete(`/users/${userId}?reassign=1`);
        return response.data; 
    } catch (error) {
        console.error(`Error al eliminar usuario ${userId} en WP API:`, error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw error;
    }
};

export const validateWPCoupon = async (wpSiteUrl, apiToken, couponCode, cartSubtotal) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        const payload = { coupon_code: couponCode };
        if (cartSubtotal !== undefined) {
            payload.cart_subtotal = cartSubtotal;
        }
        const response = await apiClient.post('/coupons/validate', payload);
        return response.data;
    } catch (error) {
        console.error(`Error al validar cupón "${couponCode}" en WP API:`, error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        if (error.response && error.response.data) {
            throw error.response.data;
        }
        throw error;
    }
};

export const createWPSale = async (wpSiteUrl, apiToken, saleData, currentUser) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        const orderPayload = {
            customer_id: saleData.customerId,
            payment_method: saleData.paymentMethod,
            payment_method_title: saleData.paymentTitle,
            billing: saleData.billing || {},
            shipping: saleData.shipping || saleData.billing || {},
            line_items: saleData.cart.map(item => ({
                product_id: item.id.includes('-') ? parseInt(item.id.split('-')[0]) : parseInt(item.id),
                variation_id: item.id.includes('-') ? parseInt(item.id.split('-')[1]) : 0,
                quantity: item.quantity,
                name: item.name,
                price: item.price,
                total: (item.quantity * item.price).toFixed(2)
            })),
            customer_note: saleData.customerNote || '',
            meta_data: [
                { key: '_tvp_pos_sale', value: 'yes' },
                { key: '_tvp_pos_user_id', value: currentUser?.id || 'unknown' },
                { key: '_tvp_pos_user_name', value: currentUser?.name || 'Unknown POS User' },
                { key: '_sale_type', value: saleData.saleType }
            ]
        };

        if (saleData.couponCode) {
            orderPayload.coupon_lines = [{ code: saleData.couponCode }];
        }

        if (saleData.saleType === 'suscripcion') {
            orderPayload.meta_data.push({ key: '_subscription_title', value: saleData.subscriptionTitle });
            orderPayload.meta_data.push({ key: '_subscription_expiry', value: saleData.subscriptionExpiry });
        }
        
        console.log("Payload para crear pedido en WP:", JSON.stringify(orderPayload, null, 2));
        const response = await apiClient.post('/sales', orderPayload);
        return response.data;
    } catch (error) {
        console.error("Error al crear venta en WP API:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message, error.stack);
        if (error.response && error.response.data) {
            throw error.response.data;
        }
        throw error;
    }
};
