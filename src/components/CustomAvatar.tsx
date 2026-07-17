import React, { useState } from 'react';

interface CustomAvatarProps {
  currentAvatar: any;
  token: string;
  onSaveSuccess: (updatedAvatar: any) => void;
  onClose: () => void;
}

export const CustomAvatar: React.FC<CustomAvatarProps> = ({
  currentAvatar,
  token,
  onSaveSuccess,
  onClose
}) => {
  const [nombreVisible, setNombreVisible] = useState(currentAvatar?.nombre_visible || '');
  const [colorCabello, setColorCabello] = useState(currentAvatar?.apariencia?.colorCabello || '#2a1a0a');
  const [colorCamisa, setColorCamisa] = useState(currentAvatar?.apariencia?.colorCamisa || '#1a5ba8');
  const [colorPantalon, setColorPantalon] = useState(currentAvatar?.apariencia?.colorPantalon || '#333333');
  const [escala, setEscala] = useState(currentAvatar?.apariencia?.escala || 1.0);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSave = async () => {
    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('http://localhost:3001/api/avatar/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          nombre_visible: nombreVisible,
          modelo_url: null, // De momento usaremos avatares locales sencillos 3D
          apariencia: {
            colorCabello,
            colorCamisa,
            colorPantalon,
            escala
          }
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar personalización');
      }

      localStorage.setItem('avatar', JSON.stringify(data.avatar));
      onSaveSuccess(data.avatar);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="customize-panel glass-panel">
      <h3 className="gradient-text" style={{ fontSize: '1.4rem', fontWeight: 600, marginBottom: '16px' }}>
        Personalizar Avatar
      </h3>

      {errorMsg && (
        <div style={{ color: 'var(--error)', fontSize: '0.85rem', marginBottom: '12px' }}>
          ⚠️ {errorMsg}
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Nombre que verán los demás</label>
        <input
          type="text"
          className="form-input"
          value={nombreVisible}
          onChange={(e) => setNombreVisible(e.target.value)}
          placeholder="Tu apodo o nombre"
          required
        />
      </div>

      <div className="color-picker-grid">
        <div className="color-picker-field">
          <label className="form-label">Color de Cabello</label>
          <input
            type="color"
            value={colorCabello}
            onChange={(e) => setColorCabello(e.target.value)}
          />
        </div>

        <div className="color-picker-field">
          <label className="form-label">Color de Camisa</label>
          <input
            type="color"
            value={colorCamisa}
            onChange={(e) => setColorCamisa(e.target.value)}
          />
        </div>

        <div className="color-picker-field">
          <label className="form-label">Color de Pantalón</label>
          <input
            type="color"
            value={colorPantalon}
            onChange={(e) => setColorPantalon(e.target.value)}
          />
        </div>

        <div className="color-picker-field">
          <label className="form-label">Altura del Avatar ({escala.toFixed(1)}x)</label>
          <input
            type="range"
            min="0.8"
            max="1.3"
            step="0.05"
            value={escala}
            onChange={(e) => setEscala(parseFloat(e.target.value))}
            style={{ width: '100%', height: '40px', cursor: 'pointer' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
        <button
          onClick={handleSave}
          className="btn-primary"
          style={{ margin: 0, flex: 1 }}
          disabled={loading}
        >
          {loading ? 'Guardando...' : 'Guardar y Salir'}
        </button>
        <button
          onClick={onClose}
          className="btn-secondary"
          style={{ flex: 1 }}
          disabled={loading}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
};
