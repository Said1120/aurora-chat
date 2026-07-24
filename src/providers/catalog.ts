export type ProviderId =
  | "deepseek"
  | "kimi"
  | "mimo"
  | "siliconflow"
  | "zhipu"
  | "qwen"
  | "custom";

export type TemperaturePreset = "precise" | "balanced" | "creative";
export type ReasoningLevel = "off" | "standard" | "deep";
export type TemperatureMode = "adjustable" | "fixed";

export type ModelDefinition = {
  id: string;
  label: string;
  temperatureMode: TemperatureMode;
  reasoningLevels: ReasoningLevel[];
};

export type ProviderDefinition = {
  id: ProviderId;
  name: string;
  baseUrl: string;
  description: string;
  models: ModelDefinition[];
};

export const temperatureForPreset = (preset: TemperaturePreset): number =>
  ({ precise: 0.2, balanced: 0.7, creative: 1 })[preset];

export const temperatureLabel: Record<TemperaturePreset, string> = {
  precise: "严谨",
  balanced: "平衡",
  creative: "创意",
};

const adjustable = (id: string, label: string): ModelDefinition => ({
  id,
  label,
  temperatureMode: "adjustable",
  reasoningLevels: ["off", "standard", "deep"],
});

const fixed = (
  id: string,
  label: string,
  reasoningLevels: ReasoningLevel[] = ["off", "standard"],
): ModelDefinition => ({
  id,
  label,
  temperatureMode: "fixed",
  reasoningLevels,
});

export const providers: Record<ProviderId, ProviderDefinition> = {
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    description: "高性价比的通用与推理模型",
    models: [
      adjustable("deepseek-v4-flash", "DeepSeek V4 Flash"),
      adjustable("deepseek-v4-pro", "DeepSeek V4 Pro"),
    ],
  },
  kimi: {
    id: "kimi",
    name: "Kimi（月之暗面）",
    baseUrl: "https://api.moonshot.cn/v1",
    description: "长上下文、多模态与思考模型",
    models: [
      fixed("kimi-k2.6", "Kimi K2.6"),
      fixed("kimi-k2-thinking", "Kimi K2 Thinking", ["standard"]),
    ],
  },
  mimo: {
    id: "mimo",
    name: "MiMo（小米）",
    baseUrl: "https://api.xiaomimimo.com/v1",
    description: "支持深度思考的长上下文模型",
    models: [
      fixed("mimo-v2.5-pro", "MiMo V2.5 Pro"),
      fixed("mimo-v2.5", "MiMo V2.5"),
    ],
  },
  siliconflow: {
    id: "siliconflow",
    name: "硅基流动",
    baseUrl: "https://api.siliconflow.cn/v1",
    description: "聚合 DeepSeek、Qwen、GLM 等开源模型",
    models: [
      adjustable("deepseek-ai/DeepSeek-V3.2", "DeepSeek V3.2"),
      adjustable("Qwen/Qwen3.5-397B-A17B", "Qwen 3.5 397B"),
      adjustable("zai-org/GLM-5.1", "GLM 5.1"),
    ],
  },
  zhipu: {
    id: "zhipu",
    name: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    description: "GLM 系列通用、推理与 Agent 模型",
    models: [adjustable("glm-5.2", "GLM-5.2"), adjustable("glm-5", "GLM-5")],
  },
  qwen: {
    id: "qwen",
    name: "千问（阿里云百炼）",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    description: "千问系列与第三方模型服务",
    models: [
      adjustable("qwen3.7-plus", "Qwen 3.7 Plus"),
      adjustable("qwen3.6-flash", "Qwen 3.6 Flash"),
      adjustable("qwen3.7-max", "Qwen 3.7 Max"),
    ],
  },
  custom: {
    id: "custom",
    name: "自定义兼容服务",
    baseUrl: "",
    description: "用于其他 OpenAI Chat Completions 兼容服务",
    models: [
      {
        id: "custom-model",
        label: "自定义模型",
        temperatureMode: "adjustable",
        reasoningLevels: ["off"],
      },
    ],
  },
};

export const providerList = Object.values(providers);

export function getProviderDefinition(providerId: ProviderId): ProviderDefinition {
  return providers[providerId];
}

export function getModelDefinition(
  providerId: ProviderId,
  modelId: string,
): ModelDefinition | undefined {
  return providers[providerId].models.find((model) => model.id === modelId);
}

export function defaultModelFor(providerId: ProviderId): ModelDefinition {
  return providers[providerId].models[0]!;
}
