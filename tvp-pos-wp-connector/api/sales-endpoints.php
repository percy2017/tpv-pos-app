<?php
/**
 * Endpoints de Ventas para TVP-POS Connector
 */

if ( ! defined( 'WPINC' ) ) {
    die;
}

add_action( 'rest_api_init', 'tvp_pos_register_sales_api_routes' );

/**
 * Registra las rutas de la API REST para ventas.
 */
function tvp_pos_register_sales_api_routes() {
    register_rest_route( 'tvp-pos-connector/v1', '/sales', array(
        'methods'             => WP_REST_Server::READABLE, // GET
        'callback'            => 'tvp_pos_get_sales_api',
        'permission_callback' => '__return_true', // Validación de token dentro del callback
        'args'                => array(
            'page'     => array(
                'description'       => 'Página actual de la colección.',
                'type'              => 'integer',
                'default'           => 1,
                'sanitize_callback' => 'absint',
            ),
            'per_page' => array(
                'description'       => 'Máximo número de ítems a devolver por página.',
                'type'              => 'integer',
                'default'           => 10,
                'sanitize_callback' => 'absint',
            ),
            // Aquí podrías añadir más args para filtros: status, date_query, customer_id, etc.
        ),
    ) );

    register_rest_route( 'tvp-pos-connector/v1', '/sales/(?P<id>\d+)', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'tvp_pos_get_single_sale_api',
        'permission_callback' => '__return_true', // Validación de token dentro del callback
        'args'                => array(
            'id' => array(
                'description'       => 'ID único del pedido.',
                'type'              => 'integer',
                'validate_callback' => function( $param, $request, $key ) {
                    return is_numeric( $param ) && $param > 0;
                },
                'required'          => true,
            ),
        ),
    ) );

    register_rest_route( 'tvp-pos-connector/v1', '/sales', array(
        'methods'             => WP_REST_Server::CREATABLE, // POST
        'callback'            => 'tvp_pos_create_sale_api',
        'permission_callback' => '__return_true', // Validación de token dentro del callback
        'args'                => array(
            // Aquí podrías definir los args esperados en el cuerpo del POST si quieres validación automática de WP
            // Por ahora, validaremos manualmente en el callback.
        ),
    ) );
}

/**
 * Callback para obtener una lista de ventas (pedidos de WooCommerce).
 */
