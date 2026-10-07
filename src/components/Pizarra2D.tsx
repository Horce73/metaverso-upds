import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { dibujarTramo, redibujarTodo, nuevoIdTrazo, suscribirPizarra, type Punto, type Trazo } from './pizarra.js';

interface Pizarra2DProps {
  socket: Socket;
  espacioId: string;
  sesionId: string;
  /** Puede trazar en la pizarra (docente, estudiante o administrador). */
  puedeDibujar: boolean;
  /** Puede borrar el pizarrón y persistir el snapshot oficial (docente o administrador). */
  puedeAdministrar: boolean;
  onClose: () => void;
}

const COLORES = ['#ffffff', '#ff4c8b', '#3b82f6', '#10b981', '#f59e0b'];
// Los puntos que se dibujan se envían en lotes, no uno por movimiento del mouse
const INTERVALO_LOTE_MS = 50;
// Distancia mínima (fracción del ancho) entre puntos consecutivos de un trazo
const DISTANCIA_MINIMA = 0.0015;
// Resolución del canvas respecto a su tamaño en pantalla
const ESCALA = 2;

type ApiPizarra = ReturnType<typeof suscribirPizarra>;

// Pizarra por operaciones (AULA-02): cada trazo, de que se apoya el lápiz a
// que se levanta, es una operación con id. Se envía por lotes mientras se
// dibuja, el servidor la guarda, y cada uno puede deshacer las suyas.
// Funciona con mouse, pantalla táctil y lápiz (eventos de puntero).
export const Pizarra2D: React.FC<Pizarra2DProps> = ({
  socket,
  sesionId,
  puedeDibujar,
  puedeAdministrar,
  onClose
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const pizarraRef = useRef<ApiPizarra | null>(null);
  const enCursoRef = useRef<{ trazo: Trazo; pendientes: Punto[] } | null>(null);
  // Ids de mis trazos terminados, para deshacer en orden inverso
  const propiosRef = useRef<string[]>([]);
  const [color, setColor] = useState('#ffffff');
  const [lineWidth, setLineWidth] = useState(4);
  const [hayPropios, setHayPropios] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const tamano = () => {
    const canvas = canvasRef.current!;
    return { w: canvas.width / ESCALA, h: canvas.height / ESCALA };
  };

  // Tamaño del canvas al montar, y suscripción a la pizarra del aula
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.parentElement?.getBoundingClientRect();
    canvas.width = (rect?.width || 800) * ESCALA;
    canvas.height = (rect?.height || 500) * ESCALA;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(ESCALA, ESCALA);
    contextRef.current = context;

    const pizarra = suscribirPizarra(socket, {
      ignorarPropios: true,
      onTramo: (trazo, desde) => {
        const { w, h } = tamano();
        dibujarTramo(context, w, h, trazo, desde);
      },
      onRedibujar: (trazos) => {
        const { w, h } = tamano();
        redibujarTodo(context, w, h, trazos, null);
        // Lo que ya no está (deshecho o borrado) deja de poder deshacerse
        propiosRef.current = propiosRef.current.filter((id) => pizarra.trazos.has(id));
        setHayPropios(propiosRef.current.length > 0);
      },
    });
    pizarraRef.current = pizarra;

    const handleSavedStatus = (data: { success: boolean }) => {
      if (data.success) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
      }
    };
    socket.on('pizarra_saved_status', handleSavedStatus);

    return () => {
      pizarra.dejar();
      socket.off('pizarra_saved_status', handleSavedStatus);
    };
  }, [socket]);

  const enviar = useCallback(
    (fin: boolean) => {
      const enCurso = enCursoRef.current;
      if (!enCurso || (!fin && enCurso.pendientes.length === 0)) return;
      const { trazo } = enCurso;
      const puntos = enCurso.pendientes.splice(0);
      socket.emit('pizarra_trazo', { id: trazo.id, color: trazo.color, grosor: trazo.grosor, puntos, fin });
    },
    [socket]
  );

  // Lotes periódicos mientras se dibuja
  useEffect(() => {
    const id = setInterval(() => enviar(false), INTERVALO_LOTE_MS);
    return () => clearInterval(id);
  }, [enviar]);

  const puntoDe = (e: React.PointerEvent<HTMLCanvasElement>): Punto => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const redondear = (v: number) => Math.round(v * 10000) / 10000;
    return [redondear((e.clientX - rect.left) / rect.width), redondear((e.clientY - rect.top) / rect.height)];
  };

  const agregarPunto = (p: Punto) => {
    const enCurso = enCursoRef.current;
    const context = contextRef.current;
    if (!enCurso || !context) return;
    const { trazo } = enCurso;
    const ultimo = trazo.puntos[trazo.puntos.length - 1];
    if (ultimo && Math.hypot(p[0] - ultimo[0], p[1] - ultimo[1]) < DISTANCIA_MINIMA) return;
    trazo.puntos.push(p);
    enCurso.pendientes.push(p);
    const { w, h } = tamano();
    dibujarTramo(context, w, h, trazo, trazo.puntos.length - 1);
  };

  const empezar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!puedeDibujar || enCursoRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { w } = tamano();
    const trazo: Trazo = { id: nuevoIdTrazo(), color, grosor: lineWidth / w, puntos: [] };
    pizarraRef.current?.trazos.set(trazo.id, trazo);
    enCursoRef.current = { trazo, pendientes: [] };
    agregarPunto(puntoDe(e));
  };

  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!enCursoRef.current) return;
    // Con lápiz o táctil el navegador agrupa movimientos: se usan todos
    const eventos = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [];
    if (eventos.length > 1) {
      const rect = canvasRef.current!.getBoundingClientRect();
      eventos.forEach((ev) => agregarPunto([(ev.clientX - rect.left) / rect.width, (ev.clientY - rect.top) / rect.height]));
    } else {
      agregarPunto(puntoDe(e));
    }
  };

  const terminar = () => {
    const enCurso = enCursoRef.current;
    if (!enCurso) return;
    enviar(true);
    enCursoRef.current = null;
    propiosRef.current.push(enCurso.trazo.id);
    setHayPropios(true);
  };

  // Deshacer mi último trazo: el servidor lo marca y avisa a toda el aula
  const deshacer = useCallback(() => {
    const id = propiosRef.current.pop();
    setHayPropios(propiosRef.current.length > 0);
    if (id) socket.emit('pizarra_deshacer', { id });
  }, [socket]);

  useEffect(() => {
    if (!puedeDibujar) return;
    const alPulsar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        deshacer();
      }
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [puedeDibujar, deshacer]);

  // Enviar evento de limpiar pizarra a todos (solo docente/admin)
  const handleClearBoard = () => {
    if (!puedeAdministrar) return;
    socket.emit('clear_board');
  };

  // Guardar Pizarra en DB (RF-04) — solo docente/admin
  const handleSaveBoard = () => {
    if (!puedeAdministrar || !sesionId) return;
    setSaveStatus('saving');
    socket.emit('save_pizarra', {
      sesionId,
      trazos: [...(pizarraRef.current?.trazos.values() ?? [])]
    });
  };

  return (
    <div className="pizarra-modal glass-panel">
      <div className="pizarra-header">
        <h3 className="gradient-text" style={{ fontSize: '1.2rem', fontWeight: 600 }}>
          Pizarra Compartida - {puedeAdministrar ? 'Modo Escritura (Docente)' : puedeDibujar ? 'Modo Escritura (Estudiante)' : 'Visualización en Vivo'}
        </h3>

        <div className="pizarra-toolbar">
          {/* Herramientas de Dibujo: cualquiera con permiso de escritura elige su color/grosor */}
          {puedeDibujar && (
            <>
              {COLORES.map((c) => (
                <button
                  key={c}
                  className={`color-dot ${color === c ? 'active' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                  aria-pressed={color === c}
                />
              ))}

              <select
                value={lineWidth}
                onChange={(e) => setLineWidth(parseInt(e.target.value))}
                style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--panel-border)', borderRadius: '4px', padding: '0 4px', fontSize: '0.8rem' }}
              >
                <option value={2}>Fino</option>
                <option value={4}>Medio</option>
                <option value={8}>Grueso</option>
              </select>

              <button
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                onClick={deshacer}
                disabled={!hayPropios}
                title="Deshacer mi último trazo (Ctrl+Z)"
              >
                ↶ Deshacer
              </button>
            </>
          )}

          {/* Acciones administrativas: borrar todo y persistir el snapshot oficial (docente/admin) */}
          {puedeAdministrar && (
            <>
              <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={handleClearBoard}>
                Borrar Todo
              </button>

              <button
                className="btn-primary"
                style={{ padding: '4px 12px', fontSize: '0.8rem', margin: 0 }}
                onClick={handleSaveBoard}
                disabled={saveStatus === 'saving'}
              >
                {saveStatus === 'saving' ? 'Guardando...' : saveStatus === 'saved' ? '¡Guardada!' : 'Persistir Snapshot'}
              </button>
            </>
          )}

          <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.15)', borderColor: 'var(--error)' }} onClick={onClose}>
            Cerrar Pizarra
          </button>
        </div>
      </div>

      <div className="pizarra-canvas-container">
        <canvas
          ref={canvasRef}
          className="pizarra-canvas"
          style={{ width: '100%', height: '100%', touchAction: puedeDibujar ? 'none' : 'auto' }}
          onPointerDown={puedeDibujar ? empezar : undefined}
          onPointerMove={puedeDibujar ? mover : undefined}
          onPointerUp={puedeDibujar ? terminar : undefined}
          onPointerCancel={puedeDibujar ? terminar : undefined}
        />
      </div>
    </div>
  );
};
