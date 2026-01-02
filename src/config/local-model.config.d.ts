/**
 * [yougao 改造] 本地模型配置类型定义
 */

export interface LocalModelConfig {
  // 是否启用本地模型
  enableLocalModel: boolean;
  
  // 本地模型类型
  localModelType: 'deepseek' | 'qwen' | 'llama' | 'custom';
  
  // 本地模型路径（可以是本地文件路径或本地服务器地址）
  localModelPath: string;
  
  // 本地服务器地址（如果使用本地服务器）
  localServerUrl: string;
  
  // API 密钥（如果需要）
  apiKey: string;
  
  // 模型参数
  modelParams: {
    temperature: number;
    maxTokens: number;
    topP: number;
  };
  
  // 超时设置（毫秒）
  timeoutMs: number;
}

declare const config: LocalModelConfig;
export default config;