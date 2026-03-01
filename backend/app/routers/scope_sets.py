"""Scope set management routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from supabase import Client

from app.core.dependencies import get_current_user, get_db
from app.models.course import ScopeSetCreate, ScopeSetItemsUpdate, ScopeSetOut
from app.services.course_service import (
    create_scope_set,
    delete_scope_set,
    ensure_default_scope_set,
    get_course,
    get_scope_set,
    list_scope_sets,
    rename_scope_set,
    replace_scope_set_items,
)

router = APIRouter()


@router.get("/{course_id}/scope-sets", response_model=list[ScopeSetOut])
def get_scope_sets(
    course_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    get_course(supabase, course_id)
    # Auto-create default scope set if none exist
    ensure_default_scope_set(supabase, current_user["id"], course_id)
    return list_scope_sets(supabase, current_user["id"], course_id)


@router.post("/{course_id}/scope-sets", response_model=ScopeSetOut, status_code=201)
def post_scope_set(
    course_id: str,
    body: ScopeSetCreate,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    get_course(supabase, course_id)
    return create_scope_set(supabase, current_user["id"], course_id, body.name)


@router.get("/{course_id}/scope-sets/{scope_set_id}", response_model=ScopeSetOut)
def get_scope_set_by_id(
    course_id: str,
    scope_set_id: int,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    get_course(supabase, course_id)
    return get_scope_set(supabase, current_user["id"], scope_set_id)


@router.patch("/{course_id}/scope-sets/{scope_set_id}", response_model=ScopeSetOut)
def patch_scope_set(
    course_id: str,
    scope_set_id: int,
    body: ScopeSetCreate,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    get_course(supabase, course_id)
    return rename_scope_set(supabase, current_user["id"], scope_set_id, body.name)


@router.delete("/{course_id}/scope-sets/{scope_set_id}", status_code=200)
def del_scope_set(
    course_id: str,
    scope_set_id: int,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    get_course(supabase, course_id)
    delete_scope_set(supabase, current_user["id"], scope_set_id)
    return {"ok": True, "id": scope_set_id}


@router.put("/{course_id}/scope-sets/{scope_set_id}/items", response_model=ScopeSetOut)
def put_scope_set_items(
    course_id: str,
    scope_set_id: int,
    body: ScopeSetItemsUpdate,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    get_course(supabase, course_id)
    replace_scope_set_items(supabase, scope_set_id, body.artifact_ids)
    return get_scope_set(supabase, current_user["id"], scope_set_id)
