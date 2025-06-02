<?php
/**
 * Endpoints de Cupones para TVP-POS Connector
 */

if ( ! defined( 'WPINC' ) ) {
    die;
}

add_action( 'rest_api_init', 'tvp_pos_register_coupon_api_routes' );

/**
 * Registra las rutas de la API REST para cupones.
 */
function tvp_pos_register_coupon_api_routes() {
    register_rest_route( 'tvp-pos-connector/v1', '/coupons/validate', array(
        'methods'             => WP_REST_Server::CREATABLE, // POST
        'callback'            => 'tvp_pos_validate_coupon_api_callback',
        'permission_callback' => 'tvp_pos_api_permission_check', // Reutilizar la función de chequeo de permisos/token
        'args'                => array(
            'coupon_code' => array(
                'description'       => 'El código del cupón a validar.',
                'type'              => 'string',
                'required'          => true,
                'sanitize_callback' => 'sanitize_text_field',
            ),
            'cart_subtotal' => array(
                'description'       => 'El subtotal actual del carrito (opcional, para cupones con mínimos).',
                'type'              => 'number',
                'sanitize_callback' => 'floatval',
            ),
            // Podrías añadir 'cart_items' si la validación del cupón depende de productos específicos en el carrito.
        ),
    ) );
}

/**
 * Callback para validar un código de cupón.
 */
function tvp_pos_validate_coupon_api_callback( WP_REST_Request $request ) {
    // La validación del token ya se hizo en tvp_pos_api_permission_check si se configuró así.
    // Si no, se debe validar aquí:
    // $token = $request->get_header( 'X-TVP-Token' );
    // $user = tvp_pos_validate_token_and_get_user( $token );
    // if ( ! $user ) {
    //     return new WP_Error( 'rest_invalid_token', __( 'Token inválido o expirado.', 'tvp-pos-wp-connector' ), array( 'status' => 401 ) );
    // }

    if ( ! class_exists( 'WooCommerce' ) ) {
        return new WP_Error( 'woocommerce_not_active', __( 'WooCommerce no está activo.', 'tvp-pos-wp-connector' ), array( 'status' => 500 ) );
    }

    $coupon_code = $request->get_param( 'coupon_code' );
    // $cart_subtotal = $request->get_param( 'cart_subtotal' ); // Usar si es necesario para la validación

    if ( empty( $coupon_code ) ) {
        return new WP_Error( 'missing_coupon_code', __( 'No se proporcionó código de cupón.', 'tvp-pos-wp-connector' ), array( 'status' => 400 ) );
    }

    $coupon = new WC_Coupon( $coupon_code );

    if ( ! $coupon->get_id() ) {
        return new WP_REST_Response( array( 'success' => false, 'message' => __( 'El código de cupón no existe.', 'tvp-pos-wp-connector' ) ), 404 );
    }

    // Validaciones básicas del cupón (puedes expandir esto)
    $discounts = new WC_Discounts( WC()->cart ); // WC_Discounts necesita un carrito, aunque sea temporal o vacío para algunas validaciones
    $valid = $discounts->is_coupon_valid( $coupon );

    if ( is_wp_error( $valid ) ) {
        return new WP_REST_Response( array( 'success' => false, 'message' => $valid->get_error_message() ), 400 );
    }
    
    // Si necesitas validaciones más específicas que is_coupon_valid no cubre (ej. uso por cliente, etc.) añádelas aquí.
    // Por ejemplo, verificar si el cupón ha alcanzado su límite de uso:
    if ( $coupon->get_usage_limit() > 0 && $coupon->get_usage_count() >= $coupon->get_usage_limit() ) {
        return new WP_REST_Response( array( 'success' => false, 'message' => __( 'Este cupón ha alcanzado su límite de uso.', 'tvp-pos-wp-connector' ) ), 400 );
    }

    // Verificar fecha de expiración
    if ( $coupon->get_date_expires() && time() > $coupon->get_date_expires()->getTimestamp() ) {
         return new WP_REST_Response( array( 'success' => false, 'message' => __( 'Este cupón ha expirado.', 'tvp-pos-wp-connector' ) ), 400 );
    }
    
    // Si todas las validaciones pasan:
    $response_data = array(
        'success'         => true,
        'message'         => __( 'Cupón válido.', 'tvp-pos-wp-connector' ),
        'coupon_code'     => $coupon->get_code(),
        'discount_type'   => $coupon->get_discount_type(), // 'percent', 'fixed_cart', 'fixed_product'
        'discount_amount' => floatval( $coupon->get_amount() ),
        // Podrías añadir más detalles si son necesarios para el TPV
        // 'minimum_amount' => $coupon->get_minimum_amount(),
        // 'maximum_amount' => $coupon->get_maximum_amount(),
        // 'free_shipping' => $coupon->get_free_shipping(),
    );

    return new WP_REST_Response( $response_data, 200 );
}

// Asegúrate de que la función tvp_pos_api_permission_check exista y sea adecuada.
// Si no existe globalmente o en otro archivo incluido, debes definirla o usar la validación de token dentro del callback.
// Ejemplo de tvp_pos_api_permission_check (si no la tienes ya):
/*
if (!function_exists('tvp_pos_api_permission_check')) {
    function tvp_pos_api_permission_check(WP_REST_Request $request) {
        $token = $request->get_header('X-TVP-Token');
        $user = tvp_pos_validate_token_and_get_user($token); // Asume que tvp_pos_validate_token_and_get_user está disponible
        if (!$user) {
            return new WP_Error('rest_invalid_token', __('Token inválido o expirado.', 'tvp-pos-wp-connector'), array('status' => 401));
        }
        // Opcional: verificar capabilities del usuario si es necesario
        // if (!user_can($user->ID, 'manage_woocommerce')) { // Ejemplo
        //     return new WP_Error('rest_forbidden', __('No tienes permiso para esta acción.', 'tvp-pos-wp-connector'), array('status' => 403));
        // }
        return true;
    }
}
*/

// También, asegúrate que tvp_pos_validate_token_and_get_user() esté disponible.
// Usualmente está en token-helper.php o un archivo similar.
// Si no está, necesitarás incluir ese archivo o definir la función aquí.
// Ejemplo: require_once plugin_dir_path( __FILE__ ) . 'token-helper.php'; (ajusta la ruta)

?>
