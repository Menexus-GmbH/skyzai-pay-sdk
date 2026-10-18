import React, { useState } from 'react';

import { SettingsContext } from './useSettings';

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({ apiKey: '', terminal: null, businessInfo: null, selectedChains: [], isConfigured: false });
  // Merchant credentials remain in memory for this trusted local demo session.
  const saveSettings = (apiKey, selectedChains, isConfigured, terminal, businessInfo) => {
    setSettings({ apiKey, selectedChains, isConfigured, terminal, businessInfo });
  };
  const clearSettings = () => setSettings({ apiKey: '', terminal: null, businessInfo: null, selectedChains: [], isConfigured: false });
  return <SettingsContext.Provider value={{ ...settings, saveSettings, clearSettings }}>{children}</SettingsContext.Provider>;
};
