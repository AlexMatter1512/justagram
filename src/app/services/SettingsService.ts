import type { Settings } from '../../types';

export class SettingsService {
  private static readonly STORAGE_KEY = 'justagram_settings';

  private static readonly DEFAULT_SETTINGS: Settings = {
    hideReels: true,
    hideStories: true,
    hideExplore: true,
    hideFeed: true,
    hideSuggestedReels: true,
    hideThreads: true,
    hideNotes: true,
    dmOnlyMode: true
  };

  public static load(): Settings {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Settings> & { hideTopSection?: boolean };
        const migrated = { ...parsed } as Partial<Settings>;
        if (typeof parsed.hideTopSection === 'boolean' && typeof parsed.dmOnlyMode !== 'boolean') {
          migrated.dmOnlyMode = parsed.hideTopSection;
        }
        return { ...this.DEFAULT_SETTINGS, ...migrated };
      }
    } catch (e) {
      console.error("[JustAgram] Failed to load settings", e);
    }
    return { ...this.DEFAULT_SETTINGS };
  }

  public static save(settings: Settings): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
      console.log("[JustAgram] Settings saved to main app storage");
    } catch (e) {
      console.error("[JustAgram] Failed to save settings", e);
    }
  }
}
