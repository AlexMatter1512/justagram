import type { CSSRules, LoadedAssets } from "../../types";
import { AssetManifest } from "../generated/AssetManifest";
import { AppVersion } from "../generated/Version";

export class AssetService {
  public static async loadAssets(): Promise<LoadedAssets | null> {
    try {
      console.log("[JustAgram] Loading assets...");

      // Load HTML templates
      const htmlPromises = AssetManifest.htmlTemplates.map(async (fileName) => {
        const res = await fetch(`injected/html/${fileName}`);
        if (!res.ok) throw new Error(`Failed to load ${fileName}`);
        return { name: fileName, content: await res.text() };
      });

      // Load Injected Scripts
      const scriptPromises = AssetManifest.injectedScripts.map(async (fileName) => {
        const res = await fetch(`injected/js/${fileName}`);
        if (!res.ok) throw new Error(`Failed to load ${fileName}`);
        return await res.text();
      });

      // Load global css 
      const globalCSSPromises = AssetManifest.cssGlobal.map(async (fileName) => {
        const res = await fetch(`injected/css/${fileName}`);
        if (!res.ok) {
           console.warn(`[JustAgram] Failed to load global CSS ${fileName}`);
           return { name: fileName, content: "" };
        }
        return { name: fileName, content: await res.text() };
      });

      // Load CSS rules
      const cssPromises = AssetManifest.cssRules.map(async (fileName) => {
        const res = await fetch(`injected/css/rules/${fileName}`);
        if (!res.ok) {
           console.warn(`[JustAgram] Failed to load ${fileName}`);
           return { name: fileName, content: "" };
        }
        return { name: fileName, content: await res.text() };
      });

      const [htmlFiles, scripts, globalCSSFiles, cssFiles] = await Promise.all([
        Promise.all(htmlPromises),
        Promise.all(scriptPromises),
        Promise.all(globalCSSPromises),
        Promise.all(cssPromises),
      ]);

      // Map HTML to JustagramData properties
      const menuHTML = htmlFiles.find((f) => f.name === "menu.html")?.content || "";
      const menuButtonHTML = htmlFiles.find((f) => f.name === "menuButton.html")?.content || "";

      // Build cssRules object
      const cssRules: CSSRules = {} as CSSRules;
      cssFiles.forEach((file) => {
        const key = file.name.replace('.css', '') as keyof CSSRules;
        cssRules[key] = file.content;
      });

      const cssGlobal = globalCSSFiles.map(f => f.content).join("\n");
      
      return {
        menuButtonHTML,
        menuHTML,
        cssRules,
        cssGlobal,
        version: AppVersion,
        injectedScripts: scripts,
      };
    } catch (e) {
      console.error("[JustAgram] Failed to load assets", e);
      alert(
        "Failed to load JustAgram assets. The app may not function correctly."
      );
      return null;
    }
  }
}
