import { useEffect, useState } from 'react';
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
  IonSelect,
  IonSelectOption,
  IonContent,
  IonList,
  IonItem,
  IonToggle,
  IonMenuToggle,
  IonNote,
  IonSpinner,
  setupIonicReact,
  IonButton,
  useIonToast,
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { gameController, wifi, ellipse, cogOutline, eyeOutline, eyeOffOutline, flashlightOutline, flashlightSharp, refreshOutline, settingsOutline, carOutline, hardwareChipOutline, flashOutline,cameraOutline } from 'ionicons/icons';
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

function reinicioFuerte() {
  // Elimina el estado guardado en localStorage para forzar un reinicio completo
  localStorage.clear();
  // Recarga la página, lo que reiniciará toda la app con estado limpio
  window.location.reload();
}

// Menú lateral con acceso al contexto
const AppMenu: React.FC = () => {
  const { yoloEnabled, setYoloEnabled, flashActive, setFlashActive, triggerReload, drivingMode, setDrivingMode, yoloModel, setYoloModel, capturePhoto, isCapturing } = useSettings();
  const [presentToast] = useIonToast();
  const [reloading, setReloading] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [switchingModel, setSwitchingModel] = useState(false);
  const [modelStatus, setModelStatus] = useState<string | null>(null);


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

  // Cargar modelos disponibles del backend al montar
  // Si hay un modelo guardado en localStorage que difiere del activo en backend, cambiarlo
  useEffect(() => {
    ApiService.getModesYolo()
      .then(async ({ models, active }) => {
        console.log('Modelos YOLO disponibles:', models, '| Activo backend:', active, '| Guardado local:', yoloModel);
        if (models.length > 0) setAvailableModels(models);

        // Si hay un modelo guardado en localStorage y difiere del activo en backend → sincronizar
        if (yoloModel && yoloModel !== active && models.includes(yoloModel)) {
          console.log(`🔄 Sincronizando modelo: backend(${active}) → localStorage(${yoloModel})`);
          setSwitchingModel(true);
          setModelStatus(`Cargando ${yoloModel}...`);
          const result = await ApiService.switchModel(yoloModel);
          if (result.ok) {
            setModelStatus(`${yoloModel} cargado`);
            setTimeout(() => setModelStatus(null), 3000);
          } else {
            // Si falla, resincronizar con lo que tiene el backend
            setYoloModel(active);
            setModelStatus(null);
          }
          setSwitchingModel(false);
        } else if (!yoloModel && active) {
          // No hay nada en localStorage → usar el del backend
          setYoloModel(active);
        }
      })
      .catch(err => console.warn('No se pudieron obtener modelos:', err));
  }, []);

  // Cambio de modelo: llama al backend, espera carga, y reconecta streams
  const handleModelSwitch = async (newModel: string) => {
    if (newModel === yoloModel || switchingModel) return;

    setSwitchingModel(true);
    setModelStatus(`Cargando ${newModel}...`);

    // 1. Liberar el grabber activo ANTES de cambiar modelo
    //    (evita que el stream antiguo bloquee la conexión al ESP32)
    try {
      await ApiService.reconnect();
      await new Promise(r => setTimeout(r, 300));
    } catch { /* continuar igualmente */ }

    // 2. Cambiar modelo en el backend
    const result = await ApiService.switchModel(newModel);

    if (result.ok) {
      setYoloModel(result.model || newModel);
      setModelStatus(`${result.model || newModel} cargado`);

      // 3. Reconectar streams para que usen el nuevo modelo
      await new Promise(r => setTimeout(r, 300));
      triggerReload();

      // Limpiar mensaje después de 3s
      setTimeout(() => setModelStatus(null), 3000);
    } else {
      setModelStatus(`❌ Error: ${result.error}`);
      setTimeout(() => setModelStatus(null), 5000);
    }

    setSwitchingModel(false);
  };

  return (
    <IonMenu contentId="main-content" menuId="main-menu" side="end" className="app-side-menu">
      <IonHeader>
        <IonToolbar>
          <div className="menu-header-title">
            <IonIcon icon={settingsOutline} color="primary" size="large" />
            <IonLabel>Ajustes</IonLabel>
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent className="menu-content">

        {/* Sección: Visión */}
        <div className="menu-section">
          <IonNote className="menu-section-label">VISIÓN</IonNote>
          <IonList lines="none" className="menu-list">
            <IonItem className="menu-item">
              <IonIcon slot="start" icon={hardwareChipOutline} className="menu-icon" color= {yoloEnabled ? 'primary' : 'medium'} />
              <IonSelect className="select-conduction"
                          interface="popover"
                          placeholder="Selecciona un modelo"
                          value={yoloModel}
                          disabled={switchingModel || !yoloEnabled}
                          onIonChange={e => handleModelSwitch(e.detail.value)}>
                {availableModels.length > 0
                  ? availableModels.map(m => (
                      <IonSelectOption key={m} value={m}>{m.toUpperCase().charAt(0) + m.slice(1)}</IonSelectOption>
                    ))
                  : <>
                      <IonSelectOption value="yolov8n">YOLOv8 Nano</IonSelectOption>
                      <IonSelectOption value="yolov8s">YOLOv8 Small</IonSelectOption>
                      <IonSelectOption value="yolov8m">YOLOv8 Medium</IonSelectOption>
                    </>
                }
              </IonSelect>
            </IonItem>
            {modelStatus && (
              <IonItem className="menu-item">
                <IonNote style={{
                  fontSize: 12,
                  color: modelStatus.includes('✅') ? '#4ade80' :
                         modelStatus.includes('❌') ? '#f87171' : '#fbbf24',
                  padding: '4px 0'
                }}>
                  {switchingModel && <IonSpinner name="dots" style={{ width: 16, height: 16, marginRight: 6 }} />}
                  {modelStatus}
                </IonNote>
              </IonItem>
            )}
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
            <IonItem className="menu-item" button onClick={async () => {
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
              }} disabled={isCapturing}>
              <IonIcon
                slot="start"
                icon={cameraOutline}
                className="menu-icon"
                color={isCapturing ? 'medium' : 'primary'} />
              <IonLabel>
                <h3>{isCapturing ? 'Capturando...' : 'Tomar Foto'}</h3>
              </IonLabel>
            </IonItem>
          </IonList>
        </div>

     
       


        {/* Sección: Joystick — configuración de controles */}
        <div className="menu-section">
          <IonNote className="menu-section-label">Joystick</IonNote>
          <IonList lines="none" className="menu-list">
            <IonItem>
              <IonIcon
                slot="start"
                icon={carOutline}
                color="primary"
              />
              <IonSelect className='select-conduction'
                          interface="popover"
                          placeholder="Selecciona un modo"
                          value={drivingMode}
                          onIonChange={e =>{ 
                                    setDrivingMode(e.detail.value)
                                    }}>
                <IonSelectOption value="http">Modo HTTP</IonSelectOption>
                <IonSelectOption value="websocket">Modo Real-Time</IonSelectOption>
              </IonSelect>
            </IonItem>
          </IonList>
        </div>

          {/* Sección: Conexión */}
        <div className="menu-section">
          <IonNote className="menu-section-label">CONEXIÓN</IonNote>
          <IonList lines="none" className="menu-list">
            <IonItem className="menu-item" button onClick={handleReload} disabled={reloading}>
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

        {/* Sección: Sistema  */}
        <div className="menu-section">
          <IonNote className="menu-section-label">SISTEMA</IonNote>
          <IonList lines="none" className="menu-list">
            <IonItem className="menu-item" button onClick= {reinicioFuerte} disabled={reloading}>
              <IonIcon
                slot="start"
                icon = {flashOutline}
                className={`menu-icon`}
                color = "warning"
              />
              <IonLabel>
                <h3>Forzar reincio App</h3>
                <p>
                  Recarga completa para solventar errores del sistema.
                </p>
              </IonLabel>
            </IonItem>
          </IonList>
        </div>


        {/* Sección: Ajustes — aquí puedes añadir más opciones en el futuro */}
        {/* <div className="menu-section">
          <IonNote className="menu-section-label">AJUSTES</IonNote>
          <IonList lines="none" className="menu-list">
            <IonMenuToggle autoHide={false}>
              <IonItem className="menu-item menu-item-placeholder" button>
                <IonIcon slot="start" icon={cogOutline} className="menu-icon" />
                <IonLabel>Configuración</IonLabel>
              </IonItem>
            </IonMenuToggle>
          </IonList>
        </div> */}

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
