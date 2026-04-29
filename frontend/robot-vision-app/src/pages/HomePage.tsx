import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react';
import ExploreContainer from '../components/ExploreContainer';
import './HomePage.css';
import { VideoStream } from '../components/VideoStream';

const Home: React.FC = () => {

  const ESP32_IP = "http://192.168.1.XX:81/stream";



  return (
    <IonPage>

      <IonHeader>
        <IonToolbar>
          <IonTitle>🤖 Robot Control</IonTitle>
        </IonToolbar>
      </IonHeader>

       <IonContent fullscreen className="ion-padding">
        <div className="home-layout">
          <VideoStream url={ESP32_IP} />
          
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
