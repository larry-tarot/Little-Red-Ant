# 安装与启动

## 环境要求

- **Node.js**：18 或更高版本
- **pnpm / npm / yarn**：用于安装前端依赖
- **Python**：3.10 或更高版本（后端依赖）
- **Playwright**：用于浏览器自动化

## 1. 克隆项目

```bash
git clone https://github.com/Chenzc-AIDev/小红蚁.git
cd 小红蚁
```

## 2. 安装依赖

```bash
npm install
```

## 3. 安装 Playwright 浏览器

```bash
npx playwright install chromium
```

## 4. 启动开发环境

```bash
npm run dev
```

启动后：

- 前端页面：`http://localhost:5173/`
- 后端 API：`http://localhost:14753/`

!!! note "首次启动"
    首次启动会自动初始化数据库。请根据界面提示创建管理员账号。

## 5. 生产构建

```bash
npm run build
npm start
```

## 常见问题

### 启动时报端口占用

可以修改环境变量中的端口配置：

```bash
# Windows PowerShell
$env:VITE_PORT=5174
$env:API_PORT=14754
npm run dev
```

### Playwright 浏览器下载失败

如果网络受限，可配置镜像：

```bash
set PLAYWRIGHT_BROWSERS_PATH=0
npx playwright install chromium
```
