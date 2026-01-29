const express = require('express');
const router = express.Router();
const db = require('../conectar');

router.post('/', async (req, res) => {
    // Recibimos todos los campos del frontend
    const { cliente, direccion, telefono, tipo_entrega, metodo_pago, items } = req.body;

    try {
        await db.query('BEGIN');

        let totalPedido = 0;
        const itemsParaInsertar = [];

        // 1. Validar items y buscar precios reales
        for (const item of items) {
            const resHamb = await db.query('SELECT precio FROM hamburguesas WHERE id = $1', [item.hamburguesa_id]);
            
            if (resHamb.rows.length === 0) {
                throw new Error(`La hamburguesa con ID ${item.hamburguesa_id} no existe.`);
            }

            const precioReal = parseFloat(resHamb.rows[0].precio);
            const subtotalItem = precioReal * item.cantidad;
            totalPedido += subtotalItem;

            itemsParaInsertar.push({
                id: item.hamburguesa_id,
                cantidad: item.cantidad,
                precio: precioReal,
                subtotal: subtotalItem
            });
        }

        const estadoInicial = (metodo_pago === 'transferencia') ? 'esperando_pago' : 'pendiente';

        // 2. Insertar Pedido con tipo_entrega y metodo_pago
        const pedidoRes = await db.query(
            'INSERT INTO pedidos (cliente, direccion, telefono, total, tipo_entrega, metodo_pago) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [cliente, direccion, telefono, totalPedido, tipo_entrega, metodo_pago]
        );
        const pedidoId = pedidoRes.rows[0].id;

        // 3. Insertar Items del pedido
        const consultaItems = `
            INSERT INTO pedido_items (pedido_id, hamburguesa_id, cantidad, precio_unitario, subtotal) 
            VALUES ($1, $2, $3, $4, $5)`;

        for (const item of itemsParaInsertar) {
            await db.query(consultaItems, [pedidoId, item.id, item.cantidad, item.precio, item.subtotal]);
        }

        await db.query('COMMIT');
        res.status(201).json({ mensaje: "Pedido procesado con éxito", pedidoId, total: totalPedido });

    } catch (err) {
        await db.query('ROLLBACK');
        console.error(err.message);
        res.status(400).json({ error: err.message });
    }
});

// Obtener todos los pedidos (para el panel de cocina)
router.get('/admin/lista', async (req, res) => {
    // Si no viene fecha en la URL, usamos la fecha actual local
    const fechaFiltro = req.query.fecha || new Date().toISOString().split('T')[0];

    try {
        const result = await db.query(`
            SELECT p.*, 
            json_agg(json_build_object('nombre', h.nombre, 'cantidad', pi.cantidad)) as items
            FROM pedidos p
            JOIN pedido_items pi ON p.id = pi.pedido_id
            JOIN hamburguesas h ON pi.hamburguesa_id = h.id
            WHERE p.fecha::date = $1
            GROUP BY p.id
            ORDER BY p.id DESC
        `, [fechaFiltro]);
        
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar estado del pedido
router.patch('/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body; // 'pendiente', 'enviado', 'cancelado'
    try {
        await db.query('UPDATE pedidos SET estado = $1 WHERE id = $2', [estado, id]);
        res.json({ mensaje: "Estado actualizado" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;