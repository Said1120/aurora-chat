import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "../src/components/Composer";

describe("聊天输入框", () => {
  it("空白内容不能发送，生成中可以停止", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const { rerender } = render(
      <Composer value="" onChange={() => {}} onSend={onSend} onStop={onStop} isStreaming={false} stickers={[]} />,
    );

    expect(screen.getByRole("button", { name: "发送" })).toHaveProperty("disabled", true);
    rerender(
      <Composer value="" onChange={() => {}} onSend={onSend} onStop={onStop} isStreaming stickers={[]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "停止生成" }));
    expect(onStop).toHaveBeenCalledOnce();
  });
});
