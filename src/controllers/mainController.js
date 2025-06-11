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
            socket: { url: "", room: "" },
            chatwoot_api: { url: "", account_id: "", token: "" }
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
            }
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
            }
            
            try {
                paymentGatewaysData = await getWPPaymentGateways(wpSiteUrl, apiToken);
            } catch (pgError) {
                console.error("Error en mainController.showPos al obtener pasarelas de pago:", pgError.message);
                if (!posPageError) {
                    posPageError = 'No se pudieron cargar las pasarelas de pago.';
                } else {
                    posPageError += ' Además, no se pudieron cargar las pasarelas de pago.';
                }
            }

        } catch (prodError) { 
            console.error("Error en mainController.showPos al obtener productos:", prodError.message);
            posPageError = 'No se pudieron cargar los productos desde WordPress.';
            if (prodError.response && prodError.response.status === 401) {
                posPageError = 'Error de autenticación al obtener productos. Tu token podría haber expirado.';
            } else if (prodError.response && prodError.response.status === 403) {
                posPageError = 'No tienes permiso para ver los productos.';
            }
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
        error: posPageError
    });
};

export const searchProductsApi = async (req, res) => {
    const wpSiteUrl = req.session.wp_site_url;
    const apiToken = req.session.api_token;
    const searchTerm = req.query.search || '';
    let featuredSearch = req.query.featured === 'true';

    if (!wpSiteUrl || !apiToken) {
        return res.status(401).json({ error: 'Autenticación requerida. No se pudo conectar a WordPress.' });
    }

    if (!searchTerm && !featuredSearch) {
        if (!searchTerm) {
            featuredSearch = true; 
        }
    }
    
    try {
        const { getWPProducts } = await import('../services/wpApiService.js');
        const perPage = parseInt(req.query.per_page) || 20; 
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
                errorMessage = error.response.data.message;
            }
        }
        res.status(statusCode).json({ error: errorMessage });
    }
};

