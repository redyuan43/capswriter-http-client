import React, { useState, useEffect, useRef, useCallback } from "react";
import "./floating-ball.css";
import { toast } from "sonner";
import { useRecording } from "./hooks/useRecording";
import { useModelStatus } from "./hooks/useModelStatus";

const SettingsPage = React.lazy(() => import('./settings.jsx').then(module => ({ default: module.SettingsPage })));

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const page = urlParams.get('page');
  
  if (page === 'settings') {
    return (
      <React.Suspense fallback={<div className="loading">加载设置页面...</div>}>
        <SettingsPage />
      </React.Suspense>
    );
  }

  const [realtimeText, setRealtimeText] = useState("");
  const [isCapsLockPressed, setIsCapsLockPressed] = useState(false);
  const [status, setStatus] = useState("idle");
  
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
        toast.success("文本已自动粘贴");
      } else {
        await navigator.clipboard.writeText(text);
        toast.info("文本已复制到剪贴板");
      }
    } catch (error) {
      console.error("粘贴失败:", error);
      toast.error("粘贴失败");
    }
  }, []);

  const handleRecordingComplete = useCallback(async (transcriptionResult) => {
    if (transcriptionResult.success && transcriptionResult.text) {
      setRealtimeText(transcriptionResult.text);
      setStatus("processing");
      toast.success("语音识别完成");
      
      // 直接粘贴识别结果，不等待 AI 优化
      await safePaste(transcriptionResult.text);
      setStatus("completed");
      toast.success("文本已粘贴");
      
      setTimeout(() => {
        setRealtimeText("");
        setStatus("idle");
      }, 1500);
    }
  }, [safePaste]);

  const handleAIOptimizationComplete = useCallback(async (optimizedResult) => {
    // 暂时禁用 AI 优化功能
    // if (optimizedResult.success && optimizedResult.enhanced_by_ai && optimizedResult.text) {
    //   setRealtimeText(optimizedResult.text);
    //   await safePaste(optimizedResult.text);
    //   setStatus("completed");
    //   toast.success("AI优化完成并已粘贴");
    //   setTimeout(() => {
    //     setRealtimeText("");
    //     setStatus("idle");
    //   }, 1500);
    // } else if (optimizedResult.success && optimizedResult.text) {
    //   await safePaste(optimizedResult.text);
    //   setStatus("completed");
    //   setTimeout(() => {
    //     setRealtimeText("");
    //     setStatus("idle");
    //   }, 1500);
    // }
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
      toast.warning("请先下载AI模型");
      return;
    }
    
    if (modelStatus.stage === 'downloading' || modelStatus.stage === 'loading') {
      toast.warning("模型正在加载中");
      return;
    }
    
    if (modelStatus.stage === 'error') {
      toast.error("模型错误");
      return;
    }
    
    if (!modelStatus.isReady) {
      toast.warning("模型未就绪");
      return;
    }

    setRealtimeText("");
    setStatus("recording");
    startRecording();
  }, [modelStatus, startRecording]);

  const stopRecordingWithCheck = useCallback(() => {
    if (isRecording) {
      setStatus("processing");
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
      toast.error(recordingError);
      setStatus("error");
      setTimeout(() => {
        setStatus("idle");
        setRealtimeText("");
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

  const getStatusText = () => {
    switch (status) {
      case "recording":
        return "正在录音...";
      case "processing":
        return "正在识别...";
      case "optimizing":
        return "AI优化中...";
      case "completed":
        return "完成！";
      case "error":
        return "错误";
      default:
        return "按住 Caps Lock 开始录音";
    }
  };

  const getStatusClass = () => {
    switch (status) {
      case "recording":
        return "status-recording";
      case "processing":
        return "status-processing";
      case "optimizing":
        return "status-optimizing";
      case "completed":
        return "status-completed";
      case "error":
        return "status-error";
      default:
        return "status-idle";
    }
  };

  return (
    <div className="floating-ball-container">
      <div className={`floating-panel ${getStatusClass()}`}>
        <div className="panel-header">
          <div className="status-indicator">
            {status === "recording" && (
              <div className="recording-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            )}
            {status === "processing" && (
              <div className="processing-spinner"></div>
            )}
            {status === "optimizing" && (
              <div className="ai-badge">AI</div>
            )}
          </div>
          <span className="status-text">{getStatusText()}</span>
        </div>
        
        <div className="text-display">
          {realtimeText ? (
            <p className="recognized-text">{realtimeText}</p>
          ) : (
            <p className="placeholder-text">
              {status === "recording" ? "请说话..." : "松开发送识别"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
