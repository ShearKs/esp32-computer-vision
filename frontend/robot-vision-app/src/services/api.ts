// src/services/api.ts
import { Capacitor } from '@capacitor/core';
import {
  ConfigResponse, StreamReadyResponse, Detection, DetectionResponse, YoloEvent,
  DetectionsCallback, NetworkProfile
} from '../types/interfaces';

export type {
  ConfigResponse, StreamReadyResponse, Detection, DetectionResponse, YoloEvent,
  DetectionsCallback, NetworkProfile
} from '../types/interfaces';

const BACKEND_PORT = 8000;
const STORAGE_KEY = 'robot_backend_ip';

// ─── Descubrimiento del backend ──────────────────────────────────────

let _baseUrl = 'http://localhost:8000';

const hostname = window.location.hostname;
const isNative = Capacitor.isNativePlatform();

// Para comprobar si estamos en móvil o web
if (isNative) {
  // En móvil, intentamos usar la IP guardada en localStorage (si el usuario se conectó antes)
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    _baseUrl = `http://${stored}:${BACKEND_PORT}`;
  } else if (import.meta.env.VITE_BACKEND_IP) {
    _baseUrl = `http://${import.meta.env.VITE_BACKEND_IP}:${BACKEND_PORT}`;
  }
} else if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
  _baseUrl = `http://${hostname}:${BACKEND_PORT}`;
}

// Intento rápido a una URL para ver si responde (usado en escaneo de red)
function tryFetch(url: string, timeoutMs = 3000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(`${url}/health`, { signal: controller.signal, method: 'GET' })
    .then(r => {
      clearTimeout(timer);
      return true;
    })
    .catch(() => { clearTimeout(timer); return false; });
}

/**
 * Escaneo de subred: prueba un rango de IPs en paralelo buscando el backend.
 */
