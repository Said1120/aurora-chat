"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import type { BackupV2 } from "../domain/models";
import {
  claimTransfer,
  createTransfer,
  createTransferLink,
  createTransferPayload,
  openTransferPayload,
  parseTransferLink,
} from "../transfer/client";
import { backupSummary } from "../backup/encryptedBackup";

type ImportMode = "replace" | "merge";

export type TransferPanelProps = {
  getBackup: () => Promise<BackupV2>;
  serviceUrl?: string;
  turnstileSiteKey?: string;
  appUrl?: string;
  onImportBackup: (backup: BackupV2, mode: ImportMode) => void | Promise<void>;
};

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      theme: "auto";
    },
  ) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function TurnstileChallenge({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;
    const render = () => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onToken,
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
        theme: "auto",
      });
    };
    const existing = document.querySelector<HTMLScriptElement>("script[data-aurora-turnstile]");
    if (window.turnstile) render();
    else if (existing) existing.addEventListener("load", render, { once: true });
    else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.auroraTurnstile = "true";
      script.addEventListener("load", render, { once: true });
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [onToken, siteKey]);

  return <div className="turnstile-challenge" ref={containerRef} aria-label="安全验证" />;
}

export function TransferPanel({
  getBackup,
  serviceUrl,
  turnstileSiteKey,
  appUrl = "https://said1120.github.io/aurora-chat/",
  onImportBackup,
}: TransferPanelProps) {
  const [activeTab, setActiveTab] = useState<"send" | "receive">("send");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [transferLink, setTransferLink] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [receiveLink, setReceiveLink] = useState("");
  const [receivedBackup, setReceivedBackup] = useState<BackupV2 | null>(null);
  const [mode, setMode] = useState<ImportMode>("merge");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const enabled = Boolean(serviceUrl && turnstileSiteKey);

  useEffect(() => {
    if (!transferLink) return;
    void QRCode.toDataURL(transferLink, { width: 260, margin: 1, errorCorrectionLevel: "M" })
      .then(setQrCode)
      .catch(() => setError("二维码生成失败，请使用下方链接手动迁移。"));
  }, [transferLink]);

  useEffect(() => {
    const parsed = parseTransferLink(window.location.href);
    if (!parsed) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setActiveTab("receive");
      setReceiveLink(window.location.href);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const beginTransfer = async () => {
    if (!serviceUrl || !turnstileToken) return;
    setBusy(true);
    setError("");
    try {
      const payload = await createTransferPayload(await getBackup());
      const id = await createTransfer(serviceUrl, turnstileToken, payload.upload);
      setTransferLink(createTransferLink(appUrl, id, payload.secret));
      setNotice("迁移包已创建：用新设备扫描二维码，或安全地发送下方链接。领取一次后立即失效。");
      setTurnstileToken("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "迁移码创建失败");
    } finally {
      setBusy(false);
    }
  };

  const receiveTransfer = async () => {
    if (!serviceUrl) return;
    setBusy(true);
    setError("");
    try {
      const parsed = parseTransferLink(receiveLink);
      if (!parsed) throw new Error("迁移链接格式不正确");
      const upload = await claimTransfer(serviceUrl, parsed.id);
      const nextBackup = await openTransferPayload(upload, parsed.secret);
      setReceivedBackup(nextBackup);
      setNotice("迁移包已在本机解密。确认导入后才会修改本机数据。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "迁移包无法读取");
    } finally {
      setBusy(false);
    }
  };

  const importReceived = async () => {
    if (!receivedBackup) return;
    setBusy(true);
    try {
      await onImportBackup(receivedBackup, mode);
      setNotice("迁移数据已导入。");
      setReceivedBackup(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "导入迁移数据失败");
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) {
    return (
      <section className="transfer-panel">
        <h3>设备迁移</h3>
        <p className="transfer-unavailable">即时设备迁移尚未配置</p>
        <p className="privacy-copy">当前请使用上方的加密备份文件在设备间迁移。启用临时中转后，这里会出现二维码迁移功能。</p>
      </section>
    );
  }

  return (
    <section className="transfer-panel">
      <h3>设备迁移</h3>
      <div className="transfer-tabs" role="tablist" aria-label="设备迁移方式">
        <button className={activeTab === "send" ? "selected" : ""} onClick={() => setActiveTab("send")} role="tab" type="button">发送到新设备</button>
        <button className={activeTab === "receive" ? "selected" : ""} onClick={() => setActiveTab("receive")} role="tab" type="button">接收迁移</button>
      </div>
      {activeTab === "send" ? (
        <>
          <p className="privacy-copy">本机先加密全部数据，再上传一次性密文。二维码的密钥只在链接片段中，不会发送给中转服务。</p>
          <TurnstileChallenge siteKey={turnstileSiteKey!} onToken={setTurnstileToken} />
          <button className="secondary-button wide" disabled={!turnstileToken || busy} onClick={beginTransfer} type="button">
            {busy ? "正在创建迁移码…" : "生成迁移二维码"}
          </button>
          {qrCode && (
            // The QR code is an in-memory data URL; optimization is not applicable.
            // eslint-disable-next-line @next/next/no-img-element
            <img className="transfer-qr" src={qrCode} alt="设备迁移二维码" />
          )}
          {transferLink && (
            <label>
              迁移链接（仅分享给自己的新设备）
              <textarea aria-label="迁移链接" value={transferLink} readOnly rows={4} />
            </label>
          )}
        </>
      ) : (
        <>
          <p className="privacy-copy">扫描二维码会自动填入链接；也可以粘贴完整迁移链接。成功领取后，该迁移码会立即失效。</p>
          <label>
            迁移链接
            <textarea aria-label="接收迁移链接" value={receiveLink} onChange={(event) => setReceiveLink(event.target.value)} rows={4} />
          </label>
          <button className="secondary-button wide" disabled={!receiveLink || busy} onClick={receiveTransfer} type="button">
            {busy ? "正在领取并解密…" : "领取并解密迁移包"}
          </button>
          {receivedBackup && (
            <div className="transfer-summary">
              <strong>迁移内容预览</strong>
              <p>{backupSummary(receivedBackup)}</p>
              <label>
                导入方式
                <select value={mode} onChange={(event) => setMode(event.target.value as ImportMode)}>
                  <option value="merge">合并并保留本机数据</option>
                  <option value="replace">替换本机全部数据</option>
                </select>
              </label>
              <button className="primary-button wide" disabled={busy} onClick={importReceived} type="button">确认导入迁移数据</button>
            </div>
          )}
        </>
      )}
      {error && <p className="backup-error">{error}</p>}
      {notice && <p className="backup-notice">{notice}</p>}
    </section>
  );
}
