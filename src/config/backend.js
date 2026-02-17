// src/config/backend.js
/**
 * QuQu后端API配置
 * 用于连接本地 CapsWriter HTTP API 服务
 */

// API端点配置
const ENDPOINTS = {
  health: '/api/health',
  status: '/api/status',
  transcribe: '/api/asr/transcribe',
  optimize: '/api/llm/optimize',
  transcribeAndOptimize: '/api/asr/transcribe-and-optimize'
};

// 基础配置
const config = {
  baseURL: 'http://localhost:8000',
  timeout: 30000,
  endpoints: ENDPOINTS
};

export default config;

// 辅助函数：获取完整URL
export function getEndpointURL(endpointName) {
  return config.baseURL + config.endpoints[endpointName];
}

// 辅助函数：检查后端健康状态
export async function checkBackendHealth() {
  try {
    const response = await fetch(getEndpointURL('health'), {
      method: 'GET'
    });
    return response.ok;
  } catch (error) {
    console.error('Backend health check failed:', error);
    return false;
  }
}
