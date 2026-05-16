import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonList, IonItem, IonLabel, IonRadioGroup, IonRadio,
  IonButton, IonInput, IonText, IonSpinner, IonIcon, IonChip
} from '@ionic/react';
import {
  checkmarkCircle, closeCircle, wifi, bugOutline,
  pulseOutline, cameraOutline, addOutline,wifiOutline
} from 'ionicons/icons';
import { useNetworkManager } from '../hooks/useNetworkManager';
import Esp32WifiConfig from '../components/network/Esp32WifiConfig';
import ProfileEditorModal from '../components/network/ProfileEditorModal';
import './Tab2.css';

const Tab2: React.FC = () => {
  const nm = useNetworkManager();

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonIcon icon={wifiOutline} color = "primary" />
          <IonTitle>Red</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">

        {/* ── Estado de conexión ─────────────────── */}
        <div className="network-status-bar">
          <IonIcon icon={nm.status?.ok ? checkmarkCircle : closeCircle}
            color={nm.status?.ok ? 'success' : 'danger'} />
          <IonText color={nm.status?.ok ? 'success' : 'danger'}>
            {nm.status?.msg ?? 'Verificando...'}
          </IonText>
        </div>


        {/* Una sola chip: muestra la IP del servidor si está disponible, sino la URL del backend */}
        {(nm.serverIp || (nm.backendUrl && nm.backendUrl !== 'http://localhost:8000')) && (
          <IonChip className="backend-url-chip" color="medium">
            <IonIcon icon={wifi} />
            <IonLabel>{nm.serverIp ? `Servidor: ${nm.serverIp}` : nm.backendUrl}</IonLabel>
          </IonChip>
        )}

        {nm.connecting && (
          <div className="connecting-spinner">
            <IonSpinner name="crescent" />
            <IonText color="medium">Conectando...</IonText>
          </div>
        )}

        {/* ── Perfiles de red ────────────────────── */}
        <div className="section-title">
          REDES CONFIGURADAS
          {Object.keys(nm.backendProfiles).length > 0 && (
            <IonText color="medium" style={{ fontSize: 10, fontWeight: 'normal', marginLeft: 6 }}>
              (backend/data/profiles.json)
            </IonText>
          )}
        </div>

        {nm.displayProfiles.length === 0 ? (
          <div className="empty-profiles-card">
            <IonText color="medium" style={{ fontSize: 13 }}>
              No hay perfiles configurados. Pulsa <strong>Editar perfiles</strong> para añadir uno.
            </IonText>
          </div>
        ) : (
          <IonRadioGroup value={nm.activeProfile} onIonChange={e => nm.handleProfileSelect(e.detail.value)}>
            <IonList className="profile-list">
              {nm.displayProfiles.map(p => (
                <IonItem key={p.name} className="profile-item">
                  <IonRadio slot="start" value={p.name} />
                  <IonLabel>
                    <h3>{p.name}</h3>
                    <p>Backend: {p.backend_ip}:8000 &middot; ESP32: {p.esp32_ip}:{p.esp32_stream_port}</p>
                    {p.comment && (
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{p.comment}</p>
                    )}
                  </IonLabel>
                </IonItem>
              ))}
            </IonList>
          </IonRadioGroup>
        )}

        <IonButton expand="block" fill="outline" size="small" color="tertiary"
          onClick={nm.openProfileEditor} style={{ marginTop: 4 }}>
          <IonIcon icon={addOutline} slot="start" />
          Editar perfiles
        </IonButton>

        {/* ── IP manual backend ──────────────────── */}
        <div className="section-title" style={{ marginTop: 16 }}>IP MANUAL (BACKEND)</div>
        <div className="manual-ip-row">
          <IonInput placeholder="192.168.1.174" value={nm.manualIp}
            onIonInput={e => nm.setManualIp(e.detail.value!)}
            className="manual-ip-input" clearInput />
          <IonButton onClick={nm.handleManualConnect}
            disabled={nm.connecting || !nm.manualIp.trim()}>
            Conectar
          </IonButton>
        </div>

        {/* ── Cámara ESP32 / IP Webcam ───────────── */}
        <div className="section-title" style={{ marginTop: 16 }}>
          <IonIcon icon={cameraOutline} style={{ marginRight: 6 }} />
          CÁMARA ESP32 / IP WEBCAM
        </div>

        {nm.esp32Url && (
          <IonChip className="backend-url-chip" color="tertiary">
            <IonIcon icon={cameraOutline} />
            <IonLabel>{nm.esp32Url}</IonLabel>
          </IonChip>
        )}

        {nm.esp32Status && (
          <div className="network-status-bar" style={{ marginBottom: 8 }}>
            <IonIcon icon={nm.esp32Status.ok ? checkmarkCircle : closeCircle}
              color={nm.esp32Status.ok ? 'success' : 'danger'} />
            <IonText color={nm.esp32Status.ok ? 'success' : 'danger'}>
              {nm.esp32Status.msg}
            </IonText>
          </div>
        )}

        <div className="manual-ip-row">
          <IonInput placeholder="192.168.1.132" value={nm.esp32Ip}
            onIonInput={e => nm.setEsp32Ip(e.detail.value!)}
            className="manual-ip-input" clearInput style={{ flex: 2 }} />
          <IonInput placeholder="8080" value={nm.esp32Port}
            onIonInput={e => nm.setEsp32Port(e.detail.value!)}
            className="manual-ip-input" clearInput style={{ flex: 1, maxWidth: 100 }} />
          <IonButton onClick={nm.handleSetEsp32} disabled={nm.settingEsp32 || !nm.esp32Ip.trim()}>
            {nm.settingEsp32 ? <IonSpinner name="dots" /> : 'Aplicar'}
          </IonButton>
        </div>
        <IonText color="medium" style={{ fontSize: 12, paddingLeft: 4 }}>
          Se guarda en backend/data/active_config.json y persiste al reiniciar
        </IonText>

        {/* ── WiFi del ESP32 ─────────────────────── */}
        <Esp32WifiConfig />

        {/* ── Diagnóstico ────────────────────────── */}
        <div className="section-title" style={{ marginTop: 24 }}>
          <IonIcon icon={bugOutline} style={{ marginRight: 6 }} />
          DIAGNÓSTICO
        </div>

        <IonButton expand="block" color="tertiary" onClick={nm.runDiagnostics}
          disabled={nm.diagRunning} style={{ marginBottom: 12 }}>
          {nm.diagRunning ? (
            <><IonSpinner name="dots" style={{ marginRight: 8 }} /> Ejecutando tests...</>
          ) : (
            <><IonIcon icon={pulseOutline} slot="start" /> Ejecutar test de conectividad</>
          )}
        </IonButton>

        {nm.diagLogs.length > 0 && (
          <div className="diag-log-box">
            {nm.diagLogs.map((line, i) => (
              <div key={i} className={
                line.includes('✅') ? 'diag-line-ok' :
                line.includes('❌') ? 'diag-line-err' :
                line.includes('⚠️') ? 'diag-line-warn' :
                line.includes('---') ? 'diag-line-header' : 'diag-line'
              }>{line}</div>
            ))}
          </div>
        )}

        {nm.diagLogs.length > 0 && (
          <IonButton expand="block" fill="clear" color="medium"
            onClick={nm.clearDiagLogs} style={{ marginTop: 8 }}>
            Limpiar logs
          </IonButton>
        )}

        {/* ── Modal: Editor de perfiles ──────────── */}
        <ProfileEditorModal
          isOpen={nm.showProfileEditor}
          profiles={nm.editableProfiles}
          onDismiss={() => nm.setShowProfileEditor(false)}
          onChange={nm.handleProfileChange}
          onAdd={nm.addProfile}
          onRemove={nm.removeProfile}
          onSave={nm.saveProfileEditor}
        />

      </IonContent>
    </IonPage>
  );
};

export default Tab2;
