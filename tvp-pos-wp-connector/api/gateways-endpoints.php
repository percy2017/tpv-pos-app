<?php
/**
 * Endpoints de Pasarelas de Pago para TVP-POS Connector
 */

if ( ! defined( 'WPINC' ) ) {
    die;
}

add_action( 'rest_api_init', 'tvp_pos_register_payment_gateways_api_routes' );

/**
 * Registra las rutas de la API REST para las pasarelas de pago de WooCommerce.
 */
function tvp_pos_register_payment_gateways_api_routes() {
    register_rest_route( 'tvp-pos-connector/v1', '/payment-gateways', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'tvp_pos_get_payment_gateways_api',
        'permission_callback' => '__return_true', // Validación de token dentro del callback
    ) );
}

/**
 * Callback para obtener una lista de pasarelas de pago activas de WooCommerce.
 */
function tvp_pos_get_payment_gateways_api( WP_REST_Request $request ) {
    $token = $request->get_header( 'X-TVP-Token' );
    $user = tvp_pos_validate_token_and_get_user( $token );

    if ( ! $user ) {
        return new WP_Error( 'rest_invalid_token', __( 'Token inválido o expirado.', 'tvp-pos-wp-connector' ), array( 'status' => 401 ) );
    }

    if ( ! class_exists( 'WooCommerce' ) ) {
        return new WP_Error( 'woocommerce_not_active', __( 'WooCommerce no está activo.', 'tvp-pos-wp-connector' ), array( 'status' => 500 ) );
    }

    $payment_gateways_class = WC()->payment_gateways();
    $available_gateways = $payment_gateways_class->get_available_payment_gateways();

    $gateways_data = array();

    if ( ! empty( $available_gateways ) ) {
        foreach ( $available_gateways as $gateway_id => $gateway ) {
            if ( $gateway->enabled === 'yes' ) { // Asegurarse de que la pasarela esté activa
                $gateways_data[] = array(
                    'id'          => $gateway->id,
                    'title'       => $gateway->get_title(), // Título que ve el cliente
                    'description' => $gateway->get_description(),
                    'method_title'=> $gateway->get_method_title(), // Título para el admin
                    'icon'        => $gateway->get_icon(), // URL del ícono si existe
                    // 'supports'    => $gateway->supports, // Array de características soportadas (ej: 'products', 'refunds')
                    // Puedes añadir más campos si son necesarios desde el objeto $gateway
                );
            }
        }
    }

    // Asegurar una opción de efectivo para el POS
    $pos_cash_option_exists = false;
    foreach ($gateways_data as $gateway) {
        if ($gateway['id'] === 'cod' || $gateway['id'] === 'pos_cash') { // 'cod' es el ID común para Cash on Delivery
            $pos_cash_option_exists = true;
            break;
        }
    }

    if (!$pos_cash_option_exists) {
        $gateways_data[] = array(
            'id'          => 'pos_cash', // Un ID único para el efectivo del POS
            'title'       => __( 'Efectivo (POS)', 'tvp-pos-wp-connector' ),
            'description' => __( 'Pago en efectivo realizado en el punto de venta.', 'tvp-pos-wp-connector' ),
            'method_title'=> __( 'Efectivo (POS)', 'tvp-pos-wp-connector' ),
            'icon'        => '',
        );
    }
    
    // Opcional: Ordenar las pasarelas, por ejemplo, alfabéticamente por título
    // usort($gateways_data, function($a, $b) {
    //     return strcmp($a['title'], $b['title']);
    // });

    return new WP_REST_Response( $gateways_data, 200 );
}
?>
