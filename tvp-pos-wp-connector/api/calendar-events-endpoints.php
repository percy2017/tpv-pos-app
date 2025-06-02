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
            'search' => array(
                'description'       => 'Término de búsqueda para eventos de suscripción.',
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ),
            // Parámetros start_date y end_date para el rango del calendario
            'start_date' => array(
                'description'       => 'Fecha de inicio del rango del calendario (YYYY-MM-DD).',
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field', // Podría necesitar validación de formato de fecha
            ),
            'end_date'   => array(
                'description'       => 'Fecha de fin del rango del calendario (YYYY-MM-DD).',
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field', // Podría necesitar validación de formato de fecha
            ),
        ),
    ) );
}

/**
 * Callback para obtener eventos de vencimiento de suscripciones desde pedidos de WooCommerce,
 * adaptado para usar wc_get_orders y los meta keys correctos.
 */
function tvp_pos_get_subscription_events_api( WP_REST_Request $request ) {
    error_log('[TVP-POS DEBUG] calendar-events-endpoints.php --- INICIO DE tvp_pos_get_subscription_events_api (usando wc_get_orders) ---');
    $token = $request->get_header( 'X-TVP-Token' );
    $user_validation = tvp_pos_validate_token_and_get_user( $token );

    if ( ! $user_validation ) {
        error_log('[TVP-POS DEBUG] calendar-events-endpoints.php - Token inválido o expirado.');
        return new WP_Error( 'rest_invalid_token', __( 'Token inválido o expirado.', 'tvp-pos-wp-connector' ), array( 'status' => 401 ) );
    }

    if ( ! class_exists( 'WooCommerce' ) || ! function_exists('wc_get_orders') ) {
        error_log('[TVP-POS DEBUG] calendar-events-endpoints.php - WooCommerce no activo o wc_get_orders no existe.');
        return new WP_Error( 'woocommerce_not_active', __( 'WooCommerce no está activo o la función wc_get_orders no está disponible.', 'tvp-pos-wp-connector' ), array( 'status' => 500 ) );
    }
    
    $params = $request->get_params();
    $events = array();

    $order_args = array(
        'status'      => array('wc-processing', 'wc-completed', 'wc-on-hold'), // Incluir prefijos wc-
        'limit'       => -1, // Obtener todos
        'meta_query'  => array(
            'relation' => 'AND',
            array( 'key' => '_tvp_pos_sale', 'value' => 'yes', 'compare' => '=' ),
            array( 'key' => '_sale_type', 'value' => 'suscripcion', 'compare' => '=' ),
            array( 'key' => '_subscription_expiry', 'compare' => 'EXISTS' ),
            array( 'key' => '_subscription_expiry', 'value' => '', 'compare' => '!=' ),
        ),
        'orderby'     => 'meta_value', 
        'meta_key'    => '_subscription_expiry', // Ordenar por la fecha de expiración
        'order'       => 'ASC',
        'return'      => 'ids', 
    );
    
    // Filtrado por rango de fechas si se proporcionan start_date y end_date
    // FullCalendar envía las fechas en formato ISO8601, ej: 2025-06-01T00:00:00-04:00
    // Necesitamos solo la parte de la fecha YYYY-MM-DD para la meta_query de WP
    if ( ! empty( $params['start_date'] ) && preg_match('/^(\d{4}-\d{2}-\d{2})/', $params['start_date'], $start_matches) ) {
        $order_args['meta_query'][] = array(
            'key'     => '_subscription_expiry',
            'value'   => $start_matches[1],
            'compare' => '>=',
            'type'    => 'DATE',
        );
    }
    if ( ! empty( $params['end_date'] ) && preg_match('/^(\d{4}-\d{2}-\d{2})/', $params['end_date'], $end_matches) ) {
         $order_args['meta_query'][] = array(
            'key'     => '_subscription_expiry',
            'value'   => $end_matches[1],
            'compare' => '<=', // FullCalendar envía el 'end' como exclusivo, pero para 'DATE' compare '<=' es más simple
            'type'    => 'DATE',
        );
    }
    
    // Manejo de búsqueda (simplificado por ahora, wc_get_orders no tiene un 's' tan flexible como WP_Query)
    // Si se necesita búsqueda avanzada, se podría hacer un pre-filtrado de clientes o productos
    // y luego pasar esos IDs a 'customer' o 'post__in' en $order_args.
    // if ( ! empty( $params['search'] ) ) {
    //     // Esta es una limitación, wc_get_orders no tiene un parámetro 's' simple.
    //     // Se podría intentar buscar por ID de pedido si es numérico.
    // }

    error_log('[TVP-POS DEBUG] Args para wc_get_orders (subscription-events): ' . print_r($order_args, true));
    $order_ids = wc_get_orders( $order_args );
    error_log('[TVP-POS DEBUG] Resultado de wc_get_orders (IDs): ' . print_r($order_ids, true) . ' - Cantidad: ' . count($order_ids));

    if ( ! empty( $order_ids ) ) {
        foreach ( $order_ids as $order_id ) {
            $order = wc_get_order( $order_id );
            if ( ! $order ) {
                error_log('[TVP-POS DEBUG] No se pudo obtener el objeto WC_Order para el ID: ' . $order_id);
                continue;
            }

            $expiry_date = $order->get_meta( '_subscription_expiry' );
            $subscription_title = $order->get_meta( '_subscription_title' );
            // Para el nombre del cliente, usar get_billing_first_name y get_billing_last_name si están disponibles
            $customer_name = trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name());
            if (empty($customer_name) && $order->get_customer_id()) {
                $customer = get_user_by('id', $order->get_customer_id());
                if ($customer) {
                    $customer_name = $customer->display_name;
                }
            }
            if (empty($customer_name)) {
                $customer_name = 'Cliente ID ' . $order->get_customer_id();
            }
            
            error_log('[TVP-POS DEBUG] Procesando Pedido ID: ' . $order_id . ' - Título Sub: "' . $subscription_title . '", Fecha Exp: "' . $expiry_date . '"');

            $event_title = $subscription_title ? esc_html($subscription_title) : sprintf( __( 'Vence Suscripción: %s', 'tvp-pos-wp-connector' ), $customer_name );
            $event_title .= sprintf( ' (Pedido #%d)', $order_id);

            if ( $expiry_date && preg_match('/^\d{4}-\d{2}-\d{2}$/', $expiry_date) ) {
                $events[] = array(
                    'id'    => 'wp_sub_' . $order_id,
                    'title' => $event_title,
                    'start' => $expiry_date,
                    'allDay'=> true, 
                    'color' => $order->get_meta('_pos_subscription_color') ?: '#3a87ad', // Usar color guardado o default
                    'extendedProps' => array( 
                        'type' => 'subscription_expiry',
                        'order_id' => $order_id,
                        'customer_name' => $customer_name,
                        'subscription_title' => $subscription_title,
                        'order_url' => $order->get_edit_order_url()
                    )
                );
            } else {
                error_log('[TVP-POS DEBUG] Fecha de vencimiento inválida o vacía para pedido #' . $order_id . ': "' . $expiry_date . '". Se omite evento.');
            }
        }
    } else {
         error_log('[TVP-POS DEBUG] No se encontraron pedidos de suscripción con wc_get_orders usando los criterios.');
    }
    
    error_log('[TVP-POS DEBUG] Total de eventos de suscripción procesados: ' . count($events));
    return new WP_REST_Response( $events, 200 );
}
?>
