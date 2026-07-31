// 小红蚁桌面版 - Tauri 2 入口
//
// 架构:
// 1. 启动 Node sidecar (Node 二进制 + api-dist/server.cjs + node_modules)
// 2. 等后端 listen 端口 (健康检查 127.0.0.1:14753)
// 3. 双源架构: WebView 加载 tauri://localhost/ (前端 dist), API 到 http://127.0.0.1:14753
// 4. 系统托盘: 关闭窗口 → 最小化到托盘, 托盘菜单: 显示/隐藏/退出
// 5. Sidecar 看门狗: 崩溃后自动重启 (最多 3 次, 指数退避)
// 6. 数据写入 %APPDATA%/小红蚁/ (通过 XIAOHONGYI_USER_DATA 环境变量注入)
// 7. 数据库备份: 自动每日备份 + 手动触发

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, State,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::mpsc::Receiver as TokioReceiver;

const BACKEND_PORT: u16 = 14753;
const BACKEND_URL: &str = "http://127.0.0.1:14753";
const HEALTH_URL: &str = "http://127.0.0.1:14753/api/health";
const MAX_RESTART_ATTEMPTS: u8 = 3;

/// 存放 sidecar 子进程句柄, 关闭时 kill
struct SidecarState {
    child: Mutex<Option<CommandChild>>,
}

/// 跟踪重启次数 (sidecar 看门狗)
struct RestartCounter {
    count: AtomicU8,
}

#[derive(Debug, Serialize, Deserialize)]
struct HealthResponse {
    status: String,
}

/// 等后端 listen 端口, 最多 30s
async fn wait_for_backend() -> Result<(), String> {
    for i in 0..60 {
        match reqwest::get(HEALTH_URL).await {
            Ok(resp) if resp.status().is_success() => {
                println!("[Tauri] 后端已就绪 ({} 次尝试)", i + 1);
                return Ok(());
            }
            _ => {
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        }
    }
    Err("后端 30 秒内未响应".to_string())
}

/// 启动 sidecar 并返回 rx + child
fn spawn_sidecar(
    app: &tauri::AppHandle,
    api_entry: &std::path::Path,
    api_dir: &std::path::Path,
    user_data_str: &str,
) -> Result<
    (
        TokioReceiver<CommandEvent>,
        CommandChild,
    ),
    String,
> {
    let shell = app.shell();
    let sidecar_command = shell
        .sidecar("xiaohongyi-backend")
        .map_err(|e| format!("找不到 sidecar binary: {}", e))?
        .args(&[api_entry.to_string_lossy().to_string()])
        .current_dir(api_dir)
        .env("XIAOHONGYI_USER_DATA", user_data_str)
        .env("PORT", BACKEND_PORT.to_string())
        .env("NODE_ENV", "production");

    let (rx, child) = sidecar_command
        .spawn()
        .map_err(|e| format!("启动 sidecar 失败: {}", e))?;

    Ok((rx, child))
}

// ==================== Tauri 命令 ====================

/// 从嵌入式 PNG 数据创建 Tauri Image
fn load_png_icon(data: &[u8]) -> Result<Image<'static>, String> {
    let img = image::load_from_memory(data)
        .map_err(|e| format!("图片解码失败: {}", e))?;
    let rgba = img.into_rgba8();
    let (width, height) = rgba.dimensions();
    Ok(Image::new_owned(rgba.into_vec(), width, height))
}

#[tauri::command]
fn get_backend_url() -> String {
    BACKEND_URL.to_string()
}

#[tauri::command]
async fn check_backend_health() -> Result<HealthResponse, String> {
    match reqwest::get(HEALTH_URL).await {
        Ok(resp) if resp.status().is_success() => Ok(HealthResponse {
            status: "ok".to_string(),
        }),
        Ok(resp) => Err(format!("后端返回 {}", resp.status())),
        Err(e) => Err(format!("后端不可达: {}", e)),
    }
}

