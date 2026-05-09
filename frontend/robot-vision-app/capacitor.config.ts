import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'robot-vision-app',
  webDir: 'dist',
  server: {
    // ⚡ Usar HTTP en vez de HTTPS para evitar "Mixed Content" en Android.
    // Capacitor por defecto carga desde https://localhost, lo que bloquea
    // peticiones HTTP al backend/ESP32 en la red local.
    androidScheme: 'http',
    // Permitir tráfico HTTP sin cifrar
    cleartext: true,
    // Permitir navegación/carga de recursos desde las IPs del backend y ESP32
    allowNavigation: [
      'http://192.168.*',
      'http://10.*',
      'http://172.16.*',
    ]
  },
  android: {
    // Permitir contenido mixto como respaldo adicional
    allowMixedContent: true
  }
};

export default config;
