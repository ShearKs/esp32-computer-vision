import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { ApiService } from '../services/api';
import { useSettings } from '../context/SettingsContext';
import { NetworkProfile } from '../types/interfaces';

const STORAGE_KEY = 'tab2_local_profiles';

export const loadLocalProfiles = (): Record<string, any> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const profilesToList = (profiles: Record<string, any>): NetworkProfile[] =>
  Object.keys(profiles).map(name => ({
    name,
    comment: profiles[name].comment ?? '',
    backend_ip: profiles[name].backend_ip,
    esp32_ip: profiles[name].esp32_ip,
    esp32_stream_port: profiles[name].esp32_stream_port ?? 81,
  }));

export function useNetworkManager() {
  const { triggerReload } = useSettings();

  // ── Estado de conexión ──────────────────────────────
  const [backendProfiles, setBackendProfiles] = useState<Record<string, any>>(loadLocalProfiles);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [serverIp, setServerIp] = useState<string | null>(null);
  const [manualIp, setManualIp] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [backendUrl, setBackendUrl] = useState(ApiService.getBaseUrl());

  // ── Estado ESP32 ────────────────────────────────────
  const [esp32Url, setEsp32Url] = useState('');
  const [esp32Ip, setEsp32Ip] = useState('');
  const [esp32Port, setEsp32Port] = useState('8080');
  const [esp32Status, setEsp32Status] = useState<{ ok: boolean; msg: string } | null>(null);
  const [settingEsp32, setSettingEsp32] = useState(false);

  // ── Editor de perfiles ──────────────────────────────
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [editableProfiles, setEditableProfiles] = useState<NetworkProfile[]>([]);

  // ── Diagnóstico ─────────────────────────────────────
  const [diagLogs, setDiagLogs] = useState<string[]>([]);
  const [diagRunning, setDiagRunning] = useState(false);

  // Flag: datos iniciales de cámara ya cargados (solo 1 vez)
  const initialDataLoaded = useRef(false);

  const displayProfiles = profilesToList(backendProfiles);

  // ── Carga de datos del backend ──────────────────────
  const loadBackendData = useCallback(async () => {
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
      }

      try {
        const info = await fetch(`${ApiService.getBaseUrl()}/api/server-info`).then(r => r.json());
        setServerIp(info.server_ip);
      } catch { /* no pasa nada */ }
    } catch {}
  }, []);

  // ── Inicialización + Polling ────────────────────────
  useEffect(() => {
    const init = async () => {
      const ok = await ApiService.healthCheck();
      setStatus({ ok, msg: ok ? 'Conectado al backend' : 'Sin conexión' });
      setBackendUrl(ApiService.getBaseUrl());
      if (ok) await loadBackendData();
    };
    init();

    const timer = setInterval(async () => {
      const ok = await ApiService.healthCheck();
      setStatus({ ok, msg: ok ? 'Conectado al backend' : 'Sin conexión' });
      setBackendUrl(ApiService.getBaseUrl());
    }, 15000);

    return () => clearInterval(timer);
  }, [loadBackendData]);

  // ── Acciones de perfiles ────────────────────────────
  const handleProfileSelect = useCallback(async (name: string) => {
    setConnecting(true);
    setStatus(null);
    const ok = await ApiService.connectToProfile(name);
    if (ok) {
      await ApiService.setProfile(name);
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
  }, [loadBackendData]);

  const handleManualConnect = useCallback(async () => {
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
  }, [manualIp, loadBackendData]);

  // ── ESP32 ───────────────────────────────────────────
  const handleSetEsp32 = useCallback(async () => {
    const ip = esp32Ip.trim();
    if (!ip) return;
    setSettingEsp32(true);
    setEsp32Status(null);
    const ok = await ApiService.setEsp32Ip(ip, parseInt(esp32Port) || 8080);
    if (ok) {
      setEsp32Status({ ok: true, msg: `Cámara configurada: ${ip}:${esp32Port}` });
      try {
        const config = await ApiService.getConfig();
        setEsp32Url(config.esp32_url);
      } catch {}
      await ApiService.reconnect();
      await new Promise(r => setTimeout(r, 500));
      triggerReload();
    } else {
      setEsp32Status({ ok: false, msg: `Error al configurar cámara ${ip}` });
    }
    setSettingEsp32(false);
  }, [esp32Ip, esp32Port, triggerReload]);

  // ── Editor de perfiles ──────────────────────────────
  const openProfileEditor = useCallback(async () => {
    let profiles: Record<string, any>;
    try {
      profiles = await ApiService.fetchBackendProfiles();
      if (Object.keys(profiles).length === 0) profiles = loadLocalProfiles();
    } catch {
      profiles = loadLocalProfiles();
    }
    if (Object.keys(profiles).length === 0) profiles = backendProfiles;
    setEditableProfiles(profilesToList(profiles));
    setShowProfileEditor(true);
  }, [backendProfiles]);

  const handleProfileChange = useCallback(
    (index: number, field: 'name' | 'comment' | 'backend_ip' | 'esp32_ip' | 'esp32_stream_port', value: string) => {
      setEditableProfiles(prev => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          [field]: field === 'esp32_stream_port' ? parseInt(value) || 81 : value,
        };
        return updated;
      });
    }, []);

  const addProfile = useCallback(() => {
    setEditableProfiles(prev => [
      ...prev,
      { name: '', comment: '', backend_ip: '', esp32_ip: '', esp32_stream_port: 81 },
    ]);
  }, []);

  const removeProfile = useCallback((index: number) => {
    setEditableProfiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const saveProfileEditor = useCallback(async () => {
    const obj: Record<string, any> = {};
    for (const p of editableProfiles) {
      if (p.name.trim()) {
        obj[p.name.trim()] = {
          comment: p.comment,
          backend_ip: p.backend_ip,
          esp32_ip: p.esp32_ip,
          esp32_stream_port: p.esp32_stream_port,
          esp32_stream_path: '/stream',
        };
      }
    }
    try {
      const ok = await ApiService.saveBackendProfiles(obj);
      if (ok) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
        setBackendProfiles(obj);
        setShowProfileEditor(false);
        setEsp32Status({ ok: true, msg: 'Perfiles guardados en backend/data/profiles.json' });
        return;
      }
    } catch {}
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    setBackendProfiles(obj);
    setShowProfileEditor(false);
    setEsp32Status({ ok: true, msg: 'Perfiles guardados localmente (backend no disponible)' });
  }, [editableProfiles]);

  // ── Diagnóstico ─────────────────────────────────────
  const runDiagnostics = useCallback(async () => {
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
  }, []);

  const clearDiagLogs = useCallback(() => setDiagLogs([]), []);

  return {
    // conexión
    status, backendUrl, serverIp, connecting,
    // perfiles
    displayProfiles, activeProfile, backendProfiles,
    handleProfileSelect,
    // IP manual
    manualIp, setManualIp, handleManualConnect,
    // ESP32
    esp32Url, esp32Ip, setEsp32Ip, esp32Port, setEsp32Port,
    esp32Status, settingEsp32, handleSetEsp32,
    // editor de perfiles
    showProfileEditor, setShowProfileEditor,
    editableProfiles, openProfileEditor,
    handleProfileChange, addProfile, removeProfile, saveProfileEditor,
    // diagnóstico
    diagLogs, diagRunning, runDiagnostics, clearDiagLogs,
  };
}
