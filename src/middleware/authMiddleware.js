export const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        // El usuario está logueado, continuar con la siguiente función de middleware/ruta
        return next();
    }
    // El usuario no está logueado
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || (req.originalUrl && req.originalUrl.startsWith('/api/'))) {
        // Si es una solicitud AJAX/API, devolver un error JSON
        return res.status(401).json({ error: 'No autenticado. Por favor, inicie sesión.' });
    } else {
        // Si es una solicitud normal del navegador, guardar la URL original y redirigir
        req.session.returnTo = req.originalUrl;
        return res.redirect('/login');
    }
};

export const isGuest = (req, res, next) => {
    if (!req.session.user) {
        // El usuario no está logueado (es un invitado), continuar
        return next();
    }
    // El usuario ya está logueado, redirigir al dashboard
    res.redirect('/');
};

// Middleware para verificar roles (ejemplo)
// export const hasRole = (roles) => {
//     return (req, res, next) => {
//         if (!req.session.user) {
//             return res.status(401).redirect('/login'); // O renderizar una vista de no autorizado
//         }
//         const userRoles = Array.isArray(req.session.user.role) ? req.session.user.role : [req.session.user.role];
//         const authorized = roles.some(role => userRoles.includes(role));

//         if (authorized) {
//             return next();
//         }
//         // Usuario no tiene el rol necesario
//         // Podrías redirigir a una página de "no autorizado" o simplemente al home
//         // res.status(403).send('No tienes permiso para acceder a esta página.');
//         req.flash('error', 'No tienes permiso para acceder a esta página.'); // Si usas express-flash
//         return res.redirect('/');
//     };
// };
