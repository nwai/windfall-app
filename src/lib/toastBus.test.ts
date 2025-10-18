/**
 * Test file for the toast notification system
 * 
 * Run this file to test the toastBus functionality
 */

import { subscribeToast, showToast } from './toastBus';

describe('toastBus', () => {
  it('should notify subscribers when showToast is called', () => {
    const messages: string[] = [];
    
    // Subscribe to toast events
    const unsubscribe = subscribeToast((message) => {
      messages.push(message);
    });
    
    // Show some toasts
    showToast('Test message 1');
    showToast('Test message 2');
    
    // Verify messages were received
    expect(messages).toEqual(['Test message 1', 'Test message 2']);
    
    // Clean up
    unsubscribe();
  });
  
  it('should not notify after unsubscribe', () => {
    const messages: string[] = [];
    
    const unsubscribe = subscribeToast((message) => {
      messages.push(message);
    });
    
    showToast('Before unsubscribe');
    unsubscribe();
    showToast('After unsubscribe');
    
    // Should only have the first message
    expect(messages).toEqual(['Before unsubscribe']);
  });
  
  it('should support multiple subscribers', () => {
    const messages1: string[] = [];
    const messages2: string[] = [];
    
    const unsub1 = subscribeToast((msg) => messages1.push(msg));
    const unsub2 = subscribeToast((msg) => messages2.push(msg));
    
    showToast('Broadcast message');
    
    // Both should receive the message
    expect(messages1).toEqual(['Broadcast message']);
    expect(messages2).toEqual(['Broadcast message']);
    
    unsub1();
    unsub2();
  });
  
  it('should handle errors in listeners gracefully', () => {
    const messages: string[] = [];
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Subscribe a faulty listener
    const unsub1 = subscribeToast(() => {
      throw new Error('Listener error');
    });
    
    // Subscribe a good listener
    const unsub2 = subscribeToast((msg) => messages.push(msg));
    
    showToast('Test with error');
    
    // Good listener should still work
    expect(messages).toEqual(['Test with error']);
    
    // Error should be logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Toast listener error:',
      expect.any(Error)
    );
    
    unsub1();
    unsub2();
    consoleErrorSpy.mockRestore();
  });
});
