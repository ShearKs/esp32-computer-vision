import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonList, IonItem, IonLabel, IonRadioGroup, IonRadio,
  IonButton, IonInput, IonText, IonSpinner, IonIcon, IonChip,
  IonModal, IonTextarea
} from '@ionic/react';
import { ApiService } from '../services/api';
import { NetworkProfile } from '../types/interfaces';
import {
  checkmarkCircle, closeCircle, wifi, bugOutline,
  pulseOutline, cameraOutline, saveOutline, addOutline
} from 'ionicons/icons';
import './Tab2.css';

const Tab2: React.FC = () => {
  // Perfiles: se obtienen del backend (fuente única de verdad)
  const [backendProfiles, setBackendProfiles] = useState<Record<string, { backend_ip: string; esp32_ip: string }>>({});
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [serverIp, setServerIp] = useState<string | null>(null);
  const [manualIp, setManualIp] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [backendUrl, setBackendUrl] = useState(ApiService.getBaseUrl());

  // Estado ESP32
  const [esp32Url, setEsp32Url] = useState('');
  const [esp32Ip, setEsp32Ip] = useState('');
  const [esp32Port, setEsp32Port] = useState('8080');
  const [esp32Status, setEsp32Status] = useState<{ ok: boolean; msg: string } | null>(null);
  const [settingEsp32, setSettingEsp32] = useState(false);

  // Editor de perfiles
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [profileEditorContent, setProfileEditorContent] = useState('');

  // Diagnóstico
  const [diagLogs, setDiagLogs] = useState<string[]>([]);
  const [diagRunning, setDiagRunning] = useState(false);

  // Flag: datos iniciales de cámara ya cargados (solo 1 vez)
  const initialDataLoaded = useRef(false);

  // Obtener lista visible de perfiles (solo del backend)
  const displayProfiles: NetworkProfile[] = Object.keys(backendProfiles).map(name => ({
    name,
    backend_ip: backendProfiles[name].backend_ip,
    esp32_ip: backendProfiles[name].esp32_ip
  }));

  // Carga completa: config + perfiles + server info. Solo se llama al montar y tras acciones manuales.
  const loadBackendData = async () => {
    try {
      const config = await ApiService.getConfig();
      setEsp32Url(config.esp32_url);
      setActiveProfile(config.active_profile);

      // Solo poner IP/puerto en los inputs la PRIMERA VEZ
      if (!initialDataLoaded.current) {
        setEsp32Ip(config.esp32_ip);
        setEsp32Port(String(config.stream_port));
        initialDataLoaded.current = true;
      }

      const profiles = await ApiService.fetchBackendProfiles();
      if (Object.keys(profiles).length > 0) {
        setBackendProfiles(profiles);
      }

      try {
        const info = await fetch(`${ApiService.getBaseUrl()}/api/server-info`).then(r => r.json());
        setServerIp(info.server_ip);
      } catch { /* no pasa nada */ }
    } catch {}
  };

  useEffect(() => {
    // Carga inicial: health check + datos completos
    const init = async () => {
      const ok = await ApiService.healthCheck();
      setStatus({ ok, msg: ok ? 'Conectado al backend' : 'Sin conexión' });
      setBackendUrl(ApiService.getBaseUrl());
      if (ok) await loadBackendData();
    };
    init();

    // Polling: SOLO health check (no recargar datos de cámara)
    const timer = setInterval(async () => {
      const ok = await ApiService.healthCheck();
      setStatus({ ok, msg: ok ? 'Conectado al backend' : 'Sin conexión' });
      setBackendUrl(ApiService.getBaseUrl());
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  const handleProfileSelect = async (name: string) => {
    setConnecting(true);
    setStatus(null);
    const ok = await ApiService.connectToProfile(name);
    if (ok) {
      await ApiService.setProfile(name);
      // Tras cambio de perfil, recargar datos y permitir actualizar inputs
      initialDataLoaded.current = false;
      await loadBackendData();
    }
    setConnecting(false);
    if (ok) {
      setActiveProfile(name);
      setBackendUrl(ApiService.getBaseUrl());
      setStatus({ ok: true, msg: `Conectado a "${name}"` });
    } else {
      setStatus({ ok: false, msg: `No se pudo conectar a "${name}"` });
    }
  };

  const handleManualConnect = async () => {
    const ip = manualIp.trim();
    if (!ip) return;
    setConnecting(true);
    setStatus(null);
    const ok = await ApiService.connectToIp(ip);
    setConnecting(false);
    if (ok) {
      setActiveProfile(null);
      setBackendUrl(ApiService.getBaseUrl());
      setStatus({ ok: true, msg: `Conectado a ${ip}` });
      initialDataLoaded.current = false;
      await loadBackendData();
    } else {
      setStatus({ ok: false, msg: `No hay backend en ${ip}` });
    }
  };

  const handleSetEsp32 = async () => {
    const ip = esp32Ip.trim();
    if (!ip) return;
    setSettingEsp32(true);
    setEsp32Status(null);
    const ok = await ApiService.setEsp32Ip(ip, parseInt(esp32Port) || 8080);
    setSettingEsp32(false);
    if (ok) {
      setEsp32Status({ ok: true, msg: `Cámara configurada: ${ip}:${esp32Port}` });
      // Recargar URL de cámara actualizada (pero NO sobreescribir inputs)
      try {
        const config = await ApiService.getConfig();
        setEsp32Url(config.esp32_url);
      } catch {}
    } else {
      setEsp32Status({ ok: false, msg: `Error al configurar cámara ${ip}` });
    }
  };

  const openProfileEditor = async () => {
    const profiles = await ApiService.fetchBackendProfiles();
    setProfileEditorContent(JSON.stringify(profiles, null, 2));
    setShowProfileEditor(true);
  };

  const saveProfileEditor = async () => {
    try {
      const parsed = JSON.parse(profileEditorContent);
      const ok = await ApiService.saveBackendProfiles(parsed);
      if (ok) {
        setBackendProfiles(parsed);
        setShowProfileEditor(false);
        setEsp32Status({ ok: true, msg: 'Perfiles guardados en backend/data/profiles.json' });
      } else {
        setEsp32Status({ ok: false, msg: 'Error al guardar perfiles' });
      }
    } catch {
      setEsp32Status({ ok: false, msg: 'JSON inválido' });
    }
  };

  /** Test completo de conectividad */
  const runDiagnostics = async () => {
    setDiagLogs([]);
    setDiagRunning(true);
    const log = (msg: string) => setDiagLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    log(`📱 Plataforma: ${Capacitor.isNativePlatform() ? 'Nativa (Android/iOS)' : 'Web'}`);
    log(`🌐 Base URL actual: ${ApiService.getBaseUrl()}`);

    log('--- Test 1: Health Check ---');
    const baseUrl = ApiService.getBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/health`, { method: 'GET' });
      log(`✅ /health → ${res.status} ${res.ok ? 'OK' : 'FAIL'}`);
    } catch (err: any) {
      log(`❌ /health → ${err.message}`);
    }

    log('--- Test 2: Stream Ready ---');
    try {
      const res = await fetch(`${baseUrl}/api/stream-ready`);
      const data = await res.json();
      log(`${data.ready ? '✅' : '⚠️'} stream-ready → ready:${data.ready}, url:${data.stream_url || 'null'}`);
    } catch (err: any) {
      log(`❌ stream-ready → ${err.message}`);
    }

    log('--- Test 3: API Config ---');
    try {
      const config = await ApiService.getConfig();
      log(`✅ config → ESP32: ${config.esp32_url}`);
      log(`   Backend IP: ${config.backend_ip}, Perfil: ${config.active_profile}`);
    } catch (err: any) {
      log(`❌ config → ${err.message}`);
    }

    log('--- Diagnóstico completado ---');
    setDiagRunning(false);
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Red</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        {/* Estado actual */}
        <div className="network-status-bar">
          <IonIcon icon={status?.ok ? checkmarkCircle : closeCircle}
            color={status?.ok ? 'success' : 'danger'} />
          <IonText color={status?.ok ? 'success' : 'danger'}>
            {status?.msg ?? 'Verificando...'}
          </IonText>
        </div>

        {backendUrl && backendUrl !== 'http://localhost:8000' && (
          <IonChip className="backend-url-chip" color="medium">
            <IonIcon icon={wifi} />
            <IonLabel>{backendUrl}</IonLabel>
          </IonChip>
        )}

        {serverIp && (
          <IonChip color="success" style={{ marginTop: 4 }}>
            <IonIcon icon={wifi} />
            <IonLabel>IP del servidor: {serverIp}</IonLabel>
          </IonChip>
        )}

        {connecting && (
          <div className="connecting-spinner">
            <IonSpinner name="crescent" />
            <IonText color="medium">Conectando...</IonText>
          </div>
        )}

        {/* Perfiles desde backend */}
        <div className="section-title">
          REDES CONFIGURADAS
          {Object.keys(backendProfiles).length > 0 && (
            <IonText color="medium" style={{ fontSize: 10, fontWeight: 'normal', marginLeft: 6 }}>
              (backend/data/profiles.json)
            </IonText>
          )}
        </div>
        <IonRadioGroup value={activeProfile} onIonChange={e => handleProfileSelect(e.detail.value)}>
          <IonList className="profile-list">
            {displayProfiles.map(p => (
              <IonItem key={p.name} className="profile-item">
                <IonRadio slot="start" value={p.name} />
                <IonLabel>
                  <h3>{p.name}</h3>
                  <p>Backend: {p.backend_ip}:8000 &middot; ESP32: {p.esp32_ip}</p>
                </IonLabel>
              </IonItem>
            ))}
          </IonList>
        </IonRadioGroup>

        <IonButton
          expand="block"
          fill="outline"
          size="small"
          color="tertiary"
          onClick={openProfileEditor}
          style={{ marginTop: 4 }}
          disabled={!status?.ok}
        >
          <IonIcon icon={addOutline} slot="start" />
          Editar perfiles (JSON)
        </IonButton>

        {/* IP manual backend */}
        <div className="section-title" style={{ marginTop: 16 }}>IP MANUAL (BACKEND)</div>
        <div className="manual-ip-row">
          <IonInput
            placeholder="192.168.1.174"
            value={manualIp}
            onIonInput={e => setManualIp(e.detail.value!)}
            className="manual-ip-input"
            clearInput
          />
          <IonButton onClick={handleManualConnect} disabled={connecting || !manualIp.trim()}>
            Conectar
          </IonButton>
        </div>

        {/* ═══════════════════════════════════════════════════ */}
        {/* CÁMARA ESP32 / IP WEBCAM                          */}
        {/* ═══════════════════════════════════════════════════ */}
        <div className="section-title" style={{ marginTop: 16 }}>
          <IonIcon icon={cameraOutline} style={{ marginRight: 6 }} />
          CÁMARA ESP32 / IP WEBCAM
        </div>

        {esp32Url && (
          <IonChip className="backend-url-chip" color="tertiary">
            <IonIcon icon={cameraOutline} />
            <IonLabel>{esp32Url}</IonLabel>
          </IonChip>
        )}

        {esp32Status && (
          <div className="network-status-bar" style={{ marginBottom: 8 }}>
            <IonIcon icon={esp32Status.ok ? checkmarkCircle : closeCircle}
              color={esp32Status.ok ? 'success' : 'danger'} />
            <IonText color={esp32Status.ok ? 'success' : 'danger'}>
              {esp32Status.msg}
            </IonText>
          </div>
        )}

        <div className="manual-ip-row">
          <IonInput
            placeholder="192.168.1.132"
            value={esp32Ip}
            onIonInput={e => setEsp32Ip(e.detail.value!)}
            className="manual-ip-input"
            clearInput
            style={{ flex: 2 }}
          />
          <IonInput
            placeholder="8080"
            value={esp32Port}
            onIonInput={e => setEsp32Port(e.detail.value!)}
            className="manual-ip-input"
            clearInput
            style={{ flex: 1, maxWidth: 100 }}
          />
          <IonButton onClick={handleSetEsp32} disabled={settingEsp32 || !esp32Ip.trim()}>
            {settingEsp32 ? <IonSpinner name="dots" /> : 'Aplicar'}
          </IonButton>
        </div>
        <IonText color="medium" style={{ fontSize: 12, paddingLeft: 4 }}>
          Se guarda en backend/data/active_config.json y persiste al reiniciar
        </IonText>

        {/* ═══════════════════════════════════════════════════ */}
        {/* DIAGNÓSTICO                                       */}
        {/* ═══════════════════════════════════════════════════ */}
        <div className="section-title" style={{ marginTop: 24 }}>
          <IonIcon icon={bugOutline} style={{ marginRight: 6 }} />
          DIAGNÓSTICO
        </div>

        <IonButton
          expand="block"
          color="tertiary"
          onClick={runDiagnostics}
          disabled={diagRunning}
          style={{ marginBottom: 12 }}
        >
          {diagRunning ? (
            <><IonSpinner name="dots" style={{ marginRight: 8 }} /> Ejecutando tests...</>
          ) : (
            <><IonIcon icon={pulseOutline} slot="start" /> Ejecutar test de conectividad</>
          )}
        </IonButton>

        {diagLogs.length > 0 && (
          <div style={{
            background: '#1a1a2e',
            borderRadius: 8,
            padding: 12,
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#e0e0e0',
            maxHeight: 300,
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            border: '1px solid #333'
          }}>
            {diagLogs.map((line, i) => (
              <div key={i} style={{
                padding: '2px 0',
                color: line.includes('✅') ? '#4ade80' :
                       line.includes('❌') ? '#f87171' :
                       line.includes('⚠️') ? '#fbbf24' :
                       line.includes('---') ? '#60a5fa' : '#e0e0e0'
              }}>
                {line}
              </div>
            ))}
          </div>
        )}

        {diagLogs.length > 0 && (
          <IonButton
            expand="block"
            fill="clear"
            color="medium"
            onClick={() => setDiagLogs([])}
            style={{ marginTop: 8 }}
          >
            Limpiar logs
          </IonButton>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* MODAL: EDITOR DE PERFILES JSON                    */}
        {/* ═══════════════════════════════════════════════════ */}
        <IonModal isOpen={showProfileEditor} onDidDismiss={() => setShowProfileEditor(false)}>
          <IonHeader>
            <IonToolbar>
              <IonTitle>Editar perfiles</IonTitle>
              <IonButton slot="end" fill="clear" onClick={() => setShowProfileEditor(false)}>
                Cerrar
              </IonButton>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding">
            <IonText color="medium" style={{ fontSize: 12 }}>
              Edita backend/data/profiles.json directamente. Los cambios se guardan en el servidor.
            </IonText>
            <IonTextarea
              value={profileEditorContent}
              onIonInput={e => setProfileEditorContent(e.detail.value!)}
              style={{
                fontFamily: 'monospace',
                fontSize: 12,
                minHeight: 300,
                marginTop: 12,
                '--background': '#1a1a2e',
                '--color': '#e0e0e0',
                border: '1px solid #333',
                borderRadius: 8,
                padding: 8
              }}
              autoGrow
            />
            <IonButton
              expand="block"
              onClick={saveProfileEditor}
              style={{ marginTop: 16 }}
            >
              <IonIcon icon={saveOutline} slot="start" />
              Guardar en backend/data/profiles.json
            </IonButton>
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  );
};

export default Tab2;
