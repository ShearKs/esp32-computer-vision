import { useState, useEffect, useCallback } from 'react';
import {
  IonIcon, IonText, IonInput, IonButton, IonSpinner,
  IonChip, IonLabel, IonAlert, IonModal, IonHeader,
  IonToolbar, IonTitle, IonContent
} from '@ionic/react';
import {
  wifiOutline, refreshOutline, searchOutline,
  checkmarkCircle, closeCircle, warningOutline,
  eyeOutline, eyeOffOutline, syncOutline, settingsOutline
} from 'ionicons/icons';
import { ApiService } from '../../services/api';

interface WifiStatus {
  mode: 'sta' | 'ap';
  ssid?: string;
  ip: string;
  rssi?: number;
  mac?: string;
  ap_ssid?: string;
  saved_ssid?: string;
}

const rssiToSignal = (rssi: number): { label: string; color: string } => {
  if (rssi >= -50) return { label: 'Excelente', color: 'success' };
  if (rssi >= -60) return { label: 'Buena', color: 'success' };
  if (rssi >= -70) return { label: 'Aceptable', color: 'warning' };
  return { label: 'Débil', color: 'danger' };
};

const Esp32WifiConfig: React.FC = () => {
  const [wifiStatus, setWifiStatus] = useState<WifiStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Estado del formulario (dentro del modal)
  const [newSSID, setNewSSID] = useState('');
  const [newPass, setNewPass] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [actionStatus, setActionStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [changingWifi, setChangingWifi] = useState(false);

  const loadWifiStatus = useCallback(async () => {
    setLoading(true);
    setStatusError(null);
    const status = await ApiService.getEsp32WifiStatus();
    if (status) {
      setWifiStatus(status);
    } else {
      setWifiStatus(null);
      // Si falla, el firmware antiguo no tiene el endpoint — no mostrar error rojo crudo
      setStatusError('Endpoint no disponible. Flashea el firmware actualizado para habilitar esta función.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadWifiStatus();
  }, [loadWifiStatus]);

  const handleChangeWifi = async () => {
    setShowConfirm(false);
    setChangingWifi(true);
    setActionStatus(null);

    const result = await ApiService.setEsp32Wifi(newSSID.trim(), newPass);

    if (result.ok) {
      setActionStatus({ ok: true, msg: '✅ Credenciales enviadas. El ESP32 se reiniciará...' });

      setTimeout(async () => {
        setScanning(true);
        setActionStatus({ ok: true, msg: '🔍 Buscando ESP32 en la red...' });

        const scanResult = await ApiService.scanForEsp32();
        setScanning(false);

        if (scanResult.found) {
          setActionStatus({ ok: true, msg: `✅ ESP32 encontrado en ${scanResult.ip}` });
          setNewSSID('');
          setNewPass('');
          await loadWifiStatus();
        } else {
          setActionStatus({
            ok: false,
            msg: '⚠️ ESP32 no encontrado. Verifica el SSID/contraseña o actualiza la IP manualmente.'
          });
        }
        setChangingWifi(false);
      }, 8000);
    } else {
      setActionStatus({ ok: false, msg: `❌ ${result.error}` });
      setChangingWifi(false);
    }
  };

  const handleResetWifi = async () => {
    setShowResetConfirm(false);
    setChangingWifi(true);
    setActionStatus(null);

    const result = await ApiService.resetEsp32Wifi();

    if (result.ok) {
      setActionStatus({ ok: true, msg: '✅ WiFi reseteado. El ESP32 se reiniciará...' });

      setTimeout(async () => {
        setScanning(true);
        setActionStatus({ ok: true, msg: '🔍 Buscando ESP32 en la red...' });
        const scanResult = await ApiService.scanForEsp32();
        setScanning(false);

        if (scanResult.found) {
          setActionStatus({ ok: true, msg: `✅ ESP32 encontrado en ${scanResult.ip}` });
          await loadWifiStatus();
        } else {
          setActionStatus({ ok: false, msg: '⚠️ ESP32 no encontrado tras reset. Verifica la conexión.' });
        }
        setChangingWifi(false);
      }, 8000);
    } else {
      setActionStatus({ ok: false, msg: `❌ ${result.error}` });
      setChangingWifi(false);
    }
  };

  const handleScanOnly = async () => {
    setScanning(true);
    setActionStatus(null);
    const result = await ApiService.scanForEsp32();
    setScanning(false);

    if (result.found) {
      setActionStatus({ ok: true, msg: `✅ ESP32 encontrado en ${result.ip}` });
      await loadWifiStatus();
    } else {
      setActionStatus({ ok: false, msg: `❌ ${result.error || 'ESP32 no encontrado en la subred'}` });
    }
  };

  return (
    <>
      <div className="section-title" style={{ marginTop: 24 }}>
        <IonIcon icon={wifiOutline} style={{ marginRight: 6 }} />
        WIFI DEL ESP32
      </div>

      {/* ── Estado compacto del WiFi ── */}
      {loading ? (
        <div className="connecting-spinner">
          <IonSpinner name="dots" />
          <IonText color="medium">Consultando...</IonText>
        </div>
      ) : statusError ? (
        <IonText color="medium" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
          ⚠️ {statusError}
        </IonText>
      ) : wifiStatus ? (
        <div className="wifi-status-card">
          {wifiStatus.mode === 'ap' ? (
            <div className="network-status-bar">
              <IonIcon icon={warningOutline} color="warning" />
              <IonText color="warning">
                Modo AP — conecta a <strong>{wifiStatus.ap_ssid}</strong>
              </IonText>
            </div>
          ) : (
            <div className="network-status-bar">
              <IonIcon icon={checkmarkCircle} color="success" />
              <IonText color="success">
                <strong>{wifiStatus.ssid}</strong>
                {wifiStatus.rssi !== undefined && (
                  <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 6 }}>
                    {wifiStatus.rssi} dBm ({rssiToSignal(wifiStatus.rssi).label})
                  </span>
                )}
              </IonText>
            </div>
          )}
          {wifiStatus.ip && (
            <IonChip color="medium" className="wifi-detail-chip" style={{ marginTop: 4 }}>
              <IonLabel style={{ fontSize: 12 }}>IP: {wifiStatus.ip}</IonLabel>
            </IonChip>
          )}
        </div>
      ) : null}

      {/* ── Botón para abrir el modal de configuración ── */}
      <IonButton
        expand="block"
        fill="outline"
        size="small"
        color="tertiary"
        onClick={() => { setActionStatus(null); setShowModal(true); }}
        style={{ marginTop: 6 }}
      >
        <IonIcon icon={settingsOutline} slot="start" />
        Configurar WiFi del ESP32
      </IonButton>

      {/* ══════════════════════════════════════════════════ */}
      {/* MODAL: configuración WiFi                        */}
      {/* ══════════════════════════════════════════════════ */}
      <IonModal isOpen={showModal} onDidDismiss={() => setShowModal(false)}>
        <IonHeader>
          <IonToolbar>
            <IonTitle>WiFi del ESP32</IonTitle>
            <IonButton slot="end" fill="clear" onClick={() => setShowModal(false)}>
              Cerrar
            </IonButton>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding">

          {/* Estado en el modal */}
          {actionStatus && (
            <div className="network-status-bar" style={{ marginBottom: 12 }}>
              <IonIcon
                icon={actionStatus.ok ? checkmarkCircle : closeCircle}
                color={actionStatus.ok ? 'success' : 'danger'}
              />
              <IonText color={actionStatus.ok ? 'success' : 'danger'} style={{ fontSize: 13 }}>
                {actionStatus.msg}
              </IonText>
            </div>
          )}

          <IonText color="medium" style={{ fontSize: 12 }}>
            Cambia la red WiFi del ESP32. Se reiniciará para conectarse a la nueva red.
          </IonText>

          <IonInput
            label="SSID (nombre de red)"
            labelPlacement="stacked"
            placeholder="Mi_WiFi"
            value={newSSID}
            onIonInput={e => setNewSSID(e.detail.value!)}
            className="profile-editor-input"
            disabled={changingWifi}
            style={{ marginTop: 16 }}
          />

          <div className="wifi-password-row">
            <IonInput
              label="Contraseña"
              labelPlacement="stacked"
              placeholder="••••••••"
              value={newPass}
              type={showPassword ? 'text' : 'password'}
              onIonInput={e => setNewPass(e.detail.value!)}
              className="profile-editor-input"
              disabled={changingWifi}
              style={{ flex: 1 }}
            />
            <IonButton
              fill="clear" color="medium"
              onClick={() => setShowPassword(p => !p)}
              style={{ alignSelf: 'flex-end', marginBottom: 8 }}
            >
              <IonIcon icon={showPassword ? eyeOffOutline : eyeOutline} />
            </IonButton>
          </div>

          <IonButton
            expand="block"
            color="tertiary"
            onClick={() => setShowConfirm(true)}
            disabled={!newSSID.trim() || changingWifi}
            style={{ marginTop: 12 }}
          >
            {changingWifi ? (
              <><IonSpinner name="dots" style={{ marginRight: 8 }} />
                {scanning ? 'Buscando ESP32...' : 'Aplicando...'}</>
            ) : (
              <><IonIcon icon={wifiOutline} slot="start" /> Cambiar WiFi</>
            )}
          </IonButton>

          <div className="wifi-actions-row" style={{ marginTop: 12 }}>
            <IonButton
              fill="outline" size="small" color="medium"
              onClick={handleScanOnly}
              disabled={scanning || changingWifi}
            >
              <IonIcon icon={searchOutline} slot="start" />
              {scanning ? 'Buscando...' : 'Buscar ESP32'}
            </IonButton>

            <IonButton
              fill="outline" size="small" color="warning"
              onClick={() => setShowResetConfirm(true)}
              disabled={changingWifi}
            >
              <IonIcon icon={syncOutline} slot="start" />
              Resetear WiFi
            </IonButton>

            <IonButton
              fill="clear" size="small" color="medium"
              onClick={loadWifiStatus}
              disabled={loading}
            >
              <IonIcon icon={refreshOutline} slot="icon-only" />
            </IonButton>
          </div>

          <IonText color="medium" style={{ fontSize: 11, display: 'block', marginTop: 12 }}>
            También accesible como <strong>http://robot-car.local</strong> (mDNS)
          </IonText>
        </IonContent>
      </IonModal>

      {/* Confirmación: cambiar WiFi */}
      <IonAlert
        isOpen={showConfirm}
        header="Cambiar WiFi del ESP32"
        message={`El ESP32 se reiniciará y se conectará a "${newSSID}". Si cambias de red su IP puede cambiar. ¿Continuar?`}
        buttons={[
          { text: 'Cancelar', role: 'cancel', handler: () => setShowConfirm(false) },
          { text: 'Cambiar', handler: handleChangeWifi },
        ]}
        onDidDismiss={() => setShowConfirm(false)}
      />

      {/* Confirmación: reset WiFi */}
      <IonAlert
        isOpen={showResetConfirm}
        header="Resetear WiFi"
        message="Se restaurarán las credenciales por defecto y el ESP32 se reiniciará. ¿Continuar?"
        buttons={[
          { text: 'Cancelar', role: 'cancel', handler: () => setShowResetConfirm(false) },
          { text: 'Resetear', role: 'destructive', cssClass: 'alert-button-danger', handler: handleResetWifi },
        ]}
        onDidDismiss={() => setShowResetConfirm(false)}
      />
    </>
  );
};

export default Esp32WifiConfig;
