// src/pages/HomePage.tsx
import { useState, useEffect } from 'react';
import { 
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar, 
  IonSpinner, IonMenuButton, IonButtons
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
    console.log(`🚗 Mover: ${direction} | Velocidad: ${speed}% | x:${x.toFixed(2)} y:${y.toFixed(2)}`);
  };

  const handleStop = () => {
    console.log('🛑 Stop');
  };

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamKey, setStreamKey] = useState(0);

  const { yoloEnabled } = useSettings();

  useEffect(() => {
    setStreamKey(prev => prev + 1);
  }, [yoloEnabled]);

  useEffect(() => {
    const init = async () => {
      try {
        await ApiService.waitForStream(30, 1000);
        setReady(true);
      } catch (err: any) {
        console.error("Error inicializando stream:", err);
        setError("No se pudo conectar con la cámara del robot");
      }
    };

    init();
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

          {!ready && !error && (
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

          {ready && (
            <>
              {yoloEnabled ? (
                <>
                  <DetectionStream key={`yolo-${streamKey}`} />
                  <DetectionPanel active={yoloEnabled} />
                </>
              ) : (
                <VideoStream key={`raw-${streamKey}`} />
              )}
            </>
          )}

          <JoystickControl onMove={handleMove} onStop={handleStop} />

        </div>
      </IonContent>
    </IonPage>
  );
};

export default Home;
