import { isLocked, isSettingKey, requiresConfirmation, type Settings } from '../../types/settings';

(function() {
  'use strict';

  console.log('[JustAgram] Menu script loaded.');

  // Read data from global variable (injected by main app)
  const data = window.__JUSTAGRAM_DATA__;

  if (!data) {
    console.error('[JustAgram] No data found! Menu cannot be initialized.');
    return;
  }

  const pageData = data;

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
    btnContainer.innerHTML = pageData.menuButtonHTML;
    document.body.appendChild(btnContainer.firstElementChild as Node);

    // Inject menu overlay
    const menuContainer = document.createElement('div');
    menuContainer.innerHTML = pageData.menuHTML;
    document.body.appendChild(menuContainer.firstElementChild as Node);

    // Update version
    const versionSpan = document.getElementById('jg-version');
    if (versionSpan) {
      versionSpan.textContent = `v${pageData.version}`;
    }

    const menuBtn = document.getElementById('justagram-menu-btn')!;
    const menuOverlay = document.getElementById('justagram-menu-overlay')!;
    const closeBtn = document.getElementById('justagram-close-btn')!;

    // Helper to toggle visibility based on URL
    function updateButtonVisibility() {
      const path = window.location.pathname;
      if (path === '/' || path.includes('/accounts/') || path.includes('/challenge/') || path.includes('/checkpoint/')) {
        menuBtn.style.display = 'flex';
      } else {
        menuBtn.style.display = 'none';
      }
    }

    window.addEventListener('justagram-navigation', updateButtonVisibility);
    updateButtonVisibility();

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

    const rows = menuOverlay.querySelectorAll<HTMLLabelElement>('.justagram-toggle-item');
    const warning = document.querySelector<HTMLDialogElement>('#jg-commit-warning')!;
    const error = document.getElementById('jg-settings-error')!;
    let warningKey: keyof Settings | undefined;
    let pending: { id: string; openInbox: boolean; timer: number } | undefined;

    function renderSettings(): void {
      const settings = pageData.settings;
      rows.forEach(row => {
        const key = row.dataset.key;
        if (!isSettingKey(key)) return;
        const input = row.querySelector('input')!;
        const locked = isLocked(settings, key);
        row.hidden = settings.dmOnlyMode && key !== 'dmOnlyMode' && key !== 'hideNotes' && key !== 'commitmentMode';
        row.toggleAttribute('data-locked', locked);
        input.checked = settings[key];
        input.disabled = locked || !!pending;
      });
    }

    function finishSave(message = ''): void {
      window.clearTimeout(pending?.timer);
      pending = undefined;
      error.textContent = message;
      renderSettings();
    }

    function save(key: keyof Settings, confirmed: boolean): void {
      const bridge = window.webkit?.messageHandlers?.cordova_iab;
      if (!bridge) {
        finishSave('Couldn’t reach JustAgram. Reopen the app and try again.');
        return;
      }
      const id = crypto.randomUUID();
      pending = {
        id,
        openInbox: key === 'dmOnlyMode' && !pageData.settings.dmOnlyMode && window.location.pathname === '/',
        timer: window.setTimeout(() => finishSave('Save timed out. Please try again.'), 10000),
      };
      error.textContent = '';
      renderSettings();
      try {
        bridge.postMessage(JSON.stringify({ type: 'saveSettings', requestId: id, key, enabled: !pageData.settings[key], confirmed }));
      } catch {
        finishSave('Couldn’t save this setting. Please try again.');
      }
    }

    window.addEventListener('justagram-settings-result', event => {
      const result = (event as CustomEvent).detail;
      if (!pending || result.requestId !== pending.id) return;
      const { openInbox } = pending;
      if (!result.settings) {
        finishSave(result.error);
        return;
      }
      pageData.settings = result.settings;
      finishSave();
      window.dispatchEvent(new CustomEvent('justagram-settings-changed', { detail: pageData.settings }));
      if (openInbox && pageData.settings.dmOnlyMode && window.location.pathname === '/') {
        window.location.replace('/direct/inbox/');
      }
    });

    warning.addEventListener('close', () => {
      const key = warningKey;
      warningKey = undefined;
      if (key && warning.returnValue === 'accept') save(key, true);
    });

    rows.forEach(row => {
      const key = row.dataset.key;
      if (!isSettingKey(key)) return;
      row.querySelector('input')!.addEventListener('change', () => {
        // Reflect only persisted settings, including while the user considers the warning.
        renderSettings();
        if (pending || warningKey || isLocked(pageData.settings, key)) return;
        if (!requiresConfirmation(pageData.settings, key)) {
          save(key, false);
          return;
        }

        const name = row.querySelector('.jg-setting-name')!.textContent;
        const activation = key === 'commitmentMode';
        const reset = pageData.profileState?.activeId === 'default'
          ? 'To reset the original profile, uninstall and reinstall JustAgram.'
          : 'To reset, remove and re-add this profile or uninstall and reinstall JustAgram.';
        document.getElementById('jg-warning-title')!.textContent = activation ? 'Enable Commitment Mode?' : `Lock ${name}?`;
        let message = `The ${name} filter will stay on for this profile.`;
        if (activation) {
          const names = Array.from(rows).filter(row => {
            const key = row.dataset.key;
            return isSettingKey(key) && key !== 'dmOnlyMode' && pageData.settings[key];
          }).map(row => row.querySelector('.jg-setting-name')!.textContent);
          message = 'Commitment Mode will stay on for this profile. ';
          if (names.length) message += `These enabled filters will lock immediately: ${names.join(', ')}. `;
          message += 'Each filter you enable later will lock after confirmation. You can still switch DM Only Mode on or off.';
        }
        document.getElementById('jg-warning-message')!.textContent = `${message} ${reset}`;
        warningKey = key;
        warning.returnValue = '';
        warning.showModal();
      });
    });
    renderSettings();
  }

  // Run init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMenu);
  } else {
    initMenu();
  }
})();
