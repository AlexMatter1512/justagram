import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const transpiler = new Bun.Transpiler({ loader: "ts" });
const script = transpiler.transformSync(readFileSync(new URL("../src/injected/ts/handler_home.ts", import.meta.url), "utf8"));
const field = "xdt_api__v1__feed__timeline__connection";
const server = field + "(first:4)";
const merged = "__PolarisFeedPage__" + field + "_connection(order:\"ranked\")";
const profile = "xdt_api__v1__feed__user_timeline_graphql_connection";

function connection(type = "XDTFeedTimelineResponseConnection") {
  const pageInfo = { setValue: mock(() => {}) };
  return {
    getType: () => type,
    getLinkedRecord: (key: string) => key === "page_info" ? pageInfo : null,
    setLinkedRecords: mock(() => {}),
    pageInfo,
  };
}

function setup(available = true) {
  const records = new Map([server, merged, profile, "xdt_viewer"].map(key => [key, connection()] as const));
  const update = { getRoot: () => ({ getLinkedRecord: (key: string) => records.get(key) }) };
  const dispose = mock(() => {});
  const env = {
    getStore: () => ({ getSource: () => ({ get: () => Object.fromEntries(records) }) }),
    applyUpdate: mock(({ storeUpdater }: { storeUpdater: (store: typeof update) => void }) => {
      storeUpdater(update);
      return { dispose };
    }),
  };
  const settings = { hideFeed: true };
  let loaded: ((environment: typeof env) => void) | undefined;
  const page = Object.assign(new EventTarget(), {
    location: { pathname: "/" },
    __JUSTAGRAM_DATA__: { settings },
    require: () => available ? env : undefined,
    requireLazy: (_names: string[], cb: typeof loaded) => { loaded = cb; },
  });
  const markHome = mock(() => {});
  runInNewContext(script, { window: page, document: { documentElement: { classList: { toggle: markHome } } } });
  function toggle(hidden: boolean) {
    settings.hideFeed = hidden;
    page.dispatchEvent(new Event("justagram-settings-changed"));
  }
  return { env, records, update, dispose, page, markHome, toggle, load: () => loaded!(env) };
}

describe("Home timeline filter", () => {
  test("empties only the Home connections and disables their pagination", () => {
    const { records } = setup();
    for (const key of [server, merged]) {
      const record = records.get(key)!;
      expect(record.setLinkedRecords).toHaveBeenCalledWith([], "edges");
      expect(record.pageInfo.setValue).toHaveBeenCalledWith(false, "has_next_page");
      expect(record.pageInfo.setValue).toHaveBeenCalledWith(false, "has_previous_page");
    }
    for (const key of [profile, "xdt_viewer"]) {
      expect(records.get(key)!.setLinkedRecords).not.toHaveBeenCalled();
    }
  });

  test("keeps the data filter during rapid navigation and disposes it once on unhide", () => {
    const { env, page, dispose, toggle, markHome } = setup();
    for (const path of ["/example/", "/"]) {
      page.location.pathname = path;
      page.dispatchEvent(new Event("justagram-navigation"));
      expect(markHome).toHaveBeenLastCalledWith("justagram-home", path === "/");
    }
    expect(env.applyUpdate).toHaveBeenCalledTimes(1);
    toggle(false);
    toggle(false);
    expect(dispose).toHaveBeenCalledTimes(1);
    toggle(true);
    expect(env.applyUpdate).toHaveBeenCalledTimes(2);
  });

  test("handles late Relay initialization and connections arriving after setup", () => {
    const { env, load, records, update, toggle, markHome } = setup(false);
    expect(markHome).toHaveBeenCalledWith("justagram-home", true);
    toggle(false);
    load();
    expect(env.applyUpdate).not.toHaveBeenCalled();
    toggle(true);
    const nextPage = connection();
    const unknown = connection("OtherType");
    records.set(field + "(after:\"cursor\")", nextPage);
    records.set(field, unknown);
    env.applyUpdate.mock.calls[0]![0].storeUpdater(update);
    expect(nextPage.setLinkedRecords).toHaveBeenCalledWith([], "edges");
    expect(unknown.setLinkedRecords).not.toHaveBeenCalled();
  });
});
