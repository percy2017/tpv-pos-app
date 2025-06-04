<?php
/**
 * Funciones de Ayuda para Tokens para TVP-POS Connector
 */

if ( ! defined( 'WPINC' ) ) {
    die;
}

/**
 * Valida un token de sesión simple y devuelve el objeto WP_User si es válido.
 *
 * @param string $token El token de sesión a validar.
 * @return WP_User|false El objeto WP_User si el token es válido y no ha expirado, false en caso contrario.
 */
function tvp_pos_validate_token_and_get_user( $token ) {
    if ( empty( $token ) ) {
        return false;
    }

    // Buscar usuarios que tengan este token. Debería ser solo uno.
    $users = get_users( array(
        'meta_key'   => '_tvp_pos_session_token',
        'meta_value' => $token,
        'number'     => 1, // Solo necesitamos el primero si se encuentra (debería ser único)
        'fields'     => 'all', // Obtener el objeto WP_User completo
    ) );

    if ( empty( $users ) || ! is_array( $users ) ) {
        return false; // No se encontró ningún usuario con este token
    }

    $user = $users[0];
    $token_expires = get_user_meta( $user->ID, '_tvp_pos_session_token_expires', true );

    if ( empty( $token_expires ) || time() > (int) $token_expires ) {
        // Token expirado o no tiene fecha de expiración, limpiarlo para este usuario
        delete_user_meta( $user->ID, '_tvp_pos_session_token' );
        delete_user_meta( $user->ID, '_tvp_pos_session_token_expires' );
        return false; // Token expirado
    }

    // Token válido y no expirado
    return $user;
}

/**
 * Callback de permiso genérico para los endpoints de la API de TVP-POS.
 * Verifica la validez del token X-TVP-Token.
 *
 * @param WP_REST_Request $request La solicitud REST.
 * @return bool|WP_Error True si el token es válido, WP_Error en caso contrario.
 */
if ( ! function_exists( 'tvp_pos_api_permission_check' ) ) {
    function tvp_pos_api_permission_check( WP_REST_Request $request ) {
        $token = $request->get_header( 'X-TVP-Token' );
        if ( ! $token ) {
            return new WP_Error( 
                'rest_forbidden_no_token', 
                __( 'Token no proporcionado.', 'tvp-pos-wp-connector' ), 
                array( 'status' => 401 ) 
            );
        }

        $user = tvp_pos_validate_token_and_get_user( $token );
        if ( ! $user ) {
            return new WP_Error( 
                'rest_forbidden_invalid_token', 
                __( 'Token inválido o expirado.', 'tvp-pos-wp-connector' ), 
                array( 'status' => 403 )  // 403 Forbidden es más apropiado que 401 para token inválido
            );
        }

        // Opcional: Establecer el usuario actual para WordPress si se van a usar funciones como current_user_can()
        // wp_set_current_user( $user->ID );

        // Opcional: Verificar capabilities específicas del usuario si es necesario para este endpoint particular
        // Ejemplo:
        // if ( ! user_can( $user->ID, 'view_woocommerce_reports' ) ) {
        //     return new WP_Error( 
        //         'rest_forbidden_capability', 
        //         __( 'No tienes permiso para acceder a este recurso.', 'tvp-pos-wp-connector' ), 
        //         array( 'status' => 403 ) 
        //     );
        // }
        
        return true;
    }
}
?>
