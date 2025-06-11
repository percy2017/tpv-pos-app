# TVP-POS - Sistema de Punto de Venta con Integración WooCommerce

## Descripción Corta
TVP-POS es una aplicación de Punto de Venta (POS) construida con Node.js y Express, diseñada para integrarse con WooCommerce a través de un plugin de WordPress personalizado. Permite gestionar ventas, clientes, usuarios, configuración de servicios externos y visualizar información relevante como historial de ventas y vencimientos de suscripciones. El proyecto también incluye una aplicación de escritorio Electron que empaqueta la aplicación web para su uso local.

## Características Principales
*   **Interfaz de TPV (POS):** Búsqueda de productos, gestión de carrito, aplicación de cupones, procesamiento de ventas. La tarjeta de cliente ahora muestra el teléfono.
*   **Gestión de Clientes:** Creación, edición, búsqueda y visualización de clientes. Los datos de facturación se sincronizan con los perfiles de usuario en WordPress.
*   **Gestión de Usuarios (App):** Listado de usuarios de WordPress con paginación del lado del servidor, búsqueda, visualización de avatares, teléfonos e historial de compras. Funcionalidad para eliminar usuarios y ver sus ventas en un modal.
*   **Historial de Ventas:** Listado de pedidos de WooCommerce con paginación del lado del servidor y búsqueda. Visualización de detalles del pedido (incluyendo nombre completo del cliente, teléfono, nota del cliente y productos) en un modal.
*   **Impresión de Tickets:** Generación de tickets de venta en formato PDF (diseño para rollo de 80mm) directamente desde el historial de ventas.
*   **Dashboard Inicial:** Visualización de contadores de estado de pedidos.
*   **Calendario de Eventos:**
    *   Visualización de eventos manuales y vencimientos de suscripciones de WooCommerce.
    *   Al hacer clic en un evento de suscripción, se abre un modal con los detalles de la venta asociada (mostrando nombre completo y teléfono del cliente).
    *   Funcionalidad para **Enviar Mensaje por WhatsApp** directamente desde este modal, utilizando la API de Evolution. Permite seleccionar la instancia de Evolution, precarga el teléfono del cliente y una plantilla de mensaje editable (usando la nota del cliente del pedido si existe).
*   **Página de Configuración General (`/settings`):**
    *   Interfaz para configurar parámetros de servicios externos:
        *   Evolution API (URL Base, API Key).
        *   n8n (URL Producción, URL Testing).
        *   Socket (URL, Room).
    *   La configuración se guarda localmente en la aplicación.
    *   Se ha añadido configuración para **Chatwoot API** (URL Base, Account ID, API Access Token).
*   **Visualizador de Multimedia (`/media`):**
    *   Permite visualizar archivos adjuntos (imágenes, videos, etc.) obtenidos de las conversaciones de **Chatwoot**.
    *   Incluye paginación basada en las páginas de conversaciones de Chatwoot.
