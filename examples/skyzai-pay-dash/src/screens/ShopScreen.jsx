import React, { useState } from 'react';
import { ShoppingCart, Settings, Plus, Minus, Trash2 } from 'lucide-react';
import { useCart } from '../context/useCart';
import { useSettings } from '../context/useSettings';
import Button from '../components/ui/Button';
import { products } from '../data/products';

const ShopScreen = ({ onOpenSettings, onCheckout }) => {
  const { cartItems, addToCart, updateQuantity, removeFromCart, getCartTotal, getCartCount } = useCart();
  const { isConfigured } = useSettings();
  const [showCart, setShowCart] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            ☕ Cafe POS
          </h1>
          
          <div className="flex items-center gap-3">
            {/* Cart Button */}
            <button
              onClick={() => setShowCart(!showCart)}
              className="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ShoppingCart className="h-6 w-6 text-slate-700 dark:text-slate-300" />
              {getCartCount() > 0 && (
                <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-semibold">
                  {getCartCount()}
                </span>
              )}
            </button>

            {/* Settings Button */}
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Settings className="h-6 w-6 text-slate-700 dark:text-slate-300" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Products Grid */}
          <div className="lg:col-span-2">
            <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-slate-50">Products</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {products.map(product => (
                <div
                  key={product.id}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="text-5xl mb-3">{product.emoji}</div>
                  <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-50 mb-1">
                    {product.name}
                  </h3>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-4">
                    ${product.price}
                  </p>
                  <Button
                    onClick={() => addToCart(product)}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add to Cart
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Cart Sidebar */}
          <div className={`lg:block ${showCart ? 'block' : 'hidden'}`}>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 sticky top-24">
              <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-slate-50 flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Cart
              </h2>

              {cartItems.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>Your cart is empty</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3 mb-6 max-h-[400px] overflow-y-auto">
                    {cartItems.map(item => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
                      >
                        <span className="text-2xl">{item.emoji}</span>
                        <div className="flex-1">
                          <p className="font-medium text-sm text-slate-900 dark:text-slate-50">
                            {item.name}
                          </p>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            ${item.price}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-8 text-center font-semibold text-slate-900 dark:text-slate-50">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-3">
                    <div className="flex justify-between text-lg font-semibold">
                      <span className="text-slate-900 dark:text-slate-50">Total</span>
                      <span className="text-slate-900 dark:text-slate-50">
                        ${getCartTotal().toFixed(2)}
                      </span>
                    </div>

                    <Button
                      onClick={onCheckout}
                      className="w-full"
                      disabled={!isConfigured}
                    >
                      {isConfigured ? 'Checkout with Skyzai Pay' : 'Setup Skyzai Pay First'}
                    </Button>

                    {!isConfigured && (
                      <p className="text-xs text-center text-slate-500">
                        Click the settings icon to configure Skyzai Pay
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShopScreen;