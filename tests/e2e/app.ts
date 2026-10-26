import { _electron as electron, type ElectronApplication } from '@playwright/test';

/** Launches the built app with an isolated user data directory. */
export async function launchApp(
  userDataDir: string,
  args: string[] = [],
): Promise<ElectronApplication> {
  return electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`, ...args],
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
  });
}
