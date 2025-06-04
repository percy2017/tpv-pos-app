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
            'Content-Type': 'application/json' // Aunque para GET no es estrictamente necesario, es buena práctica
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
 * @param {object|null} [dtColumns=null] - Parámetro 'columns' de DataTables.
 * @param {object|null} [dtOrder=null] - Parámetro 'order' de DataTables.
 * @returns {Promise<object>} Un objeto con { data: array_de_ventas, recordsTotal: numero_total, recordsFiltered: numero_filtrado }
 */
export const getWPSales = async (wpSiteUrl, apiToken, page = 1, perPage = 10, customerId = null, searchTerm = '', orderBy = 'date', orderDir = 'DESC', dtColumns = null, dtOrder = null) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        const params = { 
            page: page, 
            per_page: perPage,
            // El plugin ahora espera 'search' como un string simple o un objeto con 'value'.
            // Y 'order' como un array de objetos si viene de DataTables.
            // El controlador Node.js se encargará de pasar los parámetros correctos.
        };
        if (customerId) {
            params.customer_id = customerId;
        }
        if (searchTerm) {
            params.search = searchTerm; // El plugin lo manejará (buscará en texto y teléfono)
        }
        // phoneSearch ya no es un parámetro separado aquí.
        // Para el ordenamiento, el plugin espera 'orderby' y 'order' directamente
        // si no vienen de la estructura compleja de DataTables.
        // El controlador Node.js pasará los parámetros de DataTables (dtColumns, dtOrder)
        // que el plugin de WP utilizará si están presentes.
        if (dtColumns) {
            // DataTables envía 'columns' como un array de objetos. El plugin de WP espera esto.
            // No es necesario convertirlo a JSON string si axios lo maneja bien para query params.
            // Si axios no lo serializa bien como query params (ej. columns[0][data]=...),
            // podríamos necesitar JSON.stringify y que el plugin lo decodifique.
            // Por ahora, asumimos que el plugin puede manejarlo o que el controlador Node.js
            // ya lo ha preparado adecuadamente si es necesario.
            // El plugin de WP está preparado para recibir 'columns' y 'order' como arrays de objetos
            // directamente en los query params si se envían como tal (ej. PHP $_GET['columns']).
            // Si se envían como parte del cuerpo POST, también.
            // Aquí, como es una petición GET, axios los serializará en la URL.
            // El plugin PHP deberá ser capaz de leerlos.
            // Alternativamente, si el plugin espera JSON, haríamos:
            // params.dt_columns = JSON.stringify(dtColumns);
            // params.dt_order = JSON.stringify(dtOrder);
            // Pero el plugin actual parece esperar los parámetros directamente.
            // El controlador ya pasa dtColumns y dtOrder, así que los añadimos a params.
            // El plugin de WP debe estar preparado para recibir 'columns' y 'order' como arrays.
            // Axios serializará esto como columns[0][data]=...&columns[0][name]=... etc.
            // El plugin PHP debe poder leer esto de $_GET.
            // Si el plugin espera 'orderby' y 'order' simples, el controlador Node.js ya los establece.
            // Esta función es genérica, así que si dtColumns y dtOrder vienen del controlador de DT,
            // el plugin de WP los usará. Si no, usará orderBy y orderDir.
            // El plugin de WP está diseñado para tomar dtOrder y dtColumns si existen,
            // y si no, usar los parámetros 'orderby' y 'order' simples.
            // No necesitamos pasar dtColumns y dtOrder explícitamente aquí si el plugin
            // ya los toma de la solicitud original que le llega (que es un POST al endpoint Node /api/sales/dt).
            // La llamada desde el controlador Node a esta función getWPSales ya incluye
            // orderBy y orderDir que se derivan de dtColumns y dtOrder.
            // Por lo tanto, solo necesitamos pasar orderBy y orderDir.
        }

        if (orderBy) params.orderby = orderBy;
        if (orderDir) params.order = orderDir;


        // La API del plugin /sales (GET) ahora devuelve un objeto con data, recordsTotal, recordsFiltered
        const response = await apiClient.get('/sales', { params });
        
        // La respuesta del plugin ya debería tener el formato { data: [], recordsTotal: X, recordsFiltered: Y }
        return response.data;

    } catch (error) {
        console.error("Error al obtener ventas desde WP API:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        // Podrías querer manejar diferentes tipos de errores aquí (ej: 401, 403, 500)
        throw error; // Re-lanzar para que el controlador lo maneje y muestre un mensaje al usuario
    }
};

