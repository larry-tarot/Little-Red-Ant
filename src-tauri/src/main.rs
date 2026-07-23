// 小红蚁桌面版 - 阻止额外控制台窗口(仅 Windows release)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    xiaohongyi_lib::run()
}
