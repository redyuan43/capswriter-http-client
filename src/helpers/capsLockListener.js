const { uIOhook, UiohookKey } = require('uiohook-napi');

class CapsLockListener {
  constructor(logger = null) {
    this.logger = logger;
    this.isCapsLockPressed = false;
    this.onCapsLockDown = null;
    this.onCapsLockUp = null;
    this.isListening = false;
  }

  start() {
    if (this.isListening) {
      if (this.logger && this.logger.info) {
        this.logger.info('Caps Lock 监听器已经在运行');
      }
      return;
    }

    try {
      uIOhook.on('keydown', (e) => {
        if (e.keycode === UiohookKey.CapsLock) {
          if (!this.isCapsLockPressed) {
            this.isCapsLockPressed = true;
            if (this.logger && this.logger.info) {
              this.logger.info('Caps Lock 按下, keycode:', e.keycode);
            }
            if (this.onCapsLockDown) {
              this.onCapsLockDown();
            }
          }
        }
      });

      uIOhook.on('keyup', (e) => {
        if (e.keycode === UiohookKey.CapsLock) {
          if (this.isCapsLockPressed) {
            this.isCapsLockPressed = false;
            if (this.logger && this.logger.info) {
              this.logger.info('Caps Lock 松开, keycode:', e.keycode);
            }
            if (this.onCapsLockUp) {
              this.onCapsLockUp();
            }
          }
        }
      });

      uIOhook.start();
      this.isListening = true;
      
      if (this.logger && this.logger.info) {
        this.logger.info('Caps Lock 监听器已启动');
      }
    } catch (error) {
      if (this.logger && this.logger.error) {
        this.logger.error('Caps Lock 监听器启动失败:', error);
      }
    }
  }

  stop() {
    if (this.isListening) {
      try {
        uIOhook.stop();
        this.isListening = false;
        
        if (this.logger && this.logger.info) {
          this.logger.info('Caps Lock 监听器已停止');
        }
      } catch (error) {
        if (this.logger && this.logger.error) {
          this.logger.error('Caps Lock 监听器停止失败:', error);
        }
      }
    }
  }

  setOnCapsLockDown(callback) {
    this.onCapsLockDown = callback;
  }

  setOnCapsLockUp(callback) {
    this.onCapsLockUp = callback;
  }

  getIsCapsLockPressed() {
    return this.isCapsLockPressed;
  }
}

module.exports = CapsLockListener;
