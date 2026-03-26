import type { JustagramData, LoadedAssets } from "../../types";
import { AssetService } from "./AssetService";
import { SettingsService } from "./SettingsService";
import { ThemeService } from "./ThemeService";

export class BrowserService {
  private static browser: InAppBrowser | null = null;
  private static watchdogTimer: any = null;
  private static readonly WATCHDOG_TIMEOUT = 10000; // 10 seconds

  private static readonly INSTAGRAM_URL = "https://www.instagram.com/direct";
  private static readonly BROWSER_OPTIONS =
    // "location=no,zoom=no,toolbar=no,footer=no,hardwareback=yes,fullscreen=no";
    "location=no,zoom=no,toolbar=no,footer=no,hardwareback=yes,disallowoverscroll=yes";

  public static async open(data: LoadedAssets | null): Promise<void> {
    if (!cordova?.InAppBrowser) {
      console.warn(
        "[JustAgram] InAppBrowser not available. Opening in new tab."
      );
      window.open(this.INSTAGRAM_URL, "_blank");
      return;
    }

    this.browser = cordova.InAppBrowser.open(
      this.INSTAGRAM_URL,
      "_blank",
      this.BROWSER_OPTIONS
    );

    this.setupEventListeners(data);
    this.startWatchdog();
  }

  public static close(): void {
    if (this.browser) {
      this.browser.close();
      this.browser = null;
    }
    this.stopWatchdog();
  }

  private static setupEventListeners(data: LoadedAssets | null): void {
    if (!this.browser) return;

    // Message listener
    this.browser.addEventListener("message", (event: any) => {
      try {
        const message = event.data;
        if (message) {
          if (message.type === "saveSettings" && message.payload) {
            SettingsService.save(message.payload);
          } else if (
            message.type === "updateBackgroundColor" &&
            message.payload
          ) {
            ThemeService.updateBackgroundColor(message.payload);
          } else if (message.type === "ping") {
            this.resetWatchdog();
          }
        }
      } catch (e) {
        console.error("Error handling message", e);
      }
    });

    // Load stop listener (Injection logic)
    const onFirstLoad = (event: any) => {
      this.browser?.removeEventListener("loadstop", onFirstLoad);
      const url = event.url;
      console.log("[JustAgram] Page loaded (loadstop):", url);

      if (data) {
        this.injectCSS(data.cssGlobal);
        this.injectData(data);

        // Inject scripts after data to ensure they can access it immediately
        data.injectedScripts.forEach((script) => {
          this.injectScript(script);
        });
      }
    };
    this.browser.addEventListener("loadstop", onFirstLoad);

    // Load error listener
    this.browser.addEventListener("loaderror", (event: any) => {
      console.error("Failed to load Instagram:", event);
    });

    // Exit listener
    this.browser.addEventListener("exit", () => {
      console.log("Browser closed");
      this.stopWatchdog();
      navigator.app?.exitApp();
    });
  }

  private static injectData(data: JustagramData): void {
    if (!this.browser) return;

    const dataScript = `window.__JUSTAGRAM_DATA__ = ${JSON.stringify(data)};`;
    this.browser.insertScript({ code: dataScript }, () => {
      console.log("[JustAgram] Data injected successfully");
    });
  }

  // using browser.insertCSS
  private static injectCSS(css: string): void {
    if (!this.browser) return;
    this.browser.insertCSS({ code: css }, () => {
      console.log("[JustAgram] CSS injected successfully");
    });
  }

  private static injectScript(script: string): void {
    if (!this.browser) return;

    this.browser.insertScript({ code: script }, () => {
      console.log("[JustAgram] Script injected successfully");
    });
  }

  private static startWatchdog(): void {
    this.stopWatchdog();
    this.watchdogTimer = setTimeout(() => {
      console.warn("[JustAgram] Watchdog timeout! Restarting browser...");
      this.restart();
    }, this.WATCHDOG_TIMEOUT);
  }

  private static resetWatchdog(): void {
    // console.log("[JustAgram] Ping received. Resetting watchdog.");
    this.startWatchdog();
  }

  private static stopWatchdog(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private static restart(): void {
    this.close();
    // Re-open with freshly loaded assets (or cached ones)
    AssetService.loadAssets().then((data) => {
      this.open(data);
    });

    // reload data and scripts
    // AssetService.loadAssets().then((data) => {
    //   if (data) {
    //     this.injectData(data);
    //     data.injectedScripts.forEach((script: string) => {
    //       this.injectScript(script);
    //     });
    //   }
    // });
  }
}
