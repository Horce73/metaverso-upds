import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { Login } from './components/Login.js';
import { CustomAvatar } from './components/CustomAvatar.js';
import { Pizarra2D } from './components/Pizarra2D.js';
import { MetaversoCanvas } from './components/MetaversoCanvas.js';
import { AudioClient } from './components/AudioClient.js';
import './App.css';

interface User {
  id: string;
  registro_upds?: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: 'estudiante' | 'docente' | 'admin';
}

interface Avatar {
  id: string;
  nombre_visible: string;
  modelo_url: string | null;
  apariencia: any;
}

interface Espacio {
  id: string;
  nombre: string;
  tipo: 'campus' | 'aula';
  asignatura_id: string | null;
  escena_url: string;
  capacidad_max: number;
}

function App() {
  // Autenticación
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string>('');
  const [avatar, setAvatar] = useState<Avatar | null>(null);

  // Espacios
  const [espacios, setEspacios] = useState<Espacio[]>([]);
  const [espacioActivo, setEspacioActivo] = useState<Espacio | null>(null);

  // Conexiones Sockets y WebRTC
  const [socket, setSocket] = useState<Socket | null>(null);
  const [audioClient, setAudioClient] = useState<AudioClient | null>(null);
  const [peerId, setPeerId] = useState<string>('');
  const [remoteUsers, setRemoteUsers] = useState<{ [socketId: string]: any }>({});
  
  // UI States
  const [customizingAvatar, setCustomizingAvatar] = useState(false);
  const [pizarraAbierta, setPizarraAbierta] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ sender: string; text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  
  // Clases y Asistencia (Docente)
  const [sesionClase, setSesionClase] = useState<any>(null);
  const [temaClase, setTemaClase] = useState('');
  const [verReporte, setVerReporte] = useState(false);
  const [reporteAsistencia, setReporteAsistencia] = useState<any[]>([]);

  // Inicializar autenticación desde LocalStorage
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    const savedAvatar = localStorage.getItem('avatar');

    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      if (savedAvatar) {
        setAvatar(JSON.parse(savedAvatar));
      }
    }
  }, []);

  // Cargar espacios disponibles cuando el usuario inicia sesión
  useEffect(() => {
    if (!token) return;

    fetch('http://localhost:3001/api/espacios', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setEspacios(data);
        }
      })
      .catch((err) => console.error('Error cargando espacios:', err));
  }, [token]);

  // Manejar el flujo de unirse a una escena 3D
  const handleJoinSpace = (espacio: Espacio) => {
    setEspacioActivo(espacio);
    setChatMessages([]);

    // 1. Inicializar Sockets
    const newSocket = io('http://localhost:3001');
    setSocket(newSocket);

    // 2. Inicializar AudioClient (VoIP espacial)
    // El peerId será el mismo userId para que sea fácil llamarlos
    const client = new AudioClient(
      user!.id,
      (pId) => {
        setPeerId(pId);
        
        // Unirse al espacio con socket y peerId listo
        newSocket.emit('join_space', {
          userId: user!.id,
          nombreVisible: avatar?.nombre_visible || `${user!.nombre} ${user!.apellido.charAt(0)}.`,
          espacioId: espacio.id,
          apariencia: avatar?.apariencia || {},
          peerId: pId
        });
      },
      (err) => console.warn('VoIP Error:', err)
    );

    setAudioClient(client);

    // 3. Registrar llamadas VoIP entrantes/salientes
    client.onCallConnected((connectedPeerId) => {
      console.log(`Llamada VoIP establecida con: ${connectedPeerId}`);
    });

    // 4. Escuchar eventos de sockets
    newSocket.on('space_users', (users: { [socketId: string]: any }) => {
      setRemoteUsers(users);
      
      // Llamar VoIP a todos los que ya están en la sala
      Object.keys(users).forEach((socketId) => {
        const u = users[socketId];
        if (u.peerId) {
          // Pequeño retardo para dar tiempo a que los canales WebRTC se estabilicen
          setTimeout(() => {
            client.callUser(u.peerId);
          }, 1000);
        }
      });
    });

    newSocket.on('user_joined', (data: { socketId: string; user: any }) => {
      setRemoteUsers((prev) => ({
        ...prev,
        [data.socketId]: data.user
      }));
      
      // Mostrar notificación en chat
      setChatMessages((prev) => [
        ...prev,
        { sender: 'Sistema', text: `${data.user.nombreVisible} ingresó al espacio.` }
      ]);
    });

    newSocket.on('user_moved', (data: { socketId: string; position: any; rotation: any }) => {
      setRemoteUsers((prev) => {
        if (!prev[data.socketId]) return prev;
        return {
          ...prev,
          [data.socketId]: {
            ...prev[data.socketId],
            position: data.position,
            rotation: data.rotation
          }
        };
      });
    });

    newSocket.on('user_left', (data: { socketId: string; userId: string }) => {
      setRemoteUsers((prev) => {
        const copy = { ...prev };
        const exitingUser = copy[data.socketId];
        if (exitingUser && exitingUser.peerId) {
          client.removeUserAudio(exitingUser.peerId);
        }
        delete copy[data.socketId];
        return copy;
      });
    });

    newSocket.on('chat_msg_received', (msg: { sender: string; text: string }) => {
      setChatMessages((prev) => [...prev, msg]);
    });
  };

  // Salir de la sala 3D
  const handleLeaveSpace = () => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    if (audioClient) {
      audioClient.destroy();
      setAudioClient(null);
    }
    setRemoteUsers({});
    setEspacioActivo(null);
    setPizarraAbierta(false);
    setSesionClase(null);
    setVerReporte(false);
  };

  // Enviar un mensaje de chat
  const sendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket || !espacioActivo) return;

    const msg = {
      sender: avatar?.nombre_visible || user!.nombre,
      text: chatInput
    };

    socket.emit('chat_msg_send', { espacioId: espacioActivo.id, message: msg });
    
    // El servidor retransmite el mensaje, pero también lo agregamos localmente
    setChatMessages((prev) => [...prev, msg]);
    setChatInput('');
  };

  // Silenciar/Activar Micrófono
  const toggleMic = () => {
    const newMuted = !micMuted;
    setMicMuted(newMuted);
    if (audioClient) {
      audioClient.setMute(newMuted);
    }
  };

  // Programar e Iniciar clase (Docente)
  const handleStartClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!temaClase.trim() || !espacioActivo) return;

    try {
      const ahora = new Date();
      const fin = new Date(ahora.getTime() + 90 * 60000); // 90 minutos de clase

      const res = await fetch('http://localhost:3001/api/sesiones', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          espacio_id: espacioActivo.id,
          tema: temaClase,
          inicio_programado: ahora.toISOString(),
          fin_programado: fin.toISOString(),
          tolerancia_min: 10
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSesionClase(data.sesion);
      setTemaClase('');
      alert(`¡Clase iniciada! Estudiantes que ingresen a partir de ahora registrarán asistencia.`);
    } catch (err: any) {
      alert(`Error al iniciar clase: ${err.message}`);
    }
  };

  // Ver reporte de asistencia
  const fetchAsistenciasReport = async () => {
    if (!sesionClase) return;
    try {
      const res = await fetch(`http://localhost:3001/api/asistencias/reporte/${sesionClase.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setReporteAsistencia(data);
        setVerReporte(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    handleLeaveSpace();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('avatar');
    setUser(null);
    setToken('');
    setAvatar(null);
  };

  // Flujo 1: No autenticado
  if (!user) {
    return <Login onLoginSuccess={(u, t, a) => {
      setUser(u);
      setToken(t);
      setAvatar(a);
    }} />;
  }

  // Flujo 2: Espacio 3D Activo
  if (espacioActivo) {
    return (
      <div className="app-layout">
        {/* Renderizado de la Escena 3D */}
        <MetaversoCanvas
          socket={socket!}
          audioClient={audioClient}
          isAula={espacioActivo.tipo === 'aula'}
          localAvatar={avatar}
          remoteUsers={remoteUsers}
        />

        {/* Guía de Teclas */}
        <div className="keys-guide">
          <div className="keys-row"><span className="key-cap">W</span><span>Avanzar</span></div>
          <div className="keys-row"><span className="key-cap">S</span><span>Retroceder</span></div>
          <div className="keys-row"><span className="key-cap">A</span><span className="key-cap">D</span><span>Girar avatar</span></div>
          <div className="keys-row"><span>Usa el mouse para arrastrar y rotar cámara</span></div>
        </div>

        {/* Barra superior */}
        <div className="overlay-panel top-bar glass-panel">
          <div>
            <h2 className="gradient-text" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
              {espacioActivo.nombre}
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Conectados: {Object.keys(remoteUsers).length + 1} usuarios
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {user.rol === 'docente' && espacioActivo.tipo === 'aula' && (
              <>
                {!sesionClase ? (
                  <form onSubmit={handleStartClass} style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      className="chat-input"
                      placeholder="Tema de la clase..."
                      value={temaClase}
                      onChange={(e) => setTemaClase(e.target.value)}
                      required
                    />
                    <button type="submit" className="btn-primary" style={{ margin: 0, padding: '4px 12px', fontSize: '0.85rem' }}>
                      Iniciar Clase
                    </button>
                  </form>
                ) : (
                  <button className="btn-primary" style={{ margin: 0, padding: '6px 12px', fontSize: '0.85rem', background: 'var(--success)' }} onClick={fetchAsistenciasReport}>
                    Reporte Asistencia
                  </button>
                )}
              </>
            )}

            <button className="btn-secondary" onClick={handleLeaveSpace}>
              Salir al Campus
            </button>
          </div>
        </div>

        {/* Pizarra Digital en Vivo (RF-04) */}
        {pizarraAbierta && (
          <Pizarra2D
            socket={socket!}
            espacioId={espacioActivo.id}
            sesionId={sesionClase?.id}
            isDocente={user.rol === 'docente'}
            onClose={() => setPizarraAbierta(false)}
          />
        )}

        {/* Reporte de asistencias modal */}
        {verReporte && (
          <div className="customize-panel glass-panel" style={{ width: '600px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 className="gradient-text" style={{ fontSize: '1.4rem', fontWeight: 600, marginBottom: '16px' }}>
              Reporte de Asistencia Automática
            </h3>
            <div className="reports-container">
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>Estudiante</th>
                    <th>Reg. UPDS</th>
                    <th>Ingreso</th>
                    <th>Salida</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {reporteAsistencia.map((a: any) => (
                    <tr key={a.id}>
                      <td>{a.nombre} {a.apellido}</td>
                      <td>{a.registro_upds}</td>
                      <td>{new Date(a.hora_ingreso).toLocaleTimeString()}</td>
                      <td>{a.hora_salida ? new Date(a.hora_salida).toLocaleTimeString() : 'En clase'}</td>
                      <td>
                        <span className={`status-badge ${a.estado}`}>
                          {a.estado.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {reporteAsistencia.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                        Ningún estudiante ha ingresado a la sesión de clase aún.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <button className="btn-secondary" style={{ width: '100%', marginTop: '20px' }} onClick={() => setVerReporte(false)}>
              Cerrar Reporte
            </button>
          </div>
        )}

        {/* Sidebar Derecha: Estudiantes activos y Chat */}
        <div className="overlay-panel sidebar-panel glass-panel">
          <div className="sidebar-title">Usuarios Activos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px', maxHeight: '150px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--success)' }}></div>
              <span>{avatar?.nombre_visible || `${user.nombre} ${user.apellido}`} (Tú - {user.rol.toUpperCase()})</span>
            </div>
            {Object.keys(remoteUsers).map((socketId) => (
              <div key={socketId} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--success)' }}></div>
                <span>{remoteUsers[socketId].nombreVisible} ({remoteUsers[socketId].peerId ? 'VoIP Conectado' : 'VoIP Cargando'})</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px', padding: '4px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
            🎙️ Canal de Voz ID: <span style={{ fontFamily: 'monospace', color: 'white' }}>{peerId || 'conectando...'}</span>
          </div>

          <div className="sidebar-title">Chat Público</div>
          <div className="chat-messages">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className="chat-bubble">
                <span className="sender">{msg.sender}</span>
                <span>{msg.text}</span>
              </div>
            ))}
          </div>

          <form onSubmit={sendChatMessage} className="chat-input-row">
            <input
              type="text"
              className="chat-input"
              placeholder="Escribe un mensaje..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            />
            <button type="submit" className="btn-send">
              ✈️
            </button>
          </form>
        </div>

        {/* Controles de audio y herramientas de la barra inferior */}
        <div className="overlay-panel bottom-controls">
          {/* Silenciar Micrófono */}
          <button
            className={`control-btn ${micMuted ? 'active' : ''}`}
            onClick={toggleMics}
            title={micMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
          >
            {micMuted ? '🔇' : '🎙️'}
          </button>

          {/* Compartir Pizarra (Solo visible si estás en el Aula Virtual) */}
          {espacioActivo.tipo === 'aula' && (
            <button
              className={`control-btn ${pizarraAbierta ? 'active' : ''}`}
              onClick={() => setPizarraAbierta(!pizarraAbierta)}
              title="Pizarra Compartida"
            >
              📋
            </button>
          )}
        </div>
      </div>
    );
  }

  // Función proxy para silenciar micrófono
  function toggleMics() {
    toggleMic();
  }

  // Flujo 3: Dashboard de Selección de Espacio
  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="user-info">
          <div className="avatar-badge">{user.nombre.charAt(0)}</div>
          <div>
            <h1 className="gradient-text" style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
              Bienvenido, {user.nombre} {user.apellido}
            </h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Facultad de Ingeniería UPDS • Rol: {user.rol.toUpperCase()}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-secondary" onClick={() => setCustomizingAvatar(true)}>
            🎨 Personalizar Avatar
          </button>
          <button className="btn-secondary" style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)', color: 'var(--error)' }} onClick={handleLogout}>
            Cerrar Sesión
          </button>
        </div>
      </header>

      <main style={{ flexGrow: 1 }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 600, borderBottom: '1px solid var(--panel-border)', paddingBottom: '12px' }}>
          Espacios en 3D Disponibles
        </h2>

        <div className="spaces-grid">
          {espacios.map((espacio) => (
            <div key={espacio.id} className="space-card glass-panel">
              <div>
                <div className="space-type">{espacio.tipo}</div>
                <h3 className="space-name">{espacio.nombre}</h3>
                <p className="space-desc">
                  {espacio.tipo === 'campus' 
                    ? 'Zona común de encuentro y esparcimiento estudiantil. Libre de registro.' 
                    : `Aula privada asignada para clases interactivas de Ingeniería de Software. Capacidad: ${espacio.capacidad_max} alumnos.`}
                </p>
              </div>
              <button className="btn-primary" onClick={() => handleJoinSpace(espacio)}>
                Ingresar en 3D
              </button>
            </div>
          ))}
          {espacios.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              No tienes asignaturas o espacios asignados para esta gestión.
            </div>
          )}
        </div>
      </main>

      {customizingAvatar && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100 }}>
          <CustomAvatar
            currentAvatar={avatar}
            token={token}
            onSaveSuccess={(updatedAvatar) => {
              setAvatar(updatedAvatar);
              setCustomizingAvatar(false);
            }}
            onClose={() => setCustomizingAvatar(false)}
          />
        </div>
      )}
    </div>
  );
}

export default App;
