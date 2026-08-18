import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { LandingPage } from './components/LandingPage.js';
import { Login } from './components/Login.js';
import { CustomAvatar } from './components/CustomAvatar.js';
import { Pizarra2D } from './components/Pizarra2D.js';
import { MetaversoCanvas } from './components/MetaversoCanvas.js';
import { AudioClient } from './components/AudioClient.js';
import { AdminPanel } from './components/AdminPanel.js';
import { TeacherPanel } from './components/TeacherPanel.js';
import { SolicitudAccesoModal } from './components/SolicitudAccesoModal.js';
import { CrearCursoModal } from './components/CrearCursoModal.js';

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

interface PosicionGuardada {
  position: [number, number, number];
  rotation: [number, number, number];
}

interface Avatar {
  id: string;
  nombre_visible: string;
  modelo_url: string | null;
  apariencia: any;
  ultima_posicion?: PosicionGuardada | null;
}

interface Espacio {
  id: string;
  nombre: string;
  tipo: 'campus' | 'aula';
  asignatura_id: string | null;
  asignatura?: string;
  asignatura_codigo?: string;
  // Docente dueño de la asignatura del aula, independiente de si hay clase en curso;
  // se usa para agrupar las aulas de un mismo docente en el Campus 3D.
  docente_id?: string | null;
  docente_nombre?: string | null;
  docente_apellido?: string | null;
  sesion_activa?: any;
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
  const [spawnPosicion, setSpawnPosicion] = useState<PosicionGuardada | null>(null);
  const [menuAbierto, setMenuAbierto] = useState(false);
  // Última posición conocida DENTRO del campus en esta sesión (se fotografía al salir de
  // él), para que "Salir al Campus" no dependa de un viaje de ida y vuelta al servidor.
  const ultimaPosicionCampusRef = useRef<PosicionGuardada | null>(null);