export const getSaleTicketPDF = async (req, res) => {
    const wpSiteUrl = req.session.wp_site_url;
    const apiToken = req.session.api_token;
    const saleId = req.params.id;

    if (!wpSiteUrl || !apiToken) return res.status(401).json({ error: 'Autenticación requerida.' });
    if (!saleId) return res.status(400).json({ error: 'Se requiere ID de la venta.' });

    try {
        const saleDetails = await getWPSaleById(wpSiteUrl, apiToken, saleId);
        if (!saleDetails) return res.status(404).send('Venta no encontrada');
        
        const doc = new PDFDocument({ size: [226.77, 841.89], margins: { top: 10, bottom: 10, left: 5, right: 5 } });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="ticket-${saleId}.pdf"`);
        doc.pipe(res);
        doc.fontSize(10).text('Mi Tienda POS', { align: 'center' }).moveDown(0.5);
        doc.fontSize(8).text(`Ticket ID: ${saleDetails.id}`, { align: 'left' })
           .text(`Fecha: ${new Date(saleDetails.date_created).toLocaleString()}`, { align: 'left' })
           .text(`Cliente: ${saleDetails.customer_name || 'Invitado'}`, { align: 'left' });
        if(saleDetails.billing_phone) doc.text(`Tel: ${saleDetails.billing_phone}`, { align: 'left' });
        doc.moveDown();
        const lineWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        doc.lineCap('butt').moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke().moveDown(0.5);
        
        const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const colWidthQty = 35, colWidthTotalItem = 50, colWidthProduct = availableWidth - colWidthQty - colWidthTotalItem - 10;
        const colProductX = doc.page.margins.left, colQtyX = colProductX + colWidthProduct + 5, colTotalItemX = colQtyX + colWidthQty + 5;
        
        doc.fontSize(8);
        const headerY = doc.y;
        doc.text('Producto', colProductX, headerY, { width: colWidthProduct, align: 'left' })
           .text('Cant.', colQtyX, headerY, { width: colWidthQty, align: 'right' })
           .text('Total', colTotalItemX, headerY, { width: colWidthTotalItem, align: 'right' });
        doc.moveDown(1.5).lineCap('butt').moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke().moveDown(0.5);

        if (saleDetails.line_items && Array.isArray(saleDetails.line_items) && saleDetails.line_items.length > 0) {
            saleDetails.line_items.forEach(item => {
                doc.fontSize(7);
                const itemStartY = doc.y;
                doc.text(item.name, colProductX, itemStartY, { width: colWidthProduct, align: 'left' });
                const productNameHeight = doc.heightOfString(item.name, { width: colWidthProduct, align: 'left' });
                doc.text(item.quantity.toString(), colQtyX, itemStartY, { width: colWidthQty, align: 'right' });
                doc.text(parseFloat(item.total).toFixed(2), colTotalItemX, itemStartY, { width: colWidthTotalItem, align: 'right' });
                doc.y = itemStartY + productNameHeight + 3; 
            });
        } else {
            doc.moveDown(0.5).fontSize(8).text('No hay productos detallados.', { align: 'center', width: availableWidth });
        }
        doc.moveDown(0.5).lineCap('butt').moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke().moveDown(0.5);

        const totalsLabelX = doc.page.margins.left + 80, totalsAmountX = doc.page.width - doc.page.margins.right - colWidthTotalItem, totalsWidth = colWidthTotalItem;
        const displaySubtotal = saleDetails.total - (saleDetails.total_tax || 0);
        doc.fontSize(8).text('SUBTOTAL:', totalsLabelX, doc.y, { width: 60, align: 'right' })
           .text(`${saleDetails.currency} ${parseFloat(displaySubtotal).toFixed(2)}`, totalsAmountX, doc.y, { width: totalsWidth, align: 'right' }).moveDown(0.3);
        if (saleDetails.total_tax && parseFloat(saleDetails.total_tax) > 0) {
            doc.text('IMPUESTOS:', totalsLabelX, doc.y, { width: 60, align: 'right' })
               .text(`${saleDetails.currency} ${parseFloat(saleDetails.total_tax).toFixed(2)}`, totalsAmountX, doc.y, { width: totalsWidth, align: 'right' }).moveDown(0.3);
        }
        doc.fontSize(10).font('Helvetica-Bold').text('TOTAL:', totalsLabelX, doc.y, { width: 60, align: 'right' })
           .text(`${saleDetails.currency} ${parseFloat(saleDetails.total).toFixed(2)}`, totalsAmountX, doc.y, { width: totalsWidth, align: 'right' }).font('Helvetica').moveDown();
        if (saleDetails.payment_method_title) doc.fontSize(8).text(`Pagado con: ${saleDetails.payment_method_title}`, { align: 'center' }).moveDown(0.5);
        doc.fontSize(8).text('¡Gracias por su compra!', { align: 'center' });
        if (saleDetails.customer_note) doc.moveDown().fontSize(7).text('Nota:', { align: 'center' }).text(saleDetails.customer_note, { align: 'center', width: lineWidth });
        doc.end();
    } catch (error) {
        console.error(`[API] Error al eliminar la campaña ${campaignFileName}:`, error);
        res.status(500).json({ success: false, message: 'Error interno del servidor al eliminar la campaña.' });
    }
};

async function updateCampaignStatus(campaignId, newStatus, res) {
    const campaignFileName = `${campaignId}.json`;
    const campaignFilePath = path.join(process.cwd(), 'data', campaignFileName);
    console.log(`[API] Actualizando estado de campaña ${campaignId} a ${newStatus}`);

    try {
        let campaignJson;
        try {
            const fileContent = await fs.readFile(campaignFilePath, 'utf-8');
            campaignJson = JSON.parse(fileContent);
        } catch (readError) {
            if (readError.code === 'ENOENT') {
                return res.status(404).json({ success: false, message: 'Campaña no encontrada para actualizar estado.' });
            }
            throw readError; // Re-lanzar otros errores de lectura
        }

        campaignJson.status = newStatus;
        campaignJson.updatedAt = new Date().toISOString();
        await fs.writeFile(campaignFilePath, JSON.stringify(campaignJson, null, 2), 'utf-8');
        
        console.log(`[API] Campaña ${campaignId} actualizada a estado: ${newStatus}`);
        return res.json({ success: true, message: `Campaña ${newStatus === 'pausada' ? 'pausada' : 'actualizada a ' + newStatus}.` });

    } catch (error) {
        console.error(`[API] Error al actualizar estado de la campaña ${campaignId} a ${newStatus}:`, error);
        return res.status(500).json({ success: false, message: `Error interno al actualizar estado de la campaña.` });
    }
}

export const apiPauseBulkCampaign = async (req, res) => {
    const { campaignId } = req.params;
    // Aquí, 'pausada' es el estado que el worker debe reconocer para no continuar.
    // 'en_progreso_pausada' podría ser un estado si quieres diferenciar una pausa durante el progreso
    // de una pausa antes de que haya comenzado, pero 'pausada' es más simple.
    await updateCampaignStatus(campaignId, 'pausada', res);
};

export const apiResumeBulkCampaign = async (req, res) => {
    const { campaignId } = req.params;
    const campaignFileName = `${campaignId}.json`;
    const campaignFilePath = path.join(process.cwd(), 'data', campaignFileName);
    const { evolution_api: evolutionApiConfig } = await readAppSettings();

    try {
        const fileContent = await fs.readFile(campaignFilePath, 'utf-8');
        const campaignJson = JSON.parse(fileContent);

        if (campaignJson.status !== 'pausada') {
            return res.status(400).json({ success: false, message: 'La campaña no está pausada.' });
        }
        
        campaignJson.status = 'en_progreso'; // O 'iniciada' si quieres que el worker lo tome como nuevo
        campaignJson.updatedAt = new Date().toISOString();
        await fs.writeFile(campaignFilePath, JSON.stringify(campaignJson, null, 2), 'utf-8');
        
        // Importante: El worker `processBulkCampaignInBackground` está diseñado para ejecutarse una vez
        // y recorrer toda la lista. Si se pausa, la instancia actual del worker terminará (o debería).
        // Al reanudar, necesitamos "despertar" o iniciar una nueva instancia del worker para esta campaña.
        // Si el worker es un proceso que revisa periódicamente, simplemente cambiar el estado es suficiente.
        // Por ahora, como lo llamamos directamente después de crear la campaña,
        // al reanudar, también lo llamaremos para que continúe.
        // Esto podría llevar a múltiples workers si no se maneja con cuidado en un entorno más complejo,
        // pero para la estructura actual es la forma más directa de reanudar.
        console.log(`[API] Reanudando campaña ${campaignId}. Disparando worker...`);
        processBulkCampaignInBackground(campaignFilePath, evolutionApiConfig); // No usamos await

        res.json({ success: true, message: `Campaña ${campaignId} reanudada.` });

    } catch (error) {
        if (error.code === 'ENOENT') {
            return res.status(404).json({ success: false, message: 'Campaña no encontrada para reanudar.' });
        }
        console.error(`[API] Error al reanudar la campaña ${campaignId}:`, error);
        res.status(500).json({ success: false, message: 'Error interno al reanudar la campaña.' });
    }
};

export const showSales = (req, res) => res.render('sales', { title: 'Historial de Ventas' });
export const showUsers = (req, res) => res.render('users', { title: 'Gestión de Usuarios' });

export const apiGetUsersForDataTable = async (req, res) => {
    const { wp_site_url: wpSiteUrl, api_token: apiToken } = req.session;
    if (!wpSiteUrl || !apiToken) return res.status(401).json({ error: 'Autenticación requerida.' });
    try {
        const { getWPUsers } = await import('../services/wpApiService.js');
        const { draw, start = 0, length = 10, search = {}, order = [], columns = [] } = req.body;
        const page = Math.floor(start / length) + 1;
        let orderBy = 'display_name', orderDir = 'asc';
        if (order.length > 0) {
            const colIndex = parseInt(order[0].column);
            const colName = columns[colIndex]?.data;
            const validCols = {'id':'ID', 'display_name':'display_name', 'username':'login', 'email':'email'};
            if (colName && validCols[colName]) orderBy = validCols[colName];
            orderDir = order[0].dir === 'desc' ? 'desc' : 'asc';
        }
        const usersResult = await getWPUsers(wpSiteUrl, apiToken, page, length, '', search.value || '', orderBy, orderDir);
        res.json({ draw: parseInt(draw), recordsTotal: usersResult.recordsTotal || 0, recordsFiltered: usersResult.recordsFiltered || 0, data: usersResult.data || [] });
    } catch (error) {
        console.error("Error en apiGetUsersForDataTable:", error.message);
        res.status(500).json({ error: 'Error al obtener usuarios.', draw: parseInt(req.body.draw), recordsTotal: 0, recordsFiltered: 0, data: [] });
    }
};

export const apiGetSalesForDataTable = async (req, res) => {
    const { wp_site_url: wpSiteUrl, api_token: apiToken } = req.session;
    if (!wpSiteUrl || !apiToken) return res.status(401).json({ error: 'Autenticación requerida.' });
    try {
        const { getWPSales } = await import('../services/wpApiService.js');
        const { draw, start = 0, length = 10, search = {}, order = [], columns = [] } = req.body;
        const page = Math.floor(start / length) + 1;
        let orderBy = 'date', orderDir = 'desc';
        if (order.length > 0) {
            const colIndex = parseInt(order[0].column);
            const colName = columns[colIndex]?.data;
            const validCols = {'id':'ID', 'date_created':'date', 'status':'status', 'total':'total'};
            if (colName && validCols[colName]) orderBy = validCols[colName];
            orderDir = order[0].dir === 'desc' ? 'desc' : 'asc';
        }
        const salesResult = await getWPSales(wpSiteUrl, apiToken, page, length, null, search.value || '', orderBy, orderDir, columns, order);
        res.json({ draw: parseInt(draw), recordsTotal: salesResult.recordsTotal || 0, recordsFiltered: salesResult.recordsFiltered || 0, data: salesResult.data || [] });
    } catch (error) {
        console.error("Error en apiGetSalesForDataTable:", error.message);
        res.status(500).json({ error: 'Error al obtener ventas.', draw: parseInt(req.body.draw), recordsTotal: 0, recordsFiltered: 0, data: [] });
    }
};

export const apiSearchCustomers = async (req, res) => {
    const { wp_site_url: wpSiteUrl, api_token: apiToken } = req.session;
    const { search: searchTerm = '', page = 1, per_page: perPage = 10 } = req.query;
    if (!wpSiteUrl || !apiToken) return res.status(401).json({ error: 'Autenticación requerida.' });
    try {
        const { searchWPCustomers } = await import('../services/wpApiService.js');
        res.json(await searchWPCustomers(wpSiteUrl, apiToken, searchTerm, parseInt(perPage), parseInt(page)));
    } catch (error) {
        res.status(500).json({ error: 'Error al buscar clientes.' });
    }
};

export const apiCreateCustomer = async (req, res) => {
    const { wp_site_url: wpSiteUrl, api_token: apiToken } = req.session;
    const customerData = req.body;
    if (!wpSiteUrl || !apiToken) return res.status(401).json({ error: 'Autenticación requerida.' });
    if (!customerData.email) return res.status(400).json({ error: 'El correo electrónico es obligatorio.' });
    try {
        const { createWPCustomer } = await import('../services/wpApiService.js');
        res.status(201).json(await createWPCustomer(wpSiteUrl, apiToken, customerData));
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: error.response?.data?.message || 'Error al crear cliente.' });
    }
};

export const apiUpdateCustomer = async (req, res) => {
    const { wp_site_url: wpSiteUrl, api_token: apiToken } = req.session;
    const { id: customerId } = req.params;
    const customerData = req.body;
    if (!wpSiteUrl || !apiToken) return res.status(401).json({ error: 'Autenticación requerida.' });
    if (!customerId) return res.status(400).json({ error: 'Se requiere ID de cliente.' });
    try {
        const { updateWPCustomer } = await import('../services/wpApiService.js');
        res.json(await updateWPCustomer(wpSiteUrl, apiToken, customerId, customerData));
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: error.response?.data?.message || 'Error al actualizar cliente.' });
    }
};

export const apiGetCustomerById = async (req, res) => {
    const { wp_site_url: wpSiteUrl, api_token: apiToken } = req.session;
    const { id: customerId } = req.params;
    if (!wpSiteUrl || !apiToken) return res.status(401).json({ error: 'Autenticación requerida.' });
    if (!customerId) return res.status(400).json({ error: 'Se requiere ID de cliente.' });
    try {
        const { getWPCustomerById } = await import('../services/wpApiService.js');
        const customer = await getWPCustomerById(wpSiteUrl, apiToken, customerId);
        if (!customer) return res.status(404).json({ error: 'Cliente no encontrado.' });
        res.json(customer);
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: error.response?.data?.message || 'Error al obtener cliente.' });
    }
};

export const apiDeleteUser = async (req, res) => {
    const { wp_site_url: wpSiteUrl, api_token: apiToken } = req.session;
    const { id: userId } = req.params;
    if (!wpSiteUrl || !apiToken) return res.status(401).json({ success: false, message: 'Autenticación requerida.' });
    if (!userId) return res.status(400).json({ success: false, message: 'Se requiere ID de usuario.' });
    try {
        const { deleteWPUser } = await import('../services/wpApiService.js');
        const result = await deleteWPUser(wpSiteUrl, apiToken, userId);
        res.status(result.statusCode || (result.success ? 200 : 400)).json(result);
    } catch (error) {
        res.status(error.response?.status || 500).json({ success: false, message: error.response?.data?.message || 'Error al eliminar usuario.' });
    }
};

export const apiGetUserSales = async (req, res) => {
    const { wp_site_url: wpSiteUrl, api_token: apiToken } = req.session;
    const { id: userId } = req.params;
    const { page = 1, per_page: perPage = 100 } = req.query;
    if (!wpSiteUrl || !apiToken) return res.status(401).json({ error: 'Autenticación requerida.' });
    if (!userId) return res.status(400).json({ error: 'Se requiere ID de usuario.' });
    try {
        const { getWPSales } = await import('../services/wpApiService.js');
        res.json(await getWPSales(wpSiteUrl, apiToken, parseInt(page), parseInt(perPage), userId));
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: error.response?.data?.message || 'Error al obtener ventas del usuario.' });
    }
};

import { addManualEvent, updateManualEvent, deleteManualEvent, readManualEvents } from '../utils/manualEventsService.js';

export const apiGetManualEvents = async (req, res) => {
    try {
        const { search: searchTerm } = req.query;
        let manualEvents = await readManualEvents();
        if (searchTerm) {
            manualEvents = manualEvents.filter(event =>
                (event.title?.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (event.description?.toLowerCase().includes(searchTerm.toLowerCase()))
            );
        }
        res.json(manualEvents);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener eventos manuales.' });
    }
};

export const apiCreateManualEvent = async (req, res) => {
    const eventData = req.body;
    if (!eventData.title || !eventData.start) return res.status(400).json({ error: 'Título y fecha de inicio son obligatorios.' });
    try {
        res.status(201).json(await addManualEvent(eventData));
    } catch (error) {
        res.status(500).json({ error: 'Error al crear evento manual.' });
    }
};

export const apiUpdateManualEvent = async (req, res) => {
    const { id: eventId } = req.params;
    const eventData = req.body;
    if (!eventId) return res.status(400).json({ error: 'Se requiere ID del evento.' });
    try {
        const updatedEvent = await updateManualEvent(eventId, eventData);
        if (!updatedEvent) return res.status(404).json({ error: 'Evento manual no encontrado.' });
        res.json(updatedEvent);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar evento manual.' });
    }
};

export const apiDeleteManualEvent = async (req, res) => {
    const { id: eventId } = req.params;
    if (!eventId) return res.status(400).json({ error: 'Se requiere ID del evento.' });
    try {
        if (!await deleteManualEvent(eventId)) return res.status(404).json({ error: 'Evento no encontrado.' });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar evento manual.' });
    }
};

export const apiGetWPSubscriptionEventsOnly = async (req, res) => {
    const { wp_site_url: wpSiteUrl, api_token: apiToken } = req.session;
    const { start, end, search: searchTerm } = req.query;
    try {
        const { getWPSubscriptionEvents } = await import('../services/wpApiService.js');
        let events = await getWPSubscriptionEvents(wpSiteUrl, apiToken, start, end, searchTerm);
        res.json(Array.isArray(events) ? events : []);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener eventos de suscripción.', details: error.message });
    }
};

export const apiGetCalendarEvents = async (req, res) => {
    const { wp_site_url: wpSiteUrl, api_token: apiToken } = req.session;
    const { start, end, search: searchTerm } = req.query;
    if (!wpSiteUrl || !apiToken) return res.status(401).json({ error: 'Autenticación requerida.' });
    try {
        let manualEvents = await readManualEvents();
        if (searchTerm) {
            manualEvents = manualEvents.filter(e => e.title?.toLowerCase().includes(searchTerm.toLowerCase()) || e.description?.toLowerCase().includes(searchTerm.toLowerCase()));
        }
        let subscriptionEvents = [];
        try {
            const { getWPSubscriptionEvents } = await import('../services/wpApiService.js');
            subscriptionEvents = await getWPSubscriptionEvents(wpSiteUrl, apiToken, start, end, searchTerm);
            if(!Array.isArray(subscriptionEvents)) subscriptionEvents = [];
        } catch (wpError) {
            console.error("Error obteniendo eventos de WP para calendario:", wpError.message);
        }
        res.json([...manualEvents, ...subscriptionEvents]);
    } catch (error) {
        if (!res.headersSent) res.status(500).json({ error: 'Error obteniendo eventos del calendario.', details: error.message });
    }
};

export const showCalendarView = (req, res) => res.render('calendar', { title: 'Calendario de Vencimientos' });
export const showWhatsAppBulkPage = (req, res) => res.render('whatsapp-bulk', { title: 'Mensajería Masiva WhatsApp' });
export const showMediaPage = (req, res) => res.render('media', { title: 'Biblioteca Multimedia' });
export const showSettingsPage = async (req, res) => {
    try {
        res.render('settings', { title: 'Configuración General', config: await readAppSettings() });
    } catch (error) {
        res.status(500).send('Error al cargar la página de configuración.');
    }
};

export const getAppSettings = async (req, res) => {
    try {
        console.log('[DEBUG] API GET /api/settings - Intentando leer configuración.');
        const config = await readAppSettings();
        console.log('[DEBUG] API GET /api/settings - Configuración leída:', JSON.stringify(config).substring(0, 200) + '...');
        res.json(config);
    } catch (error) {
        console.error('[ERROR] API GET /api/settings - Error en getAppSettings:', error);
        res.status(500).json({ error: 'Error al leer la configuración desde el servidor.' });
    }
};

export const saveAppSettings = async (req, res) => {
    try {
        console.log('[DEBUG] API POST /api/settings - Guardando configuración:', JSON.stringify(req.body).substring(0,200) + '...');
        await writeAppSettings(req.body);
        res.json({ success: true, message: 'Configuración guardada exitosamente.' });
    } catch (error) {
        console.error('[ERROR] API POST /api/settings - Error en saveAppSettings:', error);
        res.status(500).json({ error: 'Error al guardar la configuración en el servidor.' });
    }
};

import { getEvolutionInstances as getEvoInstancesService, sendWhatsAppMessage as sendEvoWhatsAppMessageService, getEvolutionContacts } from '../services/evolutionApiService.js';
// searchChatwootConversationsForSelect ha sido eliminada de las importaciones
import { getChatwootMediaAttachments, getAttachmentsForConversation, getChatwootLabels, getChatwootContactsWithLabel, getAllChatwootContacts } from '../services/chatwootApiService.js';


export const apiGetChatwootLabelsController = async (req, res) => {
    try {
        const appConfig = await readAppSettings();
        if (!appConfig.chatwoot_api?.url || !appConfig.chatwoot_api?.account_id || !appConfig.chatwoot_api?.token) {
            return res.status(500).json({ error: 'La configuración de Chatwoot API no está completa.' });
        }
        const labels = await getChatwootLabels(
            appConfig.chatwoot_api.url,
            appConfig.chatwoot_api.account_id,
            appConfig.chatwoot_api.token
        );
        res.json(labels);
    } catch (error) {
        console.error('Error en apiGetChatwootLabelsController:', error.message);
        res.status(500).json({ error: error.message || 'Error al obtener las etiquetas de Chatwoot.' });
    }
};

export const apiGetChatwootMediaItems = async (req, res) => {
    try {
        const appConfig = await readAppSettings();
        if (!appConfig.chatwoot_api?.url || !appConfig.chatwoot_api?.account_id || !appConfig.chatwoot_api?.token) {
            return res.status(500).json({ error: 'La configuración de Chatwoot API no está completa.' });
        }

        const chatwootPageToFetch = parseInt(req.query.page) || 1;
        // const mediaType = req.query.mediaType || ''; // Eliminado ya que no se usa más
        const conversationIdFilter = req.query.conversationId ? parseInt(req.query.conversationId) : null;

        let resultFromService;

        if (conversationIdFilter) {
            console.log(`[API] Obteniendo adjuntos para conversationId: ${conversationIdFilter}`);
            const attachments = await getAttachmentsForConversation(
                appConfig.chatwoot_api.url,
                appConfig.chatwoot_api.account_id,
                conversationIdFilter,
                appConfig.chatwoot_api.token
            );
            resultFromService = { attachments: attachments, hasMoreChatwootPages: false };
        } else {
            console.log(`[API] Obteniendo adjuntos de la página ${chatwootPageToFetch} de conversaciones de Chatwoot.`);
            resultFromService = await getChatwootMediaAttachments(
                appConfig.chatwoot_api.url,
                appConfig.chatwoot_api.account_id,
                appConfig.chatwoot_api.token,
                chatwootPageToFetch
                // mediaType ya no se pasa
            );
        }

        const { attachments, hasMoreChatwootPages } = resultFromService;
        
        res.json({
            data: attachments, 
            currentPage: chatwootPageToFetch,
            totalPages: hasMoreChatwootPages ? chatwootPageToFetch + 1 : chatwootPageToFetch,
            totalItems: attachments.length 
        });

    } catch (error) {
        console.error('Error en apiGetChatwootMediaItems:', error.message);
        res.status(500).json({ error: error.message || 'Error al obtener los archivos multimedia de Chatwoot.' });
    }
};

export const getEvolutionApiInstances = async (req, res) => {
    try {
        const appConfig = await readAppSettings();
        if (!appConfig.evolution_api?.url || !appConfig.evolution_api?.token) {
            return res.status(500).json({ error: 'La configuración de Evolution API no está completa.' });
        }
        res.json(await getEvoInstancesService(appConfig.evolution_api.url, appConfig.evolution_api.token));
    } catch (error) {
        console.error('Error en getEvolutionApiInstances:', error.message);
        res.status(500).json({ error: 'Error al obtener instancias de Evolution API.' });
    }
};

export const sendWhatsAppMessageController = async (req, res) => {
    try {
        const { phoneNumber, messageText, instanceName } = req.body; 
        if (!phoneNumber || !messageText || !instanceName) {
            return res.status(400).json({ error: 'Faltan parámetros: phoneNumber, messageText o instanceName.' });
        }
        const appConfig = await readAppSettings();
        if (!appConfig.evolution_api?.url || !appConfig.evolution_api?.token) {
            return res.status(500).json({ error: 'La configuración de Evolution API no está completa.' });
        }
        const evolutionResponse = await sendEvoWhatsAppMessageService(
            appConfig.evolution_api.url,
            appConfig.evolution_api.token,
            instanceName,
            phoneNumber,
            messageText
        );
        res.json({ success: true, message: 'Mensaje enviado vía Evolution API.', data: evolutionResponse });
    } catch (error) {
        console.error('Error en sendWhatsAppMessageController:', error.message);
        res.status(500).json({ error: 'Error al enviar mensaje de WhatsApp.' });
    }
};

export const apiValidateCoupon = async (req, res) => {
    const { couponCode, cartSubtotal } = req.body;
    const { wp_site_url: wpSiteUrl, api_token: apiToken } = req.session;
    if (!wpSiteUrl || !apiToken) return res.status(401).json({ success: false, message: 'Autenticación requerida.' });
    if (!couponCode) return res.status(400).json({ success: false, message: 'El código de cupón es requerido.' });
    try {
        const { validateWPCoupon } = await import('../services/wpApiService.js');
        const couponDetails = await validateWPCoupon(wpSiteUrl, apiToken, couponCode, cartSubtotal);
        res.status(couponDetails.success ? 200 : 400).json(couponDetails);
    } catch (error) {
        res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error al validar cupón.', details: error.details });
    }
};

export const apiGetSaleById = async (req, res) => {
    const { wp_site_url: wpSiteUrl, api_token: apiToken } = req.session;
    const { id: saleId } = req.params;
    if (!wpSiteUrl || !apiToken) return res.status(401).json({ error: 'Autenticación requerida.' });
    if (!saleId) return res.status(400).json({ error: 'Se requiere ID de la venta.' });
    try {
        const { getWPSaleById } = await import('../services/wpApiService.js');
        const saleDetails = await getWPSaleById(wpSiteUrl, apiToken, saleId);
        if (!saleDetails) return res.status(404).json({ error: 'Venta no encontrada.' });
        res.json(saleDetails);
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: error.response?.data?.message || 'Error al obtener detalles de la venta.' });
    }
};

export const apiStartBulkCampaign = async (req, res) => {
    const campaignDataFromFrontend = req.body;
    const { evolution_api: evolutionApiConfig } = await readAppSettings(); // Para usar en el envío real
    console.log('[API] Iniciando campaña masiva con datos:', campaignDataFromFrontend);

    try {
        // 1. Validar datos (básico por ahora)
        if (!campaignDataFromFrontend.campaignTitle || !campaignDataFromFrontend.campaignMessage || !campaignDataFromFrontend.evolutionInstance) {
            return res.status(400).json({ success: false, message: 'Faltan datos esenciales para la campaña.' });
        }

        // 2. Generar ID de campaña y nombre de archivo
        const campaignId = `campaign_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const campaignFileName = `${campaignId}.json`;
        const campaignFilePath = path.join(process.cwd(), 'data', campaignFileName);

        // 3. Obtener/Simular lista de contactos
        // TODO: Implementar la lógica real para obtener contactos según campaignDataFromFrontend.contactSource
        let contacts = [];
        const appConfig = await readAppSettings(); // Necesario para Chatwoot API

        if (campaignDataFromFrontend.contactSource === 'chatwoot_label' && campaignDataFromFrontend.chatwootLabel) {
            if (!appConfig.chatwoot_api?.url || !appConfig.chatwoot_api?.account_id || !appConfig.chatwoot_api?.token) {
                return res.status(400).json({ success: false, message: 'La configuración de Chatwoot API no está completa para obtener contactos.' });
            }
            try {
                contacts = await getChatwootContactsWithLabel(
                    appConfig.chatwoot_api.url,
                    appConfig.chatwoot_api.account_id,
                    appConfig.chatwoot_api.token,
                    campaignDataFromFrontend.chatwootLabel
                );
                // Mapear los nombres de los campos si es necesario para los placeholders
                contacts = contacts.map(c => {
                    let phoneNumber = c.phone || '';
                    // Limpiar número: quitar no dígitos, excepto el + inicial si existe
                    phoneNumber = phoneNumber.replace(/[^\d+]/g, '');
                    if (phoneNumber.startsWith('+')) {
                        phoneNumber = phoneNumber.substring(1); // Quitar el + inicial
                    }
                    // Aquí se podría añadir lógica para asegurar el código de país si es necesario
                    // ej. if (phoneNumber.length === 8 && !phoneNumber.startsWith('591')) phoneNumber = `591${phoneNumber}`;

                    return {
                        id: c.id_chatwoot, 
                        phone: phoneNumber,
                        nombre_cliente: c.name ? c.name.split(' ')[0] : '', 
                        apellido_cliente: c.name ? c.name.split(' ').slice(1).join(' ') : '', 
                        email: c.email, 
                        status: 'pendiente'
                    };
                }).filter(c => c.phone); // Asegurarse de que aún tengamos teléfono después de limpiar

            } catch (error) {
                console.error(`[API] Error obteniendo contactos de Chatwoot por etiqueta ${campaignDataFromFrontend.chatwootLabel}:`, error);
                return res.status(500).json({ success: false, message: `Error al obtener contactos de Chatwoot: ${error.message}` });
            }
        } else if (campaignDataFromFrontend.contactSource === 'chatwoot_all') {
            if (!appConfig.chatwoot_api?.url || !appConfig.chatwoot_api?.account_id || !appConfig.chatwoot_api?.token) {
                return res.status(400).json({ success: false, message: 'La configuración de Chatwoot API no está completa para obtener contactos.' });
            }
            try {
                contacts = await getAllChatwootContacts(
                    appConfig.chatwoot_api.url,
                    appConfig.chatwoot_api.account_id,
                    appConfig.chatwoot_api.token
                );
                contacts = contacts.map(c => {
                    let phoneNumber = c.phone || '';
                    phoneNumber = phoneNumber.replace(/[^\d+]/g, '');
                    if (phoneNumber.startsWith('+')) {
                        phoneNumber = phoneNumber.substring(1);
                    }
                    return {
                        id: c.id_chatwoot,
                        phone: phoneNumber,
                        nombre_cliente: c.name ? c.name.split(' ')[0] : '',
                        apellido_cliente: c.name ? c.name.split(' ').slice(1).join(' ') : '',
                        email: c.email,
                        status: 'pendiente'
                    };
                }).filter(c => c.phone);
            } catch (error) {
                console.error(`[API] Error obteniendo todos los contactos de Chatwoot:`, error);
                return res.status(500).json({ success: false, message: `Error al obtener todos los contactos de Chatwoot: ${error.message}` });
            }
        } else if (campaignDataFromFrontend.contactSource === 'evolution_api') {
            if (!evolutionApiConfig?.url || !evolutionApiConfig?.token || !campaignDataFromFrontend.evolutionInstance) {
                return res.status(400).json({ success: false, message: 'La configuración de Evolution API o la instancia no están completas para obtener contactos.' });
            }
            try {
                contacts = await getEvolutionContacts(
                    evolutionApiConfig.url,
                    evolutionApiConfig.token,
                    campaignDataFromFrontend.evolutionInstance
                );
                // El mapeo a {phone, nombre_cliente, status} ya se hace dentro de getEvolutionContacts
            } catch (error) {
                console.error(`[API] Error obteniendo contactos de Evolution API para la instancia ${campaignDataFromFrontend.evolutionInstance}:`, error);
                return res.status(500).json({ success: false, message: `Error al obtener contactos de Evolution API: ${error.message}` });
            }
        } else if (campaignDataFromFrontend.contactSource === 'manual_list' && campaignDataFromFrontend.manualContacts) {
            contacts = campaignDataFromFrontend.manualContacts.split('\n')
                .map(line => line.trim())
                .filter(line => line)
                .map((phone, index) => ({ id: `manual_${index + 1}`, phone: phone, nombre_cliente: '', apellido_cliente: '', status: 'pendiente' }));
        }
        // TODO: Añadir lógica para woocommerce_all, woocommerce_subscriptions, manual_csv
        else {
            // Por ahora, si no es Chatwoot por etiqueta o lista manual, usamos la simulación
            console.warn(`[API] Fuente de contactos '${campaignDataFromFrontend.contactSource}' no completamente implementada o datos no provistos, usando simulación.`);
            contacts = [
                { id: 1, phone: '591XXXXXXXX', nombre_cliente: 'Percy Alvarez', apellido_cliente: 'Dev', status: 'pendiente' },
                { id: 2, phone: '591YYYYYYYY', nombre_cliente: 'Juan', apellido_cliente: 'Perez', status: 'pendiente' },
                { id: 3, phone: '591ZZZZZZZZ', nombre_cliente: 'Maria', apellido_cliente: 'Garcia', status: 'pendiente' }
            ];
        }
        
        if (contacts.length === 0) {
            return res.status(400).json({ success: false, message: 'No se encontraron contactos para la fuente y etiqueta seleccionadas.' });
        }

        const campaignJson = {
            id: campaignId,
            title: campaignDataFromFrontend.campaignTitle,
            messageTemplate: campaignDataFromFrontend.campaignMessage,
            instanceName: campaignDataFromFrontend.evolutionInstance,
            contactSource: campaignDataFromFrontend.contactSource,
            chatwootLabel: campaignDataFromFrontend.chatwootLabel, // Puede ser null
            multimediaUrl: campaignDataFromFrontend.multimediaUrl, // Puede ser null
            sendIntervalSeconds: campaignDataFromFrontend.sendInterval,
            status: 'pendiente', // Cambiado de 'iniciada' a 'pendiente'
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            contacts: contacts, // Lista de contactos con su estado individual
            summary: {
                totalContacts: contacts.length,
                sent: 0,
                failed: 0,
                pending: contacts.length
            }
        };

        // 4. Guardar el archivo JSON de la campaña
        await fs.writeFile(campaignFilePath, JSON.stringify(campaignJson, null, 2), 'utf-8');
        console.log(`[API] Campaña ${campaignId} guardada en ${campaignFilePath} con estado 'pendiente'.`);

        // 5. YA NO Iniciar el proceso de envío en segundo plano automáticamente
        // processBulkCampaignInBackground(campaignFilePath, evolutionApiConfig); 

        res.status(201).json({ success: true, message: `Campaña '${campaignId}' creada y guardada como pendiente. ${contacts.length} contactos listos.`, campaignId: campaignId }); // Cambiado status a 201 y mensaje

    } catch (error) {
        console.error('[API] Error al crear campaña masiva:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor al iniciar la campaña.' });
    }
};

