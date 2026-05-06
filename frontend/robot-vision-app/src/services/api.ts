// src/services/api.ts

// IP dinámica: usa la del navegador si no es localhost
const getBaseUrl = () => {
  const hostname = window.location.hostname;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `http://${hostname}:8000`;
  }
  return 'http://localhost:8000';
};

const BASE_URL = getBaseUrl();

// Tipos
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

export interface YoloEvent {
  timestamp: number;
  detections: Detection[];
  count: number;
}

export type DetectionsCallback = (event: YoloEvent) => void;

// Servicio principal
export const ApiService = {
  getBaseUrl: () => BASE_URL,

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL}/health`, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  },

  // Configuración del robot
  async getConfig(): Promise<ConfigResponse> {
    const res = await fetch(`${BASE_URL}/api/config`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res.json();
  },

  // Stream de la cámara ESP32 directo
  async getEsp32StreamUrl(): Promise<string> {
    const config = await ApiService.getConfig();
    return config.esp32_url;
  },

  // URL del stream YOLO (MJPEG con bounding boxes)
  getYoloStreamUrl(confidence?: number): string {
    const url = `${BASE_URL}/api/stream/yolo`;
    if (confidence !== undefined) {
      return `${url}?confidence=${confidence}`;
    }
    return url;
  },

  // Verificar si el stream está listo
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
        console.log(`Intento ${i + 1}/${maxAttempts}: cámara no lista, reintentando...`);
      } catch (err) {
        console.log(`Intento ${i + 1}/${maxAttempts}: backend no disponible, reintentando...`);
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error('Timeout: El stream no estuvo listo');
  },

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
  },

  // Suscribirse a detecciones en tiempo real vía SSE
  subscribeDetections(callback: DetectionsCallback): () => void {
    const es = new EventSource(`${BASE_URL}/api/stream/yolo/events`);

    es.onmessage = (event) => {
      try {
        const data: YoloEvent = JSON.parse(event.data);
        callback(data);
      } catch (err) {
        console.error('Error parsing SSE:', err);
      }
    };

    es.onerror = () => {
      console.log('SSE reconectando...');
    };

    return () => es.close();
  }
};