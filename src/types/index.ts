import type { Settings } from './settings';
export type { Settings } from './settings';

/**
 * CSS rules mapped by filter name.
 * Commitment Mode controls settings and has no filter stylesheet.
 */
export type CSSRules = Record<Exclude<keyof Settings, 'commitmentMode'>, string>;

export type ProfileState = {
  profiles: Array<{ id: string; name: string }>;
  activeId: string;
  show?: boolean;
  error?: string;
};

export type ProfileResponse = ProfileState & {
  requestId: string;
  selectedId?: string;
};

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
  version: string;
  profileState?: ProfileState;
};

/**
 * Internal type for all assets loaded by the app.
 * Includes scripts that are injected separately and not part of the JSON payload.
 */
export type LoadedAssets = Omit<JustagramData, 'settings' | 'profileState'> & {
  injectedScripts: string[];
};
