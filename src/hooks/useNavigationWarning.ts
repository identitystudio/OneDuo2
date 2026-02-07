import { useEffect, useCallback } from 'react';

export function useNavigationWarning(isBlocking: boolean, message?: string) {
  const handleBeforeUnload = useCallback((e: BeforeUnloadEvent) => {
    if (!isBlocking) return;
    
    const warningMessage = message || 'You have unsaved changes. Are you sure you want to leave?';
    e.preventDefault();
    e.returnValue = warningMessage;
    return warningMessage;
  }, [isBlocking, message]);

  useEffect(() => {
    if (isBlocking) {
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, [isBlocking, handleBeforeUnload]);
}
