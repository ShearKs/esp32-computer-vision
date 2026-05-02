// src/services/api.ts

// 🔧 IP dinámica: usa la del navegador si no es localhost
const getBaseUrl = () => {
  const hostname = window.location.hostname;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `http://${hostname}:8000`;
  }
  // Fallback para desarrollo en PC (IP de tu PC en la red WiFi)
  return 'http://localhost:8000';
};

const BASE_URL = getBaseUrl();

// Tipos para mejor autocompletado y seguridad
export interface ConfigResponse {
  esp32_url: string;
  esp32_ip: string;
  stream_port: number;
}

export interface StreamReadyResponse {
  ready: boolean;
  stream_url: string | null;
}

export interface Detection {
  object: string;
  confidence: number;
  bbox?: [number, number, number, number];
  timestamp: number;
}

export interface DetectionResponse {
  status: string;
  detections: Detection[];
  count: number;
}

// Servicio principal
export const ApiService = {
  // URL base del backend
  getBaseUrl: () => BASE_URL,

  // === ENDPOINTS PÚBLICOS ===

  // Health check rápido
  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL}/health`, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  },

  // Obtener configuración del robot
  async getConfig(): Promise<ConfigResponse> {
    const res = await fetch(`${BASE_URL}/api/config`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res.json();
  },

  // Verificar si el stream de la cámara está listo
  async isStreamReady(): Promise<StreamReadyResponse> {
    const res = await fetch(`${BASE_URL}/api/stream-ready`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  // Esperar a que el stream esté listo (con reintentos)
  async waitForStream(maxAttempts = 30, intervalMs = 1000): Promise<string> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const data = await ApiService.isStreamReady();
        console.log(`Intento ${i + 1}/${maxAttempts}:`, data);
        if (data.ready && data.stream_url) {
          return data.stream_url;
        }
        // El backend respondió pero la cámara no está lista aún
        console.log(`Intento ${i + 1}/${maxAttempts}: cámara no lista, reintentando...`);
      } catch (err) {
        console.log(`Intento ${i + 1}/${maxAttempts}: backend no disponible, reintentando...`);
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error('Timeout: El stream no estuvo listo');
  },




  // === ENDPOINTS DE DETECCIÓN (YOLO) ===

  // Ejecutar detección en el stream
  async detectObjects(streamUrl?: string): Promise<DetectionResponse> {
    const url = streamUrl 
      ? `${BASE_URL}/api/detect?stream_url=${encodeURIComponent(streamUrl)}`
      : `${BASE_URL}/api/detect`;
    
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res.json();
  },

  // Obtener detecciones recientes (sin procesar nuevo vídeo)
  async getRecentDetections(limit = 10): Promise<Detection[]> {
    const res = await fetch(`${BASE_URL}/api/detections/recent?limit=${limit}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.detections;
  }
};