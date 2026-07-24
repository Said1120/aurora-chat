import { describe, expect, it } from "vitest";
import {
  getModelDefinition,
  getProviderDefinition,
  temperatureForPreset,
} from "../src/providers/catalog";

describe("服务商目录", () => {
  it("为 Kimi 提供官方兼容地址与 K2.6", () => {
    expect(getProviderDefinition("kimi").baseUrl).toBe(
      "https://api.moonshot.cn/v1",
    );
    expect(getModelDefinition("kimi", "kimi-k2.6")?.temperatureMode).toBe(
      "fixed",
    );
  });

  it("将回答风格映射成稳定温度", () => {
    expect(temperatureForPreset("precise")).toBe(0.2);
    expect(temperatureForPreset("balanced")).toBe(0.7);
    expect(temperatureForPreset("creative")).toBe(1);
  });
});
