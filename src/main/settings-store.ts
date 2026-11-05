import fs from 'node:fs';
import path from 'node:path';

import { isThemeMode, type ThemeMode } from '../shared/protocol';

/** What the face remembers between launches (userData/ui-state.json). */
export interface UiSettings {
  /** Top-left corner of the orb window; absent until the user moves it. */
  orb: { x: number; y: number } | null;
  themeMode: ThemeMode;
}

const DEFAULTS: UiSettings = { orb: null, themeMode: 'auto' };

function parse(text: string): UiSettings {
  const raw = JSON.parse(text) as Partial<Record<keyof UiSettings, unknown>>;
  const orb = raw.orb as { x?: unknown; y?: unknown } | null | undefined;
  return {
    orb:
      orb && Number.isFinite(orb.x) && Number.isFinite(orb.y)
        ? { x: Number(orb.x), y: Number(orb.y) }
        : null,
    themeMode: isThemeMode(raw.themeMode) ? raw.themeMode : DEFAULTS.themeMode,
  };
}

/** A tiny JSON-backed store. A missing or broken file means defaults. */
export class SettingsStore {
  private value: UiSettings;

  constructor(private readonly file: string) {
    try {
      this.value = parse(fs.readFileSync(file, 'utf8'));
    } catch {
      this.value = { ...DEFAULTS };
    }
  }

  get(): Readonly<UiSettings> {
    return this.value;
  }

  update(patch: Partial<UiSettings>): void {
    this.value = { ...this.value, ...patch };
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      // Write-then-rename: a crash mid-write never leaves a half-written file.
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(this.value, null, 2)}\n`);
      fs.renameSync(tmp, this.file);
    } catch (error) {
      console.warn('[yuka] could not save UI settings:', error);
    }
  }
}
