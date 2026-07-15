# easy-viewer

`easy-viewer` 是一个独立的 MySQL 数据查看项目，只负责读取和整理业务数据，不做 ADB 采集、不调度任务。

当前页面：

| 页面 | 路径 | 作用 |
| --- | --- | --- |
| 小牛书社区内容生产 | `/` | 查看 `t_fund_generated_posts` 生成内容和批次 |
| 重跑帖子阅读数 | `/rerun` | 按帖子链接把 `crawler_app.task_submissions` 的详情任务重置为待处理 |
| 社区大V业务看板 | `/settlements` | 导入、补全和查看 `crawler_app.kol_business_settlements` |
| 大V账号数据统计 | `/kol-metrics` | 查看、筛选、复制和导出 `crawler_app.kol_daily_metrics` |
| 支付宝热门基金榜 | `/hot-funds` | 按日期查看 `crawler_app.alipay_hot_fund_rankings`，截图链接自动转为局域网 HTTP 地址 |

## 配置

项目会按顺序读取环境变量：

1. 当前进程环境变量
2. `C:\Code\easy-viewer\.env`
3. `C:\Code\easy-flow\.env`

需要的配置：

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=your_user
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=your_database
```

KOL 指标页会直接访问 `crawler_app` schema 下的表，所以 MySQL 用户需要有对应表的读取权限。

截图地址会优先使用局域网访问地址。如果页面是从 `127.0.0.1` 打开的，系统会自动探测本机局域网 IP；也可以显式配置：

```env
EASY_VIEWER_PUBLIC_BASE_URL=http://192.168.1.30:8898
EASY_VIEWER_CAPTURE_ROOT=D:\Code\adb\tmp
```

默认还会尝试挂载这些本地截图目录：

```text
captures
..\adb\apps\finance_crawler\captures
..\adb\runtime\captures
..\adb\tmp
```

## 启动

```powershell
cd C:\Code\easy-viewer
powershell -ExecutionPolicy Bypass -File scripts\start_viewer.ps1
```

默认访问地址：

```text
http://127.0.0.1:8898
http://127.0.0.1:8898/kol-metrics
http://127.0.0.1:8898/hot-funds
```

如果 8898 已经被旧进程占用，可以手动换端口：

```powershell
$env:PYTHONPATH = (Get-Location).Path
.\.venv\Scripts\python.exe -m uvicorn post_viewer.api:app --host 127.0.0.1 --port 8899
```

Windows 后台运行建议使用这几个脚本：

```powershell
# 启动，默认监听 0.0.0.0:8898，局域网可访问
powershell -ExecutionPolicy Bypass -File .\scripts\start_viewer_prod.ps1 -Background

# 重启，会清理代理环境变量并释放端口
powershell -ExecutionPolicy Bypass -File .\scripts\restart_viewer.ps1

# 查看状态和健康检查
powershell -ExecutionPolicy Bypass -File .\scripts\status_viewer.ps1

# 停止
powershell -ExecutionPolicy Bypass -File .\scripts\stop_viewer.ps1
```

启动日志和 PID 默认写入：

```text
.tmp\easy-viewer.out.log
.tmp\easy-viewer.err.log
.tmp\easy-viewer.pid
```


## API

基础：

```text
GET /health
GET /api/batches
GET /api/dimensions
GET /api/posts
GET /api/posts?trade_date=2026-06-24
GET /api/posts?trade_date=2026-06-24&generated_at=2026-06-24%2013:52:08&run_id=xxx
```

重跑详情任务：

```text
POST /api/rerun-posts
```

商单结算：

```text
GET  /api/settlements
GET  /api/settlement-autofill?post_url=...
POST /api/settlements/import
POST /api/settlements/import-file
```

KOL 指标：

```text
GET /api/kol-metrics
GET /api/kol-metrics?date=2026-06-30&platform=理财通&limit=500
GET /api/kol-metrics/export.xlsx
```

`/api/kol-metrics` 支持参数：

| 参数 | 说明 |
| --- | --- |
| `date` | 指标日期，格式 `YYYY-MM-DD` |
| `platform` | 平台 |
| `kol_type` | KOL 类型 |
| `missing` | 空值筛选：`fans_empty`、`growth_empty`、`fans_or_growth_empty`、`fans_and_growth_empty` |
| `q` | 搜索大 V 名称或群名 |
| `sort` | 排序：`base_id`、`title`、`title_desc`、`date_desc`、`date_asc`、`platform`、`group`、`fans_desc`、`growth_desc`、`read_desc` |
| `limit` | 返回行数，最大 2000 |

支付宝热门基金榜：

```text
GET /api/hot-funds
GET /api/hot-funds?date=2026-07-15&limit=200
```

`/api/hot-funds` 支持参数：

| 参数 | 说明 |
| --- | --- |
| `date` | 榜单日期，格式 `YYYY-MM-DD` |
| `limit` | 返回行数，最大 1000 |

返回字段：

| 字段 | 说明 |
| --- | --- |
| `snapshot_date` | 榜单日期 |
| `rank_no` | 排名 |
| `fund_code` | 基金代码 |
| `fund_name` | 基金名称 |
| `screenshot_url` | 可点击的局域网 HTTP 截图地址 |

## 数据表

当前主要读取或写入：

```text
t_fund_generated_posts
t_content_dimension_categories
t_content_dimension_options
crawler_app.task_submissions
crawler_app.task_executions
crawler_app.article_detail_targets
crawler_app.article_detail_runs
crawler_app.kol_daily_snapshots
crawler_app.kol_business_settlements
crawler_app.kol_daily_metrics
crawler_app.kol_base_profiles
crawler_app.alipay_hot_fund_rankings
```

其中 `/kol-metrics` 是从 `adb` 项目迁移过来的 KOL 指标查看页。采集和入库仍在 `adb` 中完成，查看、筛选和 Excel 导出统一放在 `easy-viewer`。

## 测试

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_api.py
```
