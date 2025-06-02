<?php
/**
 * Endpoints de Usuarios para TVP-POS Connector
 */

if ( ! defined( 'WPINC' ) ) {
    die;
}

add_action( 'rest_api_init', 'tvp_pos_register_users_api_routes' );

/**
 * Registra las rutas de la API REST para usuarios.
 */
function tvp_pos_register_users_api_routes() {
    register_rest_route( 'tvp-pos-connector/v1', '/users', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'tvp_pos_get_users_api',
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
            'role' => array(
                'description'       => 'Filtrar usuarios por rol.',
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ),
            'search' => array(
                'description'       => 'Término de búsqueda para usuarios (nombre, email, etc.).',
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ),
        ),
    ) );

    // Ruta para CREAR un nuevo usuario/cliente
    register_rest_route( 'tvp-pos-connector/v1', '/users', array(
        'methods'             => WP_REST_Server::CREATABLE, // POST
        'callback'            => 'tvp_pos_create_user_api',
        'permission_callback' => '__return_true', // Validación de token dentro del callback
        'args'                => array(
            'email' => array(
                'description'       => 'Correo electrónico del nuevo usuario.',
                'type'              => 'string',
                'format'            => 'email',
                'required'          => true,
                'sanitize_callback' => 'sanitize_email',
            ),
            'first_name' => array(
                'description'       => 'Nombre del usuario.',
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ),
            'last_name' => array(
                'description'       => 'Apellido del usuario.',
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ),
            'phone' => array( // billing_phone
                'description'       => 'Teléfono del usuario.',
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ),
            'role' => array(
                'description'       => 'Rol para el nuevo usuario (ej: customer).',
                'type'              => 'string',
                'default'           => 'customer',
                'sanitize_callback' => 'sanitize_text_field',
            ),
            // Nuevos campos de facturación
            'billing_address_1' => array(
                'description'       => 'Dirección de facturación principal.',
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ),
            'billing_city' => array(
                'description'       => 'Ciudad de facturación.',
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ),
            'billing_state' => array(
                'description'       => 'Estado/Provincia de facturación.',
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ),
            'billing_postcode' => array(
                'description'       => 'Código postal de facturación.',
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ),
            'billing_country' => array(
                'description'       => 'País de facturación.',
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ),
            // Se podría añadir 'username' y 'password' si se quieren especificar,
            // de lo contrario, se pueden generar automáticamente.
        ),
    ) );

    register_rest_route( 'tvp-pos-connector/v1', '/users/(?P<id>\d+)', array(
        // Definición para GET (leer un usuario)
        array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => 'tvp_pos_get_single_user_api',
            'permission_callback' => '__return_true',
            'args'                => array(
                'id' => array(
                    'description'       => 'ID único del usuario.',
                    'type'              => 'integer',
                    'validate_callback' => function( $param, $request, $key ) {
                        return is_numeric( $param ) && $param > 0;
                    },
                    'required'          => true,
                ),
            ),
        ),
        // Definición para PUT/PATCH (actualizar un usuario)
        array(
            'methods'             => WP_REST_Server::EDITABLE, // Acepta PUT, PATCH
            'callback'            => 'tvp_pos_update_user_api', // Nueva función callback
            'permission_callback' => '__return_true',
            'args'                => array(
                'id' => array( // El ID viene de la URL pero se define para validación
                    'description'       => 'ID único del usuario a actualizar.',
                    'type'              => 'integer',
                    'required'          => true,
                    'validate_callback' => function( $param ) { return is_numeric( $param ) && $param > 0; },
                ),
                'email' => array(
                    'type'              => 'string',
                    'format'            => 'email',
                    'sanitize_callback' => 'sanitize_email',
                ),
                'first_name' => array(
                    'type'              => 'string',
                    'sanitize_callback' => 'sanitize_text_field',
                ),
                'last_name' => array(
                    'type'              => 'string',
                    'sanitize_callback' => 'sanitize_text_field',
                ),
                'phone' => array( // billing_phone
                    'type'              => 'string',
                    'sanitize_callback' => 'sanitize_text_field',
                ),
                'role' => array(
                    'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
                ),
                // Nuevos campos de facturación para actualización
                'billing_address_1' => array(
                    'type'              => 'string',
                    'sanitize_callback' => 'sanitize_text_field',
                ),
                'billing_city' => array(
                    'type'              => 'string',
                    'sanitize_callback' => 'sanitize_text_field',
                ),
                'billing_state' => array(
                    'type'              => 'string',
                    'sanitize_callback' => 'sanitize_text_field',
                ),
                'billing_postcode' => array(
                    'type'              => 'string',
                    'sanitize_callback' => 'sanitize_text_field',
                ),
                'billing_country' => array(
                    'type'              => 'string',
                    'sanitize_callback' => 'sanitize_text_field',
                ),
                // Otros campos como password, display_name podrían añadirse aquí
            ),
        ),
        // Definición para DELETE (eliminar un usuario)
        array(
            'methods'             => WP_REST_Server::DELETABLE,
            'callback'            => 'tvp_pos_delete_user_api',
            'permission_callback' => '__return_true', // Validación de token en callback
            'args'                => array(
                'id' => array(
                    'description'       => 'ID único del usuario a eliminar.',
                    'type'              => 'integer',
                    'required'          => true,
                    'validate_callback' => function( $param ) { return is_numeric( $param ) && $param > 0; },
                ),
                'reassign' => array( // ID del usuario al que reasignar los posts
                    'description'       => 'ID del usuario al que reasignar los posts del usuario eliminado.',
                    'type'              => 'integer',
                    'sanitize_callback' => 'absint',
                    'default'           => 0, // Por defecto, no reasignar (los posts se eliminarían o quedarían huérfanos según WP)
                                             // O podrías poner el ID del admin por defecto si es más seguro.
                ),
                // Podríamos añadir un 'force' => true para no requerir reassign y simplemente eliminar posts.
            ),
        ),
    ) );
}

