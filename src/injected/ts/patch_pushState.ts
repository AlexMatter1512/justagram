// Initialize handlers registry
window.JustagramDOMHandlers = window.JustagramDOMHandlers || {};

// --- Helper Functions ---

function getPathFromUrl(url?: string | URL | null): string {
  if (!url) return window.location.pathname;
  try {
    return new URL(url.toString(), window.location.origin).pathname;
  } catch {
    return window.location.pathname;
  }
}

// --- DOM Handlers ---

function handleNavigation(path: string) {
  window.dispatchEvent(new Event('justagram-navigation'));
  const handler = window.JustagramDOMHandlers[path];
  if (handler) {
    handler();
  }
}

// --- Core Routing Logic ---

function processRoute(path: string, executeNavigation?: () => void) {
  // Clear blocks from previous route
  if (window.JustagramBlocker) {
    window.JustagramBlocker.clear();
  }

  // 3. Let the SPA finish its history update (if it triggered one)
  if (executeNavigation) {
    executeNavigation();
  }

  // 4. Update the DOM
  handleNavigation(path);
}

// --- History Patches and Event Listeners ---

const originalPushState = history.pushState;
history.pushState = function(state, unused, url) {
  const targetPath = getPathFromUrl(url);
  processRoute(targetPath, () => {
    originalPushState.apply(this, [state, unused, url]);
  });
};

const originalReplaceState = history.replaceState;
history.replaceState = function(state, unused, url) {
  const targetPath = getPathFromUrl(url);
  processRoute(targetPath, () => {
    originalReplaceState.apply(this, [state, unused, url]);
  });
};

window.addEventListener("popstate", () => {
  processRoute(window.location.pathname);
});

// Initial load check
setTimeout(() => {
  processRoute(window.location.pathname);
}, 50);
