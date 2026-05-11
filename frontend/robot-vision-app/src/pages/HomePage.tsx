// src/pages/HomePage.tsx
import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { 
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar, 
  IonSpinner, IonMenuButton, IonButtons, IonButton
} from '@ionic/react';
import { VideoStream } from '../components/VideoStream';
import { JoystickControl } from '../components/JoystickControl';
import { DetectionStream } from '../components/DetectionStream';
import { DetectionPanel } from '../components/DetectionPanel';
import { ApiService } from '../services/api';
import { useSettings } from '../context/SettingsContext';
import './HomePage.css';

const Home: React.FC = () => {
  const handleMove = (direction: string, speed: number, x: number, y: number) => {
    console.log(`Mover: ${direction} | Velocidad: ${speed}%`);
  };

  const handleStop = () => console.log('🛑 Stop');

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('Conectando con el servidor...');
  const [streamKey, setStreamKey] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const { yoloEnabled } = useSettings();

  const handleRetry = () => {
    setReady(false);
    setError(null);
    setStatusMsg('Reconectando...');
    setRetryKey(prev => prev + 1);
  };

  useEffect(() => { setStreamKey(prev => prev + 1); }, [yoloEnabled]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const isNative = Capacitor.isNativePlatform();
      console.log(`🔌 [Init] Plataforma nativa: ${isNative}`);
      console.log(`🔌 [Init] Base URL inicial: ${ApiService.getBaseUrl()}`);

      if (isNative) {
        console.log('[Init] Escaneando red...');
        setStatusMsg('Escaneando redes...');
        const found = await ApiService.scanNetwork();
        console.log(`[Init] Scan resultado: ${found ? 'Encontrado' : '❌ No encontrado'}`);
        console.log(`[Init] Base URL tras scan: ${ApiService.getBaseUrl()}`);

        if (!found) {
          if (!cancelled) setError(`No se encontró el backend en ninguna red conocida. Configura la IP en la pestaña "Red".`);
          return;
        }
      }

      // Esperar a que el backend esté accesible antes de montar los streams
      const MAX_RETRIES = 30;
      for (let i = 0; i < MAX_RETRIES; i++) {
        if (cancelled) return;
        setStatusMsg(`Esperando al backend... (${i + 1}/${MAX_RETRIES})`);
        try {
          // Hacer un health check simple para comprobar que accedemos al backend
          const ok = await ApiService.healthCheck();
          if (ok) {
            console.log('[Init] Backend accesible');
            break;
          }
        } catch { /* reintentar */ }

        if (i === MAX_RETRIES - 1) {
          if (!cancelled) setError('No se pudo conectar al backend. Verifica que el servidor esté corriendo.');
          return;
        }
        await new Promise(r => setTimeout(r, 1500));
      }

      if (cancelled) return;

      // Ahora esperar a que la cámara esté lista (pero no bloquear demasiado)
      setStatusMsg('Buscando cámara...');
      let cameraFound = false;
      for (let i = 0; i < 5; i++) {
        if (cancelled) return;
        try {
          const data = await ApiService.isStreamReady();
          if (data.ready) {
            console.log('[Init] Cámara lista');
            cameraFound = true;
            break;
          }
        } catch { /* reintentar */ }
        setStatusMsg(`Buscando cámara... (${i + 1}/5)`);
        await new Promise(r => setTimeout(r, 1500));
      }

      if (!cameraFound) {
        console.warn('[Init] Cámara no encontrada aún, mostrando UI igualmente (los componentes reintentarán)');
      }

      // Siempre mostrar la UI — los componentes VideoStream/DetectionStream 
      // tienen su propia lógica de reintentos (30 intentos)
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
            <IonMenuButton menu="main-menu" autoHide = {false} />
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
              yoloEnabled ? (
                <DetectionStream key={`yolo-${streamKey}`} />
              ) : (
                <VideoStream key={`raw-${streamKey}`} />
              )
            )}
          </div>

          {/* ═══════════════════════════════════════════════════ */}
          {/* FILA 2: DETECCIONES (izq) + JOYSTICK (der)        */}
          {/* Siempre visible, incluso mientras se conecta       */}
          {/* ═══════════════════════════════════════════════════ */}
          <div className="home-content">
            
            {/* Columna izquierda: Panel de detecciones */}
            <div className="controls-detections">
              <DetectionPanel/>
            </div>

            {/* Columna derecha: Joystick */}
            <div className="controls-joystick">
              <JoystickControl onMove = {handleMove} onStop = {handleStop} />
            </div>

          </div>

        </div>
      </IonContent>
    </IonPage>
  );
};

export default Home;