#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Tauri 纯壳 - 不承载任何业务逻辑
// 业务函数（upload/document/knowledge/analysis/docgen）由 pnpm 启动的 iii worker 进程提供
// 前端通过 @legalai/api 客户端调用 HTTP 端点
// Tauri 唯一职责：加载 Webview、注入窗口配置

fn main() {
    legalai_desktop_lib::run();
}
