// src/services/api.ts
import { Capacitor } from '@capacitor/core';
import { ConfigResponse, StreamReadyResponse, Detection, DetectionResponse, YoloEvent,
  DetectionsCallback, NetworkProfile, ProfilesResponse } from '../types/interfaces';

export type { ConfigResponse, StreamReadyResponse, Detection, DetectionResponse, YoloEvent,
  DetectionsCallback, NetworkProfile, ProfilesResponse } from '../types/interfaces';

const BACKEND_PORT = 8000;
const STORAGE_KEY = 'robot_backend_ip';
const STORAGE_PROFILE_KEY = 'robot_active_profile';

// ─── Descubrimiento del backend ──────────────────────────────────────

let _baseUrl = 'http://localhost:8000';

const hostname = window.location.hostname;
const isNative = Capacitor.isNativePlatform();

if (isNative) {
  // En Android/iOS nativo: usar IP guardada o la de .env
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    _baseUrl = `http://${stored}:${BACKEND_PORT}`;
  } else if (import.meta.env.VITE_BACKEND_IP) {
    _baseUrl = `http://${import.meta.env.VITE_BACKEND_IP}:${BACKEND_PORT}`;
  }
} else if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
  // En navegador accediendo por IP de red (ej: ionic serve --external)
  _baseUrl = `http://${hostname}:${BACKEND_PORT}`;
}

// Intenta hacer fetch a /health para verificar si el backend responde en la URL dada. Timeout rápido para no bloquear la app.
function tryFetch(url: string, timeoutMs = 3000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(`${url}/health`, { signal: controller.signal, method: 'GET' })
    .then(r => {
      clearTimeout(timer);
      console.log(`[tryFetch] ${url} → status:${r.status}`);
      return true;
    })
    .catch((err) => { clearTimeout(timer); console.log(`❌ [tryFetch] ${url} → ${err.message}`); return false; });
}

/**
 * Escaneo inteligente de subred: dado un prefijo de subred (ej "192.168.1"),
 * prueba un rango de IPs comunes en paralelo buscando el backend.
 * Devuelve la IP encontrada o null.
 */
async function scanSubnet(subnet: string, timeoutMs = 2000): Promise<string | null> {
  // Rango de IPs típicas para equipos en red doméstica
  const candidates: number[] = [];
  // Primero las más comunes (100-200), luego el resto
  for (let i = 100; i <= 200; i++) candidates.push(i);
  for (let i = 2; i < 100; i++) candidates.push(i);
  for (let i = 201; i <= 254; i++) candidates.push(i);

  // Escanear en bloques de 30 para no saturar la red
  const BATCH_SIZE = 30;
  for (let batch = 0; batch < candidates.length; batch += BATCH_SIZE) {
    const slice = candidates.slice(batch, batch + BATCH_SIZE);
    const results = await Promise.all(
      slice.map(async (host) => {
        const ip = `${subnet}.${host}`;
        const url = `http://${ip}:${BACKEND_PORT}`;
        const ok = await tryFetch(url, timeoutMs);
        return { ip, ok };
      })
    );
    const found = results.find(r => r.ok);
    if (found) return found.ip;
  }
  return null;
}

/** Auto-inicialización: si estamos en nativo y la URL actual no responde, escanear red */
let _initPromise: Promise<void> | null = null;

function autoInit(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    if (!isNative) return; // En web localhost siempre funciona
    console.log('[autoInit] Verificando conexión con:', _baseUrl);
    const ok = await tryFetch(_baseUrl, 3000);
    if (ok) {
      console.log('[autoInit] Backend accesible en:', _baseUrl);
      return;
    }
    console.warn('[autoInit] Backend NO accesible en', _baseUrl, '→ escaneando red...');
    const found = await ApiService.scanNetwork();
    if (found) {
      console.log('[autoInit] Backend encontrado tras escaneo:', _baseUrl);
    } else {
      console.error('[autoInit] No se encontró backend en ninguna red conocida');
    }
  })();
  return _initPromise;
}

// ─── ApiService ──────────────────────────────────────────────────────

