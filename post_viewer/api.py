from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles


POST_TABLE = "t_fund_generated_posts"
DIMENSION_CATEGORY_TABLE = "t_content_dimension_categories"
DIMENSION_OPTION_TABLE = "t_content_dimension_options"


def _viewer_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def _load_default_env() -> None:
    _load_env_file(_viewer_root() / ".env")
    _load_env_file(_viewer_root().parent / "easy-flow" / ".env")


def _safe_identifier(value: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_]+", value or ""):
        raise RuntimeError(f"unsafe MySQL identifier: {value!r}")
    return value


def _mysql_config() -> dict[str, Any]:
    _load_default_env()
    required = ["MYSQL_HOST", "MYSQL_PORT", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE"]
    missing = [key for key in required if not os.environ.get(key)]
    if missing:
        raise RuntimeError("missing MySQL env keys: " + ", ".join(missing))
    return {
        "host": os.environ["MYSQL_HOST"],
        "port": int(os.environ.get("MYSQL_PORT", "3306")),
        "user": os.environ["MYSQL_USER"],
        "password": os.environ["MYSQL_PASSWORD"],
        "database": _safe_identifier(os.environ["MYSQL_DATABASE"]),
        "charset": "utf8mb4",
        "cursorclass": _dict_cursor_class(),
        "connect_timeout": int(os.environ.get("MYSQL_CONNECT_TIMEOUT", "30")),
        "read_timeout": int(os.environ.get("MYSQL_READ_TIMEOUT", "30")),
        "write_timeout": int(os.environ.get("MYSQL_WRITE_TIMEOUT", "30")),
    }


def _dict_cursor_class() -> Any:
    try:
        import pymysql
    except ImportError as exc:
        raise RuntimeError("PyMySQL is required. Install with: pip install -e .") from exc
    return pymysql.cursors.DictCursor


def _connect() -> Any:
    try:
        import pymysql
    except ImportError as exc:
        raise RuntimeError("PyMySQL is required. Install with: pip install -e .") from exc
    return pymysql.connect(**_mysql_config())


def _json_value(value: Any, fallback: Any) -> Any:
    if value is None:
        return fallback
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, bytes):
        value = value.decode("utf-8")
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return fallback
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return fallback
    return fallback


def _style_label(style: str) -> str:
    return {
        "rant": "吐槽共鸣",
        "question": "提问互动",
        "analysis": "轻分析",
    }.get(style, style or "未知")


def _row_to_post(row: dict[str, Any]) -> dict[str, Any]:
    source = _json_value(row.get("source_json"), {})
    raw_post = _json_value(row.get("raw_post_json"), {})
    style = str(source.get("style") or (raw_post.get("source") or {}).get("style") or "unknown")
    return {
        "content_id": str(row.get("content_id") or ""),
        "rank": int(row.get("rank_no") or 0),
        "score": float(row.get("score") or 0),
        "style": style,
        "style_label": _style_label(style),
        "dimension_label": str(row.get("dimension_label") or ""),
        "title": str(row.get("title") or ""),
        "body": str(row.get("body") or ""),
        "hashtags": [str(item) for item in _json_value(row.get("hashtags_json"), [])],
        "disclaimer": str(row.get("disclaimer") or ""),
        "status": str(row.get("status") or ""),
        "trade_date": str(row.get("trade_date") or ""),
        "generated_at": str(row.get("generated_at") or ""),
        "run_id": str(row.get("run_id") or ""),
        "human_score": None,
        "quality_passed": None,
        "quality_issues": [],
        "quality_warnings": [],
    }


def _latest_batch_filter(connection: Any) -> tuple[str, tuple[Any, ...]]:
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT trade_date, generated_at, run_id
            FROM {POST_TABLE}
            ORDER BY trade_date DESC, generated_at DESC, run_id DESC
            LIMIT 1
            """
        )
        row = cursor.fetchone()
    if not row:
        return "", ()
    return "WHERE trade_date = %s AND generated_at = %s AND run_id = %s", (
        row["trade_date"],
        row["generated_at"],
        row["run_id"],
    )


def _batch_filter(connection: Any, trade_date: str = "", run_id: str = "", generated_at: str = "") -> tuple[str, tuple[Any, ...]]:
    clauses: list[str] = []
    params: list[Any] = []
    if trade_date:
        clauses.append("trade_date = %s")
        params.append(trade_date)
    if run_id:
        clauses.append("run_id = %s")
        params.append(run_id)
    if generated_at:
        clauses.append("generated_at = %s")
        params.append(generated_at)
    if clauses:
        return "WHERE " + " AND ".join(clauses), tuple(params)
    return _latest_batch_filter(connection)


def _posts_payload(*, trade_date: str = "", run_id: str = "", generated_at: str = "") -> dict[str, Any]:
    with _connect() as connection:
        where_sql, params = _batch_filter(connection, trade_date=trade_date, run_id=run_id, generated_at=generated_at)
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT trade_date, generated_at, run_id, content_id, rank_no, score,
                       dimension_label, title, body, disclaimer, hashtags_json,
                       signals_json, source_json, raw_post_json, status
                FROM {POST_TABLE}
                {where_sql}
                ORDER BY rank_no ASC, content_id ASC
                """,
                params,
            )
            rows = cursor.fetchall()
    posts = [_row_to_post(row) for row in rows]
    style_counts: dict[str, int] = {}
    for post in posts:
        style_counts[post["style"]] = style_counts.get(post["style"], 0) + 1
    first = rows[0] if rows else {}
    signals = _json_value(first.get("signals_json") if first else None, {})
    return {
        "source": "mysql",
        "table": POST_TABLE,
        "run_id": str(first.get("run_id") or ""),
        "trade_date": str(first.get("trade_date") or ""),
        "generated_at": str(first.get("generated_at") or ""),
        "generated_count": len(posts),
        "quality_passed": True,
        "quality_issues": [],
        "quality_warnings": [],
        "source_preference": str(signals.get("source_preference") or ""),
        "style_counts": style_counts,
        "posts": posts,
    }


