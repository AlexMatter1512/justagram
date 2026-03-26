/**
 * Shared type definitions used across app and injected contexts.
 */

/**
 * User settings for content filtering.
 * Each property corresponds to a toggle in the settings menu.
 */
export type Settings = {
  hideReels: boolean;
  hideStories: boolean;
  hideExplore: boolean;
  hideFeed: boolean;
  hideSuggestedReels: boolean;
  hideThreads: boolean;
  hideNotes: boolean;
  dmOnlyMode: boolean;
};

/**
 * CSS rules mapped by filter name.
 * Keys must match the Settings type keys.
 */
export type CSSRules = Record<keyof Settings, string>;

/**
 * Data injected into Instagram's page via window.__JUSTAGRAM_DATA__.
 * Contains all resources needed by the injected script.
 */
export type JustagramData = {
  menuButtonHTML: string;
  menuHTML: string;
  cssGlobal: string;
  cssRules: CSSRules;
  settings: Settings;
  blockMap: Record<string, string[]>;
  version: string;
};

/**
 * Internal type for all assets loaded by the app.
 * Includes scripts that are injected separately and not part of the JSON payload.
 */
export type LoadedAssets = JustagramData & {
  injectedScripts: string[];
};
