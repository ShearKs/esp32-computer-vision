// src/pages/HomePage.tsx
import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonSpinner, IonMenuButton, IonButtons, IonButton,
  IonIcon, useIonToast
} from '@ionic/react';
import { VideoStream } from '../components/VideoStream';
import { JoystickControl, Direction } from '../components/JoystickControl';
import { DetectionStream } from '../components/DetectionStream';
import { DetectionPanel } from '../components/DetectionPanel';
import { ApiService } from '../services/api';
import { useSettings } from '../context/SettingsContext';
import './HomePage.css';
import { cameraOutline } from 'ionicons/icons';

const Home: React.FC = () => {
  const sendCommand = (direction: Direction, speed: number) => {
    if (drivingMode === 'websocket') {
      // TODO: implementar WebSocket para menor latencia
      console.log('🔌 WebSocket mode not yet implemented, falling back to HTTP');
    }
    ApiService.controlRobot(direction, speed).catch(() => { });
  };

  const handleMove = (direction: Direction, speed: number, _x: number, _y: number) => {
    sendCommand(direction, speed);
  };

  const handleStop = () => {
    sendCommand('stop', 0);
  };

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('Conectando con el servidor...');
  const [streamKey, setStreamKey] = useState(0);
  const [retryKey, setRetryKey] = useState(0);

  const [presentToast] = useIonToast();

  const { yoloEnabled, reloadKey, drivingMode, isCapturing, capturePhoto } = useSettings();

  const handleRetry = () => {
    setReady(false);
    setError(null);
    setStatusMsg('Reconectando...');
    setRetryKey(prev => prev + 1);
  };

  const handleTakeFrame = async () => {
    const result = await capturePhoto();
    if (result.ok) {
      presentToast({
        message: `Foto guardada: ${result.filename}`,
        color: 'success',
        duration: 2500,
        position: 'bottom',
        cssClass: 'capture-toast'
      })
    } else {
      presentToast({
        message: `Error: ${result.error}`,
        color: 'danger',
        duration: 3000,
        position: 'bottom',
        cssClass: 'capture-toast'
      })
    }
  };


  // Al cambiar YOLO on/off: liberar el grabber backend primero, luego montar el nuevo stream
  const isFirstMount = useRef(true);
  useEffect(() => {
    // En el primer montaje no necesitamos reconectar — el stream aún no existe
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    let cancelled = false;
    const switchStream = async () => {
      try {
        // 1. Pedir al backend que mate streams activos (FrameGrabber + raw proxy)
        await ApiService.reconnect();

        // 2. Esperar a que el ESP32 libere su socket de stream
        await new Promise(r => setTimeout(r, 500));
      } catch { /* continuar igualmente */ }

      // 3. Montar el nuevo stream (raw o YOLO) con un key fresco
      //    Un solo cambio de key — el anterior ya se desmontó porque React
      //    condiciona el render con yoloEnabled
      if (!cancelled) setStreamKey(prev => prev + 1);
    };
    switchStream();
    return () => { cancelled = true; };
  }, [yoloEnabled]);

  // Escuchar reloadKey del menú lateral → forzar reconexión completa
  useEffect(() => {
    if (reloadKey === 0) return; // Ignorar el montaje inicial
    console.log('🔄 Recarga disparada desde el menú');
    setReady(false);
    setError(null);
    setStatusMsg('Reconectando...');
    setStreamKey(prev => prev + 1);
    setRetryKey(prev => prev + 1);
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const isNative = Capacitor.isNativePlatform();
      console.log(`🔌 [Init] Plataforma nativa: ${isNative}`);

      if (isNative) {
        setStatusMsg('Escaneando redes...');
        const found = await ApiService.scanNetwork();
        if (!found) {
          if (!cancelled) setError(`No se encontró el backend en ninguna red conocida. Configura la IP en la pestaña "Red".`);
          return;
        }
      }

      // Esperar a que el backend esté accesible (máx ~15s)
      const MAX_RETRIES = 15;
      for (let i = 0; i < MAX_RETRIES; i++) {
        if (cancelled) return;
        setStatusMsg(`Esperando al backend... (${i + 1}/${MAX_RETRIES})`);
        try {
          const ok = await ApiService.healthCheck();
          if (ok) break;
        } catch { /* reintentar */ }

        if (i === MAX_RETRIES - 1) {
          if (!cancelled) setError('No se pudo conectar al backend. Verifica que el servidor esté corriendo.');
          return;
        }
        await new Promise(r => setTimeout(r, 1000));
      }

      if (cancelled) return;

      // Esperar cámara (pero no bloquear demasiado, máx ~3s)
      setStatusMsg('Buscando cámara...');
      for (let i = 0; i < 3; i++) {
        if (cancelled) return;
        try {
          const data = await ApiService.isStreamReady();
          if (data.ready) break;
        } catch { /* reintentar */ }
        setStatusMsg(`Buscando cámara... (${i + 1}/3)`);
        await new Promise(r => setTimeout(r, 1000));
      }

      // Siempre mostrar la UI — los componentes tienen su propia lógica de reintentos
      if (!cancelled) setReady(true);
    };

    init();
    return () => { cancelled = true; };
  }, [retryKey]);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>🤖 Robot Control</IonTitle>
          <IonButtons slot="end">
            <IonMenuButton menu="main-menu" autoHide={false} />
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="ion-padding">
        <div className="home-layout">

          {/* ═══════════════════════════════════════════════════ */}
          {/* FILA 1: CÁMARA (o estado de conexión) */}
          {/* ═══════════════════════════════════════════════════ */}
          <div className="home-camera-row">
            {!ready && !error && (
              <div className="placeholder-box">
                <IonSpinner name="crescent" />
                <p>🔄 {statusMsg}</p>
              </div>
            )}
            {error && (
              <div className="placeholder-box placeholder-error">
                <p>❌ {error}</p>
                <IonButton fill="outline" size="small" onClick={handleRetry} style={{ marginTop: 8 }}>
                  🔄 Reintentar conexión
                </IonButton>
              </div>
            )}
            {ready && (
              <div className="camera-container">
                {yoloEnabled ? (
                  <DetectionStream key={`yolo-${streamKey}`} />
                ) : (
                  <VideoStream key={`raw-${streamKey}`} />
                )}
                <IonButton className="photo-btn" size="small" onClick={handleTakeFrame} disabled={isCapturing}>
                  <IonIcon slot="icon-only" icon={cameraOutline}></IonIcon>
                </IonButton>
              </div>
            )}
          </div> {/* Tu cierre de div original */}

          {/* ═══════════════════════════════════════════════════ */}
          {/* FILA 2: DETECCIONES (izq) + JOYSTICK (der)        */}
          {/* Siempre visible, incluso mientras se conecta       */}
          {/* ═══════════════════════════════════════════════════ */}
          <div className="home-content">

            {/* Columna izquierda: Panel de detecciones */}
            <div className="controls-detections">
              <DetectionPanel yoloEnabled={yoloEnabled} />
            </div>

            {/* Columna derecha: Joystick */}
            <div className="controls-joystick">
              <JoystickControl onMove={handleMove} onStop={handleStop} />
            </div>

          </div>

        </div>
      </IonContent>
    </IonPage>
  );
};

export default Home;