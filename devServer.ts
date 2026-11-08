// Dev server binding shared by the Vite configs. The server binds to the
// loopback interface unless MARKPAD_DEV_HOST names another address, for
// example 0.0.0.0 inside a container that maps the port to the host.
export function devServerOptions(env: NodeJS.ProcessEnv = process.env) {
  return {
    host: env.MARKPAD_DEV_HOST || '127.0.0.1',
    port: 20390,
    strictPort: true,
  };
}
