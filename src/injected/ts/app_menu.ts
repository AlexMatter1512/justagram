import type { Settings } from '../../types';

(function() {
  'use strict';

  console.log('[JustAgram] Menu script loaded.');

  // Read data from global variable (injected by main app)
  const data = window.__JUSTAGRAM_DATA__;

  if (!data) {
    console.error('[JustAgram] No data found! Menu cannot be initialized.');
    return;
  }

  const menuButtonHTML = data.menuButtonHTML;
  const menuHTML = data.menuHTML;

  // Default settings (all hidden by default)
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

  // Save settings by sending message to main app
  function saveSettings(settings: Settings): void {
    try {
      if (window.webkit?.messageHandlers?.cordova_iab) {
        const message = JSON.stringify({
          type: 'saveSettings',
          payload: settings
        });
        window.webkit.messageHandlers.cordova_iab.postMessage(message);
        console.log('[JustAgram] Settings saved to main app.');
      } else {
        console.warn('[JustAgram] Cannot save settings: message handler not found.');
      }
    } catch (e) {
      console.error('[JustAgram] Failed to save settings:', e);
    }
  }

  function bindHomeLongPress(openMenu: () => void): void {
    const homeSelector = [
      '#justagram-direct-nav a[href="/"]',
      'a[href="/"]:has(svg[aria-label="Home" i])',
      // Identify Instagram's Home tab by its sibling inbox tab in other locales.
      'div:has(> div > span > div > a[href="/explore/"]):has(a[href="/direct/inbox/"]) a[href="/"]',
    ].join(', ');
    let press: PointerEvent | undefined;
    let timer = 0;
    let handled = false;

    function cancelPress(): void {
      window.clearTimeout(timer);
      press = undefined;
    }

    window.addEventListener('pointerdown', event => {
      cancelPress();
      handled = false;
      if (!event.isPrimary || event.button !== 0 || !(event.target instanceof Element)) return;
      if (!event.target.closest(homeSelector)) return;
      press = event;
      timer = window.setTimeout(() => {
        // Instagram can replace the tab element during a route transition.
        if (document.elementFromPoint(event.clientX, event.clientY)?.closest(homeSelector)) {
          handled = true;
          openMenu();
        }
      }, 500);
    }, true);

    window.addEventListener('pointermove', event => {
      if (press?.pointerId === event.pointerId &&
          Math.hypot(event.clientX - press.clientX, event.clientY - press.clientY) > 10) {
        cancelPress();
      }
    }, true);
    window.addEventListener('pointerup', cancelPress, true);
    window.addEventListener('pointercancel', cancelPress, true);
    window.addEventListener('blur', cancelPress);
    window.addEventListener('pagehide', cancelPress);

    window.addEventListener('contextmenu', event => {
      if (press || handled) event.preventDefault();
    }, true);
    // Releasing a held link can generate a click on Home or on the new overlay.
    window.addEventListener('click', event => {
      if (handled && event.detail > 0) {
        handled = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }

  // Initialize menu
  function initMenu(): void {
    console.log('[JustAgram] Initializing menu...');

    // Inject menu button
    const btnContainer = document.createElement('div');
    btnContainer.innerHTML = menuButtonHTML;
    document.body.appendChild(btnContainer.firstElementChild as Node);

    // Inject menu overlay
    const menuContainer = document.createElement('div');
    menuContainer.innerHTML = menuHTML;
    document.body.appendChild(menuContainer.firstElementChild as Node);

    // Update version
    const versionSpan = document.getElementById('jg-version');
    if (versionSpan && data?.version) {
      versionSpan.textContent = `v${data.version}`;
    }

    // Use settings provided by main app
    const settings = data?.settings;
    
    const menuBtn = document.getElementById('justagram-menu-btn')!;
    const menuOverlay = document.getElementById('justagram-menu-overlay')!;
    const closeBtn = document.getElementById('justagram-close-btn')!;

    // Helper to toggle visibility based on URL
    function updateButtonVisibility(url: string) {
      if (url.includes('/accounts/') || url.includes('/challenge/') || url.includes('/checkpoint/')) {
        menuBtn.style.display = 'flex';
      } else {
        menuBtn.style.display = 'none';
      }
    }

    // Handle clicks for navigation
    document.addEventListener('click', function(e) {
      // Find closest anchor tag
      const target = (e.target as HTMLElement).closest('a');
      if (target && target.href) {
        updateButtonVisibility(target.href);
      }
    });

    // Handle back/forward navigation
    window.addEventListener('popstate', function() {
      updateButtonVisibility(window.location.href);
    });

    // Check initial URL (in case we reload on the settings page)
    updateButtonVisibility(window.location.href);



    function openMenu(): void {
      (menuOverlay as HTMLElement).style.display = 'flex';
    }

    document.getElementById('justagram-switch-profile')?.addEventListener('click', () => {
      menuOverlay.style.display = 'none';
      window.dispatchEvent(new Event('justagram-open-profiles'));
    });

    // Open menu
    menuBtn.addEventListener('click', openMenu);
    bindHomeLongPress(openMenu);

    // Close menu
    closeBtn.addEventListener('click', function() {
      (menuOverlay as HTMLElement).style.display = 'none';
    });

    // Close on overlay click
    menuOverlay.addEventListener('click', function(e: Event) {
      if (e.target === menuOverlay) {
        (menuOverlay as HTMLElement).style.display = 'none';
      }
    });

    // Initialize toggles
    const toggleItems = document.querySelectorAll('.justagram-toggle-item');
    const currentSettings: Settings = {
      ...defaultSettings,
      ...(settings || {})
    };

    function updateToggleVisibility(state: Settings): void {
      const dmOnlyEnabled = state.dmOnlyMode;

      toggleItems.forEach((item) => {
        const key = item.getAttribute('data-key') as keyof Settings;
        if (!key) return;

        const shouldShow = !dmOnlyEnabled || key === 'hideNotes' || key === 'dmOnlyMode';
        (item as HTMLElement).style.display = shouldShow ? 'flex' : 'none';
      });
    }

    toggleItems.forEach(function(item) {
      const key = item.getAttribute('data-key') as keyof Settings;
      const slider = item.querySelector('.justagram-slider') as HTMLElement;

      // Set initial state from saved settings
      const isChecked = currentSettings[key];
      updateSliderStyle(slider, isChecked);

      // Handle clicks on the entire toggle row
      (item as HTMLElement).style.cursor = 'pointer';
      item.addEventListener('click', function(e: Event) {
        e.preventDefault();
        e.stopPropagation();

        // Toggle the state
        currentSettings[key] = !currentSettings[key];
        console.log('[JustAgram] Toggle changed:', key, '->', currentSettings[key]);

        updateSliderStyle(slider, currentSettings[key]);
        updateToggleVisibility(currentSettings);
        // Route handlers read this snapshot when navigating after a toggle.
        if (data) data.settings = { ...currentSettings };
        saveSettings(currentSettings);
        window.dispatchEvent(new CustomEvent('justagram-settings-changed', { detail: currentSettings }));
      });
    });

    updateToggleVisibility(currentSettings);

    console.log('[JustAgram] Menu initialized.');
  }

  // Update slider visual style
  function updateSliderStyle(slider: HTMLElement, isChecked: boolean): void {
    if (isChecked) {
      slider.style.backgroundColor = '#E1306C';
      slider.innerHTML = '<span style="position:absolute;height:22px;width:22px;left:2px;bottom:3px;background-color:white;transition:.3s;border-radius:50%;transform:translateX(20px);"></span>';
    } else {
      slider.style.backgroundColor = '#363636';
      slider.innerHTML = '<span style="position:absolute;height:22px;width:22px;left:2px;bottom:3px;background-color:white;transition:.3s;border-radius:50%;transform:translateX(0);"></span>';
    }
  }



  // Run init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMenu);
  } else {
    initMenu();
  }
})();