/// 数据库备份
#[tauri::command]
async fn backup_database(app: tauri::AppHandle) -> Result<String, String> {
    let user_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取 userData 失败: {}", e))?;
    let db_path = user_data.join("data").join("app.db");
    if !db_path.exists() {
        return Err("数据库文件不存在".to_string());
    }

    let backup_dir = user_data.join("backups");
    std::fs::create_dir_all(&backup_dir).map_err(|e| format!("创建备份目录失败: {}", e))?;

    let now = chrono::Local::now();
    let timestamp = now.format("%Y%m%d_%H%M%S");
    let backup_path = backup_dir.join(format!("app.db.{}", timestamp));

    std::fs::copy(&db_path, &backup_path).map_err(|e| format!("备份失败: {}", e))?;

    // 清理旧备份 (保留最近 7 天)
    cleanup_old_backups(&backup_dir, 7);

    println!("[Tauri] 数据库已备份到: {:?}", backup_path);
    Ok(backup_path.to_string_lossy().to_string())
}

fn cleanup_old_backups(dir: &std::path::Path, keep_days: u64) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        let cutoff = chrono::Local::now() - chrono::Duration::days(keep_days as i64);
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_file() {
                    if let Ok(modified) = metadata.modified() {
                        let modified: chrono::DateTime<chrono::Local> = modified.into();
                        if modified < cutoff {
                            let _ = std::fs::remove_file(entry.path());
                            println!("[Tauri] 清理旧备份: {:?}", entry.path());
                        }
                    }
                }
            }
        }
    }
}

/// 列出所有备份文件
#[tauri::command]
fn list_backups(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let user_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取 userData 失败: {}", e))?;
    let backup_dir = user_data.join("backups");
    if !backup_dir.exists() {
        return Ok(Vec::new());
    }

    let mut backups = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&backup_dir) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_file() {
                    let size = metadata.len();
                    if let Ok(modified) = metadata.modified() {
                        let modified: chrono::DateTime<chrono::Local> = modified.into();
                        let modified_str = modified.format("%Y-%m-%d %H:%M:%S").to_string();
                        backups.push(serde_json::json!({
                            "name": entry.file_name().to_string_lossy().to_string(),
                            "size": size,
                            "modified": modified_str,
                            "path": entry.path().to_string_lossy().to_string(),
                        }));
                    }
                }
            }
        }
    }
    // 按修改时间降序
    backups.sort_by(|a, b| {
        let a_t = a["modified"].as_str().unwrap_or("");
        let b_t = b["modified"].as_str().unwrap_or("");
        b_t.cmp(a_t)
    });

    Ok(backups)
}

/// 从备份文件恢复数据库
///
/// 安全约束: 只允许恢复位于 userData/backups 目录下的备份文件,
/// 防止前端传入 ../../../ 等路径导致路径遍历。
#[tauri::command]
fn restore_backup(path: String, app: tauri::AppHandle) -> Result<(), String> {
    let backup_path = std::path::PathBuf::from(&path);
    if !backup_path.exists() {
        return Err("备份文件不存在".to_string());
    }

    let user_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取 userData 失败: {}", e))?;
    let db_path = user_data.join("data").join("app.db");
    let backup_dir = user_data.join("backups");

    // 路径遍历防护: 将传入路径与 backups 目录都规范化为绝对路径后比较前缀
    let canonical_backup = backup_path
        .canonicalize()
        .map_err(|e| format!("无法解析备份路径: {}", e))?;
    let canonical_backup_dir = backup_dir
        .canonicalize()
        .unwrap_or_else(|_| backup_dir.clone());

    if !canonical_backup.starts_with(&canonical_backup_dir) {
        eprintln!(
            "[Tauri] 拒绝恢复 backups 目录外的文件: {:?}",
            canonical_backup
        );
        return Err("非法的备份路径".to_string());
    }

    std::fs::copy(&canonical_backup, &db_path).map_err(|e| format!("恢复失败: {}", e))?;
    println!("[Tauri] 已从 {:?} 恢复数据库", canonical_backup);

    Ok(())
}

/// 获取应用信息
#[derive(Debug, Serialize)]
struct AppInfo {
    version: String,
    platform: String,
    arch: String,
    backend_port: u16,
    user_data_dir: String,
}

