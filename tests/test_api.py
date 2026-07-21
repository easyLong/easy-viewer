from __future__ import annotations

import json
import os
from datetime import date
from typing import Any

from fastapi.testclient import TestClient

from post_viewer import api


class FakeCursor:
    def __init__(self, connection: "FakeConnection") -> None:
        self.connection = connection
        self.result: list[dict[str, Any]] = []
        self.rowcount = 0

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        self.connection.queries.append((sql, params))
        if "FROM t_content_dimension_categories AS categories" in sql:
            self.result = [
                {
                    "category_id": "user_relation",
                    "category_name": "用户关系",
                    "category_description": "用户与基金之间的仓位和心理关系。",
                    "selection_required": 1,
                    "category_sort_order": 10,
                    "option_id": "user_relation:holding",
                    "option_key": "holding",
                    "option_name": "持有",
                    "option_description": "用户当前持有相关基金或板块。",
                    "option_sort_order": 10,
                },
                {
                    "category_id": "user_relation",
                    "category_name": "用户关系",
                    "category_description": "用户与基金之间的仓位和心理关系。",
                    "selection_required": 1,
                    "category_sort_order": 10,
                    "option_id": "user_relation:missed_out",
                    "option_key": "missed_out",
                    "option_name": "踏空",
                    "option_description": "用户未持有，但看到上涨。",
                    "option_sort_order": 20,
                },
                {
                    "category_id": "content_goal",
                    "category_name": "内容目标",
                    "category_description": "内容希望优先达成的结果。",
                    "selection_required": 1,
                    "category_sort_order": 20,
                    "option_id": "content_goal:emotional_resonance",
                    "option_key": "emotional_resonance",
                    "option_name": "情绪共鸣",
                    "option_description": "让用户产生共鸣。",
                    "option_sort_order": 10,
                },
            ]
        elif "JOIN t_fund_generated_posts AS posts" in sql:
            self.result = [
                {
                    "trade_date": "2026-06-24",
                    "generated_at": "2026-06-24 13:52:08",
                    "run_id": "fund_daily_content_generation_demo",
                    "status": "draft",
                    "post_count": 2,
                },
                {
                    "trade_date": "2026-06-24",
                    "generated_at": "2026-06-24 13:52:08",
                    "run_id": "fund_daily_content_generation_demo",
                    "status": "published",
                    "post_count": 1,
                }
            ]
        elif "LIMIT 1" in sql:
            self.result = [
                {
                    "trade_date": "2026-06-24",
                    "generated_at": "2026-06-24 13:52:08",
                    "run_id": "fund_daily_content_generation_demo",
                }
            ]
        else:
            self.result = [
                {
                    "trade_date": "2026-06-24",
                    "generated_at": "2026-06-24 13:52:08",
                    "run_id": "fund_daily_content_generation_demo",
                    "content_id": "post_01",
                    "rank_no": 1,
                    "score": 99,
                    "dimension_label": "持有 + 情绪共鸣",
                    "title": "又是等净值的一晚",
                    "body": "净值还没出，心已经先绿了。大盘也在震荡，评论区应该会很真实。",
                    "hashtags_json": json.dumps(["基金复盘"], ensure_ascii=False),
                    "signals_json": json.dumps({"source_preference": "closing_review"}, ensure_ascii=False),
                    "source_json": json.dumps({"style": "rant"}, ensure_ascii=False),
                    "raw_post_json": "{}",
                    "disclaimer": "仅为个人复盘，不构成投资建议。",
                    "status": "draft",
                }
            ]

    def fetchone(self) -> dict[str, Any] | None:
        return self.result[0] if self.result else None

    def fetchall(self) -> list[dict[str, Any]]:
        return self.result


class FakeConnection:
    def __init__(self) -> None:
        self.queries: list[tuple[str, tuple[Any, ...]]] = []

    def __enter__(self) -> "FakeConnection":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def cursor(self) -> FakeCursor:
        return FakeCursor(self)

    def commit(self) -> None:
        return None


