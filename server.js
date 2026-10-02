require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

// La aplicación web está dentro de /www.
app.use(express.static(path.join(__dirname, 'www')));

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ecolap_db',
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4'
});

function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const N = 16384, r = 8, p = 1, keylen = 64;
    const hash = crypto.scryptSync(password, salt, keylen, { N, r, p });
    return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

function verifyPassword(password, stored) {
    try {
        const [algorithm, n, r, p, saltText, hashText] = stored.split('$');
        if (algorithm !== 'scrypt') return false;
        const salt = Buffer.from(saltText, 'base64url');
        const expected = Buffer.from(hashText, 'base64url');
        const actual = crypto.scryptSync(password, salt, expected.length, {
            N: Number(n), r: Number(r), p: Number(p)
        });
        return crypto.timingSafeEqual(actual, expected);
    } catch {
        return false;
    }
}

function normalizarRol(rol) {
    const roles = {
        USUARIO: 'usuario',
        RECOLECTOR: 'recolector',
        ADMINISTRADOR: 'administrador'
    };
    return roles[String(rol || '').trim().toUpperCase()] || null;
}

// Comprobación real de conexión al arrancar.
async function comprobarBD() {
    const connection = await pool.getConnection();
    try {
        await connection.query('SELECT 1');
        console.log('✅ MySQL conectado: ecolap_db');
    } finally {
        connection.release();
    }
}

// ========================= API =========================

app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ ok: true, database: process.env.DB_NAME || 'ecolap_db' });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.get('/api/puntos', async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT * FROM puntos_reciclaje WHERE estado = 'activo' ORDER BY id_punto DESC"
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'No se pudieron obtener los puntos de reciclaje.' });
    }
});

app.post('/api/login', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
        return res.status(400).json({ mensaje: 'Correo y contraseña son obligatorios.' });
    }

    try {
        const [rows] = await pool.query(
            `SELECT u.id_usuario, u.nombre, u.email, u.password_hash,
                    u.puntos_acumulados, u.estado, r.nombre_rol
             FROM usuarios u
             INNER JOIN roles r ON r.id_rol = u.id_rol
             WHERE u.email = ? LIMIT 1`,
            [email]
        );

        if (!rows.length || rows[0].estado !== 'activo') {
            return res.status(401).json({ mensaje: 'Correo o contraseña incorrectos.' });
        }

        const usuario = rows[0];
        if (!verifyPassword(password, usuario.password_hash)) {
            return res.status(401).json({ mensaje: 'Correo o contraseña incorrectos.' });
        }

        res.json({
            mensaje: 'Login exitoso',
            usuario: {
                id: usuario.id_usuario,
                nombre: usuario.nombre,
                email: usuario.email,
                rol: normalizarRol(usuario.nombre_rol),
                puntos: usuario.puntos_acumulados
            }
        });
    } catch (error) {
        console.error('POST /api/login:', error);
        res.status(500).json({ error: 'Error interno al consultar la base de datos.' });
    }
});

