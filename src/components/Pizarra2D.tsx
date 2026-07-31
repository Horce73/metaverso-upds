import React, { useRef, useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';

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

interface Stroke {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  width: number;
}

export const Pizarra2D: React.FC<Pizarra2DProps> = ({
  socket,
  espacioId,
  sesionId,
  puedeDibujar,
  puedeAdministrar,
  onClose
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#ffffff');
  const [lineWidth, setLineWidth] = useState(4);
  const [strokesHistory, setStrokesHistory] = useState<Stroke[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Ajustar dimensiones del Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Obtener las dimensiones del contenedor padre
    const rect = canvas.parentElement?.getBoundingClientRect();
    canvas.width = (rect?.width || 800) * 2; // Alta resolución (Retina)
    canvas.height = (rect?.height || 500) * 2;
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(2, 2);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    contextRef.current = context;

    // Redibujar historial si existe
    strokesHistory.forEach((stroke) => {
      drawStrokeOnCanvas(stroke);
    });

    // Escuchar trazos y borrado de otros usuarios
    socket.on('stroke_received', (stroke: Stroke) => {
      drawStrokeOnCanvas(stroke);
      setStrokesHistory((prev) => [...prev, stroke]);
    });

    socket.on('board_cleared', () => {
      clearLocalCanvas();
    });

    socket.on('pizarra_saved_status', (data: { success: boolean }) => {
      if (data.success) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
      }
    });

    return () => {
      socket.off('stroke_received');
      socket.off('board_cleared');
      socket.off('pizarra_saved_status');
    };
  }, [strokesHistory.length]);

  // Dibujar un trazo en el Canvas
  const drawStrokeOnCanvas = (stroke: Stroke) => {
    const context = contextRef.current;
    if (!context) return;

    context.beginPath();
    context.strokeStyle = stroke.color;
    context.lineWidth = stroke.width;
    context.moveTo(stroke.x0, stroke.y0);
    context.lineTo(stroke.x1, stroke.y1);
    context.stroke();
    context.closePath();
  };

  // Limpiar el Canvas localmente
  const clearLocalCanvas = () => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    setStrokesHistory([]);
  };

  // Enviar evento de limpiar pizarra a todos (solo docente/admin)
  const handleClearBoard = () => {
    if (!puedeAdministrar) return;
    clearLocalCanvas();
    socket.emit('clear_board', { espacioId });
  };

  // Iniciar trazo (mouse o táctil)
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!puedeDibujar) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    
    // Guardar posición inicial del trazo temporalmente en el ref
    // @ts-ignore
    canvas.lastX = x;
    // @ts-ignore
    canvas.lastY = y;
  };

  // Dibujar mientras se mueve el mouse
  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (!canvas || !context) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // @ts-ignore
    const x0 = canvas.lastX;
    // @ts-ignore
    const y0 = canvas.lastY;

    const stroke: Stroke = {
      x0,
      y0,
      x1: x,
      y1: y,
      color,
      width: lineWidth
    };

    // Dibujar localmente
    drawStrokeOnCanvas(stroke);
    setStrokesHistory((prev) => [...prev, stroke]);

    // Emitir por sockets al servidor
    socket.emit('draw_stroke', { espacioId, stroke });

    // Actualizar posición anterior
    // @ts-ignore
    canvas.lastX = x;
    // @ts-ignore
    canvas.lastY = y;
  };

  // Detener trazo
  const stopDrawing = () => {
    setIsDrawing(false);
  };

  // Guardar Pizarra en DB (RF-04) — solo docente/admin
  const handleSaveBoard = () => {
    if (!puedeAdministrar || !sesionId) return;
    setSaveStatus('saving');
    socket.emit('save_pizarra', {
      sesionId,
      trazos: strokesHistory
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
              <button
                className="color-dot active"
                style={{ backgroundColor: '#ffffff' }}
                onClick={() => setColor('#ffffff')}
              />
              <button
                className="color-dot"
                style={{ backgroundColor: '#ff4c8b' }}
                onClick={() => setColor('#ff4c8b')}
              />
              <button
                className="color-dot"
                style={{ backgroundColor: '#3b82f6' }}
                onClick={() => setColor('#3b82f6')}
              />
              <button
                className="color-dot"
                style={{ backgroundColor: '#10b981' }}
                onClick={() => setColor('#10b981')}
              />
              <button
                className="color-dot"
                style={{ backgroundColor: '#f59e0b' }}
                onClick={() => setColor('#f59e0b')}
              />

              <select
                value={lineWidth}
                onChange={(e) => setLineWidth(parseInt(e.target.value))}
                style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--panel-border)', borderRadius: '4px', padding: '0 4px', fontSize: '0.8rem' }}
              >
                <option value={2}>Fino</option>
                <option value={4}>Medio</option>
                <option value={8}>Grueso</option>
              </select>
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
          onMouseDown={puedeDibujar ? startDrawing : undefined}
          onMouseMove={puedeDibujar ? draw : undefined}
          onMouseUp={puedeDibujar ? stopDrawing : undefined}
          onMouseLeave={puedeDibujar ? stopDrawing : undefined}
        />
      </div>
    </div>
  );
};
