# TVP-POS - Sistema de Punto de Venta con Integración WooCommerce

## Descripción Corta
TVP-POS es una aplicación de Punto de Venta (POS) construida con Node.js y Express, diseñada para integrarse con WooCommerce a través de un plugin de WordPress personalizado. Permite gestionar ventas, clientes, usuarios y visualizar información relevante como historial de ventas y vencimientos de suscripciones. El proyecto también incluye una aplicación de escritorio Electron que empaqueta la aplicación web para su uso local.

## Características Principales
*   **Interfaz de TPV (POS):** Búsqueda de productos, gestión de carrito, aplicación de cupones, procesamiento de ventas.
*   **Gestión de Clientes:** Creación, edición, búsqueda y visualización de clientes. Los datos de facturación se sincronizan con los perfiles de usuario en WordPress.
*   **Gestión de Usuarios (App):** Listado de usuarios de WordPress con paginación del lado del servidor, búsqueda, visualización de avatares, teléfonos e historial de compras (total de pedidos, ingresos, promedio por pedido). Funcionalidad para eliminar usuarios y ver sus ventas en un modal.
*   **Historial de Ventas:** Listado de pedidos de WooCommerce con paginación del lado del servidor, búsqueda (incluyendo búsqueda mejorada por teléfono del cliente), y visualización de detalles del pedido (incluyendo productos) en un modal. Columna personalizada para "Tipo de Venta TPV".
*   **Impresión de Tickets:** Generación de tickets de venta en formato PDF (diseño para rollo de 80mm) directamente desde el historial de ventas.
*   **Dashboard Inicial:** Visualización de contadores de estado de pedidos (En Proceso, En Espera, Completados) en la página de inicio.
*   **Calendario de Eventos:** Visualización de eventos manuales y vencimientos de suscripciones (obtenidos de pedidos de WooCommerce marcados como suscripción).
*   **Autenticación:** Sistema de login contra usuarios de WordPress, utilizando un token JWT para la sesión en la aplicación TPV.
*   **Integración con WooCommerce:** A través de un plugin de WordPress (`tvp-pos-wp-connector`) que expone una API REST para manejar productos, clientes, ventas, cupones, etc.
*   **Tema Oscuro/Claro:** Selector de tema para la interfaz.
*   **Aplicación de Escritorio (Electron):** Permite ejecutar la aplicación TPV como una aplicación de escritorio en Windows. Inicia automáticamente el servidor Node.js local y carga la interfaz web.

## Arquitectura del Proyecto
El sistema se compone de tres partes principales:

1.  **Aplicación Backend/Frontend (Node.js/Express):**
    *   Ubicada en la raíz del proyecto (`src/`, `public/`, `views/`).
    *   Sirve la interfaz de usuario (vistas EJS).
    *   Maneja la lógica de negocio de la aplicación TPV.
    *   Se comunica con el plugin de WordPress a través de su API REST.
2.  **Plugin de WordPress (`tvp-pos-wp-connector`):**
    *   Ubicado en la carpeta `tvp-pos-wp-connector/`.
    *   Debe instalarse en un sitio WordPress con WooCommerce activo.
    *   Expone endpoints de API REST para que la aplicación Node.js interactúe con los datos de WordPress/WooCommerce.
3.  **Aplicación de Escritorio Electron (`electron-app/`):**
    *   Ubicada en la carpeta `electron-app/`.
    *   Empaqueta la aplicación Node.js/Express para su ejecución local como una aplicación de escritorio.
    *   Inicia el servidor Node.js (`src/app.js`) y carga su interfaz web.

## Tecnologías Utilizadas
*   **Backend (Aplicación TPV):** Node.js, Express.js
*   **Frontend (Aplicación TPV):** HTML, CSS, JavaScript, EJS, Bootstrap 5, DataTables, SweetAlert2, FullCalendar.
*   **Generación de PDF (Aplicación TPV):** PDFKit.
*   **Aplicación de Escritorio:** Electron, Electron Builder.
*   **Backend (WordPress):** PHP, WordPress API REST, WooCommerce API.
*   **Base de Datos:** La que utilice WordPress (generalmente MySQL/MariaDB).
*   **Contenerización (Opcional para despliegue web):** Docker, Docker Compose.

## Requisitos Previos
*   Node.js (v18 o superior recomendado)
*   NPM (usualmente viene con Node.js)
*   Para el desarrollo del plugin de WordPress:
    *   Un servidor web local con PHP y MySQL (ej. XAMPP, MAMP, LocalWP).
    *   Una instalación de WordPress funcional.
    *   Plugin WooCommerce instalado y activado.
*   Para el despliegue web con Docker: Docker y Docker Compose.

## Instalación y Configuración

### 1. Backend Node.js/Express (Aplicación TPV Principal)
Se encuentra en la raíz de este repositorio.