// Aquí podrías añadir más funciones para otros endpoints (getWPUsers, getWPProducts, etc.)
// export const getWPUsers = async (wpSiteUrl, apiToken, page = 1, perPage = 10, role = '') => { ... }
export const getWPUsers = async (wpSiteUrl, apiToken, page = 1, perPage = 10, role = '', searchTerm = '', orderBy = 'display_name', orderDir = 'asc') => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        const params = { 
            page: page, 
            per_page: perPage,
            // Los parámetros para DataTables server-side se envían en el cuerpo de un POST usualmente,
            // pero si el plugin los espera como query params para GET /users, los añadimos aquí.
            // La API del plugin ahora espera 'search' como un string simple o un objeto con 'value'.
            // Y 'order' como un array de objetos.
            // Para simplificar, el controlador Node.js debería traducir los params de DT a lo que espera esta función.
        };
        if (role) {
            params.role = role;
        }
        if (searchTerm) {
            // El plugin ahora espera 'search' como un string simple para la búsqueda general
            // o un objeto con 'value' si viene de DataTables.
            // El controlador Node.js se encargará de pasar el 'search[value]' de DT como 'searchTerm' aquí.
            params.search = searchTerm; 
        }
        if (orderBy) {
            params.orderby = orderBy;
        }
        if (orderDir) {
            params.order = orderDir;
        }

        // La API del plugin /users (GET) ahora devuelve un objeto con data, recordsTotal, recordsFiltered
        const response = await apiClient.get('/users', { params });
        
        // La respuesta del plugin ya debería tener el formato { data: [], recordsTotal: X, recordsFiltered: Y }
        // No necesitamos leer cabeceras X-WP-Total aquí si el cuerpo de la respuesta ya lo incluye.
        return response.data; 

    } catch (error) {
        console.error("Error al obtener usuarios desde WP API:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw error;
    }
};

/**
 * Obtiene los contadores de estado de pedidos desde la API de WordPress para el dashboard.
 * @param {string} wpSiteUrl - La URL base del sitio WordPress.
 * @param {string} apiToken - El token de API para autenticación.
 * @returns {Promise<object>} Un objeto con los contadores (ej: { processing: 0, on_hold: 0, completed: 0 }).
 */
export const getWPOrderStatusCounts = async (wpSiteUrl, apiToken) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        const response = await apiClient.get('/dashboard/order-status-counts');
        return response.data; 
    } catch (error) {
        console.error("Error al obtener contadores de estado de pedidos desde WP API:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        // Devolver un objeto vacío o con valores por defecto en caso de error para no romper el dashboard
        return { processing: 'N/A', on_hold: 'N/A', completed: 'N/A', error: true };
    }
};

/**
 * Obtiene eventos de vencimiento de suscripciones desde la API de WordPress.
 * @param {string} wpSiteUrl
 * @param {string} apiToken
 * @param {string} [startDate] - Formato YYYY-MM-DD (opcional, para filtrar rango)
 * @param {string} [endDate] - Formato YYYY-MM-DD (opcional, para filtrar rango)
 * @param {string} [searchTerm] - Término de búsqueda (opcional)
 * @returns {Promise<Array>} Un array de objetos de evento.
 */
export const getWPSubscriptionEvents = async (wpSiteUrl, apiToken, startDate, endDate, searchTerm) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    const endpointUrl = `${wpSiteUrl}${process.env.WP_PLUGIN_API_PATH || '/wp-json/tvp-pos-connector/v1'}/subscription-events`;
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
        // No relanzar el error aquí para que apiGetCalendarEvents pueda continuar con eventos manuales si los hay.
        // Devolver un array vacío en caso de error para que no rompa la concatenación.
        return []; 
    }
};

