const { app, globalShortcut, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

// 闁诲海鏁搁崢褔宕ｉ崱娑樼睄闁靛鍎崇粻鍓佺磼閻欏懐纾块柟顔硷躬瀹?
const LogManager = require("./src/helpers/logManager");

// 闂佸憡甯楃换鍌烇綖閹版澘绀岄柡宥冨妽閿涘鐓崶顭戞畼妞ゆ挻鎮傞幃鍫曞幢濡や胶褰?
const logger = new LogManager();

const HEADLESS_MODE = process.env.QUQU_HEADLESS === '1';

// 濠电儑缍€椤曆勬叏閻愬搫绀傞柕濞垮劤濠€浼存⒑閹稿海鎳嗘い鏇樺€栧鍕礋椤撶喎鈧?
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

// 闁诲海鏁搁崢褔宕ｉ崱娑樼闁冲搫鍊搁·浣逛繆椤栨せ鍋撻搹顐淮
const EnvironmentManager = require("./src/helpers/environment");
const WindowManager = require("./src/helpers/windowManager");
const DatabaseManager = require("./src/helpers/database");
const ClipboardManager = require("./src/helpers/clipboard");
const FunASRManager = require("./src/helpers/funasrManager");
const TrayManager = require("./src/helpers/tray");
const HotkeyManager = require("./src/helpers/hotkeyManager");
const IPCHandlers = require("./src/helpers/ipcHandlers");

// 闁荤姳绀佹晶浠嬫偪閸℃稒鍋ㄩ柣鏂跨埣閻涙捇鏌ｅ搴＄仩妞わ絺澧TH
function setupProductionPath() {
  logger.info('闁荤姳绀佹晶浠嬫偪閸℃稒鍋ㄩ柣鏂跨埣閻涙捇鏌ｅ搴＄仩妞わ絺澧TH', {
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
      // 濠电儑缍€椤曆勬叏閻愬搫鍗抽柡澶嬪焾濡鏌涘▎妯虹仴闁稿繑锕㈤幆鍐礄閻柡hon闁荤姳璀﹂崹鎵?
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
      logger.info('PATH閻庡湱顭堝璺好洪崸妤€妫?, {
        濠电儑缍€椤曆勬叏閻愮儤鍎嶉柛鏇ㄥ枤閻斿懐鈧? pathsToAdd,
        闂佸搫鍊诲▍鍌綯H: newPath
      });
    } else {
      logger.info('PATH闂佸搫鍟版繛鈧繛鎾崇埣瀵鈧稒蓱閻撯偓闂佹寧绋戦張顒佹櫠瀹ュ瀚夊璺烘捣閻斿懐鈧灚婢樼€氼剟宕欓敍鍕ㄥ亾濞戞顏勶耿?);
    }
  } else if (process.platform === 'win32' && process.env.NODE_ENV !== 'development') {
    // Windows濡ょ姷鍋涢崯鑳亹閹绢喗鍎嶉柛鎴犳攻thon闁荤姳璀﹂崹鎵閻愬灚濯奸柛鎾楀懏鐎?
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
      logger.info('Windows PATH閻庡湱顭堝璺好洪崸妤€妫?, {
        濠电儑缍€椤曆勬叏閻愮儤鍎嶉柛鏇ㄥ枤閻斿懐鈧? pathsToAdd,
        闂佸搫鍊诲▍鍌綯H: newPath
      });
    }
  }
}

// 闂侀潻璐熼崝宀勫垂閸偅鍙忛悗锝庝簻椤曆呯磼閻欏懐纾块柟顔硷躬瀹曟娊濡搁妶鍥跺悈闂佸憡鎸哥粔鐑筋敊閺囩姷纾鹃柣銏犳箯TH
setupProductionPath();

// 闁荤姳绀佹晶浠嬫偪閸℃稒鍋ㄩ柕濠忕畱閻撴洟鏌℃担鍝勵暭鐎规挷绶氶幆鍕敊閼测晝协闂佺粯绮犻崹浼淬€傞妸鈺佺煑婵せ鍋撻柛锝嗘そ閺佸秶浠﹂懖鈺勭箲Python闂佺厧鐡ㄧ喊宥咃耿閻楀牊濯撮悹鎭掑妽閺?
process.env.ELECTRON_USER_DATA = app.getPath('userData');
logger.info('闁荤姳绀佹晶浠嬫偪閸℃稒鍋ㄩ柕濠忕畱閻撴洟鏌℃担鍝勵暭鐎规挷绶氶幆鍕敊閼测晝协闂佺粯绮犻崹浼淬€傞妸鈺佺煑婵せ鍋撻柛?, {
  ELECTRON_USER_DATA: process.env.ELECTRON_USER_DATA
});

