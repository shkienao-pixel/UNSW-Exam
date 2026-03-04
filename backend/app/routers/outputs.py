"""Output (AI-generated content) routes."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.core.dependencies import get_current_user, get_db
from app.models.course import OutputOut
from app.services.course_service import (
    delete_output,
    get_course,
    get_output,
    list_outputs,
)

router = APIRouter()


def _refresh_quiz_sources(supabase: Client, output: dict) -> dict:
    """For a single quiz output, refresh source storage_urls from DB."""
    if output.get("output_type") != "quiz" or not output.get("content"):
        return output
    try:
        data = json.loads(output["content"])
        sources = data.get("sources", [])
        if not sources:
            return output
        art_ids = [s["artifact_id"] for s in sources if s.get("artifact_id")]
        if not art_ids:
            return output
        rows = (
            supabase.table("artifacts").select("id, storage_url").in_("id", art_ids).execute()
        ).data or []
        url_map = {r["id"]: r.get("storage_url", "") for r in rows}
        data["sources"] = [
            {**s, "storage_url": url_map.get(s.get("artifact_id"), s.get("storage_url", ""))}
            for s in sources
        ]
        return {**output, "content": json.dumps(data, ensure_ascii=False)}
    except Exception:
        return output


def _refresh_quiz_sources_batch(supabase: Client, outputs: list[dict]) -> list[dict]:
    """Batch quiz source refresh — one DB query for all quiz outputs combined.

    Replaces the previous N individual queries (one per quiz output) with a
    single `.in_()` query across all artifact IDs found in quiz source lists.
    """
    index_to_data: dict[int, dict] = {}
    all_artifact_ids: set[int] = set()

    for i, o in enumerate(outputs):
        if o.get("output_type") != "quiz" or not o.get("content"):
            continue
        try:
            data = json.loads(o["content"])
            ids = {s["artifact_id"] for s in data.get("sources", []) if s.get("artifact_id")}
            if ids:
                index_to_data[i] = data
                all_artifact_ids |= ids
        except Exception:
            pass

    if not all_artifact_ids:
        return outputs

    rows = (
        supabase.table("artifacts")
        .select("id, storage_url")
        .in_("id", list(all_artifact_ids))
        .execute()
    ).data or []
    url_map = {r["id"]: r.get("storage_url", "") for r in rows}

    result = list(outputs)
    for i, data in index_to_data.items():
        data["sources"] = [
            {**s, "storage_url": url_map.get(s.get("artifact_id"), s.get("storage_url", ""))}
            for s in data.get("sources", [])
        ]
        result[i] = {**result[i], "content": json.dumps(data, ensure_ascii=False)}
    return result


@router.get("/{course_id}/outputs", response_model=list[OutputOut])
def get_outputs(
    course_id: str,
    output_type: str = Query(""),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    get_course(supabase, course_id)
    outputs = list_outputs(supabase, current_user["id"], course_id, output_type)
    return _refresh_quiz_sources_batch(supabase, outputs)


@router.get("/{course_id}/outputs/{output_id}", response_model=OutputOut)
def get_output_by_id(
    course_id: str,
    output_id: int,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    get_course(supabase, course_id)
    output = get_output(supabase, current_user["id"], output_id)
    return _refresh_quiz_sources(supabase, output)


@router.delete("/{course_id}/outputs/{output_id}", status_code=200)
def del_output(
    course_id: str,
    output_id: int,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    get_course(supabase, course_id)
    delete_output(supabase, current_user["id"], output_id)
    return {"ok": True, "id": output_id}
