import { useState, useEffect, useRef, useCallback } from 'react';

export type AdminTab = 'dashboard' | 'usuarios' | 'espacios' | 'carreras' | 'asignaturas' | 'reportes';

export interface TourStep {
  id: string;
  tab: AdminTab;
  title: string;
  badge: string;
  text: string;
  highlightNote: string;
}

export const ADMIN_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    tab: 'dashboard',
    title: 'Bienvenido al Modo Administrador',
    badge: 'Paso 1 de 8',
    text: '¡Bienvenido al Panel de Control del Metaverso UPDS! Este tutorial guiado por voz te mostrará todas las herramientas de gestión disponibles para administrar el campus virtual, los usuarios, aulas y configuraciones del sistema.',
    highlightNote: 'Centro de control integral del Metaverso UPDS.',
  },
  {
    id: 'dashboard',
    tab: 'dashboard',
    title: 'Dashboard y Estadísticas Globales',
    badge: 'Paso 2 de 8',
    text: 'En el Dashboard principal podrás supervisar en tiempo real el total de usuarios registrados, estudiantes activos, docentes y la distribución de roles. También puedes ver métricas del servidor y el estado de la plataforma.',
    highlightNote: 'Visualiza métricas, tráfico en vivo y resumen de usuarios.',
  },
  {
    id: 'usuarios',
    tab: 'usuarios',
    title: 'Gestión de Usuarios y Roles',
    badge: 'Paso 3 de 8',
    text: 'En la sección de Usuarios puedes registrar nuevos miembros, asignar roles de Estudiante, Docente o Administrador, modificar permisos, resetear contraseñas y dar de baja cuentas inactivas.',
    highlightNote: 'Crea, edita o bloquea cuentas de acceso al sistema.',
  },
  {
    id: 'espacios',
    tab: 'espacios',
    title: 'Gestión de Espacios y Aulas 3D',
    badge: 'Paso 4 de 8',
    text: 'Aquí administras los entornos virtuales en 3D. Puedes configurar el Campus Virtual principal o crear Aulas 3D temáticas vinculadas a asignaturas específicas, controlando la capacidad máxima de avatares.',
    highlightNote: 'Configura el Campus Virtual y asigna Aulas 3D.',
  },
  {
    id: 'carreras',
    tab: 'carreras',
    title: 'Administración de Carreras Académicas',
    badge: 'Paso 5 de 8',
    text: 'En este módulo registras y gestionas las facultades y carreras de la universidad. Define la sigla oficial, el título académico a otorgar y el sistema de enseñanza, como el modelo modular o por competencias.',
    highlightNote: 'Registra nuevas ofertas académicas y carreras.',
  },
  {
    id: 'asignaturas',
    tab: 'asignaturas',
    title: 'Gestión de Asignaturas y Docentes',
    badge: 'Paso 6 de 8',
    text: 'En Asignaturas asocias las materias con su respectiva carrera y docente titular. Permite organizar las gestiones académicas y preparar los contenidos para las clases virtuales.',
    highlightNote: 'Asigna docentes y códigos a cada materia académica.',
  },
  {
    id: 'reportes',
    tab: 'reportes',
    title: 'Bitácora y Registro de Auditoría',
    badge: 'Paso 7 de 8',
    text: 'La sección de Reportes y Bitácora guarda el historial completo de eventos del sistema. Permite a los auditores revisar inicios de sesión, cambios en la base de datos, direcciones IP y acciones realizadas por cada usuario.',
    highlightNote: 'Trazabilidad y registro de seguridad de todos los eventos.',
  },
  {
    id: 'finish',
    tab: 'dashboard',
    title: '¡Tutorial Completado!',
    badge: 'Paso 8 de 8',
    text: 'Has completado la inducción del Modo Administrador. Puedes volver a reproducir este tutorial en cualquier momento desde el botón de voz en la parte superior. ¡Gracias por liderar la experiencia del Metaverso UPDS!',
    highlightNote: '¡Listo para administrar la plataforma!',
  },
];

interface AdminVoiceTourProps {
  onTabSelect: (tab: AdminTab) => void;
  onClose: () => void;
}

