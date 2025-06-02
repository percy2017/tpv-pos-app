import axios from 'axios'; // Para llamar a la API de WP

export const showLoginPage = (req, res) => {
    // Si el usuario ya está logueado, redirigir al dashboard
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('auth/login', { error: null }); // Pasamos error como null inicialmente
};

export const handleLogin = async (req, res) => {
    const { email, password, wp_site_url } = req.body;

    // Validaciones básicas de entrada
    if (!wp_site_url || !email || !password) {
        return res.render('auth/login', { error: 'Todos los campos (URL, Email/Usuario, Contraseña) son requeridos.' });
    }

    let formattedWpSiteUrl = wp_site_url.trim();
    try {
        const parsedUrl = new URL(formattedWpSiteUrl);
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            throw new Error('Protocolo inválido');
        }
        // Asegurar que no haya un slash al final para la concatenación
        formattedWpSiteUrl = formattedWpSiteUrl.replace(/\/$/, "");
    } catch (e) {
        return res.render('auth/login', { error: 'La URL del sitio WordPress no es válida. Asegúrate que incluya http:// o https://' });
    }
    
    const pluginApiPath = process.env.WP_PLUGIN_API_PATH || '/wp-json/tvp-pos-connector/v1';
    const authEndpointPath = process.env.WP_AUTH_ENDPOINT_PATH || '/auth/login';
    const fullAuthUrl = `${formattedWpSiteUrl}${pluginApiPath}${authEndpointPath}`;
    
    console.log(`Intentando login en: ${fullAuthUrl}`); // Para depuración

    try {
        const response = await axios.post(fullAuthUrl, {
            username: email, // El nombre del parámetro que tu API de WP espera
            password: password
        });
        
        // Asumiendo que tu API devuelve { success: true, message: "...", data: { user_info } }
        const userDataFromWP = response.data.data; 

        if (response.data.success && userDataFromWP) {
            // Guardar usuario, URL del sitio WP y token en la sesión
            req.session.wp_site_url = formattedWpSiteUrl; // Guardar la URL base del sitio WP
            req.session.api_token = response.data.token; // Guardar el token de la API de WP
            req.session.user = {
                id: userDataFromWP.user_id,
                email: userDataFromWP.email,
                name: userDataFromWP.display_name,
                role: userDataFromWP.roles,
                billing_details: userDataFromWP.billing_details // Asumiendo que el plugin ya devuelve esto
            };
            console.log('Usuario logueado desde WP:', req.session.user);
            console.log('Sitio WP en sesión:', req.session.wp_site_url);
            console.log('Token API guardado en sesión:', req.session.api_token ? 'Sí' : 'No');

            // Configurar la duración de la cookie de sesión según "Recuérdame"
            if (req.body.rememberMe) {
                // Extiende la cookie de sesión a 30 días
                req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; 
                console.log('Opción "Recuérdame" activada. Duración de sesión extendida.');
            } else {
                // Sesión de navegador (se borra al cerrar el navegador)
                req.session.cookie.expires = false; 
                console.log('Opción "Recuérdame" no activada. Sesión de navegador.');
            }

            const redirectTo = req.session.returnTo || '/';
            delete req.session.returnTo;
            res.redirect(redirectTo);
        } else {
            // Si success no es true, o no hay data, tratar como error
            res.render('auth/login', { error: response.data.message || 'Credenciales incorrectas o error inesperado desde WP.' });
        }

    } catch (error) {
        console.error('Error durante el login (llamada a WP API):', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        let errorMessage = 'Error al conectar con el sitio WordPress o al intentar iniciar sesión. Verifica la URL y tus credenciales.';
        if (error.response && error.response.data && error.response.data.message) {
            errorMessage = error.response.data.message;
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            errorMessage = 'No se pudo conectar a la URL del sitio WordPress proporcionada. Verifica que sea correcta y accesible.';
        }
        res.render('auth/login', { error: errorMessage });
    }
};

export const handleLogout = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error al cerrar sesión:', err);
            // Manejar el error, quizás redirigir con un mensaje
            return res.redirect('/'); // O a una página de error
        }
        res.clearCookie('connect.sid'); // Limpiar la cookie de sesión (el nombre puede variar si lo cambiaste)
        res.redirect('/login');
    });
};
