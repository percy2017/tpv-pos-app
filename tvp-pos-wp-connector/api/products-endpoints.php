<?php
/**
 * Endpoints de Productos para TVP-POS Connector
 */

if ( ! defined( 'WPINC' ) ) {
    die;
}

add_action( 'rest_api_init', 'tvp_pos_register_products_api_routes' );

/**
 * Registra las rutas de la API REST para productos de WooCommerce.
 */
function tvp_pos_register_products_api_routes() {
    // Listar productos
    register_rest_route( 'tvp-pos-connector/v1', '/products', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'tvp_pos_get_products_api',
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
                'default'           => 10, // Ajustar según necesidad
                'sanitize_callback' => 'absint',
            ),
            'search'   => array(
                'description'       => 'Término de búsqueda para productos (nombre, SKU).',
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ),
            'category' => array(
                'description'       => 'Filtrar por ID o slug de categoría de producto.',
                'type'              => 'string', // Puede ser ID (integer) o slug (string)
            ),
            'featured' => array(
                'description'       => 'Filtrar por productos destacados (favoritos).',
                'type'              => 'boolean',
                'default'           => false,
                'sanitize_callback' => 'rest_sanitize_boolean',
            ),
            // 'type' => array('simple', 'variable') // Para filtrar por tipo de producto
            // 'stock_status' => 'instock' // Para filtrar por productos en stock
        ),
    ) );

    // Obtener un producto específico por ID
    register_rest_route( 'tvp-pos-connector/v1', '/products/(?P<id>\d+)', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'tvp_pos_get_single_product_api',
        'permission_callback' => '__return_true', // Validación de token dentro del callback
        'args'                => array(
            'id' => array(
                'description'       => 'ID único del producto.',
                'type'              => 'integer',
                'validate_callback' => function( $param, $request, $key ) {
                    return is_numeric( $param ) && $param > 0;
                },
                'required'          => true,
            ),
        ),
    ) );
}

/**
 * Callback para obtener una lista de productos de WooCommerce.
 */
