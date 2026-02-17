// src/services/backendAPI.js
/**
 * QuQu后端API客户端
 * 封装与GPU加速后端的通信
 */

import axios from 'axios';
import backendConfig from '../config/backend.js';

const apiClient = axios.create({
  timeout: backendConfig.timeout,
  headers: {
    'Content-Type': 'application/json'
  }
});

async function getBaseURL() {
  try {
    if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getSetting) {
      const url = await window.electronAPI.getSetting('backend_url', backendConfig.baseURL);
      if (url && typeof url === 'string' && url.trim()) return url.trim();
    }
  } catch (e) {
    // Silently fallback
  }
  return backendConfig.baseURL;
}

apiClient.interceptors.request.use(
  config => {
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  response => {
    return response;
  },
  error => {
    console.error('[API] Error:', error.message);
    return Promise.reject(error);
  }
);

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

export async function getBackendStatus() {
  try {
    const response = await apiClient.get(`${await getBaseURL()}${backendConfig.endpoints.status}`);
    return response.data;
  } catch (error) {
    console.error('Failed to get backend status:', error);
    throw error;
  }
}

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
