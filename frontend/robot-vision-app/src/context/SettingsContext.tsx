// src/context/SettingsContext.tsx
import React, { createContext, useContext, useState, useCallback } from 'react';
import { ApiService } from '../services/api';

export type DrivingMode = 'http' | 'websocket';

export interface CaptureResult {
  ok: boolean;
  filename?: string;
  error?: string;
}

interface SettingsContextType {
  yoloEnabled: boolean;
  flashActive: boolean;
  reloadKey: number;
  drivingMode: DrivingMode;
  yoloModel: string;
  isCapturing: boolean;
  setYoloEnabled: (val: boolean) => void;
  setFlashActive: (val: boolean) => void;
  triggerReload: () => void;
  setDrivingMode: (mode: DrivingMode) => void;
  setYoloModel: (model: string) => void;
  capturePhoto: () => Promise<CaptureResult>;
}

const SettingsContext = createContext<SettingsContextType>({
  yoloEnabled: true,
  flashActive: false,
  reloadKey: 0,
  drivingMode: 'websocket',
  yoloModel: 'yolov8s',
  isCapturing: false,
  setFlashActive: () => {},
  setYoloEnabled: () => {},
  triggerReload: () => {},
  setDrivingMode: () => {},
  setYoloModel: () => {},
  capturePhoto: async () => ({ ok: false, error: 'Context not initialized' }),
});

// Keys para localStorage
const LS_YOLO_ENABLED = 'robot_yolo_enabled';
const LS_YOLO_MODEL = 'robot_yolo_model';

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Leer valores iniciales desde localStorage (o usar defaults)
  const [yoloEnabled, _setYoloEnabled] = useState(() => {
    const stored = localStorage.getItem(LS_YOLO_ENABLED);
    return stored !== null ? stored === 'true' : true;
  });
  const [flashActive, setFlashActive] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [drivingMode, setDrivingMode] = useState<DrivingMode>('websocket');
  const [yoloModel, _setYoloModel] = useState(() => {
    return localStorage.getItem(LS_YOLO_MODEL) || '';
  });
  const [isCapturing, setIsCapturing] = useState(false);

  // Wrappers que persisten en localStorage al cambiar
  const setYoloEnabled = useCallback((val: boolean) => {
    _setYoloEnabled(val);
    localStorage.setItem(LS_YOLO_ENABLED, String(val));
  }, []);

  const setYoloModel = useCallback((model: string) => {
    _setYoloModel(model);
    if (model) localStorage.setItem(LS_YOLO_MODEL, model);
  }, []);

  const triggerReload = useCallback(() => {
    setReloadKey(prev => prev + 1);
  }, []);

  const capturePhoto = useCallback(async (): Promise<CaptureResult> => {
    const imgElement = document.querySelector('.detection-stream-img') as HTMLImageElement
      || document.querySelector('.stream-img') as HTMLImageElement;

    if (!imgElement) {
      return { ok: false, error: 'No se encontró ninguna imagen de video activa' };
    }

    setIsCapturing(true);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = imgElement.naturalWidth || 640;
      canvas.height = imgElement.naturalHeight || 480;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setIsCapturing(false);
        return { ok: false, error: 'No se pudo crear el contexto del canvas' };
      }

      ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', 0.95);
      });

      if (!blob) {
        setIsCapturing(false);
        return { ok: false, error: 'No se pudo generar el blob de la imagen' };
      }

      const result = await ApiService.uploadDatasetImage(blob);
      setIsCapturing(false);
      return result;
    } catch (error) {
      setIsCapturing(false);
      return { ok: false, error: String(error) };
    }
  }, []);

  return (
    <SettingsContext.Provider value={{ yoloEnabled, setYoloEnabled, 
                                       flashActive, setFlashActive, 
                                       reloadKey, triggerReload, 
                                       drivingMode, setDrivingMode,
                                       yoloModel, setYoloModel,
                                       isCapturing, capturePhoto }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