async function scanSubnet(subnet: string, timeoutMs = 2000): Promise<string | null> {
  const candidates: number[] = [];
  for (let i = 100; i <= 200; i++) candidates.push(i);
  for (let i = 2; i < 100; i++) candidates.push(i);
  for (let i = 201; i <= 254; i++) candidates.push(i);

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

// ─── ApiService ──────────────────────────────────────────────────────

export const ApiService = {
  getBaseUrl: () => _baseUrl,

  /**
   * Busca el backend en la red.
   * 1. Prueba IPs conocidas (hardcoded como fallback).
   * 2. Si nada funciona, escanea la subred completa.
   */
  async scanNetwork(): Promise<boolean> {
    const fallbackIPs = [
      '192.168.1.173', '192.168.1.174',
      '192.168.48.207',
      '192.168.0.50',
    ];

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
      return true;
    }

    // Escanear subredes comunes
    const subnets = ['192.168.1', '192.168.0', '192.168.48'];
    for (const subnet of subnets) {
      const ip = await scanSubnet(subnet, 1500);
      if (ip) {
        _baseUrl = `http://${ip}:${BACKEND_PORT}`;
        localStorage.setItem(STORAGE_KEY, ip);
        return true;
      }
    }

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

  // ─── Endpoints ───────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    const base = ApiService.getBaseUrl();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      await fetch(`${base}/health`, { method: 'GET', signal: controller.signal });
      clearTimeout(timer);
      return true;
    } catch {
      clearTimeout(timer);
      return false;
    }
  },

  /** Fuerza reconexión completa del pipeline (resetea FrameGrabber + config) */
  async reconnect(): Promise<{ camera_reachable: boolean; esp32_url: string } | null> {
    const base = ApiService.getBaseUrl();
    try {
      const res = await fetch(`${base}/api/reconnect`, { method: 'POST' });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  async getConfig(): Promise<ConfigResponse> {
    const base = ApiService.getBaseUrl();
    const res = await fetch(`${base}/api/config`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res.json();
  },

  async getModesYolo(): Promise<{ models: string[]; active: string }> {
    const base = ApiService.getBaseUrl();
    const res = await fetch(`${base}/api/models`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return { models: data.models || [], active: data.active || 'yolov8s' };
  },

  /** Cambia el modelo YOLO en caliente en el backend */
  async switchModel(modelName: string): Promise<{ ok: boolean; model?: string; error?: string }> {
    const base = ApiService.getBaseUrl();
    try {
      const res = await fetch(`${base}/api/model/switch?model=${encodeURIComponent(modelName)}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'Error desconocido' }));
        return { ok: false, error: data.detail || `HTTP ${res.status}` };
      }
      const data = await res.json();
      return { ok: true, model: data.model };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
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

  // Comprueba si el stream de detección está listo (la primera conexión puede tardar un poco)
  async isStreamReady(): Promise<StreamReadyResponse> {
    const base = ApiService.getBaseUrl();
    const res = await fetch(`${base}/api/stream-ready`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  // Realiza una detección puntual (usando el stream configurado o una URL alternativa)
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

  /** Enciende/apaga el LED flash del ESP32-CAM */
  async setFlash(on: boolean): Promise<boolean> {
    const base = ApiService.getBaseUrl();
    const state = on ? 'on' : 'off';
    try {
      const res = await fetch(`${base}/api/flash?state=${state}`, { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    }
  },

  // Mover el coche ESP-32 — fire-and-forget, sin timeout agresivo
  controlRobot(direction: string, speed: number): Promise<void> {
    const base = ApiService.getBaseUrl();
    return fetch(`${base}/api/move?direction=${direction}&speed=${speed}`, { keepalive: true })
      .then(() => { })
      .catch(() => { });
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
  },

  // ─── WiFi del ESP32 ──────────────────────────────────

  /** Obtiene el estado WiFi actual del ESP32 (SSID, IP, RSSI, modo AP) */
  async getEsp32WifiStatus(): Promise<{
    mode: 'sta' | 'ap';
    ssid?: string;
    ip: string;
    rssi?: number;
    mac?: string;
    ap_ssid?: string;
    saved_ssid?: string;
  } | null> {
    const base = ApiService.getBaseUrl();
    try {
      const res = await fetch(`${base}/api/esp32/wifi-status`);
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  /** Envía nuevas credenciales WiFi al ESP32. Se reiniciará tras ~2s. */
  async setEsp32Wifi(ssid: string, password: string): Promise<{ ok: boolean; message?: string; error?: string }> {
    const base = ApiService.getBaseUrl();
    try {
      const res = await fetch(
        `${base}/api/esp32/wifi?ssid=${encodeURIComponent(ssid)}&password=${encodeURIComponent(password)}`,
        { method: 'POST' }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'Error desconocido' }));
        return { ok: false, error: data.detail || `HTTP ${res.status}` };
      }
      const data = await res.json();
      return { ok: true, message: data.message };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },

  /** Resetea el WiFi del ESP32 a las credenciales por defecto. */
  async resetEsp32Wifi(): Promise<{ ok: boolean; error?: string }> {
    const base = ApiService.getBaseUrl();
    try {
      const res = await fetch(`${base}/api/esp32/wifi-reset`, { method: 'POST' });
      return { ok: res.ok };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },

  /** Escanea la subred buscando el ESP32 después de un cambio de WiFi. */
  async scanForEsp32(subnet?: string): Promise<{ found: boolean; ip?: string; error?: string }> {
    const base = ApiService.getBaseUrl();
    try {
      const url = subnet
        ? `${base}/api/esp32/scan?subnet=${encodeURIComponent(subnet)}`
        : `${base}/api/esp32/scan`;
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'No encontrado' }));
        return { found: false, error: data.detail };
      }
      const data = await res.json();
      return { found: true, ip: data.ip };
    } catch (err: any) {
      return { found: false, error: err.message };
    }
  },

  // ─── Funcionalidades extra para dataset y fotos ──────────────────────
  async uploadDatasetImage(blob: Blob): Promise<{ ok: boolean; filename?: string; error?: string }> {
    const base = ApiService.getBaseUrl();
    const formData = new FormData()

    //Introducimos el archivo binario en el formulario
    formData.append('file', blob, 'dataset_frame.jpg');

    try{

      const res = await fetch(`${base}/api/dataset/capture`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok){
        return {ok: false, error: `HTTP ${res.status}`};
      }

      //Obtenemos el data
      const data = await res.json();
      // si todo ha ido bien devolvemos el nombre del archivo guardado en el backend
      return {ok: true, filename: data.filename};

    }catch(err: any){

      return {ok : false , error: err.message};
    }
  },



};