#[tauri::command]
fn get_app_info(app: tauri::AppHandle) -> AppInfo {
    let user_data = app
        .path()
        .app_data_dir()
        .map(|d| d.to_string_lossy().to_string())
        .unwrap_or_default();
    AppInfo {
        version: "1.0.0".to_string(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        backend_port: BACKEND_PORT,
        user_data_dir: user_data,
    }
}

/// 手动重启后端 (给前端"重启后端"按钮使用)
#[tauri::command]
fn restart_backend(app: tauri::AppHandle) -> Result<(), String> {
    // 重置重启计数器
    let counter: State<RestartCounter> = app.state();
    counter.count.store(0, Ordering::SeqCst);
    // kill sidecar, 看门狗会自动重启
    kill_sidecar(&app);
    println!("[Tauri] 手动重启后端");
    Ok(())
}

// ==================== 系统托盘 ====================

fn setup_tray(app: &tauri::AppHandle) {
    let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>).unwrap();
    let hide = MenuItem::with_id(app, "hide", "隐藏主窗口", true, None::<&str>).unwrap();
    let separator = PredefinedMenuItem::separator(app).unwrap();
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>).unwrap();

    let menu = Menu::with_items(app, &[&show, &hide, &separator, &quit]).unwrap();

    // 托盘图标: 优先使用专用图标, 回退到 32x32 图标
    let tray_icon = load_png_icon(include_bytes!("../icons/tray-icon.png"))
        .or_else(|_| load_png_icon(include_bytes!("../icons/32x32.png")))
        .expect("无法加载托盘图标");

    let _tray = TrayIconBuilder::new()
        .icon(tray_icon)
        .menu(&menu)
        .tooltip("小红蚁 - AI 智能小红书运营助手")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            "quit" => {
                kill_sidecar(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { .. } = event {
                // 左键单击切换窗口显示/隐藏
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app);

    if let Err(e) = _tray {
        eprintln!("[Tauri] 创建托盘失败: {}", e);
    }
}

// ==================== Sidecar 生命周期 ====================

fn kill_sidecar(app: &tauri::AppHandle) {
    let state: State<SidecarState> = app.state();
    let mut guard = state.child.lock().unwrap();
    if let Some(child) = guard.take() {
        println!("[Tauri] kill sidecar");
        let _ = child.kill();
    }
}

/// 启动 sidecar 并附加看门狗监听
fn start_sidecar_with_watchdog(app: &tauri::AppHandle, user_data_str: &str) {
    let app_handle = app.clone();
    let user_data = user_data_str.to_string();

    // 解析 sidecar 入口路径
    let api_entry = match app
        .path()
        .resolve("api-dist/server.cjs", tauri::path::BaseDirectory::Resource)
    {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[Tauri] 找不到 api-dist/server.cjs: {}", e);
            let _ = app.emit("backend-error", "api-dist/server.cjs 未找到, 请重新安装应用".to_string());
            return;
        }
    };

    let api_dir = match api_entry.parent() {
        Some(d) => d.to_path_buf(),
        None => {
            eprintln!("[Tauri] api_entry 没有父目录");
            let _ = app.emit("backend-error", "资源目录结构异常".to_string());
            return;
        }
    };

    // 验证 sidecar 入口文件存在
    if !api_entry.exists() {
        eprintln!("[Tauri] api-dist/server.cjs 文件不存在: {:?}", api_entry);
        let _ = app.emit("backend-error", "后端入口文件缺失, 请重新安装应用".to_string());
        return;
    }

    println!("[Tauri] sidecar 入口: {:?}", api_entry);
    println!("[Tauri] sidecar cwd:  {:?}", api_dir);

    // 启动 sidecar
    let (rx, child) = match spawn_sidecar(app, &api_entry, &api_dir, &user_data) {
        Ok((rx, child)) => (rx, child),
        Err(e) => {
            eprintln!("[Tauri] {}", e);
            let _ = app.emit("backend-error", e);
            return;
        }
    };

    // 保存子进程句柄
    let state: State<SidecarState> = app.state();
    *state.child.lock().unwrap() = Some(child);

    let app_handle_watchdog = app_handle.clone();
    let user_data_clone = user_data.clone();

    // 异步监听 sidecar 事件 (看门狗)
    tauri::async_runtime::spawn(async move {
        let mut rx = rx;
        loop {
            let event = rx.recv().await;
            match event {
                Some(CommandEvent::Stdout(line)) => {
                    println!("[Sidecar] {}", String::from_utf8_lossy(&line));
                }
                Some(CommandEvent::Stderr(line)) => {
                    eprintln!("[Sidecar] {}", String::from_utf8_lossy(&line));
                }
                Some(CommandEvent::Error(err)) => {
                    eprintln!("[Sidecar error] {}", err);
                }
                Some(CommandEvent::Terminated(payload)) => {
                    eprintln!("[Sidecar terminated] {:?}", payload);

                    // 看门狗: 自动重启
                    let counter: State<RestartCounter> = app_handle_watchdog.state();
                    let attempts = counter.count.fetch_add(1, Ordering::SeqCst) + 1;

                    if attempts <= MAX_RESTART_ATTEMPTS {
                        let wait_secs = attempts as u64 * 2; // 指数退避: 2s, 4s, 6s
                        println!(
                            "[Tauri] 看门狗: {}s 后重启 sidecar ({}/{})",
                            wait_secs, attempts, MAX_RESTART_ATTEMPTS
                        );

                        let _ = app_handle_watchdog.emit(
                            "backend-restarting",
                            serde_json::json!({
                                "attempt": attempts,
                                "maxAttempts": MAX_RESTART_ATTEMPTS,
                                "waitSeconds": wait_secs,
                            }),
                        );

                        tokio::time::sleep(Duration::from_secs(wait_secs)).await;

                        // 重新启动
                        let app_restart = app_handle_watchdog.clone();
                        tauri::async_runtime::spawn(async move {
                            start_sidecar_with_watchdog(&app_restart, &user_data_clone);
                        });
                    } else {
                        eprintln!(
                            "[Tauri] 看门狗: 超过最大重启次数 ({}), 放弃",
                            MAX_RESTART_ATTEMPTS
                        );
                        let _ = app_handle_watchdog
                            .emit("backend-error", "后端服务多次启动失败, 请检查日志或重新安装应用");
                    }
                    break;
                }
                None => {
                    eprintln!("[Sidecar] 事件通道关闭");
                    break;
                }
                _ => {}
            }
        }
    });

    // 等后端就绪后通知前端
    let app_handle_health = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        match wait_for_backend().await {
            Ok(_) => {
                println!("[Tauri] 后端 OK, 通知前端");
                let _ = app_handle_health.emit("backend-ready", ());
            }
            Err(e) => {
                eprintln!("[Tauri] 后端启动失败: {}", e);
                let _ = app_handle_health.emit("backend-error", e);
            }
        }
    });
}

