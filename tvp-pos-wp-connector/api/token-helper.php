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
?>
