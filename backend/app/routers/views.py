from fastapi import APIRouter, HTTPException, Response

from ..database import get_connection
from ..saved_views import (
    SavedViewConflict, create_saved_view, delete_saved_view,
    list_saved_views, update_saved_view,
)
from ..saved_views_models import CreateSavedView, SavedView, UpdateSavedView

router = APIRouter(prefix='/api/views', tags=['views'])


@router.get('', response_model=list[SavedView])
def list_views():
    with get_connection() as conn:
        return list_saved_views(conn)


@router.post('', response_model=SavedView, status_code=201)
def create_view(payload: CreateSavedView):
    try:
        with get_connection() as conn:
            return create_saved_view(conn, payload.name, payload.config.model_dump())
    except SavedViewConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.patch('/{view_id}', response_model=SavedView)
def update_view(view_id: str, payload: UpdateSavedView):
    try:
        with get_connection() as conn:
            result = update_saved_view(conn, view_id, name=payload.name,
                                       config=payload.config.model_dump() if payload.config else None)
    except SavedViewConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=404, detail='This saved view no longer exists. Refresh your views and try again.')
    return result


@router.delete('/{view_id}', status_code=204)
def delete_view(view_id: str):
    with get_connection() as conn:
        removed = delete_saved_view(conn, view_id)
    if not removed:
        raise HTTPException(status_code=404, detail='This saved view no longer exists.')
    return Response(status_code=204)
