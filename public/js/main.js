$(document).ready(function() {
    // ... (código existente de DataTables, Carrito, Tema) ...
    // Inicializar DataTables para la tabla de ventas
    if ($('#salesTable').length) {
        $('#salesTable').DataTable({
            responsive: true,
            processing: true,
            serverSide: true,
            ajax: {
                url: '/api/sales/dt', // Endpoint que creamos en Node.js
                type: 'POST',
            },
            columns: [
                { data: 'id', render: function(data, type, row) {
                    return `<a href="/wp-admin/admin.php?page=wc-orders&action=edit&id=${data}" target="_blank">#${data}</a>`;
                }},
                { data: 'date_created', render: function(data, type, row) {
                    return data ? new Date(data).toLocaleString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A';
                }},
                { data: 'customer_name', render: function(data, type, row) {
                    if (row.customer_id) {
                        // Podríamos hacer este enlace al perfil del cliente en el TPV si existiera una vista para ello
                        return `<a href="/wp-admin/user-edit.php?user_id=${row.customer_id}" target="_blank">${data || `Cliente ID: ${row.customer_id}`}</a>`;
                    }
                    return data || 'Invitado';
                }},
                { data: 'products_summary', orderable: false, searchable: false, defaultContent: '-' }, // Nueva columna de productos
                { data: 'total', render: function(data, type, row) {
                    return `${row.currency || ''} ${parseFloat(data || 0).toFixed(2)}`;
                }},
                { data: 'status', render: function(data, type, row) {
                    return `<span class="badge bg-${getBootstrapStatusColor(data)}">${data ? data.replace('wc-', '') : 'desconocido'}</span>`;
                }},
                { 
                    data: null, 
                    orderable: false, 
                    searchable: false,
                    render: function(data, type, row) {
                        let buttons = `<button class="btn btn-sm btn-info view-sale-details-btn me-1" data-order-id="${row.id}" title="Ver Detalles"><i class="bi bi-eye"></i> Ver</button>`;
                        // El botón de imprimir podría generar un PDF o una vista simple
                        buttons += `<button class="btn btn-sm btn-warning print-sale-receipt-btn" data-order-id="${row.id}" title="Imprimir Recibo (Próximamente)"><i class="bi bi-printer"></i></button>`;
                        return buttons;
                    }
                }
            ],
            language: { 
                url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json',
                processing: "Procesando...",
            },
            order: [[1, 'desc']] // Ordenar por fecha descendente por defecto
        });
    }

    // Lógica para mostrar detalles de venta en modal
    const saleDetailsModal = new bootstrap.Modal(document.getElementById('saleDetailsModal'));
    const saleDetailsModalLabel = $('#saleDetailsModalLabel');
    const saleDetailsModalLoading = $('#saleDetailsModalLoading');
    const saleDetailsModalContent = $('#saleDetailsModalContent');
    const saleDetailsProductsTableBody = $('#saleDetailsProductsTable tbody');
    // Referencias a los spans/divs dentro del modal
    const modalSaleId = $('#modalSaleId');
    const modalSaleDate = $('#modalSaleDate');
    const modalSaleCustomer = $('#modalSaleCustomer');
    const modalSaleCustomerEmail = $('#modalSaleCustomerEmail'); // Necesitaremos que la API devuelva billing_email
    const modalSaleStatus = $('#modalSaleStatus');
    const modalSaleTotal = $('#modalSaleTotal');
    const modalSalePaymentMethod = $('#modalSalePaymentMethod'); // Necesitaremos que la API devuelva payment_method_title
    const modalBillingAddress = $('#modalBillingAddress');
    const modalShippingAddress = $('#modalShippingAddress');
    const modalCustomerNote = $('#modalCustomerNote');


    $('#salesTable').on('click', '.view-sale-details-btn', async function() {
        const orderId = $(this).data('orderId');
        saleDetailsModalLabel.text(`Detalles de la Venta #${orderId}`);
        
        saleDetailsModalLoading.show();
        saleDetailsModalContent.hide();
        saleDetailsProductsTableBody.empty();

        saleDetailsModal.show();
        console.log(`[TVP-POS DEBUG] main.js - view-sale-details-btn - Fetching details for order ID: ${orderId}`);

        try {
            const response = await fetch(`/api/sales/${orderId}`); // Usamos el endpoint existente para un solo pedido
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Error ${response.status} al cargar detalles de la venta`);
            }
            const saleDetails = await response.json();
            console.log(`[TVP-POS DEBUG] main.js - view-sale-details-btn - Sale details received:`, saleDetails);

            saleDetailsModalLoading.hide();

            // Poblar información general
            modalSaleId.text(saleDetails.id);
            modalSaleDate.text(new Date(saleDetails.date_created).toLocaleString('es-ES'));
            modalSaleCustomer.text(saleDetails.customer_name || (saleDetails.customer_id ? `Cliente ID: ${saleDetails.customer_id}` : 'Invitado'));
            // Asumimos que la API /api/sales/:id devuelve billing_email y payment_method_title
            // Si no, tvp_pos_get_single_sale_api en el plugin necesita añadirlos.
            modalSaleCustomerEmail.text(saleDetails.billing_email || '-'); 
            modalSaleStatus.html(`<span class="badge bg-${getBootstrapStatusColor(saleDetails.status)}">${saleDetails.status ? saleDetails.status.replace('wc-', '') : 'desconocido'}</span>`);
            modalSaleTotal.text(`${saleDetails.currency || ''} ${parseFloat(saleDetails.total || 0).toFixed(2)}`);
            modalSalePaymentMethod.text(saleDetails.payment_method_title || saleDetails.payment_method || '-');

            // Direcciones
            modalBillingAddress.html(saleDetails.billing_address ? saleDetails.billing_address.replace(/\n/g, '<br>') : 'No disponible');
            modalShippingAddress.html(saleDetails.shipping_address ? saleDetails.shipping_address.replace(/\n/g, '<br>') : 'No disponible');
            
            // Nota del cliente (asumimos que la API la devuelve como 'customer_note')
            // tvp_pos_get_single_sale_api necesita añadir $order->get_customer_note()
            modalCustomerNote.html(saleDetails.customer_note ? saleDetails.customer_note.replace(/\n/g, '<br>') : '<em>Sin notas.</em>');


            // Poblar productos
            if (saleDetails.line_items && saleDetails.line_items.length > 0) {
                saleDetails.line_items.forEach(item => {
                    const itemRow = `<tr>
                        <td>${item.name}</td>
                        <td>${item.quantity}</td>
                        <td>Bs.${parseFloat(item.total / item.quantity).toFixed(2)}</td> 
                        <td>Bs.${parseFloat(item.total).toFixed(2)}</td>
                    </tr>`;
                    saleDetailsProductsTableBody.append(itemRow);
                });
            } else {
                saleDetailsProductsTableBody.append('<tr><td colspan="4" class="text-center">No hay productos en este pedido.</td></tr>');
            }

            saleDetailsModalContent.show();

        } catch (error) {
            console.error('Error al obtener detalles de la venta:', error);
            saleDetailsModalLoading.hide();
            // Mostrar error dentro del modal
            const errorHtml = `<div class="alert alert-danger">Error al cargar detalles: ${error.message}</div>`;
            // Podríamos tener un div específico para errores en el modal. Por ahora, lo ponemos en el content.
            $('#saleDetailsModalContent').html(errorHtml).show(); 
        }
    });


    const cartItemsContainer = $('#cartItems');
    const emptyCartMsg = $('#emptyCartMsg');
    const cartSubtotalEl = $('#cartSubtotal');
    const cartTotalEl = $('#cartTotal');
    let cart = [];
    let currentCustomerId = null; // ID del cliente seleccionado para la venta
    let currentCustomerBilling = null; // ID del cliente seleccionado para la venta
    let appliedCoupon = null; // Para almacenar el cupón aplicado

    function updateCartUI() {
        if (cart.length === 0) {
            emptyCartMsg.show();
            cartItemsContainer.find('.cart-item').remove(); // Limpiar items existentes
        } else {
            emptyCartMsg.hide();
            cartItemsContainer.find('.cart-item').remove(); // Limpiar items existentes antes de re-renderizar
            cart.forEach(item => {
                // Guardar el precio original si no existe, para referencia si fuera necesario en el futuro
                if (item.originalPrice === undefined) {
                    item.originalPrice = item.price;
                }
                const itemHtml = `
                    <div class="list-group-item list-group-item-action cart-item" data-internal-id="${item.id}">
                        <div class="d-flex w-100 justify-content-between">
                            <h6 class="my-0">${item.name}</h6>
                            <button class="btn btn-sm btn-outline-danger remove-from-cart-btn" data-id="${item.id}" style="line-height: 1; padding: 0.1rem 0.3rem;">&times;</button>
                        </div>
                        <div class="d-flex justify-content-between align-items-center mt-1">
                            <small class="text-muted">
                                Cant: ${item.quantity} x 
                                <input type="number" 
                                       class="form-control form-control-sm item-price-input ms-1 me-1" 
                                       value="${parseFloat(item.price).toFixed(2)}" 
                                       data-item-id="${item.id}" 
                                       min="0" 
                                       step="0.01" 
                                       style="width: 80px; display: inline-block;">
                            </small>
                            <span class="text-muted fw-bold item-total-price">${(item.quantity * item.price).toFixed(2)}</span>
                        </div>
                    </div>`;
                cartItemsContainer.append(itemHtml);
            });
        }
        calculateTotals();
    }

    // Event listener para la modificación de precios en el carrito
    cartItemsContainer.on('change', '.item-price-input', function() {
        const itemId = $(this).data('itemId').toString();
        const newPrice = parseFloat($(this).val());
        
        const cartItem = cart.find(item => item.id === itemId);

        if (cartItem && !isNaN(newPrice) && newPrice >= 0) {
            cartItem.price = newPrice;
            // Actualizar el total del ítem específico en la UI
            const itemElement = $(this).closest('.cart-item');
            itemElement.find('.item-total-price').text((cartItem.quantity * newPrice).toFixed(2));
            calculateTotals(); // Recalcular totales generales del carrito
        } else if (cartItem) {
            // Si el precio no es válido, revertir al precio anterior del ítem
            $(this).val(parseFloat(cartItem.price).toFixed(2));
            Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'warning', title: 'Precio inválido', text: 'Por favor, ingresa un número válido.', showConfirmButton: false, timer: 2500 });
        }
    });


    function calculateTotals() {
        let subtotal = 0;
        cart.forEach(item => subtotal += item.quantity * item.price); // Usa el precio actual del item en el carrito
        
        let discountAmount = 0;
        if (appliedCoupon) {
            if (appliedCoupon.discountType === 'percent') {
                discountAmount = subtotal * (appliedCoupon.amount / 100);
            } else if (appliedCoupon.discountType === 'fixed_cart') {
                discountAmount = appliedCoupon.amount;
            }
            discountAmount = Math.min(discountAmount, subtotal); 
        }

        const total = Math.max(0, subtotal - discountAmount);

        cartSubtotalEl.text(subtotal.toFixed(2));
        
        const cartFooter = cartTotalEl.closest('.card-footer'); 
        let discountRow = cartFooter.find('#cartDiscountRow'); 

        if (discountAmount > 0 && appliedCoupon) {
            const discountText = `-${discountAmount.toFixed(2)}`;
            if (discountRow.length === 0) {
                cartTotalEl.closest('.d-flex').before(`
                    <div class="d-flex justify-content-between text-danger" id="cartDiscountRow">
                        <span>Descuento (${appliedCoupon.code}):</span>
                        <span id="cartDiscountAmount">${discountText}</span>
                    </div>
                `);
            } else {
                 discountRow.find('#cartDiscountAmount').text(discountText);
                 discountRow.find('span:first-child').text(`Descuento (${appliedCoupon.code}):`);
                 discountRow.show();
            }
        } else {
            if (discountRow.length > 0) {
                discountRow.hide(); 
            }
        }
        cartTotalEl.text(total.toFixed(2));
    }

    $('#productListArea').on('click', '.add-to-cart-btn', function() {
        const productId = $(this).data('productId');
        const variationId = $(this).data('variationId');
        const name = $(this).data('name');
        const price = parseFloat($(this).data('price'));
        const cartItemId = variationId ? `${productId}-${variationId}` : productId.toString();
        const existingItem = cart.find(item => item.id === cartItemId);
        if (existingItem) existingItem.quantity++;
        else cart.push({ id: cartItemId, name: name, price: price, quantity: 1 });
        updateCartUI();
        Swal.fire({ toast: true, theme:"dark", position: 'top-end', icon: 'success', title: `${name} añadido`, showConfirmButton: false, timer: 1500 });
    });

    cartItemsContainer.on('click', '.remove-from-cart-btn', function() {
        const cartItemIdToRemove = $(this).data('id').toString();
        cart = cart.filter(item => item.id !== cartItemIdToRemove);
        updateCartUI();
        Swal.fire({ toast: true, theme:"dark", position: 'top-end', icon: 'warning', title: 'Producto eliminado', showConfirmButton: false, timer: 1500 });
    });
    
    updateCartUI();

    // Lógica para mostrar/ocultar detalles de suscripción en TPV
    const saleTypeSelect = document.getElementById('saleType');
    const subscriptionDetailsSection = document.getElementById('subscriptionDetailsSection');

    if (saleTypeSelect && subscriptionDetailsSection) {
        saleTypeSelect.addEventListener('change', function() {
            if (this.value === 'suscripcion') {
                subscriptionDetailsSection.style.display = 'block';
            } else {
                subscriptionDetailsSection.style.display = 'none';
            }
        });
    }

    // Lógica para aplicar cupón (Placeholder para llamada AJAX)
    const applyCouponBtn = document.getElementById('applyCouponBtn');
    const couponCodeInput = document.getElementById('couponCode');
    const couponFeedbackEl = document.getElementById('couponFeedback');
    // appliedCoupon ya está declarado arriba

    if (applyCouponBtn && couponCodeInput && couponFeedbackEl) {
        applyCouponBtn.addEventListener('click', async function() {
            const couponCode = couponCodeInput.value.trim();
            if (!couponCode) {
                couponFeedbackEl.textContent = 'Por favor, ingresa un código de cupón.';
                couponFeedbackEl.className = 'form-text small text-danger';
                return;
            }

            couponFeedbackEl.textContent = 'Validando cupón...';
            couponFeedbackEl.className = 'form-text small text-info';
            appliedCoupon = null; // Resetear cupón aplicado
            calculateTotals(); // Recalcular para quitar descuento previo si lo había

            try {
                const currentSubtotal = parseFloat(cartSubtotalEl.text());
                const response = await fetch('/api/validate-coupon', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ couponCode: couponCode, cartSubtotal: currentSubtotal })
                });
                
                const result = await response.json();

                if (result.success) {
                    couponFeedbackEl.textContent = result.message;
                    couponFeedbackEl.className = 'form-text small text-success';
                    appliedCoupon = {
                        code: result.couponCode,
                        discountType: result.discountType,
                        amount: parseFloat(result.discountAmount)
                    };
                    // Actualizar totales del carrito
                    calculateTotals(); 
                } else {
                    couponFeedbackEl.textContent = result.message || "Error al aplicar el cupón.";
                    couponFeedbackEl.className = 'form-text small text-danger';
                }
            } catch (error) {
                console.error("Error al aplicar cupón:", error);
                couponFeedbackEl.textContent = 'Error de conexión al intentar aplicar el cupón.';
                couponFeedbackEl.className = 'form-text small text-danger';
            }
        });
    }
    
    // Modificar calculateTotals para incluir descuento del cupón
    function calculateTotals() {
        let subtotal = 0;
        cart.forEach(item => subtotal += item.quantity * item.price);
        
        let discountAmount = 0;
        if (appliedCoupon) {
            if (appliedCoupon.discountType === 'percent') {
                discountAmount = subtotal * (appliedCoupon.amount / 100);
            } else if (appliedCoupon.discountType === 'fixed_cart') {
                discountAmount = appliedCoupon.amount;
            }
            discountAmount = Math.min(discountAmount, subtotal); // El descuento no puede ser mayor que el subtotal
        }

        const total = Math.max(0, subtotal - discountAmount);

        cartSubtotalEl.text(subtotal.toFixed(2));
        
        // Mostrar descuento si existe
        const cartFooter = cartTotalEl.closest('.card-footer'); // Encontrar el card-footer
        let discountRow = cartFooter.find('#cartDiscountRow'); // Buscar la fila de descuento

        if (discountAmount > 0 && appliedCoupon) {
            const discountText = `-${discountAmount.toFixed(2)}`;
            if (discountRow.length === 0) {
                // Crear la fila de descuento si no existe (antes del total)
                cartTotalEl.closest('.d-flex').before(`
                    <div class="d-flex justify-content-between text-danger" id="cartDiscountRow">
                        <span>Descuento (${appliedCoupon.code}):</span>
                        <span id="cartDiscountAmount">${discountText}</span>
                    </div>
                `);
            } else {
                 discountRow.find('#cartDiscountAmount').text(discountText);
                 discountRow.find('span:first-child').text(`Descuento (${appliedCoupon.code}):`);
                 discountRow.show();
            }
        } else {
            if (discountRow.length > 0) {
                discountRow.hide(); // Ocultar si no hay descuento
            }
        }
        cartTotalEl.text(total.toFixed(2));
    }


    $('#processSaleBtn').on('click', async function() { // Convertido a async para el fetch
        if (cart.length === 0) {
            // Swal.fire('Carrito Vacío', 'Añade productos al carrito.', 'warning');
            $('#productSearch').focus();
            Swal.fire({
                position: "top-end",
                icon: "warning",
                title: "Carrito Vacío",
                showConfirmButton: false,
                toast: true, 
                theme:"dark",
                timer: 1500
            });
            return;
        }
        // if (!currentCustomerId) {
        //     // Opcional: hacer focus en el input de búsqueda de cliente
        //     $('#customerSearchInput').focus();
        //     Swal.fire({
        //         position: "top-end",
        //         icon: "warning",
        //         title: "Cliente no seleccionado",
        //         showConfirmButton: false,
        //         toast: true, 
        //         theme:"dark",
        //         timer: 1500
        //     });
        //     return;
        // }
        
        const saleData = {
            customerId: currentCustomerId ?? 0,
            cart: cart,
            saleDate: $('#saleDate').val(),
            saleType: $('#saleType').val(),
            paymentMethod: $('#paymentMethod').val(),
            paymentTitle: $('#paymentMethod :selected').text(),
            couponCode: appliedCoupon ? appliedCoupon.code : null, // Enviar código del cupón aplicado
            customerNote: $('#customerNote').val().trim(),
            billing: {}, // Objeto para datos de facturación
            shipping: {} // Objeto para datos de envío (se usará más adelante)
        };

        // Poblar datos de facturación y envío
        if (currentCustomerBilling && currentCustomerBilling.id === currentCustomerId) {
            saleData.billing = {
                first_name: currentCustomerBilling.first_name || '',
                last_name: currentCustomerBilling.last_name || '',
                address_1: currentCustomerBilling.billing_address_1 || '',
                // address_2: currentCustomerBilling.billing_address_2 || '', // Eliminado
                city: currentCustomerBilling.billing_city || '',
                state: currentCustomerBilling.billing_state || '',
                postcode: currentCustomerBilling.billing_postcode || '',
                country: currentCustomerBilling.billing_country || '',
                email: currentCustomerBilling.email || '',
                phone: currentCustomerBilling.phone || currentCustomerBilling.billing_phone || ''
            };
            // Por ahora, si no hay shipping diferente, shipping es igual a billing
            saleData.shipping = { ...saleData.billing }; 
        } else if (currentCustomerId === 0 && cart.length > 0) { 
            console.warn("Procesando venta para cliente invitado. Se podrían requerir datos de facturación/envío en el modal del TPV en el futuro.");
            // Para un cliente invitado, los campos de billing/shipping podrían estar vacíos
            // o podrías tener un formulario simple para capturarlos si es necesario.
            // Por ahora, se enviarán vacíos y WooCommerce/admin pueden manejarlos.
        }


        if (saleData.saleType === 'suscripcion') {
            saleData.subscriptionTitle = $('#subscriptionTitle').val().trim();
            saleData.subscriptionExpiry = $('#subscriptionExpiry').val();
            if (!saleData.subscriptionTitle || !saleData.subscriptionExpiry) {
                //  Swal.fire('Datos incompletos', 'Para suscripciones, el título y la fecha de vencimiento son obligatorios.', 'warning');
                Swal.fire({
                    position: "top-end",
                    icon: "warning",
                    title: "'Datos incompletos, para suscripciones",
                    showConfirmButton: false,
                    toast: true, 
                    theme:"dark",
                    timer: 1500
                });
                 return;
            }
        }
        
        if (!saleData.paymentMethod) {
            // Swal.fire('Método de pago no seleccionado', 'Por favor, selecciona un método de pago.', 'warning');
            Swal.fire({
                position: "top-end",
                icon: "warning",
                title: "Método de pago no seleccionado",
                showConfirmButton: false,
                toast: true, 
                theme:"dark",
                timer: 1500
            });
            return;
        }

        console.log("Procesando Venta - Datos a enviar:", saleData);
        // return true;
        $(this).prop('disabled', true).html('<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Procesando...');

        try {
            const response = await fetch('/api/process-sale', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(saleData)
            });
            const result = await response.json();

            if (result.success) {
                // Swal.fire('Venta Procesada', result.message || 'La venta se ha procesado correctamente.', 'success');
                Swal.fire({
                    position: "top-end",
                    icon: "success",
                    title: "La venta se ha procesado correctamente",
                    showConfirmButton: false,
                    toast: true, 
                    theme:"dark",
                    timer: 1500
                });
                // Limpiar carrito, resetear campos, etc.
                cart = [];
                appliedCoupon = null;
                currentCustomerId = null; // Resetear cliente
                currentCustomerBilling = null
                // Resetear UI del cliente
                $('#selectedCustomerArea').addClass('d-none');
                $('#customerSearchArea').removeClass('d-none');
                $('#customerSearchInput').val('');
                $('#customerSearchResults').empty().hide();

                updateCartUI(); // Esto llamará a calculateTotals que quitará el descuento
                $('#couponCode').val('');
                $('#couponFeedback').text('').attr('class', 'form-text small'); // Resetear feedback
                $('#customerNote').val('');
                $('#saleType').val('directa'); // Resetear tipo de venta
                if(subscriptionDetailsSection) subscriptionDetailsSection.style.display = 'none'; // Ocultar detalles de suscripción
                $('#subscriptionTitle').val('');
                $('#subscriptionExpiry').val('');
                // Resetear método de pago si es necesario, o dejarlo para la siguiente venta
                // $('#paymentMethod').val(''); 
            } else {
                Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error en la Venta', text: result.message || 'No se pudo procesar la venta.', showConfirmButton: false, timer: 3000 });
            }
        } catch (error) {
            console.error('Error al procesar venta:', error);
            Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error de Conexión', text: 'No se pudo conectar con el servidor.', showConfirmButton: false, timer: 3000 });
        } finally {
            $(this).prop('disabled', false).text('Finalizar Venta');
        }
    });

    if ($('#usersTable').length) {
        $('#usersTable').DataTable({
            responsive: true,
            processing: true, // Muestra indicador de carga
            serverSide: true, // Activa procesamiento del lado del servidor
            ajax: {
                url: '/api/users/dt', // Endpoint que creamos en Node.js
                type: 'POST', // Usar POST para enviar parámetros de DataTables
                // Podrías añadir un manejador de errores aquí si es necesario
                // error: function(xhr, error, thrown) { ... }
            },
            columns: [
                { 
                    data: 'avatar_url', 
                    orderable: false, 
                    searchable: false, 
                    render: function(data, type, row) {
                        return `<img src="${data || '/img/avatar_placeholder.png'}" alt="Avatar" class="rounded-circle" style="width: 32px; height: 32px; object-fit: cover;">`;
                    }
                },
                { data: 'id' },
                { data: 'display_name' },
                { data: 'username' }, // Corresponde a 'user_login' en WP
                { data: 'email' },
                { data: 'phone', render: function(data, type, row) { return data || '-'; } },
                { 
                    data: 'roles', 
                    orderable: false, // Roles puede ser un array, difícil de ordenar directamente en DB
                    searchable: false,
                    render: function(data, type, row) {
                        return data && Array.isArray(data) && data.length > 0 ? data.join(', ') : '-';
                    } 
                },
                { // Columna de Acciones
                    data: null, // No se mapea a un campo de datos específico
                    orderable: false,
                    searchable: false,
                    render: function(data, type, row) {
                        let buttons = `<button class="btn btn-sm btn-info view-user-sales-btn me-1" data-user-id="${row.id}" data-user-name="${row.display_name}" title="Ver Ventas del Usuario"><i class="bi bi-receipt"></i></button>`;
                        buttons += `<button class="btn btn-sm btn-danger delete-user-btn" data-user-id="${row.id}" data-user-name="${row.display_name}" title="Eliminar Usuario"><i class="bi bi-trash"></i></button>`;
                        // Podrías añadir un botón de editar aquí si la funcionalidad se implementa para esta tabla
                        // buttons += `<button class="btn btn-sm btn-warning edit-user-btn me-1" data-user-id="${row.id}" title="Editar Usuario"><i class="bi bi-pencil-square"></i></button>`;
                        return buttons;
                    }
                },
                // Nuevas columnas para historial de compras
                { data: 'total_orders', title: 'Pedidos', defaultContent: '0' }, // Añadir título aquí si no está en <thead>
                { data: 'total_revenue', title: 'Total Gastado', defaultContent: '0.00', render: function(data,type,row){ return `Bs.${parseFloat(data || 0).toFixed(2)}`; } },
                { data: 'avg_order_value', title: 'Prom. Pedido', defaultContent: '0.00', render: function(data,type,row){ return `Bs.${parseFloat(data || 0).toFixed(2)}`; } }
            ],
            language: { 
                url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json',
                processing: "Procesando...", // Mensaje de carga
            },
            // Podrías querer definir el ordenamiento inicial si es necesario
            // order: [[1, 'asc']] // Ordenar por ID ascendentemente por defecto, por ejemplo
        });
    }

    // Lógica para eliminar usuario desde la tabla de usuarios
    $('#usersTable').on('click', '.delete-user-btn', function() {
        const userId = $(this).data('userId');
        const userName = $(this).data('userName') || 'este usuario';
        const row = $(this).closest('tr');

        Swal.fire({
            title: `¿Estás seguro de eliminar a ${userName}?`,
            text: "Esta acción no se puede revertir. Se podrían reasignar las entradas de este usuario a otro.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            theme: "dark" // Mantener tema oscuro para el modal de confirmación
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    const response = await fetch(`/api/users/${userId}`, {
                        method: 'DELETE',
                        headers: {
                            // Si necesitas enviar un token CSRF u otra cabecera, añádelo aquí
                            // 'X-CSRF-TOKEN': 'tu_token_csrf_si_lo_usas'
                        }
                    });
                    
                    const responseData = await response.json();

                    if (response.ok && responseData.success) {
                        Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'success', title: 'Eliminado', text: responseData.message || `${userName} ha sido eliminado.`, showConfirmButton: false, timer: 2500 });
                        // Eliminar la fila de DataTables
                        $('#usersTable').DataTable().row(row).remove().draw();
                    } else {
                        Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error', text: responseData.message || 'No se pudo eliminar el usuario.', showConfirmButton: false, timer: 3000 });
                    }
                } catch (error) {
                    console.error('Error al intentar eliminar usuario:', error);
                    Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error de Red', text: 'No se pudo conectar para eliminar el usuario.', showConfirmButton: false, timer: 3000 });
                }
            }
        });
    });

    // Lógica para mostrar ventas de usuario en modal
    const userSalesModal = new bootstrap.Modal(document.getElementById('userSalesModal'));
    const userSalesModalLabel = $('#userSalesModalLabel');
    const userSalesModalLoading = $('#userSalesModalLoading');
    const userSalesModalContent = $('#userSalesModalContent');
    const userSalesTableBody = $('#userSalesTableInModal tbody');
    const userSalesModalNoSales = $('#userSalesModalNoSales');
    // const userSalesModalPagination = $('#userSalesModalPagination'); // Para futura paginación

    $('#usersTable').on('click', '.view-user-sales-btn', async function() {
        const userId = $(this).data('userId');
        const userName = $(this).data('userName') || 'Usuario';

        userSalesModalLabel.text(`Ventas de ${userName} (ID: ${userId})`);
        userSalesTableBody.empty(); // Limpiar tabla anterior
        userSalesModalLoading.show();
        userSalesModalContent.hide();
        userSalesModalNoSales.hide();
        // userSalesModalPagination.empty(); // Limpiar paginación anterior

        userSalesModal.show();
        console.log(`[TVP-POS DEBUG] main.js - view-user-sales-btn - Fetching sales for user ID: ${userId}`);

        try {
            // Podríamos añadir parámetros de paginación aquí si el modal lo soporta
            const response = await fetch(`/api/users/${userId}/sales?per_page=100`); // Obtener hasta 100 ventas
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Error ${response.status} al cargar ventas del usuario`);
            }
            const salesResult = await response.json();
            console.log(`[TVP-POS DEBUG] main.js - view-user-sales-btn - Sales data received:`, salesResult);

            userSalesModalLoading.hide();
            if (salesResult.data && salesResult.data.length > 0) {
                salesResult.data.forEach(sale => {
                    const saleRow = `<tr>
                        <td><a href="/wp-admin/admin.php?page=wc-orders&action=edit&id=${sale.id}" target="_blank">#${sale.id}</a></td>
                        <td>${new Date(sale.date_created).toLocaleDateString()}</td>
                        <td><span class="badge bg-${getBootstrapStatusColor(sale.status)}">${sale.status}</span></td>
                        <td>Bs.${parseFloat(sale.total).toFixed(2)}</td>
                        <td><a href="/wp-admin/admin.php?page=wc-orders&action=edit&id=${sale.id}" target="_blank" class="btn btn-sm btn-outline-primary"><i class="bi bi-eye"></i> Ver</a></td>
                    </tr>`;
                    userSalesTableBody.append(saleRow);
                });
                userSalesModalContent.show();
                // Aquí se podría implementar la lógica de paginación si salesResult incluye totalPages > 1
            } else {
                userSalesModalNoSales.show();
            }

        } catch (error) {
            console.error('Error al obtener ventas del usuario:', error);
            userSalesModalLoading.hide();
            userSalesTableBody.html(`<tr><td colspan="5" class="text-center text-danger">Error al cargar las ventas: ${error.message}</td></tr>`);
            userSalesModalContent.show(); // Mostrar la tabla aunque sea con el error
            userSalesModalNoSales.hide();
        }
    });
    
    // Helper para colores de estado (puedes expandirlo)
    function getBootstrapStatusColor(status) {
        switch (status) {
            case 'completed': return 'success';
            case 'processing': return 'primary';
            case 'on-hold': return 'warning';
            case 'pending': return 'secondary';
            case 'cancelled': return 'danger';
            case 'refunded': return 'info';
            case 'failed': return 'danger';
            default: return 'light';
        }
    }


    const htmlElement = document.documentElement;
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeIcon = document.getElementById('themeIcon');
    const setPreferredTheme = (theme) => {
        htmlElement.setAttribute('data-bs-theme', theme);
        if (themeIcon) themeIcon.classList.replace(theme === 'dark' ? 'bi-sun-fill' : 'bi-moon-stars-fill', theme === 'dark' ? 'bi-moon-stars-fill' : 'bi-sun-fill');
        localStorage.setItem('theme', theme);
    };
    const storedTheme = localStorage.getItem('theme');
    const preferredTheme = storedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setPreferredTheme(preferredTheme);
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            setPreferredTheme(htmlElement.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark');
        });
    }
    
    // --- LÓGICA DE BÚSQUEDA DE PRODUCTOS AJAX ---
    const productSearchInput = $('#productSearch');
    const productSearchBtn = $('#productSearchBtn');
    const productListArea = $('#productListArea');

    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    }

    function renderProductCard(product) {
        let priceHtml = `<p class="card-text">Precio: ${product.price}</p>`;
        let variationsHtml = '';
        if (product.type === 'variable' && product.variations_data && product.variations_data.length > 0) {
            let minPrice = Infinity;
            product.variations_data.forEach(v => { const price = parseFloat(v.price); if (!isNaN(price) && price < minPrice) minPrice = price; });
            priceHtml = `<p class="card-text"><small class="text-muted">Desde: ${isFinite(minPrice) ? minPrice : 'N/A'}</small></p>`;
            variationsHtml = '<ul class="list-group list-group-flush">';
            product.variations_data.forEach(variation => {
                const variationName = variation.attributes ? Object.values(variation.attributes).join(' - ') : 'Variación';
                variationsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">${variationName} - ${variation.price}<span><span class="badge bg-success me-2">En stock</span><button class="btn btn-sm btn-outline-primary add-to-cart-btn" data-product-id="${product.id}" data-variation-id="${variation.id}" data-name="${product.name} (${variationName})" data-price="${variation.price}">Añadir</button></span></li>`;
            });
            variationsHtml += '</ul>';
        }
        const imageHtml = product.image_url ? `<img src="${product.image_url}" class="card-img-top" alt="${product.name}" style="max-width: 100%; max-height: 80px; width: auto; height: auto; object-fit: contain;">` : `<svg class="bd-placeholder-img card-img-top" width="100%" height="80" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Placeholder: ${product.name}" preserveAspectRatio="xMidYMid slice" focusable="false"><title>${product.name}</title><rect width="100%" height="100%" fill="#868e96"></rect><text x="50%" y="50%" fill="#dee2e6" dy=".3em">Imagen</text></svg>`;
        const addToCartButtonHtml = product.type !== 'variable' ? `<button class="btn btn-sm btn-primary add-to-cart-btn" data-product-id="${product.id}" data-name="${product.name}" data-price="${product.price}">Añadir</button>` : '';
        return `<div class="card mb-3 product-card"><div class="card-body"><div class="row"><div class="col-md-2 text-center d-flex align-items-center justify-content-center">${imageHtml}</div><div class="col-md-10"><h5 class="card-title">${product.name}</h5>${priceHtml}${variationsHtml}${product.type !== 'variable' ? `<div class="d-flex justify-content-end align-items-center"><span class="badge bg-success me-2">En stock</span>${addToCartButtonHtml}</div>` : ''}</div></div></div></div>`;
    }

    function displayProducts(products) {
        productListArea.empty();
        if (products && products.length > 0) products.forEach(product => productListArea.append(renderProductCard(product)));
        else productListArea.append('<p class="no-products-message">No se encontraron productos.</p>');
    }
    
    function displayProductError(message) {
        productListArea.empty();
        productListArea.append(`<div class="alert alert-danger">${message}</div>`);
    }

    async function fetchProducts(searchTerm = '') {
        const featured = !searchTerm;
        productListArea.html('<p>Buscando productos...</p>');
        try {
            const response = await fetch(`/api/products?search=${encodeURIComponent(searchTerm)}&featured=${featured}`);
            if (!response.ok) { const errorData = await response.json().catch(() => ({ error: 'Error desconocido' })); throw new Error(errorData.error || `Error ${response.status}`); }
            const data = await response.json();
            displayProducts(data.products);
        } catch (error) { console.error('Error al buscar productos:', error); displayProductError(error.message || 'No se pudieron cargar los productos.'); }
    }

    if (productSearchInput.length && productListArea.length) {
        const debouncedSearchProducts = debounce(() => fetchProducts(productSearchInput.val()), 500);
        productSearchInput.on('input', debouncedSearchProducts);
        productSearchBtn.on('click', () => fetchProducts(productSearchInput.val()));
    }

    // --- LÓGICA DE CLIENTES (Solo si los elementos existen en la página) ---
    let intlTelInputInstance; // Instancia para intl-tel-input

    if ($('#customerModal').length && $('#customerSearchInput').length && $('#customerSearchResults').length && $('#selectedCustomerArea').length) {
        const customerSearchInput = $('#customerSearchInput');
        const customerSearchResultsArea = $('#customerSearchResults');
        const addCustomerBtn = $('#addCustomerBtn');
        const customerModalEl = document.getElementById('customerModal'); // Guardar referencia para evitar múltiples getElementById
        const customerModal = new bootstrap.Modal(customerModalEl);
        const customerModalLabel = $('#customerModalLabel');
        const customerForm = $('#customerForm');
        const customerIdInput = $('#customerId');
        const customerFirstNameInput = $('#customerFirstName');
        const customerLastNameInput = $('#customerLastName');
        const customerEmailInput = $('#customerEmail');
        const customerPhoneInput = $('#customerPhone'); // Este es el input original
        const customerPhoneField = document.querySelector("#customerPhone"); // Para intl-tel-input
        const customerModalAvatar = $('#customerModalAvatar'); // Avatar en el modal

        // Nuevos campos de facturación
        const customerBillingAddress1Input = $('#customerBillingAddress1');
        const customerBillingCityInput = $('#customerBillingCity');
        const customerBillingStateInput = $('#customerBillingState');
        // const customerBillingPostcodeİnput = $('#customerBillingPostcode');
        const customerBillingCountryInput = $('#customerBillingCountry');

        const saveCustomerBtn = $('#saveCustomerBtn');
        const selectedCustomerArea = $('#selectedCustomerArea');
        const customerSearchArea = $('#customerSearchArea');
        const selectedCustomerAvatar = $('#selectedCustomerAvatar');
        const selectedCustomerName = $('#selectedCustomerName');
        const selectedCustomerEmail = $('#selectedCustomerEmail');
        const editCustomerBtn = $('#editCustomerBtn');
        const changeCustomerBtn = $('#changeCustomerBtn');

        function renderCustomerSearchResultItem(customer) {
            return `<a href="#" class="list-group-item list-group-item-action select-customer-btn" data-customer-id="${customer.id}" data-customer-name="${customer.display_name}" data-customer-email="${customer.email || ''}" data-customer-phone="${customer.billing_phone || ''}" data-customer-first-name="${customer.first_name || ''}" data-customer-last-name="${customer.last_name || ''}">
                        ${customer.display_name} <small class="text-muted d-block">${customer.email || 'Sin email'}</small>
                    </a>`;
        }

        function displayCustomerSearchResults(customers) {
            customerSearchResultsArea.empty();
            if (customers && customers.length > 0) {
                customers.forEach(customer => customerSearchResultsArea.append(renderCustomerSearchResultItem(customer)));
            } else {
                customerSearchResultsArea.append('<p class="text-muted p-2">No se encontraron clientes.</p>');
            }
        }
        
        function displaySelectedCustomerCard(customer) {
            currentCustomerId = customer.id;
            // Asegurarse de que currentCustomerBilling tenga todos los datos necesarios
            // Esto es crucial para cuando se edite el cliente.
            // Si 'customer' viene de la búsqueda, puede que no tenga los datos de billing.
            // Idealmente, al seleccionar, se debería hacer un fetch completo del cliente si es necesario.
            currentCustomerBilling = customer; 

            selectedCustomerName.text(customer.name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim());
            selectedCustomerEmail.text(customer.email || 'N/A'); // Mostrar email en la tarjeta
            // selectedCustomerAvatar.attr('src', customer.avatar_url || '/img/avatar_placeholder.png'); 
            customerSearchArea.addClass('d-none');
            selectedCustomerArea.removeClass('d-none');
            customerSearchResultsArea.empty().hide(); 
        }

        async function fetchCustomers(searchTerm) {
            if (!searchTerm || searchTerm.length < 2) { // No buscar con menos de 2 caracteres
                customerSearchResultsArea.empty().hide();
                return;
            }
            customerSearchResultsArea.html('<p class="text-muted p-2">Buscando clientes...</p>').show();
            try {
                const response = await fetch(`/api/customers/search?search=${encodeURIComponent(searchTerm)}`);
                if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(errorData.error || `Error ${response.status}`); }
                const result = await response.json();
                displayCustomerSearchResults(result.data);
            } catch (error) {
                console.error('Error al buscar clientes:', error);
                customerSearchResultsArea.html(`<p class="text-danger p-2">${error.message || 'Error al buscar clientes.'}</p>`).show();
            }
        }

        const debouncedCustomerSearch = debounce(() => fetchCustomers(customerSearchInput.val()), 500);
        customerSearchInput.on('input', debouncedCustomerSearch);

        customerSearchResultsArea.on('click', '.select-customer-btn', async function(e) { // Convertido a async
            e.preventDefault();
            const customerId = $(this).data('customerId');
            console.log('[TVP-POS DEBUG] main.js - .select-customer-btn - Customer ID del data attribute:', customerId);
            // Aquí sería ideal hacer un fetch para obtener todos los datos del cliente, incluyendo billing
            try {
                // Simulamos que tenemos todos los datos por ahora, o que la búsqueda ya los trae
                // En un caso real: const fullCustomerData = await fetch(`/api/customers/${customerId}`).then(res => res.json());
                // displaySelectedCustomerCard(fullCustomerData);
                const customerSummary = { // Datos que vienen del botón de búsqueda
                    id: customerId,
                    name: $(this).data('customerName'),
                    email: $(this).data('customerEmail'),
                    phone: $(this).data('customerPhone'), // Este es el billing_phone de WP
                    first_name: $(this).data('customerFirstName'),
                    last_name: $(this).data('customerLastName'),
                    // Aquí faltarían los datos de billing si no vienen de la búsqueda
                    billing_address_1: $(this).data('customerBillingAddress1') || '',
                    billing_city: $(this).data('customerBillingCity') || '',
                    billing_state: $(this).data('customerBillingState') || '',
                    billing_postcode: $(this).data('customerBillingPostcode') || '',
                    billing_country: $(this).data('customerBillingCountry') || '',
                    avatar_url: $(this).data('customerAvatarUrl') || '' // Asumiendo que la búsqueda ya podría traerlo
                };
                
                // Hacemos fetch para obtener el cliente completo
                const response = await fetch(`/api/customers/${customerId}`);
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: 'Error desconocido al cargar cliente' }));
                    throw new Error(errorData.error || `Error ${response.status}`);
                }
                const fullCustomerData = await response.json();
                console.log('[TVP-POS DEBUG] main.js - .select-customer-btn - Datos completos del cliente (fullCustomerData):', fullCustomerData);
                
                console.log('[TVP-POS DEBUG] main.js - .select-customer-btn - currentCustomerBilling ANTES de displaySelectedCustomerCard:', currentCustomerBilling);
                currentCustomerBilling = fullCustomerData; // Guardar el objeto completo
                console.log('[TVP-POS DEBUG] main.js - .select-customer-btn - currentCustomerBilling DESPUÉS de asignar fullCustomerData:', currentCustomerBilling);
                displaySelectedCustomerCard(fullCustomerData);


            } catch (error) {
                console.error("Error al obtener detalles completos del cliente:", error);
                Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error', text: 'No se pudieron cargar los detalles completos del cliente.', showConfirmButton: false, timer: 3000 });
            }
        });
        
        // Inicializar intl-tel-input cuando el modal se muestra
        customerModalEl.addEventListener('shown.bs.modal', () => {
            if (customerPhoneField) {
                if (intlTelInputInstance) { // Si ya existe, destruir para reinicializar (útil si se abre y cierra varias veces)
                    // intlTelInputInstance.destroy(); // Puede no ser necesario si se maneja bien el setNumber
                }
                intlTelInputInstance = window.intlTelInput(customerPhoneField, {
                    initialCountry: "auto",
                    geoIpLookup: function(callback) {
                        fetch("https://ipapi.co/json")
                          .then(function(res) { return res.json(); })
                          .then(function(data) { callback(data.country_code); })
                          .catch(function() { callback("us"); }); // Fallback a US
                    },
                    utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.21/js/utils.js",
                    separateDialCode: true,
                    preferredCountries: ['bo', 'us', 'es', 'ar', 'cl', 'pe', 'br'] // Bolivia primero
                });

                // Si estamos editando y tenemos un currentCustomerBilling con teléfono, lo establecemos
                if (customerIdInput.val() && currentCustomerBilling && currentCustomerBilling.phone) {
                    intlTelInputInstance.setNumber(currentCustomerBilling.phone);
                } else if (customerIdInput.val() && currentCustomerBilling && currentCustomerBilling.billing_phone) { // Campo de WooCommerce
                     intlTelInputInstance.setNumber(currentCustomerBilling.billing_phone);
                }
            }
        });


        addCustomerBtn.on('click', function() {
            customerModalLabel.text('Añadir Nuevo Cliente');
            customerForm[0].reset();
            customerIdInput.val(''); 
            currentCustomerBilling = {}; // Resetear datos de cliente para nuevo
            if (intlTelInputInstance) {
                intlTelInputInstance.setNumber(""); // Limpiar campo de teléfono
            }
            // Los campos de facturación se resetean con customerForm[0].reset()
            // customerModal.show();
        });

        editCustomerBtn.on('click', async function() { // Convertido a async
            console.log('[TVP-POS DEBUG] main.js - editCustomerBtn - currentCustomerId al entrar:', currentCustomerId);
            customerModalLabel.text('Editar Cliente');
        
            if (currentCustomerId) { // Verificar que tengamos un ID de cliente
                try {
                    // Fetch de los datos completos del cliente usando currentCustomerId
                    const response = await fetch(`/api/customers/${currentCustomerId}`);
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ error: 'Error desconocido al cargar datos del cliente' }));
                        throw new Error(errorData.error || `Error ${response.status} al cargar datos para editar`);
                    }
                    const customerToEdit = await response.json();
                    console.log('[TVP-POS DEBUG] main.js - editCustomerBtn - Datos del cliente obtenidos para editar:', customerToEdit);
        
                    if (customerToEdit && customerToEdit.id) {
                        currentCustomerBilling = customerToEdit; // Actualizar la variable global por si se usa en otro lado, aunque trabajamos con customerToEdit
        
                        customerIdInput.val(customerToEdit.id);
                        customerFirstNameInput.val(customerToEdit.first_name || '');
                        customerLastNameInput.val(customerToEdit.last_name || '');
                        customerEmailInput.val(customerToEdit.email || '');
                        
                        // Cargar datos de facturación
                        customerBillingAddress1Input.val(customerToEdit.billing_address_1 || '');
                        customerBillingCityInput.val(customerToEdit.billing_city || '');
                        customerBillingStateInput.val(customerToEdit.billing_state || '');
                        // customerBillingPostcodeİnput.val(customerToEdit.billing_postcode || ''); // Si se reactiva
                        customerBillingCountryInput.val(customerToEdit.billing_country || 'Bolivia');
        
                        // Actualizar avatar en el modal al editar
                        if (customerToEdit.avatar_url) {
                            customerModalAvatar.attr('src', customerToEdit.avatar_url);
                        } else {
                            customerModalAvatar.attr('src', '/img/avatar_placeholder.png');
                        }
        
                        // Setear el teléfono en intl-tel-input
                        // La inicialización de intlTelInputInstance y el setNumber se manejan en 'shown.bs.modal',
                        // pero es bueno asegurar que currentCustomerBilling (que ahora es customerToEdit) tenga el teléfono.
                        if (intlTelInputInstance) {
                             intlTelInputInstance.setNumber(customerToEdit.phone || customerToEdit.billing_phone || "");
                        }
                        
                        // Bootstrap maneja el show del modal a través de data-bs-toggle, no es necesario llamarlo aquí explícitamente
                        // a menos que el data-bs-toggle no esté funcionando como se espera para este botón.
                        // Si el modal no se abre automáticamente, se podría añadir:
                        // const modalInstance = bootstrap.Modal.getInstance(customerModalEl) || new bootstrap.Modal(customerModalEl);
                        // modalInstance.show();
        
                    } else {
                         Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error al editar', text: 'No se pudieron obtener los datos completos del cliente.', showConfirmButton: false, timer: 3000 });
                         // No ocultar el modal aquí, ya que el usuario está intentando editar.
                    }
        
                } catch (error) {
                    console.error("Error en editCustomerBtn al hacer fetch del cliente:", error);
                    Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error', text: 'No se pudieron cargar los datos del cliente para editar: ' + error.message, showConfirmButton: false, timer: 3500 });
                    // No ocultar el modal aquí.
                }
            } else {
                Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error al editar', text: 'No hay un cliente seleccionado (falta ID).', showConfirmButton: false, timer: 3000 });
                // No ocultar el modal aquí.
            }
        });

        // Al abrir el modal para un nuevo cliente o para editar
        customerModalEl.addEventListener('show.bs.modal', function (event) {
            // Si el trigger es el botón de "Añadir Nuevo Cliente" o no hay ID de cliente, es nuevo.
            const button = event.relatedTarget; // Botón que disparó el modal
            if ((button && button.id === 'addCustomerBtn') || !customerIdInput.val()) {
                 customerModalLabel.text('Añadir Nuevo Cliente');
                 customerForm[0].reset();
                 customerIdInput.val(''); 
                 currentCustomerBilling = {}; 
                 if (intlTelInputInstance) {
                     intlTelInputInstance.setNumber(""); 
                 }
                 customerModalAvatar.attr('src', '/img/avatar_placeholder.png'); // Placeholder para nuevo cliente
            }
            // La lógica de 'shown.bs.modal' se encarga de inicializar intl-tel-input y setear el número si es edición.
        });
        
        changeCustomerBtn.on('click', function() {
            currentCustomerId = null;
            currentCustomerBilling = null; // Limpiar datos del cliente
            selectedCustomerArea.addClass('d-none');
            currentCustomerId = null;
            selectedCustomerArea.addClass('d-none');
            customerSearchArea.removeClass('d-none');
            customerSearchInput.val('').focus();
            customerSearchResultsArea.empty().hide();
        });

        saveCustomerBtn.on('click', async function() {
            const id = customerIdInput.val();
            const customerData = {
                first_name: customerFirstNameInput.val().trim(),
                last_name: customerLastNameInput.val().trim(),
                email: customerEmailInput.val().trim(),
                phone: '', // Se llenará con intlTelInputInstance
                role: 'customer', // Por defecto
                
                // Datos de facturación
                billing_address_1: customerBillingAddress1Input.val().trim(),
                billing_city: customerBillingCityInput.val().trim(),
                billing_state: customerBillingStateInput.val().trim(),
                // billing_postcode: customerBillingPostcodeİnput.val().trim(),
                billing_country: customerBillingCountryInput.val().trim()
            };

            if (intlTelInputInstance && intlTelInputInstance.isValidNumber()) {
                customerData.phone = intlTelInputInstance.getNumber(); // Obtener número en formato E.164
            } else if (intlTelInputInstance && customerPhoneInput.val().trim() !== '') {
                // Si no es válido pero hay algo, quizás advertir o guardar lo que hay?
                // Por ahora, si no es válido, no se guarda el teléfono o se guarda vacío.
                // Opcionalmente, podrías permitir guardar si no es estrictamente válido pero el usuario insiste.
                // customerData.phone = customerPhoneInput.val().trim(); // Guardar lo que hay si no es válido
                 Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'warning', title: 'Teléfono Inválido', text: 'El número de teléfono no parece ser válido. Por favor, corrígelo.', showConfirmButton: false, timer: 3000 });
                 $(this).prop('disabled', false).text('Guardar Cliente');
                 return; // No continuar si el teléfono es inválido y se requiere que sea válido
            }


            if (!customerData.first_name || !customerData.email) {
                Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'warning', title: 'Campos incompletos', text: 'Nombre y Email son obligatorios.', showConfirmButton: false, timer: 3000 });
                return;
            }

            let url = '/api/customers';
            let method = 'POST';
            if (id) { // Si hay ID, es una actualización
                url = `/api/customers/${id}`;
                method = 'PUT';
            }

            try {
                $(this).prop('disabled', true).html('<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Guardando...');
                const response = await fetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(customerData)
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || `Error ${response.status}`);
                
                Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'success', title: 'Éxito', text: `Cliente ${id ? 'actualizado' : 'creado'} correctamente.`, showConfirmButton: false, timer: 2000 });
                customerModal.hide();
                // 'result' debería contener todos los datos del cliente, incluyendo los de facturación actualizados
                currentCustomerBilling = result.data || result; // Actualizar el cliente actual con la respuesta del servidor
                displaySelectedCustomerCard(currentCustomerBilling); 

            } catch (error) {
                console.error('Error al guardar cliente:', error);
                Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error', text: error.message || 'No se pudo guardar el cliente.', showConfirmButton: false, timer: 3000 });
            } finally {
                $(this).prop('disabled', false).text('Guardar Cliente');
            }
        });

    } // Cierre del if ($('#customerModal').length && ...)

    // Lógica para mostrar/ocultar contraseña en el login
    const togglePasswordBtn = document.getElementById('togglePasswordVisibility');
    const passwordInput = document.getElementById('password');
    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', function () {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            // Cambiar el icono del botón
            const icon = this.querySelector('i');
            icon.classList.toggle('bi-eye');
            icon.classList.toggle('bi-eye-slash');
        });
    }

    // Lógica para mostrar/ocultar URL de WordPress en el login
    const toggleWpUrlBlockBtn = document.getElementById('toggleWpUrlBlockVisibility');
    const wpUrlBlockWrapper = document.getElementById('wpUrlBlockWrapper');

    if (toggleWpUrlBlockBtn && wpUrlBlockWrapper) {
        // Por defecto, el bloque es visible, así que el botón debe permitir ocultarlo.
        // Si quisiéramos que inicie oculto, añadiríamos la clase 'd-none' al wrapper en el HTML
        // y el icono inicial del botón sería 'bi-eye-slash'.

        toggleWpUrlBlockBtn.addEventListener('click', function() {
            const icon = this.querySelector('i');
            if (wpUrlBlockWrapper.classList.contains('d-none')) {
                // Mostrar bloque
                wpUrlBlockWrapper.classList.remove('d-none');
                icon.classList.remove('bi-eye-slash');
                icon.classList.add('bi-eye');
            } else {
                // Ocultar bloque
                wpUrlBlockWrapper.classList.add('d-none');
                icon.classList.remove('bi-eye');
                icon.classList.add('bi-eye-slash');
            }
        });
    }

    console.log("main.js cargado y lógica de UI inicializada.");
});
