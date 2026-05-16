
export interface NetworkProfile {
  name: string;
  comment: string;
  backend_ip: string;
  esp32_ip: string;
  esp32_stream_port: number;
}

export interface ConfigResponse {
  esp32_url: string;
  esp32_ip: string;
  stream_port: number;
  backend_ip: string;
  active_profile: string;
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
export type Direction = 'forward' | 'backward' | 'left' | 'right' | 'stop';
export interface JoystickControlProps {
    onMove: (direction: Direction, speed: number, x: number, y: number) => void;
    onStop: () => void;
    onError?: (error: Error) => void;
}


export type DetectionsCallback = (event: YoloEvent) => void;
