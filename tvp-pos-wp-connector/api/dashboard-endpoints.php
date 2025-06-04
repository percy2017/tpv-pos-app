<?php
/**
 * Endpoints del Dashboard para TVP-POS Connector
 */

if ( ! defined( 'WPINC' ) ) {
    die;
}

add_action( 'rest_api_init', 'tvp_pos_register_dashboard_api_routes' );

/**
 * Registra las rutas de la API REST para el dashboard.
 */
function tvp_pos_register_dashboard_api_routes() {
    // Endpoint para contadores de estado de pedidos
    register_rest_route( 'tvp-pos-connector/v1', '/dashboard/order-status-counts', array(
        'methods'             => WP_REST_Server::READABLE, // GET
        'callback'            => 'tvp_pos_get_order_status_counts_api',
        'permission_callback' => 'tvp_pos_api_permission_check', 
    ) );

    // Aquí se añadirán más endpoints para el dashboard (ventas del mes, top seller, etc.)
}

/**
 * Callback para obtener los contadores de estado de pedidos.
 */
function tvp_pos_get_order_status_counts_api( WP_REST_Request $request ) {
    if ( ! class_exists( 'WooCommerce' ) ) {
        return new WP_Error( 'woocommerce_not_active', __( 'WooCommerce no está activo.', 'tvp-pos-wp-connector' ), array( 'status' => 500 ) );
    }

    $processing_count = 0;
    $on_hold_count = 0;
    $completed_count = 0; // Ejemplo de otro estado que podría ser útil

    // Obtener todos los estados de pedidos registrados en WooCommerce
    $order_statuses = wc_get_order_statuses();

    if ( array_key_exists( 'wc-processing', $order_statuses ) ) {
        $processing_count = wc_orders_count( 'processing' );
    }
    if ( array_key_exists( 'wc-on-hold', $order_statuses ) ) {
        $on_hold_count = wc_orders_count( 'on-hold' );
    }
    if ( array_key_exists( 'wc-completed', $order_statuses ) ) {
        $completed_count = wc_orders_count( 'completed' );
    }
    // Puedes añadir más estados si los necesitas

    $response_data = array(
        'processing' => $processing_count,
        'on_hold'    => $on_hold_count,
        'completed'  => $completed_count,
        // Añade aquí más contadores si es necesario
    );

    return new WP_REST_Response( $response_data, 200 );
}

// Nota: La función tvp_pos_api_permission_check ahora se carga desde token-helper.php.

?>
