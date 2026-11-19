import { defaultSettings, isLocked, isSettingKey, requiresConfirmation, type Settings } from "../../types/settings";

export class SettingsService {
  private static readonly LEGACY_KEY = "justagram_settings";

  private static profileKey(profileId: string): string {
    return `justagram_settings_${profileId}`;
  }

  public static migrateLegacySettings(profiles: Array<{ id: string }>): void {
    const saved = localStorage.getItem(this.LEGACY_KEY);
    if (saved === null) return;
    for (const { id } of profiles) {
      const key = this.profileKey(id);
      if (localStorage.getItem(key) === null) localStorage.setItem(key, saved);
    }
    localStorage.removeItem(this.LEGACY_KEY);
  }

  public static load(profileId: string): Settings {
    const settings = { ...defaultSettings };
    const raw = localStorage.getItem(this.profileKey(profileId));
    try {
      const saved = JSON.parse(raw ?? "{}");
      if (typeof saved?.dmOnlyMode !== "boolean" && typeof saved?.hideTopSection === "boolean") {
        settings.dmOnlyMode = saved.hideTopSection;
      }
      for (const key of Object.keys(settings) as Array<keyof Settings>) {
        if (typeof saved?.[key] === "boolean") settings[key] = saved[key];
      }
    } catch (error) {
      console.error("[JustAgram] Failed to read saved filters", error);
    }
    return settings;
  }

  public static update(profileId: string, key: unknown, enabled: unknown, confirmed: boolean): Settings {
    const settings = this.load(profileId);
    if (!isSettingKey(key) || typeof enabled !== "boolean" || settings[key] === enabled) return settings;
    if (isLocked(settings, key) || (requiresConfirmation(settings, key) && !confirmed)) {
      return settings;
    }

    settings[key] = enabled;
    localStorage.setItem(this.profileKey(profileId), JSON.stringify(settings));
    return settings;
  }

  public static removeProfile(profileId: string): void {
    localStorage.removeItem(this.profileKey(profileId));
  }
}