*   **Módulo de Mensajería Masiva por WhatsApp (`/whatsapp-bulk`):**
    *   **Interfaz de Usuario Avanzada:**
        *   Formulario para la creación de campañas con campos para: Título, Mensaje (con botones de formato tipo WhatsApp y placeholders clickeables), Instancia de Evolution API (cargadas dinámicamente), Fuente de Contactos (Chatwoot por Etiqueta, Todos los de Chatwoot, Lista Manual; placeholders para WooCommerce y CSV), Etiqueta de Chatwoot (cargadas dinámicamente y mostradas condicionalmente), URL de Multimedia (opcional), e Intervalo de Envío en segundos.
        *   La página principal del módulo ahora muestra un **Historial de Campañas** en una tabla (DataTables) con detalles como ID, título, fecha, fuente, estado y conteos (total, enviados, fallidos).
        *   Botón "Crear Nueva Campaña" para mostrar/ocultar el formulario de creación.
    *   **Gestión de Campañas (Backend):**
        *   Al iniciar una campaña, se crea un archivo JSON en `data/` con los detalles y la lista de contactos (cada uno con estado `pendiente`, `enviado`, `fallido`).
        *   Un proceso en segundo plano (`processBulkCampaignInBackground`) maneja el envío de mensajes:
            *   Itera sobre los contactos, respetando el intervalo de envío.
            *   Reemplaza placeholders en el mensaje.
            *   Envía mensajes de texto o multimedia (con texto como caption) a través de la Evolution API.
            *   Actualiza el estado de cada contacto y el resumen de la campaña en el archivo JSON.
            *   Maneja errores de envío individuales.
    *   **Obtención de Contactos:**
        *   Implementada la obtención de contactos desde Chatwoot (todos o filtrados por etiqueta).
        *   Implementado el procesamiento de listas manuales de números.
        *   Limpieza de números de teléfono (eliminación de `+` y caracteres no numéricos).
    *   **Gestión de Estado de Campañas:**
        *   Funcionalidad para Pausar y Reanudar campañas en curso desde la tabla de historial.
        *   Funcionalidad para Eliminar campañas (elimina el archivo JSON asociado).
    *   **Integración con Servicios API:**
        *   `chatwootApiService.js`: Nuevas funciones para obtener etiquetas (`getChatwootLabels`), contactos por etiqueta (`getChatwootContactsWithLabel`), y todos los contactos (`getAllChatwootContacts`).
        *   `evolutionApiService.js`: Función `sendWhatsAppMessage` mejorada para manejar envío de multimedia (infiriendo `mediatype` y usando `caption`) y ajustar `options.presence`.
*   **Autenticación:** Sistema de login contra usuarios de WordPress, utilizando un token JWT para la sesión en la aplicación TPV.
*   **Integración con WooCommerce:** A través de un plugin de WordPress (`tvp-pos-wp-connector`) que expone una API REST. El plugin ha sido mejorado para incluir más detalles del cliente (nombre, apellido, teléfono) y notas del pedido en las respuestas de la API.
*   **Interfaz de Usuario Mejorada:**
    *   Iconos en todos los elementos del menú de navegación principal.
    *   Alertas de SweetAlert con tema oscuro para consistencia visual.
*   **Tema Oscuro/Claro:** Selector de tema para la interfaz.
*   **Aplicación de Escritorio (Electron):** Permite ejecutar la aplicación TPV como una aplicación de escritorio en Windows. Inicia automáticamente el servidor Node.js local y carga la interfaz web.

## Arquitectura del Proyecto
(Sección sin cambios)

## Tecnologías Utilizadas
*   **Backend (Aplicación TPV):** Node.js, Express.js
*   **Frontend (Aplicación TPV):** HTML, CSS, JavaScript, EJS, Bootstrap 5, DataTables, SweetAlert2, FullCalendar.
*   **Comunicación API Externa (Aplicación TPV):** Axios (para Evolution API).
*   **Generación de PDF (Aplicación TPV):** PDFKit.
*   **Aplicación de Escritorio:** Electron, Electron Builder.
*   **Backend (WordPress):** PHP, WordPress API REST, WooCommerce API.
*   **Base de Datos:** La que utilice WordPress (generalmente MySQL/MariaDB).
*   **Contenerización (Opcional para despliegue web):** Docker, Docker Compose.

## Requisitos Previos
(Sección sin cambios)

## Instalación y Configuración
(Nota: El archivo `data/app-config.json` se crea/actualiza automáticamente al guardar desde la página de Configuración y almacena las URLs y tokens de APIs externas como Evolution API, n8n, Socket y Chatwoot API.)

### 1. Backend Node.js/Express (Aplicación TPV Principal)
(Sección sin cambios)

### 2. Plugin de WordPress (`tvp-pos-wp-connector`)
(Sección sin cambios)

### 3. WooCommerce
(Sección sin cambios)

