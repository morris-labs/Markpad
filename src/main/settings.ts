import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Session, ThemeSetting } from '@shared/api';
import { writeFileAtomic } from './fileStore';

const MAX_RECENT = 10;

interface StoredSettings {
  session: Session;
  recent: string[];
  theme: ThemeSetting;
}

const DEFAULTS: StoredSettings = {
  session: { tabs: [], activeIndex: 0 },
  recent: [],
  theme: 'system',
};

/** Persists the session, recent files, and preferences as one JSON file. */
export class Settings {
  private data: StoredSettings = structuredClone(DEFAULTS);
  private readonly file: string;
  private writing: Promise<void> = Promise.resolve();

  constructor(folder: string) {
    this.file = join(folder, 'settings.json');
  }

  async load(): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.file, 'utf8'));
      if (typeof parsed === 'object' && parsed !== null) {
        this.data = { ...structuredClone(DEFAULTS), ...(parsed as Partial<StoredSettings>) };
      }
    } catch {
      // A missing or corrupt file falls back to the defaults.
    }
  }

  get session(): Session {
    return this.data.session;
  }

  get recent(): readonly string[] {
    return this.data.recent;
  }

  get theme(): ThemeSetting {
    return this.data.theme;
  }

  async setSession(session: Session): Promise<void> {
    this.data.session = session;
    await this.save();
  }

  async addRecent(path: string): Promise<void> {
    this.data.recent = [path, ...this.data.recent.filter((p) => p !== path)].slice(0, MAX_RECENT);
    await this.save();
  }

  async clearRecent(): Promise<void> {
    this.data.recent = [];
    await this.save();
  }

  async setTheme(theme: ThemeSetting): Promise<void> {
    this.data.theme = theme;
    await this.save();
  }

  private async save(): Promise<void> {
    const text = JSON.stringify(this.data, null, 2);
    // Serialize writes so an older snapshot never lands after a newer one.
    this.writing = this.writing.then(() => writeFileAtomic(this.file, text)).catch(() => {});
    await this.writing;
  }
}