// 闂佸憡甯楃换鍌烇綖閹版澘绀岄柡宥庡亽閸氣偓闂佽崵鍋涘Λ妤€鈻?
const environmentManager = new EnvironmentManager();
const windowManager = new WindowManager();
const databaseManager = new DatabaseManager();
const clipboardManager = new ClipboardManager(logger); // 婵炵鍋愭繛鈧柍褜鍓氭慨顡礸ger闁诲骸婀遍崑妯兼?
const funasrManager = new FunASRManager(logger); // 婵炵鍋愭繛鈧柍褜鍓氭慨顡礸ger闁诲骸婀遍崑妯兼?
const trayManager = new TrayManager();
const hotkeyManager = new HotkeyManager();

// 闂佸憡甯楃换鍌烇綖閹版澘绀岄柡宥冨妽濞堝爼鏌熺拠鈥虫灈缂?
const dataDirectory = environmentManager.ensureDataDirectory();
databaseManager.initialize(dataDirectory);

// 婵炶揪缍€濞夋洟寮妶澶婄闁逞屽墴瀵灚寰勫畝濠傛倎闂佽崵鍋涘Λ妤€鈻嶉幒妤€绀嗘繝闈涙－濞兼鏌涢弽銊︾PC婵犮垼娉涚€氼噣骞冩繝鍥ч棷?
const ipcHandlers = new IPCHandlers({
  environmentManager,
  databaseManager,
  clipboardManager,
  funasrManager,
  windowManager,
  hotkeyManager,
  logger, // 婵炵鍋愭繛鈧柍褜鍓氭慨顡礸ger闁诲骸婀遍崑妯兼?
});