### 4. Aplicación de Escritorio Electron (`electron-app/`)
(Sección sin cambios)

### 5. Usando Docker (Para Despliegue Web)
(Sección sin cambios)

## Uso de la Aplicación
(Sección sin cambios)

## API del Plugin de WordPress (`tvp-pos-connector/v1`)
(Sección sin cambios)

### API Interna de la Aplicación TPV (Node.js)
Se han añadido/actualizado los siguientes endpoints principales:
*   `GET /whatsapp-bulk`: Muestra la página del módulo de mensajería masiva.
*   `GET /media`: Muestra la página del visualizador de multimedia.
*   `GET /api/settings`: Obtiene la configuración de la aplicación.
*   `POST /api/settings`: Guarda la configuración de la aplicación.
*   `GET /api/evolution/instances`: Obtiene instancias de Evolution API.
*   `POST /api/whatsapp/send-message`: Envía un mensaje de WhatsApp individual.
*   `GET /api/chatwoot-media`: Obtiene una lista paginada de adjuntos de Chatwoot.
*   `GET /api/chatwoot/conversations/search`: Busca conversaciones en Chatwoot (para selectores).
*   `GET /api/chatwoot/labels`: Obtiene todas las etiquetas de la cuenta de Chatwoot.
*   `POST /api/whatsapp/start-bulk-campaign`: Inicia una nueva campaña de envío masivo (crea archivo JSON de seguimiento).
*   `GET /api/whatsapp/bulk-campaigns`: Lista todas las campañas de envío masivo existentes.
*   `DELETE /api/whatsapp/bulk-campaigns/:campaignId`: Elimina una campaña específica.
*   `POST /api/whatsapp/bulk-campaigns/:campaignId/pause`: Pausa una campaña en curso.
*   `POST /api/whatsapp/bulk-campaigns/:campaignId/resume`: Reanuda una campaña pausada.

## Próximas Características / Planes Futuros
*   **Módulo de Mensajería Masiva por WhatsApp (Mejoras Pendientes):**
    *   **Fuentes de Contactos Adicionales:**
        *   Implementar la obtención de listas de destinatarios desde **WordPress/WooCommerce** (ej. todos los clientes, clientes con suscripciones activas, etc.).
        *   Implementar la carga de contactos desde archivos **CSV**.
    *   **Feedback de Progreso Mejorado:**
        *   Proporcionar feedback en tiempo real al usuario sobre el progreso del envío de una campaña (ej. usando WebSockets o actualizando la tabla de historial).
        *   Mejorar la visualización de detalles de una campaña (ej. en un modal, mostrando el estado de cada contacto individual).
    *   **Gestión de Errores y Reintentos:**
        *   Implementar una estrategia para reintentar envíos fallidos.
    *   **Selección de Multimedia desde Biblioteca:**
        *   Integrar la vista `/media` para permitir seleccionar un archivo multimedia existente de Chatwoot para las campañas, en lugar de solo pegar una URL.
    *   **Programación de Envíos y Plantillas:**
        *   (Opcional) Permitir programar campañas para una fecha/hora futura.
        *   (Opcional) Sistema para guardar y reutilizar plantillas de mensajes.
*   **Mejora en Búsqueda de Historial de Ventas:**
    *   Actualmente en revisión y desarrollo para asegurar que la búsqueda en la sección de "Historial de Ventas" (página `/sales`) devuelva todos los resultados relevantes que coinciden con el término de búsqueda, similar a como lo hace la búsqueda nativa de WooCommerce. Se está trabajando en la lógica del plugin de WordPress (`tvp-pos-wp-connector`) para optimizar la búsqueda por campos como el número de teléfono del cliente.

## Contribuciones
(Sección sin cambios)

## Licencia
(Sección sin cambios)

## Autor
(Sección sin cambios)

---
*Nota: Este README es una guía general. Puede que necesites ajustar detalles específicos según la evolución del proyecto.*