/**
 * Callback para obtener una lista de usuarios de WordPress.
 */
function tvp_pos_get_users_api( WP_REST_Request $request ) {
    $token = $request->get_header( 'X-TVP-Token' );
    $user = tvp_pos_validate_token_and_get_user( $token );

    if ( ! $user ) {
        return new WP_Error( 'rest_invalid_token', __( 'Token inválido o expirado.', 'tvp-pos-wp-connector' ), array( 'status' => 401 ) );
    }
    // wp_set_current_user( $user->ID ); // Opcional

    $params = $request->get_params();
    
    // Mapeo de columnas de DataTables a campos de WP_User_Query para ordenamiento
    $column_map = array(
        'id' => 'ID',
        'display_name' => 'display_name',
        'username' => 'login', // 'username' en frontend es 'user_login' o 'login' en WP
        'email' => 'email',
        // 'phone' y 'roles' no son directamente ordenables por WP_User_Query estándar.
        // 'total_orders', 'total_revenue', 'avg_order_value' requerirían ordenar por metadatos, más complejo.
    );

    $orderby = 'display_name'; // Default
    $order = 'ASC'; // Default

    if ( isset( $params['order'][0]['column'] ) && isset( $params['order'][0]['dir'] ) ) {
        $column_index = intval( $params['order'][0]['column'] );
        $column_name_from_dt = isset( $params['columns'][$column_index]['data'] ) ? $params['columns'][$column_index]['data'] : '';
        
        if ( $column_name_from_dt && isset( $column_map[$column_name_from_dt] ) ) {
            $orderby = $column_map[$column_name_from_dt];
        }
        $order_dir = strtolower( $params['order'][0]['dir'] );
        if ( in_array( $order_dir, array('asc', 'desc') ) ) {
            $order = $order_dir;
        }
    }
    
    $args = array(
        'number'   => isset($params['per_page']) ? intval($params['per_page']) : 10, // per_page para API, number para WP_User_Query
        'paged'    => isset($params['page']) ? intval($params['page']) : 1,       // page para API, paged para WP_User_Query
        'orderby'  => $orderby,
        'order'    => $order,
        'fields'   => 'all', // Necesitamos el objeto WP_User completo para get_meta
    );

    if ( ! empty( $params['role'] ) ) {
        $args['role'] = $params['role'];
    }

    // --- INICIO: LÓGICA CONDICIONAL DE BÚSQUEDA (Adaptada de tu ejemplo) ---
    // El search term para DataTables server-side viene en $params['search']['value']
    $search_term = '';
    if ( ! empty( $params['search'] ) && is_array( $params['search'] ) && ! empty( $params['search']['value'] ) ) {
        $search_term = $params['search']['value'];
    } elseif ( ! empty( $params['search'] ) && is_string( $params['search'] ) ) { // Fallback si 'search' es solo un string (como en nuestra API original)
        $search_term = $params['search'];
    }


    if ( ! empty( $search_term ) ) {

        // Comprobar si el término de búsqueda parece un número de teléfono
        if ( preg_match('/^[\d\s\+\(\)-]+$/', $search_term) ) {
            error_log('[TVP-POS DEBUG] Search term looks like a phone number. Querying meta only for billing_phone: ' . $search_term);
            $args['meta_query'] = array(
                array(
                    'key'     => 'billing_phone',
                    'value'   => $search_term,
                    'compare' => 'LIKE'
                ),
            );
        } else {
            error_log('[TVP-POS DEBUG] Search term is general. Querying standard fields and meta: ' . $search_term);
            $args['search'] = '*' . esc_attr( $search_term ) . '*';
            $args['search_columns'] = array(
                'user_login',
                'user_nicename',
                'user_email',
                'display_name',
                // Añadimos first_name y last_name a los campos de búsqueda principales si es posible,
                // o confiamos en que el search *term* buscará en ellos si están en display_name.
                // WP_User_Query busca en 'user_login', 'user_email', 'user_url', 'user_nicename', 'display_name'.
                // Para buscar en first_name y last_name directamente con el parámetro 'search',
                // se necesitaría un filtro en 'pre_user_query' para modificar el SQL.
                // Por ahora, simplificamos y eliminamos la meta_query conflictiva para la búsqueda general.
            );
            // $args['meta_query'] = array( // Eliminamos esta meta_query para la búsqueda general para evitar el AND restrictivo.
            //     'relation' => 'OR',
            //     array(
            //         'key'     => 'first_name',
            //         'value'   => $search_term,
            //         'compare' => 'LIKE'
            //     ),
            //     array(
            //         'key'     => 'last_name',
            //         'value'   => $search_term,
            //         'compare' => 'LIKE'
            //     ),
            //     array(
            //         'key'     => 'billing_phone', 
            //         'value'   => $search_term,
            //         'compare' => 'LIKE'
            //     ),
            // );
        }
    }
    // --- FIN: LÓGICA CONDICIONAL DE BÚSQUEDA ---
    
    error_log('[TVP-POS DEBUG] Args para WP_User_Query (modificada para búsqueda general más simple): ' . print_r($args, true));
    $users_query = new WP_User_Query( $args );
    $users = $users_query->get_results();
    $total_users = $users_query->get_total();

    $users_data = array();
    if ( ! empty( $users ) ) {
        foreach ( $users as $user_obj ) {
            // WP_User_Query con 'fields' ya devuelve un objeto con esos campos.
            // Si 'fields' es 'all', $user_obj es un objeto WP_User completo.
            // Para asegurar que tenemos todos los datos necesarios, obtenemos el objeto WP_User completo
            $full_user_obj = get_userdata($user_obj->ID); 
            if ($full_user_obj) {
                $users_data[] = array(
                    'id'           => $full_user_obj->ID,
                    'username'     => $full_user_obj->user_login,
                    'email'        => $full_user_obj->user_email,
                    'display_name' => $full_user_obj->display_name,
                    'first_name'   => $full_user_obj->first_name,
                    'last_name'    => $full_user_obj->last_name,
                    'roles'        => $full_user_obj->roles,
                    'phone'        => get_user_meta( $full_user_obj->ID, 'billing_phone', true ), // Mantenemos 'phone' para consistencia con lo que espera el frontend
                    'billing_phone'=> get_user_meta( $full_user_obj->ID, 'billing_phone', true ),
                    'billing_address_1' => get_user_meta( $full_user_obj->ID, 'billing_address_1', true ),
                    'billing_city'      => get_user_meta( $full_user_obj->ID, 'billing_city', true ),
                    'billing_state'     => get_user_meta( $full_user_obj->ID, 'billing_state', true ),
                    'billing_postcode'  => get_user_meta( $full_user_obj->ID, 'billing_postcode', true ),
                    'billing_country'   => get_user_meta( $full_user_obj->ID, 'billing_country', true ),
                    'avatar_url'   => get_avatar_url( $full_user_obj->ID ),
                    'total_orders' => wc_get_customer_order_count($full_user_obj->ID),
                    'total_revenue' => floatval(wc_get_customer_total_spent($full_user_obj->ID)),
                    'avg_order_value' => (wc_get_customer_order_count($full_user_obj->ID) > 0) ? floatval(wc_get_customer_total_spent($full_user_obj->ID) / wc_get_customer_order_count($full_user_obj->ID)) : 0,
                );
            }
        }
    }
    
    // Para DataTables server-side, la respuesta debe ser un JSON específico
    // $response = new WP_REST_Response( $users_data, 200 );
    // $response->header( 'X-WP-Total', $total_users );
    // $per_page_for_calc = ($args['number'] > 0) ? $args['number'] : 1; // Evitar división por cero si number es -1
    // $response->header( 'X-WP-TotalPages', ($args['number'] > 0) ? ceil( $total_users / $per_page_for_calc ) : 1 );
    // return $response;
    // La transformación para DataTables se hará en el controlador de Node.js
    // El plugin solo devuelve los datos y los totales.
    
    // Devolver datos y totales para que Node.js los procese para DataTables
    $response_payload = array(
        'data' => $users_data,
        'recordsTotal' => $total_users, // Total de registros sin filtrar
        'recordsFiltered' => $total_users, // Total de registros después de filtrar (WP_User_Query no da esto por separado fácilmente con 'search')
                                         // Para una implementación más precisa de recordsFiltered, se necesitaría una segunda consulta o lógica más compleja.
                                         // Por ahora, usamos el total general.
        // 'draw' se añadirá en el controlador de Node.js
    );
    return new WP_REST_Response( $response_payload, 200 );
}

