"use client";

import { useState } from "react";
import {
  defaultModelFor,
  getModelDefinition,
  getProviderDefinition,
  providerList,
  temperatureForPreset,
  temperatureLabel,
  type ProviderId,
  type ReasoningLevel,
  type TemperaturePreset,
} from "../providers/catalog";
import type { BackupImportResult, ModelProfile } from "../domain/models";
import { TransferPanel, type TransferPanelProps } from "./TransferPanel";

type ImportMode = "replace" | "merge";

type SettingsPanelProps = {
  profile: ModelProfile;
  profiles?: ModelProfile[];
  onSaveProfile: (profile: ModelProfile) => void | Promise<void>;
  onExportEncrypted: (password: string) => void | Promise<void>;
  onImportEncrypted: (
    file: File,
    password: string,
    mode: ImportMode,
  ) => BackupImportResult | Promise<BackupImportResult>;
  transfer?: TransferPanelProps;
};

const providerIdFor = (profile: ModelProfile): ProviderId =>
  profile.providerId ?? (profile.id === "default" ? "deepseek" : (profile.id as ProviderId));

export function createProfileForProvider(providerId: ProviderId): ModelProfile {
  const provider = getProviderDefinition(providerId);
  const model = defaultModelFor(providerId);
  return {
    id: providerId,
    providerId,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: "",
    model: model.id,
    temperature: 0.7,
    temperaturePreset: "balanced",
    reasoningLevel: model.reasoningLevels.includes("standard") ? "standard" : "off",
    useCustomModel: false,
    maxTokens: 2048,
    updatedAt: new Date().toISOString(),
  };
}

