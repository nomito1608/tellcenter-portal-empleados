const path = require('path');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const app = express();
app.use(express.static(path.join(__dirname, '..')));
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secreto_super_seguro_tellcenter';

app.use(cors());
app.use(express.json());

// Función auxiliar para convertir el JWT en tokenHash (igual a la tabla Sesion de Prisma)
function generarHashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Middleware para verificar el JWT y comprobar que la sesión siga activa en Base de Datos
async function autenticarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const tokenHash = generarHashToken(token);

    const sesionActiva = await prisma.sesion.findUnique({
      where: { tokenHash }
    });

    if (!sesionActiva || sesionActiva.revocadaEn !== null || new Date() > sesionActiva.expiraEn) {
      return res.status(401).json({ error: 'La sesión ha expirado o fue cerrada' });
    }

    req.usuario = decoded;
    req.tokenHash = tokenHash;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
}

// ==========================================
// 1. RUTAS DE AUTENTICACIÓN Y SESIONES JWT
// ==========================================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { nombre, email, password, cargo, cuenta, lob, modalidad, rol } = req.body;
    const existe = await prisma.usuario.findUnique({ where: { email } });
    if (existe) return res.status(400).json({ error: 'El correo ya está registrado' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const nuevoUsuario = await prisma.usuario.create({
      data: {
        nombre, email, password: hashedPassword,
        cargo: cargo || 'Empleado', cuenta: cuenta || 'Svelte',
        lob: lob || 'E-commerce', modalidad: modalidad || 'Remoto',
        rol: rol || 'EMPLEADO'
      }
    });
    res.status(201).json({ mensaje: 'Usuario registrado exitosamente', usuario: nuevoUsuario });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    if (!usuario) return res.status(401).json({ error: 'Credenciales inválidas' });

    const passwordValida = await bcrypt.compare(password, usuario.password);
    if (!passwordValida) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: usuario.rol },
      JWT_SECRET, { expiresIn: '12h' }
    );
    const tokenHash = generarHashToken(token);
    const expiraEn = new Date(Date.now() + 12 * 60 * 60 * 1000);

    await prisma.sesion.create({ data: { usuarioId: usuario.id, tokenHash, expiraEn } });

    res.status(200).json({ mensaje: 'Inicio de sesión exitoso', token, usuario });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en el servidor al iniciar sesión' });
  }
});

app.post('/api/auth/logout', autenticarToken, async (req, res) => {
  try {
    await prisma.sesion.update({
      where: { tokenHash: req.tokenHash },
      data: { revocadaEn: new Date() }
    });
    res.json({ mensaje: 'Sesión cerrada y registrada en base de datos' });
  } catch (error) {
    res.status(500).json({ error: 'Error al cerrar sesión' });
  }
});

// ==========================================
// 2. RUTAS DE CONTROL DE HORARIO
// ==========================================

app.get('/api/horarios/mi-estado', autenticarToken, async (req, res) => {
  try {
    const jornadaActiva = await prisma.controlHorario.findFirst({
      where: { usuarioId: req.usuario.id, estado: 'EN_JORNADA' },
      orderBy: { horaEntrada: 'desc' }
    });
    const historial = await prisma.controlHorario.findMany({
      where: { usuarioId: req.usuario.id },
      orderBy: { horaEntrada: 'desc' }, take: 15
    });
    const sesiones = await prisma.sesion.findMany({
      where: { usuarioId: req.usuario.id },
      orderBy: { creadoEn: 'desc' }, take: 5
    });
    res.json({ jornadaActiva, historial, sesiones });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener control de horario' });
  }
});

app.post('/api/horarios/entrada', autenticarToken, async (req, res) => {
  try {
    const { observacion } = req.body;
    const activa = await prisma.controlHorario.findFirst({
      where: { usuarioId: req.usuario.id, estado: 'EN_JORNADA' }
    });
    if (activa) return res.status(400).json({ error: 'Ya tienes una jornada en curso activa.' });

    const datosUsuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
    const nuevaEntrada = await prisma.controlHorario.create({
      data: {
        usuarioId: req.usuario.id, modalidad: datosUsuario?.modalidad || 'Remoto',
        estado: 'EN_JORNADA', observacion: observacion || 'Inicio de turno regular'
      }
    });
    res.status(201).json({ mensaje: 'Entrada registrada correctamente', registro: nuevaEntrada });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al registrar la entrada' });
  }
});

