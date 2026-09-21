import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

function isActive() {
  return Platform.OS === 'web' && typeof document !== 'undefined'
    ? document.visibilityState === 'visible' && document.hasFocus()
    : AppState.currentState === 'active';
}

export function useAppActive() {
  const [active, setActive] = useState(isActive);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const update = () => setActive(isActive());
      window.addEventListener('focus', update);
      window.addEventListener('blur', update);
      document.addEventListener('visibilitychange', update);
      return () => {
        window.removeEventListener('focus', update);
        window.removeEventListener('blur', update);
        document.removeEventListener('visibilitychange', update);
      };
    }
    const subscription = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  return active;
}
