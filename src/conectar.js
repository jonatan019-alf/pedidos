
const { Pool } = require('pg');

// Escribe tus datos reales aquí mismo
const db = new Pool({
    user: 'postgres',           // Tu usuario de Postgres
    host: 'localhost',          // Tu servidor local
    database: 'hamburguesas',   // Cambia esto por el nombre de tu DB
    password: 'skapunk',    // Tu contraseña de Postgres
    port: 5432,                 // El puerto que verificamos antes
});

// Verificación de conexión
db.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Error conectando a Postgres:', err.stack);
    } else {
        console.log('✅ Conexión establecida correctamente a las:', res.rows[0].now);
    }
});

module.exports = db;