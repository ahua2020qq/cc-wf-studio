/**
 * Claude Code Workflow Studio - Offline Config Hook
 *
 * Custom hook for accessing offline mode configuration
 * Used for displaying offline mode status and conditionally disabling cloud features
 */

import { useEffect, useState } from 'react';

/**
 * Offline configuration type
 */
export interface OfflineConfig {
  isOffline: boolean;
  disableCloudApi: boolean;
  localStoragePath: string;
}

/**
 * Hook to get offline configuration
 */
export function useOfflineConfig(): OfflineConfig {
  const [config, setConfig] = useState<OfflineConfig>(() => {
    // Get initial config from window object (injected by extension)
    const windowConfig = (window as any).offlineConfig;
    return windowConfig || {
      isOffline: true,
      disableCloudApi: true,
      localStoragePath: '~/.yougao/workflows',
    };
  });

  useEffect(() => {
    // Listen for config updates from extension (if any)
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'OFFLINE_CONFIG_UPDATE' && message.payload) {
        setConfig(message.payload);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return config;
}

/**
 * Hook to check if offline mode is enabled
 */
export function useIsOfflineMode(): boolean {
  const config = useOfflineConfig();
  return config.isOffline && config.disableCloudApi;
}