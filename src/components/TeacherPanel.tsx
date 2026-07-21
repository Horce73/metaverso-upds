import React, { useState } from 'react';

interface TeacherPanelProps {
  token: string;
  user: any;
  onClose: () => void;
}

export const TeacherPanel: React.FC<TeacherPanelProps> = ({ token, user, onClose }) => {
  const [activeTab, setActiveTab] = useState<'classes' | 'materials' | 'attendance' | 'students'>('classes');
  const [showNewClassForm, setShowNewClassForm] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    fecha: '',
    hora: '',
    duracion: 90
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/docente/clases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        alert('¡Clase creada exitosamente!');
        setShowNewClassForm(false);
        setFormData({ nombre: '', descripcion: '', fecha: '', hora: '', duracion: 90 });
      }
    } catch (err) {
      console.error('Error creando clase:', err);
    }
  };

  return (
    <div className="teacher-panel">
      {/* Header Docente */}
      <div className="teacher-header">
        <h1 className="gradient-text">🎓 Panel de Docente</h1>
        <p>Bienvenido, {user.nombre}</p>
        <button className="btn-secondary" onClick={onClose}>Cerrar</button>
      </div>

      {/* Tabs */}
      <div className="teacher-tabs">
        <button
          className={`tab-btn ${activeTab === 'classes' ? 'active' : ''}`}
          onClick={() => setActiveTab('classes')}
        >
          📅 Mis Clases
        </button>
        <button
          className={`tab-btn ${activeTab === 'materials' ? 'active' : ''}`}
          onClick={() => setActiveTab('materials')}
        >
          📚 Materiales
        </button>
        <button
          className={`tab-btn ${activeTab === 'attendance' ? 'active' : ''}`}
          onClick={() => setActiveTab('attendance')}
        >
          ✓ Asistencia
        </button>
        <button
          className={`tab-btn ${activeTab === 'students' ? 'active' : ''}`}
          onClick={() => setActiveTab('students')}
        >
          👥 Estudiantes
        </button>
      </div>

      {/* Content */}
      <div className="teacher-content glass-panel">
        {activeTab === 'classes' && (
          <div className="teacher-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2>Mis Clases</h2>
              <button 
                className="btn-primary"
                onClick={() => setShowNewClassForm(!showNewClassForm)}
              >
                + Nueva Clase
              </button>
            </div>

            {showNewClassForm && (
              <form onSubmit={handleCreateClass} className="class-form glass-panel">
                <h3>Crear Nueva Clase</h3>
                
                <div className="form-group">
                  <label>Nombre de la Clase</label>
                  <input
                    type="text"
                    name="nombre"
                    value={formData.nombre}
                    onChange={handleInputChange}
                    placeholder="Ej: Unidad 5 - Diseño de Software"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Descripción</label>
                  <textarea
                    name="descripcion"
                    value={formData.descripcion}
                    onChange={handleInputChange}
                    placeholder="Descripción de la clase..."
                    rows={3}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>Fecha</label>
                    <input
                      type="date"
                      name="fecha"
                      value={formData.fecha}
                      onChange={handleInputChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Hora</label>
                    <input
                      type="time"
                      name="hora"
                      value={formData.hora}
                      onChange={handleInputChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Duración (minutos)</label>
                    <input
                      type="number"
                      name="duracion"
                      value={formData.duracion}
                      onChange={handleInputChange}
                      min="30"
                      max="180"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="submit" className="btn-primary">Crear Clase</button>
                  <button 
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowNewClassForm(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}

            <div className="classes-list">
              <div className="class-card glass-panel">
                <h3>Ingeniería de Requerimientos</h3>
                <p className="class-date">📅 Hoy • 19:00 - 20:30</p>
                <p className="class-desc">Continuación de la unidad de requerimientos software</p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button className="btn-small">Editar</button>
                  <button className="btn-small">Iniciar Clase</button>
                  <button className="btn-small danger">Cancelar</button>
                </div>
              </div>

              <div className="class-card glass-panel">
                <h3>Diseño de Arquitectura</h3>
                <p className="class-date">📅 Mañana • 18:00 - 19:30</p>
                <p className="class-desc">Patrones de diseño y arquitectura de software</p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button className="btn-small">Editar</button>
                  <button className="btn-small">Ver Detalles</button>
                  <button className="btn-small danger">Cancelar</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'materials' && (
          <div className="teacher-section">
            <h2>Mis Materiales</h2>
            <button className="btn-primary" style={{ marginBottom: '24px' }}>+ Subir Material</button>
            <p style={{ color: 'var(--text-secondary)' }}>Gestiona PDF, presentaciones e imágenes para tus clases.</p>
          </div>
        )}

        {activeTab === 'attendance' && (
          <div className="teacher-section">
            <h2>Asistencia de Estudiantes</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Visualiza y gestiona la asistencia automática de tus clases.</p>
          </div>
        )}

        {activeTab === 'students' && (
          <div className="teacher-section">
            <h2>Mis Estudiantes</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Lista de estudiantes inscritos en tus asignaturas.</p>
          </div>
        )}
      </div>
    </div>
  );
};