// ==================== 入口 ====================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, shortcut, _event| {
                // Ctrl+Shift+X 切换窗口显示/隐藏
                if shortcut.mods == Modifiers::CONTROL | Modifiers::SHIFT
                    && shortcut.key == Code::KeyX
                {
                    if let Some(window) = app.get_webview_window("main") {
                        let visible = window.is_visible().unwrap_or(false);
                        if visible {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            })
            .build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(SidecarState {
            child: Mutex::new(None),
        })
        .manage(RestartCounter {
            count: AtomicU8::new(0),
        })
        .setup(|app| {
            // 用户数据目录
            let user_data = match app.path().app_data_dir() {
                Ok(d) => d,
                Err(e) => {
                    eprintln!("[Tauri] 获取 userData 失败: {}", e);
                    let _ = app.emit("backend-error", format!("无法获取用户数据目录: {}", e));
                    return Ok(());
                }
            };
            std::fs::create_dir_all(&user_data).ok();
            let user_data_str = user_data.to_string_lossy().to_string();
            println!("[Tauri] userData: {}", user_data_str);

            // First-run .env bootstrap
            let env_path = user_data.join(".env");
            if !env_path.exists() {
                match app
                    .path()
                    .resolve(".env.example", tauri::path::BaseDirectory::Resource)
                {
                    Ok(example) => {
                        if let Ok(bytes) = std::fs::read(&example) {
                            if std::fs::write(&env_path, &bytes).is_ok() {
                                println!("[Tauri] 已首次初始化 .env ({} bytes)", bytes.len());
                            }
                        }
                    }
                    Err(e) => eprintln!("[Tauri] 找不到 resource .env.example: {}", e),
                }
            }

            // 构建系统托盘
            setup_tray(app.handle());

            // 注册全局快捷键: Ctrl+Shift+X 显示/隐藏窗口
            if let Err(e) = app.handle().global_shortcut().register("Ctrl+Shift+X") {
                eprintln!("[Tauri] 注册 Ctrl+Shift+X 失败: {}", e);
            }

            // 启动 sidecar
            start_sidecar_with_watchdog(app.handle(), &user_data_str);

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // 关闭窗口 → 最小化到托盘 (不退出)
                println!("[Tauri] 关闭窗口 → 最小化到托盘");
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_backend_url,
            check_backend_health,
            backup_database,
            list_backups,
            restore_backup,
            get_app_info,
            restart_backend,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri 启动失败");
}