import React, { useState, useEffect } from "react";
import "./index.css";
import { toast, Toaster } from "sonner";
import { Settings, X, Loader2, Play, Circle } from "lucide-react";
import { usePermissions } from "./hooks/usePermissions";

const SettingsPage = () => {
  const [loading, setLoading] = useState(true);

  const showAlert = (alert) => {
    toast(alert.title, {
      description: alert.description,
      duration: 4000,
    });
  };

  const {
    micPermissionGranted,
    accessibilityPermissionGranted,
    requestMicPermission,
    testAccessibilityPermission,
  } = usePermissions(showAlert);

  useEffect(() => {
    setLoading(false);
  }, []);

  const handleActivateFloatingBall = async () => {
    if (window.electronAPI) {
      try {
        await window.electronAPI.showWindow();
        toast.success("悬浮球已激活");
      } catch (error) {
        toast.error("激活失败: " + error.message);
      }
    }
  };

  const handleClose = () => {
    if (window.electronAPI) {
      window.electronAPI.hideSettingsWindow();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="flex items-center space-x-3">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span className="text-gray-700 dark:text-gray-300">加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex flex-col">
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Settings className="w-5 h-5 text-blue-600" />
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 chinese-title">设置</h1>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-md mx-auto p-6 pb-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 mb-6">
            <div className="p-6">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 chinese-title mb-2">
                  激活悬浮球
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  点击下方按钮激活悬浮球，或按住 Caps Lock 键开始录音。
                </p>
              </div>
              
              <button
                onClick={handleActivateFloatingBall}
                className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-medium text-lg transition-all duration-200 flex items-center justify-center space-x-3 shadow-lg hover:shadow-xl"
              >
                <Play className="w-6 h-6" />
                <span>激活悬浮球</span>
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
            <div className="p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 chinese-title">
                  权限状态
                </h2>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  确保以下权限已授权。
                </p>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Circle className={`w-3 h-3 ${micPermissionGranted ? 'fill-green-500 text-green-500' : 'fill-red-500 text-red-500'}`} />
                    <span className="text-sm text-gray-700 dark:text-gray-300">麦克风权限</span>
                  </div>
                  <button
                    onClick={requestMicPermission}
                    className="text-xs px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                  >
                    测试
                  </button>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Circle className={`w-3 h-3 ${accessibilityPermissionGranted ? 'fill-green-500 text-green-500' : 'fill-red-500 text-red-500'}`} />
                    <span className="text-sm text-gray-700 dark:text-gray-300">辅助功能权限</span>
                  </div>
                  <button
                    onClick={testAccessibilityPermission}
                    className="text-xs px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                  >
                    测试
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              按住 Caps Lock 键开始录音，松开结束录音
            </p>
          </div>
        </div>
      </div>
      
      <Toaster position="top-center" />
    </div>
  );
};

export { SettingsPage };
