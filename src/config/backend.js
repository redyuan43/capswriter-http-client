// src/config/backend.js
/**
 * QuQu后端API配置
 * 用于连接Jetson GPU加速后端服务
 */

// 开发环境配置
const DEVELOPMENT_CONFIG = {
  // Jetson服务器地址
  baseURL: 'http://192.168.100.38:8000',
  timeout: 30000, // 30秒超时

  // API端点
  endpoints: {
    health: '/api/health',
    status: '/api/status',
    transcribe: '/api/asr/transcribe',
    optimize: '/api/llm/optimize',
    transcribeAndOptimize: '/api/asr/transcribe-and-optimize'
  }
};

// 生产环境配置（打包后使用localhost或配置的地址）
const PRODUCTION_CONFIG = {
  baseURL: process.env.BACKEND_URL || 'http://localhost:8000',
  timeout: 30000,
  endpoints: DEVELOPMENT_CONFIG.endpoints
};

// 根据环境导出配置
const config = process.env.NODE_ENV === 'production'
  ? PRODUCTION_CONFIG
  : DEVELOPMENT_CONFIG;

export default config;

// 辅助函数：获取完整URL
export function getEndpointURL(endpointName) {
  return config.baseURL + config.endpoints[endpointName];
}

// 辅助函数：检查后端健康状态
export async function checkBackendHealth() {
  try {
    const response = await fetch(getEndpointURL('health'), {
      method: 'GET',
      timeout: 5000
    });
    return response.ok;
  } catch (error) {
    console.error('Backend health check failed:', error);
    return false;
  }
}