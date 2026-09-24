import { describe, expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';

// Run the real entry point with just its DOM and service boundaries replaced.
const source = new Bun.Transpiler({ loader: 'ts' }).transformSync(
  (await Bun.file(new URL('../src/app/main.ts', import.meta.url)).text()).replace(/^import .*;\n/gm, '')
);

describe('automatic startup', () => {
  for (const savedId of [undefined, 'work-profile']) {
    test(savedId ? 'opens the last used profile without a picker' : 'creates Default on first launch and opens it', async () => {
      const elements = new Map<string, any>();
      const opened: string[] = [];
      const order: string[] = [];
      const ready: Array<() => void> = [];
      runInNewContext(source, {
        cordova: {},
        document: {
          addEventListener: (_name: string, callback: () => void) => ready.push(callback),
          getElementById: (id: string) => {
            if (!elements.has(id)) elements.set(id, { addEventListener() {}, textContent: '', hidden: false });
            return elements.get(id);
          },
        },
        window: new EventTarget(),
        ThemeService: { async init() {} },
        ProfileService: {
          ensureDefaultProfile() { order.push('initialize'); },
          getActiveProfileId() { return savedId || 'default'; },
          getProfiles() { return [{ id: 'default', name: 'Default' }]; },
        },
        AssetService: { async loadAssets() { return {}; } },
        BrowserService: { async open(_data: unknown, id: string) { order.push('open'); opened.push(id); } },
      });
      ready[0]!();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(opened).toEqual([savedId || 'default']);
      expect(order).toEqual(['initialize', 'open']);
      expect(elements.has('profile-picker')).toBe(false);
      expect(elements.get('launch-btn').hidden).toBe(true);
    });
  }
});
