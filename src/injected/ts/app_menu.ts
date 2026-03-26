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
    hideNotes: true
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
      if (url.includes('/accounts/settings/')) {
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
        // If it's a settings link, show button. Otherwise, if it's a navigation, hide it.
        if (target.href.includes('/accounts/settings/')) {
          menuBtn.style.display = 'flex';
        } else {
          // We assume any other link is a navigation away
          menuBtn.style.display = 'none';
        }
      }
    });

    // Handle back/forward navigation
    window.addEventListener('popstate', function() {
      updateButtonVisibility(window.location.href);
    });

    // Check initial URL (in case we reload on the settings page)
    updateButtonVisibility(window.location.href);



    // Open menu
    menuBtn.addEventListener('click', function() {
      (menuOverlay as HTMLElement).style.display = 'flex';
    });

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
    toggleItems.forEach(function(item) {
      const key = item.getAttribute('data-key') as keyof Settings;
      const slider = item.querySelector('.justagram-slider') as HTMLElement;

      // Set initial state from saved settings
      const currentSettings = settings || defaultSettings;
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
        saveSettings(currentSettings);
        window.dispatchEvent(new CustomEvent('justagram-settings-changed', { detail: currentSettings }));
      });
    });

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
