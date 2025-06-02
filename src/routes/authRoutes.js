import express from 'express';
import * as authController from '../controllers/authController.js';
import { isGuest } from '../middleware/authMiddleware.js';

const router = express.Router();

// Mostrar página de login (solo para invitados)
router.get('/login', isGuest, authController.showLoginPage);

// Procesar intento de login
router.post('/login', authController.handleLogin);

// Cerrar sesión
router.get('/logout', authController.handleLogout);

export default router;
