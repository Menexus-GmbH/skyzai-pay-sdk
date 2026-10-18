import React, { useState } from 'react';
import { X, AlertCircle, ShieldCheck, ArrowLeft } from 'lucide-react';
import { useSettings } from '../context/useSettings';
import { initializeSkyzai } from '../services/skyzaiService';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

const SettingsModal = ({ onClose }) => {
  const { apiKey, saveSettings, clearSettings } = useSettings();
  
  const [localApiKey, setLocalApiKey] = useState(apiKey);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!localApiKey || localApiKey.trim() === '') {
      setError('Please enter an API key');
      return;
    }
    
    const { instance, businessData } = await initializeSkyzai(localApiKey, () => {});
    saveSettings(localApiKey, businessData.chains, true, instance, businessData);
    onClose();
  };

  const handleClear = () => {
    clearSettings();
    setLocalApiKey('');
    setError('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-slate-700 dark:text-slate-300" />
            </button>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Skyzai Pay Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5 text-slate-700 dark:text-slate-300" />
          </button>
        </div>

        <div className="p-6">
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <div className="h-12 w-12 rounded-xl bg-slate-900 dark:bg-slate-700 flex items-center justify-center">
                  <ShieldCheck className="text-white h-6 w-6" />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Configure Skyzai Pay</h3>
              <p className="text-slate-600 dark:text-slate-300">
                Enter your Skyzai merchant API key for this local demo session
              </p>
            </div>

            <div className="space-y-4">
              <Input
                label="Merchant API Key"
                type="password"
                placeholder="Enter your token..."
                value={localApiKey}
                onChange={(e) => setLocalApiKey(e.target.value)}
              />

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleClear}
                  className="flex-1 text-slate-900 dark:text-slate-100"
                >
                  Reset
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!localApiKey}
                  className="flex-1"
                >
                  Save API Key
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;