/**
 * Callback para obtener un usuario específico.
 */
function tvp_pos_get_single_user_api( WP_REST_Request $request ) {
    $token = $request->get_header( 'X-TVP-Token' );
    $user_validation = tvp_pos_validate_token_and_get_user( $token ); // Renombrar para no colisionar con $user de get_userdata

    if ( ! $user_validation ) {
        return new WP_Error( 'rest_invalid_token', __( 'Token inválido o expirado.', 'tvp-pos-wp-connector' ), array( 'status' => 401 ) );
    }
    // wp_set_current_user( $user_validation->ID ); // Opcional

    $user_id = $request['id'];
    $user = get_userdata( $user_id );

    if ( ! $user ) {
        return new WP_Error( 'user_not_found', __( 'Usuario no encontrado.', 'tvp-pos-wp-connector' ), array( 'status' => 404 ) );
    }

    // Devolver toda la información relevante del cliente, incluyendo facturación y avatar
    $user_data = array(
        'id'           => $user->ID,
        'username'     => $user->user_login,
        'email'        => $user->user_email,
        'display_name' => $user->display_name,
        'first_name'   => $user->first_name,
        'last_name'    => $user->last_name,
        'roles'        => $user->roles,
        'phone'        => get_user_meta( $user->ID, 'billing_phone', true ),
        'billing_phone'=> get_user_meta( $user->ID, 'billing_phone', true ),
        'billing_address_1' => get_user_meta( $user->ID, 'billing_address_1', true ),
        'billing_city'      => get_user_meta( $user->ID, 'billing_city', true ),
        'billing_state'     => get_user_meta( $user->ID, 'billing_state', true ),
        'billing_postcode'  => get_user_meta( $user->ID, 'billing_postcode', true ),
        'billing_country'   => get_user_meta( $user->ID, 'billing_country', true ),
        'avatar_url'   => get_avatar_url( $user->ID ),
        // No devolver 'user_pass', 'user_activation_key', etc.
    );
    error_log('[TVP-POS DEBUG] tvp_pos_get_single_user_api - Datos del usuario a devolver: ' . print_r($user_data, true));
    return new WP_REST_Response( $user_data, 200 );
}

