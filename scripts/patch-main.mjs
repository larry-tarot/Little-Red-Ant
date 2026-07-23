const fs = require('fs');
let content = fs.readFileSync('electron/main.ts', 'utf-8');

// Find the production branch (between the else and the log.info)
const prodStart = content.indexOf('} else {');
const prodEnd = content.indexOf("log.info(`[Backend] 启动:");
const prodBranch = content.slice(prodStart, prodEnd);

const newProdBranch = `  } else {
      // 生产:直接在 Electron 主进程中 import 后端代码
      // 主进程有 asar 集成,后端可以正常读取 asar 内的文件
      log.info("[Backend] 在主进程中加载后端...");
      try {
        const backendEntry = path.join(process.resourcesPath, "api-dist", "server.mjs");
        // 设置环境变量
        process.env.PORT = String(BACKEND_PORT);
        process.env.NODE_ENV = "production";
        process.env.XIAOHONGYI_USER_DATA = app.getPath("userData");

        await import(backendEntry);
        backendReady = true;
        backendProcess = null;
        log.info("[Backend] 后端就绪");
        return;
      } catch (e) {
        const msg = "后端加载失败: " + (e instanceof Error ? e.message : String(e));
        log.error("[Backend] " + msg);
        backendCrashed = true;
        if (mainWindow) {
          dialog.showErrorBox("后端服务异常", msg + "\\n请重启应用或联系开发者。");
          app.quit();
        }
        // 兜底: 15s 后超时
        await new Promise(resolve => setTimeout(resolve, 15000));
      }
    }`;

content = content.replace(prodBranch, newProdBranch);
fs.writeFileSync('electron/main.ts', content, 'utf-8');
console.log('Replaced production branch');