function tvp_pos_get_products_api( WP_REST_Request $request ) {
    $token = $request->get_header( 'X-TVP-Token' );
    $user = tvp_pos_validate_token_and_get_user( $token );

    if ( ! $user ) {
        return new WP_Error( 'rest_invalid_token', __( 'Token inválido o expirado.', 'tvp-pos-wp-connector' ), array( 'status' => 401 ) );
    }
    // wp_set_current_user( $user->ID ); // Opcional

    if ( ! class_exists( 'WooCommerce' ) ) {
        return new WP_Error( 'woocommerce_not_active', __( 'WooCommerce no está activo.', 'tvp-pos-wp-connector' ), array( 'status' => 500 ) );
    }

    $params = $request->get_params();
    $args = array(
        'limit'    => $params['per_page'],
        'page'     => $params['page'],
        'paginate' => true,
        'status'   => 'publish', // Solo productos publicados
        // 'stock_status' => 'instock', // Opcional: solo en stock
    );

    if ( ! empty( $params['search'] ) ) {
        $args['s'] = $params['search']; // 's' es el parámetro de búsqueda de WP_Query/wc_get_products
    }
    if ( ! empty( $params['category'] ) ) {
        $args['category'] = array( $params['category'] ); // Puede ser un array de slugs o IDs
    }
    // Sanitize_callback 'rest_sanitize_boolean' convierte el input a true o false.
    // Así que podemos comprobar directamente si $params['featured'] es true.
    if ( isset( $params['featured'] ) && $params['featured'] === true ) {
        $args['featured'] = true;
    }
    // if ( ! empty( $params['type'] ) ) {
    //    $args['type'] = $params['type']; // 'simple', 'variable', etc.
    // }

    // Adaptación para usar WP_Query directamente, inspirado en el plugin de ejemplo.
    // El array $args ya contiene 'limit' (como posts_per_page), 'page' (como paged), 'status', 's' (search), 'featured'.
    // Necesitamos mapear 'limit' a 'posts_per_page' y 'page' a 'paged' para WP_Query.
    $wp_query_args = array(
        'post_type'      => 'product',
        'post_status'    => $args['status'], // ej. 'publish'
        'posts_per_page' => $args['limit'],  // Anteriormente 'limit'
        'paged'          => $args['page'],   // Anteriormente 'page'
        'ignore_sticky_posts' => 1,
        // 'orderby'        => 'title', // Opcional, podrías añadirlo si quieres un orden específico
        // 'order'          => 'ASC',
    );

    if ( isset( $args['s'] ) ) {
        $wp_query_args['s'] = $args['s'];
    }

    // Manejo de 'featured' con tax_query, como en el ejemplo,
    // pero solo si no hay término de búsqueda, para priorizar la búsqueda.
    // Nuestra lógica actual en el controlador ya envía featured=false si hay búsqueda.
    // Así que $args['featured'] solo será true si no hay búsqueda y se piden destacados.
    if ( isset( $args['featured'] ) && $args['featured'] === true && empty( $args['s'] ) ) {
        $wp_query_args['tax_query'] = array(
            array(
                'taxonomy' => 'product_visibility',
                'field'    => 'name',
                'terms'    => 'featured',
                'operator' => 'IN',
            ),
        );
    }
    
    // Si se pasó 'category' (ID o slug)
    if (isset($args['category']) && !empty($args['category'])) {
        $wp_query_args['tax_query'] = isset($wp_query_args['tax_query']) ? $wp_query_args['tax_query'] : array('relation' => 'AND');
        $wp_query_args['tax_query'][] = array(
            'taxonomy' => 'product_cat',
            'field'    => is_numeric($args['category'][0]) ? 'term_id' : 'slug',
            'terms'    => $args['category'][0],
        );
    }


    error_log('TVP-POS DEBUG: Args para WP_Query: ' . print_r($wp_query_args, true));
    $products_query = new WP_Query( $wp_query_args );
    
    $products_data = array();
    if ( $products_query->have_posts() ) {
        while ( $products_query->have_posts() ) {
            $products_query->the_post();
            $product_post_id = get_the_ID();
            $product_obj = wc_get_product( $product_post_id );

            // Evitar añadir variaciones individuales como productos principales en la lista
            if ( $product_obj && $product_obj->get_type() !== 'variation' ) {
                $products_data[] = tvp_pos_format_product_data( $product_obj );
            }
        }
        wp_reset_postdata(); // Importante después de un loop WP_Query con the_post()
    }

    $response = new WP_REST_Response( $products_data, 200 );
    $response->header( 'X-WP-Total', $products_query->found_posts );
    $response->header( 'X-WP-TotalPages', $products_query->max_num_pages );

    return $response;
}

/**
 * Callback para obtener un producto específico.
 */
function tvp_pos_get_single_product_api( WP_REST_Request $request ) {
    $token = $request->get_header( 'X-TVP-Token' );
    $user = tvp_pos_validate_token_and_get_user( $token );

    if ( ! $user ) {
        return new WP_Error( 'rest_invalid_token', __( 'Token inválido o expirado.', 'tvp-pos-wp-connector' ), array( 'status' => 401 ) );
    }
    // wp_set_current_user( $user->ID ); // Opcional

    if ( ! class_exists( 'WooCommerce' ) ) {
        return new WP_Error( 'woocommerce_not_active', __( 'WooCommerce no está activo.', 'tvp-pos-wp-connector' ), array( 'status' => 500 ) );
    }

    $product_id = $request['id'];
    $product = wc_get_product( $product_id );

    if ( ! $product || $product->get_status() === 'trash' ) {
        return new WP_Error( 'product_not_found', __( 'Producto no encontrado.', 'tvp-pos-wp-connector' ), array( 'status' => 404 ) );
    }

    return new WP_REST_Response( tvp_pos_format_product_data( $product ), 200 );
}

