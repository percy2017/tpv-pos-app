<?php
/**
 * Endpoints de Autenticación para TVP-POS Connector
 */

if ( ! defined( 'WPINC' ) ) {
    die;
}

add_action( 'rest_api_init', 'tvp_pos_register_auth_api_routes' );

/**
 * Registra las rutas de la API REST para autenticación.
 */
function tvp_pos_register_auth_api_routes() {
    register_rest_route( 'tvp-pos-connector/v1', '/auth/login', array(
        'methods'             => 'POST',
        'callback'            => 'tvp_pos_handle_login_api',
        'permission_callback' => '__return_true', // Permitir acceso público para el login
        'args'                => array(
            'username' => array(
                'required'    => true,
                'description' => 'WordPress username or email.',
                'type'        => 'string',
            ),
            'password' => array(
                'required'    => true,
                'description' => 'WordPress user password.',
                'type'        => 'string',
            ),
        ),
    ) );

    // Aquí podrías registrar otras rutas de autenticación, como /auth/validate-token, /auth/register, etc.
}

/**
 * Maneja la solicitud de login.
 *
 * @param WP_REST_Request $request Datos completos de la solicitud.
 * @return WP_REST_Response|WP_Error Objeto WP_REST_Response en caso de éxito, o WP_Error en caso de fallo.
 */
function tvp_pos_handle_login_api( WP_REST_Request $request ) {
    $username = sanitize_user( $request->get_param( 'username' ) );
    $password = $request->get_param( 'password' ); // wp_authenticate se encarga de la seguridad de la contraseña.

    if ( empty( $username ) || empty( $password ) ) {
        return new WP_Error( 
            'credentials_missing', 
            __( 'Nombre de usuario/email y contraseña son requeridos.', 'tvp-pos-wp-connector' ), 
            array( 'status' => 400 ) 
        );
    }

    $user = wp_authenticate( $username, $password );

    if ( is_wp_error( $user ) ) {
        // Traducir errores comunes de WordPress si es posible, o devolver el mensaje genérico.
        $error_message = $user->get_error_message();
        // Ejemplo: if ($user->get_error_code() === 'incorrect_password') { $error_message = 'Contraseña incorrecta.'; }
        return new WP_Error( 
            'authentication_failed', 
            $error_message, // O un mensaje más genérico: __( 'Credenciales incorrectas.', 'tvp-pos-wp-connector' )
            array( 'status' => 401 ) 
        );
    }

    // Autenticación exitosa

    // Generar token de sesión simple
    $session_token = wp_generate_password( 64, false, false );
    // Expiración del token (ej: 7 días. Ajusta según necesidad)
    $token_expiration = time() + ( DAY_IN_SECONDS * 7 ); 

    // Guardar el token y su expiración en usermeta
    update_user_meta( $user->ID, '_tvp_pos_session_token', $session_token );
    update_user_meta( $user->ID, '_tvp_pos_session_token_expires', $token_expiration );

    // Opcional: Establecer cookie de autenticación de WordPress para compatibilidad
    // wp_set_current_user( $user->ID, $user->user_login );
    // wp_set_auth_cookie( $user->ID ); // Esto podría no ser necesario si solo usas el token

    // Considera qué datos del usuario son seguros y necesarios para devolver.
    $user_data = array(
        'user_id'       => $user->ID,
        'username'      => $user->user_login,
        'email'         => $user->user_email,
        'display_name'  => $user->display_name,
        'first_name'    => $user->first_name,
        'last_name'     => $user->last_name,
        'roles'         => $user->roles,
        'avatar_url'    => get_avatar_url( $user->ID ),
        'billing_details' => null, // Inicializar
    );

    if ( class_exists( 'WooCommerce' ) ) {
        $customer = new WC_Customer( $user->ID );
        if ( $customer && $customer->get_id() ) { // Verificar si es un cliente válido
            $user_data['billing_details'] = array(
                'first_name' => $customer->get_billing_first_name(),
                'last_name'  => $customer->get_billing_last_name(),
                'phone'      => $customer->get_billing_phone(),
                // Se podrían añadir más campos de billing_details aquí si se necesitan en el futuro
                // 'company'    => $customer->get_billing_company(),
                // 'address_1'  => $customer->get_billing_address_1(),
                // 'address_2'  => $customer->get_billing_address_2(),
                // 'city'       => $customer->get_billing_city(),
                // 'state'      => $customer->get_billing_state(),
                // 'postcode'   => $customer->get_billing_postcode(),
                // 'country'    => $customer->get_billing_country(),
                // 'email'      => $customer->get_billing_email(), // Ya está en el nivel superior
            );
            // También podrías añadir otros datos de WooCommerce del cliente si son útiles
            // $user_data['is_paying_customer'] = $customer->get_is_paying_customer();
            // $user_data['order_count'] = $customer->get_order_count();
            // $user_data['total_spent'] = $customer->get_total_spent();
        }
    }

    return new WP_REST_Response( array(
        'success' => true,
        'message' => __( 'Login exitoso.', 'tvp-pos-wp-connector' ),
        'data'    => $user_data,
        'token'   => $session_token, // Devolver el token generado
    ), 200 );
}
?>
