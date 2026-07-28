import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { LandingPage } from './components/LandingPage.js';
import { Login } from './components/Login.js';
import { CustomAvatar } from './components/CustomAvatar.js';
import { Pizarra2D } from './components/Pizarra2D.js';
import { MetaversoCanvas } from './components/MetaversoCanvas.js';
import { AudioClient } from './components/AudioClient.js';
import { AdminPanel } from './components/AdminPanel.js';
import { TeacherPanel } from './components/TeacherPanel.js';

interface User {
  id: string;
  registro_upds?: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: 'estudiante' | 'docente' | 'admin' | 'administrador' | 'invitado';
  roles?: string[];
  isGuest?: boolean;
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

function getHashRoute(): string {
  const hash = window.location.hash.replace(/^#/, '');
  return hash || '/';
}

function App() {
  // Enrutador basado en Hash (URL independiente y persistente)
  const [route, setRoute] = useState<string>(getHashRoute);

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

  const navigateTo = (path: string) => {
    window.location.hash = `#${path}`;
    setRoute(path);
  };

  // Escuchar cambios de Hash en la URL
  useEffect(() => {
    const handleHashChange = () => {
      setRoute(getHashRoute());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Inicializar y restaurar autenticación y espacio activo tras F5
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    const savedAvatar = localStorage.getItem('avatar');
    const savedEspacio = sessionStorage.getItem('espacioActivo');

    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      if (savedAvatar) setAvatar(JSON.parse(savedAvatar));
      if (savedEspacio) setEspacioActivo(JSON.parse(savedEspacio));
    }
  }, []);

  // Cargar espacios disponibles cuando el usuario inicia sesión
  useEffect(() => {
    if (!token) return;

    fetch('/api/espacios', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setEspacios(data);
        }
      })
      .catch((err) => console.error('Error cargando espacios:', err));
  }, [token]);

  // Manejador para ingreso directo como invitado desde Landing Page
  const handleGuestLoginDirect = async () => {
    try {
      const res = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al ingresar como invitado');
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      if (data.avatar) {
        localStorage.setItem('avatar', JSON.stringify(data.avatar));
      }

      setToken(data.token);
      setUser(data.user);
      setAvatar(data.avatar || null);

      navigateTo('/espacios');
    } catch (err: any) {
      alert('⚠️ Error al ingresar como invitado: ' + (err.message || 'Error de conexión'));
    }
  };

  // Manejar el flujo de unirse a una escena 3D
  const handleJoinSpace = (espacio: Espacio) => {
    if (user?.rol === 'invitado' && espacio.tipo === 'aula') {
      alert(
        '❌ Los invitados solo pueden acceder al campus.\n\nPara acceder a las aulas, debes registrarte e iniciar sesión con tu cuenta UPDS.'
      );
      return;
    }

    setEspacioActivo(espacio);
    sessionStorage.setItem('espacioActivo', JSON.stringify(espacio));
    setChatMessages([]);

    // 1. Inicializar Sockets
    const newSocket = io();
    setSocket(newSocket);

    const myUserId = String(user?.id || 'guest_' + Date.now());

    let joinedSpace = false;
    const emitJoin = (pId?: string) => {
      if (joinedSpace) return;
      joinedSpace = true;
      newSocket.emit('join_space', {
        espacioId: espacio.id,
        user: {
          id: user?.id,
          nombreVisible: avatar?.nombre_visible || user?.nombre || 'Estudiante UPDS',
          peerId: pId || '',
          apariencia: avatar?.apariencia || {},
        },
      });
    };

    // 2. Inicializar VoIP Espacial WebRTC (PeerJS)
    const newAudioClient = new AudioClient(
      myUserId,
      (myPeerId: string) => {
        console.log('✅ PeerJS Inicializado con ID:', myPeerId);
        setPeerId(myPeerId);
        emitJoin(myPeerId);
      },
      (err: any) => {
        console.error('⚠️ Error al iniciar audio espacial:', err);
        emitJoin();
      }
    );
    setAudioClient(newAudioClient);

    // 3. Escuchar eventos del socket (usuarios existentes)
    const handleInitialUsers = (users: any) => {
      console.log('👥 Usuarios en el espacio:', users);
      setRemoteUsers(users);
      Object.keys(users).forEach((sId) => {
        const u = users[sId];
        if (u.peerId && newAudioClient) {
          newAudioClient.callUser(u.peerId);
        }
      });
    };

    newSocket.on('space_users', handleInitialUsers);
    newSocket.on('current_users', handleInitialUsers);

    newSocket.on('user_joined', (data) => {
      setRemoteUsers((prev) => ({ ...prev, [data.socketId]: data.user }));
      if (data.user.peerId && newAudioClient) {
        newAudioClient.callUser(data.user.peerId);
      }
    });

    newSocket.on('user_left', (data) => {
      setRemoteUsers((prev) => {
        const copy = { ...prev };
        const leftUser = copy[data.socketId];
        if (leftUser && leftUser.peerId && newAudioClient) {
          newAudioClient.removeUserAudio(leftUser.peerId);
        }
        delete copy[data.socketId];
        return copy;
      });
    });

    newSocket.on('user_moved', (data) => {
      setRemoteUsers((prev) => {
        if (!prev[data.socketId]) return prev;
        return {
          ...prev,
          [data.socketId]: {
            ...prev[data.socketId],
            position: data.position,
            rotation: data.rotation,
          },
        };
      });
    });

    newSocket.on('chat_message', (data) => {
      setChatMessages((prev) => [...prev, data]);
    });

    newSocket.on('pizarra_actualizada', (_data) => {});

    newSocket.on('clase_iniciada', (sesion) => {
      setSesionClase(sesion);
    });

    navigateTo('/metaverso');
  };

