// src/context/SettingsContext.tsx
import React, { createContext, useContext, useState } from 'react';

interface SettingsContextType {
  yoloEnabled: boolean;
  flashActive: boolean;
  setYoloEnabled: (val: boolean) => void;
  setFlashActive: (val: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType>({
  yoloEnabled: true,
  flashActive: false,
  setFlashActive: () => {},
  setYoloEnabled: () => {},
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [yoloEnabled, setYoloEnabled] = useState(true); // Activado por defecto
  const [flashActive, setFlashActive] = useState(false); // Activado por defecto

  return (
    <SettingsContext.Provider value ={{ yoloEnabled, setYoloEnabled, flashActive, setFlashActive }  }>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
