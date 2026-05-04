import React from 'react';
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react';
import ExploreContainer from '../components/ExploreContainer';
import './Tab2.css';
import { JoystickControl } from '../components/JoystickControl';

const Tab2: React.FC = () => {

  // Funciones de prueba - verás los valores en consola del navegador
  const handleMove = (direction: string, speed: number) => {
    console.log(`Mover: ${direction} a velocidad ${speed}%`);
  };

  const handleStop = () => {
    console.log('Joystick suelto - stop');
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Tab 2</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        <IonHeader collapse="condense">
          <IonToolbar>
            <IonTitle size="large">Tab 2</IonTitle>
          </IonToolbar>
        </IonHeader>
        <ExploreContainer name="Tab 2 page" />

        <JoystickControl
          onMove={handleMove}
          onStop={handleStop}
        />
      </IonContent>
    </IonPage>
  );
};

export default Tab2;
