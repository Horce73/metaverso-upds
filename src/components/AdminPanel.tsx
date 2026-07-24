import React, { useState } from 'react';

interface AdminPanelProps {
  token: string;
  onClose: () => void;
}

interface User {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: string;
  activo: boolean;
  creado_en: string;
}

interface Espacio {
  id: string;
  nombre: string;
  tipo: 'campus' | 'aula';
  capacidad_max: number;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ token: _token, onClose }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'spaces' | 'reports'>('dashboard');
  const [showNewUserForm, setShowNewUserForm] = useState(false);
  const [showNewSpaceForm, setShowNewSpaceForm] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', nombre: '', apellido: '', rol: 'estudiante' });
  const [newSpace, setNewSpace] = useState({ nombre: '', tipo: 'campus', capacidad_max: 50 });

  // Datos simulados para demostración
  const mockUsers: User[] = [
    { id: '1', email: 'admin@upds.edu.bo', nombre: 'Admin', apellido: 'UPDS', rol: 'admin', activo: true, creado_en: '2024-01-15' },
    { id: '2', email: 'docente.isw@upds.edu.bo', nombre: 'Carlos', apellido: 'Mendoza', rol: 'docente', activo: true, creado_en: '2024-02-20' },
    { id: '3', email: 'ana.rojas@upds.edu.bo', nombre: 'Ana', apellido: 'Rojas', rol: 'estudiante', activo: true, creado_en: '2024-03-10' }
  ];

  const mockSpaces: Espacio[] = [
    { id: '1', nombre: 'Campus Central UPDS', tipo: 'campus', capacidad_max: 1000 },
    { id: '2', nombre: 'Aula Ingenieria de Software', tipo: 'aula', capacidad_max: 50 }
  ];

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    alert('✅ Usuario creado: ' + newUser.email);
    setNewUser({ email: '', password: '', nombre: '', apellido: '', rol: 'estudiante' });
    setShowNewUserForm(false);
  };

  const handleCreateSpace = (e: React.FormEvent) => {
    e.preventDefault();
    alert('✅ Espacio creado: ' + newSpace.nombre);
    setNewSpace({ nombre: '', tipo: 'campus', capacidad_max: 50 });
    setShowNewSpaceForm(false);
  };

  return (
    <div className="admin-panel">
      {/* Header Admin */}
      <div className="admin-header">
        <div>
          <h1 className="gradient-text">🛡️ Panel de Administración UPDS</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0 0', fontSize: '0.9rem' }}>
            Control total del sistema educativo virtual
          </p>
        </div>
        <button className="btn-secondary" onClick={onClose} style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)', color: 'var(--error)' }}>
          ✕ Cerrar
        </button>
      </div>

      {/* Tabs de Navegación */}
      <div className="admin-tabs">
        <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          📊 Dashboard
        </button>
        <button className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          👥 Usuarios
        </button>
        <button className={`tab-btn ${activeTab === 'spaces' ? 'active' : ''}`} onClick={() => setActiveTab('spaces')}>
          🏢 Espacios
        </button>
        <button className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
          📈 Reportes
        </button>
      </div>

      {/* Contenido */}
      <div className="admin-content glass-panel">
        {/* Dashboard */}
        {activeTab === 'dashboard' && (
          <div className="admin-section">
            <h2>Overview del Sistema</h2>
            <div className="dashboard-stats">
              <div className="stat-card">
                <div className="stat-icon">👥</div>
                <div className="stat-content">
                  <p className="stat-label">Usuarios Activos</p>
                  <p className="stat-number">{mockUsers.length}</p>
                  <p className="stat-desc">+2 esta semana</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">🎓</div>
                <div className="stat-content">
                  <p className="stat-label">Docentes</p>
                  <p className="stat-number">{mockUsers.filter(u => u.rol === 'docente').length}</p>
                  <p className="stat-desc">Enseñando cursos</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📚</div>
                <div className="stat-content">
                  <p className="stat-label">Estudiantes</p>
                  <p className="stat-number">{mockUsers.filter(u => u.rol === 'estudiante').length}</p>
                  <p className="stat-desc">Registrados</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">🏫</div>
                <div className="stat-content">
                  <p className="stat-label">Espacios</p>
                  <p className="stat-number">{mockSpaces.length}</p>
                  <p className="stat-desc">Campus + Aulas</p>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '40px' }}>
              <h3>Actividad Reciente</h3>
              <div className="activity-log">
                <div className="activity-item">
                  <span className="activity-icon">✓</span>
                  <div className="activity-content">
                    <p>Admin ingresó al sistema</p>
                    <small>Hace 2 minutos</small>
                  </div>
                </div>
                <div className="activity-item">
                  <span className="activity-icon">➕</span>
                  <div className="activity-content">
                    <p>Nuevo estudiante registrado: Luis Garcia</p>
                    <small>Hace 1 hora</small>
                  </div>
                </div>
                <div className="activity-item">
                  <span className="activity-icon">📅</span>
                  <div className="activity-content">
                    <p>Clase iniciada: Ingeniería de Requerimientos</p>
                    <small>Hace 3 horas</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Gestión de Usuarios */}
        {activeTab === 'users' && (
          <div className="admin-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2>Gestión de Usuarios</h2>
              <button className="btn-primary" onClick={() => setShowNewUserForm(!showNewUserForm)}>
                ➕ Nuevo Usuario
              </button>
            </div>

            {showNewUserForm && (
              <form onSubmit={handleCreateUser} className="admin-form glass-panel">
                <h3>Crear Nuevo Usuario</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label>Nombre</label>
                    <input type="text" value={newUser.nombre} onChange={(e) => setNewUser({ ...newUser, nombre: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Apellido</label>
                    <input type="text" value={newUser.apellido} onChange={(e) => setNewUser({ ...newUser, apellido: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Email Institucional</label>
                    <input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Contraseña</label>
                    <input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Rol</label>
                    <select value={newUser.rol} onChange={(e) => setNewUser({ ...newUser, rol: e.target.value })} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--panel-border)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                      <option value="estudiante">Estudiante</option>
                      <option value="docente">Docente</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                  <button type="submit" className="btn-primary">Crear Usuario</button>
                  <button type="button" className="btn-secondary" onClick={() => setShowNewUserForm(false)}>Cancelar</button>
                </div>
              </form>
            )}

            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Registrado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {mockUsers.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.nombre} {u.apellido}</td>
                    <td><span className="badge">{u.rol.toUpperCase()}</span></td>
                    <td><span className="status active">✓ Activo</span></td>
                    <td>{new Date(u.creado_en).toLocaleDateString()}</td>
                    <td>
                      <button className="btn-small">✏️ Editar</button>
                      <button className="btn-small danger">🗑️ Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Gestión de Espacios */}
        {activeTab === 'spaces' && (
          <div className="admin-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2>Gestión de Espacios 3D</h2>
              <button className="btn-primary" onClick={() => setShowNewSpaceForm(!showNewSpaceForm)}>
                ➕ Nuevo Espacio
              </button>
            </div>

            {showNewSpaceForm && (
              <form onSubmit={handleCreateSpace} className="admin-form glass-panel">
                <h3>Crear Nuevo Espacio</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label>Nombre del Espacio</label>
                    <input type="text" value={newSpace.nombre} onChange={(e) => setNewSpace({ ...newSpace, nombre: e.target.value })} placeholder="Ej: Aula de Sistemas" required />
                  </div>
                  <div className="form-group">
                    <label>Tipo</label>
                    <select value={newSpace.tipo} onChange={(e) => setNewSpace({ ...newSpace, tipo: e.target.value as 'campus' | 'aula' })} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--panel-border)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)' }}>
                      <option value="campus">Campus (Público)</option>
                      <option value="aula">Aula (Clase)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Capacidad Máxima</label>
                    <input type="number" value={newSpace.capacidad_max} onChange={(e) => setNewSpace({ ...newSpace, capacidad_max: parseInt(e.target.value) })} min="10" max="1000" />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                  <button type="submit" className="btn-primary">Crear Espacio</button>
                  <button type="button" className="btn-secondary" onClick={() => setShowNewSpaceForm(false)}>Cancelar</button>
                </div>
              </form>
            )}

            <div className="spaces-admin-grid">
              {mockSpaces.map((space) => (
                <div key={space.id} className="space-admin-card glass-panel">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                    <h3>{space.tipo === 'campus' ? '🏫' : '🎓'} {space.nombre}</h3>
                    <span className="badge">{space.tipo === 'campus' ? 'CAMPUS' : 'AULA'}</span>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
                    Capacidad: <strong>{space.capacidad_max} usuarios</strong>
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-small">✏️ Editar</button>
                    <button className="btn-small">👁️ Vista previa</button>
                    <button className="btn-small danger">🗑️ Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reportes */}
        {activeTab === 'reports' && (
          <div className="admin-section">
            <h2>Reportes del Sistema</h2>
            <div className="reports-advanced">
              <div className="report-section glass-panel">
                <h3>📊 Estadísticas de Uso</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                  <div>
                    <p className="report-label">Usuarios en línea ahora</p>
                    <p className="report-value">5</p>
                  </div>
                  <div>
                    <p className="report-label">Clases activas hoy</p>
                    <p className="report-value">3</p>
                  </div>
                  <div>
                    <p className="report-label">Asistencia promedio</p>
                    <p className="report-value">85%</p>
                  </div>
                  <div>
                    <p className="report-label">Usuarios totales</p>
                    <p className="report-value">{mockUsers.length}</p>
                  </div>
                </div>
              </div>

              <div className="report-section glass-panel">
                <h3>🔍 Auditoría del Sistema</h3>
                <div className="audit-log">
                  <div className="audit-entry">
                    <span className="audit-time">20:30</span>
                    <span className="audit-event">Admin accedió al panel</span>
                    <span className="audit-status">✓</span>
                  </div>
                  <div className="audit-entry">
                    <span className="audit-time">20:25</span>
                    <span className="audit-event">Clase iniciada: Ingeniería Software</span>
                    <span className="audit-status">✓</span>
                  </div>
                  <div className="audit-entry">
                    <span className="audit-time">20:15</span>
                    <span className="audit-event">Estudiante ingresó: Luis Garcia</span>
                    <span className="audit-status">✓</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
