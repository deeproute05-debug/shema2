import { useEffect, useState } from 'react';

interface UpdateInfo {
  hasUpdate: boolean;
  applyUpdate: () => void;
}

export function useServiceWorkerUpdate(): UpdateInfo {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (import.meta.env.DEV) return; // skip in dev to avoid caching confusion

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              setWaitingWorker(installing);
              setHasUpdate(true);
            }
          });
        });

        if (reg.waiting && navigator.serviceWorker.controller) {
          setWaitingWorker(reg.waiting);
          setHasUpdate(true);
        }
      } catch (err) {
        console.error('service worker registration failed', err);
      }
    };

    void register();

    const onControllerChange = () => window.location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  const applyUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage('SKIP_WAITING');
      setHasUpdate(false);
    }
  };

  return { hasUpdate, applyUpdate };
}
