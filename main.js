const { app, globalShortcut, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

// Initialize log manager
const LogManager = require("./src/helpers/logManager");

// Create logger instance
const logger = new LogManager();

const HEADLESS_MODE = process.env.QUQU_HEADLESS === '1';

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  if (error.code === "EPIPE") {
    return;
  }
  logger.error("Error stack:", error.stack);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", { promise, reason });
});

// Import managers
const EnvironmentManager = require("./src/helpers/environment");
const WindowManager = require("./src/helpers/windowManager");
const DatabaseManager = require("./src/helpers/database");
const ClipboardManager = require("./src/helpers/clipboard");
const FunASRManager = require("./src/helpers/funasrManager");
const TrayManager = require("./src/helpers/tray");
const HotkeyManager = require("./src/helpers/hotkeyManager");
const IPCHandlers = require("./src/helpers/ipcHandlers");
const CapsLockListener = require("./src/helpers/capsLockListener");

// Setup production PATH for Python
function setupProductionPath() {
  logger.info('Setting up production PATH', {
    platform: process.platform,
    nodeEnv: process.env.NODE_ENV,
    currentPath: process.env.PATH
  });

  if (process.platform === 'darwin' && process.env.NODE_ENV !== 'development') {
    const commonPaths = [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
      '/Library/Frameworks/Python.framework/Versions/3.12/bin',
      '/Library/Frameworks/Python.framework/Versions/3.11/bin',
      '/Library/Frameworks/Python.framework/Versions/3.10/bin',
      '/Library/Frameworks/Python.framework/Versions/3.9/bin',
      '/Library/Frameworks/Python.framework/Versions/3.8/bin',
      // Homebrew Python paths
      '/opt/homebrew/opt/python@3.11/bin',
      '/opt/homebrew/opt/python@3.10/bin',
      '/opt/homebrew/opt/python@3.9/bin',
      '/usr/local/opt/python@3.11/bin',
      '/usr/local/opt/python@3.10/bin',
      '/usr/local/opt/python@3.9/bin'
    ];
    
    const currentPath = process.env.PATH || '';
    const pathsToAdd = commonPaths.filter(p => !currentPath.includes(p));
    
    if (pathsToAdd.length > 0) {
      const newPath = `${currentPath}:${pathsToAdd.join(':')}`;
      process.env.PATH = newPath;
      logger.info('PATH updated', {
        addedPaths: pathsToAdd,
        newPath: newPath
      });
    } else {
      logger.info('PATH already contains all required paths');
    }
  } else if (process.platform === 'win32' && process.env.NODE_ENV !== 'development') {
    // Windows Python paths
    const commonPaths = [
      'C:\\Python311\\Scripts',
      'C:\\Python311',
      'C:\\Python310\\Scripts',
      'C:\\Python310',
      'C:\\Python39\\Scripts',
      'C:\\Python39',
      'C:\\Users\\' + require('os').userInfo().username + '\\AppData\\Local\\Programs\\Python\\Python311\\Scripts',
      'C:\\Users\\' + require('os').userInfo().username + '\\AppData\\Local\\Programs\\Python\\Python311',
      'C:\\Users\\' + require('os').userInfo().username + '\\AppData\\Local\\Programs\\Python\\Python310\\Scripts',
      'C:\\Users\\' + require('os').userInfo().username + '\\AppData\\Local\\Programs\\Python\\Python310'
    ];
    
    const currentPath = process.env.PATH || '';
    const pathsToAdd = commonPaths.filter(p => !currentPath.includes(p));
    
    if (pathsToAdd.length > 0) {
      const newPath = `${currentPath};${pathsToAdd.join(';')}`;
      process.env.PATH = newPath;
      logger.info('Windows PATH updated', {
        addedPaths: pathsToAdd,
        newPath: newPath
      });
    }
  }
}

// Call setup before initialization
setupProductionPath();

// Set ELECTRON_USER_DATA for Python subprocess
process.env.ELECTRON_USER_DATA = app.getPath('userData');
logger.info('ELECTRON_USER_DATA set', {
  ELECTRON_USER_DATA: process.env.ELECTRON_USER_DATA
});

// Initialize managers
const environmentManager = new EnvironmentManager();
const windowManager = new WindowManager();
const databaseManager = new DatabaseManager();
const clipboardManager = new ClipboardManager(logger);
const funasrManager = new FunASRManager(logger);
const trayManager = new TrayManager();
const hotkeyManager = new HotkeyManager();
const capsLockListener = new CapsLockListener(logger);

// Ensure data directory and initialize database
const dataDirectory = environmentManager.ensureDataDirectory();
databaseManager.initialize(dataDirectory);

// Setup IPC handlers
const ipcHandlers = new IPCHandlers({
  environmentManager,
  databaseManager,
  clipboardManager,
  funasrManager,
  windowManager,
  hotkeyManager,
  logger,
});

// Main app startup function
async function startApp() {
  logger.info('Application starting', {
    nodeEnv: process.env.NODE_ENV,
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    appVersion: app.getVersion(),
    headless: HEADLESS_MODE
  });

  // Log system info
  logger.info('System info', logger.getSystemInfo());

  // Wait for Vite dev server in development
  if (process.env.NODE_ENV === "development") {
    logger.info('Development mode, waiting for Vite...');
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Show dock on macOS
  if (process.platform === 'darwin' && app.dock) {
    app.dock.show();
    logger.info('macOS Dock shown');
  }

  // Initialize FunASR manager
  logger.info('Initializing FunASR manager...');
  funasrManager.initializeAtStartup().catch((err) => {
    logger.warn("FunASR initialization failed, will retry on demand", err);
  });

  // Create main window
  try {
    logger.info('Creating main window...');
    await windowManager.createMainWindow();
    logger.info('Main window created successfully');
  } catch (error) {
    logger.error("Failed to create main window:", error);
  }

  // Create control panel window
  if (HEADLESS_MODE) {
    logger.info('Headless mode, skipping control panel window creation');
  } else {
    try {
      logger.info('Creating control panel window...');
      await windowManager.createControlPanelWindow();
      logger.info('Control panel window created successfully');
    } catch (error) {
      logger.error("Failed to create control panel window:", error);
    }
  }

  // Create system tray
  logger.info('Creating system tray...');
  trayManager.setWindows(
    windowManager.mainWindow,
    windowManager.controlPanelWindow
  );
  trayManager.setCreateControlPanelCallback(() =>
    windowManager.createControlPanelWindow()
  );
  await trayManager.createTray();
  logger.info('System tray created successfully');

  // Setup Caps Lock listener
  logger.info('Setting up Caps Lock listener...');
  capsLockListener.setOnCapsLockDown(() => {
    logger.info('Caps Lock pressed - showing floating ball and starting recording');
    windowManager.showFloatingBall();
    if (windowManager.mainWindow) {
      windowManager.mainWindow.webContents.send('caps-lock-down');
    }
  });

  capsLockListener.setOnCapsLockUp(() => {
    logger.info('Caps Lock released - hiding floating ball and stopping recording');
    if (windowManager.mainWindow) {
      windowManager.mainWindow.webContents.send('caps-lock-up');
    }
    setTimeout(() => {
      windowManager.hideFloatingBall();
    }, 2000);
  });

  capsLockListener.start();
  logger.info('Caps Lock listener started');

  logger.info('Application startup complete');
}

// App ready handler
app.whenReady().then(() => {
  startApp();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    windowManager.createMainWindow();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

// Export managers for external use
module.exports = {
  environmentManager,
  windowManager,
  databaseManager,
  clipboardManager,
  funasrManager,
  trayManager,
  hotkeyManager,
  logger
};
