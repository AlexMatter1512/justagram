(function () {
  const data = window.__JUSTAGRAM_DATA__;
  if (!data) return;

  let visibilitySaved = data.settings.hideFeed === false;
  let needsReload = false;

  function updateHome() {
    const onHome = window.location.pathname === '/';
    const hidden = data!.settings.hideFeed !== false;
    document.documentElement.classList.toggle('justagram-home', onHome);

    const blocker = window.JustagramBlocker;
    if (!blocker) return;
    if (onHome && hidden) {
      for (const pattern of data!.blockMap['/'] || []) blocker.add(pattern);
    } else {
      // A failed feed request can stay cached across SPA navigation back to Home.
      if (blocker.clear()) needsReload = true;
      if (onHome && !hidden && visibilitySaved && needsReload) {
        needsReload = false;
        window.location.reload();
      }
    }
  }

  window.addEventListener('justagram-navigation', updateHome);
  window.addEventListener('justagram-settings-changed', () => {
    if (data.settings.hideFeed) visibilitySaved = false;
    updateHome();
  });
  window.addEventListener('justagram-feed-visible-saved', () => {
    visibilitySaved = data.settings.hideFeed === false;
    updateHome();
  });
  updateHome();
})();
