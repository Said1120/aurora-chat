import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TransferPanel } from "../src/components/TransferPanel";
import type { BackupV2 } from "../src/domain/models";

const backup: BackupV2 = {
  version: 2,
  exportedAt: "2026-07-24T10:00:00.000Z",
  roles: [],
  conversations: [],
  messages: [],
  profiles: [],
};

describe("设备迁移面板", () => {
  it("未配置中转服务时保留加密文件方案，不显示即时迁移操作", () => {
    render(
      <TransferPanel
        getBackup={async () => backup}
        onImportBackup={vi.fn()}
      />,
    );

    expect(screen.getByText("即时设备迁移尚未配置")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成迁移二维码" })).not.toBeInTheDocument();
  });
});