app.post('/api/horarios/salida', autenticarToken, async (req, res) => {
  try {
    const { observacion } = req.body;
    const activa = await prisma.controlHorario.findFirst({
      where: { usuarioId: req.usuario.id, estado: 'EN_JORNADA' }
    });
    if (!activa) return res.status(400).json({ error: 'No tienes una jornada activa para cerrar.' });

    const horaSalida = new Date();
    const diffMs = horaSalida - new Date(activa.horaEntrada);
    const minutosTrabajados = Math.max(1, Math.round(diffMs / 60000));

    const registroCerrado = await prisma.controlHorario.update({
      where: { id: activa.id },
      data: {
        horaSalida, minutosTrabajados, estado: 'FINALIZADO',
        observacion: observacion || activa.observacion
      }
    });
    res.json({ mensaje: 'Salida registrada exitosamente', registro: registroCerrado });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al registrar la salida' });
  }
});

// ==========================================
// 3. RUTAS DE INVENTARIO Y BITÁCORA
// ==========================================

app.get('/api/inventario', autenticarToken, async (req, res) => {
  try {
    const equipos = await prisma.equipo.findMany({
      include: {
        usuario: { select: { id: true, nombre: true, email: true, cuenta: true, modalidad: true } },
        historial: { orderBy: { creadoEn: 'desc' } }
      },
      orderBy: { creadoEn: 'desc' }
    });
    res.json(equipos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener el inventario' });
  }
});

app.post('/api/inventario', autenticarToken, async (req, res) => {
  try {
    const { codigoInventario, categoria, marcaModelo, numeroSerie } = req.body;
    const nuevoEquipo = await prisma.equipo.create({
      data: {
        codigoInventario, categoria, marcaModelo, numeroSerie,
        historial: {
          create: { accion: 'REGISTRADO', detalle: 'Equipo ingresado a Bodega Central IT' }
        }
      }
    });
    res.status(201).json(nuevoEquipo);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear el equipo. Verifica duplicados.' });
  }
});

app.get('/api/inventario/kits', autenticarToken, async (req, res) => {
  try {
    const empleados = await prisma.usuario.findMany({
      select: {
        id: true, nombre: true, email: true, cargo: true, cuenta: true, lob: true, modalidad: true,
        equipos: { include: { historial: true }, orderBy: { fechaAsignacion: 'desc' } }
      },
      orderBy: { nombre: 'asc' }
    });
    res.json(empleados);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los kits' });
  }
});

app.post('/api/inventario/asignar', autenticarToken, async (req, res) => {
  try {
    const { equipoId, usuarioId } = req.body;
    const usuarioDestino = await prisma.usuario.findUnique({ where: { id: Number(usuarioId) } });
    
    const equipoActualizado = await prisma.equipo.update({
      where: { id: Number(equipoId) },
      data: {
        usuarioId: Number(usuarioId),
        estado: 'ASIGNADO',
        fechaAsignacion: new Date(),
        historial: {
          create: { accion: 'ASIGNADO', detalle: `Asignado al kit de ${usuarioDestino.nombre}` }
        }
      }
    });
    res.json({ mensaje: 'Equipo asignado exitosamente', equipo: equipoActualizado });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al asignar el equipo' });
  }
});

app.post('/api/inventario/devolver', autenticarToken, async (req, res) => {
  try {
    const { equipoId, nuevoEstado } = req.body;
    const equipoLiberado = await prisma.equipo.update({
      where: { id: Number(equipoId) },
      data: {
        usuarioId: null,
        estado: nuevoEstado || 'EN_BODEGA',
        fechaAsignacion: null,
        historial: {
          create: { accion: 'DEVUELTO', detalle: 'Equipo retornado a Bodega Central IT' }
        }
      }
    });
    res.json({ mensaje: 'Equipo devuelto a bodega', equipo: equipoLiberado });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al liberar el equipo' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});