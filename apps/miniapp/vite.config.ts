import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Dev tunnels: add HTTPS host(s) here, e.g. "foo.trycloudflare.com".
  const allowedHosts = env.VITE_ALLOWED_HOSTS
    ? env.VITE_ALLOWED_HOSTS.split(',')
        .map((host) => host.trim())
        .filter(Boolean)
    : [];

  return {
    plugins: [react()],
    server: {
      allowedHosts: allowedHosts.length > 0 ? allowedHosts : undefined,
    },
  };
});
