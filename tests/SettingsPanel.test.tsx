import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(cleanup);

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

  it("替换导入被取消时保留已选择的备份文件", async () => {
    const onImportEncrypted = vi.fn(async () => "canceled" as const);
    render(
      <SettingsPanel
        profile={deepSeekProfile}
        onSaveProfile={vi.fn()}
        onExportEncrypted={vi.fn()}
        onImportEncrypted={onImportEncrypted}
      />,
    );
    const file = new File(["{}"], "backup.aurora", {
      type: "application/json",
    });

    fireEvent.change(screen.getByLabelText("选择备份文件"), {
      target: { files: [file] },
    });
    fireEvent.change(screen.getByLabelText("导入方式"), {
      target: { value: "replace" },
    });
    fireEvent.click(screen.getByRole("button", { name: "导入备份" }));

    await waitFor(() =>
      expect(onImportEncrypted).toHaveBeenCalledWith(file, "", "replace"),
    );
    expect(screen.getByText("已选择：backup.aurora")).toBeInTheDocument();
    expect(screen.queryByText("备份已导入。")).not.toBeInTheDocument();
  });

  it("关闭自定义模型名称时重置为当前服务商的目录模型", async () => {
    const onSaveProfile = vi.fn();
    render(
      <SettingsPanel
        profile={{
          ...deepSeekProfile,
          model: "private-preview-model",
          useCustomModel: true,
        }}
        onSaveProfile={onSaveProfile}
        onExportEncrypted={vi.fn()}
        onImportEncrypted={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: "使用自定义模型名称" }),
    );
    expect(screen.getByRole("combobox", { name: "模型" })).toHaveValue(
      "deepseek-v4-flash",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "保存当前服务商设置" }),
    );

    await waitFor(() =>
      expect(onSaveProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "deepseek-v4-flash",
          useCustomModel: false,
        }),
      ),
    );
  });
});