class HotFundCursor:
    def __init__(self, connection: "HotFundConnection") -> None:
        self.connection = connection
        self.result: list[dict[str, Any]] = []

    def __enter__(self) -> "HotFundCursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, sql: str, params: tuple[Any, ...] | list[Any] = ()) -> None:
        self.connection.queries.append((sql, tuple(params)))
        if "SELECT DISTINCT snapshot_date" in sql:
            self.result = [{"snapshot_date": date(2026, 7, 15)}, {"snapshot_date": date(2026, 7, 14)}]
        elif "COUNT(*) AS total_rows" in sql:
            self.result = [{"total_rows": 1, "date_count": 1, "screenshot_rows": 1}]
        elif "SELECT snapshot_date, rank_no, fund_code, fund_name, screenshot_path" in sql:
            self.result = [
                {
                    "snapshot_date": date(2026, 7, 15),
                    "rank_no": 1,
                    "fund_code": "000001",
                    "fund_name": "测试基金",
                    "screenshot_path": str(self.connection.screenshot_path),
                }
            ]

    def fetchone(self) -> dict[str, Any] | None:
        return self.result[0] if self.result else None

    def fetchall(self) -> list[dict[str, Any]]:
        return self.result


class HotFundConnection:
    def __init__(self, screenshot_path: Any) -> None:
        self.screenshot_path = screenshot_path
        self.queries: list[tuple[str, tuple[Any, ...]]] = []

    def __enter__(self) -> "HotFundConnection":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def cursor(self) -> HotFundCursor:
        return HotFundCursor(self)


class RerunCursor:
    def __init__(self, connection: "RerunConnection") -> None:
        self.connection = connection
        self.result: list[dict[str, Any]] = []
        self.rowcount = 0

    def __enter__(self) -> "RerunCursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        self.connection.queries.append((sql, params))
        if "SELECT id, task_type, post_url" in sql and "post_url IN" in sql:
            self.result = [
                {
                    "id": 101,
                    "task_type": "detail",
                    "post_url": "https://ur.alipay.com/a",
                    "account_name": "acct",
                    "document_id": 1,
                    "row_index": 8,
                    "status": "failed",
                    "attempts": 3,
                    "updated_at": "2026-06-30 10:00:00",
                }
            ]
        elif "UPDATE crawler_app.task_submissions" in sql:
            self.rowcount = 1
            self.connection.updated_params = params
        elif "WHERE id IN" in sql:
            self.result = [
                {
                    "id": 101,
                    "task_type": "detail",
                    "post_url": "https://ur.alipay.com/a",
                    "account_name": "acct",
                    "document_id": 1,
                    "row_index": 8,
                    "status": "pending",
                    "attempts": 1,
                    "updated_at": "2026-06-30 10:01:00",
                }
            ]

    def fetchall(self) -> list[dict[str, Any]]:
        return self.result


class RerunConnection:
    def __init__(self) -> None:
        self.queries: list[tuple[str, tuple[Any, ...]]] = []
        self.updated_params: tuple[Any, ...] = ()
        self.committed = False

    def __enter__(self) -> "RerunConnection":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def cursor(self) -> RerunCursor:
        return RerunCursor(self)

    def commit(self) -> None:
        self.committed = True


class KolMetricsCursor:
    def __init__(self, connection: "KolMetricsConnection") -> None:
        self.connection = connection
        self.result: list[dict[str, Any]] = []

    def __enter__(self) -> "KolMetricsCursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        self.connection.queries.append((sql, params))
        if "SELECT DISTINCT m.metric_date" in sql:
            self.result = [{"metric_date": "2026-06-30"}]
        elif "SELECT DISTINCT m.platform" in sql:
            self.result = [{"platform": "wechat"}]
        elif "SELECT DISTINCT COALESCE" in sql:
            self.result = [{"kol_type": "external"}]
        elif "COUNT(*) AS total_rows" in sql:
            self.result = [
                {
                    "total_rows": 1,
                    "date_count": 1,
                    "kol_count": 1,
                    "fans_rows": 1,
                    "growth_rows": 1,
                    "read_rows": 1,
                    "post_rows": 1,
                    "internal_rows": 0,
                    "unmatched_base_rows": 0,
                }
            ]
        elif "ORDER BY" in sql and "LIMIT %s" in sql:
            self.result = [
                {
                    "metric_date": "2026-06-30",
                    "kol_name": "acct",
                    "platform": "wechat",
                    "homepage_url": "https://example.com/acct",
                    "group_name": "community",
                    "kol_type": "external",
                    "fans_count": 1000,
                    "growth_count": 12,
                    "read_count": 345,
                    "post_count_24h": 2,
                    "source_payload_json": "{}",
                    "writeback_error": "",
                    "updated_at": "2026-06-30 12:00:00",
                }
            ]
        else:
            self.result = []

    def fetchone(self) -> dict[str, Any] | None:
        return self.result[0] if self.result else None

    def fetchall(self) -> list[dict[str, Any]]:
        return self.result


class KolMetricsConnection:
    def __init__(self) -> None:
        self.queries: list[tuple[str, tuple[Any, ...]]] = []

    def __enter__(self) -> "KolMetricsConnection":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def cursor(self) -> KolMetricsCursor:
        return KolMetricsCursor(self)


class KolReadFillCursor:
    def __init__(self, connection: "KolReadFillConnection") -> None:
        self.connection = connection
        self.result: list[dict[str, Any]] = []
        self.rowcount = 0

    def __enter__(self) -> "KolReadFillCursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        self.connection.queries.append((sql, params))
        self.rowcount = 0
        if "SELECT COUNT(*) AS matched_rows" in sql:
            self.result = [{"matched_rows": 1 if params == ("2026-07-20", "acct", "理财通", "内部") else 0}]
        elif f"UPDATE {api.KOL_DAILY_METRICS_TABLE} AS m" in sql:
            self.connection.updates.append(params)
            self.rowcount = 1 if params == (888, "2026-07-20", "acct", "理财通", "内部") else 0
            self.result = []

    def fetchone(self) -> dict[str, Any] | None:
        return self.result[0] if self.result else None


class KolReadFillConnection:
    def __init__(self) -> None:
        self.queries: list[tuple[str, tuple[Any, ...]]] = []
        self.updates: list[tuple[Any, ...]] = []
        self.committed = False

    def __enter__(self) -> "KolReadFillConnection":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def cursor(self) -> KolReadFillCursor:
        return KolReadFillCursor(self)

    def commit(self) -> None:
        self.committed = True


def test_posts_api_reads_mysql_rows(monkeypatch) -> None:
    monkeypatch.setattr(api, "_connect", lambda: FakeConnection())
    client = TestClient(api.create_app())

    response = client.get("/api/posts")

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "mysql"
    assert body["table"] == "t_fund_generated_posts"
    assert body["run_id"] == "fund_daily_content_generation_demo"
    assert body["trade_date"] == "2026-06-24"
    assert body["generated_count"] == 1
    assert body["source_preference"] == "closing_review"
    assert body["style_counts"] == {"rant": 1}
    assert body["posts"][0]["title"] == "又是等净值的一晚"
    assert body["posts"][0]["style_label"] == "吐槽共鸣"


def test_batches_api_reads_mysql_batches(monkeypatch) -> None:
    monkeypatch.setattr(api, "_connect", lambda: FakeConnection())
    client = TestClient(api.create_app())

    response = client.get("/api/batches")

    assert response.status_code == 200
    assert response.json()[0]["post_count"] == 3
    assert response.json()[0]["status"] == "mixed"
    assert response.json()[0]["statuses"] == ["draft", "published"]
    assert response.json()[0]["status_counts"] == {"draft": 2, "published": 1}


def test_dimensions_api_reads_mysql_dimension_catalog(monkeypatch) -> None:
    monkeypatch.setattr(api, "_connect", lambda: FakeConnection())
    client = TestClient(api.create_app())

    response = client.get("/api/dimensions")

    assert response.status_code == 200
    body = response.json()
    assert body[0]["category_id"] == "user_relation"
    assert body[0]["name"] == "用户关系"
    assert body[0]["selection_required"] is True
    assert [option["name"] for option in body[0]["options"]] == ["持有", "踏空"]
    assert body[1]["category_id"] == "content_goal"
    assert body[1]["options"][0]["option_id"] == "content_goal:emotional_resonance"


