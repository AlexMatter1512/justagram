import type { Settings } from '../../types';

(function() {
  const data = window.__JUSTAGRAM_DATA__;
  if (!data) return;

  const cssRules = data.cssRules;

  const defaultSettings: Settings = {
    hideReels: true,
    hideStories: true,
    hideExplore: true,
    hideFeed: true,
    hideSuggestedReels: true,
    hideThreads: true,
    hideNotes: true,
    dmOnlyMode: true
  };

  function applyStyles(settings: Settings): void {
    const styleId = 'justagram-dynamic-styles';
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
      existingStyle.remove();
    }

    let css = '';
    for (const key in settings) {
      if (settings[key as keyof Settings] && cssRules[key as keyof Settings]) {
        css += cssRules[key as keyof Settings] + ' ';
      }
    }

    if (css) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = css;
      document.head.appendChild(style);
    }
  }

  // Initial apply
  applyStyles({
    ...defaultSettings,
    ...(data.settings || {})
  });

  // Listen for changes
  window.addEventListener('justagram-settings-changed', (event: any) => {
    const settings = event.detail as Settings;
    applyStyles(settings);
  });
  
  console.log('[JustAgram] CSS Settings manager active');
})();
