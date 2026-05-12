// src/services/api.ts
import { Capacitor } from '@capacitor/core';
import { ConfigResponse, StreamReadyResponse, Detection, DetectionResponse, YoloEvent,
  DetectionsCallback, NetworkProfile } from '../types/interfaces';

export type { ConfigResponse, StreamReadyResponse, Detection, DetectionResponse, YoloEvent,
  DetectionsCallback, NetworkProfile } from '../types/interfaces';

const BACKEND_PORT = 8000;
const STORAGE_KEY = 'robot_backend_ip';

// ─── Descubrimiento del backend ──────────────────────────────────────

let _baseUrl = 'http://localhost:8000';

const hostname = window.location.hostname;
const isNative = Capacitor.isNativePlatform();

if (isNative) {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    _baseUrl = `http://${stored}:${BACKEND_PORT}`;
  } else if (import.meta.env.VITE_BACKEND_IP) {
    _baseUrl = `http://${import.meta.env.VITE_BACKEND_IP}:${BACKEND_PORT}`;
  }
} else if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
  _baseUrl = `http://${hostname}:${BACKEND_PORT}`;
}

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