  // Conexiones Sockets y WebRTC (socketRef síncrono para evitar cierres de estado desactualizados)
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocketState] = useState<Socket | null>(null);

  const setSocket = useCallback((s: Socket | null) => {
    socketRef.current = s;
    setSocketState(s);
  }, []);

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
  const [verReporte, setVerReporte] = useState(false);
  const [reporteAsistencia, setReporteAsistencia] = useState<any[]>([]);
  const [resumenAsistencia, setResumenAsistencia] = useState<{ total_inscritos: number; presentes: number; tardes: number; ausentes: number } | null>(null);

  // Interacción de Aulas y Solicitudes de Acceso
  const [solicitudAulaModal, setSolicitudAulaModal] = useState<Espacio | null>(null);
  const [solicitudesPendientesDocente, setSolicitudesPendientesDocente] = useState<any[]>([]);
  const [mostrarCrearCursoModal, setMostrarCrearCursoModal] = useState(false);

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

  // Tema (Claro / Oscuro)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.body.className = theme === 'light' ? 'light-mode' : 'dark-mode';
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

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

  // Cargar espacios disponibles (usuarios/roles con permiso ven todo; invitados solo campus)
  const fetchEspacios = useCallback(() => {
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

  // Cargar espacios disponibles cuando el usuario inicia sesión
  useEffect(() => {
    fetchEspacios();
  }, [fetchEspacios]);

  // Inicializar Socket persistente para el usuario autenticado
  useEffect(() => {
    if (!token || !user) return;

    if (!socketRef.current || !socketRef.current.connected) {
      const activeSocket = io();
      setSocket(activeSocket);
    }

    const activeSocket = socketRef.current!;

    const handleNuevaSolicitud = (solicitud: any) => {
      const esDocente = user?.rol === 'docente' || (user as any)?.roles?.includes('docente');
      if (esDocente && String(solicitud.usuario?.id) !== String(user?.id)) {
        console.log('📩 Solicitud de acceso recibida para docente:', solicitud);
        setSolicitudesPendientesDocente((prev) => [...prev, solicitud]);
      }
    };

    const handleRespuestaSolicitud = (data: { espacioId: string; aprobado: boolean }) => {
      if (data.aprobado) {
        console.log('🎉 Solicitud aprobada a nivel global. Uniéndose al espacio:', data.espacioId);
        setSolicitudAulaModal(null);
        setEspacios((currentEspacios) => {
          const targetEspacio = currentEspacios.find((e) => String(e.id) === String(data.espacioId));
          if (targetEspacio) {
            setTimeout(() => handleJoinSpace(targetEspacio), 100);
          }
          return currentEspacios;
        });
      }
    };

    const handleSessionTerminated = (data: { reason: string }) => {
      alert(`⚠️ ${data.reason || 'Se ha iniciado sesión desde otro dispositivo con esta cuenta.'}`);
      handleLogout();
    };

    activeSocket.off('nueva_solicitud_acceso', handleNuevaSolicitud);
    activeSocket.off('respuesta_solicitud_acceso', handleRespuestaSolicitud);
    activeSocket.off('session_terminated', handleSessionTerminated);

    activeSocket.on('nueva_solicitud_acceso', handleNuevaSolicitud);
    activeSocket.on('respuesta_solicitud_acceso', handleRespuestaSolicitud);
    activeSocket.on('session_terminated', handleSessionTerminated);

    return () => {
      activeSocket.off('nueva_solicitud_acceso', handleNuevaSolicitud);
      activeSocket.off('respuesta_solicitud_acceso', handleRespuestaSolicitud);
      activeSocket.off('session_terminated', handleSessionTerminated);
    };
  }, [token, user]);

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
  const handleJoinSpace = (espacio: Espacio, posicionInicial?: PosicionGuardada) => {
    if (espacioActivo?.id === espacio.id && socketRef.current && socketRef.current.connected) {
      console.log('⚠️ Ya estás conectado a este espacio:', espacio.nombre);
      return;
    }

    if (user?.rol === 'invitado' && espacio.tipo === 'aula') {
      alert(
        '❌ Los invitados solo pueden acceder al campus.\n\nPara acceder a las aulas, debes registrarte e iniciar sesión con tu cuenta UPDS.'
      );
      return;
    }

    fetchEspacios();

    if (audioClient) {
      audioClient.destroy();
      setAudioClient(null);
    }
    setRemoteUsers({});
    const tieneSesionEnCurso = !!espacio.sesion_activa && espacio.sesion_activa.estado === 'en_curso';
    setSesionClase(tieneSesionEnCurso ? espacio.sesion_activa : null);

    setEspacioActivo(espacio);
    sessionStorage.setItem('espacioActivo', JSON.stringify(espacio));
    setChatMessages([]);
    setSpawnPosicion(posicionInicial ?? null);

    const esDocente = user?.rol === 'docente' || (user as any)?.roles?.includes('docente');
    if (esDocente && espacio.tipo === 'aula' && !tieneSesionEnCurso) {
      setMostrarCrearCursoModal(true);
    }

    // 1. Reutilizar o inicializar el socket persistente de la pestaña
    if (!socketRef.current || !socketRef.current.connected) {
      const newSocket = io();
      setSocket(newSocket);
    }

    const activeSocket = socketRef.current!;

    activeSocket.off('space_users');
    activeSocket.off('current_users');
    activeSocket.off('user_joined');
    activeSocket.off('user_left');
    activeSocket.off('user_moved');
    activeSocket.off('chat_message');
    activeSocket.off('pizarra_actualizada');
    activeSocket.off('clase_iniciada');
    activeSocket.off('clase_finalizada');

    const uniquePeerId = `peer_${user?.id || 'guest'}_${Math.random().toString(36).substring(2, 7)}`;

    let joinedSpace = false;
    const emitJoin = (pId?: string) => {
      if (joinedSpace) return;
      joinedSpace = true;
      activeSocket.emit('join_space', {
        espacioId: espacio.id,
        espacioTipo: espacio.tipo,
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
      uniquePeerId,
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

    activeSocket.on('space_users', handleInitialUsers);
    activeSocket.on('current_users', handleInitialUsers);

    activeSocket.on('user_joined', (data: any) => {
      console.log('👤 Nuevo usuario unido al espacio:', data.user.nombreVisible || data.socketId);
      setRemoteUsers((prev) => ({ ...prev, [data.socketId]: data.user }));
      // NOTA: Los usuarios existentes NO llaman al recién llegado para evitar llamadas cruzadas (SDP Glare).
      // El recién llegado se encarga de llamar a todos los usuarios existentes al recibir 'space_users'.
    });

    activeSocket.on('user_left', (data: any) => {
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

    activeSocket.on('user_moved', (data: any) => {
      setRemoteUsers((prev) => {
        const existing = prev[data.socketId] || {};
        return {
          ...prev,
          [data.socketId]: {
            ...existing,
            position: data.position,
            rotation: data.rotation,
            estaSentado: data.estaSentado,
          },
        };
      });
    });

    activeSocket.on('chat_message', (data: any) => {
      setChatMessages((prev) => [...prev, data]);
    });

    activeSocket.on('pizarra_actualizada', (_data: any) => {});

    activeSocket.on('clase_iniciada', (sesion: any) => {
      console.log('🎓 Notificación de clase iniciada recibida:', sesion);
      setSesionClase(sesion);
      if (sesion && sesion.espacio_id) {
        const sesionObj = {
          id: sesion.id,
          tema: sesion.tema,
          inicio: sesion.inicio_real,
          estado: sesion.estado,
          docente: sesion.docente_nombre ? `${sesion.docente_nombre} ${sesion.docente_apellido}` : null,
        };
        setEspacios((prev) =>
          prev.map((e) =>
            String(e.id) === String(sesion.espacio_id)
              ? {
                  ...e,
                  sesion_activa: sesionObj,
                }
              : e
          )
        );
      }
    });

    activeSocket.on('clase_finalizada', (data: { espacioId: string }) => {
      if (espacioActivo && String(espacioActivo.id) === String(data.espacioId)) {
        setSesionClase(null);
        setEspacioActivo((prev) => (prev ? { ...prev, sesion_activa: null } : null));
      }
      setEspacios((prev) =>
        prev.map((e) => (String(e.id) === String(data.espacioId) ? { ...e, sesion_activa: null } : e))
      );
    });

    // 'nueva_solicitud_acceso' y 'respuesta_solicitud_acceso' NO se registran acá: el
    // efecto de socket persistente (más abajo) ya los maneja para toda la sesión, y
    // duplicarlos acá causaba solicitudes repetidas / handleJoinSpace disparado más de
    // una vez cada vez que este handler se re-ejecuta sin pasar por un disconnect.

    navigateTo('/metaverso');
  };

  // Rastrea la posición actual del avatar mientras está en el campus (no en aulas),
  // para que "Salir al Campus" pueda volver ahí sin depender de una ida y vuelta al servidor.
  const handleAvatarPositionChange = (pos: [number, number, number], rot: [number, number, number]) => {
    if (espacioActivo?.tipo === 'campus') {
      ultimaPosicionCampusRef.current = { position: pos, rotation: rot };
    }
  };

  // Volver al campus desde un aula, en la última posición conocida (de esta sesión, o si no
  // la hay -p. ej. se restauró directo en un aula tras F5- la que quedó guardada en la BD).
  const handleVolverAlCampus = () => {
    const campus = espacios.find((e) => e.tipo === 'campus');
    if (!campus) return;
    handleJoinSpace(campus, ultimaPosicionCampusRef.current ?? avatar?.ultima_posicion ?? undefined);
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
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      setSocket(null);
    }
    if (audioClient) audioClient.destroy();
    navigateTo('/');
  };

  // Consultar reporte de asistencia (Docente)
  const fetchAsistenciasReport = async () => {
    if (!sesionClase) return;
    try {
      const res = await fetch(`/api/asistencias/reporte/${sesionClase.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setReporteAsistencia(data.asistencias);
        setResumenAsistencia(data.resumen);
        setVerReporte(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Finalizar la sesión de clase en curso (Docente dueño o Administrador)
  const handleFinalizarClase = async () => {
    if (!espacioActivo || !sesionClase) return;
    if (!confirm('¿Estás seguro de que deseas finalizar la clase actual? El aula volverá a estar disponible.')) return;

    try {
      const res = await fetch(`/api/sesiones/${sesionClase.id}/finalizar`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSesionClase(null);
      setVerReporte(false);
      setEspacioActivo((prev) => (prev ? { ...prev, sesion_activa: null } : null));
      setEspacios((prev) =>
        prev.map((e) => (String(e.id) === String(espacioActivo.id) ? { ...e, sesion_activa: null } : e))
      );
      if (socket) {
        socket.emit('clase_finalizada', { espacioId: espacioActivo.id });
      }
      alert('✅ Clase finalizada con éxito. El aula ahora está libre.');
    } catch (err: any) {
      alert(`Error al finalizar clase: ${err.message}`);
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

  // Adónde volver al cerrar Panel Admin / Mis Clases (llegados ahí desde el menú
  // hamburguesa dentro del metaverso): si había una sesión 3D activa, volvemos a ella
  // en vez de a /espacios (que ya no tiene un dashboard que mostrar).
  const volverDesdeGestion = () => {
    navigateTo(espacioActivo ? '/metaverso' : '/espacios');
  };

  // Si sessionStorage restauró un espacio activo pero el hash de la URL no apunta a
  // /metaverso (sesión anterior desincronizada, o se abrió directo en otra ruta), queda
  // un estado inconsistente que no renderiza nada Y bloquea el auto-join de abajo
  // (porque espacioActivo ya no es null). Lo limpiamos para que pueda arrancar de cero.
  useEffect(() => {
    if (espacioActivo && route !== '/metaverso') {
      setEspacioActivo(null);
      sessionStorage.removeItem('espacioActivo');
    }
  }, [espacioActivo, route]);

  // Entrar directo al campus apenas hay sesión y los espacios ya cargaron.
  useEffect(() => {
    if (!token || !user) return;
    if (espacioActivo) return;
    if (route === '/admin' || route === '/docente') return;
    if (espacios.length === 0) return;

    const campus = espacios.find((e) => e.tipo === 'campus');
    if (campus) handleJoinSpace(campus, avatar?.ultima_posicion ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user, espacios, espacioActivo, route]);

  // RENDERIZADO DE RUTAS DE NAVEGACIÓN INDEPENDIENTES

  // 1. Ruta / (Landing Page)
  if (route === '/') {
    return (
      <LandingPage
        onNavigateLogin={() => navigateTo('/login')}
        onGuestLoginDirect={handleGuestLoginDirect}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 2. Ruta /login (Formulario de Autenticación)
  if (route === '/login') {
    return (
      <Login
        theme={theme}
        onToggleTheme={toggleTheme}
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
        theme={theme}
        onToggleTheme={toggleTheme}
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
      volverDesdeGestion();
      return null;
    }
    return <AdminPanel token={token} onClose={volverDesdeGestion} />;
  }

  // 4. Ruta /docente (Panel del Docente)
  if (route === '/docente') {
    if (!isDocente) {
      volverDesdeGestion();
      return null;
    }
    return <TeacherPanel token={token} user={user} onClose={volverDesdeGestion} />;
  }

  // 5. Ruta /metaverso (Escenario 3D)
  if (route === '/metaverso' && espacioActivo) {
    return (
      <div className="metaverso-wrapper" style={{ width: '100vw', height: '100vh', position: 'relative' }}>
        {/* Canvas 3D de Three.js */}
        <MetaversoCanvas
          key={espacioActivo.id}
          socket={socket!}
          audioClient={audioClient}
          isAula={espacioActivo.tipo === 'aula'}
          espacioId={espacioActivo.id}
          localAvatar={{ ...user, apariencia: avatar?.apariencia }}
          remoteUsers={remoteUsers}
          espacios={espacios}
          spawnPosicion={spawnPosicion}
          onPositionChange={handleAvatarPositionChange}
          onInteractuarAula={(espacioSeleccionado) => setSolicitudAulaModal(espacioSeleccionado)}
          onUpdateAvatarPersonalization={(nuevaApariencia) => {
            setAvatar((prev) => {
              const updated = prev ? { ...prev, apariencia: nuevaApariencia } : null;
              if (updated) localStorage.setItem('avatar', JSON.stringify(updated));
              return updated;
            });
          }}
        />

        {/* Menú Hamburguesa */}
        <div className="hamburger-menu">
          <button className="hamburger-btn" onClick={() => setMenuAbierto((v) => !v)} title="Menú">
            ☰
          </button>
          {menuAbierto && (
            <div className="hamburger-dropdown glass-panel">
              <button
                className="hamburger-item"
                onClick={() => {
                  setMenuAbierto(false);
                  toggleTheme();
                }}
              >
                {theme === 'light' ? '🌙 Oscuro' : '☀️ Claro'}
              </button>
              {isAdmin && (
                <button
                  className="hamburger-item"
                  onClick={() => {
                    setMenuAbierto(false);
                    navigateTo('/admin');
                  }}
                >
                  🛡️ Panel Admin
                </button>
              )}
              {isDocente && (
                <button
                  className="hamburger-item"
                  onClick={() => {
                    setMenuAbierto(false);
                    navigateTo('/docente');
                  }}
                >
                  🎓 Mis Clases
                </button>
              )}
              {!user.isGuest && (
                <button
                  className="hamburger-item"
                  onClick={() => {
                    setMenuAbierto(false);
                    setCustomizingAvatar(true);
                  }}
                >
                  🎨 Avatar
                </button>
              )}
              <button
                className="hamburger-item hamburger-item-danger"
                onClick={() => {
                  setMenuAbierto(false);
                  handleLogout();
                }}
              >
                🚪 Logout
              </button>
            </div>
          )}
        </div>

        {/* Personalización de Avatar (persistida en BD) */}
        {customizingAvatar && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000 }}>
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
            <span className="key-cap">E</span>
            <span>Ingresar a Aula cercana</span>
          </div>
          <div className="keys-row">
            <span>Arrastra el mouse para rotar la cámara</span>
          </div>
        </div>

        {/* Barra superior HUD */}
        <div className="overlay-panel top-bar glass-panel">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <h2 className="gradient-text" style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
              {espacioActivo.nombre}
            </h2>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px', flexWrap: 'wrap' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, whiteSpace: 'nowrap' }}>
                Conectados: {Object.keys(remoteUsers).length + 1} usuarios
              </p>
              {espacioActivo.tipo === 'aula' && (
                <span
                  style={{
                    background: 'rgba(59, 130, 246, 0.15)',
                    color: '#60a5fa',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    padding: '2px 8px',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  🔑 Código: {espacioActivo.asignatura_codigo || `SIS-${espacioActivo.id}`}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {user.rol === 'docente' && espacioActivo.tipo === 'aula' && (
              <>
                {!sesionClase ? (
                  <button
                    className="btn-primary"
                    style={{ margin: 0, padding: '6px 14px', fontSize: '0.85rem', background: 'linear-gradient(135deg, #059669, #10b981)' }}
                    onClick={() => setMostrarCrearCursoModal(true)}
                  >
                    🎓 Ocupar Aula / Iniciar Clase
                  </button>
                ) : (
                  <>
                    <button
                      className="btn-primary"
                      style={{ margin: 0, padding: '6px 12px', fontSize: '0.85rem', background: 'var(--success)' }}
                      onClick={fetchAsistenciasReport}
                    >
                      Reporte Asistencia
                    </button>
                    <button
                      className="btn-secondary"
                      style={{
                        margin: 0,
                        padding: '6px 12px',
                        fontSize: '0.85rem',
                        background: 'rgba(239, 68, 68, 0.2)',
                        color: '#fca5a5',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        cursor: 'pointer',
                      }}
                      onClick={handleFinalizarClase}
                    >
                      🛑 Finalizar Clase
                    </button>
                  </>
                )}
              </>
            )}

            {espacioActivo.tipo === 'aula' && (
              <button className="btn-secondary" onClick={handleVolverAlCampus}>
                Salir al Campus
              </button>
            )}
          </div>
        </div>

        {/* Modal de Creación de Curso para el Docente en Aula Vacía */}
        {mostrarCrearCursoModal && espacioActivo && (
          <CrearCursoModal
            espacio={espacioActivo}
            token={token}
            onCursoCreado={({ sesion, asignatura_codigo, asignatura_nombre }) => {
              setSesionClase(sesion);
              const sesionObj = {
                id: sesion.id,
                tema: sesion.tema,
                inicio: sesion.inicio_real,
                estado: sesion.estado,
                docente: user ? `${user.nombre} ${user.apellido}` : null,
              };
              setEspacioActivo((prev) =>
                prev
                  ? {
                      ...prev,
                      asignatura_codigo,
                      asignatura: asignatura_nombre,
                      sesion_activa: sesionObj,
                    }
                  : null
              );
              setEspacios((prev) =>
                prev.map((e) =>
                  String(e.id) === String(espacioActivo.id)
                    ? {
                        ...e,
                        asignatura_codigo,
                        asignatura: asignatura_nombre,
                        sesion_activa: sesionObj,
                      }
                    : e
                )
              );
              setMostrarCrearCursoModal(false);
              if (socket) {
                socket.emit('clase_iniciada', {
                  ...sesion,
                  docente_nombre: user?.nombre,
                  docente_apellido: user?.apellido,
                });
              }
            }}
            onClose={() => setMostrarCrearCursoModal(false)}
          />
        )}

        {/* Modal de Interacción con Aulas en el Campus */}
        {solicitudAulaModal && (
          <SolicitudAccesoModal
            espacio={solicitudAulaModal}
            usuario={user}
            socket={socket}
            onIngresarDirecto={(espacio) => {
              setSolicitudAulaModal(null);
              handleJoinSpace(espacio);
            }}
            onClose={() => setSolicitudAulaModal(null)}
          />
        )}

        {/* Alerta / Pop-up de Aprobación en Tiempo Real para el Docente */}
        {solicitudesPendientesDocente.length > 0 && (
          <div className="avatar-customizer-3d-wrapper" style={{ zIndex: 3000 }}>
            <div className="customizer-card glass-panel" style={{ maxWidth: '440px', padding: '24px', textAlign: 'center' }}>
              <h3 className="gradient-text" style={{ fontSize: '1.3rem', margin: '0 0 8px 0' }}>
                📩 Solicitud de Ingreso al Aula
              </h3>
              <p style={{ color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '16px' }}>
                El estudiante <strong>{solicitudesPendientesDocente[0].usuario?.nombre || 'Estudiante'}</strong> solicita ingresar a tu clase.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  className="btn-primary"
                  style={{ background: 'var(--success)', padding: '10px 20px', flex: 1 }}
                  onClick={() => {
                    const reqItem = solicitudesPendientesDocente[0];
                    if (socket) {
                      socket.emit('responder_solicitud_acceso', {
                        estudianteSocketId: reqItem.estudianteSocketId,
                        espacioId: reqItem.espacioId,
                        aprobado: true,
                      });
                    }
                    setSolicitudesPendientesDocente((prev) => prev.slice(1));
                  }}
                >
                  ✅ Permitir Acceso
                </button>
                <button
                  className="btn-secondary"
                  style={{ background: 'rgba(239,68,68,0.2)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.4)', padding: '10px 20px', flex: 1 }}
                  onClick={() => {
                    const reqItem = solicitudesPendientesDocente[0];
                    if (socket) {
                      socket.emit('responder_solicitud_acceso', {
                        estudianteSocketId: reqItem.estudianteSocketId,
                        espacioId: reqItem.espacioId,
                        aprobado: false,
                      });
                    }
                    setSolicitudesPendientesDocente((prev) => prev.slice(1));
                  }}
                >
                  ❌ Rechazar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pizarra Digital en Vivo (RF-04) */}
        {pizarraAbierta && (
          <Pizarra2D
            socket={socket!}
            espacioId={espacioActivo.id}
            sesionId={sesionClase?.id}
            puedeDibujar={!user.isGuest && user.rol !== 'invitado'}
            puedeAdministrar={isDocente || isAdmin}
            onClose={() => setPizarraAbierta(false)}
          />
        )}

        {/* Reporte de asistencias modal */}
        {verReporte && (
          <div className="customize-panel glass-panel" style={{ width: '600px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 className="gradient-text" style={{ fontSize: '1.4rem', fontWeight: 600, marginBottom: '16px' }}>
              Reporte de Asistencia Automática
            </h3>
            {resumenAsistencia && (
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Inscritos: <strong style={{ color: 'white' }}>{resumenAsistencia.total_inscritos}</strong></span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Presentes: <strong style={{ color: 'var(--success)' }}>{resumenAsistencia.presentes}</strong></span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Tarde: <strong style={{ color: '#f59e0b' }}>{resumenAsistencia.tardes}</strong></span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Ausentes: <strong style={{ color: '#ef4444' }}>{resumenAsistencia.ausentes}</strong></span>
              </div>
            )}
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

  // 6. Ruta /espacios (Default) - solo se ve un instante entre el login y que el
  // efecto de auto-join encuentre el campus y navegue a /metaverso; o si no hay
  // ningún espacio tipo 'campus' activo (caso de error, ej. un admin lo desactivó).
  return (
    <div className="dashboard-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', maxWidth: '420px' }}>
        {espacios.length === 0 ? (
          <>
            <span className="spinner" style={{ width: '28px', height: '28px', display: 'inline-block', marginBottom: '12px' }}></span>
            <p style={{ color: 'var(--text-secondary)' }}>Entrando al campus…</p>
          </>
        ) : (
          <>
            <p style={{ marginBottom: '16px' }}>No se pudo cargar el campus. Intenta más tarde.</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {isAdmin && (
                <button className="btn-primary" onClick={() => navigateTo('/admin')}>
                  🛡️ Panel Admin
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
          </>
        )}
      </div>
    </div>
  );
}

export default App;