function tvp_pos_get_sales_api( WP_REST_Request $request ) {
    $token = $request->get_header( 'X-TVP-Token' );
    $user = tvp_pos_validate_token_and_get_user( $token );

    if ( ! $user ) {
        return new WP_Error( 'rest_invalid_token', __( 'Token inválido o expirado.', 'tvp-pos-wp-connector' ), array( 'status' => 401 ) );
    }
    // Opcional: Establecer el usuario actual si necesitas usar current_user_can() u otras funciones basadas en el usuario actual.
    // wp_set_current_user( $user->ID );

    if ( ! class_exists( 'WooCommerce' ) ) {
        return new WP_Error( 'woocommerce_not_active', __( 'WooCommerce no está activo.', 'tvp-pos-wp-connector' ), array( 'status' => 500 ) );
    }

    $params = $request->get_params();

    // Parámetros para WC_Order_Query
    $paged = isset($params['page']) ? intval($params['page']) : 1;
    $limit = isset($params['per_page']) ? intval($params['per_page']) : 10;
    
    $orderby_map = array( // Mapeo de nombres de columna de DataTables a campos de WC_Order_Query
        'id' => 'ID',
        'date_created' => 'date',
        'status' => 'status',
        'total' => 'total'
        // 'customer_name' no es directamente ordenable por WC_Order_Query, requeriría joins o post-procesamiento.
    );

    $orderby = 'date'; // Default
    $order_dir = 'DESC'; // Default

    // Determinar ordenación (esto se aplica siempre, con o sin búsqueda)
    if ( isset( $params['order'][0]['column'] ) && isset( $params['order'][0]['dir'] ) ) {
        $column_index = intval( $params['order'][0]['column'] );
        $column_name_from_dt = isset( $params['columns'][$column_index]['data'] ) ? $params['columns'][$column_index]['data'] : '';
        
        if ( $column_name_from_dt && isset( $orderby_map[$column_name_from_dt] ) ) {
            $orderby = $orderby_map[$column_name_from_dt];
        }
        $req_order_dir = strtolower( $params['order'][0]['dir'] );
        if ( in_array( $req_order_dir, array('asc', 'desc') ) ) {
            $order_dir = $req_order_dir;
        }
    }

    // Argumentos base para la consulta principal (se ajustarán si hay búsqueda)
    $args = array(
        'orderby'  => $orderby,
        'order'    => $order_dir,
        'paginate' => true, 
        // 'limit' y 'paged' se añadirán después, dependiendo de si hay búsqueda o no
    );

    if ( ! empty( $params['customer_id'] ) ) {
        $args['customer_id'] = intval( $params['customer_id'] );
    }
    
    // Búsqueda
    // El search term para DataTables server-side viene en $params['search']['value']
    $search_term = '';
    if ( ! empty( $params['search'] ) && is_array( $params['search'] ) && ! empty( $params['search']['value'] ) ) {
        $search_term = sanitize_text_field( $params['search']['value'] );
    } elseif ( ! empty( $params['search'] ) && is_string( $params['search'] ) ) { // Fallback si 'search' es solo un string
        $search_term = sanitize_text_field( $params['search'] );
    }

    if ( ! empty( $search_term ) ) {
        error_log('[TVP-POS DEBUG] Search Term Received: ' . $search_term);

        $order_ids_from_text_search = array();
        $order_ids_from_phone_search = array();

        // 1. Búsqueda por texto general de WooCommerce (usando 's') - se ejecuta siempre si hay search_term
        //    Esto buscará en campos indexados por WC como título, contenido, extracto, y algunos metas de cliente.
        $general_search_args = array('return' => 'ids', 'limit' => -1, 's' => $search_term);
        // Si también se filtra por customer_id, añadirlo a la búsqueda general
        if ( ! empty( $params['customer_id'] ) ) {
            $general_search_args['customer_id'] = intval( $params['customer_id'] );
        }
        $general_search_query = new WC_Order_Query($general_search_args);
        $order_ids_from_text_search = $general_search_query->get_orders();
        error_log('[TVP-POS DEBUG] Order IDs from GENERAL TEXT search ("s"): ' . print_r($order_ids_from_text_search, true));
        
        // Adicionalmente, si el término de búsqueda es puramente numérico, podría ser un ID de pedido.
        // Esta búsqueda es más específica y podría añadirse.
        $order_ids_from_id_search = array();
        if (is_numeric($search_term)) {
            $id_search_args = array('return' => 'ids', 'limit' => -1, 'post__in' => array(intval($search_term)));
            if ( ! empty( $params['customer_id'] ) ) { // Considerar customer_id si se busca por ID también
                 $id_search_args['customer_id'] = intval( $params['customer_id'] );
            }
            $id_search_query = new WC_Order_Query($id_search_args);
            $order_ids_from_id_search = $id_search_query->get_orders();
            error_log('[TVP-POS DEBUG] Order IDs from ID search: ' . print_r($order_ids_from_id_search, true));
        }

        // 2. Buscar por teléfono en _billing_phone y _shipping_phone usando SQL directo
        global $wpdb;
        $numeric_search_term = preg_replace('/\D/', '', $search_term); // Obtener solo dígitos

        if (!empty($numeric_search_term)) {
            $escaped_phone_search_sql_value = '%' . $wpdb->esc_like( $numeric_search_term ) . '%';
            $phone_sql_query = $wpdb->prepare(
                "SELECT DISTINCT post_id FROM {$wpdb->postmeta} WHERE (meta_key = '_billing_phone' OR meta_key = '_shipping_phone') AND meta_value LIKE %s",
                $escaped_phone_search_sql_value
            );
            $order_ids_from_phone_search = $wpdb->get_col( $phone_sql_query );
            error_log('[TVP-POS DEBUG] Numeric Search Term for Phone: ' . $numeric_search_term);
            error_log('[TVP-POS DEBUG] SQL Query for Phone (using numeric): ' . $phone_sql_query);
            error_log('[TVP-POS DEBUG] Order IDs from PHONE search (Direct SQL - numeric): ' . print_r($order_ids_from_phone_search, true));
        } else {
            $order_ids_from_phone_search = array(); // No buscar por teléfono si el término limpiado está vacío
            error_log('[TVP-POS DEBUG] Search term did not yield a numeric string for phone search.');
        }
        
        // Ya no se usa la WC_Order_Query para la búsqueda por teléfono con meta_query si la SQL directa es más fiable.

        // 3. Combinar los IDs y eliminar duplicados
        // Ahora se combinan resultados de la búsqueda general 's', la búsqueda por ID (si aplica) y la búsqueda por teléfono.
        $combined_order_ids = array_unique( array_merge( $order_ids_from_text_search, $order_ids_from_id_search, $order_ids_from_phone_search ) );
        error_log('[TVP-POS DEBUG] Combined Order IDs (text + id + phone): ' . print_r($combined_order_ids, true)); 

        if ( ! empty( $combined_order_ids ) ) {
            $args['post__in'] = $combined_order_ids;
            unset( $args['s'] ); 
            $args['limit'] = -1; // Obtener todos los resultados que coincidan con los IDs
            // 'paged' no es necesario si limit es -1
        } else {
            $args['post__in'] = array(0); 
            $args['limit'] = $limit; // Aplicar paginación normal si la búsqueda no arrojó IDs
            $args['paged'] = $paged;
        }
    } else {
        // Si no hay término de búsqueda, aplicar paginación normal
        $args['limit'] = $limit;
        $args['paged'] = $paged;
    }


    error_log('[TVP-POS DEBUG] sales-endpoints.php - tvp_pos_get_sales_api - Args para WC_Order_Query: ' . print_r($args, true));
    $query = new WC_Order_Query( $args );
    $results = $query->get_orders();

    $orders = $results->orders;
    // $total_orders es el total de la consulta paginada, que puede no ser el total filtrado real si post__in se usó.
    $query_total_after_pagination_and_filters = $results->total;

    // Determinar recordsFiltered correctamente
    $recordsFiltered_count = 0;
    if (!empty($search_term)) {
        if (!empty($combined_order_ids)) {
            $recordsFiltered_count = count($combined_order_ids);
        } else {
            $recordsFiltered_count = 0; // No se encontraron IDs combinados
        }
    } else {
        // Si no hay término de búsqueda, recordsFiltered es el total de la consulta (que ya tiene otros filtros como customer_id si se aplicó)
        // Para recordsTotal, necesitaríamos una consulta sin el search_term.
        // Por ahora, si no hay search_term, asumimos que query_total_after_pagination_and_filters es el total filtrado (por otros filtros) y también el total general.
        // Esto necesitará refinamiento para un recordsTotal verdaderamente global.
        $recordsFiltered_count = $query_total_after_pagination_and_filters;
    }
    
    // Para recordsTotal, necesitamos el conteo total de pedidos que cumplen con los filtros base (customer_id si está presente),
    // antes de aplicar el search_term.
    $args_for_total = array(
        'status'   => array_keys( wc_get_order_statuses() ), // Considerar todos los estados para el total
        'limit'    => 1, // Solo necesitamos el conteo
        'paginate' => true, // Necesario para que ->total funcione
    );
    if ( ! empty( $params['customer_id'] ) ) {
        $args_for_total['customer_id'] = intval( $params['customer_id'] );
    }
    // No incluir 's' ni 'post__in' de la búsqueda aquí.
    
    $total_query_obj = new WC_Order_Query( $args_for_total );
    $total_query_results = $total_query_obj->get_orders();
    $recordsTotal_count = $total_query_results->total;


    $sales_data = array();
    if ( ! empty( $orders ) ) {
        foreach ( $orders as $order_obj ) {
            $customer_name = trim( $order_obj->get_billing_first_name() . ' ' . $order_obj->get_billing_last_name() );
            if ( empty( $customer_name ) && $order_obj->get_customer_id() ) {
                $customer = wc_get_customer( $order_obj->get_customer_id() );
                if ($customer) {
                    $customer_name = $customer->get_display_name() ? $customer->get_display_name() : 'Cliente ID: ' . $order_obj->get_customer_id();
                }
            }
            if ( empty( $customer_name ) ) {
                $customer_name = __('Invitado', 'tvp-pos-wp-connector');
            }

            // Resumen de productos
            $products_summary_array = array();
            foreach ($order_obj->get_items() as $item_id => $item) {
                $products_summary_array[] = $item->get_name() . ' x' . $item->get_quantity();
            }
            $products_summary = implode(', ', $products_summary_array);
            if (count($products_summary_array) > 2) { // Si hay más de 2 productos, truncar
                $products_summary = implode(', ', array_slice($products_summary_array, 0, 2)) . ', ...';
            }


            $sales_data[] = array(
                'id'            => $order_obj->get_id(),
                'order_key'     => $order_obj->get_order_key(), // Útil para algunas cosas, no se muestra directamente
                'date_created'  => $order_obj->get_date_created() ? $order_obj->get_date_created()->date( 'Y-m-d H:i:s' ) : null,
                'status'        => $order_obj->get_status(),
                'total'         => floatval( $order_obj->get_total() ),
                'currency'      => $order_obj->get_currency(),
                'customer_id'   => $order_obj->get_customer_id(),
                'customer_name' => $customer_name,
                'billing_email' => $order_obj->get_billing_email(),
                'billing_phone' => $order_obj->get_billing_phone(), // Añadir teléfono de facturación
                'products_summary' => $products_summary, // Nueva propiedad
            );
        }
    }

    // Para DataTables server-side, la respuesta debe ser un JSON específico
    // El controlador Node.js se encargará de añadir 'draw'.
    $response_payload = array(
        'data' => $sales_data,
        'recordsTotal' => (int) $recordsTotal_count,    
        'recordsFiltered' => (int) $recordsFiltered_count, 
    );
    error_log('[TVP-POS DEBUG] Response Payload: ' . print_r($response_payload, true));
    return new WP_REST_Response( $response_payload, 200 );
}

