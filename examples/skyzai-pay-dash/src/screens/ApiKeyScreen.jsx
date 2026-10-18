import React from 'react';
import { ShieldCheck, AlertCircle } from 'lucide-react';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

const ApiKeyScreen = ({ 
  apiKey, 
  setApiKey, 
  onInitialize, 
  isInitializing, 
  errorLogs,
  onClearError 
}) => {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 font-sans text-slate-900 dark:text-slate-50 selection:bg-slate-900 selection:text-white">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="h-12 w-12 rounded-xl bg-slate-900 flex items-center justify-center">
              <ShieldCheck className="text-white h-6 w-6" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Skyzai Pay</h1>
          <p className="text-slate-500 dark:text-slate-400">Secure Payment Terminal Initialization</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">API Authorization Token</label>
            <Input
              type="password"
              placeholder="eyJh..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-slate-500">Enter your secure terminal token to begin.</p>
          </div>

          {/* Error Display */}
          {errorLogs.length > 0 && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-semibold text-red-900 dark:text-red-200">
                    Initialization Failed
                  </p>
                  {errorLogs.slice(-1).map((log) => (
                    <p key={log.id} className="text-sm text-red-700 dark:text-red-300">
                      {log.message.replace('Initialization failed: ', '')}
                    </p>
                  ))}
                </div>
              </div>
              
              {/* Common Issues */}
              <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800">
                <p className="text-xs font-semibold text-red-900 dark:text-red-200 mb-2">
                  Common Issues:
                </p>
                <ul className="text-xs text-red-700 dark:text-red-300 space-y-1 list-disc list-inside">
                  <li>Token is expired or invalid</li>
                  <li>Token was copied incorrectly</li>
                  <li>Need to generate new token from Skyzai app</li>
                </ul>
              </div>

              {/* Clear Button */}
              <button
                onClick={onClearError}
                className="text-xs text-red-600 dark:text-red-400 hover:underline mt-2"
              >
                Clear and try again
              </button>
            </div>
          )}

          <Button
            className="w-full"
            onClick={onInitialize}
            disabled={!apiKey || isInitializing}
            isLoading={isInitializing}
          >
            Initialize Terminal
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyScreen;