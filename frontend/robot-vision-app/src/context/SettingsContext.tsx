// src/context/SettingsContext.tsx
import React, { createContext, useContext, useState } from 'react';

interface SettingsContextType {
  yoloEnabled: boolean;
  setYoloEnabled: (val: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType>({
  yoloEnabled: true,
  setYoloEnabled: () => {},
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [yoloEnabled, setYoloEnabled] = useState(true); // Activado por defecto

  return (
    <SettingsContext.Provider value={{ yoloEnabled, setYoloEnabled }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