export const apiUpdateBulkCampaign = async (req, res) => {
    const { campaignId } = req.params;
    const updatedData = req.body;
    const campaignFileName = `${campaignId}.json`;
    const campaignFilePath = path.join(process.cwd(), 'data', campaignFileName);

    console.log(`[API] Solicitud para actualizar campaña ${campaignId} con datos:`, updatedData);

    try {
        let campaignJson;
        try {
            const fileContent = await fs.readFile(campaignFilePath, 'utf-8');
            campaignJson = JSON.parse(fileContent);
        } catch (readError) {
            if (readError.code === 'ENOENT') {
                return res.status(404).json({ success: false, message: 'Campaña no encontrada para actualizar.' });
            }
            console.error(`[API] Error leyendo archivo de campaña ${campaignId} para actualizar:`, readError);
            return res.status(500).json({ success: false, message: 'Error al leer datos de la campaña.' });
        }

        if (campaignJson.status !== 'pendiente') {
            return res.status(400).json({ success: false, message: `Solo se pueden editar campañas en estado 'pendiente'. Estado actual: ${campaignJson.status}` });
        }

        // Campos que se pueden actualizar directamente
        campaignJson.title = updatedData.campaignTitle || campaignJson.title;
        campaignJson.messageTemplate = updatedData.campaignMessage || campaignJson.messageTemplate;
        campaignJson.instanceName = updatedData.evolutionInstance || campaignJson.instanceName;
        campaignJson.multimediaUrl = updatedData.multimediaUrl !== undefined ? updatedData.multimediaUrl : campaignJson.multimediaUrl; // Permite URL vacía
        campaignJson.sendIntervalSeconds = updatedData.sendInterval || campaignJson.sendIntervalSeconds;
        
        // Si la fuente de contactos o la etiqueta cambian, se debe regenerar la lista de contactos
        const sourceChanged = campaignJson.contactSource !== updatedData.contactSource;
        const labelChanged = campaignJson.contactSource === 'chatwoot_label' && campaignJson.chatwootLabel !== updatedData.chatwootLabel;
        const manualListChanged = campaignJson.contactSource === 'manual_list' && campaignJson.manualContacts !== updatedData.manualContacts; // Asumiendo que manualContacts viene en updatedData

        if (sourceChanged || labelChanged || manualListChanged) {
            console.log('[API] Fuente de contactos o etiqueta cambiada, regenerando lista de contactos...');
            let newContacts = [];
            const appConfig = await readAppSettings();

            campaignJson.contactSource = updatedData.contactSource || campaignJson.contactSource; // Actualizar fuente
            campaignJson.chatwootLabel = updatedData.chatwootLabel; // Actualizar etiqueta (puede ser null)
            
            // Lógica similar a apiStartBulkCampaign para obtener contactos
            if (campaignJson.contactSource === 'chatwoot_label' && campaignJson.chatwootLabel) {
                if (!appConfig.chatwoot_api?.url || !appConfig.chatwoot_api?.account_id || !appConfig.chatwoot_api?.token) {
                    return res.status(400).json({ success: false, message: 'Configuración de Chatwoot API incompleta.' });
                }
                newContacts = await getChatwootContactsWithLabel(appConfig.chatwoot_api.url, appConfig.chatwoot_api.account_id, appConfig.chatwoot_api.token, campaignJson.chatwootLabel);
            } else if (campaignJson.contactSource === 'chatwoot_all') {
                if (!appConfig.chatwoot_api?.url || !appConfig.chatwoot_api?.account_id || !appConfig.chatwoot_api?.token) {
                     return res.status(400).json({ success: false, message: 'Configuración de Chatwoot API incompleta.' });
                }
                newContacts = await getAllChatwootContacts(appConfig.chatwoot_api.url, appConfig.chatwoot_api.account_id, appConfig.chatwoot_api.token);
            } else if (campaignJson.contactSource === 'evolution_api') {
                const { evolution_api: evoConfig } = appConfig;
                if (!evoConfig?.url || !evoConfig?.token || !campaignJson.instanceName) {
                    return res.status(400).json({ success: false, message: 'Configuración de Evolution API o instancia no completa para actualizar contactos.' });
                }
                newContacts = await getEvolutionContacts(
                    evoConfig.url,
                    evoConfig.token,
                    campaignJson.instanceName // Usar la instancia ya guardada en la campaña
                );
            } else if (campaignJson.contactSource === 'manual_list' && updatedData.manualContacts) {
                 newContacts = updatedData.manualContacts.split('\n').map(line => line.trim()).filter(line => line).map((phone, index) => ({ id: `manual_edit_${index + 1}`, phone, nombre_cliente: '', apellido_cliente: '', status: 'pendiente' }));
            }
            // TODO: Añadir lógica para otras fuentes si es necesario (CSV, WooCommerce)

            if (newContacts.length === 0 && (campaignJson.contactSource === 'chatwoot_label' || campaignJson.contactSource === 'chatwoot_all' || campaignJson.contactSource === 'manual_list' || campaignJson.contactSource === 'evolution_api')) {
                 return res.status(400).json({ success: false, message: 'No se encontraron contactos para la nueva fuente seleccionada.' });
            }
            
            // Mapear y limpiar números de teléfono para las nuevas fuentes de Chatwoot
            // Para Evolution API, el mapeo y limpieza ya se hace en getEvolutionContacts
            if (campaignJson.contactSource === 'chatwoot_label' || campaignJson.contactSource === 'chatwoot_all') {
                newContacts = newContacts.map(c => {
                    let phoneNumber = c.phone || '';
                    phoneNumber = phoneNumber.replace(/[^\d+]/g, '');
                    if (phoneNumber.startsWith('+')) phoneNumber = phoneNumber.substring(1);
                    return { id: c.id_chatwoot, phone: phoneNumber, nombre_cliente: c.name ? c.name.split(' ')[0] : '', apellido_cliente: c.name ? c.name.split(' ').slice(1).join(' ') : '', email: c.email, status: 'pendiente' };
                }).filter(c => c.phone);
            }

            campaignJson.contacts = newContacts;
            campaignJson.summary = {
                totalContacts: newContacts.length,
                sent: 0,
                failed: 0,
                pending: newContacts.length
            };
        }

        campaignJson.updatedAt = new Date().toISOString();
        await fs.writeFile(campaignFilePath, JSON.stringify(campaignJson, null, 2), 'utf-8');
        
        res.json({ success: true, message: `Campaña ${campaignId} actualizada exitosamente.`, data: campaignJson });

    } catch (error) {
        console.error(`[API] Error al actualizar la campaña ${campaignId}:`, error);
        res.status(500).json({ success: false, message: 'Error interno al actualizar la campaña.' });
    }
};

export const apiGetBulkCampaignDetails = async (req, res) => {
    const { campaignId } = req.params;
    const campaignFileName = `${campaignId}.json`;
    const campaignFilePath = path.join(process.cwd(), 'data', campaignFileName);

    console.log(`[API] Solicitud para obtener detalles de campaña ${campaignId}`);

    try {
        const fileContent = await fs.readFile(campaignFilePath, 'utf-8');
        const campaignJson = JSON.parse(fileContent);
        res.json({ success: true, data: campaignJson });
    } catch (error) {
        if (error.code === 'ENOENT') {
            return res.status(404).json({ success: false, message: 'Campaña no encontrada.' });
        }
        console.error(`[API] Error leyendo archivo de campaña ${campaignId} para detalles:`, error);
        return res.status(500).json({ success: false, message: 'Error al leer datos de la campaña.' });
    }
};

export const apiResetBulkCampaign = async (req, res) => {
    const { campaignId } = req.params;
    const campaignFileName = `${campaignId}.json`;
    const campaignFilePath = path.join(process.cwd(), 'data', campaignFileName);

    console.log(`[API] Solicitud para reiniciar campaña ${campaignId}`);

    try {
        let campaignJson;
        try {
            const fileContent = await fs.readFile(campaignFilePath, 'utf-8');
            campaignJson = JSON.parse(fileContent);
        } catch (readError) {
            if (readError.code === 'ENOENT') {
                return res.status(404).json({ success: false, message: 'Campaña no encontrada para reiniciar.' });
            }
            console.error(`[API] Error leyendo archivo de campaña ${campaignId} para reiniciar:`, readError);
            return res.status(500).json({ success: false, message: 'Error al leer datos de la campaña.' });
        }

        // Solo permitir reiniciar campañas que no estén activas o pendientes
        if (campaignJson.status === 'en_progreso' || campaignJson.status === 'iniciada' || campaignJson.status === 'pendiente') {
            return res.status(400).json({ success: false, message: `No se puede reiniciar una campaña en estado '${campaignJson.status}'. Paúsela o espere a que termine.` });
        }

        campaignJson.status = 'pendiente';
        campaignJson.summary.sent = 0;
        campaignJson.summary.failed = 0;
        campaignJson.summary.pending = campaignJson.contacts.length;
        
        campaignJson.contacts.forEach(contact => {
            contact.status = 'pendiente';
            delete contact.sentAt;
            delete contact.error;
        });

        campaignJson.updatedAt = new Date().toISOString();
        await fs.writeFile(campaignFilePath, JSON.stringify(campaignJson, null, 2), 'utf-8');
        
        res.json({ success: true, message: `Campaña ${campaignId} reiniciada y marcada como pendiente.` });

    } catch (error) {
        console.error(`[API] Error al reiniciar la campaña ${campaignId}:`, error);
        res.status(500).json({ success: false, message: 'Error interno al reiniciar la campaña.' });
    }
};

