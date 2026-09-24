export type Profile = {
  id: string;
  name: string;
  updatedAt: number;
};

// Only profile metadata belongs in app storage. Cookies and other website data
// stay in the native browser's persistent, isolated store for each profile ID.
export class ProfileService {
  private static readonly PROFILES_KEY = "justagram_profiles_v1";
  private static readonly ACTIVE_PROFILE_KEY = "justagram_active_profile_v1";
  private static readonly PROFILE_ID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  public static getProfiles(): Profile[] {
    let parsed: unknown = [];
    try {
      parsed = JSON.parse(localStorage.getItem(this.PROFILES_KEY) || "[]");
    } catch {
      // Recover a malformed list without preventing access to the default login.
    }
    const profiles: Profile[] = [];
    if (Array.isArray(parsed)) {
      for (const value of parsed) {
        if (
          !value ||
          typeof value !== "object" ||
          typeof value.id !== "string" ||
          (value.id !== "default" && !this.PROFILE_ID.test(value.id)) ||
          typeof value.name !== "string" ||
          !value.name.trim() ||
          profiles.some((profile) => profile.id === value.id)
        )
          continue;
        profiles.push({
          id: value.id,
          name: value.name.trim().slice(0, 40),
          updatedAt:
            typeof value.updatedAt === "number" &&
            Number.isFinite(value.updatedAt)
              ? value.updatedAt
              : Date.now(),
        });
      }
    }
    if (!profiles.some((profile) => profile.id === "default")) {
      profiles.unshift({
        id: "default",
        name: "Default",
        updatedAt: Date.now(),
      });
    }
    return profiles;
  }

  public static ensureDefaultProfile(): void {
    // Normalizing also removes the unused legacy cookies field.
    localStorage.setItem(this.PROFILES_KEY, JSON.stringify(this.getProfiles()));
    localStorage.setItem(this.ACTIVE_PROFILE_KEY, this.getActiveProfileId());
  }

  public static getActiveProfileId(): string {
    const id = localStorage.getItem(this.ACTIVE_PROFILE_KEY);
    return this.getProfiles().some((profile) => profile.id === id)
      ? id!
      : "default";
  }

  public static setActiveProfile(id: string): void {
    if (!this.getProfiles().some((profile) => profile.id === id)) {
      throw new Error("Choose an existing profile.");
    }
    localStorage.setItem(this.ACTIVE_PROFILE_KEY, id);
  }

  public static createProfile(name: string): Profile {
    const profiles = this.getProfiles();
    const trimmed = this.validateName(name, profiles);
    const profile = {
      id: crypto.randomUUID(),
      name: trimmed,
      updatedAt: Date.now(),
    };
    localStorage.setItem(
      this.PROFILES_KEY,
      JSON.stringify([...profiles, profile]),
    );
    return profile;
  }

  public static renameProfile(id: string, name: string): Profile {
    const profiles = this.getProfiles();
    const profile = profiles.find((profile) => profile.id === id);
    if (!profile) throw new Error("Choose an existing profile.");
    const trimmed = this.validateName(name, profiles, id);
    const renamed = { ...profile, name: trimmed, updatedAt: Date.now() };
    localStorage.setItem(
      this.PROFILES_KEY,
      JSON.stringify(profiles.map((item) => (item.id === id ? renamed : item))),
    );
    return renamed;
  }

  public static async removeProfile(id: string): Promise<void> {
    if (id === "default") {
      throw new Error(
        "The original profile can be renamed but cannot be removed.",
      );
    }
    if (!this.getProfiles().some((profile) => profile.id === id)) {
      throw new Error("Choose an existing profile.");
    }
    // Keep the entry and selection if native session deletion fails.
    await this.nativeAction("removeProfile", id);
    localStorage.setItem(
      this.PROFILES_KEY,
      JSON.stringify(this.getProfiles().filter((profile) => profile.id !== id)),
    );
    if (localStorage.getItem(this.ACTIVE_PROFILE_KEY) === id) {
      localStorage.setItem(this.ACTIVE_PROFILE_KEY, "default");
    }
  }

  private static validateName(
    name: string,
    profiles: Profile[],
    exceptId?: string,
  ): string {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 40) {
      throw new Error("Enter a profile name between 1 and 40 characters.");
    }
    if (
      profiles.some(
        (profile) =>
          profile.id !== exceptId &&
          profile.name.toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      throw new Error("A profile with that name already exists.");
    }
    return trimmed;
  }

  public static async checkSupport(id: string): Promise<void> {
    await this.nativeAction("checkProfile", id);
  }

  private static async nativeAction(
    action: "checkProfile" | "removeProfile",
    id: string,
  ): Promise<void> {
    if (id !== "default" && !this.PROFILE_ID.test(id)) {
      throw new Error("Invalid profile identifier.");
    }
    if (
      typeof cordova === "undefined" ||
      !cordova.InAppBrowser ||
      !cordova.exec
    ) {
      throw new Error(
        "Open JustAgram on Android or iOS to use Instagram profiles.",
      );
    }
    await new Promise<void>((resolve, reject) => {
      cordova.exec(
        resolve,
        (error: unknown) => {
          reject(
            new Error(
              typeof error === "string" && error
                ? error
                : "Profile support is unavailable. Rebuild and sync the native app.",
            ),
          );
        },
        "InAppBrowser",
        action,
        [id],
      );
    });
  }
}
