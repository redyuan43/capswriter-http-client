// src/services/backendAPI.js
/**
 * QuQu后端API客户端
 * 封装与GPU加速后端的通信
 */

import axios from 'axios';
import backendConfig from '../config/backend.js';

// 创建axios实例（baseURL 将在每次请求前动态拼接，便于从设置切换后端地址）
const apiClient = axios.create({
  timeout: backendConfig.timeout,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 动态获取当前后端地址（优先读取设置中的 backend_url）
async function getBaseURL() {
  try {
    if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getSetting) {
      const url = await window.electronAPI.getSetting('backend_url', backendConfig.baseURL);
      if (url && typeof url === 'string' && url.trim()) return url.trim();
    }
  } catch (e) {
    console.warn('[API] Failed to read backend_url from settings, fallback to config', e);
  }
  return backendConfig.baseURL;
}

// 请求拦截器
apiClient.interceptors.request.use(
  config => {
    console.log(`[API] ${config.method.toUpperCase()} ${config.url}`);
    return config;
  },
  error => {
    console.error('[API] Request error:', error);
    return Promise.reject(error);
  }
);

// 响应拦截器
apiClient.interceptors.response.use(
  response => {
    console.log(`[API] Response:`, response.status);
    return response;
  },
  error => {
    console.error('[API] Response error:', error.response?.status, error.message);
    return Promise.reject(error);
  }
);

/**
 * 语音识别API
 * @param {Blob|File} audioBlob - 音频数据
 * @param {Object} options - 识别选项
 * @returns {Promise<Object>} 识别结果
 */
export async function transcribeAudio(audioBlob, options = {}) {
  const {
    useVad = true,
    usePunc = true,
    hotword = ''
  } = options;

  const formData = new FormData();
  formData.append('audio', audioBlob, 'audio.wav');
  formData.append('use_vad', useVad);
  formData.append('use_punc', usePunc);
  formData.append('hotword', hotword);

  try {
    const response = await apiClient.post(
      `${await getBaseURL()}${backendConfig.endpoints.transcribe}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('Transcription failed:', error);
    throw error;
  }
}

/**
 * 文本优化API
 * @param {string} text - 待优化文本
 * @param {string} mode - 优化模式 (optimize/format/punctuate/custom)
 * @param {string} customPrompt - 自定义提示词（mode为custom时使用）
 * @returns {Promise<Object>} 优化结果
 */
export async function optimizeText(text, mode = 'optimize', customPrompt = null) {
  try {
    const response = await apiClient.post(
      `${await getBaseURL()}${backendConfig.endpoints.optimize}`,
      {
        text,
        mode,
        custom_prompt: customPrompt
      }
    );

    return response.data;
  } catch (error) {
    console.error('Text optimization failed:', error);
    throw error;
  }
}

/**
 * 一体化处理API（语音识别 + 文本优化）
 * @param {Blob|File} audioBlob - 音频数据
 * @param {Object} options - 处理选项
 * @returns {Promise<Object>} 处理结果
 */
export async function transcribeAndOptimize(audioBlob, options = {}) {
  const {
    useVad = true,
    usePunc = true,
    hotword = '',
    optimizeMode = 'optimize'
  } = options;

  const formData = new FormData();
  formData.append('audio', audioBlob, 'audio.wav');
  formData.append('use_vad', useVad);
  formData.append('use_punc', usePunc);
  formData.append('hotword', hotword);
  formData.append('optimize_mode', optimizeMode);

  try {
    const response = await apiClient.post(
      `${await getBaseURL()}${backendConfig.endpoints.transcribeAndOptimize}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('Transcribe and optimize failed:', error);
    throw error;
  }
}

/**
 * 获取后端状态
 * @returns {Promise<Object>} 后端状态信息
 */
export async function getBackendStatus() {
  try {
    const response = await apiClient.get(`${await getBaseURL()}${backendConfig.endpoints.status}`);
    return response.data;
  } catch (error) {
    console.error('Failed to get backend status:', error);
    throw error;
  }
}

/**
 * 健康检查
 * @returns {Promise<boolean>} 后端是否健康
 */
export async function healthCheck() {
  try {
    const response = await apiClient.get(`${await getBaseURL()}${backendConfig.endpoints.health}`);
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

export default {
  transcribeAudio,
  optimizeText,
  transcribeAndOptimize,
  getBackendStatus,
  healthCheck
};
