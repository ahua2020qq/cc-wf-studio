/**
 * [yougao 改造] 本地模型配置
 * 用于 DeepSeek 等本地模型对接
 */

export default {
  // 是否启用本地模型
  enableLocalModel: false,
  
  // 本地模型类型：'deepseek' | 'qwen' | 'llama' | 'custom'
  localModelType: 'deepseek',
  
  // 本地模型路径（可以是本地文件路径或本地服务器地址）
  localModelPath: '',
  
  // 本地服务器地址（如果使用本地服务器）
  localServerUrl: 'http://localhost:11434',
  
  // API 密钥（如果需要）
  apiKey: '',
  
  // 模型参数
  modelParams: {
    temperature: 0.7,
    maxTokens: 4096,
    topP: 0.9,
  },
  
  // 超时设置（毫秒）
  timeoutMs: 60000,
};