  // Salir del escenario 3D
  const handleLeaveSpace = () => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    if (audioClient) {
      audioClient.destroy();
      setAudioClient(null);
    }
    setEspacioActivo(null);
    sessionStorage.removeItem('espacioActivo');
    setRemoteUsers({});
    setPeerId('');
    navigateTo('/espacios');
  };

  // Cerrar sesión
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('avatar');
    sessionStorage.removeItem('espacioActivo');
    setUser(null);
    setToken('');
    setAvatar(null);
    setEspacioActivo(null);
    if (socket) socket.disconnect();
    if (audioClient) audioClient.destroy();
    navigateTo('/');
  };

  // Iniciar clase (Docente)
  const handleStartClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!temaClase || !espacioActivo) return;

    try {
      const res = await fetch('/api/clases/iniciar', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ espacio_id: espacioActivo.id, tema: temaClase }),
      });
      const data = await res.json();
      if (res.ok) {
        setSesionClase(data.sesion);
        socket?.emit('iniciar_clase', { espacioId: espacioActivo.id, sesion: data.sesion });
        alert('🎉 Clase iniciada correctamente. Asistencia habilitada.');
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Consultar reporte de asistencia (Docente)
  const fetchAsistenciasReport = async () => {
    if (!sesionClase) return;
    try {
      const res = await fetch(`/api/asistencias/reporte?sesion_id=${sesionClase.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setReporteAsistencia(data.asistencias);
        setVerReporte(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Enviar mensaje de chat
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket || !espacioActivo) return;

    const senderName = avatar?.nombre_visible || user?.nombre || 'Estudiante';
    socket.emit('send_chat', {
      espacioId: espacioActivo.id,
      message: { sender: senderName, text: chatInput },
    });
    setChatInput('');
  };

  // Alternar Micrófono
  const toggleMic = () => {
    if (audioClient) {
      const newMuted = !micMuted;
      audioClient.setMute(newMuted);
      setMicMuted(newMuted);
    }
  };

  // RENDERIZADO DE RUTAS DE NAVEGACIÓN INDEPENDIENTES

  // 1. Ruta / (Landing Page)
  if (route === '/') {
    return (
      <LandingPage
        onNavigateLogin={() => navigateTo('/login')}
        onGuestLoginDirect={handleGuestLoginDirect}
      />
    );
  }

  // 2. Ruta /login (Formulario de Autenticación)
  if (route === '/login') {
    return (
      <Login
        onLoginSuccess={(userData, tokenData, avatarData) => {
          setToken(tokenData);
          setUser(userData);
          setAvatar(avatarData);
          navigateTo('/espacios');
        }}
      />
    );
  }

  // Si no hay token o usuario en rutas protegidas, redirigir a /login
  if (!token || !user) {
    return (
      <Login
        onLoginSuccess={(userData, tokenData, avatarData) => {
          setToken(tokenData);
          setUser(userData);
          setAvatar(avatarData);
          navigateTo('/espacios');
        }}
      />
    );
  }

  const isAdmin =
    user?.rol === 'admin' ||
    user?.rol === 'administrador' ||
    (Array.isArray((user as any)?.roles) &&
      ((user as any).roles.includes('admin') || (user as any).roles.includes('administrador')));

  const isDocente =
    user?.rol === 'docente' ||
    (Array.isArray((user as any)?.roles) && (user as any).roles.includes('docente'));

  // 3. Ruta /admin (Panel de Administración)
  if (route === '/admin') {
    if (!isAdmin) {
      navigateTo('/espacios');
      return null;
    }
    return <AdminPanel token={token} onClose={() => navigateTo('/espacios')} />;
  }

  // 4. Ruta /docente (Panel del Docente)
  if (route === '/docente') {
    if (!isDocente) {
      navigateTo('/espacios');
      return null;
    }
    return <TeacherPanel token={token} user={user} onClose={() => navigateTo('/espacios')} />;
  }

  // 5. Ruta /metaverso (Escenario 3D)
  if (route === '/metaverso' && espacioActivo) {
    return (
      <div className="metaverso-wrapper" style={{ width: '100vw', height: '100vh', position: 'relative' }}>
        {/* Canvas 3D de Three.js */}
        <MetaversoCanvas
          socket={socket!}
          audioClient={audioClient}
          isAula={espacioActivo.tipo === 'aula'}
          localAvatar={{ ...user, apariencia: avatar?.apariencia }}
          remoteUsers={remoteUsers}
          onUpdateAvatarPersonalization={(nuevaApariencia) => {
            setAvatar((prev) => {
              const updated = prev ? { ...prev, apariencia: nuevaApariencia } : null;
              if (updated) localStorage.setItem('avatar', JSON.stringify(updated));
              return updated;
            });
          }}
        />

        {/* Guía de Teclas */}
        <div className="keys-guide">
          <div className="keys-row">
            <span className="key-cap">W</span>
            <span className="key-cap">S</span>
            <span>Avanzar / Retroceder</span>
          </div>
          <div className="keys-row">
            <span className="key-cap">A</span>
            <span className="key-cap">D</span>
            <span>Mover Izquierda / Derecha</span>
          </div>
          <div className="keys-row">
            <span>Arrastra el mouse para rotar la cámara</span>
          </div>
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
                    <button
                      type="submit"
                      className="btn-primary"
                      style={{ margin: 0, padding: '4px 12px', fontSize: '0.85rem' }}
                    >
                      Iniciar Clase
                    </button>
                  </form>
                ) : (
                  <button
                    className="btn-primary"
                    style={{ margin: 0, padding: '6px 12px', fontSize: '0.85rem', background: 'var(--success)' }}
                    onClick={fetchAsistenciasReport}
                  >
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
                      <td>
                        {a.nombre} {a.apellido}
                      </td>
                      <td>{a.registro_upds}</td>
                      <td>{new Date(a.hora_ingreso).toLocaleTimeString()}</td>
                      <td>{a.hora_salida ? new Date(a.hora_salida).toLocaleTimeString() : 'En clase'}</td>
                      <td>
                        <span className={`status-badge ${a.estado}`}>{a.estado.toUpperCase()}</span>
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
            <button
              className="btn-secondary"
              style={{ width: '100%', marginTop: '20px' }}
              onClick={() => setVerReporte(false)}
            >
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
              <span>
                {avatar?.nombre_visible || `${user.nombre} ${user.apellido}`} (Tú - {user.rol.toUpperCase()})
              </span>
            </div>
            {Object.keys(remoteUsers).map((socketId) => (
              <div key={socketId} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--success)' }}></div>
                <span>
                  {remoteUsers[socketId].nombreVisible} ({remoteUsers[socketId].peerId ? 'VoIP Conectado' : 'VoIP Cargando'})
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              marginBottom: '16px',
              padding: '4px 8px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '6px',
            }}
          >
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

          <form onSubmit={handleSendChat} className="chat-input-wrapper">
            <input
              type="text"
              className="chat-input"
              placeholder="Escribe un mensaje..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            />
            <button type="submit" className="btn-primary" style={{ padding: '6px 12px' }}>
              Enviar
            </button>
          </form>
        </div>

        {/* Controles de HUD Inferiores */}
        <div className="hud-bottom-controls">
          <button
            className={`control-btn ${micMuted ? 'muted' : ''}`}
            onClick={toggleMic}
            title={micMuted ? 'Activar Micrófono' : 'Silenciar Micrófono'}
          >
            {micMuted ? '🔇' : '🎙️'}
          </button>

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

  // 6. Ruta /espacios (Dashboard de Selección de Espacio) - Default
  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="user-info">
          <div className="avatar-badge">{user.nombre.charAt(0)}</div>
          <div>
            <h1 className="gradient-text" style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>
              {user.nombre} {user.apellido}
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Rol: <span style={{ color: 'var(--upds-blue-light)', fontWeight: 600 }}>{user.rol.toUpperCase()}</span>
              {user.isGuest && <span style={{ marginLeft: '8px', color: '#3b82f6' }}>🚪 Modo Invitado</span>}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {isAdmin && (
            <button className="btn-primary" onClick={() => navigateTo('/admin')}>
              🛡️ Panel Admin
            </button>
          )}
          {isDocente && (
            <button className="btn-primary" onClick={() => navigateTo('/docente')}>
              🎓 Mis Clases
            </button>
          )}
          {!user.isGuest && (
            <button className="btn-secondary" onClick={() => setCustomizingAvatar(true)}>
              🎨 Avatar
            </button>
          )}
          <button
            className="btn-secondary"
            style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)', color: 'var(--error)' }}
            onClick={handleLogout}
          >
            🚪 Logout
          </button>
        </div>
      </header>

      <main style={{ flexGrow: 1 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--panel-border)',
            paddingBottom: '16px',
            marginBottom: '24px',
          }}
        >
          <h2 style={{ fontSize: '1.3rem', fontWeight: 600, margin: 0 }}>Espacios Disponibles</h2>
          {user?.rol === 'invitado' && (
            <span
              style={{
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid #3b82f6',
                color: '#60a5fa',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              🚪 Modo Invitado
            </span>
          )}
        </div>

        <div className="spaces-grid">
          {espacios.map((espacio) => (
            <div
              key={espacio.id}
              className="space-card glass-panel"
              style={{
                opacity: user?.rol === 'invitado' && espacio.tipo === 'aula' ? 0.6 : 1,
                border: user?.rol === 'invitado' && espacio.tipo === 'aula' ? '1px solid rgba(239, 68, 68, 0.3)' : undefined,
              }}
            >
              <div>
                <div className="space-type">{espacio.tipo === 'campus' ? '🏫 CAMPUS' : '🎓 AULA'}</div>
                <h3 className="space-name">{espacio.nombre}</h3>
                <p className="space-desc">
                  {espacio.tipo === 'campus'
                    ? '📍 Zona común para el esparcimiento y encuentro estudiantil de toda la facultad.'
                    : `📚 Aula para clases virtuales en 3D. Capacidad: ${espacio.capacidad_max} estudiantes.`}
                </p>
                {user?.rol === 'invitado' && espacio.tipo === 'aula' && (
                  <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '8px', fontStyle: 'italic', margin: '8px 0 0 0' }}>
                    🔐 Solo estudiantes registrados pueden acceder
                  </p>
                )}
              </div>
              <button
                className="btn-primary"
                onClick={() => handleJoinSpace(espacio)}
                disabled={user?.rol === 'invitado' && espacio.tipo === 'aula'}
                style={{
                  opacity: user?.rol === 'invitado' && espacio.tipo === 'aula' ? 0.5 : 1,
                  cursor: user?.rol === 'invitado' && espacio.tipo === 'aula' ? 'not-allowed' : 'pointer',
                  marginTop: 'auto',
                }}
              >
                {user?.rol === 'invitado' && espacio.tipo === 'aula' ? '🔒 Bloqueado' : '▶️ Entrar'}
              </button>
            </div>
          ))}
          {espacios.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 40px', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🏗️</div>
              <p style={{ fontSize: '1.1rem', fontWeight: 500 }}>No hay espacios disponibles en este momento</p>
              <p style={{ fontSize: '0.9rem', marginTop: '8px' }}>Por favor, regresa más tarde o contacta al administrador</p>
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
