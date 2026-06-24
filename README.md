# easy-viewer

`easy-viewer` 是一个独立的帖子展示项目，只负责读取 MySQL 数据并展示。

它默认读取表：

```text
t_fund_generated_posts
```

## 配置

项目会按顺序读取环境变量：

1. 当前环境变量
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

## 启动

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start_viewer.ps1
```

访问：

```text
http://127.0.0.1:8898
```

## API

```text
GET /api/batches
GET /api/posts
GET /api/posts?trade_date=2026-06-24
GET /api/posts?trade_date=2026-06-24&generated_at=2026-06-24%2013:52:08&run_id=xxx
GET /health
```

`GET /api/batches` 会按批次聚合返回数据，不会因为不同 `status` 把同一批次拆成多条，返回项中包含：

```text
trade_date
generated_at
run_id
post_count
status
statuses
status_counts
```