/**
 * Obtiene la lista de productos desde la API de WordPress.
 * @param {string} wpSiteUrl - La URL base del sitio WordPress.
 * @param {string} apiToken - El token de API para autenticación.
 * @param {number} [page=1] - Número de página a solicitar.
 * @param {number} [perPage=10] - Número de ítems por página.
 * @param {string} [search=''] - Término de búsqueda.
 * @param {boolean} [featured=false] - Filtrar por productos destacados.
 * @param {string} [category=''] - Filtrar por ID o slug de categoría.
 * @returns {Promise<object>} Un objeto con { data: array_de_productos, total: numero_total, totalPages: numero_de_paginas }
 */
export const getWPProducts = async (wpSiteUrl, apiToken, page = 1, perPage = 10, search = '', featured = false, category = '') => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        const params = { 
            page, 
            per_page: perPage,
        };
        if (search) {
            params.search = search;
        }
        if (featured) {
            params.featured = true; // Enviar como true, no el valor booleano directamente si es false
        }
        if (category) {
            params.category = category;
        }

        const response = await apiClient.get('/products', { params });
        
        return {
            data: response.data, // El array de productos
            total: parseInt(response.headers['x-wp-total'], 10) || 0,
            totalPages: parseInt(response.headers['x-wp-totalpages'], 10) || 0
        };
    } catch (error) {
        console.error("Error al obtener productos desde WP API:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw error;
    }
};

/**
 * Obtiene la lista de pasarelas de pago desde la API de WordPress.
 * @param {string} wpSiteUrl - La URL base del sitio WordPress.
 * @param {string} apiToken - El token de API para autenticación.
 * @returns {Promise<Array>} Un array de objetos de pasarelas de pago.
 */
export const getWPPaymentGateways = async (wpSiteUrl, apiToken) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        const response = await apiClient.get('/payment-gateways');
        return response.data || []; // Devuelve el array de pasarelas o un array vacío
    } catch (error) {
        console.error("Error al obtener pasarelas de pago desde WP API:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw error; // Re-lanzar para que el controlador lo maneje
    }
};

/**
 * Busca clientes/usuarios en WordPress.
 * @param {string} wpSiteUrl
 * @param {string} apiToken
 * @param {string} searchTerm
 * @param {number} [perPage=10]
 * @param {number} [page=1]
 * @returns {Promise<object>} Objeto con { data: array_de_usuarios, total: numero_total, totalPages: numero_de_paginas }
 */
export const searchWPCustomers = async (wpSiteUrl, apiToken, searchTerm = '', perPage = 10, page = 1) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        const params = {
            search: searchTerm,
            per_page: perPage,
            page: page,
            // Podríamos añadir 'role': 'customer' si solo queremos clientes de WooCommerce
        };
        // LOG NUEVO 1: Antes de la llamada
        console.log(`[Node DEBUG wpApiService] Intentando buscar clientes en WP. URL base: ${wpSiteUrl}${process.env.WP_PLUGIN_API_PATH || '/wp-json/tvp-pos-connector/v1'}/users, Token: ${apiToken ? 'Presente' : 'Ausente'}, Params:`, params); 
        
        const response = await apiClient.get('/users', { params });
        
        // LOG NUEVO 2: Después de la llamada exitosa
        console.log('[Node DEBUG wpApiService] Respuesta de WP API para /users. Status:', response.status, 'Datos recibidos:', JSON.stringify(response.data, null, 2)); 
        
        // Ajuste para el formato de respuesta del plugin que ahora incluye 'data', 'recordsTotal', 'recordsFiltered'
        const responseData = response.data || {}; // Asegurar que response.data exista
        return {
            data: responseData.data || [], 
            total: responseData.recordsTotal || parseInt(response.headers['x-wp-total'], 10) || 0,
            // Calcular totalPages basado en recordsFiltered si está disponible, sino usar el header
            totalPages: responseData.recordsFiltered && perPage > 0 ? Math.ceil(responseData.recordsFiltered / perPage) : (parseInt(response.headers['x-wp-totalpages'], 10) || 0)
        };
    } catch (error) {
        // LOG MEJORADO para errores
        console.error("[Node DEBUG wpApiService] Error al buscar clientes desde WP API:", error.message); 
        if (error.response) {
            console.error("[Node DEBUG wpApiService] Error response status:", error.response.status);
            console.error("[Node DEBUG wpApiService] Error response data:", JSON.stringify(error.response.data, null, 2));
            // console.error("[Node DEBUG wpApiService] Error response headers:", error.response.headers); // Puede ser muy verboso
        } else {
            console.error("[Node DEBUG wpApiService] Error sin objeto response (ej: error de red):", error);
        }
        throw error;
    }
};

/**
 * Obtiene los detalles de una venta (pedido) específica desde WordPress por su ID.
 * @param {string} wpSiteUrl
 * @param {string} apiToken
 * @param {number|string} orderId - ID del pedido a obtener.
 * @returns {Promise<object|null>} Datos del pedido o null si no se encuentra.
 */
export const getWPSaleById = async (wpSiteUrl, apiToken, orderId) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        // Asumimos que el endpoint en el plugin será /sales/:id
        const response = await apiClient.get(`/sales/${orderId}`);
        let saleDetails = response.data;

        // Transformar line_items si es un objeto en lugar de un array
        if (saleDetails && saleDetails.line_items && typeof saleDetails.line_items === 'object' && !Array.isArray(saleDetails.line_items)) {
            console.log(`[wpApiService] Transformando line_items de objeto a array para venta ID: ${orderId}`);
            saleDetails.line_items = Object.values(saleDetails.line_items);
        }
        
        return saleDetails; 
    } catch (error) {
        console.error(`Error al obtener detalles de la venta ${orderId} desde WP API:`, error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        if (error.response && error.response.status === 404) {
            return null; // Devolver null si es un 404 para que el controlador lo maneje
        }
        throw error; // Re-lanzar otros errores
    }
};

/**
 * Crea un nuevo cliente/usuario en WordPress.
 * @param {string} wpSiteUrl
 * @param {string} apiToken
 * @param {object} customerData - Datos del cliente (email, first_name, last_name, phone, role)
 * @returns {Promise<object>} Datos del cliente creado.
 */
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

/**
 * Actualiza un cliente/usuario existente en WordPress.
 * @param {string} wpSiteUrl
 * @param {string} apiToken
 * @param {number|string} customerId - ID del cliente a actualizar.
 * @param {object} customerData - Datos del cliente a actualizar.
 * @returns {Promise<object>} Datos del cliente actualizado.
 */
export const updateWPCustomer = async (wpSiteUrl, apiToken, customerId, customerData) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        const response = await apiClient.put(`/users/${customerId}`, customerData); // O PATCH
        return response.data;
    } catch (error) {
        console.error(`Error al actualizar cliente ${customerId} en WP API:`, error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw error;
    }
};

/**
 * Obtiene un cliente/usuario específico desde WordPress por su ID.
 * @param {string} wpSiteUrl
 * @param {string} apiToken
 * @param {number|string} customerId - ID del cliente a obtener.
 * @returns {Promise<object>} Datos del cliente.
 */
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

/**
 * Elimina un usuario/cliente en WordPress.
 * @param {string} wpSiteUrl
 * @param {string} apiToken
 * @param {number|string} userId - ID del usuario a eliminar.
 * @returns {Promise<object>} Respuesta de la API de WP (ej: { success: true, message: "..."}).
 */
export const deleteWPUser = async (wpSiteUrl, apiToken, userId) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        // WordPress requiere que se especifique un usuario para reasignar los posts,
        // o forzar la eliminación de posts. El endpoint del plugin debe manejar esto.
        // Por ahora, asumimos que el endpoint del plugin maneja la lógica de reasignación o no.
        const response = await apiClient.delete(`/users/${userId}?reassign=1`); // Ejemplo: reasignar al usuario con ID 1 (admin)
                                                                            // O podrías pasar un parámetro 'force=true' si el plugin lo soporta
                                                                            // para eliminar posts sin reasignar.
        return response.data; 
    } catch (error) {
        console.error(`Error al eliminar usuario ${userId} en WP API:`, error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw error;
    }
};

