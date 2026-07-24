import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "../src/components/SettingsPanel";
import type { ModelProfile } from "../src/domain/models";

const deepSeekProfile: ModelProfile = {
  id: "deepseek",
  providerId: "deepseek",
  name: "DeepSeek",
  baseUrl: "https://api.deepseek.com",
  apiKey: "sk-deepseek",
  model: "deepseek-v4-flash",
  temperature: 0.7,
  temperaturePreset: "balanced",
  reasoningLevel: "standard",
  maxTokens: 2048,
};

describe("多厂商设置", () => {
  it("切换到智谱后显示官方地址、GLM-5.2 和独立的 Key", () => {
    render(
      <SettingsPanel
        profile={deepSeekProfile}
        onSaveProfile={vi.fn()}
        onExportEncrypted={vi.fn()}
        onImportEncrypted={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("服务商"), {
      target: { value: "zhipu" },
    });

    expect(
      screen.getByDisplayValue("https://open.bigmodel.cn/api/paas/v4"),
    ).toBeDisabled();
    expect(screen.getByRole("option", { name: "GLM-5.2" })).toBeInTheDocument();
    expect(screen.getByLabelText("API Key")).toHaveValue("");
  });
});
