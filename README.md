# MOMOT - Memory Monitor

memory-first 的本地内存监控工具。实时采集 Linux 系统内存数据，通过 Web
仪表盘展示总内存趋势、进程占用分布和全量进程列表。
    
## 功能

- 系统总内存使用率环形图
- 总内存使用趋势曲线（支持框选放大）
- 全量进程列表（表头点击排序）
- 单进程详情弹窗（实时趋势 + 框选放大）
- 深色 / 浅色主题切换
- WebSocket 实时推送，1 秒刷新
  
## 环境要求

- Linux（依赖 `/proc` 文件系统）
- Python 3.11+
- Node.js 18+
- Conda（用于管理 Python 虚拟环境）
  
## 安装

### 1. Python 后端

```bash
# 创建 conda 环境
conda create -n python311_A1 python=3.11 -y
    
# 安装依赖
conda run -n python311_A1 pip install -r requirements.txt
```

`requirements.txt` 内容：
    
```
fastapi==0.115.12
uvicorn==0.34.0
wsproto==1.3.2
```

### 2. React 前端

```bash
cd UI
npm install
```

## 运行

### 方式一：开发模式（前后端分离）

终端 1 — 启动后端：
    
```bash
conda run -n python311_A1 python mem_mot.py serve --no-browser --port 8765
```

终端 2 — 启动前端 dev server（自动代理到后端）：
    
```bash
cd UI
npm run dev
```

打开 http://localhost:5173
    

### 方式二：终端模式

```bash
conda run -n python311_A1 python mem_mot.py cli
```

### 常用参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `-i, --interval` | 采样间隔（秒） | 1 |
| `-n, --top` | 终端模式显示前 N 个进程 | 5 |
| `--history` | 内存中保留的快照数 | 7200 |
| `--host` | 监听地址 | 127.0.0.1 |
| `--port` | 监听端口 | 8765 |
| `--no-browser` | 不自动打开浏览器 | - |
| `--log-level` | 日志级别 | INFO |

## 项目结构

```
mem_monitor/
├── mem_mot.py# 入口，CLI / serve 模式
├── collector.py   # /proc 采集层
├── models.py # MemorySnapshot / ProcessSnapshot
├── storage.py# 内存快照存储
├── runtime.py# 后台采样循环
├── service.py# 仪表盘数据组装
├── app.py    # FastAPI + WebSocket
├── dashboard_page.py   # 内置 HTML 页面
├── exceptions.py  # 自定义异常
├── requirements.txt
└── UI/  # React 前端
    ├── src/app/App.tsx # 主界面
    ├── package.json
    └── vite.config.ts  # dev proxy 配置
```
