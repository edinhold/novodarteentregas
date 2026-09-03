export interface DriverNotificationSettingsState {
  volume: number;
  standbyEnabled: boolean;
  standbyIntervalMs: number;
}

export const DRIVER_NOTIFICATION_SETTINGS_KEY = "driver-notification-settings";
export const DRIVER_NOTIFICATION_SETTINGS_EVENT = "driver-notification-settings-updated";

export const defaultDriverNotificationSettings: DriverNotificationSettingsState = {
  volume: 1.0,
  standbyEnabled: false,
  standbyIntervalMs: 30000,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const normalizeDriverNotificationSettings = (
  value: Partial<DriverNotificationSettingsState> | null | undefined
): DriverNotificationSettingsState => ({
  volume: clamp(Number(value?.volume ?? defaultDriverNotificationSettings.volume), 0.1, 1),
  standbyEnabled: Boolean(value?.standbyEnabled ?? defaultDriverNotificationSettings.standbyEnabled),
  standbyIntervalMs: Math.max(
    10000,
    Number(value?.standbyIntervalMs ?? defaultDriverNotificationSettings.standbyIntervalMs)
  ),
});

export const loadDriverNotificationSettings = (): DriverNotificationSettingsState => {
  if (typeof window === "undefined") return defaultDriverNotificationSettings;

  try {
    const stored = window.localStorage.getItem(DRIVER_NOTIFICATION_SETTINGS_KEY);
    if (!stored) return defaultDriverNotificationSettings;
    return normalizeDriverNotificationSettings(JSON.parse(stored));
  } catch {
    return defaultDriverNotificationSettings;
  }
};

export const saveDriverNotificationSettings = (settings: DriverNotificationSettingsState) => {
  if (typeof window === "undefined") return;

  const normalized = normalizeDriverNotificationSettings(settings);
  try {
    window.localStorage.setItem(DRIVER_NOTIFICATION_SETTINGS_KEY, JSON.stringify(normalized));
  } catch {}

  window.dispatchEvent(new CustomEvent(DRIVER_NOTIFICATION_SETTINGS_EVENT, { detail: normalized }));
};