app.post('/api/register', async (req, res) => {
    const nombre = String(req.body.nombre || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const telefono = String(req.body.telefono || '').trim() || null;

    if (!nombre || !email || password.length < 6) {
        return res.status(400).json({
            mensaje: 'Nombre, correo y una contraseña de mínimo 6 caracteres son obligatorios.'
        });
    }

    try {
        const [existing] = await pool.query(
            'SELECT id_usuario FROM usuarios WHERE email = ? LIMIT 1', [email]
        );
        if (existing.length) {
            return res.status(409).json({ mensaje: 'El correo electrónico ya está registrado.' });
        }

        const [roleRows] = await pool.query(
            "SELECT id_rol FROM roles WHERE nombre_rol = 'USUARIO' LIMIT 1"
        );
        if (!roleRows.length) {
            return res.status(500).json({ mensaje: 'No existe el rol USUARIO en la base de datos.' });
        }

        const passwordHash = hashPassword(password);
        const [result] = await pool.query(
            `INSERT INTO usuarios
             (nombre, email, password_hash, telefono, id_rol, puntos_acumulados, estado)
             VALUES (?, ?, ?, ?, ?, 0, 'activo')`,
            [nombre, email, passwordHash, telefono, roleRows[0].id_rol]
        );

        res.status(201).json({
            mensaje: 'Usuario registrado exitosamente.',
            id_usuario: result.insertId
        });
    } catch (error) {
        console.error('POST /api/register:', error);
        res.status(500).json({ error: 'No se pudo registrar el usuario.' });
    }
});

app.post('/api/solicitudes', async (req, res) => {
    const { id_usuario, direccion, latitud, longitud, tipo_residuo, fecha_programada, horario_preferido } = req.body;

    if (!id_usuario || !direccion || !tipo_residuo) {
        return res.status(400).json({ mensaje: 'Faltan datos obligatorios de la solicitud.' });
    }

    try {
        const [result] = await pool.query(
            `INSERT INTO solicitudes_recoleccion
             (id_usuario, direccion, latitud, longitud, tipo_residuo,
              fecha_programada, horario_preferido, estado_solicitud)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'Pendiente')`,
            [id_usuario, direccion, latitud ?? null, longitud ?? null,
             tipo_residuo, fecha_programada || null, horario_preferido || null]
        );

        res.status(201).json({
            mensaje: 'Solicitud creada con éxito.',
            id_solicitud: result.insertId
        });
    } catch (error) {
        console.error('POST /api/solicitudes:', error);
        res.status(500).json({ error: 'No se pudo guardar la solicitud.' });
    }
});

app.get('/api/ubicaciones-recolectores', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT ur.id_recolector, ur.latitud, ur.longitud, u.nombre
            FROM ubicacion_recolectores ur
            INNER JOIN usuarios u ON u.id_usuario = ur.id_recolector
            INNER JOIN roles r ON r.id_rol = u.id_rol
            WHERE r.nombre_rol = 'RECOLECTOR'
              AND u.estado = 'activo'
              AND ur.id_ubicacion = (
                  SELECT MAX(ur2.id_ubicacion)
                  FROM ubicacion_recolectores ur2
                  WHERE ur2.id_recolector = ur.id_recolector
              )
        `);
        res.json(rows);
    } catch (error) {
        console.error('GET /api/ubicaciones-recolectores:', error);
        res.status(500).json({ error: 'No se pudieron obtener las ubicaciones.' });
    }
});

app.get('/api/obtener_puntos_reciclaje.php', (req, res) => {
    // Compatibilidad con versiones anteriores del mapa.
    res.redirect('/api/puntos');
});

app.get('/api/obtener_camiones_activos.php', (req, res) => {
    res.redirect('/api/ubicaciones-recolectores');
});

app.post('/api/crear_solicitud.php', async (req, res) => {
    // Compatibilidad con el mapa antiguo.
    req.url = '/api/solicitudes';
    const { id_usuario, direccion, latitud, longitud, tipo_residuo, fecha_programada, horario_preferido } = req.body;
    try {
        const [result] = await pool.query(
            `INSERT INTO solicitudes_recoleccion
             (id_usuario, direccion, latitud, longitud, tipo_residuo,
              fecha_programada, horario_preferido, estado_solicitud)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'Pendiente')`,
            [id_usuario, direccion, latitud ?? null, longitud ?? null, tipo_residuo,
             fecha_programada || null, horario_preferido || null]
        );
        res.status(201).json({ mensaje: 'Solicitud creada con éxito.', id_solicitud: result.insertId });
    } catch (error) {
        res.status(500).json({ error: 'No se pudo guardar la solicitud.' });
    }
});

// Página principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'www', 'index.html'));
});

comprobarBD()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`🚀 ECOLAP: http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error('❌ No se pudo conectar a MySQL.');
        console.error(error.message);
        process.exit(1);
    });
