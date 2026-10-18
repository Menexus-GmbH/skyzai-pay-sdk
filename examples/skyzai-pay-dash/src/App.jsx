import React, { useState } from 'react';
import { CartProvider } from './context/CartContext';
import { SettingsProvider } from './context/SettingsContext';
import ShopScreen from './screens/ShopScreen';
import CheckoutScreen from './screens/CheckoutScreen';
import SettingsModal from './components/SettingsModal';

function App() {
  const [currentScreen, setCurrentScreen] = useState('shop'); // 'shop' or 'checkout'
  const [showSettings, setShowSettings] = useState(false);

  return (
    <SettingsProvider>
      <CartProvider>
        {currentScreen === 'shop' && (
          <ShopScreen
            onOpenSettings={() => setShowSettings(true)}
            onCheckout={() => setCurrentScreen('checkout')}
          />
        )}

        {currentScreen === 'checkout' && (
          <CheckoutScreen
            onBack={() => setCurrentScreen('shop')}
          />
        )}

        {showSettings && (
          <SettingsModal
            onClose={() => setShowSettings(false)}
          />
        )}
      </CartProvider>
    </SettingsProvider>
  );
}

export default App;