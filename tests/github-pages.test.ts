import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectFile = (path: string) => resolve(process.cwd(), path);

describe("GitHub Pages 独立发布", () => {
  it("以静态站点形式输出到 aurora-chat 子路径", async () => {
    const config = await readFile(projectFile("next.config.ts"), "utf8");

    expect(config).toContain('output: "export"');
    expect(config).toContain('basePath: "/aurora-chat"');
  });

  it("PWA 从独立网站子路径启动", async () => {
    const manifest = JSON.parse(
      await readFile(projectFile("public/manifest.webmanifest"), "utf8"),
    ) as { start_url: string; scope: string; icons: Array<{ src: string }> };

    expect(manifest.start_url).toBe("/aurora-chat/");
    expect(manifest.scope).toBe("/aurora-chat/");
    expect(manifest.icons[0]?.src).toBe("/aurora-chat/icon.svg");
  });

  it("包含 GitHub Pages 自动发布流程", async () => {
    await expect(
      access(projectFile(".github/workflows/deploy-pages.yml")),
    ).resolves.toBeUndefined();
  });
});
