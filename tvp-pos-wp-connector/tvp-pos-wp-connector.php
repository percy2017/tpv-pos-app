<?php
/**
 * Plugin Name:       TVP-POS WordPress Connector
 * Plugin URI:        https://example.com/tvp-pos-wp-connector
 * Description:       Provides API endpoints and integration for the TVP-POS Express application with WooCommerce.
 * Version:           1.0.0
 * Author:            Percy Alvarez
 * Author URI:        https://example.com/
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       tvp-pos-wp-connector
 * Domain Path:       /languages
 */

// If this file is called directly, abort.
if ( ! defined( 'WPINC' ) ) {
    die;
}

// Definir una constante para la ruta del plugin para facilitar la inclusión de archivos
if ( ! defined( 'TVP_POS_CONNECTOR_PATH' ) ) {
    define( 'TVP_POS_CONNECTOR_PATH', plugin_dir_path( __FILE__ ) );
}
if ( ! defined( 'TVP_POS_CONNECTOR_URL' ) ) {
    define( 'TVP_POS_CONNECTOR_URL', plugin_dir_url( __FILE__ ) );
}


/**
 * Cargar los archivos de los endpoints de la API y helpers.
 */
require_once TVP_POS_CONNECTOR_PATH . 'api/token-helper.php'; // Funciones de ayuda para tokens
require_once TVP_POS_CONNECTOR_PATH . 'api/auth-endpoints.php';
require_once TVP_POS_CONNECTOR_PATH . 'api/sales-endpoints.php';
require_once TVP_POS_CONNECTOR_PATH . 'api/users-endpoints.php';
require_once TVP_POS_CONNECTOR_PATH . 'api/products-endpoints.php';
require_once TVP_POS_CONNECTOR_PATH . 'api/gateways-endpoints.php'; // Pasarelas de pago
require_once TVP_POS_CONNECTOR_PATH . 'api/coupon-endpoints.php'; // Para los endpoints de cupones
require_once TVP_POS_CONNECTOR_PATH . 'api/calendar-events-endpoints.php'; // Para los eventos del calendario
require_once TVP_POS_CONNECTOR_PATH . 'api/dashboard-endpoints.php'; // Para los endpoints del dashboard
// Podrías añadir más aquí, como:
// require_once TVP_POS_CONNECTOR_PATH . 'api/customers-endpoints.php';

/**
 * Configura las cabeceras CORS para la API REST.
 */
add_action( 'rest_api_init', 'tvp_pos_api_cors_setup' );
function tvp_pos_api_cors_setup() {
    // IMPORTANTE: Para producción, restringe el origen a la URL de tu app Express.
    // Ejemplo: header("Access-Control-Allow-Origin: http://localhost:3000");
    // O si tu app Express tiene un dominio específico:
    // header("Access-Control-Allow-Origin: https://tu-app-express.com");

    // Para desarrollo, '*' es más permisivo pero menos seguro.
    // Si tu app Express corre en un puerto diferente a WordPress, necesitarás esto.
    $allowed_origin = defined('TVP_POS_ALLOWED_ORIGIN') ? TVP_POS_ALLOWED_ORIGIN : '*'; // Puedes definir TVP_POS_ALLOWED_ORIGIN en wp-config.php

    header( "Access-Control-Allow-Origin: {$allowed_origin}" );
    header( "Access-Control-Allow-Methods: POST, GET, OPTIONS, PUT, DELETE" );
    // Asegúrate de incluir todos los headers personalizados que tu cliente pueda enviar.
    header( "Access-Control-Allow-Headers: Content-Type, X-Requested-With, Authorization, X-TVP-Token" ); 
    header( "Access-Control-Allow-Credentials: true" ); // Necesario si envías cookies o tokens de autorización que dependen de sesión

    // Manejar peticiones OPTIONS (preflight)
    if ( 'OPTIONS' === $_SERVER['REQUEST_METHOD'] ) {
        status_header( 200 ); // OK
        exit();
    }
}


/**
 * Aquí puedes añadir hooks de activación/desactivación del plugin,
 * o cualquier otra lógica principal del plugin que no sea específica de un endpoint.
 * 
 * Ejemplo:
 * function tvp_pos_connector_activate() {
 *     // Acciones al activar el plugin (ej: crear roles, opciones por defecto)
 * }
 * register_activation_hook( __FILE__, 'tvp_pos_connector_activate' );
 *
 * function tvp_pos_connector_deactivate() {
 *     // Acciones al desactivar el plugin
 * }
 * register_deactivation_hook( __FILE__, 'tvp_pos_connector_deactivate' );
 */

// ¡No olvides activar este plugin en tu panel de administración de WordPress!
// Y asegúrate de que los endpoints que definas en los archivos incluidos
// tengan nombres de funciones únicos para evitar colisiones.

// --- METABOX Y COLUMNA PERSONALIZADA PARA DETALLES DE VENTA TPV ---

/**
 * Añade el metabox a la pantalla de edición de pedidos de WooCommerce.
 */
function tvp_pos_add_order_details_metabox_action() {
    // Para la nueva interfaz de pedidos HPOS (WooCommerce High-Performance Order Storage)
    add_meta_box(
        'tvp_pos_order_details',
        __('Detalles de Venta TPV', 'tvp-pos-wp-connector'),
        'tvp_pos_render_order_details_metabox_callback',
        'woocommerce_page_wc-orders', // Pantalla (HPOS)
        'side',
        'default'
    );
    // Para la interfaz de pedidos tradicional (CPT shop_order)
    add_meta_box(
        'tvp_pos_order_details_legacy',
        __('Detalles de Venta TPV', 'tvp-pos-wp-connector'),
        'tvp_pos_render_order_details_metabox_callback',
        'shop_order', // Pantalla (Legacy CPT)
        'side',
        'default'
    );
}
add_action( 'add_meta_boxes_woocommerce_page_wc-orders', 'tvp_pos_add_order_details_metabox_action' );
add_action( 'add_meta_boxes_shop_order', 'tvp_pos_add_order_details_metabox_action' );

