$(document).ready(function() {
    // ... (código existente de DataTables, Carrito, Tema) ...
    // Inicializar DataTables para la tabla de ventas
    if ($('#salesTable').length) {
        $('#salesTable').DataTable({ // No es necesario guardar la instancia aquí si no hay listeners externos
            responsive: true,
            processing: true,
            serverSide: true,
            ajax: {
                url: '/api/sales/dt', // Endpoint que creamos en Node.js
                type: 'POST',
                // Ya no se necesita la función data para phoneSearch
            },
            columns: [
                { 
                    data: null, // Columna combinada ID / Fecha
                    render: function(data, type, row) {
                        const idHtml = `#${row.id}`;
                        const dateHtml = row.date_created ? new Date(row.date_created).toLocaleString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A';
                        return `${idHtml}<br><small class="text-muted">${dateHtml}</small>`;
                    },
                    orderable: true, // Podríamos querer ordenar por fecha o ID, DataTables usará el primer 'data' si no se especifica 'orderData'
                                   // Para ordenar por fecha, podríamos necesitar especificar orderData: 'date_created'
                                   // o asegurar que el backend ordene por fecha si esta columna es la de ordenamiento.
                                   // Por ahora, el ordenamiento por defecto es por fecha descendente (ver 'order: [[1, 'desc']]' abajo, que ahora será [[0, 'desc']] o ajustado)
                },
                { 
                    data: 'customer_name', 
                    render: function(data, type, row) {
                        let displayName = data || (row.customer_id ? `Cliente ID: ${row.customer_id}` : 'Invitado');
                        if (row.billing_phone) {
                            displayName += `<br><small class="text-muted"><i class="bi bi-telephone-fill me-1"></i>${row.billing_phone}</small>`;
                        } else {
                            displayName += `<br><small class="text-muted">Tel: N/A</small>`;
                        }
                        return displayName;
                    }
                },
                { data: 'products_summary', orderable: false, searchable: false, defaultContent: '-' },
                { 
                    data: null, // Columna combinada Total / Estado
                    render: function(data, type, row) {
                        const totalHtml = `${row.currency || ''} ${parseFloat(row.total || 0).toFixed(2)}`;
                        const statusHtml = `<span class="badge bg-${getBootstrapStatusColor(row.status)}">${row.status ? row.status.replace('wc-', '') : 'desconocido'}</span>`;
                        return `${totalHtml}<br>${statusHtml}`;
                    },
                    orderable: true // Podría ordenarse por total o estado
                },
                { 
                    data: null, 
                    orderable: false, 
                    searchable: false,
                    render: function(data, type, row) {
                        let buttons = `<button class="btn btn-sm btn-info view-sale-details-btn me-1" data-order-id="${row.id}" title="Ver Detalles"><i class="bi bi-eye"></i></button>`;
                        // Actualizar el botón de imprimir para que funcione directamente
                        buttons += `<button class="btn btn-sm btn-warning print-sale-receipt-btn" data-order-id="${row.id}" title="Imprimir Ticket"><i class="bi bi-printer"></i></button>`;
                        return buttons;
                    }
                }
            ],
            language: { 
                url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json',
                processing: "Procesando...",
            },
            order: [[0, 'desc']] // Ajustar el índice de la columna de ordenamiento por defecto (antes era Fecha en índice 1, ahora ID/Fecha en índice 0)
        });
        // Ya no se necesita el listener para phoneSearch
    }

    // Lógica para mostrar detalles de venta en modal
    // SOLO si la tabla de ventas existe Y el modal existe, configuramos esta lógica
    if ($('#salesTable').length) {
        const saleDetailsModalElement = document.getElementById('saleDetailsModal');
        // console.log("[TVP-POS DEBUG] Intentando encontrar #saleDetailsModal:", saleDetailsModalElement);

        if (saleDetailsModalElement) {
            const saleDetailsModal = new bootstrap.Modal(saleDetailsModalElement);
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
                    modalSaleId.text(saleDetails.id); // Aunque no tengamos un span #modalSaleId, lo mantenemos por si se usa para el botón de imprimir.
                    modalSaleDate.text(new Date(saleDetails.date_created).toLocaleString('es-ES'));
                    
                    let customerDisplayName = 'Invitado';
                    if (saleDetails.billing_first_name || saleDetails.billing_last_name) {
                        customerDisplayName = `${saleDetails.billing_first_name || ''} ${saleDetails.billing_last_name || ''}`.trim();
                    } else if (saleDetails.customer_name) {
                        customerDisplayName = saleDetails.customer_name;
                    } else if (saleDetails.customer_id) {
                        customerDisplayName = `Cliente ID: ${saleDetails.customer_id}`;
                    }
                    modalSaleCustomer.text(customerDisplayName);
                    
                    // Referencia al nuevo span para el teléfono y se elimina el de email
                    const modalSaleCustomerPhone = $('#modalSaleCustomerPhone'); // Asegúrate que este ID exista en el HTML del modal en sales.ejs
                    if (modalSaleCustomerPhone.length) {
                        modalSaleCustomerPhone.text(saleDetails.billing_phone || '-');
                    }
                    // Ya no se usa modalSaleCustomerEmail si el HTML fue cambiado
                    // modalSaleCustomerEmail.text(saleDetails.billing_email || '-'); 
                    
                    modalSaleStatus.html(`<span class="badge bg-${getBootstrapStatusColor(saleDetails.status)}">${saleDetails.status ? saleDetails.status.replace('wc-', '') : 'desconocido'}</span>`);
                    modalSaleTotal.text(`${saleDetails.currency || ''} ${parseFloat(saleDetails.total || 0).toFixed(2)}`);
                    modalSalePaymentMethod.text(saleDetails.payment_method_title || saleDetails.payment_method || '-');

                    // Direcciones
                    modalBillingAddress.html(saleDetails.billing_address ? saleDetails.billing_address.replace(/\n/g, '<br>') : 'No disponible');
                    modalShippingAddress.html(saleDetails.shipping_address ? saleDetails.shipping_address.replace(/\n/g, '<br>') : 'No disponible');
                    
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
                    const errorHtml = `<div class="alert alert-danger">Error al cargar detalles: ${error.message}</div>`;
                    // No reemplazar todo el contenido, sino mostrar el error en un lugar específico o usar un toast.
                    // Por ahora, para simplificar, lo dejamos así, pero idealmente no se borra la estructura del modal.
                    // Una mejor aproximación sería tener un div específico para errores dentro del modal.
                    // $('#saleDetailsModalContent').html(errorHtml).show(); // Esto borra la estructura.
                    // Mejor mostrar el error en el loading o en un toast.
                    if (saleDetailsModalLoading.length) { // Si el elemento de carga existe
                        saleDetailsModalLoading.html(errorHtml).show(); // Mostrar error en el área de carga
                    } else { // Fallback si no hay elemento de carga
                         $('#saleDetailsModalContent').prepend(errorHtml).show();
                    }
                }
            });

            // Event listener para el botón de imprimir ticket
            const btnPrintTicket = document.getElementById('btnPrintTicket');
            if (btnPrintTicket) {
                btnPrintTicket.addEventListener('click', function() {
                    const orderId = modalSaleId.text(); // Obtener el ID de la venta del span
                    if (orderId) {
                        const pdfUrl = `/api/sales/${orderId}/pdf/ticket`;
                        window.open(pdfUrl, '_blank'); // Abrir PDF en nueva pestaña
                    } else {
                        console.error('No se pudo obtener el ID de la venta para imprimir el ticket.');
                        Swal.fire({
                            toast: true,
                            theme: "dark",
                            position: 'top-end',
                            icon: 'error',
                            title: 'Error',
                            text: 'No se pudo obtener el ID de la venta para imprimir.',
                            showConfirmButton: false,
                            timer: 3000
                        });
                    }
                });
            }
        } // Cierre del if (saleDetailsModalElement)

        // Event listener para el botón de imprimir ticket directamente desde la tabla
        $('#salesTable').on('click', '.print-sale-receipt-btn', function() {
            const orderId = $(this).data('orderId');
            if (orderId) {
                const pdfUrl = `/api/sales/${orderId}/pdf/ticket`;
                window.open(pdfUrl, '_blank');
            } else {
                console.error('No se pudo obtener el ID de la venta para imprimir el ticket desde la tabla.');
                Swal.fire({
                    toast: true,
                    theme: "dark",
                    position: 'top-end',
                    icon: 'error',
                    title: 'Error',
                    text: 'No se pudo obtener el ID de la venta para imprimir.',
                    showConfirmButton: false,
                    timer: 3000
                });
            }
        });
    } // Cierre del if ($('#salesTable').length)

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
                }
                // Se eliminan las 3 columnas de historial de compras para que coincida con el HTML (8 columnas)
                // { data: 'total_orders', title: 'Pedidos', defaultContent: '0' },
                // { data: 'total_revenue', title: 'Total Gastado', defaultContent: '0.00', render: function(data,type,row){ return `Bs.${parseFloat(data || 0).toFixed(2)}`; } },
                // { data: 'avg_order_value', title: 'Prom. Pedido', defaultContent: '0.00', render: function(data,type,row){ return `Bs.${parseFloat(data || 0).toFixed(2)}`; } }
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
    if ($('#usersTable').length) { // Condicionar a la existencia de la tabla de usuarios
        const userSalesModalElement = document.getElementById('userSalesModal');
        console.log("[TVP-POS DEBUG] Intentando encontrar #userSalesModal:", userSalesModalElement);

        if (userSalesModalElement) {
            const userSalesModal = new bootstrap.Modal(userSalesModalElement);
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
        } // Cierre del if (userSalesModalElement)
    } // Cierre del if ($('#usersTable').length)
    
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

            let customerDisplayNameTPV = 'Invitado';
            if (customer.billing_first_name || customer.billing_last_name) {
                customerDisplayNameTPV = `${customer.billing_first_name || ''} ${customer.billing_last_name || ''}`.trim();
            } else if (customer.name) { // 'name' podría ser display_name
                customerDisplayNameTPV = customer.name;
            } else if (customer.first_name || customer.last_name) { // Fallback a first_name/last_name si billing_ no existen
                 customerDisplayNameTPV = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
            } else if (customer.id) {
                customerDisplayNameTPV = `Cliente ID: ${customer.id}`;
            }
            selectedCustomerName.text(customerDisplayNameTPV);

            // Usar el nuevo ID para el teléfono
            const selectedCustomerPhoneEl = $('#selectedCustomerPhone'); 
            if (selectedCustomerPhoneEl.length) {
                selectedCustomerPhoneEl.text(customer.phone || customer.billing_phone || 'N/A');
            }
            // Ya no se usa selectedCustomerEmail si el HTML fue cambiado
            // selectedCustomerEmail.text(customer.email || 'N/A'); 
            
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
            // console.log("togglePasswordVisibility")
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

    // console.log("main.js cargado y lógica de UI inicializada.");

    // Lógica para la página de Mensajería Masiva WhatsApp (/whatsapp-bulk)
    const bulkWhatsappPageContainer = $('.container-fluid'); // Un contenedor general de la página para verificar si estamos en ella.
                                                        // O mejor, verificar por un elemento único de esta página, como la tabla de historial.
    
    if ($('#bulkCampaignsTable').length) { // Asumimos que si la tabla existe, estamos en la página correcta.
        const createCampaignFormContainer = $('#createCampaignFormContainer');
        const bulkWhatsappForm = $('#bulkWhatsappForm'); // Referencia al formulario
        const showCreateCampaignFormBtn = $('#showCreateCampaignFormBtn');
        const cancelCreateCampaignBtn = $('#cancelCreateCampaignBtn');
        const bulkCampaignsTableCard = $('#bulkCampaignsTable').closest('.card'); // Para ocultar/mostrar la tabla si es necesario

        const contactSourceSelect = $('#contactSource');
        const manualContactsContainer = $('#manualContactsContainer');
        const csvFileContainer = $('#csvFileContainer');
        const chatwootLabelsContainer = $('#chatwootLabelsContainer'); // Nuevo
        const chatwootLabelSelect = $('#chatwootLabelSelect'); // Nuevo
        const evolutionInstanceSelect = $('#evolutionInstance');
        const campaignMessageTextarea = $('#campaignMessage');
        const formatTextBtns = $('.format-text-btn');
        const availablePlaceholdersContainer = $('#availablePlaceholders');

        // Mostrar/ocultar formulario de creación
        showCreateCampaignFormBtn.on('click', function() {
            createCampaignFormContainer.slideDown();
            // Opcional: ocultar la tabla de historial para dar más espacio
            // bulkCampaignsTableCard.slideUp(); 
        });

        cancelCreateCampaignBtn.on('click', function() {
            createCampaignFormContainer.slideUp();
            bulkWhatsappForm[0].reset(); // Resetear el formulario al cancelar
            contactSourceSelect.trigger('change'); // Resetear visibilidad de campos condicionales
            // Opcional: mostrar la tabla de historial si se ocultó
            // bulkCampaignsTableCard.slideDown();
        });


        // Cargar instancias de Evolution API
        async function loadEvolutionInstances() {
            try {
                const response = await fetch('/api/evolution/instances');
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: 'Error desconocido al cargar instancias' }));
                    throw new Error(errorData.error || `Error ${response.status}`);
                }
                const instances = await response.json();
                evolutionInstanceSelect.empty(); // Limpiar opciones existentes (como "Cargando...")
                if (instances && instances.length > 0) {
                    instances.forEach(instanceName => {
                        evolutionInstanceSelect.append(new Option(instanceName, instanceName));
                    });
                } else {
                    evolutionInstanceSelect.append(new Option('No hay instancias activas disponibles', '', true, true));
                    evolutionInstanceSelect.prop('disabled', true);
                }
            } catch (error) {
                console.error('Error al cargar instancias de Evolution API:', error);
                evolutionInstanceSelect.empty();
                evolutionInstanceSelect.append(new Option(error.message || 'Error al cargar instancias', '', true, true));
                evolutionInstanceSelect.prop('disabled', true);
                // Podrías mostrar un Swal.fire aquí también si es un error crítico
            }
        }

        loadEvolutionInstances(); // Cargar al iniciar la página

        // Lógica para mostrar/ocultar campos de contactos manuales y de etiquetas de Chatwoot
        if (contactSourceSelect.length && manualContactsContainer.length && csvFileContainer.length && chatwootLabelsContainer.length) {
            contactSourceSelect.on('change', function() {
                const selectedSource = $(this).val();
                manualContactsContainer.hide();
                csvFileContainer.hide();
                chatwootLabelsContainer.hide();

                if (selectedSource === 'manual_list') {
                    manualContactsContainer.show();
                } else if (selectedSource === 'manual_csv') {
                    csvFileContainer.show();
                } else if (selectedSource === 'chatwoot_label') {
                    chatwootLabelsContainer.show();
                    loadChatwootLabels(); // Cargar etiquetas cuando se selecciona esta opción
                }
            });
            // Disparar el evento change al cargar la página para establecer el estado inicial
            contactSourceSelect.trigger('change');
        }

        async function loadChatwootLabels() {
            chatwootLabelSelect.empty().append(new Option('Cargando etiquetas...', '', true, true)).prop('disabled', true);
            try {
                const response = await fetch('/api/chatwoot/labels');
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: 'Error desconocido al cargar etiquetas' }));
                    throw new Error(errorData.error || `Error ${response.status}`);
                }
                const labels = await response.json();
                chatwootLabelSelect.empty();
                if (labels && labels.length > 0) {
                    labels.forEach(label => {
                        // Usamos label.title como valor y texto, ya que la API de Chatwoot usa el título para filtrar
                        chatwootLabelSelect.append(new Option(label.title, label.title)); 
                    });
                    chatwootLabelSelect.prop('disabled', false);
                } else {
                    chatwootLabelSelect.append(new Option('No hay etiquetas disponibles', '', true, true));
                    chatwootLabelSelect.prop('disabled', true);
                }
            } catch (error) {
                console.error('Error al cargar etiquetas de Chatwoot:', error);
                chatwootLabelSelect.empty();
                chatwootLabelSelect.append(new Option(error.message || 'Error al cargar etiquetas', '', true, true));
                chatwootLabelSelect.prop('disabled', true);
            }
        }

        // Lógica para el submit del formulario de envío masivo
        bulkWhatsappForm.on('submit', async function(event) {
            event.preventDefault();
            const submitButton = $(this).find('button[type="submit"]');
            const originalButtonText = submitButton.html();
            submitButton.prop('disabled', true).html('<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Iniciando...');

            const campaignData = {
                campaignTitle: $('#campaignTitle').val(),
                evolutionInstance: $('#evolutionInstance').val(),
                campaignMessage: $('#campaignMessage').val(),
                contactSource: $('#contactSource').val(),
                chatwootLabel: $('#contactSource').val() === 'chatwoot_label' ? $('#chatwootLabelSelect').val() : null,
                // Para manualContacts y csvFile, necesitaremos procesarlos para obtener la lista de números.
                // Por ahora, solo enviaremos el contenido del textarea o el nombre del archivo.
                manualContacts: $('#contactSource').val() === 'manual_list' ? $('#manualContacts').val() : null,
                csvFile: $('#contactSource').val() === 'manual_csv' && $('#csvFile')[0].files.length > 0 ? $('#csvFile')[0].files[0].name : null,
                multimediaUrl: $('#multimediaUrl').val().trim() || null,
                sendInterval: parseInt($('#sendInterval').val()) || 5,
            };

            // Validación básica (se pueden añadir más)
            if (!campaignData.campaignTitle || !campaignData.evolutionInstance || !campaignData.campaignMessage || !campaignData.contactSource) {
                Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Campos incompletos', text: 'Por favor, completa todos los campos requeridos.', showConfirmButton: false, timer: 3000 });
                submitButton.prop('disabled', false).html(originalButtonText);
                return;
            }
            if (campaignData.contactSource === 'chatwoot_label' && !campaignData.chatwootLabel) {
                 Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Campos incompletos', text: 'Por favor, selecciona una etiqueta de Chatwoot.', showConfirmButton: false, timer: 3000 });
                submitButton.prop('disabled', false).html(originalButtonText);
                return;
            }
            // Aquí se añadiría la lógica para leer el CSV o procesar la lista manual para obtener los números antes de enviar al backend,
            // o enviar el archivo/texto crudo y que el backend lo procese. Por simplicidad, enviaremos crudo por ahora.

            console.log("Enviando datos de campaña al backend:", campaignData);

            try {
                const response = await fetch('/api/whatsapp/start-bulk-campaign', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(campaignData)
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'success', title: 'Éxito', text: result.message || 'Campaña creada.', showConfirmButton: false, timer: 2500 });
                    
                    // Ocultar y resetear el formulario
                    createCampaignFormContainer.slideUp(); // Asegúrate que createCampaignFormContainer esté definido en este scope o pásalo
                    bulkWhatsappForm[0].reset();
                    contactSourceSelect.trigger('change'); // Para resetear la visibilidad de campos condicionales
                    
                    // Recargar la tabla de DataTables
                    if ($('#bulkCampaignsTable').length && $.fn.DataTable.isDataTable('#bulkCampaignsTable')) {
                        $('#bulkCampaignsTable').DataTable().ajax.reload(null, false);
                    }
                    // Opcional: Mostrar la tabla si estaba oculta
                    // if (bulkCampaignsTableCard && bulkCampaignsTableCard.is(':hidden')) {
                    //    bulkCampaignsTableCard.slideDown();
                    // }
                } else {
                    Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error', text: result.message || 'No se pudo crear la campaña.', showConfirmButton: false, timer: 4000 });
                }
            } catch (error) {
                console.error('Error al iniciar campaña masiva:', error);
                Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error de Red', text: 'No se pudo conectar con el servidor.', showConfirmButton: false, timer: 3000 });
            } finally {
                submitButton.prop('disabled', false).html(originalButtonText);
            }
        });

        // Lógica para los botones de formato de texto
        formatTextBtns.on('click', function() {
            const format = $(this).data('format');
            const textarea = campaignMessageTextarea[0];
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selectedText = textarea.value.substring(start, end);
            let char = '';
            let endChar = '';

            switch (format) {
                case 'bold': char = '*'; break;
                case 'italic': char = '_'; break;
                case 'strikethrough': char = '~'; break;
                case 'monospace': char = '```'; break;
            }
            endChar = char; // Para la mayoría de los casos

            const newText = textarea.value.substring(0, start) +
                            char + selectedText + endChar +
                            textarea.value.substring(end);
            
            textarea.value = newText;
            campaignMessageTextarea.focus();
            // Ajustar la selección para que quede después del texto insertado/formateado
            if (selectedText) {
                textarea.setSelectionRange(start + char.length, start + char.length + selectedText.length);
            } else {
                textarea.setSelectionRange(start + char.length, start + char.length);
            }
        });

        // Lógica para insertar placeholders
        availablePlaceholdersContainer.on('click', '.placeholder-tag', function() {
            const placeholder = $(this).data('placeholder');
            const textarea = campaignMessageTextarea[0];
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            
            const newText = textarea.value.substring(0, start) +
                            placeholder +
                            textarea.value.substring(end);
            
            textarea.value = newText;
            campaignMessageTextarea.focus();
            textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
        });

        // Inicializar DataTable para el historial de campañas
        if ($('#bulkCampaignsTable').length) {
            $('#bulkCampaignsTable').DataTable({
                responsive: true,
                processing: true,
                // serverSide: false, // Para carga inicial de todos los JSON, serverSide podría ser true si el endpoint lo soporta
                ajax: {
                    url: '/api/whatsapp/bulk-campaigns',
                    dataSrc: 'data' // La respuesta del API es { data: [...] }
                },
                columns: [
                    { data: 'id', render: function(data, type, row){ return `<small>${data}</small>`; } },
                    { data: 'title' },
                    { data: 'createdAt', render: function(data, type, row){ return data ? new Date(data).toLocaleString('es-ES') : '-'; } },
                    { data: 'contactSource' },
                    { data: 'chatwootLabel', defaultContent: '-' },
                    { data: 'totalContacts' },
                    { data: 'sent' },
                    { data: 'failed' },
                    { data: 'status', render: function(data, type, row){ return `<span class="badge bg-${getCampaignStatusColor(data)}">${data}</span>`; } },
                    { 
                        data: null,
                        orderable: false,
                        searchable: false,
                        render: function(data, type, row) {
                            let buttons = `<button class="btn btn-sm btn-info view-campaign-details-btn me-1" data-campaign-id="${row.id}" title="Ver Detalles"><i class="bi bi-eye"></i></button>`;
                            
                            if (row.status === 'pendiente') {
                                buttons += `<button class="btn btn-sm btn-success start-campaign-btn me-1" data-campaign-id="${row.id}" title="Iniciar Campaña"><i class="bi bi-play-circle-fill"></i></button>`; // Color success para Iniciar
                                buttons += `<button class="btn btn-sm btn-warning edit-campaign-btn me-1" data-campaign-id="${row.id}" title="Editar Campaña"><i class="bi bi-pencil-fill"></i></button>`; // Botón Editar
                            } else if (row.status === 'en_progreso') {
                                buttons += `<button class="btn btn-sm btn-warning pause-campaign-btn me-1" data-campaign-id="${row.id}" title="Pausar Campaña"><i class="bi bi-pause-fill"></i></button>`;
                            } else if (row.status === 'pausada' || row.status === 'en_progreso_pausada') {
                                buttons += `<button class="btn btn-sm btn-success resume-campaign-btn me-1" data-campaign-id="${row.id}" title="Reanudar Campaña"><i class="bi bi-play-fill"></i></button>`;
                            }
                            
                            // Botón para reiniciar campañas completadas o fallidas
                            if (row.status === 'completada' || row.status === 'fallida' || row.status === 'error_procesamiento') {
                                buttons += `<button class="btn btn-sm btn-info reset-campaign-btn me-1" data-campaign-id="${row.id}" title="Reiniciar Campaña (volver a enviar a todos)"><i class="bi bi-arrow-clockwise"></i></button>`;
                            }

                            buttons += `<button class="btn btn-sm btn-danger delete-campaign-btn" data-campaign-id="${row.id}" data-campaign-title="${row.title}" title="Eliminar Campaña"><i class="bi bi-trash"></i></button>`;
                            return buttons;
                        }
                    }
                ],
                language: { 
                    url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json',
                    processing: "Procesando...",
                },
                order: [[2, 'desc']] // Ordenar por fecha de creación descendente por defecto
            });

            // Event listener para Iniciar Campaña
            $('#bulkCampaignsTable tbody').on('click', '.start-campaign-btn', async function () {
                const campaignId = $(this).data('campaignId');
                Swal.fire({
                    title: `¿Iniciar la campaña "${campaignId}"?`,
                    text: "La campaña comenzará a enviar mensajes.",
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, iniciar',
                    cancelButtonText: 'No',
                    theme: "dark"
                }).then(async (result) => {
                    if (result.isConfirmed) {
                        try {
                            const response = await fetch(`/api/whatsapp/bulk-campaigns/${campaignId}/start`, { method: 'POST' });
                            const responseData = await response.json();
                            if (response.ok && responseData.success) {
                                Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'success', title: 'Iniciada', text: responseData.message, showConfirmButton: false, timer: 2000 });
                                $('#bulkCampaignsTable').DataTable().ajax.reload(null, false); // Recargar datos
                            } else {
                                Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error', text: responseData.message || 'No se pudo iniciar la campaña.', showConfirmButton: false, timer: 3000 });
                            }
                        } catch (error) {
                            Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error de Red', text: 'No se pudo conectar para iniciar la campaña.', showConfirmButton: false, timer: 3000 });
                        }
                    }
                });
            });

            // Variable para almacenar el ID de la campaña en edición
            let editingCampaignId = null;

            // Event listener para Editar Campaña
            $('#bulkCampaignsTable tbody').on('click', '.edit-campaign-btn', async function () {
                editingCampaignId = $(this).data('campaignId');
                if (!editingCampaignId) return;

                try {
                    const response = await fetch(`/api/whatsapp/bulk-campaigns/${editingCampaignId}/details`);
                    if (!response.ok) {
                        const errData = await response.json().catch(() => ({}));
                        throw new Error(errData.message || `Error ${response.status} al cargar detalles de la campaña.`);
                    }
                    const result = await response.json();
                    if (result.success && result.data) {
                        const campaign = result.data;
                        // Poblar el formulario
                        $('#campaignTitle').val(campaign.title);
                        $('#evolutionInstance').val(campaign.instanceName);
                        $('#campaignMessage').val(campaign.messageTemplate);
                        $('#contactSource').val(campaign.contactSource).trigger('change'); // trigger change para mostrar/ocultar campos dependientes
                        
                        if (campaign.contactSource === 'chatwoot_label' && campaign.chatwootLabel) {
                            // Esperar a que se carguen las etiquetas y luego seleccionar
                            // Esto es un poco más complejo si loadChatwootLabels es asíncrono y no devuelve promesa
                            // Por ahora, asumimos que se puede setear directamente o que el usuario re-seleccionará si es necesario
                            // Idealmente, loadChatwootLabels debería devolver una promesa
                            $('#chatwootLabelSelect').val(campaign.chatwootLabel);
                        } else if (campaign.contactSource === 'manual_list') {
                            // Para lista manual, los contactos están en campaign.contacts.map(c=>c.phone).join('\n')
                            // Pero el formulario espera el texto crudo que generó esos contactos.
                            // Si guardamos el texto crudo en el JSON, podríamos cargarlo aquí.
                            // Por ahora, dejamos el campo de texto manual vacío o indicamos que se debe re-ingresar.
                            // O, si el JSON guarda el texto original de manualContacts, lo cargamos.
                            // Asumiendo que `campaign.originalManualContactsText` podría existir:
                            // $('#manualContacts').val(campaign.originalManualContactsText || '');
                            // Como no lo tenemos, lo dejamos vacío por ahora.
                             $('#manualContacts').val(campaign.contacts.map(c => c.phone).join('\n')); // Llenar con los teléfonos actuales
                        }
                        // CSV no se puede re-poblar fácilmente.

                        $('#multimediaUrl').val(campaign.multimediaUrl || '');
                        $('#sendInterval').val(campaign.sendIntervalSeconds || 5);

                        // Cambiar botón y mostrar formulario
                        $('#bulkWhatsappForm button[type="submit"]').html('<i class="bi bi-save-fill me-2"></i>Guardar Cambios');
                        $('#createCampaignFormContainer').slideDown();
                        $('html, body').animate({ scrollTop: $('#createCampaignFormContainer').offset().top }, 500);

                    } else {
                        throw new Error(result.message || 'No se pudieron cargar los datos de la campaña.');
                    }
                } catch (error) {
                    Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error', text: error.message, showConfirmButton: false, timer: 3000 });
                    editingCampaignId = null; // Resetear si falla la carga
                }
            });
            
            // Modificar el submit del formulario para manejar creación y edición
            bulkWhatsappForm.off('submit').on('submit', async function(event) { // .off('submit') para evitar múltiples bindings si este bloque se re-ejecuta
                event.preventDefault();
                const submitButton = $(this).find('button[type="submit"]');
                const originalButtonText = submitButton.html(); // Guardar el texto actual (puede ser "Iniciar" o "Guardar")
                
                submitButton.prop('disabled', true).html('<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Procesando...');

                const campaignData = {
                    campaignTitle: $('#campaignTitle').val(),
                    evolutionInstance: $('#evolutionInstance').val(),
                    campaignMessage: $('#campaignMessage').val(),
                    contactSource: $('#contactSource').val(),
                    chatwootLabel: $('#contactSource').val() === 'chatwoot_label' ? $('#chatwootLabelSelect').val() : null,
                    manualContacts: $('#contactSource').val() === 'manual_list' ? $('#manualContacts').val() : null,
                    // CSV no se maneja en edición de esta forma simple, se requeriría re-subir.
                    multimediaUrl: $('#multimediaUrl').val().trim() || null,
                    sendInterval: parseInt($('#sendInterval').val()) || 5,
                };

                let url, method;
                if (editingCampaignId) {
                    url = `/api/whatsapp/bulk-campaigns/${editingCampaignId}`;
                    method = 'PUT';
                } else {
                    url = '/api/whatsapp/start-bulk-campaign';
                    method = 'POST';
                }

                try {
                    const response = await fetch(url, {
                        method: method,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(campaignData)
                    });
                    const result = await response.json();

                    if (response.ok && result.success) {
                        Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'success', title: 'Éxito', text: result.message, showConfirmButton: false, timer: 2500 });
                        
                        createCampaignFormContainer.slideUp();
                        bulkWhatsappForm[0].reset();
                        contactSourceSelect.trigger('change');
                        $('#bulkWhatsappForm button[type="submit"]').html('<i class="bi bi-send-fill me-2"></i>Iniciar Envío Masivo'); // Resetear botón
                        editingCampaignId = null; // Resetear ID de edición
                        
                        if ($('#bulkCampaignsTable').length && $.fn.DataTable.isDataTable('#bulkCampaignsTable')) {
                            $('#bulkCampaignsTable').DataTable().ajax.reload(null, false);
                        }
                    } else {
                        Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error', text: result.message || `No se pudo ${editingCampaignId ? 'actualizar' : 'crear'} la campaña.`, showConfirmButton: false, timer: 4000 });
                    }
                } catch (error) {
                    console.error(`Error al ${editingCampaignId ? 'actualizar' : 'crear'} campaña:`, error);
                    Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error de Red', text: 'No se pudo conectar con el servidor.', showConfirmButton: false, timer: 3000 });
                } finally {
                    submitButton.prop('disabled', false).html(originalButtonText); // Restaurar texto original del botón
                    if (!editingCampaignId) { // Si era creación, restaurar texto de creación
                         $('#bulkWhatsappForm button[type="submit"]').html('<i class="bi bi-send-fill me-2"></i>Iniciar Envío Masivo');
                    }
                }
            });

            // Asegurarse que el botón de cancelar también resetee el modo edición
            cancelCreateCampaignBtn.on('click', function() {
                // createCampaignFormContainer.slideUp(); // Ya lo hace
                // bulkWhatsappForm[0].reset(); // Ya lo hace
                // contactSourceSelect.trigger('change'); // Ya lo hace
                $('#bulkWhatsappForm button[type="submit"]').html('<i class="bi bi-send-fill me-2"></i>Iniciar Envío Masivo'); // Resetear texto del botón
                editingCampaignId = null; // Resetear ID de edición
            }); // Esta es la llave de cierre correcta para cancelCreateCampaignBtn.on('click', ...

            // Event listener para Reiniciar Campaña
            $('#bulkCampaignsTable tbody').on('click', '.reset-campaign-btn', async function () {
                const campaignId = $(this).data('campaignId');
                Swal.fire({
                    title: `¿Reiniciar la campaña "${campaignId}"?`,
                    text: "Esto marcará todos los contactos como pendientes y la campaña podrá ser iniciada de nuevo.",
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, reiniciar',
                    cancelButtonText: 'No',
                    confirmButtonColor: '#3085d6',
                    cancelButtonColor: '#d33',
                    theme: "dark"
                }).then(async (result) => {
                    if (result.isConfirmed) {
                        try {
                            const response = await fetch(`/api/whatsapp/bulk-campaigns/${campaignId}/reset`, { method: 'POST' });
                            const responseData = await response.json();
                            if (response.ok && responseData.success) {
                                Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'success', title: 'Reiniciada', text: responseData.message, showConfirmButton: false, timer: 2000 });
                                $('#bulkCampaignsTable').DataTable().ajax.reload(null, false); // Recargar datos
                            } else {
                                Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error', text: responseData.message || 'No se pudo reiniciar la campaña.', showConfirmButton: false, timer: 3000 });
                            }
                        } catch (error) {
                            Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error de Red', text: 'No se pudo conectar para reiniciar la campaña.', showConfirmButton: false, timer: 3000 });
                        }
                    }
                });
            });

            // Event listener para el botón de eliminar campaña
            $('#bulkCampaignsTable tbody').on('click', '.delete-campaign-btn', function () {
                const campaignId = $(this).data('campaignId');
                const campaignTitle = $(this).data('campaignTitle') || campaignId;
                const row = $(this).closest('tr');

                Swal.fire({
                    title: `¿Estás seguro de eliminar la campaña "${campaignTitle}"?`,
                    text: "Esta acción no se puede revertir y eliminará el archivo JSON de la campaña.",
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#d33',
                    cancelButtonColor: '#3085d6',
                    confirmButtonText: 'Sí, eliminar',
                    cancelButtonText: 'Cancelar',
                    theme: "dark"
                }).then(async (result) => {
                    if (result.isConfirmed) {
                        try {
                            const response = await fetch(`/api/whatsapp/bulk-campaigns/${campaignId}`, {
                                method: 'DELETE'
                            });
                            const responseData = await response.json();

                            if (response.ok && responseData.success) {
                                Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'success', title: 'Eliminada', text: responseData.message, showConfirmButton: false, timer: 2500 });
                                $('#bulkCampaignsTable').DataTable().row(row).remove().draw();
                            } else {
                                Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error', text: responseData.message || 'No se pudo eliminar la campaña.', showConfirmButton: false, timer: 3000 });
                            }
                        } catch (error) {
                            console.error('Error al intentar eliminar campaña:', error);
                            Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error de Red', text: 'No se pudo conectar para eliminar la campaña.', showConfirmButton: false, timer: 3000 });
                        }
                    }
                });
            });

            // Event listener para Pausar Campaña
            $('#bulkCampaignsTable tbody').on('click', '.pause-campaign-btn', async function () {
                const campaignId = $(this).data('campaignId');
                // const table = $('#bulkCampaignsTable').DataTable();
                // const row = $(this).closest('tr');
                // const rowData = table.row(row).data();

                Swal.fire({
                    title: `¿Pausar la campaña "${campaignId}"?`,
                    text: "La campaña dejará de enviar mensajes hasta que se reanude.",
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, pausar',
                    cancelButtonText: 'No',
                    theme: "dark"
                }).then(async (result) => {
                    if (result.isConfirmed) {
                        try {
                            const response = await fetch(`/api/whatsapp/bulk-campaigns/${campaignId}/pause`, { method: 'POST' });
                            const responseData = await response.json();
                            if (response.ok && responseData.success) {
                                Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'success', title: 'Pausada', text: responseData.message, showConfirmButton: false, timer: 2000 });
                                $('#bulkCampaignsTable').DataTable().ajax.reload(null, false); // Recargar datos sin resetear paginación
                            } else {
                                Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error', text: responseData.message || 'No se pudo pausar la campaña.', showConfirmButton: false, timer: 3000 });
                            }
                        } catch (error) {
                            Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error de Red', text: 'No se pudo conectar para pausar.', showConfirmButton: false, timer: 3000 });
                        }
                    }
                });
            });

            // Event listener para Reanudar Campaña
            $('#bulkCampaignsTable tbody').on('click', '.resume-campaign-btn', async function () {
                const campaignId = $(this).data('campaignId');
                Swal.fire({
                    title: `¿Reanudar la campaña "${campaignId}"?`,
                    text: "La campaña continuará enviando mensajes.",
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, reanudar',
                    cancelButtonText: 'No',
                    theme: "dark"
                }).then(async (result) => {
                    if (result.isConfirmed) {
                        try {
                            const response = await fetch(`/api/whatsapp/bulk-campaigns/${campaignId}/resume`, { method: 'POST' });
                            const responseData = await response.json();
                            if (response.ok && responseData.success) {
                                Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'success', title: 'Reanudada', text: responseData.message, showConfirmButton: false, timer: 2000 });
                                $('#bulkCampaignsTable').DataTable().ajax.reload(null, false);
                            } else {
                                Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error', text: responseData.message || 'No se pudo reanudar la campaña.', showConfirmButton: false, timer: 3000 });
                            }
                        } catch (error) {
                            Swal.fire({ toast: true, theme: "dark", position: 'top-end', icon: 'error', title: 'Error de Red', text: 'No se pudo conectar para reanudar.', showConfirmButton: false, timer: 3000 });
                        }
                    }
                });
            });

            // Event listener para Ver Detalles de Campaña
            $('#bulkCampaignsTable tbody').on('click', '.view-campaign-details-btn', async function () {
                const campaignId = $(this).data('campaignId');
                const modal = new bootstrap.Modal(document.getElementById('campaignDetailsModal'));
                
                // Resetear y mostrar loading
                $('#campaignDetailsModalLabel').text(`Detalles de la Campaña: ${campaignId}`);
                $('#campaignDetailsModalLoading').show();
                $('#campaignDetailsModalContent').hide();
                $('#campaignDetailsModalError').hide();
                $('#campaignContactsDetailTableBody').empty();

                modal.show();

                try {
                    const response = await fetch(`/api/whatsapp/bulk-campaigns/${campaignId}/details`);
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ message: 'Error desconocido al cargar detalles.' }));
                        throw new Error(errorData.message || `Error ${response.status}`);
                    }
                    const result = await response.json();

                    if (result.success && result.data) {
                        const campaign = result.data;
                        // Poblar información general
                        $('#modalCampaignId').text(campaign.id);
                        $('#modalCampaignTitle').text(campaign.title);
                        $('#modalCampaignInstance').text(campaign.instanceName);
                        $('#modalCampaignContactSource').text(campaign.contactSource);

                        if (campaign.contactSource === 'chatwoot_label' && campaign.chatwootLabel) {
                            $('#modalCampaignChatwootLabel').text(campaign.chatwootLabel);
                            $('#modalCampaignChatwootLabelContainer').show();
                        } else {
                            $('#modalCampaignChatwootLabelContainer').hide();
                        }

                        $('#modalCampaignCreatedAt').text(new Date(campaign.createdAt).toLocaleString('es-ES'));
                        $('#modalCampaignUpdatedAt').text(new Date(campaign.updatedAt).toLocaleString('es-ES'));
                        $('#modalCampaignStatus').html(`<span class="badge bg-${getCampaignStatusColor(campaign.status)}">${campaign.status}</span>`);
                        $('#modalCampaignSendInterval').text(campaign.sendIntervalSeconds);

                        if (campaign.multimediaUrl) {
                            $('#modalCampaignMultimediaUrl').text(campaign.multimediaUrl).attr('href', campaign.multimediaUrl);
                            $('#modalCampaignMultimediaUrlContainer').show();
                        } else {
                            $('#modalCampaignMultimediaUrlContainer').hide();
                        }
                        
                        $('#modalCampaignMessage').text(campaign.messageTemplate);

                        // Poblar resumen
                        $('#modalSummaryTotal').text(campaign.summary?.totalContacts || 0);
                        $('#modalSummarySent').text(campaign.summary?.sent || 0);
                        $('#modalSummaryFailed').text(campaign.summary?.failed || 0);
                        $('#modalSummaryPending').text(campaign.summary?.pending || 0);

                        // Poblar tabla de contactos
                        const contactsTableBody = $('#campaignContactsDetailTableBody');
                        if (campaign.contacts && campaign.contacts.length > 0) {
                            campaign.contacts.forEach((contact, index) => {
                                const row = `<tr>
                                    <td>${index + 1}</td>
                                    <td>${contact.phone}</td>
                                    <td>${contact.nombre_cliente || '-'}</td>
                                    <td>${contact.apellido_cliente || '-'}</td>
                                    <td><span class="badge bg-${getCampaignStatusColor(contact.status)}">${contact.status}</span></td>
                                    <td>${contact.sentAt ? new Date(contact.sentAt).toLocaleString('es-ES') : '-'}</td>
                                    <td>${contact.error || '-'}</td>
                                </tr>`;
                                contactsTableBody.append(row);
                            });
                        } else {
                            contactsTableBody.append('<tr><td colspan="7" class="text-center">No hay contactos en esta campaña.</td></tr>');
                        }

                        $('#campaignDetailsModalLoading').hide();
                        $('#campaignDetailsModalContent').show();
                    } else {
                        throw new Error(result.message || 'No se pudieron cargar los datos de la campaña.');
                    }
                } catch (error) {
                    console.error('Error al obtener detalles de la campaña:', error);
                    $('#campaignDetailsModalLoading').hide();
                    $('#campaignDetailsModalError').text(error.message).show();
                }
            });

        }
    } // Cierre de if ($('#bulkCampaignsTable').length)

    function getCampaignStatusColor(status) {
        switch (status) {
            case 'iniciada': return 'secondary';
            case 'en_progreso': return 'primary';
            case 'completada': return 'success';
            case 'fallida':
            case 'error_procesamiento': return 'danger';
            case 'pausada': return 'warning';
            case 'pendiente': return 'info'; // Color para el nuevo estado 'pendiente'
            default: return 'light';
        }
    }
});
