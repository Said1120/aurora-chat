import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransferPanel } from "../src/components/TransferPanel";
import type { BackupV2 } from "../src/domain/models";

vi.mock("../src/transfer/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/transfer/client")>();
  return {
    ...actual,
    claimTransfer: vi.fn(async () => ({
      version: 1,
      iv: "MTIzNDU2Nzg5MDEy",
      ciphertext: "Y2lwaGVydGV4dA",
    })),
    openTransferPayload: vi.fn(async () => backup),
  };
});

const backup: BackupV2 = {
  version: 2,
  exportedAt: "2026-07-24T10:00:00.000Z",
  roles: [],
  conversations: [],
  messages: [],
  profiles: [],
};

describe("设备迁移面板", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState({}, "", "/");
  });

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

  it("替换导入被取消时保留已解密的迁移预览", async () => {
    window.history.replaceState(
      {},
      "",
      "/aurora-chat/?transfer=transfer-id#key=transfer-secret",
    );
    const onImportBackup = vi.fn(async () => "canceled" as const);
    render(
      <TransferPanel
        getBackup={async () => backup}
        serviceUrl="https://transfer.example"
        turnstileSiteKey="site-key"
        onImportBackup={onImportBackup}
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("接收迁移链接")).toHaveValue(
        "http://localhost:3000/aurora-chat/?transfer=transfer-id#key=transfer-secret",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "领取并解密迁移包" }));
    expect(await screen.findByText("迁移内容预览")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("导入方式"), {
      target: { value: "replace" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认导入迁移数据" }));

    await waitFor(() => expect(onImportBackup).toHaveBeenCalledWith(backup, "replace"));
    expect(screen.getByText("迁移内容预览")).toBeInTheDocument();
    expect(screen.queryByText("迁移数据已导入。")).not.toBeInTheDocument();
  });
});