1.  **Clonar el Repositorio (si aplica).**
2.  **Instalar Dependencias:**
    ```bash
    npm install
    ```
3.  **Variables de Entorno:**
    Crea un archivo `.env` en la raíz del proyecto (basado en `.env.example` si existiera). Variables importantes:
    *   `PORT`: Puerto para la aplicación Node.js (ej. `3001` o `3000`).
    *   `SESSION_SECRET`: Secreto largo y aleatorio para sesiones.
    *   `NODE_ENV`: `development` o `production`.
    Ejemplo de `.env`:
    ```env
    PORT=3001
    SESSION_SECRET=tu_secreto_de_sesion_muy_seguro_y_aleatorio
    NODE_ENV=development
    ```
4.  **Iniciar el Servidor Node.js (Desarrollo Local sin Docker):**
    *   Con nodemon: `npm run dev`
    *   Normal: `npm start`
    La aplicación TPV debería estar corriendo en `http://localhost:PUERTO_CONFIGURADO`.

### 2. Plugin de WordPress (`tvp-pos-wp-connector`)
(Instrucciones como estaban antes)

1.  **Preparar el Plugin:**
    *   La carpeta `tvp-pos-wp-connector/` contiene el plugin.
    *   Comprime esta carpeta en un archivo ZIP (ej. `tvp-pos-wp-connector.zip`).
2.  **Instalar en WordPress:**
    *   Accede al panel de administración de tu sitio WordPress.
    *   Ve a "Plugins" > "Añadir nuevo" > "Subir plugin".
    *   Selecciona `tvp-pos-wp-connector.zip` e instálalo. Actívalo.
3.  **Configuración de WordPress:**
    *   **Permalinks:** Asegúrate de que no estén como "Simple". Se recomienda "Nombre de la entrada".
    *   **CORS:** Configura `Access-Control-Allow-Origin` en `tvp-pos-wp-connector.php` o define `TVP_POS_ALLOWED_ORIGIN` en `wp-config.php` para permitir el origen de tu app Node.js (ej. `http://localhost:3001`).

### 3. WooCommerce
(Instrucciones como estaban antes, con la nota sobre metadatos para eventos de calendario)

### 4. Aplicación de Escritorio Electron (`electron-app/`)
Esta aplicación empaqueta el servidor Node.js y el frontend para ejecutarse como una aplicación de escritorio.

1.  **Navegar al Directorio:**
    ```bash
    cd electron-app
    ```
2.  **Instalar Dependencias de Electron:**
    ```bash
    npm install
    ```
3.  **Ejecutar en Modo Desarrollo:**
    Esto iniciará la aplicación Electron, la cual a su vez iniciará el servidor Node.js (usando la configuración de `.env` del proyecto raíz) y cargará la interfaz.
    ```bash
    npm start
    ```
4.  **Construir el Instalador para Windows (`.exe`):**
    *   Asegúrate de tener un icono en `electron-app/assets/icon.png` (256x256px recomendado).
    *   Ejecuta el siguiente comando en una terminal **como Administrador**:
        ```bash
        npm run dist
        ```
    *   El instalador se generará en la carpeta `electron-app/dist_electron/`.

### 5. Usando Docker (Para Despliegue Web)
(Instrucciones como estaban antes, adaptadas para el puerto del `.env`)
El proyecto está configurado para ser desplegado fácilmente usando Docker y Docker Compose.

1.  **Requisitos Previos:** Docker y Docker Compose instalados.
2.  **Configuración:**
    *   Asegúrate de que `docker-compose.yml` esté presente.
    *   Verifica/Edita `docker-compose.yml` para `SESSION_SECRET` y otras variables de entorno si es necesario. El `PORT` interno del contenedor es 3000, pero se mapea al puerto que definas en la sección `ports` (ej. `3001:3000`).
3.  **Construir e Iniciar Contenedores:**
    ```bash
    docker-compose up -d --build
    ```
4.  **Acceso:** La aplicación estará disponible en el puerto mapeado (ej. `http://tu_ip_del_vps:3001`).

## Uso de la Aplicación
(Sección sin cambios significativos, ya describe el uso de la app web que Electron carga)

## API del Plugin de WordPress (`tvp-pos-connector/v1`)
(Sección sin cambios)

### API Interna de la Aplicación TPV (Node.js)
(Sección sin cambios)

## Contribuciones
Este es un proyecto personal. Si deseas contribuir, por favor, abre un issue o un pull request en GitHub.

## Licencia
(Especifica tu licencia aquí, ej. MIT, GPLv2, etc. Si no estás seguro, MIT es una opción común y permisiva).

## Autor
Percy Alvarez
(Puedes añadir tu email o enlace a perfil de GitHub aquí)

---
*Nota: Este README es una guía general. Puede que necesites ajustar detalles específicos según la evolución del proyecto.*
