# TVP-POS - Sistema de Punto de Venta con Integración WooCommerce

## Descripción Corta
TVP-POS es una aplicación de Punto de Venta (POS) construida con Node.js y Express, diseñada para integrarse con WooCommerce a través de un plugin de WordPress personalizado. Permite gestionar ventas, clientes, usuarios y visualizar información relevante como historial de ventas y vencimientos de suscripciones.

## Características Principales
*   **Interfaz de TPV (POS):** Búsqueda de productos, gestión de carrito, aplicación de cupones, procesamiento de ventas.
*   **Gestión de Clientes:** Creación, edición, búsqueda y visualización de clientes. Los datos de facturación se sincronizan con los perfiles de usuario en WordPress.
*   **Gestión de Usuarios (App):** Listado de usuarios de WordPress con paginación del lado del servidor, búsqueda, visualización de avatares, teléfonos e historial de compras (total de pedidos, ingresos, promedio por pedido). Funcionalidad para eliminar usuarios y ver sus ventas en un modal.
*   **Historial de Ventas:** Listado de pedidos de WooCommerce con paginación del lado del servidor, búsqueda, y visualización de detalles del pedido (incluyendo productos) en un modal. Columna personalizada para "Tipo de Venta TPV".
*   **Calendario de Eventos:** Visualización de eventos manuales y vencimientos de suscripciones (obtenidos de pedidos de WooCommerce marcados como suscripción).
*   **Autenticación:** Sistema de login contra usuarios de WordPress, utilizando un token JWT para la sesión en la aplicación TPV.
*   **Integración con WooCommerce:** A través de un plugin de WordPress (`tvp-pos-wp-connector`) que expone una API REST para manejar productos, clientes, ventas, cupones, etc.
*   **Tema Oscuro/Claro:** Selector de tema para la interfaz.

## Arquitectura del Proyecto
El sistema se compone de dos partes principales:

1.  **Aplicación Backend/Frontend (Node.js/Express):**
    *   Ubicada en la raíz del proyecto.
    *   Sirve la interfaz de usuario (vistas EJS).
    *   Maneja la lógica de negocio de la aplicación TPV.
    *   Se comunica con el plugin de WordPress a través de su API REST.
2.  **Plugin de WordPress (`tvp-pos-wp-connector`):**
    *   Ubicado en la carpeta `tvp-pos-wp-connector/`.
    *   Debe instalarse en un sitio WordPress con WooCommerce activo.
    *   Expone endpoints de API REST para que la aplicación Node.js interactúe con los datos de WordPress/WooCommerce (usuarios, productos, pedidos, etc.).
    *   Maneja la autenticación de usuarios de WordPress para el TPV.
    *   Añade metaboxes y columnas personalizadas al admin de WooCommerce para mostrar información del TPV.

## Tecnologías Utilizadas
*   **Backend (Aplicación TPV):** Node.js, Express.js
*   **Frontend (Aplicación TPV):** HTML, CSS, JavaScript, EJS (Embedded JavaScript templates), Bootstrap 5, DataTables, SweetAlert2, FullCalendar (o similar para el calendario), intl-tel-input.
*   **Backend (WordPress):** PHP, WordPress API REST, WooCommerce API.
*   **Base de Datos:** La que utilice WordPress (generalmente MySQL/MariaDB).
*   **Entorno de Desarrollo Sugerido:** XAMPP (para WordPress), Node.js.

## Requisitos Previos
*   Node.js (v16 o superior recomendado)
*   NPM (usualmente viene con Node.js)
*   Un servidor web local con PHP y MySQL (ej. XAMPP, MAMP, LocalWP)
*   Una instalación de WordPress funcional en el servidor local.
*   Plugin WooCommerce instalado y activado en WordPress.

## Instalación y Configuración

### 1. Backend Node.js/Express (Aplicación TPV)
La aplicación TPV se encuentra en la raíz de este repositorio.

1.  **Clonar el Repositorio (si aplica):**
    ```bash
    git clone [URL_DEL_REPOSITORIO]
    cd [NOMBRE_DEL_DIRECTORIO_DEL_PROYECTO]
    ```
2.  **Instalar Dependencias:**
    ```bash
    npm install
    ```
3.  **Variables de Entorno:**
    Crea un archivo `.env` en la raíz del proyecto Node.js con las siguientes variables (ajusta los valores según tu configuración):
    ```env
    PORT=3000
    SESSION_SECRET=tu_secreto_de_sesion_muy_seguro
    # Opcional: Si el path de la API del plugin es diferente al default
    # WP_PLUGIN_API_PATH=/wp-json/tvp-pos-connector/v1 
    ```
4.  **Iniciar el Servidor Node.js:**
    *   Para desarrollo (con nodemon, si está configurado en `package.json`):
        ```bash
        npm run dev
        ```
    *   Para producción o inicio normal:
        ```bash
        npm start
        ```
    La aplicación TPV debería estar corriendo en `http://localhost:3000` (o el puerto que hayas configurado).

### 2. Plugin de WordPress (`tvp-pos-wp-connector`)

1.  **Preparar el Plugin:**
    *   La carpeta `tvp-pos-wp-connector/` contiene el plugin.
    *   Comprime esta carpeta en un archivo ZIP (ej. `tvp-pos-wp-connector.zip`).
2.  **Instalar en WordPress:**
    *   Accede al panel de administración de tu sitio WordPress local (ej. `http://localhost/wp-admin/`).
    *   Ve a "Plugins" > "Añadir nuevo".
    *   Haz clic en "Subir plugin".
    *   Selecciona el archivo `tvp-pos-wp-connector.zip` que creaste y haz clic en "Instalar ahora".
    *   Activa el plugin después de la instalación.