/**
 * Callback para crear un nuevo usuario/cliente.
 */
function tvp_pos_create_user_api( WP_REST_Request $request ) {
    $token = $request->get_header( 'X-TVP-Token' );
    $user_validation = tvp_pos_validate_token_and_get_user( $token );

    if ( ! $user_validation ) {
        return new WP_Error( 'rest_invalid_token', __( 'Token inválido o expirado.', 'tvp-pos-wp-connector' ), array( 'status' => 401 ) );
    }
    // Considerar verificar permisos para crear usuarios, ej: if ( ! current_user_can( 'create_users' ) ) { ... }

    $params = $request->get_params();

    $email = $params['email'];
    $first_name = $params['first_name'] ?? '';
    $last_name = $params['last_name'] ?? '';
    $phone = $params['phone'] ?? ''; // Este es el que viene del frontend como 'phone'
    $role = $params['role'] ?? 'customer'; // Default a 'customer'

    // Campos de facturación
    $billing_address_1 = $params['billing_address_1'] ?? '';
    $billing_city = $params['billing_city'] ?? '';
    $billing_state = $params['billing_state'] ?? '';
    $billing_postcode = $params['billing_postcode'] ?? '';
    $billing_country = $params['billing_country'] ?? '';


    if ( email_exists( $email ) ) {
        return new WP_Error( 'rest_user_email_exists', __( 'Este correo electrónico ya está registrado.', 'tvp-pos-wp-connector' ), array( 'status' => 400 ) );
    }

    // Generar un nombre de usuario si no se proporciona. Usar email como base.
    $username = sanitize_user( explode( '@', $email )[0], true );
    $username_base = $username;
    $i = 1;
    while ( username_exists( $username ) ) {
        $username = $username_base . $i;
        $i++;
    }
    
    $password = wp_generate_password( 12, true, true );
    $user_id = wc_create_new_customer( $email, $username, $password ); // wc_create_new_customer asigna rol 'customer'

    if ( is_wp_error( $user_id ) ) {
        error_log('TVP-POS DEBUG: Error wc_create_new_customer: ' . $user_id->get_error_message());
        return new WP_Error( 'rest_user_creation_failed', $user_id->get_error_message(), array( 'status' => 500 ) );
    }

    // Actualizar datos adicionales que wc_create_new_customer no maneja directamente o para asegurar
    $update_args = array( 'ID' => $user_id );
    if ( !empty($first_name) ) $update_args['first_name'] = $first_name;
    if ( !empty($last_name) ) $update_args['last_name'] = $last_name;
    if ( $role !== 'customer' ) { // Si se especificó un rol diferente a 'customer'
        $update_args['role'] = $role;
    }
    wp_update_user( $update_args );

    if ( !empty($phone) ) {
        update_user_meta( $user_id, 'billing_phone', $phone );
    }
    // Guardar metadatos de facturación
    if ( !empty($billing_address_1) ) update_user_meta( $user_id, 'billing_address_1', $billing_address_1 );
    if ( !empty($billing_city) ) update_user_meta( $user_id, 'billing_city', $billing_city );
    if ( !empty($billing_state) ) update_user_meta( $user_id, 'billing_state', $billing_state );
    if ( !empty($billing_postcode) ) update_user_meta( $user_id, 'billing_postcode', $billing_postcode );
    if ( !empty($billing_country) ) update_user_meta( $user_id, 'billing_country', $billing_country );
    

    // Obtener los datos del usuario recién creado para devolverlos
    $new_user_data = get_userdata( $user_id );
    $response_data = array(
        'id'           => $new_user_data->ID,
        'username'     => $new_user_data->user_login,
        'email'        => $new_user_data->user_email,
        'display_name' => $new_user_data->display_name,
        'first_name'   => $new_user_data->first_name,
        'last_name'    => $new_user_data->last_name,
        'roles'        => $new_user_data->roles,
        'phone'        => get_user_meta( $new_user_data->ID, 'billing_phone', true ), // Para consistencia con el frontend
        'billing_phone'=> get_user_meta( $new_user_data->ID, 'billing_phone', true ),
        'billing_address_1' => get_user_meta( $new_user_data->ID, 'billing_address_1', true ),
        'billing_city'      => get_user_meta( $new_user_data->ID, 'billing_city', true ),
        'billing_state'     => get_user_meta( $new_user_data->ID, 'billing_state', true ),
        'billing_postcode'  => get_user_meta( $new_user_data->ID, 'billing_postcode', true ),
        'billing_country'   => get_user_meta( $new_user_data->ID, 'billing_country', true ),
        'avatar_url'   => get_avatar_url( $new_user_data->ID ),
    );

    return new WP_REST_Response( $response_data, 201 ); // 201 Created
}

