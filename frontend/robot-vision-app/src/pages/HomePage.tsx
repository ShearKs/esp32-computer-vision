import { useState, useEffect } from 'react';
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar, IonSpinner } from '@ionic/react';
import ExploreContainer from '../components/ExploreContainer';
import './HomePage.css';
import { VideoStream } from '../components/VideoStream';

// URL de tu backend FastAPI (ajusta el puerto si es diferente)
const BACKEND_URL = "http://localhost:8000";

const Home: React.FC = () => {

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/config`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        // data.esp32_url = "http://192.168.1.100:81/stream"
        setStreamUrl(data.esp32_url);
      } catch (err: any) {
        console.error("Error obteniendo config del backend:", err);
        setError("No se pudo conectar con el backend");
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
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
              <p>Conectando con el backend...</p>
              <p>Ruta: {streamUrl}</p>
            </div>
          )}

          {error && (
            <div className="placeholder-box">
              <p style={{ color: 'red' }}>❌ {error}</p>
            </div>
          )}

          {streamUrl && <VideoStream url={streamUrl} />}

          {/* Aquí irían tus controles y datos más adelante  :O   */}
          <div className="placeholder-box">
            <p>Controles y Datos aquí</p>
          </div>


        </div>
      </IonContent>

    </IonPage>
  );
};

export default Home;
