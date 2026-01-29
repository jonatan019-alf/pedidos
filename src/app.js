const express = require('express');
const cors = require('cors');
const db = require('./conectar');
const pedidosRoutes = require('./routes/pedidos');
const path = require('path');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Compartir io con las rutas de pedidos
app.set('socketio', io);

app.use(cors());
app.use(express.json());

app.use(session({
    secret: 'mi_secreto_super_seguro_highblend',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, 
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

function auth(req, res, next) {
    if (req.session && req.session.admin) {
        return next();
    }
    res.status(401).json({ message: "No autorizado" });
}

// --- SECCIÓN CORREGIDA ---
io.on('connection', (socket) => {
    console.log('📱 Cliente conectado vía WebSockets');
    
    // Escuchar el evento que viene desde el cliente de pedidos
    socket.on('pedido-realizado', (data) => {
        console.log("Nuevo pedido recibido, avisando a los administradores...");
        // Re-emitir con el mismo nombre para que el admin lo reciba
        io.emit('pedido-realizado', data);
    });
});

app.post('/login', async (req, res) => {
    const { user, pass } = req.body;
    try {
        const result = await db.query('SELECT * FROM usuarios WHERE username = $1 AND password = $2', [user, pass]);
        if (result.rows.length > 0) {
            req.session.admin = true;
            res.send({ success: true });
        } else {
            res.status(401).send({ success: false, message: 'Datos incorrectos' });
        }
    } catch (err) {
        res.status(500).send('Error en login');
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy();
    res.send({ success: true });
});

app.get('/hamburguesas', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM hamburguesas WHERE disponible = TRUE ORDER BY categoria, nombre');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.get('/hamburguesas-admin', auth, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM hamburguesas ORDER BY disponible DESC, categoria ASC, nombre ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.patch('/productos/:id/disponible', auth, async (req, res) => {
    const { id } = req.params;
    const { disponible } = req.body;
    try {
        await db.query('UPDATE hamburguesas SET disponible = $1 WHERE id = $2', [disponible, id]);
        io.emit('cambio-stock', { id: parseInt(id), disponible });
        res.send({ success: true });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post('/productos', auth, async (req, res) => {
    const { nombre, descripcion, precio, categoria } = req.body;
    try {
        await db.query(
            'INSERT INTO hamburguesas (nombre, descripcion, precio, categoria) VALUES ($1, $2, $3, $4)',
            [nombre, descripcion, precio, categoria.toUpperCase()]
        );
        res.send({ success: true });
    } catch (err) { res.status(500).send(err.message); }
});

app.put('/productos/:id', auth, async (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, precio, categoria } = req.body;
    try {
        await db.query(
            'UPDATE hamburguesas SET nombre = $1, descripcion = $2, precio = $3, categoria = $4 WHERE id = $5',
            [nombre, descripcion, precio, categoria.toUpperCase(), id]
        );
        res.send({ success: true });
    } catch (err) { res.status(500).send("Error al actualizar"); }
});

app.delete('/productos/:id', auth, async (req, res) => {
    try {
        await db.query('DELETE FROM hamburguesas WHERE id = $1', [req.params.id]);
        res.send({ success: true });
    } catch (err) { res.status(500).send(err.message); }
});

app.get('/categorias', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM categorias ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/categorias', auth, async (req, res) => {
    const { nombre } = req.body;
    try {
        await db.query('INSERT INTO categorias (nombre) VALUES ($1)', [nombre.toUpperCase()]);
        res.send({ success: true });
    } catch (err) { res.status(500).send("Error al crear categoría"); }
});

app.use('/pedidos', pedidosRoutes);

app.get('/admin', auth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});