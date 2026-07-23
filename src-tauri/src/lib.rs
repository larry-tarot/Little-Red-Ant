// 小红蚁桌面版 - Tauri 2 入口
//
// 关键设计:
// 1. 启动 Node sidecar(Node 二进制 + 内置 api-dist/server.mjs + node_modules)
// 2. 等后端 listen 端口(健康检查 127.0.0.1:3001)
// 3. Webview 加载 http://localhost:3001(后端本身 serve dist 前端)
// 4. 数据写入 %APPDATA%/小红蚁/(通过 XIAOHONGYI_USER_DATA 环境变量注入)
// 5. 关闭时 kill sidecar 子进程
//
// 整个 main.rs 比 Electron 600 行 main.ts 简单 10 倍

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::process::Child;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Manager, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const BACKEND_PORT: u16 = 3001;
const BACKEND_URL: &str = "http://127.0.0.1:3001/api/health";

/// 存放 sidecar 子进程句柄,关闭时 kill
struct SidecarState {
    child: Mutex<Option<CommandChild>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct HealthResponse {
    status: String,
}

/// 等后端 listen 端口,最多 30s
async fn wait_for_backend() -> Result<(), String> {
    for i in 0..60 {
        match reqwest::get(BACKEND_URL).await {
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

#[tauri::command]
fn get_backend_url() -> String {
    format!("http://127.0.0.1:{}", BACKEND_PORT)
}

#[tauri::command]
async fn check_backend_health() -> Result<HealthResponse, String> {
    match reqwest::get(BACKEND_URL).await {
        Ok(resp) if resp.status().is_success() => Ok(HealthResponse {
            status: "ok".to_string(),
        }),
        Ok(resp) => Err(format!("后端返回 {}", resp.status())),
        Err(e) => Err(format!("后端不可达: {}", e)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState {
            child: Mutex::new(None),
        })
        .setup(|app| {
            // 用户数据目录(C:\Users\<u>\AppData\Roaming\小红蚁)
            let user_data = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("获取 userData 失败: {}", e))?;
            std::fs::create_dir_all(&user_data).ok();
            let user_data_str = user_data.to_string_lossy().to_string();

            println!("[Tauri] userData: {}", user_data_str);

            // 启动 Node sidecar (xiaohongyi-backend 实际是 node.exe,带 api-dist/server.mjs 作为参数)
            // 资源文件在生产环境位于: <resource_dir>/api-dist/server.mjs
            // api-dist/ 旁边有 node_modules/ 软链,这样 server.mjs 跑时 ESM import 能找到
            let api_entry = app
                .path()
                .resolve(
                    "api-dist/server.mjs",
                    tauri::path::BaseDirectory::Resource,
                )
                .map_err(|e| format!("找不到 api-dist/server.mjs: {}", e))?;

            // api-dist 目录作为 cwd(让 server.mjs 的相对路径找 node_modules/ 正常)
            let api_dir = api_entry
                .parent()
                .ok_or("api_entry 没有父目录")?
                .to_path_buf();

            println!("[Tauri] sidecar 入口: {:?}", api_entry);
            println!("[Tauri] sidecar cwd:  {:?}", api_dir);

            let shell = app.shell();
            let sidecar_command = shell
                .sidecar("xiaohongyi-backend")
                .map_err(|e| format!("找不到 sidecar: {}", e))?
                .args(&[api_entry.to_string_lossy().to_string()])
                .current_dir(&api_dir)
                .env("XIAOHONGYI_USER_DATA", &user_data_str)
                .env("PORT", BACKEND_PORT.to_string())
                .env("NODE_ENV", "production");

            let (mut rx, child) = sidecar_command
                .spawn()
                .map_err(|e| format!("启动 sidecar 失败: {}", e))?;

            // 保存 child 句柄供关闭时使用
            let state: State<SidecarState> = app.state();
            *state.child.lock().unwrap() = Some(child);

            // 异步读 stderr/stdout(避免缓冲区满导致后端卡死)
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            println!("[Sidecar stdout] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!("[Sidecar stderr] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Error(err) => {
                            eprintln!("[Sidecar error] {}", err);
                        }
                        CommandEvent::Terminated(payload) => {
                            eprintln!("[Sidecar terminated] {:?}", payload);
                            break;
                        }
                        _ => {}
                    }
                }
            });

            // 等后端就绪
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match wait_for_backend().await {
                    Ok(_) => {
                        println!("[Tauri] 后端 OK,通知前端");
                        let _ = app_handle.emit("backend-ready", ());
                    }
                    Err(e) => {
                        eprintln!("[Tauri] 后端启动失败: {}", e);
                        let _ = app_handle.emit("backend-error", e);
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // 关闭时 kill sidecar
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state: State<SidecarState> = window.state();
                let mut guard = state.child.lock().unwrap();
                if let Some(child) = guard.take() {
                    println!("[Tauri] 关闭主窗口,kill sidecar");
                    let _ = child.kill();
                }
                drop(guard);
            }
        })
        .invoke_handler(tauri::generate_handler![get_backend_url, check_backend_health])
        .run(tauri::generate_context!())
        .expect("Tauri 启动失败");
}
