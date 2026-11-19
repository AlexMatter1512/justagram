import type { CSSRules, Settings } from '../../types';

(function() {
  const data = window.__JUSTAGRAM_DATA__;
  if (!data) return;

  const cssRules = data.cssRules;

  function applyStyles(settings: Settings): void {
    const styleId = 'justagram-dynamic-styles';
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
      existingStyle.remove();
    }

    let css = '';
    for (const key of Object.keys(cssRules) as Array<keyof CSSRules>) {
      if (settings[key]) {
        css += cssRules[key] + ' ';
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
  applyStyles(data.settings);

  // Listen for changes
  window.addEventListener('justagram-settings-changed', (event: any) => {
    const settings = event.detail as Settings;
    applyStyles(settings);
  });
  
  console.log('[JustAgram] CSS Settings manager active');
})();
