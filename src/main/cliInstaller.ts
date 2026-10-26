import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';
import { app } from 'electron';
import { editPathList } from './args';

const run = promisify(execFile);

/** Where the `mdv` command lives on this platform, and how it reaches the app. */
interface CommandTarget {
  /** The script file to write. */
  readonly path: string;
  /** The folder that must be on PATH for the shell to find the script. */
  readonly folder: string;
  /** True if the folder needs administrator rights to write. */
  readonly needsAdmin: boolean;
}

/** The result of installing or removing the command, for a message to the user. */
export interface CommandResult {
  readonly message: string;
  readonly detail: string;
}

/** Gets the executable that `mdv` launches: the AppImage file itself when there is one. */
function appExecutable(): string {
  return process.env['APPIMAGE'] ?? process.execPath;
}

function commandTarget(): CommandTarget {
  if (process.platform === 'win32') {
    const folder = join(
      process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local'),
      'Markpad',
      'bin',
    );
    return { path: join(folder, 'mdv.cmd'), folder, needsAdmin: false };
  }
  if (process.platform === 'darwin') {
    return { path: '/usr/local/bin/mdv', folder: '/usr/local/bin', needsAdmin: true };
  }
  const folder = join(homedir(), '.local', 'bin');
  return { path: join(folder, 'mdv'), folder, needsAdmin: false };
}

/** Quotes a value for a POSIX shell single-quoted string. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Builds the script from the template in the app's resources, pointing it at this app. */
async function scriptText(): Promise<string> {
  const name = process.platform === 'win32' ? 'mdv.cmd' : 'mdv';
  const template = await readFile(join(process.resourcesPath, 'bin', name), 'utf8');
  const exe = appExecutable();
  return process.platform === 'win32'
    ? template.replace('set "DEFAULT_APP="', `set "DEFAULT_APP=${exe}"`)
    : template.replace("DEFAULT_APP=''", `DEFAULT_APP=${shellQuote(exe)}`);
}

/** Updates the user PATH on Windows; new terminals see the change. */
async function editWindowsUserPath(folder: string, add: boolean): Promise<void> {
  const read = await run('powershell.exe', [
    '-NoProfile',
    '-Command',
    "[Environment]::GetEnvironmentVariable('Path', 'User')",
  ]);
  const next = editPathList(read.stdout.trim(), folder, add, ';', true);
  // The value travels in an environment variable, so no quoting can break the command.
  await run(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      "[Environment]::SetEnvironmentVariable('Path', $env:MARKPAD_PATH, 'User')",
    ],
    { env: { ...process.env, MARKPAD_PATH: next } },
  );
}

/** Writes a file as an administrator on macOS, through the system password prompt. */
async function writeAsAdmin(path: string, text: string): Promise<void> {
  const staged = join(app.getPath('temp'), `mdv-${process.pid}`);
  await writeFile(staged, text, { mode: 0o755 });
  const shell = `mkdir -p ${shellQuote('/usr/local/bin')} && cp ${shellQuote(staged)} ${shellQuote(path)} && chmod 755 ${shellQuote(path)}`;
  const script = `do shell script ${JSON.stringify(shell)} with administrator privileges`;
  try {
    await run('osascript', ['-e', script]);
  } finally {
    await rm(staged, { force: true });
  }
}

async function canWrite(folder: string): Promise<boolean> {
  try {
    await access(folder, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function onPath(folder: string): boolean {
  const entries = (process.env['PATH'] ?? '').split(delimiter);
  return entries.some((entry) =>
    process.platform === 'win32' ? entry.toLowerCase() === folder.toLowerCase() : entry === folder,
  );
}

/** Installs the `mdv` command for the current user. */
export async function installCommand(): Promise<CommandResult> {
  if (!app.isPackaged) {
    return {
      message: "The 'mdv' command needs an installed copy of Markpad.",
      detail: 'In development, run the resources/bin/mdv script with MARKPAD_APP set.',
    };
  }
  if (process.platform === 'linux' && process.env['APPIMAGE'] === undefined) {
    // The .deb package links /usr/bin/mdv when it installs.
    const packaged = await access('/usr/bin/mdv').then(
      () => true,
      () => false,
    );
    if (packaged) {
      return {
        message: "The 'mdv' command is already installed.",
        detail: 'The Markpad package installed it at /usr/bin/mdv.',
      };
    }
  }

  const target = commandTarget();
  const text = await scriptText();
  if (target.needsAdmin && !(await canWrite(target.folder))) {
    await writeAsAdmin(target.path, text);
  } else {
    await mkdir(target.folder, { recursive: true });
    await writeFile(target.path, text);
    await chmod(target.path, 0o755);
  }

  let detail = `Markpad installed the command at ${target.path}.`;
  if (process.platform === 'win32') {
    await editWindowsUserPath(target.folder, true);
    detail += ' Open a new terminal, and then run mdv FILE.';
  } else if (!onPath(target.folder)) {
    detail += ` Add ${target.folder} to your PATH, open a new terminal, and then run mdv FILE.`;
  } else {
    detail += ' Run mdv FILE in a terminal to open a file.';
  }
  return { message: "The 'mdv' command is installed.", detail };
}

/** Removes the `mdv` command that {@link installCommand} installed. */
export async function uninstallCommand(): Promise<CommandResult> {
  const target = commandTarget();
  const exists = await access(target.path).then(
    () => true,
    () => false,
  );
  if (!exists) {
    return {
      message: "The 'mdv' command isn't installed for your user.",
      detail:
        process.platform === 'linux'
          ? 'If the Markpad package installed /usr/bin/mdv, uninstalling the package removes it.'
          : `Markpad found nothing at ${target.path}.`,
    };
  }
  if (target.needsAdmin && !(await canWrite(target.folder))) {
    await run('osascript', [
      '-e',
      `do shell script ${JSON.stringify(`rm -f ${shellQuote(target.path)}`)} with administrator privileges`,
    ]);
  } else {
    await rm(target.path, { force: true });
  }
  if (process.platform === 'win32') await editWindowsUserPath(target.folder, false);
  return { message: "The 'mdv' command is removed.", detail: `Markpad deleted ${target.path}.` };
}