/**
 * Callback para actualizar un usuario/cliente existente.
 */
function tvp_pos_update_user_api( WP_REST_Request $request ) {
    $token = $request->get_header( 'X-TVP-Token' );
    $user_validation = tvp_pos_validate_token_and_get_user( $token );

    if ( ! $user_validation ) {
        return new WP_Error( 'rest_invalid_token', __( 'Token inválido o expirado.', 'tvp-pos-wp-connector' ), array( 'status' => 401 ) );
    }
    // Considerar permisos para editar usuarios, ej: if ( ! current_user_can( 'edit_user', $request['id'] ) ) { ... }

    $user_id = $request['id']; // El ID viene de la URL y ya está validado por 'args'
    $user = get_userdata( $user_id );

    if ( ! $user ) {
        return new WP_Error( 'rest_user_not_found', __( 'Usuario no encontrado para actualizar.', 'tvp-pos-wp-connector' ), array( 'status' => 404 ) );
    }

    $params = $request->get_params();
    $update_data = array( 'ID' => $user_id );

    // Campos que se pueden actualizar
    if ( isset( $params['email'] ) ) {
        $email = $params['email'];
        // Validar unicidad si el email cambió y no es el del usuario actual
        if ( strtolower( $email ) !== strtolower( $user->user_email ) && email_exists( $email ) ) {
            return new WP_Error( 'rest_user_email_exists', __( 'Este correo electrónico ya está registrado por otro usuario.', 'tvp-pos-wp-connector' ), array( 'status' => 400 ) );
        }
        $update_data['user_email'] = $email;
    }
    if ( isset( $params['first_name'] ) ) $update_data['first_name'] = $params['first_name'];
    if ( isset( $params['last_name'] ) ) $update_data['last_name'] = $params['last_name'];
    if ( isset( $params['role'] ) ) $update_data['role'] = $params['role'];
    // Podríamos añadir 'display_name', 'user_pass' (con cuidado) aquí.

    if ( count( $update_data ) > 1 ) { // Solo actualizar si hay algo más que el ID
        $result = wp_update_user( $update_data );
        if ( is_wp_error( $result ) ) {
            error_log('TVP-POS DEBUG: Error wp_update_user: ' . $result->get_error_message());
            return new WP_Error( 'rest_user_update_failed', $result->get_error_message(), array( 'status' => 500 ) );
        }
    }

    // Actualizar metadatos como el teléfono y los de facturación
    if ( isset( $params['phone'] ) ) update_user_meta( $user_id, 'billing_phone', $params['phone'] );
    if ( isset( $params['billing_address_1'] ) ) update_user_meta( $user_id, 'billing_address_1', $params['billing_address_1'] );
    if ( isset( $params['billing_city'] ) ) update_user_meta( $user_id, 'billing_city', $params['billing_city'] );
    if ( isset( $params['billing_state'] ) ) update_user_meta( $user_id, 'billing_state', $params['billing_state'] );
    if ( isset( $params['billing_postcode'] ) ) update_user_meta( $user_id, 'billing_postcode', $params['billing_postcode'] );
    if ( isset( $params['billing_country'] ) ) update_user_meta( $user_id, 'billing_country', $params['billing_country'] );


    // Obtener y devolver los datos actualizados del usuario
    $updated_user_data = get_userdata( $user_id );
    $response_data = array(
        'id'           => $updated_user_data->ID,
        'username'     => $updated_user_data->user_login,
        'email'        => $updated_user_data->user_email,
        'display_name' => $updated_user_data->display_name,
        'first_name'   => $updated_user_data->first_name,
        'last_name'    => $updated_user_data->last_name,
        'roles'        => $updated_user_data->roles,
        'phone'        => get_user_meta( $updated_user_data->ID, 'billing_phone', true ),
        'billing_phone'=> get_user_meta( $updated_user_data->ID, 'billing_phone', true ),
        'billing_address_1' => get_user_meta( $updated_user_data->ID, 'billing_address_1', true ),
        'billing_city'      => get_user_meta( $updated_user_data->ID, 'billing_city', true ),
        'billing_state'     => get_user_meta( $updated_user_data->ID, 'billing_state', true ),
        'billing_postcode'  => get_user_meta( $updated_user_data->ID, 'billing_postcode', true ),
        'billing_country'   => get_user_meta( $updated_user_data->ID, 'billing_country', true ),
        'avatar_url'   => get_avatar_url( $updated_user_data->ID ),
    );

    return new WP_REST_Response( $response_data, 200 ); // 200 OK
}

