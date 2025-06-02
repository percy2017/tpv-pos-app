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

    if ( isset( $params['order'][0]['column'] ) && isset( $params['order'][0]['dir'] ) ) {
        $column_index = intval( $params['order'][0]['column'] );
        // Asumimos que el frontend (DataTables config en Node.js) enviará 'columns' array con 'data' names
        $column_name_from_dt = isset( $params['columns'][$column_index]['data'] ) ? $params['columns'][$column_index]['data'] : '';
        
        if ( $column_name_from_dt && isset( $orderby_map[$column_name_from_dt] ) ) {
            $orderby = $orderby_map[$column_name_from_dt];
        }
        $req_order_dir = strtolower( $params['order'][0]['dir'] );
        if ( in_array( $req_order_dir, array('asc', 'desc') ) ) {
            $order_dir = $req_order_dir;
        }
    }

    $args = array(
        'limit'    => $limit,
        'paged'    => $paged,
        'orderby'  => $orderby,
        'order'    => $order_dir,
        'paginate' => true, 
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
        // WC_Order_Query 's' busca en ID, email, nombre cliente, etc.
        // Si el search_term es numérico, también podría ser un ID de pedido.
        if (is_numeric($search_term)) {
             $args['post__in'] = array(intval($search_term)); // Busca por ID de pedido exacto
        } else {
            $args['s'] = $search_term; // Búsqueda general
        }
    }


    error_log('[TVP-POS DEBUG] sales-endpoints.php - tvp_pos_get_sales_api - Args para WC_Order_Query: ' . print_r($args, true));
    $query = new WC_Order_Query( $args );
    $results = $query->get_orders(); 

    $orders = $results->orders;
    $total_orders = $results->total;

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
                'billing_email' => $order_obj->get_billing_email(), // Podría ser útil para DataTables
                'products_summary' => $products_summary, // Nueva propiedad
            );
        }
    }

    // Para DataTables server-side, la respuesta debe ser un JSON específico
    // El controlador Node.js se encargará de añadir 'draw'.
    $response_payload = array(
        'data' => $sales_data,
        'recordsTotal' => $total_orders,    // Total de pedidos sin filtrar (WC_Order_Query lo da así)
        'recordsFiltered' => $total_orders, // Total de pedidos después de filtrar (WC_Order_Query lo da así con 's')
                                         // Para una implementación más precisa de recordsFiltered si la búsqueda es compleja,
                                         // se necesitaría una segunda consulta o lógica.
    );
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
    $sale_detail = array(
        'id'            => $order->get_id(),
        'order_key'     => $order->get_order_key(),
        'date_created'  => $order->get_date_created() ? $order->get_date_created()->date( 'Y-m-d H:i:s' ) : null,
        'status'        => $order->get_status(),
        'total'         => floatval( $order->get_total() ),
        'currency'      => $order->get_currency(),
        'customer_id'   => $order->get_customer_id(),
        'customer_name' => $customer_name,
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
        'customer_note' => $order->get_customer_note(),
        'billing_email' => $order->get_billing_email(), // Ya estaba en la lista de ventas, pero asegurar aquí también
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
