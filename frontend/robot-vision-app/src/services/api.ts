// src/services/api.ts
import { Capacitor } from '@capacitor/core';
import { ConfigResponse, StreamReadyResponse, Detection, DetectionResponse, YoloEvent,
  DetectionsCallback, NetworkProfile, ProfilesResponse } from '../types/interfaces';

export type { ConfigResponse, StreamReadyResponse, Detection, DetectionResponse, YoloEvent,
  DetectionsCallback, NetworkProfile, ProfilesResponse } from '../types/interfaces';

const BACKEND_PORT = 8000;
const STORAGE_KEY = 'robot_backend_ip';
const STORAGE_PROFILE_KEY = 'robot_active_profile';

// Perfiles de red para escaneo inicial (bootstrap)
// La fuente única de verdad está en backend/data/profiles.json.
// Una vez conectado, el frontend obtiene los perfiles desde el backend.
const KNOWN_PROFILES: NetworkProfile[] = [
  { name: 'casa',        backend_ip: '192.168.1.174',   esp32_ip: '192.168.1.162' },
  { name: 'casa-cable',  backend_ip: '192.168.1.174',   esp32_ip: '192.168.1.173' },
  { name: 'instituto',   backend_ip: '192.168.48.207',  esp32_ip: '192.168.48.86' },
  { name: 'pruebas_movil', backend_ip: '192.168.0.50',  esp32_ip: '192.168.0.50' },
  { name: 'ipwebcam',    backend_ip: '192.168.1.174',   esp32_ip: '192.168.1.XXX' },
  { name: 'wsl-actual',  backend_ip: '192.168.192.207', esp32_ip: '192.168.192.132' },
];

// ─── Descubrimiento del backend ──────────────────────────────────────

let _baseUrl = 'http://localhost:8000';

const hostname = window.location.hostname;
const isNative = Capacitor.isNativePlatform(); // Funciona con Capacitor 5+ (https://localhost)

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
  // Usar AbortController para implementar timeout
  // AbortController es una interfaz de javascript que se utiliza para cancelar peticiones asincronas que están en curso
  // como fetch(), XMLHttpRequest o setTimeout().
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Cualquier respuesta HTTP (incluso 405/500) significa que el servidor ESTÁ ahí
  return fetch(`${url}/health`, { signal: controller.signal, method: 'GET' })
    .then(r => {
      clearTimeout(timer);
      // Cualquier respuesta HTTP (incluso 405/500) significa que el servidor ESTÁ ahí
      console.log(`[tryFetch] ${url} → status:${r.status}`);
      return true;
    })
    // Si fetch falla (timeout, no responde, CORS, etc), asumimos que el backend NO está ahí. No es un error crítico, solo significa que esa URL no funciona.
    .catch((err) => { clearTimeout(timer); console.log(`❌ [tryFetch] ${url} → ${err.message}`); return false; });
}

/** Auto-inicialización: si estamos en nativo y la URL actual no responde, escanear red */
let _initPromise: Promise<void> | null = null;

// En nativo, si la URL actual no responde, escanea los perfiles conocidos para encontrar el backend. En web, asume localhost (no escanea).
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
      console.error('[autoInit] No se encontró backend en ningún perfil');
    }
  })();
  return _initPromise;
}

// ─── ApiService ──────────────────────────────────────────────────────

// Servicio centralizado para interactuar con el backend. Maneja descubrimiento de URL, perfiles, y endpoints específicos.
export const ApiService = {
  getBaseUrl: () => _baseUrl,

  /** Inicialización automática: verifica conexión y escanea si es necesario (solo nativo) */
  autoInit,

  getKnownProfiles: () => KNOWN_PROFILES,

  /** Busca el backend entre todos los perfiles conocidos (escaneo en paralelo). */
  async scanNetwork(): Promise<boolean> {
    console.log('🔍 [scanNetwork] Probando perfiles en paralelo:', KNOWN_PROFILES.map(p => p.name).join(', '));

    // Lanzar todas las peticiones en paralelo (mucho más rápido)
    const results = await Promise.all(
      KNOWN_PROFILES.map(async (p) => {
        const url = `http://${p.backend_ip}:${BACKEND_PORT}`;
        console.log(`🔍 [scanNetwork] Probando "${p.name}" → ${url}`);
        const ok = await tryFetch(url, 3000);
        return { profile: p, url, ok };
      })
    );

    // Usar el primer perfil que respondió
    const found = results.find(r => r.ok);
    if (found) {
      _baseUrl = found.url;
      localStorage.setItem(STORAGE_KEY, found.profile.backend_ip);
      localStorage.setItem(STORAGE_PROFILE_KEY, found.profile.name);
      console.log(`✅ [scanNetwork] Conectado a "${found.profile.name}" → ${found.url}`);
      return true;
    }

    console.warn('❌ [scanNetwork] Ningún perfil respondió');
    return false;
  },

  /** Conecta a un perfil específico por nombre. */
  async connectToProfile(profileName: string): Promise<boolean> {
    const profile = KNOWN_PROFILES.find(p => p.name === profileName);
    if (!profile) return false;
    const url = `http://${profile.backend_ip}:${BACKEND_PORT}`;
    const ok = await tryFetch(url);
    if (ok) {
      _baseUrl = url;
      localStorage.setItem(STORAGE_KEY, profile.backend_ip);
      localStorage.setItem(STORAGE_PROFILE_KEY, profile.name);
    }
    return ok;
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
  async setEsp32Ip(ip: string, port = 8080, path = '/video'): Promise<boolean> {
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