def _batches_payload(limit: int = 30) -> list[dict[str, Any]]:
    with _connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT batch.trade_date, batch.generated_at, batch.run_id, posts.status, COUNT(*) AS post_count
                FROM (
                    SELECT trade_date, generated_at, run_id
                    FROM {POST_TABLE}
                    GROUP BY trade_date, generated_at, run_id
                    ORDER BY trade_date DESC, generated_at DESC, run_id DESC
                    LIMIT %s
                ) AS batch
                JOIN {POST_TABLE} AS posts
                  ON posts.trade_date = batch.trade_date
                 AND posts.generated_at = batch.generated_at
                 AND posts.run_id = batch.run_id
                GROUP BY batch.trade_date, batch.generated_at, batch.run_id, posts.status
                ORDER BY batch.trade_date DESC, batch.generated_at DESC, batch.run_id DESC, posts.status ASC
                """,
                (int(limit),),
            )
            rows = cursor.fetchall()

    batches: list[dict[str, Any]] = []
    batches_by_key: dict[tuple[str, str, str], dict[str, Any]] = {}
    for row in rows:
        trade_date = str(row.get("trade_date") or "")
        generated_at = str(row.get("generated_at") or "")
        run_id = str(row.get("run_id") or "")
        status = str(row.get("status") or "")
        post_count = int(row.get("post_count") or 0)
        key = (trade_date, generated_at, run_id)
        batch = batches_by_key.get(key)
        if batch is None:
            batch = {
                "trade_date": trade_date,
                "generated_at": generated_at,
                "run_id": run_id,
                "post_count": 0,
                "status": "",
                "statuses": [],
                "status_counts": {},
            }
            batches_by_key[key] = batch
            batches.append(batch)
        batch["post_count"] += post_count
        if status:
            batch["statuses"].append(status)
            batch["status_counts"][status] = post_count

    for batch in batches:
        statuses = batch["statuses"]
        batch["status"] = statuses[0] if len(statuses) == 1 else "mixed"

    return batches


def _dimensions_payload() -> list[dict[str, Any]]:
    with _connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT
                  categories.category_id,
                  categories.name AS category_name,
                  categories.description AS category_description,
                  categories.selection_required,
                  categories.sort_order AS category_sort_order,
                  options.option_id,
                  options.option_key,
                  options.name AS option_name,
                  options.description AS option_description,
                  options.sort_order AS option_sort_order
                FROM {DIMENSION_CATEGORY_TABLE} AS categories
                LEFT JOIN {DIMENSION_OPTION_TABLE} AS options
                  ON options.category_id = categories.category_id
                 AND options.enabled = 1
                WHERE categories.enabled = 1
                ORDER BY categories.sort_order ASC,
                         categories.category_id ASC,
                         options.sort_order ASC,
                         options.option_key ASC
                """
            )
            rows = cursor.fetchall()

    categories: list[dict[str, Any]] = []
    categories_by_id: dict[str, dict[str, Any]] = {}
    for row in rows:
        category_id = str(row.get("category_id") or "")
        if not category_id:
            continue
        category = categories_by_id.get(category_id)
        if category is None:
            category = {
                "category_id": category_id,
                "name": str(row.get("category_name") or ""),
                "description": str(row.get("category_description") or ""),
                "selection_required": bool(row.get("selection_required")),
                "sort_order": int(row.get("category_sort_order") or 0),
                "options": [],
            }
            categories_by_id[category_id] = category
            categories.append(category)

        option_id = str(row.get("option_id") or "")
        if option_id:
            category["options"].append(
                {
                    "option_id": option_id,
                    "category_id": category_id,
                    "option_key": str(row.get("option_key") or ""),
                    "name": str(row.get("option_name") or ""),
                    "description": str(row.get("option_description") or ""),
                    "sort_order": int(row.get("option_sort_order") or 0),
                }
            )
    return categories


def create_app() -> FastAPI:
    static_root = _viewer_root() / "post_viewer" / "static"
    app = FastAPI(title="easy-viewer", version="0.1.0")

    @app.get("/health")
    def health() -> dict[str, str]:
        try:
            config = _mysql_config()
            return {"ok": "true", "source": "mysql", "database": str(config["database"]), "table": POST_TABLE}
        except Exception as exc:
            return {"ok": "false", "source": "mysql", "error": f"{type(exc).__name__}: {exc}"}

    @app.get("/", response_class=HTMLResponse)
    def index() -> str:
        return (static_root / "index.html").read_text(encoding="utf-8")

    @app.get("/api/batches")
    def batches(limit: int = Query(default=30, ge=1, le=200)) -> list[dict[str, Any]]:
        try:
            return _batches_payload(limit)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc

    @app.get("/api/dimensions")
    def dimensions() -> list[dict[str, Any]]:
        try:
            return _dimensions_payload()
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc

    @app.get("/api/posts")
    def posts(trade_date: str = "", run_id: str = "", generated_at: str = "") -> dict[str, Any]:
        try:
            return _posts_payload(trade_date=trade_date.strip(), run_id=run_id.strip(), generated_at=generated_at.strip())
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc

    app.mount("/static", StaticFiles(directory=static_root), name="static")
    return app


app = create_app()
