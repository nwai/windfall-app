/**
 * ToastContainer.tsx - Global toast notification UI component
 * 
 * Features:
 * - Subscribes to toast bus and displays notifications
 * - Auto-hides after ~1.6s
 * - Fade and slide animations
 * - Positioned at top-right by default (configurable)
 */

import React, { useState, useEffect } from 'react';
import { subscribeToast } from '../lib/toastBus';

interface ToastItem {
  id: number;
  message: string;
  visible: boolean;
}

interface ToastContainerProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  duration?: number; // milliseconds
}

export function ToastContainer({ 
  position = 'top-right',
  duration = 1600 
}: ToastContainerProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    // Subscribe to toast events
    const unsubscribe = subscribeToast((message: string) => {
      const id = Date.now();
      
      // Add toast with visible=false initially
      setToasts(prev => [...prev, { id, message, visible: false }]);
      
      // Make visible after a tick (for animation)
      setTimeout(() => {
        setToasts(prev => 
          prev.map(t => t.id === id ? { ...t, visible: true } : t)
        );
      }, 10);
      
      // Hide after duration
      setTimeout(() => {
        setToasts(prev => 
          prev.map(t => t.id === id ? { ...t, visible: false } : t)
        );
      }, duration);
      
      // Remove from DOM after fade-out animation
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration + 300); // 300ms for fade-out
    });

    return unsubscribe;
  }, [duration]);

  if (toasts.length === 0) {
    return null;
  }

  // Position styles
  const positionStyles: Record<string, React.CSSProperties> = {
    'top-right': { top: 20, right: 20 },
    'top-left': { top: 20, left: 20 },
    'bottom-right': { bottom: 20, right: 20 },
    'bottom-left': { bottom: 20, left: 20 },
  };

  return (
    <div
      style={{
        position: 'fixed',
        ...positionStyles[position],
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      {toasts.map(toast => (
        <div
          key={toast.id}
          style={{
            marginBottom: 10,
            padding: '12px 20px',
            backgroundColor: '#333',
            color: '#fff',
            borderRadius: 4,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            fontSize: 14,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            maxWidth: 350,
            opacity: toast.visible ? 1 : 0,
            transform: toast.visible 
              ? 'translateY(0)' 
              : 'translateY(-10px)',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
            pointerEvents: 'auto',
          }}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
