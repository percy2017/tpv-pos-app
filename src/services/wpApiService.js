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
 * @returns {Promise<object>} Un objeto con { data: array_de_ventas, recordsTotal: numero_total, recordsFiltered: numero_filtrado }
 */
export const getWPSales = async (wpSiteUrl, apiToken, page = 1, perPage = 10, customerId = null, searchTerm = '', orderBy = 'date', orderDir = 'DESC') => {
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
            params.search = searchTerm; // El plugin lo manejará
        }
        // Para el ordenamiento, el plugin espera 'orderby' y 'order' directamente
        // si no vienen de la estructura compleja de DataTables.
        // Si el controlador Node.js ya traduce los params de DT, aquí solo pasamos los simples.
        // Por ahora, asumimos que el controlador Node.js pasará los params de DT al plugin
        // y el plugin los interpretará. Si no, necesitaríamos pasar 'orderby' y 'order' aquí.
        // De hecho, el plugin ya está preparado para recibir 'order' (array) y 'columns' (array)
        // si se envían como query params, o los simples 'orderby' y 'order'.
        // Para simplificar, el controlador Node.js para DataTables pasará los params complejos.
        // Para la llamada simple desde showSales (si aún se usa), pasamos los simples.
        if (orderBy) params.orderby = orderBy; // Para llamadas que no son de DT
        if (orderDir) params.order = orderDir; // Para llamadas que no son de DT


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
    try {
        const params = {};
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
        if (searchTerm) params.search = searchTerm;
        
        const response = await apiClient.get('/subscription-events', { params });
        return response.data || [];
    } catch (error) {
        console.error("Error al obtener eventos de suscripción desde WP API:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw error;
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
        const response = await apiClient.get('/users', { params });
        return {
            data: response.data || [],
            total: parseInt(response.headers['x-wp-total'], 10) || 0,
            totalPages: parseInt(response.headers['x-wp-totalpages'], 10) || 0
        };
    } catch (error) {
        console.error("Error al buscar clientes desde WP API:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw error;
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