/**
 * Renderiza el contenido del metabox de detalles del TPV.
 */
function tvp_pos_render_order_details_metabox_callback( $post_or_order_object ) {
    $order = null;
    if ( $post_or_order_object instanceof WP_Post ) {
        $order = wc_get_order( $post_or_order_object->ID );
    } elseif ( $post_or_order_object instanceof WC_Order ) {
         $order = $post_or_order_object;
    } elseif ( is_numeric( $post_or_order_object ) && function_exists('wc_get_order') ) {
        $order = wc_get_order( $post_or_order_object );
    }

    if ( ! $order ) {
        echo '<p>' . __('No se pudo cargar la información del pedido.', 'tvp-pos-wp-connector') . '</p>';
        return;
    }

    $is_pos_sale = $order->get_meta('_tvp_pos_sale');

    if ( $is_pos_sale !== 'yes' ) {
        echo '<p>' . __('Este pedido no fue realizado a través del TPV.', 'tvp-pos-wp-connector') . '</p>';
        return;
    }

    $pos_user_name = $order->get_meta('_tvp_pos_user_name');
    $pos_user_id = $order->get_meta('_tvp_pos_user_id');
    $sale_type = $order->get_meta('_sale_type');
    $sub_title = $order->get_meta('_subscription_title');
    $sub_expiry = $order->get_meta('_subscription_expiry');

    echo '<ul>';
    if ( $pos_user_name ) {
        echo '<li><strong>' . __('Vendedor TPV:', 'tvp-pos-wp-connector') . '</strong> ' . esc_html( $pos_user_name ) . ' (ID: ' . esc_html($pos_user_id) . ')</li>';
    }
    if ( $sale_type ) {
        echo '<li><strong>' . __('Tipo de Venta TPV:', 'tvp-pos-wp-connector') . '</strong> ' . esc_html( ucfirst( $sale_type ) ) . '</li>';
    }
    if ( $sale_type === 'suscripcion' ) {
        if ( $sub_title ) echo '<li><strong>' . __('Título Suscripción:', 'tvp-pos-wp-connector') . '</strong> ' . esc_html( $sub_title ) . '</li>';
        if ( $sub_expiry ) echo '<li><strong>' . __('Vencimiento Suscripción:', 'tvp-pos-wp-connector') . '</strong> ' . esc_html( date_i18n( get_option( 'date_format' ), strtotime( $sub_expiry ) ) ) . '</li>';
    }
    echo '</ul>';
}

/**
 * Añade la cabecera de la columna "Tipo Venta TPV" al listado de pedidos.
 */
function tvp_pos_add_order_type_column_header_filter( $columns ) {
    $reordered_columns = array();
    $hpos_active = class_exists('\Automattic\WooCommerce\Internal\DataStores\Orders\OrdersTableDataStore');


    foreach ( $columns as $key => $column ) {
        $reordered_columns[$key] = $column;
        // Para HPOS, la columna de estado es 'status'. Para CPT es 'order_status'.
        $status_column_key = $hpos_active ? 'status' : 'order_status';
        if ( $key === $status_column_key ) {
            $reordered_columns['tvp_pos_sale_type'] = __( 'Tipo Venta TPV', 'tvp-pos-wp-connector' );
        }
    }
    if ( !isset($reordered_columns['tvp_pos_sale_type']) ) {
         $reordered_columns['tvp_pos_sale_type'] = __( 'Tipo Venta TPV', 'tvp-pos-wp-connector' );
    }
    return $reordered_columns;
}
add_filter( 'manage_woocommerce_page_wc-orders_columns', 'tvp_pos_add_order_type_column_header_filter', 20 );
add_filter( 'manage_edit-shop_order_columns', 'tvp_pos_add_order_type_column_header_filter', 20 );


/**
 * Muestra el contenido de la columna "Tipo Venta TPV".
 */
function tvp_pos_render_order_type_column_content_action( $column, $order_or_post_id ) {
    $order = null;
    if ( is_numeric( $order_or_post_id ) ) {
        $order = wc_get_order( $order_or_post_id );
    } elseif ( $order_or_post_id instanceof WC_Order ) {
        $order = $order_or_post_id;
    } else { return; }

    if ( ! $order ) return;

    if ( 'tvp_pos_sale_type' === $column ) {
        $is_pos_sale = $order->get_meta( '_tvp_pos_sale', true );
        if ( $is_pos_sale === 'yes' ) {
            $sale_type = $order->get_meta( '_sale_type', true );
            if ( $sale_type ) {
                echo esc_html( ucfirst( $sale_type ) );
                if ( $sale_type === 'suscripcion' ) {
                    $sub_title = $order->get_meta( '_subscription_title', true );
                    if ( $sub_title ) {
                        echo ' (<small>' . esc_html( $sub_title ) . '</small>)';
                    }
                }
            } else {
                echo __( 'TPV (Directa)', 'tvp-pos-wp-connector' );
            }
        } else {
            echo '—';
        }
    }
}
add_action( 'manage_woocommerce_page_wc-orders_custom_column', 'tvp_pos_render_order_type_column_content_action', 10, 2 );
add_action( 'manage_shop_order_posts_custom_column', 'tvp_pos_render_order_type_column_content_action', 10, 2 );

// Fin de adiciones para metabox y columna
?>