def test_rerun_posts_resets_detail_task_submissions(monkeypatch) -> None:
    connection = RerunConnection()
    monkeypatch.setattr(api, "_connect", lambda: connection)
    client = TestClient(api.create_app())

    response = client.post(
        "/api/rerun-posts",
        json={"post_urls": ["https://ur.alipay.com/a", "https://ur.alipay.com/a", "https://ur.alipay.com/missing"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["requested_count"] == 2
    assert body["matched_count"] == 1
    assert body["updated_count"] == 1
    assert body["unmatched_urls"] == ["https://ur.alipay.com/missing"]
    assert body["rows"][0]["status"] == "pending"
    assert body["rows"][0]["attempts"] == 1
    assert connection.updated_params == ("pending", 1, "detail", 101)
    assert connection.committed is True


def test_kol_metrics_api_reads_crawler_app_metrics(monkeypatch) -> None:
    connection = KolMetricsConnection()
    monkeypatch.setattr(api, "_connect", lambda: connection)
    client = TestClient(api.create_app())

    response = client.get("/api/kol-metrics?date=2026-06-30&platform=wechat&limit=10")

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "mysql"
    assert body["tables"] == ["crawler_app.kol_daily_metrics", "crawler_app.kol_base_profiles"]
    assert body["summary"]["total_rows"] == 1
    assert body["options"]["dates"] == ["2026-06-30"]
    assert body["rows"][0]["kol_name"] == "acct"
    assert body["rows"][0]["read_count"] == 345
    assert body["filters"]["metric_date"] == "2026-06-30"
    assert any("crawler_app.kol_daily_metrics" in sql for sql, _params in connection.queries)
    assert any("crawler_app.kol_base_profiles" in sql for sql, _params in connection.queries)


def test_kol_metrics_supports_multiple_dates() -> None:
    filters = api._kol_normalize_filters({"date": "2026-06-30,2026-06-29"})

    where_sql, args = api._kol_where_clause(filters)

    assert filters["metric_date"] is None
    assert filters["metric_dates"] == [
        api.date(2026, 6, 30),
        api.date(2026, 6, 29),
    ]
    assert "m.metric_date IN (%s, %s)" in where_sql
    assert args == [api.date(2026, 6, 30), api.date(2026, 6, 29)]


def test_kol_read_count_source_skips_empty_and_sums_duplicates() -> None:
    rows, stats = api._normalize_kol_read_source_rows(
        [
            {"日期": "2026-07-20", "账号名称": "acct", "T文章阅读数": ""},
            {"日期": "2026-07-20", "账号名称": "acct", "T文章阅读数": "777"},
            {"日期": "2026-07-20", "账号名称": "acct", "T文章阅读数": "888"},
        ]
    )

    assert stats["source_rows"] == 3
    assert stats["empty_read_rows"] == 1
    assert stats["duplicate_rows"] == 1
    assert stats["valid_rows"] == 1
    assert rows == [
        {
            "metric_date": "2026-07-20",
            "kol_name": "acct",
            "platform": "理财通",
            "kol_type": "内部",
            "read_count": 1665,
        }
    ]


def test_kol_read_count_source_uses_default_date_for_empty_date() -> None:
    rows, stats = api._normalize_kol_read_source_rows(
        [{"日期": "", "账号名称": "acct", "T文章阅读数": "888"}],
        default_date="0713",
    )

    assert stats["valid_rows"] == 1
    assert rows[0]["metric_date"] == "2026-07-13"
    assert rows[0]["read_count"] == 888


def test_kol_read_count_source_prefers_tencent_openapi(monkeypatch) -> None:
    monkeypatch.setattr(api, "_tencent_sheet_values_rows", lambda _url: [{"日期": "2026-07-20", "账号名称": "acct", "T文章阅读数": "888"}])
    monkeypatch.setattr(api, "_fetch_qq_docs_sheet_text", lambda _url: "日期\t账号名称\tT文章阅读数\nacct\tbad\t1")
    monkeypatch.setattr(api, "_fetch_url_text", lambda _url: "")

    rows = api._fetch_kol_read_source_rows("https://docs.qq.com/sheet/DYnBmZ2drS3B2QVRZ?tab=BB08J2")

    assert rows == [{"日期": "2026-07-20", "账号名称": "acct", "T文章阅读数": "888"}]


def test_kol_read_count_source_fills_merged_date_cells() -> None:
    rows = api._kol_read_rows_from_matrix(
        [
            ["日期", "账号名称", "T文章阅读数"],
            ["2026-07-17", "acct-a", "100"],
            ["", "acct-b", "200"],
        ]
    )

    assert rows == [
        {"metric_date": "2026-07-17", "kol_name": "acct-a", "read_count": "100"},
        {"metric_date": "2026-07-17", "kol_name": "acct-b", "read_count": "200"},
    ]


def test_tencent_cell_text_reads_time_cells() -> None:
    assert (
        api._tencent_cell_text({"cellValue": {"time": {"year": 2026, "month": 7, "day": 20}}})
        == "2026-07-20"
    )


def test_load_env_file_overwrites_empty_environment_values(monkeypatch, tmp_path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("TENCENT_DOC_ACCESS_TOKEN=from_file\n", encoding="utf-8")
    monkeypatch.setenv("TENCENT_DOC_ACCESS_TOKEN", "")

    api._load_env_file(env_file)

    assert os.environ["TENCENT_DOC_ACCESS_TOKEN"] == "from_file"


def test_tencent_doc_headers_use_app_config_not_environment(monkeypatch) -> None:
    class ConfigCursor:
        def __enter__(self) -> "ConfigCursor":
            return self

        def __exit__(self, *_: object) -> None:
            return None

        def execute(self, _sql: str, _params: tuple[Any, ...] = ()) -> None:
            return None

        def fetchall(self) -> list[dict[str, str]]:
            return [
                {"config_key": "TENCENT_DOC_ACCESS_TOKEN", "config_value": "db-token"},
                {"config_key": "TENCENT_DOC_CLIENT_ID", "config_value": "db-client"},
                {"config_key": "TENCENT_DOC_OPEN_ID", "config_value": "db-open"},
            ]

    class ConfigConnection:
        def __enter__(self) -> "ConfigConnection":
            return self

        def __exit__(self, *_: object) -> None:
            return None

        def cursor(self) -> ConfigCursor:
            return ConfigCursor()

    monkeypatch.setenv("TENCENT_DOC_ACCESS_TOKEN", "env-token")
    monkeypatch.setenv("TENCENT_DOC_CLIENT_ID", "env-client")
    monkeypatch.setenv("TENCENT_DOC_OPEN_ID", "env-open")
    monkeypatch.setattr(api, "_connect", lambda: ConfigConnection())

    headers = api._tencent_doc_headers()

    assert headers["Access-Token"] == "db-token"
    assert headers["Client-Id"] == "db-client"
    assert headers["Open-Id"] == "db-open"


def test_kol_read_count_fill_updates_internal_licaitong_rows(monkeypatch) -> None:
    connection = KolReadFillConnection()
    monkeypatch.setattr(api, "_connect", lambda: connection)
    client = TestClient(api.create_app())

    response = client.post(
        "/api/kol-metrics/fill-read-count",
        json={
            "rows": [
                {"日期": "2026-07-20", "账号名称": "acct", "T文章阅读数": "888"},
                {"日期": "2026-07-20", "账号名称": "empty", "T文章阅读数": ""},
            ]
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["platform"] == "理财通"
    assert body["kol_type"] == "内部"
    assert body["source_rows"] == 2
    assert body["valid_rows"] == 1
    assert body["empty_read_rows"] == 1
    assert body["matched_count"] == 1
    assert body["updated_count"] == 1
    assert connection.updates == [(888, "2026-07-20", "acct", "理财通", "内部")]
    assert connection.committed is True


def test_settlement_import_preserves_zero_engagement_metrics() -> None:
    row = api._normalize_settlement_row(
        {
            "日期": "2026-07-01",
            "合作方": "partner",
            "投放平台": "platform",
            "产品": "product",
            "IP名称": "ip",
            "粉丝数": "0",
            "文章类型": "宣传贴",
            "链接": "https://example.com/post",
            "文章标题": "0",
            "截图": "0",
            "阅读量": "0",
            "评论": "0",
            "点赞": "0",
        }
    )

    assert row["fans_count"] is None
    assert row["article_title"] == ""
    assert row["screenshot_url"] == ""
    assert row["read_count"] == 0
    assert row["comment_count"] == 0
    assert row["like_count"] == 0


def test_settlement_import_treats_machine_recognition_labels_as_empty() -> None:
    row = api._normalize_settlement_row(
        {
            "日期": "2026-07-01",
            "合作方": "partner",
            "投放平台": "platform",
            "产品": "product",
            "IP名称": "ip",
            "文章类型": "宣传贴",
            "链接": "https://example.com/post",
            "文章标题": "机器识别",
            "截图": "最好程序能帮填写",
        }
    )
    row_with_zero_url = api._normalize_settlement_row(
        {
            "日期": "2026-07-01",
            "合作方": "partner",
            "投放平台": "platform",
            "产品": "product",
            "IP名称": "ip2",
            "文章类型": "宣传贴",
            "链接": "https://example.com/post2",
            "文章标题": "有效标题 2026",
            "截图": "https://example.com/image-20260707.png",
        }
    )

    assert row["article_title"] == ""
    assert row["screenshot_url"] == ""
    assert row_with_zero_url["article_title"] == "有效标题 2026"
    assert row_with_zero_url["screenshot_url"] == "https://example.com/image-20260707.png"


def test_settlement_import_allows_empty_identity_parts_except_date() -> None:
    row = api._normalize_settlement_row(
        {
            "日期": "2026-07-16",
            "合作方": "partner",
            "投放平台": "platform",
            "产品": "",
            "IP名称": "",
            "文章类型": "",
            "链接": "",
        }
    )

    assert row["post_url"] == ""
    assert row["ip_name"] == ""
    assert row["product_name"] == ""
    assert row["article_type"] == ""
    assert api._settlement_identity_key(row) == ("2026-07-16", "", "", "")


def test_settlement_import_update_sql_does_not_overwrite_autofill_with_zero() -> None:
    sql = api._settlement_import_update_sql(
        ["fans_count", "article_title", "screenshot_url", "read_count", "comment_count", "like_count", "fee"]
    )

    assert "VALUES(fans_count) IS NULL OR VALUES(fans_count) = 0" in sql
    assert "VALUES(article_title) IS NULL OR VALUES(article_title) = '' OR VALUES(article_title) = '0'" in sql
    assert "VALUES(screenshot_url) IS NULL OR VALUES(screenshot_url) = '' OR VALUES(screenshot_url) = '0'" in sql
    assert "VALUES(article_title) LIKE CONCAT(CHAR(37), '机器识别', CHAR(37))" in sql
    assert "VALUES(screenshot_url) LIKE CONCAT(CHAR(37), '最好程序能帮填写', CHAR(37))" in sql
    assert "read_count = COALESCE(VALUES(read_count), read_count)" in sql
    assert "comment_count = COALESCE(VALUES(comment_count), comment_count)" in sql
    assert "like_count = COALESCE(VALUES(like_count), like_count)" in sql
    assert "fee = COALESCE(VALUES(fee), fee)" in sql


def test_externalize_local_capture_path_uses_public_base(monkeypatch, tmp_path) -> None:
    capture_root = tmp_path / "captures"
    image_path = capture_root / "record_1" / "page_000.png"
    image_path.parent.mkdir(parents=True)
    image_path.write_bytes(b"png")
    monkeypatch.setenv("EASY_VIEWER_CAPTURE_ROOT", str(capture_root))
    monkeypatch.setenv("EASY_VIEWER_PUBLIC_BASE_URL", "http://192.168.1.30:8898")

    assert api._externalize_local_url(str(image_path), None) == "http://192.168.1.30:8898/captures/record_1/page_000.png"


def test_hot_fund_rankings_payload_filters_date_and_externalizes_screenshot(monkeypatch, tmp_path) -> None:
    capture_root = tmp_path / "captures"
    image_path = capture_root / "hot_funds" / "rank_001.png"
    image_path.parent.mkdir(parents=True)
    image_path.write_bytes(b"png")
    connection = HotFundConnection(image_path)
    monkeypatch.setenv("EASY_VIEWER_CAPTURE_ROOT", str(capture_root))
    monkeypatch.setenv("EASY_VIEWER_PUBLIC_BASE_URL", "http://192.168.1.30:8898")
    monkeypatch.setattr(api, "_connect", lambda: connection)

    payload = api._hot_fund_rankings_payload({"date": "2026-07-15", "limit": 20})

    assert payload["table"] == api.ALIPAY_HOT_FUND_RANKINGS_TABLE
    assert payload["filters"]["snapshot_date"] == "2026-07-15"
    assert payload["options"]["dates"] == ["2026-07-15", "2026-07-14"]
    assert payload["columns"] == [
        ("日期", "snapshot_date"),
        ("排名", "rank_no"),
        ("基金代码", "fund_code"),
        ("基金名称", "fund_name"),
        ("截图", "screenshot_url"),
    ]
    assert payload["rows"][0]["fund_code"] == "000001"
    assert payload["rows"][0]["screenshot_url"] == "http://192.168.1.30:8898/captures/hot_funds/rank_001.png"
    assert any(params == (date(2026, 7, 15), 20) for _sql, params in connection.queries)
