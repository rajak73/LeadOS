'use client';

import * as RadixToast from '@radix-ui/react-toast';
import { useState, useCallback, type ReactNode } from 'react';

interface ToastMessage {
  id: string;
  message: string;
  variant: 'success' | 'error';
}

interface ToastContextValue {
  toast: (message: string, variant?: 'success' | 'error') => void;
}

import { createContext, useContext } from 'react';

const ToastCtx = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const toast = useCallback((message: string, variant: 'success' | 'error' = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setMessages((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => setMessages((prev) => prev.filter((m) => m.id !== id)), 4000);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      <RadixToast.Provider swipeDirection="right">
        {children}
        {messages.map((m) => (
          <RadixToast.Root
            key={m.id}
            className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-xl ${
              m.variant === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
            }`}
            open
            onOpenChange={() => setMessages((prev) => prev.filter((x) => x.id !== m.id))}
          >
            <RadixToast.Description>{m.message}</RadixToast.Description>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport />
      </RadixToast.Provider>
    </ToastCtx.Provider>
  );
}