export const apiManuallyStartBulkCampaign = async (req, res) => {
    const { campaignId } = req.params;
    const campaignFileName = `${campaignId}.json`;
    const campaignFilePath = path.join(process.cwd(), 'data', campaignFileName);
    const { evolution_api: evolutionApiConfig } = await readAppSettings();

    console.log(`[API] Solicitud para iniciar manualmente campaña ${campaignId}`);

    try {
        let campaignJson;
        try {
            const fileContent = await fs.readFile(campaignFilePath, 'utf-8');
            campaignJson = JSON.parse(fileContent);
        } catch (readError) {
            if (readError.code === 'ENOENT') {
                return res.status(404).json({ success: false, message: 'Campaña no encontrada para iniciar.' });
            }
            console.error(`[API] Error leyendo archivo de campaña ${campaignId} para iniciar:`, readError);
            return res.status(500).json({ success: false, message: 'Error al leer datos de la campaña.' });
        }

        if (campaignJson.status !== 'pendiente') {
            return res.status(400).json({ success: false, message: `La campaña no está en estado 'pendiente'. Estado actual: ${campaignJson.status}` });
        }
        
        campaignJson.status = 'iniciada'; // El worker cambiará esto a 'en_progreso'
        campaignJson.updatedAt = new Date().toISOString();
        await fs.writeFile(campaignFilePath, JSON.stringify(campaignJson, null, 2), 'utf-8');
        
        console.log(`[API] Campaña ${campaignId} marcada como 'iniciada'. Disparando worker...`);
        processBulkCampaignInBackground(campaignFilePath, evolutionApiConfig); // No usamos await

        res.json({ success: true, message: `Campaña ${campaignId} iniciada y ahora está en proceso.` });

    } catch (error) {
        console.error(`[API] Error al iniciar manualmente la campaña ${campaignId}:`, error);
        res.status(500).json({ success: false, message: 'Error interno al iniciar la campaña.' });
    }
};

// Función para procesar la campaña en segundo plano
async function processBulkCampaignInBackground(campaignFilePath, evolutionApiConfig) {
    console.log(`[Worker] Iniciando procesamiento para: ${campaignFilePath}`);
    try {
        let campaignJson = JSON.parse(await fs.readFile(campaignFilePath, 'utf-8'));
        
        // Si la campaña ya está completada, en error o explícitamente pausada por el usuario, no hacer nada.
        if (campaignJson.status === 'completada' || campaignJson.status === 'error_procesamiento' || campaignJson.status === 'pausada') {
            console.log(`[Worker] Campaña ${campaignJson.id} en estado '${campaignJson.status}'. No se procesará.`);
            return;
        }

        // Si estaba 'iniciada' o 'en_progreso_pausada' (o un estado de reanudación), marcarla como 'en_progreso'.
        // 'en_progreso_pausada' es un estado que podríamos usar si queremos diferenciar una pausa de worker de una pausa de usuario.
        // Por ahora, 'pausada' es el estado explícito del usuario.
        if (campaignJson.status === 'iniciada' || campaignJson.status === 'en_progreso_pausada' /* o el estado que usemos para reanudar */) {
            campaignJson.status = 'en_progreso';
            campaignJson.updatedAt = new Date().toISOString();
            await fs.writeFile(campaignFilePath, JSON.stringify(campaignJson, null, 2), 'utf-8');
        }
        // Si ya estaba 'en_progreso', simplemente continúa.

        const { messageTemplate, instanceName, sendIntervalSeconds, multimediaUrl } = campaignJson;
        const intervalMilliseconds = (sendIntervalSeconds || 5) * 1000;

        for (let i = 0; i < campaignJson.contacts.length; i++) {
            // Antes de procesar cada contacto, releer el archivo para verificar si se pausó externamente
            try {
                const currentCampaignStateContent = await fs.readFile(campaignFilePath, 'utf-8');
                const currentCampaignStateJson = JSON.parse(currentCampaignStateContent);
                if (currentCampaignStateJson.status === 'pausada') {
                    console.log(`[Worker] Campaña ${campaignJson.id} pausada externamente. Deteniendo procesamiento.`);
                    // Opcional: actualizar el estado de la campaña actual a 'en_progreso_pausada' si queremos diferenciar
                    // campaignJson.status = 'en_progreso_pausada';
                    // await fs.writeFile(campaignFilePath, JSON.stringify(campaignJson, null, 2), 'utf-8');
                    return; // Salir del worker
                }
                // Actualizar campaignJson con el estado más reciente por si otros campos cambiaron (aunque no es el caso aquí)
                campaignJson = currentCampaignStateJson; 
            } catch (readError) {
                console.error(`[Worker] Error releyendo estado de campaña ${campaignJson.id} durante el bucle:`, readError);
                // Decidir si continuar o detenerse. Por seguridad, podríamos detenernos.
                return;
            }

            const contact = campaignJson.contacts[i];
            if (contact.status === 'pendiente') {
                console.log(`[Worker] Procesando contacto ${i + 1}/${campaignJson.contacts.length}: ${contact.phone} para campaña ${campaignJson.id}`);
                try {
                    // Simular reemplazo de placeholders
                    let personalizedMessage = messageTemplate
                        .replace(/{nombre_cliente}/g, contact.nombre_cliente || '')
                        .replace(/{apellido_cliente}/g, contact.apellido_cliente || '')
                        .replace(/{telefono_cliente}/g, contact.phone || '');
                    
                    // TODO: Integrar el envío real con evolutionApiService.js
                    // console.log(`[Worker] SIMULANDO envío a ${contact.phone}: "${personalizedMessage}" con instancia ${instanceName}`);
                    await sendEvoWhatsAppMessageService(
                        evolutionApiConfig.url, 
                        evolutionApiConfig.token, 
                        instanceName, 
                        contact.phone, 
                        personalizedMessage, 
                        { multimediaUrl: multimediaUrl } // Pasar multimediaUrl a las opciones
                    );
                    console.log(`[Worker] Mensaje enviado a ${contact.phone} para campaña ${campaignJson.id}`);
                    contact.status = 'enviado';
                    contact.sentAt = new Date().toISOString();
                    campaignJson.summary.sent++;
                    
                } catch (sendError) {
                    console.error(`[Worker] Error enviando a ${contact.phone} para campaña ${campaignJson.id}:`, sendError.message);
                    contact.status = 'fallido';
                    contact.error = sendError.message;
                    campaignJson.summary.failed++;
                }
                campaignJson.summary.pending--;
                campaignJson.contacts[i] = contact; // Actualizar el contacto en el array
                campaignJson.updatedAt = new Date().toISOString();
                await fs.writeFile(campaignFilePath, JSON.stringify(campaignJson, null, 2), 'utf-8'); // Guardar después de cada intento

                // Esperar antes del siguiente, excepto para el último
                if (i < campaignJson.contacts.length - 1) {
                    console.log(`[Worker] Esperando ${sendIntervalSeconds} segundos...`);
                    await new Promise(resolve => setTimeout(resolve, intervalMilliseconds));
                }
            }
        }

        campaignJson.status = 'completada';
        campaignJson.updatedAt = new Date().toISOString();
        await fs.writeFile(campaignFilePath, JSON.stringify(campaignJson, null, 2), 'utf-8');
        console.log(`[Worker] Campaña ${campaignJson.id} completada.`);

    } catch (error) {
        console.error(`[Worker] Error procesando campaña desde ${campaignFilePath}:`, error);
        // Opcional: actualizar el JSON de la campaña a un estado de error general
        try {
            let campaignJsonOnError = JSON.parse(await fs.readFile(campaignFilePath, 'utf-8'));
            campaignJsonOnError.status = 'error_procesamiento';
            campaignJsonOnError.errorMessage = error.message;
            campaignJsonOnError.updatedAt = new Date().toISOString();
            await fs.writeFile(campaignFilePath, JSON.stringify(campaignJsonOnError, null, 2), 'utf-8');
        } catch (writeError) {
            console.error(`[Worker] Error fatal al intentar actualizar estado de error de campaña ${campaignFilePath}:`, writeError);
        }
    }
}


export const apiProcessSale = async (req, res) => {
    const saleData = req.body;
    const { wp_site_url: wpSiteUrl, api_token: apiToken } = req.session;
    const currentUser = req.session.user; 
    if (!wpSiteUrl || !apiToken) return res.status(401).json({ success: false, message: 'Autenticación requerida.' });
    if (!saleData.cart?.length) return res.status(400).json({ success: false, message: 'El carrito está vacío.' });
    if (saleData.customerId == null) return res.status(400).json({ success: false, message: 'El cliente es requerido.' }); // Allow 0
    if (!saleData.paymentMethod) return res.status(400).json({ success: false, message: 'El método de pago es requerido.' });
    if (saleData.saleType === 'suscripcion' && (!saleData.subscriptionTitle || !saleData.subscriptionExpiry)) {
        return res.status(400).json({ success: false, message: 'Para suscripciones, título y vencimiento son obligatorios.' });
    }
    try {
        const { createWPSale } = await import('../services/wpApiService.js');
        const saleResultFromWP = await createWPSale(wpSiteUrl, apiToken, saleData, currentUser);
        res.status(201).json({ success: true, message: 'Venta procesada y registrada en WordPress.', data: saleResultFromWP });
    } catch (error) {
        res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error al procesar la venta.', details: error.details });
    }
};