/**
 * Callback para obtener una venta específica.
 */
function tvp_pos_get_single_sale_api( WP_REST_Request $request ) {
    $token = $request->get_header( 'X-TVP-Token' );
    $user = tvp_pos_validate_token_and_get_user( $token );

    if ( ! $user ) {
        return new WP_Error( 'rest_invalid_token', __( 'Token inválido o expirado.', 'tvp-pos-wp-connector' ), array( 'status' => 401 ) );
    }
    // wp_set_current_user( $user->ID );

    if ( ! class_exists( 'WooCommerce' ) ) {
        return new WP_Error( 'woocommerce_not_active', __( 'WooCommerce no está activo.', 'tvp-pos-wp-connector' ), array( 'status' => 500 ) );
    }

    $order_id = $request['id'];
    $order = wc_get_order( $order_id );

    if ( ! $order ) {
        return new WP_Error( 'sale_not_found', __( 'Venta no encontrada.', 'tvp-pos-wp-connector' ), array( 'status' => 404 ) );
    }

    $customer_name = trim( $order->get_billing_first_name() . ' ' . $order->get_billing_last_name() );
    if ( empty( $customer_name ) && $order->get_customer_id() ) {
        $customer = new WC_Customer( $order->get_customer_id() );
        $customer_name = $customer->get_display_name() ? $customer->get_display_name() : 'Cliente ID: ' . $order->get_customer_id();
    }
     if ( empty( $customer_name ) ) {
        $customer_name = __('Guest', 'tvp-pos-wp-connector');
    }

    // Aquí podrías añadir más detalles, como los ítems del pedido, etc.
    $customer_note_from_order = $order->get_customer_note();

    if ( empty( $customer_note_from_order ) ) {
        // Si la nota del cliente está vacía, intentar obtener la última nota privada o nota de administrador.
        $order_notes = wc_get_order_notes( array(
            'order_id' => $order_id,
            'order_by' => 'date_created', // Obtener la más reciente primero
            'order'    => 'DESC',
        ) );

        if ( ! empty( $order_notes ) ) {
            foreach ( $order_notes as $note ) {
                // Queremos una nota que no sea del sistema y que sea privada o para el cliente (pero no la customer_note original si estaba vacía)
                // 'is_customer_note' = 1 es una nota para el cliente (que no es la customer_note principal)
                // 'added_by' != 'system' para excluir notas automáticas.
                if ( ! $note->added_by || strtolower($note->added_by) !== 'system' ) {
                     // Si es una nota privada (added_by es un usuario) o una nota explícitamente para el cliente
                    if ( $note->is_customer_note || ( $note->added_by && strtolower($note->added_by) !== 'woocommerce' ) ) {
                        $customer_note_from_order = $note->content;
                        break; // Usar la primera nota relevante encontrada (la más reciente)
                    }
                }
            }
        }
    }

    $sale_detail = array(
        'id'            => $order->get_id(),
        'order_key'     => $order->get_order_key(),
        'date_created'  => $order->get_date_created() ? $order->get_date_created()->date( 'Y-m-d H:i:s' ) : null,
        'status'        => $order->get_status(),
        'total'         => floatval( $order->get_total() ),
        'currency'      => $order->get_currency(),
        'customer_id'   => $order->get_customer_id(),
        'customer_name' => $customer_name, // Este es el display_name o 'Invitado'
        'billing_first_name' => $order->get_billing_first_name(),
        'billing_last_name' => $order->get_billing_last_name(),
        'billing_address' => $order->get_formatted_billing_address() ? $order->get_formatted_billing_address() : 'N/A',
        'shipping_address' => $order->get_formatted_shipping_address() ? $order->get_formatted_shipping_address() : 'N/A',
        'line_items'    => array_map(function($item){
            $product = $item->get_product();
            return array(
                'product_id' => $item->get_product_id(),
                'variation_id' => $item->get_variation_id(),
                'name' => $item->get_name(),
                'quantity' => $item->get_quantity(),
                'price_unit' => ($item->get_quantity() > 0) ? floatval($item->get_subtotal() / $item->get_quantity()) : 0, // Precio unitario antes de descuentos de ítem
                'subtotal' => floatval($item->get_subtotal()), // Subtotal de la línea (sin impuestos, antes de descuentos de pedido)
                'total' => floatval($item->get_total()) // Total de la línea (con impuestos, después de descuentos de ítem)
            );
        }, $order->get_items()),
        'payment_method_title' => $order->get_payment_method_title(),
        'customer_note' => $customer_note_from_order, // Usar la nota obtenida (original o del historial)
        'billing_email' => $order->get_billing_email(),
        'billing_phone' => $order->get_billing_phone(), // <-- AÑADIDO TELÉFONO DE FACTURACIÓN AQUÍ
        // ... más detalles
    );
    error_log('[TVP-POS DEBUG] sales-endpoints.php - tvp_pos_get_single_sale_api - Sale Detail: ' . print_r($sale_detail, true));
    return new WP_REST_Response( $sale_detail, 200 );
}

/**
 * Verifica los permisos para acceder a los endpoints de ventas.
 * Esta función ya no se usa directamente como permission_callback si la validación se hace en cada callback.
 * Podría reusarse o eliminarse si no se necesita un chequeo de capabilities adicional después de la validación del token.
 */
// function tvp_pos_sales_api_permission_check( WP_REST_Request $request ) {
//     // Ejemplo si quisieras verificar un capability específico DESPUÉS de validar el token
//     // (asumiendo que wp_set_current_user se llamó con el usuario del token)
//     // if ( ! current_user_can( 'view_woocommerce_reports' ) ) {
//     //     return new WP_Error( 'rest_forbidden_capability', __( 'No tienes permiso para ver esta información.', 'tvp-pos-wp-connector' ), array( 'status' => 403 ) );
//     // }
//     return true;
// }

/**
 * Callback para crear una nueva venta (pedido de WooCommerce).
 */
function tvp_pos_create_sale_api( WP_REST_Request $request ) {
    $token = $request->get_header( 'X-TVP-Token' );
    $user = tvp_pos_validate_token_and_get_user( $token );

    if ( ! $user ) {
        return new WP_Error( 'rest_invalid_token', __( 'Token inválido o expirado.', 'tvp-pos-wp-connector' ), array( 'status' => 401 ) );
    }

    if ( ! class_exists( 'WooCommerce' ) ) {
        return new WP_Error( 'woocommerce_not_active', __( 'WooCommerce no está activo.', 'tvp-pos-wp-connector' ), array( 'status' => 500 ) );
    }

    $params = $request->get_json_params();
    error_log("datos recividos: " . print_r($params, true));
    // Validaciones básicas de los datos recibidos
    if ( empty( $params['line_items'] ) || !is_array( $params['line_items'] ) ) {
        return new WP_Error( 'missing_line_items', __( 'No se proporcionaron productos para la venta.', 'tvp-pos-wp-connector' ), array( 'status' => 400 ) );
    }
    if ( empty( $params['customer_id'] ) && empty( $params['billing'] ) ) {
        return new WP_Error( 'missing_customer_info', __( 'Se requiere información del cliente o datos de facturación.', 'tvp-pos-wp-connector' ), array( 'status' => 400 ) );
    }
    if ( empty( $params['payment_method'] ) ) {
        return new WP_Error( 'missing_payment_method', __( 'Se requiere el método de pago.', 'tvp-pos-wp-connector' ), array( 'status' => 400 ) );
    }

    try {
        $order_data = array(
            'status'      => 'wc-completed', // Estado inicial, se puede cambiar después
            'customer_id' => isset( $params['customer_id'] ) ? intval( $params['customer_id'] ) : 0,
        );
        
        $order = wc_create_order( $order_data );

        if ( is_wp_error( $order ) ) {
            return new WP_Error( 'order_creation_failed', $order->get_error_message(), array( 'status' => 500 ) );
        }

        // Añadir productos (line items)
        foreach ( $params['line_items'] as $item ) {
            $product = wc_get_product( isset($item['variation_id']) && $item['variation_id'] ? $item['variation_id'] : $item['product_id'] );
            if ( ! $product ) {
                $order->add_order_note( sprintf( __( 'Producto no encontrado ID: %s. Se omitió.', 'tvp-pos-wp-connector' ), $item['product_id'] ) );
                continue;
            }
            // El precio se pasa en 'total' para el ítem, WC lo usará.
            // Si quieres forzar el precio unitario y que WC calcule, ajusta aquí.
            $item_args = array(
                'name'      => isset($item['name']) ? $item['name'] : $product->get_name(), // Usar nombre del TPV si se envía
                'total'     => floatval($item['price']) * intval($item['quantity']), // Precio total de la línea
                'subtotal'  => floatval($item['price']) * intval($item['quantity']), // Subtotal de la línea (sin impuestos)
                // 'price'  => floatval($item['price']), // Precio unitario
            );
            $order->add_product( $product, intval( $item['quantity'] ), $item_args );
        }

        // Direcciones (si se proporcionan)
        if ( ! empty( $params['billing'] ) ) {
            error_log('[TVP-POS DEBUG] create_sale_api - Datos de facturación recibidos para el pedido: ' . print_r($params['billing'], true));
            $order->set_address( $params['billing'], 'billing' );
        }
        if ( ! empty( $params['shipping'] ) ) {
            $order->set_address( $params['shipping'], 'shipping' );
        } elseif ( ! empty( $params['billing'] ) ) { // Usar billing como shipping si no se provee shipping
             $order->set_address( $params['billing'], 'shipping' );
        }


        // Método de pago
        $order->set_payment_method( sanitize_text_field( $params['payment_method'] ) );
        if ( ! empty( $params['payment_method_title'] ) ) {
            $order->set_payment_method_title( sanitize_text_field( $params['payment_method_title'] ) );
        }

        // Cupones
        if ( ! empty( $params['coupon_lines'] ) && is_array( $params['coupon_lines'] ) ) {
            foreach ( $params['coupon_lines'] as $coupon_line ) {
                if ( ! empty( $coupon_line['code'] ) ) {
                    $coupon_result = $order->apply_coupon( sanitize_text_field( $coupon_line['code'] ) );
                    if(is_wp_error($coupon_result)){
                        $order->add_order_note(sprintf(__('Error al aplicar cupón %s: %s', 'tvp-pos-wp-connector'), $coupon_line['code'], $coupon_result->get_error_message()));
                    }
                }
            }
        }
        
        // Nota del cliente
        if ( ! empty( $params['customer_note'] ) ) {
            $order->add_order_note( sanitize_textarea_field( $params['customer_note'] ), true ); // true para nota al cliente
        }

        // Metadatos adicionales
        if ( ! empty( $params['meta_data'] ) && is_array( $params['meta_data'] ) ) {
            foreach ( $params['meta_data'] as $meta_item ) {
                if ( isset( $meta_item['key'] ) && isset( $meta_item['value'] ) ) {
                    $order->update_meta_data( sanitize_text_field( $meta_item['key'] ), wc_clean( $meta_item['value'] ) );
                }
            }
        }
        
        $order->calculate_totals(); // Recalcular totales después de añadir productos y cupones
        
        // Estado del pedido (si se pagó)
        if ( isset( $params['set_paid'] ) && $params['set_paid'] === true ) {
            // Puedes usar 'processing' o 'completed' según tu flujo.
            // 'processing' es común para pagos confirmados que requieren envío.
            // 'completed' para pedidos digitales o si el pago y entrega son inmediatos.
            $order->update_status( 'processing', __( 'Pedido pagado a través de TPV.', 'tvp-pos-wp-connector' ) );
            // $order->payment_complete(); // Opcional, marca el pedido como pagado y puede disparar otras acciones
        }

        $order_id = $order->save();

        if ( $order_id ) {
            // Devolver algunos datos del pedido creado
            $created_order_data = array(
                'id' => $order_id,
                'status' => $order->get_status(),
                'total' => $order->get_total(),
                'order_key' => $order->get_order_key()
            );
            return new WP_REST_Response( array( 'success' => true, 'message' => __( 'Venta creada exitosamente.', 'tvp-pos-wp-connector' ), 'data' => $created_order_data ), 201 );
        } else {
            return new WP_Error( 'order_save_failed', __( 'No se pudo guardar la venta.', 'tvp-pos-wp-connector' ), array( 'status' => 500 ) );
        }

    } catch ( WC_Data_Exception $e ) {
        return new WP_Error( 'order_data_exception', $e->getMessage(), array( 'status' => 400 ) );
    } catch ( Exception $e ) {
        return new WP_Error( 'order_exception', $e->getMessage(), array( 'status' => 500 ) );
    }
}
?>
