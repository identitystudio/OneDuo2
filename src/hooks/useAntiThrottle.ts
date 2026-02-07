/**
 * useAntiThrottle - Prevents browser from throttling WebAssembly workers
 * 
 * Phase 3: Silent Audio Trick - Keeps tab in "audio playing" state
 * Phase 4: Wake Lock API - Prevents device sleep during long processing
 * 
 * These invisible features dramatically improve reliability for long video processing.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

interface AntiThrottleState {
  isActive: boolean;
  hasWakeLock: boolean;
  isTabVisible: boolean;
}

export function useAntiThrottle(shouldActivate: boolean) {
  const [state, setState] = useState<AntiThrottleState>({
    isActive: false,
    hasWakeLock: false,
    isTabVisible: true,
  });

  // Silent audio refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Wake lock ref
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // ============ SILENT AUDIO TRICK ============
  // Chrome exempts "audio playing" tabs from aggressive throttling
  const startSilentAudio = useCallback(() => {
    if (audioContextRef.current) return; // Already running

    try {
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      // Silent - gain is 0
      gainNode.gain.value = 0;
      
      // Very low frequency (inaudible even if gain wasn't 0)
      oscillator.frequency.value = 1;
      oscillator.type = 'sine';

      // Connect: oscillator -> gain (silent) -> destination
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start();

      audioContextRef.current = audioContext;
      oscillatorRef.current = oscillator;
      gainNodeRef.current = gainNode;

      console.log('[AntiThrottle] Silent audio started - tab exempt from throttling');
    } catch (error) {
      console.warn('[AntiThrottle] Failed to start silent audio:', error);
    }
  }, []);

  const stopSilentAudio = useCallback(() => {
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop();
        oscillatorRef.current.disconnect();
      } catch {
        // Ignore errors during cleanup
      }
      oscillatorRef.current = null;
    }

    if (gainNodeRef.current) {
      try {
        gainNodeRef.current.disconnect();
      } catch {
        // Ignore errors during cleanup
      }
      gainNodeRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {
        // Ignore errors during cleanup
      }
      audioContextRef.current = null;
    }

    console.log('[AntiThrottle] Silent audio stopped');
  }, []);

  // ============ WAKE LOCK API ============
  // Prevents device from sleeping during long processing
  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) {
      console.log('[AntiThrottle] Wake Lock API not supported');
      return false;
    }

    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      
      wakeLockRef.current.addEventListener('release', () => {
        console.log('[AntiThrottle] Wake lock released (screen locked or tab hidden)');
        setState(prev => ({ ...prev, hasWakeLock: false }));
      });

      console.log('[AntiThrottle] Wake lock acquired - device will not sleep');
      setState(prev => ({ ...prev, hasWakeLock: true }));
      return true;
    } catch (error) {
      console.warn('[AntiThrottle] Failed to acquire wake lock:', error);
      return false;
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // Ignore errors during cleanup
      }
      wakeLockRef.current = null;
      setState(prev => ({ ...prev, hasWakeLock: false }));
      console.log('[AntiThrottle] Wake lock released');
    }
  }, []);

  // Re-acquire wake lock when tab becomes visible again
  // (Wake lock auto-releases when tab is hidden)
  const handleVisibilityChange = useCallback(async () => {
    const isVisible = document.visibilityState === 'visible';
    setState(prev => ({ ...prev, isTabVisible: isVisible }));

    if (isVisible && shouldActivate && !wakeLockRef.current) {
      // Re-acquire wake lock when tab becomes visible
      await requestWakeLock();
    }
  }, [shouldActivate, requestWakeLock]);

  // ============ MAIN EFFECT ============
  useEffect(() => {
    if (shouldActivate) {
      // Start both anti-throttle mechanisms
      startSilentAudio();
      requestWakeLock();
      setState(prev => ({ ...prev, isActive: true }));
    } else {
      // Stop both mechanisms
      stopSilentAudio();
      releaseWakeLock();
      setState(prev => ({ ...prev, isActive: false }));
    }

    // Cleanup on unmount
    return () => {
      stopSilentAudio();
      releaseWakeLock();
    };
  }, [shouldActivate, startSilentAudio, stopSilentAudio, requestWakeLock, releaseWakeLock]);

  // ============ VISIBILITY LISTENER ============
  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Set initial visibility state
    setState(prev => ({ ...prev, isTabVisible: document.visibilityState === 'visible' }));

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleVisibilityChange]);

  return {
    isActive: state.isActive,
    hasWakeLock: state.hasWakeLock,
    isTabVisible: state.isTabVisible,
  };
}
