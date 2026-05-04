// src/pages/HomePage.tsx
import { useState, useEffect } from 'react';
import { 
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar, 
  IonSpinner, IonMenuButton, IonButtons
} from '@ionic/react';
import { VideoStream } from '../components/VideoStream';
import { DetectionStream } from '../components/DetectionStream';
import { DetectionPanel } from '../components/DetectionPanel';
import { ApiService } from '../services/api';
import { useSettings } from '../context/SettingsContext';
import './HomePage.css';

const Home: React.FC = () => {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamReady, setStreamReady] = useState(false);
  const [streamKey, setStreamKey] = useState(0); // Fuerza remontaje limpio

  const { yoloEnabled } = useSettings();
  const backendUrl = ApiService.getBaseUrl();

  // Cada vez que cambia yoloEnabled, incrementar key para forzar remontaje
  useEffect(() => {
    setStreamKey(prev => prev + 1);
  }, [yoloEnabled]);

  useEffect(() => {
    const initStream = async () => {
      try {
        const stream = await ApiService.waitForStream(30, 1000);
        setStreamUrl(stream);
        setStreamReady(true);
      } catch (err: any) {
        console.error("Error inicializando stream:", err);
        setError("No se pudo conectar con la cámara del robot");
      } finally {
        setLoading(false);
      }
    };

    initStream();
  }, []);

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

          {loading && (
            <div className="placeholder-box">
              <IonSpinner name="crescent" />
              <p>🔄 Conectando con el robot...</p>
              <small>Esperando que la cámara esté lista</small>
            </div>
          )}

          {error && (
            <div className="placeholder-box">
              <p style={{ color: 'red' }}>❌ {error}</p>
              <small>Verifica que el ESP32 está encendido y en la misma WiFi</small>
            </div>
          )}

          {streamReady && (
            <>
              {yoloEnabled ? (
                <>
                  <DetectionStream key={`yolo-${streamKey}`} backendUrl={backendUrl} />
                  <DetectionPanel backendUrl={backendUrl} active={yoloEnabled} />
                </>
              ) : (
                streamUrl && <VideoStream key={`raw-${streamKey}`} url={streamUrl} />
              )}
            </>
          )}

          <div className="placeholder-box">
            <p>Controles y Datos aquí</p>
          </div>

        </div>
      </IonContent>
    </IonPage>
  );
};

export default Home;