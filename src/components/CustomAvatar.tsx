import React, { useState } from 'react';
import { AvatarCustomizer3D } from './AvatarCustomizer3D.js';
import { PERSONALIZACION_POR_DEFECTO, type PersonalizacionAvatar } from './mundo3d/AvatarModel.js';

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
  onClose,
}) => {
  const [loading, setLoading] = useState(false);

  const handleSave = async (aparienciaNueva: PersonalizacionAvatar) => {
    setLoading(true);

    try {
      const res = await fetch('/api/avatar/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nombre_visible: currentAvatar?.nombre_visible || 'Estudiante UPDS',
          modelo_url: null,
          apariencia: aparienciaNueva,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar personalización');
      }

      localStorage.setItem('avatar', JSON.stringify(data.avatar));
      onSaveSuccess(data.avatar);
    } catch (err: any) {
      alert('⚠️ ' + (err.message || 'Error al conectar con el servidor'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AvatarCustomizer3D
      nombreVisible={currentAvatar?.nombre_visible || 'Estudiante'}
      aparienciaInicial={currentAvatar?.apariencia || PERSONALIZACION_POR_DEFECTO}
      title="🎨 Personalizar Tu Avatar 3D"
      subtitle="Arrastra con el mouse para rotar a tu personaje 360°"
      saveButtonText={loading ? 'Guardando...' : '💾 Guardar Cambios'}
      showSkipButton={false}
      onSave={handleSave}
      onCancel={onClose}
    />
  );
};
