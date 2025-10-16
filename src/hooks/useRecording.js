import { useState, useRef, useCallback } from 'react';
import { useModelStatus } from './useModelStatus';
import { transcribeAudio as backendTranscribe, optimizeText as backendOptimize } from '../services/backendAPI.js';

/**
 * 录音功能 Hook
 * 负责录音、停止、上传到后端并处理结果。
 */
export const useRecording = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [error, setError] = useState(null);
  const [audioData, setAudioData] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const processingRef = useRef({ isProcessingAudio: false, lastProcessTime: 0 });

  const modelStatus = useModelStatus();

  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // 检查远程后端/本地服务是否就绪
      if (!modelStatus.isReady) {
        if (modelStatus.isLoading) {
          throw new Error('服务正在启动中，请稍候...');
        } else if (modelStatus.error) {
          throw new Error('服务未就绪，请检查后端配置');
        } else {
          throw new Error('正在准备服务，请稍候...');
        }
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('当前浏览器不支持录音功能');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setIsRecording(false);
        setIsProcessing(true);

        try {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: 'audio/webm;codecs=opus',
          });

          setAudioData(audioBlob);
          await processAudio(audioBlob);
        } catch (err) {
          setError(`音频处理失败：${err.message}`);
        } finally {
          setIsProcessing(false);
        }
      };

      mediaRecorder.onerror = (event) => {
        setError(`录音出错：${event.error?.message || '未知错误'}`);
        setIsRecording(false);
        setIsProcessing(false);
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
    } catch (err) {
      setError(`无法开始录音：${err.message}`);
      setIsRecording(false);
    }
  }, [modelStatus.isReady, modelStatus.isLoading, modelStatus.error]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }
  }, [isRecording]);

  const processAudio = useCallback(async (audioBlob) => {
    processingRef.current.isProcessingAudio = true;

    try {
      const wavBlob = await convertToWav(audioBlob);
      const transcriptionResult = await backendTranscribe(wavBlob, {
        useVad: true,
        usePunc: true,
        hotword: '',
      });

      const ok = transcriptionResult && transcriptionResult.success !== false;
      if (!ok) {
        const message = transcriptionResult?.error || '语音识别失败';
        throw new Error(message);
      }

      const rawText = transcriptionResult.text || transcriptionResult.transcript || '';
      const durationSec = transcriptionResult.duration || 0;
      const language = transcriptionResult.language || 'zh-CN';
      const confidence = transcriptionResult.confidence || 0;

      const buffer = await wavBlob.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);

      const transcriptionData = {
        raw_text: rawText,
        text: rawText,
        confidence,
        language,
        duration: durationSec,
        file_size: uint8Array.length,
      };

      if (window.onTranscriptionComplete) {
        window.onTranscriptionComplete({ ...transcriptionResult, enhanced_by_ai: false });
      }

      setIsOptimizing(true);
      setTimeout(async () => {
        try {
          const useAI = await window.electronAPI.getSetting('enable_ai_optimization', true);
          let finalData = { ...transcriptionData };

          if (useAI) {
            try {
              window.electronAPI?.log?.('info', '开始 AI 文本优化');

              const optimizeResp = await backendOptimize(rawText, 'optimize');
              const optimizeOk = optimizeResp && optimizeResp.success !== false;

              if (optimizeOk) {
                const processedText = optimizeResp.text || optimizeResp.optimized_text || '';
                finalData.processed_text = processedText;

                if (processedText && processedText.trim() !== rawText.trim()) {
                  finalData.text = processedText;
                }

                window.electronAPI?.log?.('info', 'AI 文本优化成功');
              } else {
                window.electronAPI?.log?.('error', 'AI 文本优化失败', optimizeResp);
              }
            } catch (optimizeError) {
              window.electronAPI?.log?.('error', 'AI 文本优化异常', optimizeError);
            }
          }

          if (window.electronAPI) {
            window.electronAPI.log?.('info', '保存转录数据', finalData);
            const saved = await window.electronAPI.saveTranscription(finalData);
            window.electronAPI.log?.('info', '转录保存完成', saved);

            if (useAI && finalData.processed_text && finalData.processed_text !== rawText) {
              const enhancedResult = {
                ...transcriptionResult,
                text: finalData.processed_text,
                processed_text: finalData.processed_text,
                enhanced_by_ai: true,
              };
              window.onAIOptimizationComplete?.(enhancedResult);
            } else {
              const finalResult = {
                ...transcriptionResult,
                text: rawText,
                enhanced_by_ai: false,
              };
              window.onAIOptimizationComplete?.(finalResult);
            }
          }
        } catch (err) {
          window.electronAPI?.log?.('error', '处理转录结果失败', err);
        } finally {
          setIsOptimizing(false);
        }
      }, 100);

      return { ...transcriptionResult, enhanced_by_ai: false };
    } catch (err) {
      throw new Error(`音频处理失败：${err.message}`);
    } finally {
      processingRef.current.isProcessingAudio = false;
    }
  }, []);

  const convertToWav = useCallback(async (audioBlob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async () => {
        try {
          const arrayBuffer = reader.result;

          const audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 16000,
          });

          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          const wavBuffer = audioBufferToWav(audioBuffer);
          const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });

          audioContext.close();
          resolve(wavBlob);
        } catch (err) {
          reject(new Error(`音频格式转换失败：${err.message}`));
        }
      };

      reader.onerror = () => {
        reject(new Error('读取音频数据失败'));
      };

      reader.readAsArrayBuffer(audioBlob);
    });
  }, []);

  const audioBufferToWav = (audioBuffer) => {
    const length = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;
    const numberOfChannels = audioBuffer.numberOfChannels;
    const bytesPerSample = 2;
    const blockAlign = numberOfChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;
    const bufferSize = 44 + dataSize;

    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample * 0x7fff, true);
        offset += 2;
      }
    }

    return buffer;
  };

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setIsRecording(false);
    setIsProcessing(false);
    setError(null);
    audioChunksRef.current = [];
  }, []);

  const checkPermissions = useCallback(async () => {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' });
      return result.state; // granted / denied / prompt
    } catch (err) {
      window.electronAPI?.log?.('warn', '无法检查麦克风权限', err);
      return 'unknown';
    }
  }, []);

  return {
    isRecording,
    isProcessing,
    isOptimizing,
    error,
    audioData,
    startRecording,
    stopRecording,
    cancelRecording,
    checkPermissions,
  };
};