export function SettingsPanel({
  profile,
  profiles = [profile],
  onSaveProfile,
  onExportEncrypted,
  onImportEncrypted,
  transfer,
}: SettingsPanelProps) {
  const [draft, setDraft] = useState<ModelProfile>(() => ({
    ...profile,
    providerId: providerIdFor(profile),
  }));
  const [advancedEndpoint, setAdvancedEndpoint] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");
  const [backupPasswordConfirm, setBackupPasswordConfirm] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPassword, setImportPassword] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [backupError, setBackupError] = useState("");
  const [backupNotice, setBackupNotice] = useState("");

  const providerId = providerIdFor(draft);
  const provider = getProviderDefinition(providerId);
  const model = getModelDefinition(providerId, draft.model) ?? defaultModelFor(providerId);

  const update = (changes: Partial<ModelProfile>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const changeProvider = (nextProviderId: ProviderId) => {
    const saved = profiles.find((item) => providerIdFor(item) === nextProviderId);
    setDraft(
      saved
        ? { ...saved, providerId: nextProviderId }
        : createProfileForProvider(nextProviderId),
    );
    setAdvancedEndpoint(nextProviderId === "custom");
  };

  const changeModel = (modelId: string) => {
    const nextModel = getModelDefinition(providerId, modelId) ?? defaultModelFor(providerId);
    update({
      model: modelId,
      reasoningLevel: nextModel.reasoningLevels.includes(draft.reasoningLevel ?? "standard")
        ? draft.reasoningLevel
        : (nextModel.reasoningLevels[0] ?? "off"),
    });
  };

  const setCustomModelEnabled = (enabled: boolean) => {
    if (enabled) {
      update({ useCustomModel: true });
      return;
    }
    const catalogModel =
      getModelDefinition(providerId, draft.model) ?? defaultModelFor(providerId);
    update({
      useCustomModel: false,
      model: catalogModel.id,
      reasoningLevel: catalogModel.reasoningLevels.includes(
        draft.reasoningLevel ?? "standard",
      )
        ? draft.reasoningLevel
        : (catalogModel.reasoningLevels[0] ?? "off"),
    });
  };

  const save = async () => {
    await onSaveProfile({
      ...draft,
      providerId,
      name: provider.name,
      temperature: temperatureForPreset(draft.temperaturePreset ?? "balanced"),
      updatedAt: new Date().toISOString(),
    });
  };

  const exportBackup = async () => {
    setBackupError("");
    setBackupNotice("");
    if (!backupPassword || backupPassword !== backupPasswordConfirm) {
      setBackupError("请填写两次相同的备份密码。");
      return;
    }
    try {
      await onExportEncrypted(backupPassword);
      setBackupPassword("");
      setBackupPasswordConfirm("");
      setBackupNotice("加密备份已下载；请单独妥善保存备份密码。");
    } catch {
      setBackupError("加密备份未能创建，请稍后重试。");
    }
  };

  const importBackup = async () => {
    setBackupError("");
    setBackupNotice("");
    if (!importFile) {
      setBackupError("请先选择备份文件。");
      return;
    }
    try {
      const result = await onImportEncrypted(importFile, importPassword, importMode);
      if (result === "canceled") return;
      setImportFile(null);
      setImportPassword("");
      setBackupNotice("备份已导入。");
    } catch {
      setBackupError("备份无法读取；请检查文件和备份密码。");
    }
  };

  return (
    <div className="settings-content">
      <p className="settings-intro">每个服务商单独保存 API Key，仅保存在当前设备。</p>

      <label>
        服务商
        <select
          aria-label="服务商"
          value={providerId}
          onChange={(event) => changeProvider(event.target.value as ProviderId)}
        >
          {providerList.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        模型
        <select value={draft.model} onChange={(event) => changeModel(event.target.value)}>
          {provider.models.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <label className="check-label">
        <input
          type="checkbox"
          checked={draft.useCustomModel ?? false}
          onChange={(event) => setCustomModelEnabled(event.target.checked)}
        />
        使用自定义模型名称
      </label>
      {draft.useCustomModel && (
        <label>
          自定义模型名称
          <input value={draft.model} onChange={(event) => update({ model: event.target.value })} />
        </label>
      )}

      <label className="check-label">
        <input
          aria-label="高级连接设置"
          type="checkbox"
          checked={advancedEndpoint}
          onChange={(event) => setAdvancedEndpoint(event.target.checked)}
        />
        高级连接设置（自定义 API 地址）
      </label>
      <label>
        API 地址
        <input
          value={draft.baseUrl}
          disabled={providerId !== "custom" && !advancedEndpoint}
          onChange={(event) => update({ baseUrl: event.target.value })}
        />
      </label>
      <label>
        API Key
        <input
          aria-label="API Key"
          type="password"
          value={draft.apiKey}
          placeholder="仅保存在本机"
          autoComplete="off"
          onChange={(event) => update({ apiKey: event.target.value })}
        />
      </label>

      <fieldset className="setting-fieldset">
        <legend>回答风格</legend>
        <div className="choice-row">
          {(["precise", "balanced", "creative"] as TemperaturePreset[]).map((preset) => (
            <button
              className={draft.temperaturePreset === preset ? "selected" : ""}
              disabled={model.temperatureMode === "fixed"}
              key={preset}
              onClick={() =>
                update({
                  temperaturePreset: preset,
                  temperature: temperatureForPreset(preset),
                })
              }
              type="button"
            >
              {temperatureLabel[preset]}
            </button>
          ))}
        </div>
        {model.temperatureMode === "fixed" ? (
          <small>该模型由官方固定采样参数，回答风格无法单独调整。</small>
        ) : (
          <small>严谨 0.2 · 平衡 0.7 · 创意 1.0</small>
        )}
      </fieldset>

      <fieldset className="setting-fieldset">
        <legend>思考强度</legend>
        <div className="choice-row">
          {model.reasoningLevels.map((level) => (
            <button
              className={draft.reasoningLevel === level ? "selected" : ""}
              key={level}
              onClick={() => update({ reasoningLevel: level as ReasoningLevel })}
              type="button"
            >
              {{ off: "关闭", standard: "标准", deep: "深度" }[level]}
            </button>
          ))}
        </div>
        <small>较高强度通常会增加回复时间和模型计费。</small>
      </fieldset>

      <button className="primary-button wide" onClick={save} type="button">
        保存当前服务商设置
      </button>

      <hr />
      <h3>加密备份与恢复</h3>
      <p className="privacy-copy">
        导出的文件以密码加密。密码不会上传，也无法找回。
      </p>
      <label>
        备份密码
        <input
          aria-label="备份密码"
          type="password"
          value={backupPassword}
          autoComplete="new-password"
          onChange={(event) => setBackupPassword(event.target.value)}
        />
      </label>
      <label>
        确认备份密码
        <input
          aria-label="确认备份密码"
          type="password"
          value={backupPasswordConfirm}
          autoComplete="new-password"
          onChange={(event) => setBackupPasswordConfirm(event.target.value)}
        />
      </label>
      <button className="secondary-button wide" onClick={exportBackup} type="button">
        导出加密备份
      </button>

      <label className="file-button">
        选择备份文件
        <input
          aria-label="选择备份文件"
          type="file"
          accept="application/json,.aurora"
          onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
        />
      </label>
      {importFile && <p className="file-name">已选择：{importFile.name}</p>}
      <label>
        备份密码（旧版 JSON 留空）
        <input
          aria-label="导入备份密码"
          type="password"
          value={importPassword}
          onChange={(event) => setImportPassword(event.target.value)}
        />
      </label>
      <label>
        导入方式
        <select
          aria-label="导入方式"
          value={importMode}
          onChange={(event) => setImportMode(event.target.value as ImportMode)}
        >
          <option value="merge">合并并保留本机数据</option>
          <option value="replace">替换本机全部数据</option>
        </select>
      </label>
      <button className="secondary-button wide" onClick={importBackup} type="button">
        导入备份
      </button>
      {backupError && <p className="backup-error">{backupError}</p>}
      {backupNotice && <p className="backup-notice">{backupNotice}</p>}
      <hr />
      {transfer && <TransferPanel {...transfer} />}
    </div>
  );
}
