export interface VideoStreamProps {
  streamUrl: string;
  isConnected: boolean;
  onConnectionChange?: (connected: boolean) => void;
}

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
