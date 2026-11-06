"""Validated, version-stable configuration for personal archive views."""
import re
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ViewModel(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)


class ViewDisplaySettings(ViewModel):
    density: Literal['compact', 'comfortable']
    groupBy: Literal['date', 'source', 'none']
    showSource: bool
    showDate: bool
    showCount: bool
    showContent: bool
    showPreview: bool


class ViewConfig(ViewModel):
    query: str = Field(max_length=2000)
    platform: Literal['openai', 'claude', 'raycast'] | None
    role: Literal['', 'user', 'assistant', 'system', 'tool']
    before: str
    attribute: Literal['', 'code', 'images', 'tables', 'files', 'audio', 'video']
    sort: Literal['relevance', 'newest', 'oldest']
    display: ViewDisplaySettings

    @field_validator('before')
    @classmethod
    def validate_before(cls, value: str) -> str:
        if value:
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                raise ValueError('Before date must use YYYY-MM-DD.')
            date.fromisoformat(value)
        return value


class CreateSavedView(ViewModel):
    name: str = Field(min_length=1, max_length=80)
    config: ViewConfig

    @field_validator('name')
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError('A view name is required.')
        return value


class UpdateSavedView(ViewModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    config: ViewConfig | None = None

    @field_validator('name')
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError('A view name is required.')
        return CreateSavedView.validate_name(value)

    @model_validator(mode='after')
    def validate_patch(self):
        if not self.model_fields_set:
            raise ValueError('Provide a name or configuration to update.')
        if 'config' in self.model_fields_set and self.config is None:
            raise ValueError('Configuration cannot be null.')
        return self


class SavedView(ViewModel):
    id: str
    name: str
    config: ViewConfig
    created_at: str
    updated_at: str