/**
 * Valida un código de cupón contra la API de WordPress.
 * @param {string} wpSiteUrl
 * @param {string} apiToken
 * @param {string} couponCode
 * @param {number} [cartSubtotal] - Subtotal del carrito, puede ser necesario para algunas validaciones de cupones.
 * @returns {Promise<object>} Detalles del cupón si es válido.
 */
export const validateWPCoupon = async (wpSiteUrl, apiToken, couponCode, cartSubtotal) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        const payload = { coupon_code: couponCode };
        if (cartSubtotal !== undefined) {
            payload.cart_subtotal = cartSubtotal;
        }
        // Asumimos que el endpoint en WP es /coupons/validate
        const response = await apiClient.post('/coupons/validate', payload);
        return response.data; // Esperamos que WP devuelva { success: true, discountType, discountAmount, ... } o { success: false, message }
    } catch (error) {
        console.error(`Error al validar cupón "${couponCode}" en WP API:`, error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        // Si el error es un 404 o similar porque el cupón no es válido, WP API debería devolver success: false.
        // Si es un error de conexión o servidor, se lanzará la excepción.
        if (error.response && error.response.data) {
            throw error.response.data; // Re-lanzar el objeto de error de la API de WP si está disponible
        }
        throw error;
    }
};

/**
 * Crea una nueva venta (pedido) en WordPress.
 * @param {string} wpSiteUrl
 * @param {string} apiToken
 * @param {object} saleData - Datos de la venta (incluyendo cart, customerId, paymentMethod, couponCode, customerNote, etc.)
 * @param {object} currentUser - Información del usuario POS que realiza la venta.
 * @returns {Promise<object>} Datos de la venta creada en WordPress.
 */
export const createWPSale = async (wpSiteUrl, apiToken, saleData, currentUser) => {
    const apiClient = getApiClient(wpSiteUrl, apiToken);
    try {
        // Aquí necesitarás transformar saleData al formato exacto que espera tu endpoint de creación de pedidos en WP.
        // Esto es solo un ejemplo de cómo podrías estructurarlo.
        const orderPayload = {
            customer_id: saleData.customerId,
            payment_method: saleData.paymentMethod, // ej: 'bacs', 'cod'
            payment_method_title: saleData.paymentTitle, // O obtener el título real
            // set_paid: true, // O false dependiendo de si el pago se confirma inmediatamente
            billing: saleData.billing || {}, // Usar los datos de billing enviados desde el TPV
            shipping: saleData.shipping || saleData.billing || {}, // Usar shipping si existe, sino billing como fallback
            line_items: saleData.cart.map(item => ({
                product_id: item.id.includes('-') ? parseInt(item.id.split('-')[0]) : parseInt(item.id), // Asumiendo que item.id es product_id o variation_id
                variation_id: item.id.includes('-') ? parseInt(item.id.split('-')[1]) : 0,
                quantity: item.quantity,
                name: item.name, // Nombre del producto en el momento de la venta
                price: item.price, // Precio unitario final (puede haber sido modificado)
                total: (item.quantity * item.price).toFixed(2) // Precio total por línea
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
            // La API de WP debería aplicar el descuento basado en el código del cupón.
        }

        if (saleData.saleType === 'suscripcion') {
            orderPayload.meta_data.push({ key: '_subscription_title', value: saleData.subscriptionTitle });
            orderPayload.meta_data.push({ key: '_subscription_expiry', value: saleData.subscriptionExpiry });
        }
        
        console.log("Payload para crear pedido en WP:", JSON.stringify(orderPayload, null, 2));

        // Asumimos que el endpoint en WP es /sales (o /orders)
        const response = await apiClient.post('/sales', orderPayload);
        return response.data; // Esperamos que WP devuelva los detalles del pedido creado.
    } catch (error) {
        console.error("Error al crear venta en WP API:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message, error.stack);
        if (error.response && error.response.data) {
            throw error.response.data;
        }
        throw error;
    }
};
