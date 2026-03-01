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
    """For quiz outputs, replace stored storage_url in sources with current values from DB.

    Quiz outputs bake in storage_url at generation time. This ensures links
    always point to fresh signed URLs regardless of when the output was created.
    """
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
            supabase.table("artifacts")
            .select("id, storage_url")
            .in_("id", art_ids)
            .execute()
        ).data or []

        url_map = {r["id"]: r.get("storage_url", "") for r in rows}
        refreshed = [
            {**s, "storage_url": url_map.get(s.get("artifact_id"), s.get("storage_url", ""))}
            for s in sources
        ]
        data["sources"] = refreshed
        return {**output, "content": json.dumps(data, ensure_ascii=False)}
    except Exception:
        return output


@router.get("/{course_id}/outputs", response_model=list[OutputOut])
def get_outputs(
    course_id: str,
    output_type: str = Query(""),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    get_course(supabase, course_id)
    outputs = list_outputs(supabase, current_user["id"], course_id, output_type)
    return [_refresh_quiz_sources(supabase, o) for o in outputs]


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
