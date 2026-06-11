export const authTokenStorageKey = "ai-report-auth-token";
export const profilePreferencesStorageKey = "ai-report-profile-preferences";

export type ProfilePreferences = {
  displayName: string;
  roleLabel: string;
  teamName: string;
  note: string;
};

export const defaultProfilePreferences: ProfilePreferences = {
  displayName: "",
  roleLabel: "연구원",
  teamName: "AI Report Workspace",
  note: ""
};

export function readProfilePreferences(): ProfilePreferences {
  if (typeof window === "undefined") return defaultProfilePreferences;

  try {
    const raw = window.localStorage.getItem(profilePreferencesStorageKey);
    if (!raw) return defaultProfilePreferences;
    const parsed = JSON.parse(raw) as Partial<ProfilePreferences>;
    return {
      ...defaultProfilePreferences,
      ...parsed
    };
  } catch {
    return defaultProfilePreferences;
  }
}

export function writeProfilePreferences(value: ProfilePreferences) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(profilePreferencesStorageKey, JSON.stringify(value));
}