export const apiGetBulkCampaigns = async (req, res) => {
    const dataDir = path.join(process.cwd(), 'data');
    try {
        const files = await fs.readdir(dataDir);
        const campaignFiles = files.filter(file => file.startsWith('campaign_') && file.endsWith('.json'));
        
        let campaigns = [];
        for (const file of campaignFiles) {
            try {
                const filePath = path.join(dataDir, file);
                const fileContent = await fs.readFile(filePath, 'utf-8');
                const campaignJson = JSON.parse(fileContent);
                // Extraer solo la información resumen necesaria para la tabla
                campaigns.push({
                    id: campaignJson.id,
                    title: campaignJson.title,
                    createdAt: campaignJson.createdAt,
                    status: campaignJson.status,
                    totalContacts: campaignJson.summary?.totalContacts || 0,
                    sent: campaignJson.summary?.sent || 0,
                    failed: campaignJson.summary?.failed || 0,
                    contactSource: campaignJson.contactSource,
                    chatwootLabel: campaignJson.chatwootLabel
                });
            } catch (parseError) {
                console.error(`Error al parsear el archivo de campaña ${file}:`, parseError);
                // Omitir este archivo si no se puede parsear
            }
        }
        // Ordenar por fecha de creación descendente
        campaigns.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Para DataTables, se espera un objeto con una propiedad 'data' que es el array de items
        res.json({ data: campaigns });

    } catch (error) {
        console.error('[API] Error al listar campañas masivas:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor al listar las campañas.', data: [] });
    }
};

export const apiDeleteBulkCampaign = async (req, res) => {
    const { campaignId } = req.params;
    if (!campaignId || !campaignId.startsWith('campaign_') || !campaignId.endsWith('.json')) {
        // Validar un poco el formato del campaignId para seguridad
        // El frontend enviará solo el ID base, ej: "campaign_1749448288021_3vp7g"
        // Así que aquí podríamos necesitar componer el nombre del archivo o esperar el nombre completo.
        // Por ahora, asumimos que campaignId es el nombre completo del archivo JSON.
        // O mejor, el frontend solo envía el ID y el backend construye el nombre del archivo.
        // Vamos a asumir que el frontend envía el ID sin .json
        const campaignFileName = `${campaignId}.json`;
        const campaignFilePath = path.join(process.cwd(), 'data', campaignFileName);
        console.log(`[API] Solicitud para eliminar campaña: ${campaignId} (archivo: ${campaignFileName})`);


        if (!campaignId.startsWith('campaign_')) { // Chequeo simple
             return res.status(400).json({ success: false, message: 'ID de campaña inválido.' });
        }


        try {
            await fs.unlink(campaignFilePath);
            console.log(`[API] Campaña ${campaignFileName} eliminada exitosamente.`);
            res.json({ success: true, message: `Campaña ${campaignId} eliminada.` });
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.warn(`[API] Intento de eliminar campaña no encontrada: ${campaignFileName}`);
                return res.status(404).json({ success: false, message: 'Campaña no encontrada.' });
            }
            console.error(`[API] Error al eliminar la campaña ${campaignFileName}:`, error);
            res.status(500).json({ success: false, message: 'Error interno del servidor al eliminar la campaña.' });
        }
    } else {
         // Si el campaignId no tiene el formato esperado (ej. no incluye .json y no lo estamos añadiendo)
         // Esto es un fallback si la lógica de arriba cambia.
         // Por ahora, la lógica de arriba debería manejarlo.
        return res.status(400).json({ success: false, message: 'Formato de ID de campaña inválido.' });
    }
};
