import { describe, it, expect, vi } from "vitest";
import { handleEdgeFunction } from "@/server/functionsRouter";
import { detectPlatform, deviceName } from "@/lib/push";
import { setNotificationVolume, getNotificationVolume, playNotificationSound, playUrgentNotification } from "@/lib/notificationSound";

describe("Notification System & FunctionsRouter", () => {
  it("push-config returns valid configuration", async () => {
    const res = await handleEdgeFunction("push-config", {});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.app_id).toBe("4f68f47f-63ee-4326-8f98-e63514f2b154");
  });

  it("notify-available-drivers requires pedido_id", async () => {
    const res = await handleEdgeFunction("notify-available-drivers", {});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("PARAMETRO_INVALIDO");
  });

  it("cancel-delivery-notification requires pedido_id", async () => {
    const res = await handleEdgeFunction("cancel-delivery-notification", {});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("PARAMETRO_INVALIDO");
  });

  it("detectPlatform returns valid platform", () => {
    const platform = detectPlatform();
    expect(["android_apk", "web_pwa", "ios"]).toContain(platform);
  });

  it("deviceName returns a non-empty string", () => {
    const name = deviceName();
    expect(typeof name).toBe("string");
    expect(name.length).toBeGreaterThan(0);
  });

  it("notification sound volume controls work correctly", () => {
    setNotificationVolume(0.75);
    expect(getNotificationVolume()).toBe(0.75);
    setNotificationVolume(1.5); // clamps to 1.0
    expect(getNotificationVolume()).toBe(1.0);
    setNotificationVolume(-0.2); // clamps to 0.0
    expect(getNotificationVolume()).toBe(0.0);
    setNotificationVolume(1.0);
  });

  it("sound triggers execute safely without crashing", () => {
    expect(() => playNotificationSound()).not.toThrow();
    expect(() => playUrgentNotification()).not.toThrow();
  });
});
