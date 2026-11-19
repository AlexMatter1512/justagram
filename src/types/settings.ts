export const defaultSettings = {
  hideReels: true,
  hideStories: true,
  hideExplore: true,
  hideFeed: true,
  hideSuggestedReels: true,
  hideThreads: true,
  hideNotes: true,
  dmOnlyMode: true,
  commitmentMode: false,
};

export type Settings = typeof defaultSettings;

export function isSettingKey(key: unknown): key is keyof Settings {
  return typeof key === 'string' && Object.hasOwn(defaultSettings, key);
}

export function isLocked(settings: Settings, key: keyof Settings): boolean {
  return settings.commitmentMode && key !== 'dmOnlyMode' && settings[key];
}

export function requiresConfirmation(settings: Settings, key: keyof Settings): boolean {
  return !settings[key] && (key === 'commitmentMode' || (settings.commitmentMode && key !== 'dmOnlyMode'));
}
