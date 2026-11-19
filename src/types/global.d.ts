import type { JustagramData } from './index';

declare global {
  /**
   * Cordova object injected by the native wrapper at runtime.
   */
  interface Cordova {
    InAppBrowser: {
      open(url: string, target?: string, options?: string): InAppBrowser;
    };
  }

  interface InAppBrowser {
    addEventListener(eventname: string, callback: (event: any) => void): void;
    removeEventListener(eventname: string, callback: (event: any) => void): void;
    close(): void;
    show(): void;
    hide(): void;
    executeScript(details: { code?: string; file?: string }, callback?: (result: any) => void): void;
    insertScript(details: { code?: string; file?: string }, callback?: (result: any) => void): void;
    insertCSS(details: { code?: string; file?: string }, callback?: () => void): void;
  }

  /**
   * Navigator extensions added by Cordova plugins.
   */
  interface Navigator {
    app: {
      exitApp(): void;
    };
  }

  interface Window {
    /**
     * Data injected by the main app into Instagram's page.
     * Contains HTML templates and CSS rules for the settings menu.
     */
    __JUSTAGRAM_DATA__?: JustagramData;
    cordova: Cordova;
    webkit?: {
      messageHandlers?: {
        cordova_iab?: {
          postMessage(message: string): void;
        };
      };
    };
    JustagramDOMHandlers: Record<string, () => void>;
  }

  /** Apache Cordova instance */
  var cordova: Cordova;
}

export {};
