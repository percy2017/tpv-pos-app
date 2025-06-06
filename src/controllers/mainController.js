import PDFDocument from 'pdfkit';
import fs from 'fs/promises';
import path from 'path';
// Asumimos que getWPSaleById se exporta desde wpApiService.js y se puede importar así.
// Si está dentro de un import() dinámico, la estrategia para usarla aquí necesitará ajuste.
// Por ahora, para la estructura:
import { getWPSaleById, getWPOrderStatusCounts } from '../services/wpApiService.js'; // Añadido getWPOrderStatusCounts

const APP_CONFIG_PATH = path.join(process.cwd(), 'data', 'app-config.json');

// Helper para leer la configuración
async function readAppSettings() {
    try {
        const data = await fs.readFile(APP_CONFIG_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // Si el archivo no existe o hay error al parsear, devolver un objeto por defecto o lanzar error
        console.error('Error al leer app-config.json:', error);
        // Devolver una estructura por defecto para evitar errores en la carga inicial si el archivo no existe
        return {
            evolution_api: { url: "", token: "" },
            n8n: { production_url: "", testing_url: "" },
            socket: { url: "", room: "" }
        };
    }
}

// Helper para escribir la configuración
async function writeAppSettings(config) {
    try {
        await fs.writeFile(APP_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error) {
        console.error('Error al escribir en app-config.json:', error);
        throw error; // Re-lanzar para que el controlador lo maneje
    }
}

export const showDashboard = async (req, res) => { // Convertido a async
    const wpSiteUrl = req.session.wp_site_url;
    const apiToken = req.session.api_token;
    let dashboardData = {
        orderCounts: null,
        // Aquí se añadirán más datos del dashboard (ventasMes, topSeller, etc.)
        error: null
    };

    if (wpSiteUrl && apiToken) {
        try {
            // Obtener contadores de estado de pedidos
            dashboardData.orderCounts = await getWPOrderStatusCounts(wpSiteUrl, apiToken);
            if (dashboardData.orderCounts.error) {
                console.warn("Error parcial al cargar datos del dashboard (orderCounts):", dashboardData.orderCounts);
                // No sobreescribir el error principal si otros datos sí cargan.
            }

            // Aquí se llamarían a otras funciones para obtener más datos del dashboard
            // ej: dashboardData.salesSummary = await getWPSalesSummary(wpSiteUrl, apiToken);

        } catch (error) {
            console.error("Error al cargar datos para el dashboard:", error.message);
            dashboardData.error = 'No se pudieron cargar algunos datos del dashboard desde WordPress.';
            if (error.response && error.response.status === 401) {
                dashboardData.error = 'Error de autenticación al cargar datos del dashboard. Tu token podría haber expirado.';
            } else if (error.response && error.response.status === 403) {
                dashboardData.error = 'No tienes permiso para ver algunos datos del dashboard.';
            }
        }
    } else {
        dashboardData.error = 'No se pudo conectar al sitio de WordPress para cargar datos del dashboard. Por favor, inicia sesión.';
    }

    res.render('index', { 
        title: 'Dashboard',
        dashboardData: dashboardData
    });
};

export const showPos = async (req, res) => {
    const wpSiteUrl = req.session.wp_site_url;
    const apiToken = req.session.api_token;
    const searchTerm = req.query.search || '';
    let productsData = [];
    let paymentGatewaysData = [];
    let posPageError = null; 

    if (!wpSiteUrl || !apiToken) {
        console.error('showPos: Falta wp_site_url o api_token en la sesión.');
        posPageError = 'No se pudo conectar al sitio de WordPress. Por favor, inicia sesión de nuevo.';
    } else {
        try {
            // Cargar productos
            const { getWPProducts, getWPPaymentGateways } = await import('../services/wpApiService.js');
            let productsResult;
            const perPage = 20; 

            if (searchTerm) {
                productsResult = await getWPProducts(wpSiteUrl, apiToken, 1, perPage, searchTerm, false);
            } else {
                productsResult = await getWPProducts(wpSiteUrl, apiToken, 1, perPage, '', true);
            }
            productsData = productsResult.data || [];

            if (productsData.length === 0 && searchTerm) {
                posPageError = `No se encontraron productos para "${searchTerm}".`;
            } else if (productsData.length === 0 && !searchTerm) {
                // No establecer error si no hay destacados, simplemente no se muestran
                // posPageError = 'No hay productos destacados para mostrar.'; 
            }

            // Cargar pasarelas de pago
            try {
                paymentGatewaysData = await getWPPaymentGateways(wpSiteUrl, apiToken);
            } catch (pgError) {
                console.error("Error en mainController.showPos al obtener pasarelas de pago:", pgError.message);
                // No sobrescribir el error de productos si ya existe, pero podríamos añadir un mensaje específico
                if (!posPageError) {
                    posPageError = 'No se pudieron cargar las pasarelas de pago.';
                } else {
                    posPageError += ' Además, no se pudieron cargar las pasarelas de pago.';
                }
            }

        } catch (prodError) { // Error al cargar productos
            console.error("Error en mainController.showPos al obtener productos:", prodError.message);
            posPageError = 'No se pudieron cargar los productos desde WordPress.';
            if (prodError.response && prodError.response.status === 401) {
                posPageError = 'Error de autenticación al obtener productos. Tu token podría haber expirado.';
            } else if (prodError.response && prodError.response.status === 403) {
                posPageError = 'No tienes permiso para ver los productos.';
            }
            // Intentar cargar pasarelas incluso si fallan los productos
            try {
                const { getWPPaymentGateways } = await import('../services/wpApiService.js');
                paymentGatewaysData = await getWPPaymentGateways(wpSiteUrl, apiToken);
            } catch (pgError) {
                console.error("Error en mainController.showPos al obtener pasarelas de pago (después de error de productos):", pgError.message);
                posPageError += ' Tampoco se pudieron cargar las pasarelas de pago.';
            }
        }
    }
    
    res.render('pos', {
        title: 'TPV',
        products: productsData,
        paymentGateways: paymentGatewaysData,
        search: searchTerm, 
        error: posPageError // Pasar el error acumulado
    });
};

export const searchProductsApi = async (req, res) => {
    const wpSiteUrl = req.session.wp_site_url;
    const apiToken = req.session.api_token;
    const searchTerm = req.query.search || '';
    // El parámetro 'featured' podría venir como string 'true'/'false' o no estar.
    // Lo convertimos a booleano, default a false si no se especifica para búsqueda.
    // Si searchTerm está vacío, podríamos querer devolver destacados por defecto.
    let featuredSearch = req.query.featured === 'true';

    if (!wpSiteUrl || !apiToken) {
        return res.status(401).json({ error: 'Autenticación requerida. No se pudo conectar a WordPress.' });
    }

    if (!searchTerm && !featuredSearch) {
        // Si no hay término de búsqueda y no se piden explícitamente destacados,
        // podríamos devolver una lista vacía o un error, o los destacados por defecto.
        // Por ahora, si no hay search, asumimos que se quieren destacados si no se especifica featured=false.
        // O, si la UI siempre pasa 'featured' o 'search', este caso es menos probable.
        // Para la búsqueda desde el TPV, si searchTerm está vacío, no deberíamos buscar nada o devolver favoritos.
        // Vamos a asumir que si no hay searchTerm, el frontend quiere los favoritos.
        if (!searchTerm) {
            featuredSearch = true; 
        }
    }
    
    try {
        const { getWPProducts } = await import('../services/wpApiService.js');
        const perPage = parseInt(req.query.per_page) || 20; // Productos por página
        const page = parseInt(req.query.page) || 1;

        const productsResult = await getWPProducts(wpSiteUrl, apiToken, page, perPage, searchTerm, featuredSearch);
        
        res.json({
            products: productsResult.data || [],
            total: productsResult.total || 0,
            totalPages: productsResult.totalPages || 0,
            currentPage: page
        });

    } catch (error) {
        console.error("Error en searchProductsApi al obtener productos:", error.message);
        let statusCode = 500;
        let errorMessage = 'No se pudieron cargar los productos desde WordPress.';
        if (error.response) {
            statusCode = error.response.status || 500;
            if (error.response.status === 401) {
                errorMessage = 'Error de autenticación al obtener productos. Tu token podría haber expirado.';
            } else if (error.response.status === 403) {
                errorMessage = 'No tienes permiso para ver los productos.';
            } else if (error.response.data && error.response.data.message) {
                errorMessage = error.response.data.message; // Usar mensaje de error de la API de WP si está disponible
            }
        }
        res.status(statusCode).json({ error: errorMessage });
    }
};

export const getSaleTicketPDF = async (req, res) => {
    const wpSiteUrl = req.session.wp_site_url;
    const apiToken = req.session.api_token;
    const saleId = req.params.id;

    if (!wpSiteUrl || !apiToken) {
        return res.status(401).json({ error: 'Autenticación requerida.' });
    }
    if (!saleId) {
        return res.status(400).json({ error: 'Se requiere ID de la venta.' });
    }

    try {
        // Obtener detalles de la venta usando el servicio existente
        // Nota: getWPSaleById es async, así que usamos await.
        // Asegúrate de que la función getWPSaleById esté disponible y funcione como se espera.
        const saleDetails = await getWPSaleById(wpSiteUrl, apiToken, saleId);

        console.log(`[PDF Ticket DEBUG] saleDetails para ID ${saleId}:`, JSON.stringify(saleDetails, null, 2));

        if (!saleDetails) {
            console.error(`[PDF Ticket ERROR] No se encontraron detalles para la venta ID ${saleId}`);
            return res.status(404).send('Venta no encontrada');
        }

        const doc = new PDFDocument({
            size: [226.77, 841.89], // Ancho de 80mm (226.77 pt) y altura larga
            margins: { top: 10, bottom: 10, left: 5, right: 5 } // Márgenes ajustados para ticket
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="ticket-${saleId}.pdf"`);

        doc.pipe(res);

        // Contenido del Ticket
        doc.fontSize(10).text('Mi Tienda POS', { align: 'center' });
        if (saleDetails.billing_address) { // Ejemplo, si tienes datos de la tienda
             // doc.fontSize(8).text(saleDetails.store_address_line_1, { align: 'center' });
             // doc.fontSize(8).text(saleDetails.store_phone, { align: 'center' });
        }
        doc.moveDown(0.5);
        doc.fontSize(8).text(`Ticket ID: ${saleDetails.id}`, { align: 'left' });
        doc.text(`Fecha: ${new Date(saleDetails.date_created).toLocaleString()}`, { align: 'left' });
        doc.text(`Cliente: ${saleDetails.customer_name || 'Invitado'}`, { align: 'left' });
        if(saleDetails.billing_phone){
            doc.text(`Tel: ${saleDetails.billing_phone}`, { align: 'left' });
        }
        doc.moveDown();
        // Línea separadora simple
        const lineWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        doc.lineCap('butt').moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
        doc.moveDown(0.5);

        // Definición de columnas para ítems (80mm de ancho de página ~ 226 puntos)
        // Márgenes son 5pt a cada lado, así que el área útil es ~216 pt.
        const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const colWidthQty = 35;
        const colWidthTotalItem = 50;
        const colWidthProduct = availableWidth - colWidthQty - colWidthTotalItem - 10; // -10 para pequeños espacios entre columnas

        const colProductX = doc.page.margins.left;
        const colQtyX = colProductX + colWidthProduct + 5;
        const colTotalItemX = colQtyX + colWidthQty + 5;

        doc.fontSize(8);
        const headerY = doc.y;
        doc.text('Producto', colProductX, headerY, { width: colWidthProduct, align: 'left' });
        doc.text('Cant.', colQtyX, headerY, { width: colWidthQty, align: 'right' });
        doc.text('Total', colTotalItemX, headerY, { width: colWidthTotalItem, align: 'right' });
        doc.moveDown(1.5); // Más espacio después de cabeceras
        
        // Línea después de cabeceras
        doc.lineCap('butt').moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
        doc.moveDown(0.5);
        
        // Ítems
        if (saleDetails.line_items && Array.isArray(saleDetails.line_items) && saleDetails.line_items.length > 0) {
            saleDetails.line_items.forEach(item => {
                doc.fontSize(7);
                const itemStartY = doc.y;
                
                // Dibujar nombre del producto (puede ocupar varias líneas)
                doc.text(item.name, colProductX, itemStartY, { width: colWidthProduct, align: 'left' });
                // Calcular la altura que ocupó el nombre del producto
                const productNameHeight = doc.heightOfString(item.name, { width: colWidthProduct, align: 'left' });

                // Dibujar cantidad y total en la misma línea Y inicial del nombre
                doc.text(item.quantity.toString(), colQtyX, itemStartY, { width: colWidthQty, align: 'right' });
                doc.text(parseFloat(item.total).toFixed(2), colTotalItemX, itemStartY, { width: colWidthTotalItem, align: 'right' });
                
                // Avanzar Y basado en la altura del elemento más alto de la fila (usualmente el nombre del producto)
                doc.y = itemStartY + productNameHeight + 3; // +3 para un pequeño margen inferior
            });
        } else {
            doc.moveDown(0.5);
            doc.fontSize(8).text('No hay productos detallados en este pedido.', { align: 'center', width: availableWidth });
            console.warn(`[PDF Ticket WARN] Venta ID ${saleId}: No se encontraron line_items o no es un array. Contenido de line_items:`, saleDetails.line_items);
        }
        doc.moveDown(0.5);
        doc.lineCap('butt').moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
        doc.moveDown(0.5);

        // Totales
        const totalsLabelX = doc.page.margins.left + 80; // Ajustar para que las etiquetas queden más a la izquierda
        const totalsAmountX = doc.page.width - doc.page.margins.right - colWidthTotalItem; // Alinear montos con la columna de total de ítems
        const totalsWidth = colWidthTotalItem; // Ancho para los montos

        let subtotalForCalc = 0;
        if (saleDetails.line_items && Array.isArray(saleDetails.line_items)) {
            subtotalForCalc = saleDetails.line_items.reduce((acc, item) => acc + parseFloat(item.total || 0), 0);
        }
        // Si el subtotal viene de WooCommerce (ej. saleDetails.subtotal), usar ese.
        // Aquí asumimos que el subtotal es la suma de los totales de línea antes de impuestos de pedido.
        // WooCommerce a veces calcula 'subtotal' de forma diferente.
        // Por ahora, usaremos la suma de los totales de línea como subtotal visible si no hay impuestos de pedido.
        // Si hay impuestos de pedido, el 'total' de la venta ya los incluye.
        // El campo 'total_tax' de WooCommerce es el impuesto total del pedido.
        // El 'total' del pedido es subtotal_items - descuentos_items + impuestos_items + fees + shipping_total + impuestos_shipping - descuentos_pedido.

        const displaySubtotal = saleDetails.total - (saleDetails.total_tax || 0); // Un subtotal antes de impuestos de pedido

        doc.fontSize(8);
        doc.text('SUBTOTAL:', totalsLabelX, doc.y, { width: 60, align: 'right' }); // Ancho para la etiqueta
        doc.text(`${saleDetails.currency} ${parseFloat(displaySubtotal).toFixed(2)}`, totalsAmountX, doc.y, { width: totalsWidth, align: 'right' });
        doc.moveDown(0.3);

        if (saleDetails.total_tax && parseFloat(saleDetails.total_tax) > 0) {
            doc.text('IMPUESTOS:', totalsLabelX, doc.y, { width: 60, align: 'right' });
            doc.text(`${saleDetails.currency} ${parseFloat(saleDetails.total_tax).toFixed(2)}`, totalsAmountX, doc.y, { width: totalsWidth, align: 'right' });
            doc.moveDown(0.3);
        }
        
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('TOTAL:', totalsLabelX, doc.y, { width: 60, align: 'right' });
        doc.text(`${saleDetails.currency} ${parseFloat(saleDetails.total).toFixed(2)}`, totalsAmountX, doc.y, { width: totalsWidth, align: 'right' });
        doc.font('Helvetica'); // Reset font
        doc.moveDown();
        
        if (saleDetails.payment_method_title) {
            doc.fontSize(8).text(`Pagado con: ${saleDetails.payment_method_title}`, { align: 'center' });
            doc.moveDown(0.5);
        }

        doc.fontSize(8).text('¡Gracias por su compra!', { align: 'center' });
        if (saleDetails.customer_note) {
            doc.moveDown();
            doc.fontSize(7).text('Nota:', { align: 'center' });
            doc.fontSize(7).text(saleDetails.customer_note, { align: 'center', width: lineWidth });
        }

        doc.end();

    } catch (error) {
        console.error("Error generando PDF del ticket:", error.message, error.stack);
        if (!res.headersSent) {
            res.status(500).send('Error al generar el PDF del ticket');
        }
    }
};

export const showSales = async (req, res) => {
    console.log('--- EJECUTANDO showSales ---'); 
    const wpSiteUrl = req.session.wp_site_url;
    const apiToken = req.session.api_token;
    
    if (!wpSiteUrl || !apiToken) {
        console.error('Falta wp_site_url o api_token en la sesión para cargar ventas.');
        return res.render('sales', { 
            title: 'Ventas', 
            sales: [], 
            error: 'No se pudo conectar al sitio de WordPress. Por favor, inicia sesión de nuevo.',
            currentPage: 1,
            totalPages: 0
        });
    }
    // Para DataTables server-side, la vista inicial no necesita cargar datos.
    // DataTables hará una petición AJAX.
    res.render('sales', { 
        title: 'Historial de Ventas',
        // No pasamos 'sales' aquí, DataTables los cargará.
        // currentUser: req.session.user // Ya se pasa globalmente
    });
};

export const showUsers = async (req, res) => {
    const wpSiteUrl = req.session.wp_site_url;
    const apiToken = req.session.api_token;

    if (!wpSiteUrl || !apiToken) {
        console.error('Falta wp_site_url o api_token en la sesión para cargar usuarios.');
        return res.render('users', {
            title: 'Usuarios',
            users: [], // DataTables cargará los datos
            error: 'No se pudo conectar al sitio de WordPress. Por favor, inicia sesión de nuevo.'
        });
    }
    // Para DataTables server-side, la vista inicial no necesita cargar datos.
    res.render('users', {
        title: 'Gestión de Usuarios'
    });
};

export const apiGetUsersForDataTable = async (req, res) => {
    const wpSiteUrl = req.session.wp_site_url;
    const apiToken = req.session.api_token;

    if (!wpSiteUrl || !apiToken) {
        return res.status(401).json({ error: 'Autenticación requerida.' });
    }

    try {
        const { getWPUsers } = await import('../services/wpApiService.js');
        
        const draw = req.body.draw;
        const start = parseInt(req.body.start) || 0;
        const length = parseInt(req.body.length) || 10;
        const searchValue = req.body.search?.value || '';
        // phoneSearchValue ya no es necesario aquí
        
        const page = Math.floor(start / length) + 1;
        const perPage = length;

        let orderBy = 'display_name'; 
        let orderDir = 'asc'; 

        if (req.body.order && req.body.order.length > 0) {
            const orderColumnIndex = parseInt(req.body.order[0].column);
            const orderColumnName = req.body.columns[orderColumnIndex]?.data; 
            
            const validOrderByColumns = {
                'id': 'ID',
                'display_name': 'display_name',
                'username': 'login',
                'email': 'email'
            };
            if (orderColumnName && validOrderByColumns[orderColumnName]) {
                orderBy = validOrderByColumns[orderColumnName];
            }
            orderDir = req.body.order[0].dir === 'desc' ? 'desc' : 'asc';
        }
        
        console.log(`[TVP-POS DEBUG] apiGetUsersForDataTable: page=${page}, perPage=${perPage}, search=${searchValue}, orderBy=${orderBy}, orderDir=${orderDir}`);
        const usersResult = await getWPUsers(wpSiteUrl, apiToken, page, perPage, '', searchValue, orderBy, orderDir);

        res.json({
            draw: parseInt(draw),
            recordsTotal: usersResult.recordsTotal || 0,
            recordsFiltered: usersResult.recordsFiltered || 0, 
            data: usersResult.data || []
        });

    } catch (error) {
        console.error("Error en apiGetUsersForDataTable:", error.message);
        res.status(500).json({ 
            error: 'Error al obtener datos de usuarios para DataTables.',
            draw: parseInt(req.body.draw) || 0,
            recordsTotal: 0,
            recordsFiltered: 0,
            data: []
        });
    }
};

export const apiGetSalesForDataTable = async (req, res) => {
    const wpSiteUrl = req.session.wp_site_url;
    const apiToken = req.session.api_token;

    if (!wpSiteUrl || !apiToken) {
        return res.status(401).json({ error: 'Autenticación requerida.' });
    }

    try {
        const { getWPSales } = await import('../services/wpApiService.js');
        
        const draw = req.body.draw;
        const start = parseInt(req.body.start) || 0;
        const length = parseInt(req.body.length) || 10;
        const searchValue = req.body.search?.value || '';
        
        const page = Math.floor(start / length) + 1;
        const perPage = length;

        let orderBy = 'date'; // Default para ventas
        let orderDir = 'desc'; // Default para ventas

        if (req.body.order && req.body.order.length > 0) {
            const orderColumnIndex = parseInt(req.body.order[0].column);
            const orderColumnName = req.body.columns[orderColumnIndex]?.data;
            
            const validOrderByColumns = { // Mapeo de 'data' de DataTables a campos de WC_Order_Query
                'id': 'ID',
                'date_created': 'date',
                'status': 'status',
                'total': 'total'
                // 'customer_name' es más complejo de ordenar directamente en la query principal
            };
            if (orderColumnName && validOrderByColumns[orderColumnName]) {
                orderBy = validOrderByColumns[orderColumnName];
            }
            orderDir = req.body.order[0].dir === 'desc' ? 'desc' : 'asc';
        }
        
        console.log(`[TVP-POS DEBUG] apiGetSalesForDataTable: page=${page}, perPage=${perPage}, search=${searchValue}, orderBy=${orderBy}, orderDir=${orderDir}`);
        // Ya no se pasa phoneSearchValue. El servicio getWPSales se adaptará para no esperarlo.
        const salesResult = await getWPSales(wpSiteUrl, apiToken, page, perPage, null, searchValue, orderBy, orderDir, req.body.columns, req.body.order);

        res.json({
            draw: parseInt(draw),
            recordsTotal: salesResult.recordsTotal || 0,
            recordsFiltered: salesResult.recordsFiltered || 0,
            data: salesResult.data || []
        });

    } catch (error) {
        console.error("Error en apiGetSalesForDataTable:", error.message);
        res.status(500).json({ 
            error: 'Error al obtener datos de ventas para DataTables.',
            draw: parseInt(req.body.draw) || 0,
            recordsTotal: 0,
            recordsFiltered: 0,
            data: []
        });
    }
};


// --- API Controllers para Clientes ---

export const apiSearchCustomers = async (req, res) => {
    const wpSiteUrl = req.session.wp_site_url;
    const apiToken = req.session.api_token;
    const searchTerm = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 10;

    if (!wpSiteUrl || !apiToken) {
        return res.status(401).json({ error: 'Autenticación requerida.' });
    }

    try {
        const { searchWPCustomers } = await import('../services/wpApiService.js');
        const result = await searchWPCustomers(wpSiteUrl, apiToken, searchTerm, perPage, page);
        res.json(result); 
    } catch (error) {
        console.error("API Error al buscar clientes:", error.message);
        res.status(500).json({ error: 'Error al buscar clientes.' });
    }
};

export const apiCreateCustomer = async (req, res) => {
    const wpSiteUrl = req.session.wp_site_url;
    const apiToken = req.session.api_token;
    const customerData = req.body; 

    if (!wpSiteUrl || !apiToken) {
        return res.status(401).json({ error: 'Autenticación requerida.' });
    }
    if (!customerData.email) { 
        return res.status(400).json({ error: 'El correo electrónico es obligatorio.' });
    }

    try {
        const { createWPCustomer } = await import('../services/wpApiService.js');
        const newCustomer = await createWPCustomer(wpSiteUrl, apiToken, customerData);
        res.status(201).json(newCustomer); 
    } catch (error) {
        console.error("API Error al crear cliente:", error.message, error.response?.data);
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.message || 'Error al crear el cliente.';
        res.status(statusCode).json({ error: errorMessage });
    }
};

export const apiUpdateCustomer = async (req, res) => {
    const wpSiteUrl = req.session.wp_site_url;
    const apiToken = req.session.api_token;
    const customerId = req.params.id;
    const customerData = req.body;

    if (!wpSiteUrl || !apiToken) {
        return res.status(401).json({ error: 'Autenticación requerida.' });
    }
    if (!customerId) {
        return res.status(400).json({ error: 'Se requiere ID de cliente.' });
    }

    try {
        const { updateWPCustomer } = await import('../services/wpApiService.js');
        const updatedCustomer = await updateWPCustomer(wpSiteUrl, apiToken, customerId, customerData);
        res.json(updatedCustomer);
    } catch (error) {
        console.error(`API Error al actualizar cliente ${customerId}:`, error.message, error.response?.data);
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.message || 'Error al actualizar el cliente.';
        res.status(statusCode).json({ error: errorMessage });
    }
};

export const apiGetCustomerById = async (req, res) => {
    const wpSiteUrl = req.session.wp_site_url;
    const apiToken = req.session.api_token;
    const customerId = req.params.id;
    console.log('[TVP-POS DEBUG] mainController.js - apiGetCustomerById - ID Recibido:', customerId);

    if (!wpSiteUrl || !apiToken) {
        return res.status(401).json({ error: 'Autenticación requerida.' });
    }
    if (!customerId) {
        return res.status(400).json({ error: 'Se requiere ID de cliente.' });
    }

    try {
        const { getWPCustomerById } = await import('../services/wpApiService.js');
        const customer = await getWPCustomerById(wpSiteUrl, apiToken, customerId);
        console.log('[TVP-POS DEBUG] mainController.js - apiGetCustomerById - Cliente obtenido del servicio:', customer);
        if (!customer) { 
            return res.status(404).json({ error: 'Cliente no encontrado.' });
        }
        res.json(customer);
    } catch (error) {
        console.error(`API Error al obtener cliente ${customerId}:`, error.message);
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.message || `Error al obtener el cliente ${customerId}.`;
        res.status(statusCode).json({ error: errorMessage });
    }
};

export const apiDeleteUser = async (req, res) => {
    const wpSiteUrl = req.session.wp_site_url;
    const apiToken = req.session.api_token;
    const userId = req.params.id;

    if (!wpSiteUrl || !apiToken) {
        return res.status(401).json({ success: false, message: 'Autenticación requerida.' });
    }
    if (!userId) {
        return res.status(400).json({ success: false, message: 'Se requiere ID de usuario.' });
    }

    try {
        const { deleteWPUser } = await import('../services/wpApiService.js');
        const result = await deleteWPUser(wpSiteUrl, apiToken, userId);
        if (result && result.success) {
            res.json({ success: true, message: result.message || 'Usuario eliminado correctamente.' });
        } else {
            res.status(result.statusCode || 400).json({ success: false, message: result.message || 'No se pudo eliminar el usuario desde WordPress.' });
        }
    } catch (error) {
        console.error(`API Error al eliminar usuario ${userId}:`, error.message, error.response?.data);
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.message || `Error al eliminar el usuario ${userId}.`;
        res.status(statusCode).json({ success: false, message: errorMessage });
    }
};

export const apiGetUserSales = async (req, res) => {
    const wpSiteUrl = req.session.wp_site_url;
    const apiToken = req.session.api_token;
    const userId = req.params.id; 

    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 100; 


    if (!wpSiteUrl || !apiToken) {
        return res.status(401).json({ error: 'Autenticación requerida.' });
    }
    if (!userId) {
        return res.status(400).json({ error: 'Se requiere ID de usuario.' });
    }

    try {
        const { getWPSales } = await import('../services/wpApiService.js');
        const salesResult = await getWPSales(wpSiteUrl, apiToken, page, perPage, userId);
        
        console.log(`[TVP-POS DEBUG] mainController.js - apiGetUserSales - Ventas obtenidas para usuario ${userId}:`, salesResult.data ? salesResult.data.length : 0);
        res.json(salesResult); 

    } catch (error) {
        console.error(`API Error al obtener ventas para usuario ${userId}:`, error.message);
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.message || `Error al obtener las ventas del usuario ${userId}.`;
        res.status(statusCode).json({ error: errorMessage, data: [], total: 0, totalPages: 0 });
    }
};


// --- API Controllers para Eventos Manuales del Calendario ---
import { 
    addManualEvent, 
    updateManualEvent, 
    deleteManualEvent,
    readManualEvents
    // getManualEvents // Eliminada esta línea, no existe en el servicio
} from '../utils/manualEventsService.js';

// Nuevo controlador para obtener solo eventos manuales
export const apiGetManualEvents = async (req, res) => {
    try {
        const { search: searchTerm } = req.query; // Podríamos añadir start/end si es necesario filtrar por fecha aquí
        let manualEvents = await readManualEvents();
        if (searchTerm) {
            const lowerSearchTerm = searchTerm.toLowerCase();
            manualEvents = manualEvents.filter(event =>
                (event.title && event.title.toLowerCase().includes(lowerSearchTerm)) ||
                (event.description && event.description.toLowerCase().includes(lowerSearchTerm))
            );
        }
        res.json(manualEvents);
    } catch (error) {
        console.error("API Error al obtener eventos manuales:", error);
        res.status(500).json({ error: error.message || 'Error al obtener los eventos manuales.' });
    }
};

export const apiCreateManualEvent = async (req, res) => {
    try {
        const eventData = req.body;
        if (!eventData.title || !eventData.start) {
            return res.status(400).json({ error: 'Título y fecha de inicio son obligatorios para el evento.' });
        }
        const newEvent = await addManualEvent(eventData);
        res.status(201).json(newEvent);
    } catch (error) {
        console.error("API Error al crear evento manual:", error);
        res.status(500).json({ error: error.message || 'Error al crear el evento manual.' });
    }
};

export const apiUpdateManualEvent = async (req, res) => {
    try {
        const eventId = req.params.id;
        const eventData = req.body;
        if (!eventId) {
            return res.status(400).json({ error: 'Se requiere ID del evento.' });
        }
        const updatedEvent = await updateManualEvent(eventId, eventData);
        if (!updatedEvent) {
            return res.status(404).json({ error: 'Evento manual no encontrado.' });
        }
        res.json(updatedEvent);
    } catch (error) {
        console.error("API Error al actualizar evento manual:", error);
        res.status(500).json({ error: error.message || 'Error al actualizar el evento manual.' });
    }
};

export const apiDeleteManualEvent = async (req, res) => {
    try {
        const eventId = req.params.id;
        if (!eventId) {
            return res.status(400).json({ error: 'Se requiere ID del evento.' });
        }
        const success = await deleteManualEvent(eventId);
        if (!success) {
            return res.status(404).json({ error: 'Evento manual no encontrado para eliminar.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error("API Error al eliminar evento manual:", error);
        res.status(500).json({ error: error.message || 'Error al eliminar el evento manual.' });
    }
};

// Nuevo controlador para obtener solo eventos de suscripción de WP
export const apiGetWPSubscriptionEventsOnly = async (req, res) => {
    const wpSiteUrl = req.session.wp_site_url;
    const apiToken = req.session.api_token;
    const { start, end, search: searchTerm } = req.query;

    // Este controlador SÍ requiere autenticación, que será manejada por el middleware en la ruta
    // if (!wpSiteUrl || !apiToken) { // Esta verificación ya la hace isAuthenticated
    //     return res.status(401).json({ error: 'Autenticación requerida.' });
    // }

    try {
        const { getWPSubscriptionEvents } = await import('../services/wpApiService.js');
        let subscriptionEvents = [];
        console.log("[Node DEBUG mainController] apiGetWPSubscriptionEventsOnly - Intentando obtener eventos de suscripción de WP...");
        subscriptionEvents = await getWPSubscriptionEvents(wpSiteUrl, apiToken, start, end, searchTerm);
        console.log(`[Node DEBUG mainController] apiGetWPSubscriptionEventsOnly - Eventos de suscripción de WP recibidos: ${subscriptionEvents ? subscriptionEvents.length : 'null/undefined'}`);
        if (!Array.isArray(subscriptionEvents)) {
            console.error("[Node DEBUG mainController] apiGetWPSubscriptionEventsOnly - getWPSubscriptionEvents no devolvió un array. Se usará array vacío.", subscriptionEvents);
            subscriptionEvents = [];
        }
        res.json(subscriptionEvents);
    } catch (wpError) {
        console.error("[Node DEBUG mainController] apiGetWPSubscriptionEventsOnly - Error explícito al obtener eventos de suscripción de WP:", wpError.message);
        // Devolver un array vacío o un error JSON apropiado
        res.status(500).json({ error: 'Error al obtener eventos de suscripción de WordPress.', details: wpError.message, data: [] });
    }
};

// Controlador original apiGetCalendarEvents - podría ser deprecado o modificado si ya no se usa directamente
export const apiGetCalendarEvents = async (req, res) => {
    const wpSiteUrl = req.session.wp_site_url;
    const apiToken = req.session.api_token;
    const { start, end, search: searchTerm } = req.query; 

    console.log(`[Node DEBUG mainController] apiGetCalendarEvents - Solicitud recibida. Start: ${start}, End: ${end}, Search: ${searchTerm}`);

    if (!wpSiteUrl || !apiToken) {
        console.error("[Node DEBUG mainController] apiGetCalendarEvents - Error: Autenticación requerida (falta wpSiteUrl o apiToken en sesión).");
        return res.status(401).json({ error: 'Autenticación requerida.' });
    }

    try {
        const { getWPSubscriptionEvents } = await import('../services/wpApiService.js');
        let manualEvents = await readManualEvents(); 
        console.log(`[Node DEBUG mainController] apiGetCalendarEvents - Eventos manuales leídos: ${manualEvents.length}`);
        
        if (searchTerm) {
            const lowerSearchTerm = searchTerm.toLowerCase();
            manualEvents = manualEvents.filter(event => 
                (event.title && event.title.toLowerCase().includes(lowerSearchTerm)) ||
                (event.description && event.description.toLowerCase().includes(lowerSearchTerm))
            );
            console.log(`[Node DEBUG mainController] apiGetCalendarEvents - Eventos manuales después de filtrar por "${searchTerm}": ${manualEvents.length}`);
        }
        
        let subscriptionEvents = [];
        try {
            console.log("[Node DEBUG mainController] apiGetCalendarEvents - Intentando obtener eventos de suscripción de WP...");
            subscriptionEvents = await getWPSubscriptionEvents(wpSiteUrl, apiToken, start, end, searchTerm);
            console.log(`[Node DEBUG mainController] apiGetCalendarEvents - Eventos de suscripción de WP recibidos: ${subscriptionEvents ? subscriptionEvents.length : 'null/undefined'}`);
            if (!Array.isArray(subscriptionEvents)) { // Asegurar que sea un array
                console.error("[Node DEBUG mainController] apiGetCalendarEvents - getWPSubscriptionEvents no devolvió un array. Se usará array vacío.", subscriptionEvents);
                subscriptionEvents = [];
            }
        } catch (wpError) { // Este catch podría no alcanzarse si getWPSubscriptionEvents ya maneja y devuelve []
            console.error("[Node DEBUG mainController] apiGetCalendarEvents - Error explícito al obtener eventos de suscripción de WP:", wpError.message);
            subscriptionEvents = []; // Asegurar que sea un array vacío en caso de error aquí
        }
        
        const allEvents = [...manualEvents, ...subscriptionEvents];
        console.log(`[Node DEBUG mainController] apiGetCalendarEvents - Total de eventos combinados a enviar: ${allEvents.length}`);
        return res.json(allEvents); // Asegurar que se retorna aquí

    } catch (error) { // Catch general
        console.error("[Node DEBUG mainController] apiGetCalendarEvents - Error FATAL al obtener eventos del calendario combinados:", error.message, error.stack);
        // Asegurarse de que incluso en un error inesperado, se envíe JSON
        if (!res.headersSent) {
            return res.status(500).json({ error: 'Error interno del servidor al obtener eventos del calendario.', details: error.message });
        }
    }
};

// --- Controlador para la Vista del Calendario ---
export const showCalendarView = (req, res) => {
    res.render('calendar', { title: 'Calendario de Vencimientos' });
};

// --- Controlador para la Vista de Configuración ---
export const showSettingsPage = async (req, res) => { // <--- AÑADIDO ASYNC AQUÍ
    console.log('[DEBUG] Dentro del controlador showSettingsPage');
    // Por ahora, solo renderizamos la vista.
    // Más adelante, cargaremos la configuración existente para pasarla a la vista.
    // Ahora sí cargamos la config para la vista:
    try {
        const config = await readAppSettings();
        res.render('settings', { 
            title: 'Configuración General',
            config: config 
        });
    } catch (error) {
        res.status(500).send('Error al cargar la página de configuración.');
    }
};

// --- API Endpoints para Configuración General ---
export const getAppSettings = async (req, res) => {
    try {
        const config = await readAppSettings();
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: 'Error al leer la configuración.' });
    }
};

export const saveAppSettings = async (req, res) => {
    try {
        const newConfig = req.body;
        // Aquí se podría añadir validación de los datos recibidos en newConfig
        // Por ejemplo, asegurar que las URLs son válidas, etc.
        await writeAppSettings(newConfig);
        res.json({ success: true, message: 'Configuración guardada exitosamente.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al guardar la configuración.' });
    }
};

// --- API Endpoints para Evolution API ---
import { 
    getEvolutionInstances as getEvoInstancesService,
    sendWhatsAppMessage as sendEvoWhatsAppMessageService
} from '../services/evolutionApiService.js';

export const getEvolutionApiInstances = async (req, res) => {
    try {
        const appConfig = await readAppSettings();
        if (!appConfig.evolution_api || !appConfig.evolution_api.url || !appConfig.evolution_api.token) {
            return res.status(500).json({ error: 'La configuración de Evolution API (URL y Token) no está completa.' });
        }

        const instances = await getEvoInstancesService(appConfig.evolution_api.url, appConfig.evolution_api.token);
        res.json(instances);
    } catch (error) {
        console.error('Error en getEvolutionApiInstances:', error.message);
        res.status(500).json({ error: error.message || 'Error al obtener las instancias de Evolution API.' });
    }
};

export const sendWhatsAppMessageController = async (req, res) => {
    try {
        const { phoneNumber, messageText, instanceName, orderId } = req.body; // orderId es opcional, para logging o futuras referencias

        if (!phoneNumber || !messageText || !instanceName) {
            return res.status(400).json({ error: 'Faltan parámetros: phoneNumber, messageText o instanceName son requeridos.' });
        }

        const appConfig = await readAppSettings();
        if (!appConfig.evolution_api || !appConfig.evolution_api.url || !appConfig.evolution_api.token) {
            return res.status(500).json({ error: 'La configuración de Evolution API (URL y Token) no está completa.' });
        }

        console.log(`[WhatsApp Controller] Intentando enviar mensaje a ${phoneNumber} via instancia ${instanceName}. Pedido: ${orderId || 'N/A'}`);
        
        // Aquí podrías añadir lógica para reemplazar placeholders en messageText si es necesario
        // Por ejemplo, si messageText es "Hola {cliente}, tu pedido {pedidoId}..."
        // y tienes esos datos, los reemplazarías antes de enviar.

        const evolutionResponse = await sendEvoWhatsAppMessageService(
            appConfig.evolution_api.url,
            appConfig.evolution_api.token,
            instanceName,
            phoneNumber,
            messageText
            // Podrías pasar 'options' adicionales si las necesitas
        );

        res.json({ success: true, message: 'Mensaje enviado (o en proceso de envío) a través de Evolution API.', data: evolutionResponse });

    } catch (error) {
        console.error('Error en sendWhatsAppMessageController:', error.message);
        res.status(500).json({ error: error.message || 'Error al enviar el mensaje de WhatsApp.' });
    }
};

// --- API para Cupones y Ventas TPV ---

export const apiValidateCoupon = async (req, res) => {
    const { couponCode, cartSubtotal } = req.body;
    const wpSiteUrl = req.session.wp_site_url;
    const apiToken = req.session.api_token;

    if (!wpSiteUrl || !apiToken) {
        return res.status(401).json({ success: false, message: 'Autenticación requerida.' });
    }
    if (!couponCode) {
        return res.status(400).json({ success: false, message: 'El código de cupón es requerido.' });
    }

    try {
        const { validateWPCoupon } = await import('../services/wpApiService.js');
        const couponDetails = await validateWPCoupon(wpSiteUrl, apiToken, couponCode, cartSubtotal);
        
        if (couponDetails.success) {
            res.json(couponDetails);
        } else {
            res.status(400).json(couponDetails); 
        }

    } catch (error) {
        console.error("API Error al validar cupón:", error.message, error);
        const errorMessage = error.message || 'Error al validar el cupón.';
        const statusCode = error.statusCode || (error.success === false ? 400 : 500); 
        res.status(statusCode).json({ success: false, message: errorMessage, details: error.details || null });
    }
};

export const apiGetSaleById = async (req, res) => {
    const wpSiteUrl = req.session.wp_site_url;
    const apiToken = req.session.api_token;
    const saleId = req.params.id;

    if (!wpSiteUrl || !apiToken) {
        return res.status(401).json({ error: 'Autenticación requerida.' });
    }
    if (!saleId) {
        return res.status(400).json({ error: 'Se requiere ID de la venta.' });
    }

    try {
        const { getWPSaleById } = await import('../services/wpApiService.js');
        const saleDetails = await getWPSaleById(wpSiteUrl, apiToken, saleId);
        if (!saleDetails) {
            return res.status(404).json({ error: 'Venta no encontrada.' });
        }
        res.json(saleDetails);
    } catch (error) {
        console.error(`API Error al obtener detalles de la venta ${saleId}:`, error.message, error.response?.data);
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.message || `Error al obtener detalles de la venta ${saleId}.`;
        res.status(statusCode).json({ error: errorMessage });
    }
};

export const apiProcessSale = async (req, res) => {
    const saleData = req.body;
    const wpSiteUrl = req.session.wp_site_url;
    const apiToken = req.session.api_token;
    const currentUser = req.session.user; 

    if (!wpSiteUrl || !apiToken) {
        return res.status(401).json({ success: false, message: 'Autenticación requerida.' });
    }

    if (!saleData.cart || saleData.cart.length === 0) {
        return res.status(400).json({ success: false, message: 'El carrito está vacío.' });
    }
    if (!saleData.customerId && saleData.customerId !== 0) { // Permitir customerId 0 para invitado
        return res.status(400).json({ success: false, message: 'El cliente es requerido.' });
    }
    if (!saleData.paymentMethod) {
        return res.status(400).json({ success: false, message: 'El método de pago es requerido.' });
    }
    if (saleData.saleType === 'suscripcion' && (!saleData.subscriptionTitle || !saleData.subscriptionExpiry)) {
        return res.status(400).json({ success: false, message: 'Para suscripciones, el título y la fecha de vencimiento son obligatorios.' });
    }
    
    try {
        console.log("Datos de venta recibidos en backend para procesar:", saleData);
        const { createWPSale } = await import('../services/wpApiService.js');
        const saleResultFromWP = await createWPSale(wpSiteUrl, apiToken, saleData, currentUser);
        
        res.status(201).json({ 
            success: true, 
            message: 'Venta procesada y registrada en WordPress exitosamente.', 
            data: saleResultFromWP 
        });

    } catch (error) {
        console.error("API Error al procesar la venta:", error.message, error.stack, error);
        const errorMessage = error.message || 'Error al procesar la venta.';
        const statusCode = error.statusCode || (error.success === false ? 400 : 500);
        res.status(statusCode).json({ success: false, message: errorMessage, details: error.details || null });
    }
};
