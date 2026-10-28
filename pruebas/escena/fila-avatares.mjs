// Conecta seis estudiantes de la demo, cada uno con una apariencia distinta,
// y los deja parados en fila en el campus durante un rato (por defecto 60 s).
//
//   DEMO_CLAVE=… node pruebas/escena/fila-avatares.mjs [segundos] [x] [z]
// ESPACIO=nombre para otro espacio; en un aula, CODIGO=código del curso (SEC-08).
import { io } from 'socket.io-client';

const [, , segundos = '60', x0 = '17.5', z0 = '5.2'] = process.argv;
const base = process.env.BASE_URL || 'http://localhost:5173';
const clave = process.env.DEMO_CLAVE;
if (!clave) throw new Error('Falta DEMO_CLAVE');

const A = (o) => ({ version: 2, ...o });
const apariencias = [
  A({ piel: '#f7cfa6', cuerpo: { complexion: 'delgada', altura: 0.96 }, cabello: { estilo: 'coleta', color: '#4a2e1b' }, rostro: { ojos: 'grandes', colorOjos: '#2f6b3a', cejas: 'arqueadas', expresion: 'alegre', rubor: true }, ropa: { superior: 'chompa', colorPrimario: '#dc2626', colorSecundario: '#f8fafc', inferior: 'falda', colorInferior: '#1e293b', calzado: 'botas', colorCalzado: '#78350f' }, accesorios: { gafas: 'redondas', mochila: true, colorMochila: '#14b8a6' } }),
  A({ piel: '#8d5524', cuerpo: { complexion: 'robusta', altura: 1.06 }, cabello: { estilo: 'rapado', color: '#0f0d0b' }, velloFacial: { estilo: 'barba', color: '#0f0d0b' }, rostro: { ojos: 'almendrados', colorOjos: '#3b2414', cejas: 'gruesas', expresion: 'serio', rubor: false }, ropa: { superior: 'saco', colorPrimario: '#334155', colorSecundario: '#f8fafc', inferior: 'pantalon', colorInferior: '#1e293b', calzado: 'zapatos', colorCalzado: '#111827' }, accesorios: { gafas: 'cuadradas' } }),
  A({ piel: '#d9a066', cabello: { estilo: 'corto', color: '#2c1d11' }, rostro: { ojos: 'redondos', colorOjos: '#3b2414', cejas: 'finas', expresion: 'guiño', rubor: true }, ropa: { superior: 'deportiva', colorPrimario: '#0033a0', colorSecundario: '#f8fafc', inferior: 'buzo', colorInferior: '#0033a0', calzado: 'zapatillas', colorCalzado: '#f8fafc' }, accesorios: { sombrero: 'chullo', colorSombrero: '#be185d', bufanda: true, colorBufanda: '#eab308' } }),
  A({ piel: '#ffe0c4', cuerpo: { complexion: 'media', altura: 1.02 }, cabello: { estilo: 'afro', color: '#6f4a2f' }, rostro: { ojos: 'grandes', colorOjos: '#2b5f8f', cejas: 'finas', expresion: 'sorprendido', rubor: true }, ropa: { superior: 'polera', colorPrimario: '#eab308', colorSecundario: '#111827', inferior: 'short', colorInferior: '#3b5b8c', calzado: 'zapatillas', colorCalzado: '#dc2626' }, accesorios: { gafas: 'sol', audifonos: true } }),
  A({ piel: '#c68642', cuerpo: { complexion: 'delgada', altura: 1.04 }, cabello: { estilo: 'trenzas', color: '#0f0d0b' }, rostro: { ojos: 'almendrados', colorOjos: '#1a1a1a', cejas: 'arqueadas', expresion: 'alegre', rubor: true }, ropa: { superior: 'camisa', colorPrimario: '#f8fafc', colorSecundario: '#0ea5e9', inferior: 'jean', colorInferior: '#3b5b8c', calzado: 'zapatos', colorCalzado: '#7c2d12' }, accesorios: { sombrero: 'sombrero', colorSombrero: '#111827' } }),
  A({ piel: '#eab88a', cuerpo: { complexion: 'robusta', altura: 0.94 }, cabello: { estilo: 'tupe', color: '#b8b8b8' }, velloFacial: { estilo: 'candado', color: '#b8b8b8' }, rostro: { ojos: 'redondos', colorOjos: '#6b7b8c', cejas: 'gruesas', expresion: 'alegre', rubor: false }, ropa: { superior: 'chompa', colorPrimario: '#65a30d', colorSecundario: '#7c4a2d', inferior: 'pantalon', colorInferior: '#7c4a2d', calzado: 'botas', colorCalzado: '#111827' }, accesorios: { sombrero: 'gorra', colorSombrero: '#1d4ed8', mochila: true } }),
];

const entrar = async (email) =>
  (await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.5.${Math.floor(Math.random() * 250)}.9` },
    body: JSON.stringify({ email, password: clave }),
  })).json();

const sesiones = await Promise.all(apariencias.map((_, i) => entrar(`estudiante${i + 1}@demo.local`)));
const espacios = await (await fetch(`${base}/api/espacios`, { headers: { Authorization: `Bearer ${sesiones[0].token}` } })).json();
const campus = espacios.find((e) => e.nombre === (process.env.ESPACIO || 'Campus Central UPDS')) ?? espacios.find((e) => e.tipo === 'campus');
if (process.env.CODIGO) {
  for (const s of sesiones) {
    await fetch(`${base}/api/espacios/${campus.id}/acceso`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.token}`, 'X-Forwarded-For': `10.5.${Math.floor(Math.random() * 250)}.9` },
      body: JSON.stringify({ codigo: process.env.CODIGO }),
    });
  }
}

for (const [i, apariencia] of apariencias.entries()) {
  const socket = io(base, { auth: { token: sesiones[i].token }, transports: ['websocket'] });
  await new Promise((listo) => socket.on('connect', listo));
  socket.emit('join_space', { espacioId: campus.id, apariencia });
  const posicion = [Number(x0) + i * 1.3, 0, Number(z0)];
  const moverse = () => socket.emit('move', { position: posicion, rotation: [0, 0, 0], estaSentado: false, t: performance.now() });
  setTimeout(moverse, 300);
  setInterval(moverse, 2000);
}
console.log(`${apariencias.length} avatares en fila durante ${segundos} s`);
setTimeout(() => process.exit(0), Number(segundos) * 1000);
