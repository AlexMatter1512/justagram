(function() {
  window.JustagramDOMHandlers = window.JustagramDOMHandlers || {};

  const DIRECT_NEW_SETTINGS_SVG = `<svg aria-label="Opzioni" class="x1lliihq x1n2onr6 x5n08af" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24"><title>Opzioni</title><circle cx="12" cy="12" fill="none" r="8.635" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></circle><path d="M14.232 3.656a1.269 1.269 0 0 1-.796-.66L12.93 2h-1.86l-.505.996a1.269 1.269 0 0 1-.796.66m-.001 16.688a1.269 1.269 0 0 1 .796.66l.505.996h1.862l.505-.996a1.269 1.269 0 0 1 .796-.66M3.656 9.768a1.269 1.269 0 0 1-.66.796L2 11.07v1.862l.996.505a1.269 1.269 0 0 1 .66.796m16.688-.001a1.269 1.269 0 0 1 .66-.796L22 12.93v-1.86l-.996-.505a1.269 1.269 0 0 1-.66-.796M7.678 4.522a1.269 1.269 0 0 1-1.03.096l-1.06-.348L4.27 5.587l.348 1.062a1.269 1.269 0 0 1-.096 1.03m11.8 11.799a1.269 1.269 0 0 1 1.03-.096l1.06.348 1.318-1.317-.348-1.062a1.269 1.269 0 0 1 .096-1.03m-14.956.001a1.269 1.269 0 0 1 .096 1.03l-.348 1.06 1.317 1.318 1.062-.348a1.269 1.269 0 0 1 1.03.096m11.799-11.8a1.269 1.269 0 0 1-.096-1.03l.348-1.06-1.317-1.318-1.062.348a1.269 1.269 0 0 1-1.03-.096" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2"></path></svg>`;

  let observer: MutationObserver | null = null;

  function isDirectNewLink(anchor: HTMLAnchorElement): boolean {
    const href = anchor.getAttribute('href') || '';
    if (href === '/direct/new' || href === '/direct/new/') {
      return true;
    }

    try {
      const path = new URL(anchor.href, window.location.origin).pathname;
      return path === '/direct/new' || path === '/direct/new/';
    } catch {
      return false;
    }
  }

  function openSettingsOverlay(): void {
    const overlay = document.getElementById('justagram-menu-overlay');
    if (overlay) {
      (overlay as HTMLElement).style.display = 'flex';
      return;
    }

    const menuBtn = document.getElementById('justagram-menu-btn');
    if (menuBtn) {
      (menuBtn as HTMLElement).click();
    }
  }

  function wireDirectNewButton(): void {
    const anchors = document.querySelectorAll('a[href]');

    anchors.forEach((node) => {
      const anchor = node as HTMLAnchorElement;
      if (!isDirectNewLink(anchor)) return;
      if (anchor.dataset.justagramDirectSettingsBound === '1') return;

      anchor.dataset.justagramDirectSettingsBound = '1';

      const icon = anchor.querySelector('svg');
      if (icon) {
        icon.outerHTML = DIRECT_NEW_SETTINGS_SVG;
      }

      // Capture phase ensures we override default navigation behavior.
      anchor.addEventListener('click', (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        openSettingsOverlay();
      }, true);
    });
  }

  function ensureObserver(): void {
    if (observer) return;

    observer = new MutationObserver(() => {
      wireDirectNewButton();
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function handleDirect(): void {
    wireDirectNewButton();
    ensureObserver();
    console.log('[JustAgram] Applied handler for Direct page');
  }

  // Register direct routes used by Instagram's web app.
  window.JustagramDOMHandlers['/direct'] = handleDirect;
  window.JustagramDOMHandlers['/direct/'] = handleDirect;
  window.JustagramDOMHandlers['/direct/inbox'] = handleDirect;
  window.JustagramDOMHandlers['/direct/inbox/'] = handleDirect;

  console.log('[JustAgram] Registered handler for /direct');
})();