// 婵炴垶鎹侀褏鑺遍弻銉﹀仺闁靛鍎查崕娆撴煕閺傝濡奸柛銈変憾瀵?
async function startApp() {
  logger.info('闁圭厧鐡ㄥ濠氬极閵堝瑙︽い鏍ㄨ壘琚熼悗娈垮枓閸嬫挸鈹?, {
    nodeEnv: process.env.NODE_ENV,
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    appVersion: app.getVersion(),\n    headless: HEADLESS_MODE
  });

  // 濠电偛顦崝鎴﹀闯閹绢喖绠?accessibility 闂佽　鍋撴い鏍ㄧ☉閻?- 闂佸憡鐟崹鐢稿礂濮椻偓閻涱噣宕ｆ径濠庢闂佸搫鍊稿ú锕€锕㈡导鏉戠闁圭儤鍨靛?
  // try {
  //   app.setAccessibilitySupportEnabled(true);
  //   logger.info('闂?閻庣懓鎲¤ぐ鍐箚鎼淬劍鍋?Electron accessibility 闂佽　鍋撴い鏍ㄧ☉閻?);
  // } catch (error) {
  //   logger.warn('闂佸疇娉曟刊瀵哥箔?闂佸憡鍑归崹鎶藉极?accessibility 闂佽　鍋撴い鏍ㄧ☉閻︻喖顭块幆鎵翱閻?', error.message);
  // }

  // 闁荤姳鐒﹀妯肩礊瀹ュ洤瀵查柤濮愬€楅崺鐘睬庨崶锝呭⒉濞?
  logger.info('缂備緡鍨靛畷鐢靛垝閻戞鈹嶉柍鈺佸暕缁?, logger.getSystemInfo());

  // 閻庢鍠掗崑鎾绘煕濞嗘劕鐏﹂懚鈺冣偓娈垮枛缁诲绮崨顓€搴ｆ嫚閹绘帩娼遍柣蹇撶箰缁绘劕鈻庨姀鈩冧氦闁绘梹妞块崬鈺抜te濠殿喗绻愮徊鍧楀灳濮椻偓瀹曘儵顢涘顑?
  if (process.env.NODE_ENV === "development") {
    logger.info('閻庢鍠掗崑鎾绘煕濞嗘劕鐏﹂懚鈺冣偓娈垮枛妤犲繒妲愬┑鍫㈤┏濠㈣泛锕︾粣顡渋te闂佸憡鍑归崹鐗堟叏?..');
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // 缂佺虎鍙庨崰鏇犳崲濮濈敘cOS婵炴垶鎸搁妶绌檆k闂佸憡鐟崹鐢革綖?
  if (process.platform === 'darwin' && app.dock) {
    app.dock.show();
    logger.info('macOS Dock閻庡湱顭堝璺何熸径宀€鐭?);
  }

  // 闂侀潻璐熼崝宀勫箚鎼淬劌绀夐柕濠忛檮椤ρ囨煕閹烘挾绠撴い顐ｅ姍瀹曠娀寮靛鏉桝SR缂備胶濯寸槐鏇㈠箖婵犲洤闂い顓熷笧缁€鍕槈閹惧磭肖闁烩剝鍨甸銉╁川椤戣法闉嶉梻渚囧墮閻忔繈宕㈤妶澶嬧挀閻犲洤妯婇弫姘舵煥?
  logger.info('閻庢鍠掗崑鎾斥攽椤旂⒈鍎忛柛銊ョ仛閹便劎鈧綆浜滈顪寀nASR缂備胶濯寸槐鏇㈠箖婵犲洤闂?..');
  funasrManager.initializeAtStartup().catch((err) => {
    logger.warn("FunASR闂侀潻璐熼崝宀勫箚鎼淬劌绀夐柕濠忛檮椤ρ冣槈閹惧磭孝鐟滅増鐓￠幃浠嬧€﹂幒鏃傤槷闁哄鏅滈悷銈囩箔婢舵劕鍙婃い鏍ㄨ壘瑜扮娀姊哄▎鎯ф珝婵☆偉鍩栭敍?, err);
  });

  // 闂佸憡甯楃粙鎴犵磽閹惧鈻旈柤濮愬€楀畷鍫曟煕?
  try {
    logger.info('闂佸憡甯楃粙鎴犵磽閹惧鈻旈柤濮愬€楀畷鍫曟煕?..');
    await windowManager.createMainWindow();
    logger.info('婵炴垶鎹佸畷鐢告偘閵夆晛鐭楅柨婵嗘噹閻忥紕鈧偣鍊楅崕銈夊垂濮樿泛绀?);
  } catch (error) {
    logger.error("闂佸憡甯楃粙鎴犵磽閹惧鈻旈柤濮愬€楀畷鍫曟煕濞嗘瑧绋绘俊鐐插€垮畷娆徝洪鍛珦:", error);
  }

  // 闂佸憡甯楃粙鎴犵磽閹捐绠崇憸宥夊春濡ゅ懏顥堥柕蹇婂墲缁惰尙绱掗幇顓ф當鐟?
  if (HEADLESS_MODE) {
    logger.info('Headless 模式，跳过控制面板窗口创建');
  } else {
    try {
      logger.info('闂佸憡甯楃粙鎴犵磽閹捐绠崇憸宥夊春濡ゅ懏顥堥柕蹇婂墲缁惰尙绱掗幇顓ф當鐟?..');
      await windowManager.createControlPanelWindow();
      logger.info('闂佺鐭囬崘銊у幀闂傚倸鐗勯崹鍝勵熆濡偐鐜绘俊銈傚亾鐟滅増鐩畷姘槈濡偐澶勯梺鐟扮摠閸旀洘鎱?);
    } catch (error) {
      logger.error("闂佸憡甯楃粙鎴犵磽閹捐绠崇憸宥夊春濡ゅ懏顥堥柕蹇婂墲缁惰尙绱掗幇顓ф當鐟滅増鐩顔炬崉閸濆嫭鐦旈梻?", error);
    }
  }

  // 闁荤姳绀佹晶浠嬫偪閸℃稑绠ユ俊顖氬悑绾?
  logger.info('闁荤姳绀佹晶浠嬫偪閸℃瑥瀵查柤濮愬€楅崺鐘绘煙閸偒鐒芥繛?..');
  trayManager.setWindows(
    windowManager.mainWindow,
    windowManager.controlPanelWindow
  );
  trayManager.setCreateControlPanelCallback(() =>
    windowManager.createControlPanelWindow()
  );
  await trayManager.createTray();
  logger.info('缂備緡鍨靛畷鐢靛垝濞差亜绠ユ俊顖氬悑绾炬悂鎮规担绋库挃闁汇倕妫涢埀顒傛嚀閺堫剟宕?);

  logger.info('闁圭厧鐡ㄥ濠氬极閵堝瑙︽い鏍ㄨ壘琚熼柣搴ｆ嚀閺堫剟宕?);
}

// 闁圭厧鐡ㄥ濠氬极閵堝棛顩查悗锝傛櫆椤愯棄顭跨捄鍝勵伀闁诡喖锕畷?
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

// 闁诲海鏁搁崢褔宕甸鐘典笉闁挎稑瀚崐鐐烘煕閿濆啫濡虹紒鍓佹暬瀹曟寮甸悽鐢告惃濠碘槅鍨埀顒冩珪閸嬨儱霉閿濆牊纭堕柡?
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
