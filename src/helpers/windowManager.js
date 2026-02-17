const { BrowserWindow } = require("electron");
const path = require("path");

const isHeadless = process.env.QUQU_HEADLESS === '1';

class WindowManager {
  constructor() {
    this.mainWindow = null;
    this.controlPanelWindow = null;
    this.historyWindow = null;
    this.settingsWindow = null;
    this.isHeadless = isHeadless;
  }

  async createMainWindow() {
    if (this.mainWindow) {
      this.mainWindow.focus();
      this.mainWindow.show();
      return this.mainWindow;
    }

    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    this.mainWindow = new BrowserWindow({
      width: 300,
      height: 100,
      x: width - 340,
      y: height - 140,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      movable: true,
      show: false,
      title: 'CapsWriter 悬浮球',
      focusable: true,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
        preload: path.join(__dirname, "..", "..", "preload.js"),
      },
    });

    if (this.isHeadless) {
      this.mainWindow.setAlwaysOnTop(false);
    }

    const isDev = process.env.NODE_ENV === "development";

    try {
      if (isDev) {
        await this.mainWindow.loadURL("http://localhost:5173");
        console.log('Main window loaded URL: http://localhost:5173');
      } else {
        await this.mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
        console.log('Main window loaded file');
      }
    } catch (loadError) {
      console.error('Failed to load main window:', loadError);
    }

    // 监听页面加载完成事件
    this.mainWindow.webContents.on('did-finish-load', () => {
      console.log('Main window finished loading');
    });

    this.mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Main window failed to load:', errorCode, errorDescription);
    });

    // 悬浮球默认隐藏，按 Caps Lock 时才显示
    // this.mainWindow.show();
    // this.mainWindow.focus();

    if (isDev) {
      this.mainWindow.webContents.openDevTools({ mode: 'detach' });
      console.log('DevTools opened');
    }

    this.mainWindow.on("closed", () => {
      this.mainWindow = null;
    });

    return this.mainWindow;
  }

  showFloatingBall() {
    if (this.mainWindow) {
      const { screen } = require('electron');
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.workAreaSize;
      
      // 确保窗口在屏幕右下角
      this.mainWindow.setPosition(width - 340, height - 140);
      this.mainWindow.show();
      this.mainWindow.focus();
      this.mainWindow.moveTop();
      console.log('Floating ball shown at position:', width - 340, height - 140);
    }
  }

  hideFloatingBall() {
    if (this.mainWindow) {
      this.mainWindow.hide();
      console.log('Floating ball hidden');
    }
  }

  async createControlPanelWindow() {
    if (this.isHeadless) {
      return null;
    }

    if (this.controlPanelWindow) {
      this.controlPanelWindow.focus();
      return this.controlPanelWindow;
    }

    this.controlPanelWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "..", "..", "preload.js"),
      },
    });

    const isDev = process.env.NODE_ENV === "development";

    if (isDev) {
      await this.controlPanelWindow.loadURL("http://localhost:5173?panel=control");
    } else {
      await this.controlPanelWindow.loadFile(
        path.join(__dirname, "..", "dist", "index.html"),
        { query: { panel: "control" } }
      );
    }

    this.controlPanelWindow.on("closed", () => {
      this.controlPanelWindow = null;
    });

    return this.controlPanelWindow;
  }

  async createHistoryWindow() {
    if (this.historyWindow) {
      this.historyWindow.focus();
      return this.historyWindow;
    }

    this.historyWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      show: false,
      title: "转录历史 - 蛐蛐",
      alwaysOnTop: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "..", "..", "preload.js"),
      },
    });

    const isDev = process.env.NODE_ENV === "development";

    if (isDev) {
      await this.historyWindow.loadURL("http://localhost:5173/history.html");
    } else {
      await this.historyWindow.loadFile(
        path.join(__dirname, "..", "dist", "history.html")
      );
    }

    this.historyWindow.on("closed", () => {
      this.historyWindow = null;
    });

    return this.historyWindow;
  }

  async createSettingsWindow() {
    if (this.settingsWindow) {
      this.settingsWindow.focus();
      return this.settingsWindow;
    }

    this.settingsWindow = new BrowserWindow({
      width: 700,
      height: 600,
      show: false,
      title: "设置 - 蛐蛐",
      alwaysOnTop: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "..", "..", "preload.js"),
      },
    });

    const isDev = process.env.NODE_ENV === "development";

    if (isDev) {
      await this.settingsWindow.loadURL("http://localhost:5173?page=settings");
    } else {
      await this.settingsWindow.loadFile(
        path.join(__dirname, "..", "dist", "settings.html")
      );
    }

    this.settingsWindow.on("closed", () => {
      this.settingsWindow = null;
    });

    return this.settingsWindow;
  }

  showControlPanel() {
    if (this.controlPanelWindow) {
      this.controlPanelWindow.show();
      this.controlPanelWindow.focus();
    } else {
      this.createControlPanelWindow().then(() => {
        this.controlPanelWindow.show();
      });
    }
  }

  hideControlPanel() {
    if (this.controlPanelWindow) {
      this.controlPanelWindow.hide();
    }
  }

  showHistoryWindow() {
    if (this.historyWindow) {
      this.historyWindow.show();
      this.historyWindow.focus();
      this.historyWindow.setAlwaysOnTop(true);
    } else {
      this.createHistoryWindow().then(() => {
        this.historyWindow.show();
        this.historyWindow.focus();
        this.historyWindow.setAlwaysOnTop(true);
      });
    }
  }

  hideHistoryWindow() {
    if (this.historyWindow) {
      this.historyWindow.hide();
    }
  }

  closeHistoryWindow() {
    if (this.historyWindow) {
      this.historyWindow.close();
    }
  }

  showSettingsWindow() {
    if (this.settingsWindow) {
      this.settingsWindow.show();
      this.settingsWindow.focus();
      this.settingsWindow.setAlwaysOnTop(true);
    } else {
      this.createSettingsWindow().then(() => {
        this.settingsWindow.show();
        this.settingsWindow.focus();
        this.settingsWindow.setAlwaysOnTop(true);
      });
    }
  }

  hideSettingsWindow() {
    if (this.settingsWindow) {
      this.settingsWindow.hide();
    }
  }

  closeSettingsWindow() {
    if (this.settingsWindow) {
      this.settingsWindow.close();
    }
  }

  closeAllWindows() {
    if (this.mainWindow) {
      this.mainWindow.close();
    }
    if (this.controlPanelWindow) {
      this.controlPanelWindow.close();
    }
    if (this.historyWindow) {
      this.historyWindow.close();
    }
    if (this.settingsWindow) {
      this.settingsWindow.close();
    }
  }
}

module.exports = WindowManager;
