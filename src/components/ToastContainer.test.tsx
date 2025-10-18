/**
 * Test file for ToastContainer component
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { ToastContainer } from './ToastContainer';
import { showToast } from '../lib/toastBus';

// Mock timers for testing auto-hide behavior
jest.useFakeTimers();

describe('ToastContainer', () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  it('should render nothing when no toasts are shown', () => {
    const { container } = render(<ToastContainer />);
    expect(container.firstChild).toBeNull();
  });

  it('should display a toast when showToast is called', async () => {
    render(<ToastContainer />);
    
    act(() => {
      showToast('Test notification');
    });
    
    // Fast-forward past initial animation delay
    act(() => {
      jest.advanceTimersByTime(50);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Test notification')).toBeInTheDocument();
    });
  });

  it('should auto-hide toast after duration', async () => {
    const duration = 1600;
    render(<ToastContainer duration={duration} />);
    
    act(() => {
      showToast('Auto-hide test');
    });
    
    // Toast should be visible initially
    act(() => {
      jest.advanceTimersByTime(50);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Auto-hide test')).toBeInTheDocument();
    });
    
    // Fast-forward past duration + fade-out animation
    act(() => {
      jest.advanceTimersByTime(duration + 400);
    });
    
    await waitFor(() => {
      expect(screen.queryByText('Auto-hide test')).not.toBeInTheDocument();
    });
  });

  it('should display multiple toasts', async () => {
    render(<ToastContainer />);
    
    act(() => {
      showToast('Toast 1');
      showToast('Toast 2');
    });
    
    act(() => {
      jest.advanceTimersByTime(50);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Toast 1')).toBeInTheDocument();
      expect(screen.getByText('Toast 2')).toBeInTheDocument();
    });
  });

  it('should position toasts correctly', () => {
    const { container } = render(<ToastContainer position="bottom-left" />);
    
    act(() => {
      showToast('Position test');
      jest.advanceTimersByTime(50);
    });
    
    const toastContainer = container.querySelector('div[style*="position: fixed"]');
    expect(toastContainer).toHaveStyle({ bottom: '20px', left: '20px' });
  });
});