/**
 * Formatea los datos de un objeto WC_Product para la respuesta de la API.
 * @param WC_Product $product Objeto del producto de WooCommerce.
 * @return array Datos formateados del producto.
 */
function tvp_pos_format_product_data( WC_Product $product ) {
    $image_id = $product->get_image_id();
    $image_url = $image_id ? wp_get_attachment_image_url( $image_id, 'medium' ) : wc_placeholder_img_src(); // 'medium' o 'thumbnail' o 'full'

    $data = array(
        'id'                 => $product->get_id(),
        'name'               => $product->get_name(),
        'slug'               => $product->get_slug(),
        'type'               => $product->get_type(), // 'simple', 'variable', etc.
        'status'             => $product->get_status(),
        'sku'                => $product->get_sku(),
        'price'              => wc_format_decimal( $product->get_price(), 2 ),
        'regular_price'      => wc_format_decimal( $product->get_regular_price(), 2 ),
        'sale_price'         => $product->get_sale_price() ? wc_format_decimal( $product->get_sale_price(), 2 ) : null,
        'on_sale'            => $product->is_on_sale(),
        'description'        => $product->get_description(),
        'short_description'  => $product->get_short_description(),
        'stock_status'       => $product->get_stock_status(), // 'instock', 'outofstock', 'onbackorder'
        'stock_quantity'     => $product->managing_stock() ? $product->get_stock_quantity() : null,
        'manage_stock'       => $product->managing_stock(),
        'image_url'          => $image_url,
        'categories'         => wc_get_product_category_list( $product->get_id(), ', ', '', '' ), // Nombres de categorías como string
        // 'category_ids'       => $product->get_category_ids(),
        'variations_data'    => array(), // Para productos variables
    );

    if ( $product->is_type( 'variable' ) ) {
        $variable_product = new WC_Product_Variable( $product );
        $variations = $variable_product->get_available_variations(); // Esto puede ser pesado si hay muchas variaciones

        foreach ( $variations as $variation ) {
            $variation_obj = wc_get_product( $variation['variation_id'] );
            if ($variation_obj) {
                $data['variations_data'][] = array(
                    'id'             => $variation_obj->get_id(),
                    'sku'            => $variation_obj->get_sku(),
                    'price'          => wc_format_decimal( $variation_obj->get_price(), 2 ),
                    'regular_price'  => wc_format_decimal( $variation_obj->get_regular_price(), 2 ),
                    'sale_price'     => $variation_obj->get_sale_price() ? wc_format_decimal( $variation_obj->get_sale_price(), 2 ) : null,
                    'on_sale'        => $variation_obj->is_on_sale(),
                    'stock_status'   => $variation_obj->get_stock_status(),
                    'stock_quantity' => $variation_obj->managing_stock() ? $variation_obj->get_stock_quantity() : null,
                    'manage_stock'   => $variation_obj->managing_stock(),
                    'attributes'     => $variation_obj->get_variation_attributes(), // Array de atributos (ej: ['attribute_pa_color' => 'blue'])
                    'image_url'      => $variation_obj->get_image_id() ? wp_get_attachment_image_url( $variation_obj->get_image_id(), 'medium' ) : $image_url, // Imagen de variación o principal
                );
            }
        }
    }
    return $data;
}


/**
 * Verifica los permisos para acceder a los endpoints de productos.
 * Esta función ya no se usa directamente como permission_callback si la validación se hace en cada callback.
 */
// function tvp_pos_products_api_permission_check( WP_REST_Request $request ) {
//     // Por ahora, permitir acceso público para lectura de productos.
//     // Considera si necesitas proteger esto más en producción.
//     // if ( ! is_user_logged_in() ) { // O si el token es válido y el usuario tiene ciertos permisos
//     //     return new WP_Error( 'rest_forbidden_context', __( 'Debes estar logueado para ver los productos.', 'tvp-pos-wp-connector' ), array( 'status' => 401 ) );
//     // }
//     return true;
// }
?>
