// src/pages/HomePage.tsx
import { useState, useEffect } from 'react';
import { 
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar, 
  IonSpinner, IonToggle, IonLabel
} from '@ionic/react';
import { VideoStream } from '../components/VideoStream';
import { DetectionStream } from '../components/DetectionStream';
import { DetectionPanel } from '../components/DetectionPanel';
import { ApiService } from '../services/api';
import './HomePage.css';

const Home: React.FC = () => {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamReady, setStreamReady] = useState(false);
  const [yoloEnabled, setYoloEnabled] = useState(false);

  const backendUrl = ApiService.getBaseUrl();

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
              {/* Toggle YOLO */}
              <div className="yolo-toggle-row">
                <div className="yolo-toggle-label">
                  <span className="yolo-toggle-icon">🧠</span>
                  <div>
                    <IonLabel className="yolo-toggle-title">YOLO AI</IonLabel>
                    <small className={`yolo-toggle-status ${yoloEnabled ? 'active' : ''}`}>
                      {yoloEnabled ? 'Detección activa' : 'Desactivado'}
                    </small>
                  </div>
                </div>
                <IonToggle 
                  checked={yoloEnabled} 
                  onIonChange={(e) => setYoloEnabled(e.detail.checked)}
                  color="danger"
                />
              </div>

              {/* Stream: normal o YOLO según toggle */}
              {!yoloEnabled && streamUrl && (
                <VideoStream url={streamUrl} />
              )}

              {yoloEnabled && (
                <>
                  <DetectionStream backendUrl={backendUrl} />
                  <DetectionPanel backendUrl={backendUrl} active={yoloEnabled} />
                </>
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