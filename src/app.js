import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';

// Configurar __dirname para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno desde .env
dotenv.config();

// Crear instancia de la aplicación Express
const app = express();

// Configuración de Sesión
app.use(session({
    secret: process.env.SESSION_SECRET || 'un-secreto-muy-secreto-cambiar-en-produccion', // Debería estar en .env
    resave: false,
    saveUninitialized: false, // Cambiar a true si quieres guardar sesiones vacías
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // Usar cookies seguras en producción (HTTPS)
        maxAge: 1000 * 60 * 60 * 24 // Duración de la cookie (ej: 24 horas)
    }
}));

// Middleware para pasar datos de sesión a todas las vistas
app.use((req, res, next) => {
    res.locals.currentUser = req.session.user;
    next();
});

// Configurar EJS como motor de plantillas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware para servir archivos estáticos desde la carpeta 'public'
app.use(express.static(path.join(__dirname, '../public'))); // Ajustado para que __dirname esté en src/

// Middleware para parsear cuerpos de peticiones JSON
app.use(express.json());
// Middleware para parsear cuerpos de peticiones URL-encoded
app.use(express.urlencoded({ extended: true }));

// Importar rutas
import indexRoutes from './routes/indexRoutes.js';
import authRoutes from './routes/authRoutes.js';

// Rutas
app.use('/', indexRoutes); // Rutas principales de la aplicación
app.use('/', authRoutes); // Rutas de autenticación (ej: /login, /logout)

// Definir el puerto
const PORT = process.env.PORT || 3000;

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
