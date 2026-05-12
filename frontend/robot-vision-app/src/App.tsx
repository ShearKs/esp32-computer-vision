import { useState } from 'react';
import { Redirect, Route } from 'react-router-dom';
import {
  IonApp,
  IonIcon,
  IonLabel,
  IonRouterOutlet,
  IonTabBar,
  IonTabButton,
  IonTabs,
  IonMenu,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonToggle,
  IonMenuToggle,
  IonNote,
  setupIonicReact
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { gameController, wifi, ellipse, cogOutline, eyeOutline, eyeOffOutline, flashlightOutline, flashlightSharp, refreshOutline } from 'ionicons/icons';
import Tab1 from './pages/HomePage';
import Tab2 from './pages/Tab2';
import Tab3 from './pages/Tab3';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import { ApiService } from './services/api';

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

import '@ionic/react/css/palettes/dark.system.css';

/* Theme variables */
import './theme/variables.css';
import './App.css';

setupIonicReact();

// Menú lateral con acceso al contexto
const AppMenu: React.FC = () => {
  const { yoloEnabled, setYoloEnabled, flashActive, setFlashActive, triggerReload } = useSettings();
  const [reloading, setReloading] = useState(false);

  // Función para recargar la conexión: resetea backend y dispara recarga frontend
  const handleReload = async () => {
    setReloading(true);
    try {
      // Pedir al backend que resetee el pipeline (esperar respuesta)
      const result = await ApiService.reconnect();
      console.log('🔄 Backend reconnect:', result);
    } catch { /* seguimos igualmente */ }
    // Dar tiempo al backend para cerrar streams antiguos, medio segundo...
    await new Promise(r => setTimeout(r, 500));
    // Disparar recarga en el frontend (re-monta streams)
    triggerReload();
    // Delay visual para feedback
    setTimeout(() => setReloading(false), 1000);
  };

  return (
    <IonMenu contentId="main-content" menuId="main-menu" side="end" className="app-side-menu">
      <IonHeader>
        <IonToolbar color="dark">
          <IonTitle>🤖 Robot Control</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="menu-content">

        {/* Sección: Visión */}
        <div className="menu-section">
          <IonNote className="menu-section-label">VISIÓN</IonNote>
          <IonList lines="none" className="menu-list">
            <IonItem className="menu-item">
              <IonIcon
                slot="start"
                icon={yoloEnabled ? eyeOutline : eyeOffOutline}
                className="menu-icon"
                style={{ color: yoloEnabled ? '#ff3b30' : '#888' }}
              />
              <IonLabel>
                <h3>YOLO AI</h3>
                <p className={yoloEnabled ? 'menu-status-active' : ''}>
                  {yoloEnabled ? 'Detección activa' : 'Desactivado'}
                </p>
              </IonLabel>
              <IonToggle
                checked={yoloEnabled}
                onIonChange={(e) => setYoloEnabled(e.detail.checked)}
                color="danger"
              />
            </IonItem>
            <IonItem className="menu-item">
              <IonIcon 
                slot="start" icon={flashActive ? flashlightSharp : flashlightOutline}
                className="menu-icon" />
               <IonLabel>
                <h3>Flash</h3>
              </IonLabel>
             <IonToggle
                checked={flashActive}
                onIonChange={(e) => {
                  const on = e.detail.checked;
                  setFlashActive(on);
                  ApiService.setFlash(on);
                }} />
            </IonItem>
          </IonList>
        </div>

        {/* Sección: Conexión */}
        <div className="menu-section">
          <IonNote className="menu-section-label">CONEXIÓN</IonNote>
          <IonList lines="none" className="menu-list">
            <IonItem className="menu-item menu-item-reload" button onClick={handleReload} disabled={reloading}>
              <IonIcon
                slot="start"
                icon={refreshOutline}
                className={`menu-icon ${reloading ? 'menu-icon-spin' : ''}`}
                style={{ color: reloading ? '#ff9500' : '#4cd964' }}
              />
              <IonLabel>
                <h3>Recargar conexión</h3>
                <p className={reloading ? 'menu-status-reloading' : ''}>
                  {reloading ? 'Reconectando...' : 'Reinicia cámara y streams'}
                </p>
              </IonLabel>
            </IonItem>
          </IonList>
        </div>

        {/* Sección: Ajustes — aquí puedes añadir más opciones en el futuro */}
        <div className="menu-section">
          <IonNote className="menu-section-label">AJUSTES</IonNote>
          <IonList lines="none" className="menu-list">
            <IonMenuToggle autoHide={false}>
              <IonItem className="menu-item menu-item-placeholder" button>
                <IonIcon slot="start" icon={cogOutline} className="menu-icon" />
                <IonLabel>Configuración</IonLabel>
              </IonItem>
            </IonMenuToggle>
          </IonList>
        </div>

      </IonContent>
    </IonMenu>
  );
};

const App: React.FC = () => (
  <SettingsProvider>
    <IonApp>
      <IonReactRouter>
        <AppMenu />
        <IonTabs>
          <IonRouterOutlet id="main-content">
            <Route exact path="/Home">
              <Tab1 />
            </Route>
            <Route exact path="/tab2">
              <Tab2 />
            </Route>
            <Route path="/tab3">
              <Tab3 />
            </Route>
            <Route exact path="/">
              <Redirect to="/Home" />
            </Route>
          </IonRouterOutlet>
          <IonTabBar slot="bottom">
            <IonTabButton tab="home" href="/Home">
              <IonIcon aria-hidden="true" icon={gameController} />
              <IonLabel>Control</IonLabel>
            </IonTabButton>
            <IonTabButton tab="tab2" href="/tab2">
              <IonIcon aria-hidden="true" icon={wifi} />
              <IonLabel>Red</IonLabel>
            </IonTabButton>
            <IonTabButton tab="tab3" href="/tab3">
              <IonIcon aria-hidden="true" icon={ellipse} />
              <IonLabel>Tab 3</IonLabel>
            </IonTabButton>
          </IonTabBar>
        </IonTabs>
      </IonReactRouter>
    </IonApp>
  </SettingsProvider>
);

export default App;
