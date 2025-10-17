/**
 * toastBus.ts - Simple pub/sub event bus for toast notifications
 * 
 * Provides a global, dependency-free toast notification system:
 * - showToast(message): display a toast notification
 * - subscribeToast(listener): subscribe to toast events
 * - Returns unsubscribe function for cleanup
 */

type ToastListener = (message: string) => void;

// Simple event bus for toast messages
const listeners: Set<ToastListener> = new Set();

/**
 * Subscribe to toast notifications
 * @param listener - Function to call when a toast is shown
 * @returns Unsubscribe function
 */
export function subscribeToast(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Show a toast notification
 * @param message - Message to display
 */
export function showToast(message: string): void {
  listeners.forEach(listener => {
    try {
      listener(message);
    } catch (err) {
      console.error('Toast listener error:', err);
    }
  });
}
