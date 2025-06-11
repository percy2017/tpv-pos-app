import express from 'express';
import * as mainController from '../controllers/mainController.js';
import { isAuthenticated } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', isAuthenticated, mainController.showDashboard);
router.get('/pos', isAuthenticated, mainController.showPos);
router.get('/sales', isAuthenticated, mainController.showSales);
router.get('/users', isAuthenticated, mainController.showUsers);

// API endpoint para buscar productos (usado por AJAX desde el TPV)
router.get('/api/products', isAuthenticated, mainController.searchProductsApi);

// API endpoints para clientes/usuarios
router.get('/api/customers/search', isAuthenticated, mainController.apiSearchCustomers); // Buscar clientes
router.post('/api/customers', isAuthenticated, mainController.apiCreateCustomer);       // Crear cliente
router.put('/api/customers/:id', isAuthenticated, mainController.apiUpdateCustomer);    // Actualizar cliente
router.get('/api/customers/:id', isAuthenticated, mainController.apiGetCustomerById); // Obtener cliente por ID
router.delete('/api/users/:id', isAuthenticated, mainController.apiDeleteUser); // Eliminar usuario/cliente
router.post('/api/users/dt', isAuthenticated, mainController.apiGetUsersForDataTable); // Para DataTables server-side
router.get('/api/users/:id/sales', isAuthenticated, mainController.apiGetUserSales); // Obtener ventas de un usuario específico

// API endpoints para Ventas
router.post('/api/sales/dt', isAuthenticated, mainController.apiGetSalesForDataTable); // Para DataTables server-side (Ventas)
router.get('/api/sales/:id', isAuthenticated, mainController.apiGetSaleById); // Obtener una venta específica por ID
router.get('/api/sales/:id/pdf/ticket', isAuthenticated, mainController.getSaleTicketPDF); // Generar PDF del ticket de venta

// API endpoints para eventos manuales del calendario (locales, sin autenticación para CRUD)
router.post('/api/manual-events', mainController.apiCreateManualEvent); // Sin isAuthenticated
router.get('/api/manual-events', mainController.apiGetManualEvents);    // Sin isAuthenticated - Nueva ruta para listar solo manuales
router.put('/api/manual-events/:id', mainController.apiUpdateManualEvent); // Sin isAuthenticated
router.delete('/api/manual-events/:id', mainController.apiDeleteManualEvent); // Sin isAuthenticated

// API endpoint para obtener solo eventos de suscripción de WP (requiere autenticación)
router.get('/api/wp-subscription-events', isAuthenticated, mainController.apiGetWPSubscriptionEventsOnly);

// Middleware de logging específico para rutas de calendario (si aún es útil o para las nuevas)
// router.use('/api/calendar-events', (req, res, next) => { // Comentado porque la ruta original /api/calendar-events podría eliminarse
//     console.log(`[Node DEBUG Router] Petición entrante para /api/calendar-events. Método: ${req.method}, URL: ${req.originalUrl}, Sesión User: ${req.session.user ? 'Sí' : 'No'}`);
//     next();
// });

// La ruta original GET /api/calendar-events que combinaba todo, ahora es reemplazada por las dos rutas específicas.
// Si alguna otra parte del sistema la usa, necesitaría ser actualizada o esta ruta mantenida y refactorizada.
// Por ahora, la comentamos o eliminamos para evitar confusión con las nuevas rutas.
// router.get('/api/calendar-events', isAuthenticated, mainController.apiGetCalendarEvents);


// Ruta para la vista del calendario (esta sí requiere autenticación para ver la página)
router.get('/calendar', isAuthenticated, mainController.showCalendarView);

// Ruta para la página de Configuración
router.get('/settings', (req, res, next) => {
    console.log('[DEBUG] Accediendo a la ruta /settings');
    next();
}, isAuthenticated, mainController.showSettingsPage);

// Ruta para la página de Mensajería Masiva WhatsApp
router.get('/whatsapp-bulk', isAuthenticated, mainController.showWhatsAppBulkPage);

// Ruta para la página de Biblioteca Multimedia
router.get('/media', isAuthenticated, mainController.showMediaPage);

// API endpoint para obtener multimedia de Chatwoot
router.get('/api/chatwoot-media', isAuthenticated, mainController.apiGetChatwootMediaItems);
// API endpoint para obtener etiquetas de Chatwoot
router.get('/api/chatwoot/labels', isAuthenticated, mainController.apiGetChatwootLabelsController);

// API endpoints para WhatsApp (Evolution API y Envíos Masivos)
router.get('/api/evolution/instances', (req, res, next) => {
    console.log('[DEBUG] Accediendo a la ruta /api/evolution/instances');
    next();
}, isAuthenticated, mainController.getEvolutionApiInstances);
router.post('/api/whatsapp/send-message', isAuthenticated, mainController.sendWhatsAppMessageController);
router.post('/api/whatsapp/start-bulk-campaign', isAuthenticated, mainController.apiStartBulkCampaign);
router.get('/api/whatsapp/bulk-campaigns', isAuthenticated, mainController.apiGetBulkCampaigns); 
router.delete('/api/whatsapp/bulk-campaigns/:campaignId', isAuthenticated, mainController.apiDeleteBulkCampaign);
router.post('/api/whatsapp/bulk-campaigns/:campaignId/pause', isAuthenticated, mainController.apiPauseBulkCampaign); // Nueva ruta para pausar
router.post('/api/whatsapp/bulk-campaigns/:campaignId/resume', isAuthenticated, mainController.apiResumeBulkCampaign); // Nueva ruta para reanudar
router.post('/api/whatsapp/bulk-campaigns/:campaignId/start', isAuthenticated, mainController.apiManuallyStartBulkCampaign); // Nueva ruta para iniciar manually
router.get('/api/whatsapp/bulk-campaigns/:campaignId/details', isAuthenticated, mainController.apiGetBulkCampaignDetails); // Nueva ruta para obtener detalles de campaña
router.put('/api/whatsapp/bulk-campaigns/:campaignId', isAuthenticated, mainController.apiUpdateBulkCampaign); // Nueva ruta para actualizar campaña
router.post('/api/whatsapp/bulk-campaigns/:campaignId/reset', isAuthenticated, mainController.apiResetBulkCampaign); // Nueva ruta para reiniciar campaña

// API endpoint para validar cupones
router.post('/api/validate-coupon', isAuthenticated, mainController.apiValidateCoupon);

// API endpoint para procesar la venta
router.post('/api/process-sale', isAuthenticated, mainController.apiProcessSale);

// router.get('/products', isAuthenticated, mainController.showProducts); // Para el futuro
// router.get('/customers', isAuthenticated, mainController.showCustomers); // Para el futuro

// API endpoints para la configuración de la aplicación
router.get('/api/settings', isAuthenticated, mainController.getAppSettings);
router.post('/api/settings', isAuthenticated, mainController.saveAppSettings);

export default router;