export function AdminVoiceTour({ onTabSelect, onClose }: AdminVoiceTourProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const currentStep = ADMIN_TOUR_STEPS[currentStepIndex];
  const isLastStep = currentStepIndex === ADMIN_TOUR_STEPS.length - 1;


  // Track speech instance & available Spanish voices
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speakTimerRef = useRef<number | null>(null);
  const [spanishVoice, setSpanishVoice] = useState<SpeechSynthesisVoice | null>(null);

  // Load voices (they load asynchronously in Chromium-based browsers)
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;

    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const esVoice =
        voices.find((v) => v.lang?.toLowerCase() === 'es-es') ||
        voices.find((v) => v.lang?.toLowerCase().startsWith('es')) ||
        null;
      if (esVoice) setSpanishVoice(esVoice);
    };

    pickVoice();
    window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', pickVoice);
  }, []);

  // Stop all active speech
  const stopAllAudio = useCallback(() => {
    if (speakTimerRef.current !== null) {
      window.clearTimeout(speakTimerRef.current);
      speakTimerRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllAudio();
    };
  }, [stopAllAudio]);

  // Function to trigger speech for current step
  const speakCurrentStep = useCallback(() => {
    stopAllAudio();

    // Notify parent to switch tab
    onTabSelect(currentStep.tab);

    if (isMuted || !('speechSynthesis' in window)) {
      setIsPlaying(false);
      return;
    }

    // Pequeño retardo para evitar el error "canceled/interrupted" al
    // encadenar cancel() + speak() demasiado rápido en Chromium.
    speakTimerRef.current = window.setTimeout(() => {
      speakTimerRef.current = null;
      try {
        const utterance = new SpeechSynthesisUtterance(currentStep.text);
        if (spanishVoice) utterance.voice = spanishVoice;
        utterance.lang = spanishVoice?.lang || 'es-ES';
        utterance.rate = speechRate;
        utterance.pitch = 1.0;

        utterance.onend = () => setIsPlaying(false);
        utterance.onerror = (e: SpeechSynthesisErrorEvent) => {
          if (e.error === 'canceled' || e.error === 'interrupted') return;
          setIsPlaying(false);
        };

        utteranceRef.current = utterance;
        setIsPlaying(true);
        window.speechSynthesis.speak(utterance);
      } catch {
        setIsPlaying(false);
      }
    }, 60);
  }, [currentStep, isMuted, speechRate, spanishVoice, stopAllAudio, onTabSelect]);

  // Trigger speech when step changes
  useEffect(() => {
    speakCurrentStep();
    return () => {
      stopAllAudio();
    };
  }, [currentStepIndex, speakCurrentStep, stopAllAudio]);

  // Handle Play / Pause toggle
  const togglePlay = () => {
    if (!('speechSynthesis' in window)) return;

    if (isPlaying) {
      window.speechSynthesis.pause();
      setIsPlaying(false);
    } else if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setIsPlaying(true);
    } else {
      speakCurrentStep();
    }
  };

  // Handle Mute toggle
  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (nextMute) {
      stopAllAudio();
      setIsPlaying(false);
    } else {
      speakCurrentStep();
    }
  };

  // Handle Next
  const handleNext = () => {
    if (currentStepIndex < ADMIN_TOUR_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      stopAllAudio();
      onClose();
    }
  };

  // Handle Prev
  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  // Handle Speed change
  const cycleRate = () => {
    const rates = [0.8, 1.0, 1.25];
    const nextIdx = (rates.indexOf(speechRate) + 1) % rates.length;
    setSpeechRate(rates[nextIdx]);
  };


  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        width: '90%',
        maxWidth: 780,
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(16px)',
        borderRadius: 20,
        border: '1px solid rgba(59, 130, 246, 0.4)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(59, 130, 246, 0.2)',
        padding: '20px 24px',
        color: '#f8fafc',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        animation: 'slideUpTour 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Top Bar with Badge, Title, Close */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              color: '#ffffff',
              fontSize: 12,
              fontWeight: 700,
              padding: '4px 12px',
              borderRadius: 20,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.4)',
            }}
          >
            {currentStep.badge}
          </span>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>
            {currentStep.title}
          </h3>
        </div>

        {/* Audio status indicator & Close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isPlaying && !isMuted && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span className="voice-wave-bar bar-1" />
              <span className="voice-wave-bar bar-2" />
              <span className="voice-wave-bar bar-3" />
              <span className="voice-wave-bar bar-4" />
              <span style={{ fontSize: 12, color: '#60a5fa', marginLeft: 4, fontWeight: 500 }}>
                Hablando...
              </span>
            </div>
          )}

          <button
            onClick={onClose}
            title="Cerrar Tutorial"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: '#94a3b8',
              width: 32,
              height: 32,
              borderRadius: '50%',
              fontSize: 18,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Highlight Box Note */}
      <div
        style={{
          background: 'rgba(59, 130, 246, 0.12)',
          borderLeft: '4px solid #3b82f6',
          padding: '8px 14px',
          borderRadius: '0 8px 8px 0',
          marginBottom: 12,
          fontSize: 13,
          color: '#93c5fd',
          fontWeight: 500,
        }}
      >
        💡 <strong>Objetivo del módulo:</strong> {currentStep.highlightNote}
      </div>

      {/* Voice Subtitles / Spoken Text */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.6)',
          borderRadius: 12,
          padding: '12px 16px',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          fontSize: 14,
          lineHeight: '1.5',
          color: '#e2e8f0',
          marginBottom: 16,
          minHeight: 56,
        }}
      >
        "{currentStep.text}"
      </div>


      {/* Progress Dots */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 16 }}>
        {ADMIN_TOUR_STEPS.map((step, idx) => (
          <button
            key={step.id}
            onClick={() => setCurrentStepIndex(idx)}
            title={step.title}
            style={{
              height: 6,
              width: idx === currentStepIndex ? 28 : 10,
              borderRadius: 3,
              background: idx === currentStepIndex ? '#3b82f6' : 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        ))}
      </div>


      {/* Control Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

        {/* Left Audio Tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={togglePlay}
            style={{

              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              padding: '8px 14px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {isPlaying ? '⏸️ Pausar Voz' : '▶️ Reproducir'}
          </button>

          <button
            onClick={toggleMute}
            style={{
              background: isMuted ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: isMuted ? '#fca5a5' : '#ffffff',
              padding: '8px 12px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {isMuted ? '🔇 Silenciado' : '🔊 Voz On'}
          </button>

          <button
            onClick={cycleRate}
            title="Cambiar velocidad de voz"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#cbd5e1',
              padding: '8px 12px',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ⚡ {speechRate}x
          </button>
        </div>

        {/* Right Navigation */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handlePrev}
            disabled={currentStepIndex === 0}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: currentStepIndex === 0 ? '#475569' : '#f1f5f9',
              padding: '10px 18px',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: currentStepIndex === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            ← Anterior
          </button>

          <button
            onClick={handleNext}
            style={{
              background: isLastStep
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              border: 'none',
              color: '#ffffff',
              padding: '10px 22px',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
            }}
          >
            {isLastStep ? '🎉 Finalizar Tour' : 'Siguiente →'}
          </button>
        </div>
      </div>
    </div>
  );
}
