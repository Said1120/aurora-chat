import { readFile } from "node:fs/promises";
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

  it("提供无需 workflow 权限的 Pages 发布命令", async () => {
    const packageJson = JSON.parse(
      await readFile(projectFile("package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts["deploy:pages"]).toBe(
      "npm run build && gh-pages -d out -b gh-pages -t",
    );
  });
});
