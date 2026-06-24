from __future__ import annotations

import json
from typing import Any

from fastapi.testclient import TestClient

from post_viewer import api


class FakeCursor:
    def __init__(self, connection: "FakeConnection") -> None:
        self.connection = connection
        self.result: list[dict[str, Any]] = []

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
