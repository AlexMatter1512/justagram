type FeedRecord = {
  getLinkedRecord(field: string): FeedRecord | null | undefined;
  getType(): string;
  setLinkedRecords(records: FeedRecord[], field: string): void;
  setValue(value: boolean, field: string): void;
};

type RelayEnvironment = {
  getStore(): { getSource(): { get(id: string): object | undefined } };
  applyUpdate(update: { storeUpdater(store: { getRoot(): FeedRecord }): void }): { dispose(): void };
};

(function () {
  const data = window.__JUSTAGRAM_DATA__;
  if (!data) return;

  // Relay stores both the server connection and the merged connection read by Home.
  // Each key can include arguments. Profile timelines and Stories have separate keys.
  const timeline = 'xdt_api__v1__feed__timeline__connection';
  const homeFields = new Set([timeline, '__PolarisFeedPage__' + timeline + '_connection']);
  const instagram = window as Window & {
    require?: (name: string) => RelayEnvironment | undefined;
    requireLazy?: (names: string[], loaded: (env: RelayEnvironment) => void) => void;
  };
  let environment: RelayEnvironment | undefined;
  let filter: { dispose(): void } | undefined;

  function updateHome() {
    document.documentElement.classList.toggle('justagram-home', window.location.pathname === '/');
    if (data!.settings.hideFeed === false) {
      filter?.dispose();
      filter = undefined;
      return;
    }
    if (filter) return;
    try {
      environment ??= instagram.require?.('PolarisRelayEnvironment');
      const env = environment;
      if (!env?.applyUpdate || !env.getStore) return;
      // An optimistic update is reapplied as responses arrive. Disposing it reveals
      // the current server data, including responses received while Home was hidden.
      filter = env.applyUpdate({
        storeUpdater(store) {
          const fields = env.getStore().getSource().get('client:root');
          if (!fields) return;
          const root = store.getRoot();
          for (const key of Object.keys(fields)) {
            if (!homeFields.has(key.split('(', 1)[0]!)) continue;
            const connection = root.getLinkedRecord(key);
            if (connection?.getType() !== 'XDTFeedTimelineResponseConnection') continue;
            connection.setLinkedRecords([], 'edges');
            const pageInfo = connection.getLinkedRecord('page_info');
            pageInfo?.setValue(false, 'has_next_page');
            pageInfo?.setValue(false, 'has_previous_page');
          }
        },
      });
    } catch {
      // The route-scoped stylesheet also covers pages without Instagram's Relay module.
    }
  }

  window.addEventListener('justagram-navigation', updateHome);
  window.addEventListener('justagram-settings-changed', updateHome);
  updateHome();
  if (!environment) {
    instagram.requireLazy?.(['PolarisRelayEnvironment'], env => {
      environment = env;
      updateHome();
    });
  }
})();
