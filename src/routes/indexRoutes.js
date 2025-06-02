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
router.post('/api/sales/dt', isAuthenticated, mainController.apiGetSalesForDataTable); // Para DataTables server-side (Ventas)

// API endpoints para eventos manuales del calendario
router.post('/api/manual-events', isAuthenticated, mainController.apiCreateManualEvent);
router.put('/api/manual-events/:id', isAuthenticated, mainController.apiUpdateManualEvent);
router.delete('/api/manual-events/:id', isAuthenticated, mainController.apiDeleteManualEvent);
// GET /api/manual-events (para listar todos) podría añadirse si es necesario directamente.

// API endpoint para obtener todos los eventos del calendario (combinados)
router.get('/api/calendar-events', isAuthenticated, mainController.apiGetCalendarEvents);

// Ruta para la vista del calendario
router.get('/calendar', isAuthenticated, mainController.showCalendarView);

// API endpoint para validar cupones
router.post('/api/validate-coupon', isAuthenticated, mainController.apiValidateCoupon);

// API endpoint para procesar la venta
router.post('/api/process-sale', isAuthenticated, mainController.apiProcessSale);

// router.get('/products', isAuthenticated, mainController.showProducts); // Para el futuro
// router.get('/customers', isAuthenticated, mainController.showCustomers); // Para el futuro

export default router;
