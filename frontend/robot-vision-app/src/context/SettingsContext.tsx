// src/context/SettingsContext.tsx
import React, { createContext, useContext, useState, useCallback } from 'react';

interface SettingsContextType {
  yoloEnabled: boolean;
  flashActive: boolean;
  reloadKey: number;
  setYoloEnabled: (val: boolean) => void;
  setFlashActive: (val: boolean) => void;
  triggerReload: () => void;
}

const SettingsContext = createContext<SettingsContextType>({
  yoloEnabled: true,
  flashActive: false,
  reloadKey: 0,
  setFlashActive: () => {},
  setYoloEnabled: () => {},
  triggerReload: () => {},
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [yoloEnabled, setYoloEnabled] = useState(true); // Activado por defecto
  const [flashActive, setFlashActive] = useState(false); // Desactivado por defecto
  const [reloadKey, setReloadKey] = useState(0);

  const triggerReload = useCallback(() => {
    setReloadKey(prev => prev + 1);
  }, []);

  return (
    <SettingsContext.Provider value={{ yoloEnabled, setYoloEnabled, flashActive, setFlashActive, reloadKey, triggerReload }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