export const ApiService = {
  getBaseUrl: () => _baseUrl,

  /** Inicialización automática: verifica conexión y escanea si es necesario (solo nativo) */
  autoInit,

  /**
   * Busca el backend en la red.
   * 1. Primero intenta obtener perfiles del backend ya conectado.
   * 2. Luego prueba perfiles conocidos (hardcoded como fallback).
   * 3. Si nada funciona, escanea la subred completa.
   */
  async scanNetwork(): Promise<boolean> {
    // Paso 1: Intentar perfiles hardcoded (fallback mínimo para bootstrap)
    const fallbackIPs = [
      '192.168.1.173', '192.168.1.174',   // casa WiFi/cable
      '192.168.48.207',                     // instituto
      '192.168.0.50',                       // pruebas_movil
    ];

    console.log('🔍 [scanNetwork] Probando IPs conocidas...');
    const results = await Promise.all(
      fallbackIPs.map(async (ip) => {
        const url = `http://${ip}:${BACKEND_PORT}`;
        const ok = await tryFetch(url, 2500);
        return { ip, url, ok };
      })
    );

    const found = results.find(r => r.ok);
    if (found) {
      _baseUrl = found.url;
      localStorage.setItem(STORAGE_KEY, found.ip);
      console.log(`[scanNetwork] Encontrado en IP conocida: ${found.ip}`);
      // Ahora pedir al servidor su IP real (puede ser diferente si hay NAT)
      try {
        const info = await fetch(`${_baseUrl}/api/server-info`).then(r => r.json());
        if (info.server_ip && info.server_ip !== found.ip) {
          console.log(`📌 [scanNetwork] Servidor reporta IP real: ${info.server_ip}`);
        }
      } catch { /* no pasa nada */ }
      return true;
    }

    // Paso 2: Escanear subredes comunes completas
    const subnets = ['192.168.1', '192.168.0', '192.168.48'];
    for (const subnet of subnets) {
      console.log(`🔍 [scanNetwork] Escaneando subred ${subnet}.x ...`);
      const ip = await scanSubnet(subnet, 1500);
      if (ip) {
        _baseUrl = `http://${ip}:${BACKEND_PORT}`;
        localStorage.setItem(STORAGE_KEY, ip);
        console.log(`[scanNetwork] Backend encontrado en ${ip}`);
        return true;
      }
    }

    console.warn('[scanNetwork] Ninguna IP respondió');
    return false;
  },

  /** Conecta a una IP manual. */
  async connectToIp(ip: string): Promise<boolean> {
    const url = `http://${ip}:${BACKEND_PORT}`;
    const ok = await tryFetch(url);
    if (ok) {
      _baseUrl = url;
      localStorage.setItem(STORAGE_KEY, ip);
    }
    return ok;
  },

  /** Conecta a un perfil por nombre (usa los perfiles del backend). */
  async connectToProfile(profileName: string): Promise<boolean> {
    try {
      const profiles = await ApiService.fetchBackendProfiles();
      const profile = profiles[profileName];
      if (!profile) return false;
      return await ApiService.connectToIp(profile.backend_ip);
    } catch {
      return false;
    }
  },

  /** Cambia el perfil activo en el backend */
  async setProfile(profile: string): Promise<boolean> {
    try {
      const res = await fetch(`${_baseUrl}/api/config/profile?profile=${encodeURIComponent(profile)}`, { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    }
  },

  /** Configura IP manual de la cámara ESP32 en el backend */
  async setEsp32Ip(ip: string, port = 81, path = '/stream'): Promise<boolean> {
    try {
      const res = await fetch(`${_baseUrl}/api/config/esp32?ip=${ip}&port=${port}&path=${encodeURIComponent(path)}`, { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    }
  },

  /** Obtiene perfiles completos desde el backend (fuente única de verdad) */
  async fetchBackendProfiles(): Promise<Record<string, { backend_ip: string; esp32_ip: string }>> {
    try {
      const res = await fetch(`${_baseUrl}/api/config/profiles/raw`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch {
      return {};
    }
  },

  /** Guarda perfiles en el backend (persiste en backend/data/profiles.json) */
  async saveBackendProfiles(profiles: Record<string, any>): Promise<boolean> {
    try {
      const res = await fetch(
        `${_baseUrl}/api/config/profiles/save?profiles=${encodeURIComponent(JSON.stringify(profiles))}`,
        { method: 'POST' }
      );
      return res.ok;
    } catch {
      return false;
    }
  },

  /** Obtiene el perfil activo de la config del backend */
  async getActiveProfile(): Promise<string> {
    try {
      const config = await ApiService.getConfig();
      return config.active_profile;
    } catch {
      return 'unknown';
    }
  },

  getConnectedProfile(): string | null {
    return localStorage.getItem(STORAGE_PROFILE_KEY);
  },

  // ─── Endpoints ───────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    await autoInit(); // Asegurar que tenemos la URL correcta
    const base = ApiService.getBaseUrl();
    try {
      const res = await fetch(`${base}/health`, { method: 'GET' });
      // Cualquier respuesta HTTP = servidor accesible
      return true;
    } catch {
      return false;
    }
  },

  async getConfig(): Promise<ConfigResponse> {
    const base = ApiService.getBaseUrl();
    const res = await fetch(`${base}/api/config`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res.json();
  },

  async getProfiles(): Promise<ProfilesResponse> {
    const base = ApiService.getBaseUrl();
    const res = await fetch(`${base}/api/profiles`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res.json();
  },

  async getEsp32StreamUrl(): Promise<string> {
    const config = await ApiService.getConfig();
    return config.esp32_url;
  },

  getYoloStreamUrl(confidence?: number): string {
    const base = ApiService.getBaseUrl();
    const url = `${base}/api/stream/yolo`;
    if (confidence !== undefined) return `${url}?confidence=${confidence}`;
    return url;
  },

  /** URL del proxy raw (sin YOLO) — funciona con cualquier cámara configurada */
  getRawStreamUrl(): string {
    const base = ApiService.getBaseUrl();
    return `${base}/api/stream/raw`;
  },

  async isStreamReady(): Promise<StreamReadyResponse> {
    const base = ApiService.getBaseUrl();
    const res = await fetch(`${base}/api/stream-ready`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  async waitForStream(maxAttempts = 30, intervalMs = 1000): Promise<string> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const data = await ApiService.isStreamReady();
        if (data.ready && data.stream_url) return data.stream_url;
      } catch {
        // reintentar
      }
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error('Timeout: El stream no estuvo listo');
  },

  async detectObjects(streamUrl?: string): Promise<DetectionResponse> {
    const base = ApiService.getBaseUrl();
    const url = streamUrl
      ? `${base}/api/detect?stream_url=${encodeURIComponent(streamUrl)}`
      : `${base}/api/detect`;
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res.json();
  },

  async getRecentDetections(limit = 10): Promise<Detection[]> {
    const base = ApiService.getBaseUrl();
    const res = await fetch(`${base}/api/detections/recent?limit=${limit}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.detections;
  },

  subscribeDetections(callback: DetectionsCallback): () => void {
    const base = ApiService.getBaseUrl();
    const es = new EventSource(`${base}/api/stream/yolo/events`);
    es.onmessage = (event) => {
      try {
        callback(JSON.parse(event.data));
      } catch { /* ignore malformed */ }
    };
    return () => es.close();
  }
};