/**
 * Callback para eliminar un usuario/cliente.
 */
function tvp_pos_delete_user_api( WP_REST_Request $request ) {
    $token = $request->get_header( 'X-TVP-Token' );
    $user_validation = tvp_pos_validate_token_and_get_user( $token );

    if ( ! $user_validation ) {
        return new WP_Error( 'rest_invalid_token', __( 'Token inválido o expirado.', 'tvp-pos-wp-connector' ), array( 'status' => 401 ) );
    }
    // TODO: Verificar permisos más granulares, ej: if ( ! current_user_can( 'delete_users' ) ) { ... }
    // O si el usuario que hace la petición solo puede eliminarse a sí mismo (menos probable para un TPV admin).

    $user_id_to_delete = $request['id'];
    $reassign_user_id = $request->get_param('reassign'); // Obtener el parámetro 'reassign'

    if ( ! get_userdata( $user_id_to_delete ) ) {
        return new WP_Error( 'rest_user_not_found', __( 'Usuario no encontrado para eliminar.', 'tvp-pos-wp-connector' ), array( 'status' => 404 ) );
    }

    // No permitir eliminar al usuario que está haciendo la petición (si es el mismo)
    // O al usuario admin principal (ID 1) como medida de seguridad, a menos que se fuerce.
    if ( $user_id_to_delete == $user_validation->ID ) {
         return new WP_Error( 'rest_cannot_delete_self', __( 'No puedes eliminar tu propia cuenta a través de la API.', 'tvp-pos-wp-connector' ), array( 'status' => 403 ) );
    }
    // if ( $user_id_to_delete == 1 ) { // Opcional: Proteger al admin ID 1
    //     return new WP_Error( 'rest_cannot_delete_admin', __( 'No se puede eliminar el administrador principal.', 'tvp-pos-wp-connector' ), array( 'status' => 403 ) );
    // }

    if ( ! function_exists( 'wp_delete_user' ) ) {
        require_once ABSPATH . 'wp-admin/includes/user.php';
    }

    // Si reassign_user_id es 0 o no válido, wp_delete_user eliminará los posts del usuario.
    // Si es un ID válido, los posts se reasignarán a ese usuario.
    // Es importante decidir la estrategia de reasignación.
    // Si no se pasa 'reassign' o es 0, los posts se eliminan.
    // Si se pasa un ID válido, se reasignan.
    $result = wp_delete_user( $user_id_to_delete, $reassign_user_id > 0 ? $reassign_user_id : null );

    if ( $result ) {
        return new WP_REST_Response( array( 'success' => true, 'message' => __( 'Usuario eliminado correctamente.', 'tvp-pos-wp-connector' ) ), 200 );
    } else {
        return new WP_Error( 'rest_user_delete_failed', __( 'No se pudo eliminar el usuario.', 'tvp-pos-wp-connector' ), array( 'status' => 500 ) );
    }
}


/**
 * Verifica los permisos para acceder a los endpoints de usuarios.
 * Esta función ya no se usa directamente como permission_callback si la validación se hace en cada callback.
 */
// function tvp_pos_users_api_permission_check( WP_REST_Request $request ) {
//     // Por ahora, solo usuarios logueados. En producción, considera roles más específicos.
//     // ej. current_user_can('list_users') o current_user_can('edit_users')
//      if ( ! is_user_logged_in() ) {
//          return new WP_Error( 'rest_forbidden_context', __( 'Debes estar logueado para ver los usuarios.', 'tvp-pos-wp-connector' ), array( 'status' => 401 ) );
//     }
//     // if ( ! current_user_can( 'list_users' ) ) { // Ejemplo de capability
//     //     return new WP_Error( 'rest_forbidden_capability', __( 'No tienes permiso para ver esta información.', 'tvp-pos-wp-connector' ), array( 'status' => 403 ) );
//     // }
//     return true;
// }
?>
