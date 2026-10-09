export const APP_CONFIG = {
  inventory: {
    quickRestockQuantity: 10,
  },
  ollama: {
    healthCheckEnabled: true,
    healthCheckIntervalMs: 5000,
    healthCheckTimeoutMs: 3000,
  },
} as const;
