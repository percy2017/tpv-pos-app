<?php
/**
 * Endpoints de Eventos de Calendario para TVP-POS Connector
 */

if ( ! defined( 'WPINC' ) ) {
    die;
}

add_action( 'rest_api_init', 'tvp_pos_register_calendar_events_api_routes' );

/**
 * Registra las rutas de la API REST para eventos del calendario.
 */
function tvp_pos_register_calendar_events_api_routes() {
    register_rest_route( 'tvp-pos-connector/v1', '/subscription-events', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'tvp_pos_get_subscription_events_api',
        'permission_callback' => '__return_true', // Validación de token dentro del callback
        'args'                => array(
            // Podríamos añadir 'start' y 'end' si FullCalendar los envía para filtrar por rango
            // 'start_date' => array('type' => 'string', 'format' => 'date'),
            // 'end_date'   => array('type' => 'string', 'format' => 'date'),
            'search' => array(
                'description'       => 'Término de búsqueda para eventos de suscripción.',
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ),
        ),
    ) );
}

/**
 * Callback para obtener eventos de vencimiento de suscripciones desde pedidos de WooCommerce.
 */
function tvp_pos_get_subscription_events_api( WP_REST_Request $request ) {
    $token = $request->get_header( 'X-TVP-Token' );
    $user_validation = tvp_pos_validate_token_and_get_user( $token );

    if ( ! $user_validation ) {
        return new WP_Error( 'rest_invalid_token', __( 'Token inválido o expirado.', 'tvp-pos-wp-connector' ), array( 'status' => 401 ) );
    }

    if ( ! class_exists( 'WooCommerce' ) ) {
        return new WP_Error( 'woocommerce_not_active', __( 'WooCommerce no está activo.', 'tvp-pos-wp-connector' ), array( 'status' => 500 ) );
    }
    
    $params = $request->get_params();
    $args = array(
        'post_type'   => 'shop_order',
        'post_status' => array_keys( wc_get_order_statuses() ), // Considerar todos los estados o filtrar
        'posts_per_page' => -1, // Obtener todos los relevantes
        'meta_query'  => array(
            'relation' => 'AND',
            array(
                'key'     => '_tvp_pos_sale', // Asegurar que es una venta del TPV
                'value'   => 'yes',
                'compare' => '=',
            ),
            array(
                'key'     => '_sale_type', // Usar el metadato correcto
                'value'   => 'suscripcion', // 'suscripcion' es lo que guardamos
                'compare' => '=',
            ),
            array(
                'key'     => '_subscription_expiry', // Usar el metadato correcto
                'compare' => 'EXISTS', // Asegurar que el metadato exista
            ),
            array(
                'key'     => '_subscription_expiry', // Usar el metadato correcto
                'value'   => '',
                'compare' => '!=', // Asegurar que no esté vacío
            ),
            // Si se pasan 'start_date' y 'end_date' para filtrar por rango:
            // (Asegúrate que $request->get_param('start_date') y $request->get_param('end_date') se manejen si se usan)
            // array(
            //     'key'     => '_pos_subscription_expiry_date',
            //     'value'   => $request->get_param('start_date'),
            //     'compare' => '>=',
            //     'type'    => 'DATE',
            // ),
            // array(
            //     'key'     => '_pos_subscription_expiry_date',
            //     'value'   => $request->get_param('end_date'),
            //     'compare' => '<=',
            //     'type'    => 'DATE',
            // ),
        ),
    );

    if ( ! empty( $params['search'] ) ) {
        // WP_Query con 's' busca en título y contenido del post (pedido).
        // Para buscar en metadatos del cliente (nombre, email) asociados al pedido,
        // se necesitaría una consulta más compleja o buscar IDs de cliente primero.
        // Por ahora, una búsqueda simple en el contenido del pedido.
        $args['s'] = sanitize_text_field( $params['search'] );
    }
    
    error_log('TVP-POS DEBUG: Args para WP_Query (subscription-events): ' . print_r($args, true));
    $orders_query = new WP_Query( $args );
    $events = array();

    if ( $orders_query->have_posts() ) {
        while ( $orders_query->have_posts() ) {
            $orders_query->the_post();
            $order_id = get_the_ID();
            $order = wc_get_order( $order_id );

            if ( $order ) {
                $expiry_date = $order->get_meta( '_subscription_expiry' ); // Usar el metadato correcto
                $subscription_title = $order->get_meta( '_subscription_title' );
                $customer_name = $order->get_formatted_billing_full_name();
                
                $event_title = $subscription_title ? esc_html($subscription_title) : sprintf( __( 'Vence Suscripción Cliente: %s', 'tvp-pos-wp-connector' ), $customer_name );
                $event_title .= sprintf( ' (Pedido #%d)', $order_id);


                if ( $expiry_date ) { // Asegurarse que la fecha exista y no esté vacía
                    // Validar formato de fecha YYYY-MM-DD
                    if ( ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $expiry_date) ) {
                        error_log('[TVP-POS DEBUG] calendar-events-endpoints.php - Fecha de vencimiento inválida para pedido #' . $order_id . ': ' . $expiry_date);
                        continue; // Saltar este evento si la fecha no es válida
                    }

                    $events[] = array(
                        'id'    => 'wp_sub_' . $order_id, // ID único para el evento
                        'title' => $event_title,
                        'start' => $expiry_date, // Debe estar en formato YYYY-MM-DD
                        'allDay'=> true, 
                        'color' => '#3a87ad', 
                        'extendedProps' => array( 
                            'type' => 'subscription_expiry',
                            'order_id' => $order_id,
                            'customer_name' => $customer_name,
                            'subscription_title' => $subscription_title, // Añadir para más contexto si se hace clic
                            'order_url' => admin_url( 'post.php?post=' . $order_id . '&action=edit' )
                        )
                    );
                }
            }
        }
        wp_reset_postdata();
    }

    return new WP_REST_Response( $events, 200 );
}
?>
