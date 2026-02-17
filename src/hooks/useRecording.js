import { useState, useRef, useCallback } from 'react';
import { useModelStatus } from './useModelStatus';
import { transcribeAudio as backendTranscribe, optimizeText as backendOptimize } from '../services/backendAPI.js';

class WavRecorder {
  constructor(stream, options = {}) {
    this.stream = stream;
    this.sampleRate = options.sampleRate || 16000;
    this.audioContext = null;
    this.sourceNode = null;
    this.scriptProcessor = null;
    this.audioChunks = [];
    this.isRecording = false;
  }

  async start() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: this.sampleRate
    });
    
    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
    this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
    
    this.audioChunks = [];
    this.isRecording = true;
    
    this.scriptProcessor.onaudioprocess = (e) => {
      if (!this.isRecording) return;
      const inputData = e.inputBuffer.getChannelData(0);
      this.audioChunks.push(new Float32Array(inputData));
    };
    
    this.sourceNode.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioContext.destination);
  }

  stop() {
    this.isRecording = false;
    
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    return this.getWavBlob();
  }

  getWavBlob() {
    const totalLength = this.audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const mergedBuffer = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.audioChunks) {
      mergedBuffer.set(chunk, offset);
      offset += chunk.length;
    }
    
    const wavBuffer = this.float32ToWav(mergedBuffer, this.sampleRate);
    return new Blob([wavBuffer], { type: 'audio/wav' });
  }

  float32ToWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
    
    return buffer;
  }
}

export const useRecording = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [error, setError] = useState(null);
  const [audioData, setAudioData] = useState(null);

  const wavRecorderRef = useRef(null);
  const streamRef = useRef(null);

  const modelStatus = useModelStatus();

  const startRecording = useCallback(async () => {
    try {
      setError(null);

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
      
      wavRecorderRef.current = new WavRecorder(stream, { sampleRate: 16000 });
      await wavRecorderRef.current.start();
      
      setIsRecording(true);
    } catch (err) {
      setError(`无法开始录音：${err.message}`);
      setIsRecording(false);
    }
  }, [modelStatus.isReady, modelStatus.isLoading, modelStatus.error]);

  const stopRecording = useCallback(() => {
    if (wavRecorderRef.current && isRecording) {
      const wavBlob = wavRecorderRef.current.stop();
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      
      setIsRecording(false);
      setIsProcessing(true);
      
      processAudio(wavBlob);
    }
  }, [isRecording]);

  const processAudio = useCallback(async (audioBlob) => {
    try {
      setAudioData(audioBlob);
      
      const transcriptionResult = await backendTranscribe(audioBlob, {
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

      const transcriptionData = {
        raw_text: rawText,
        text: rawText,
        confidence,
        language,
        duration: durationSec,
        file_size: audioBlob.size,
      };

      if (window.onTranscriptionComplete) {
        window.onTranscriptionComplete({ ...transcriptionResult, enhanced_by_ai: false });
      }

      if (window.electronAPI) {
        window.electronAPI.saveTranscription(transcriptionData).catch(() => {});
      }
      
    } catch (err) {
      setError(`音频处理失败：${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const cancelRecording = useCallback(() => {
    if (wavRecorderRef.current) {
      wavRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setIsRecording(false);
    setIsProcessing(false);
    setError(null);
  }, []);

  const checkPermissions = useCallback(async () => {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' });
      return result.state;
    } catch (err) {
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
