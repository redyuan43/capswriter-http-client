import React, { useState, useEffect, useRef, useCallback } from "react";
import "./floating-ball.css";
import { useRecording } from "./hooks/useRecording";
import { useModelStatus } from "./hooks/useModelStatus";

const SettingsPage = React.lazy(() => import('./settings.jsx').then(module => ({ default: module.SettingsPage })));

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const page = urlParams.get('page');
  const panel = urlParams.get('panel');
  
  if (page === 'settings' || panel === 'control') {
    return (
      <React.Suspense fallback={<div className="loading">加载设置页面...</div>}>
        <SettingsPage />
      </React.Suspense>
    );
  }

  const [realtimeText, setRealtimeText] = useState("");
  const [isCapsLockPressed, setIsCapsLockPressed] = useState(false);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  
  const modelStatus = useModelStatus();
  
  const {
    isRecording,
    isProcessing: isRecordingProcessing,
    isOptimizing,
    startRecording,
    stopRecording,
    error: recordingError
  } = useRecording();

  const lastPasteRef = useRef({ text: '', timestamp: 0 });
  const PASTE_DEBOUNCE_TIME = 1000;

  const safePaste = useCallback(async (text) => {
    const now = Date.now();
    const lastPaste = lastPasteRef.current;
    
    if (lastPaste.text === text && (now - lastPaste.timestamp) < PASTE_DEBOUNCE_TIME) {
      return;
    }
    
    lastPasteRef.current = { text, timestamp: now };
    
    try {
      if (window.electronAPI) {
        await window.electronAPI.pasteText(text);
        setMessage("已粘贴");
      } else {
        await navigator.clipboard.writeText(text);
        setMessage("已复制");
      }
    } catch (error) {
      console.error("粘贴失败:", error);
      setMessage("粘贴失败");
    }
  }, []);

  const handleRecordingComplete = useCallback(async (transcriptionResult) => {
    if (transcriptionResult.success && transcriptionResult.text) {
      setRealtimeText(transcriptionResult.text);
      setStatus("processing");
      setMessage("识别完成");
      
      await safePaste(transcriptionResult.text);
      setStatus("completed");
      setMessage("已粘贴");
      
      setTimeout(() => {
        setRealtimeText("");
        setStatus("idle");
        setMessage("");
      }, 1500);
    }
  }, [safePaste]);

  const handleAIOptimizationComplete = useCallback(async (optimizedResult) => {
  }, [safePaste]);

  useEffect(() => {
    window.onTranscriptionComplete = handleRecordingComplete;
    window.onAIOptimizationComplete = handleAIOptimizationComplete;
    
    return () => {
      window.onTranscriptionComplete = null;
      window.onAIOptimizationComplete = null;
    };
  }, [handleRecordingComplete, handleAIOptimizationComplete]);

  const startRecordingWithCheck = useCallback(() => {
    if (modelStatus.stage === 'need_download') {
      setMessage("请先下载模型");
      return;
    }
    
    if (modelStatus.stage === 'downloading' || modelStatus.stage === 'loading') {
      setMessage("模型加载中");
      return;
    }
    
    if (modelStatus.stage === 'error') {
      setMessage("模型错误");
      return;
    }
    
    if (!modelStatus.isReady) {
      setMessage("模型未就绪");
      return;
    }

    setRealtimeText("");
    setMessage("");
    setStatus("recording");
    startRecording();
  }, [modelStatus, startRecording]);

  const stopRecordingWithCheck = useCallback(() => {
    if (isRecording) {
      setStatus("processing");
      setMessage("识别中...");
      stopRecording();
    }
  }, [isRecording, stopRecording]);

  useEffect(() => {
    if (window.electronAPI) {
      const unsubscribeDown = window.electronAPI.onCapsLockDown(() => {
        setIsCapsLockPressed(true);
        startRecordingWithCheck();
      });

      const unsubscribeUp = window.electronAPI.onCapsLockUp(() => {
        setIsCapsLockPressed(false);
        stopRecordingWithCheck();
      });

      return () => {
        if (unsubscribeDown) unsubscribeDown();
        if (unsubscribeUp) unsubscribeUp();
      };
    }
  }, [startRecordingWithCheck, stopRecordingWithCheck]);

  useEffect(() => {
    if (recordingError) {
      setMessage(recordingError);
      setStatus("error");
      setTimeout(() => {
        setStatus("idle");
        setRealtimeText("");
        setMessage("");
      }, 2000);
    }
  }, [recordingError]);

  useEffect(() => {
    if (isRecordingProcessing) {
      setStatus("processing");
    }
  }, [isRecordingProcessing]);

  useEffect(() => {
    if (isOptimizing) {
      setStatus("optimizing");
    }
  }, [isOptimizing]);

  useEffect(() => {
    const container = document.querySelector('.floating-ball-container');
    if (!container) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;

    const handleMouseDown = (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      startX = e.screenX;
      startY = e.screenY;
      container.style.cursor = 'grabbing';
      e.preventDefault();
    };

    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      const deltaX = e.screenX - startX;
      const deltaY = e.screenY - startY;
      
      if (window.electronAPI && window.electronAPI.moveWindow) {
        window.electronAPI.moveWindow(deltaX, deltaY);
      }
      
      startX = e.screenX;
      startY = e.screenY;
    };

    const handleMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        container.style.cursor = 'move';
      }
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const getStatusText = () => {
    if (message) return message;
    
    switch (status) {
      case "recording":
        return "录音中";
      case "processing":
        return "识别中";
      case "optimizing":
        return "AI优化中";
      case "completed":
        return "完成";
      case "error":
        return "错误";
      default:
        return "就绪";
    }
  };

  const getStatusClass = () => {
    switch (status) {
      case "recording":
        return "status-recording";
      case "processing":
        return "status-processing";
      case "completed":
        return "status-completed";
      case "error":
        return "status-error";
      default:
        return "";
    }
  };

  return (
    <div className="floating-ball-container">
      <div className="floating-ball-wrapper">
        <div className={`floating-ball ${getStatusClass()}`}>
          {status === "recording" ? (
            <div className="recording-indicator"></div>
          ) : (
            <svg className="ball-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          )}
        </div>
        <div className="text-container">
          <span className="status-label">{getStatusText()}</span>
          {realtimeText ? (
            <p className="recognized-text">{realtimeText}</p>
          ) : (
            <p className="placeholder-text">
              {status === "recording" ? "请说话..." : "按住 Caps Lock"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