3.  **Configuración de WordPress:**
    *   **Permalinks:** Asegúrate de que tus permalinks en WordPress (Ajustes > Enlaces permanentes) no estén configurados como "Simple". Se recomienda "Nombre de la entrada" o una estructura similar para que la API REST funcione correctamente. Guarda los cambios si es necesario.
    *   **CORS (Cross-Origin Resource Sharing):** El plugin `tvp-pos-wp-connector.php` tiene una sección para configurar `Access-Control-Allow-Origin`. Para desarrollo local, usualmente se configura para permitir el origen de tu app Node.js (ej. `http://localhost:3000`).
        ```php
        // Dentro de tvp-pos-wp-connector.php, en la función tvp_pos_api_cors_setup()
        // header( "Access-Control-Allow-Origin: http://localhost:3000" ); 
        // O define TVP_POS_ALLOWED_ORIGIN en tu wp-config.php:
        // define('TVP_POS_ALLOWED_ORIGIN', 'http://localhost:3000');
        ```
        Asegúrate de que esta configuración sea la correcta para tu entorno.

### 3. WooCommerce
*   Asegúrate de que WooCommerce esté instalado, activado y configurado con productos, pasarelas de pago (aunque sea de prueba como "Transferencia Bancaria Directa" o "Pago por Cheque" para empezar), etc.

## Uso de la Aplicación

1.  **Login:**
    *   Accede a la aplicación TPV (ej. `http://localhost:3000`).
    *   Serás redirigido a la página de login.
    *   Ingresa la URL de tu sitio WordPress local (ej. `http://localhost` o `http://localhost/nombredetusitio`).
    *   Ingresa tus credenciales de un usuario de WordPress (se recomienda un usuario con rol de administrador o "Shop manager" para tener acceso a todas las funcionalidades).
    *   Al loguearte, se genera un token JWT que se guarda en la sesión para autenticar las peticiones a la API del TPV y las llamadas al plugin de WordPress.

2.  **Vistas Principales:**
    *   **TPV (POS):**
        *   Busca productos por nombre o SKU.
        *   Añade productos al carrito.
        *   Modifica precios y cantidades en el carrito.
        *   Busca y selecciona/crea clientes (con datos de facturación).
        *   Aplica cupones de descuento.
        *   Selecciona tipo de venta (Directa, Suscripción). Si es suscripción, añade título y fecha de vencimiento.
        *   Selecciona método de pago.
        *   Añade notas para el cliente.
        *   Finaliza la venta, lo que crea un pedido en WooCommerce.
    *   **Historial de Ventas:**
        *   Muestra un listado de pedidos de WooCommerce con paginación del lado del servidor.
        *   Columnas: ID, Fecha, Cliente, Productos (resumen), Total, Estado, Acciones.
        *   Botón "Ver" para abrir un modal con detalles completos del pedido (info general, direcciones, lista de productos, notas).
    *   **Gestión de Usuarios:**
        *   Muestra un listado de usuarios de WordPress con paginación del lado del servidor.
        *   Columnas: Avatar, ID, Nombre, Usuario, Email, Teléfono, Roles, Historial de Compras (Pedidos, Total Gastado, Prom. Pedido), Acciones.
        *   Botón "Añadir Nuevo Usuario" (abre modal para crear usuarios).
        *   Acciones:
            *   "Ver Ventas": Abre un modal con el listado de pedidos del usuario.
            *   "Eliminar": Elimina el usuario de WordPress (con confirmación).
    *   **Calendario:**
        *   Muestra eventos manuales (guardados en `data/manual-events.json`).
        *   Muestra vencimientos de suscripciones (obtenidos de pedidos de WooCommerce con `_sale_type = 'suscripcion'` y `_subscription_expiry`).

## API del Plugin de WordPress (`tvp-pos-connector/v1`)
El plugin expone varios endpoints bajo el namespace `tvp-pos-connector/v1`. Algunos de los principales son:

*   `POST /auth/login`: Para autenticar usuarios de WordPress y generar un token.
*   `POST /auth/validate-token`: Para validar un token existente.
*   `GET /users`: Lista usuarios (con paginación, búsqueda, ordenamiento). Devuelve datos para DataTables.
*   `POST /users`: Crea un nuevo usuario.
*   `GET /users/{id}`: Obtiene un usuario específico.
*   `PUT /users/{id}`: Actualiza un usuario.
*   `DELETE /users/{id}`: Elimina un usuario.
*   `GET /sales`: Lista pedidos de WooCommerce (con paginación, búsqueda, ordenamiento, filtro por cliente). Devuelve datos para DataTables.
*   `POST /sales`: Crea un nuevo pedido en WooCommerce.
*   `GET /sales/{id}`: Obtiene los detalles de un pedido específico.
*   `GET /products`: Lista productos de WooCommerce (con paginación, búsqueda, filtros).
*   `GET /payment-gateways`: Lista las pasarelas de pago activas.
*   `POST /coupons/validate`: Valida un código de cupón.
*   `GET /subscription-events`: Obtiene eventos de vencimiento de suscripciones para el calendario.

Todos los endpoints requieren un token `X-TVP-Token` en las cabeceras para la autenticación (excepto `/auth/login`).

## Contribuciones
Este es un proyecto personal. Si deseas contribuir, por favor, abre un issue o un pull request en GitHub.

## Licencia
(Especifica tu licencia aquí, ej. MIT, GPLv2, etc. Si no estás seguro, MIT es una opción común y permisiva).

## Autor
Percy Alvarez
(Puedes añadir tu email o enlace a perfil de GitHub aquí)

---
*Nota: Este README es una guía general. Puede que necesites ajustar detalles específicos según la evolución del proyecto.*
