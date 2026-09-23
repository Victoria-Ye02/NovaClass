"""Centralized environment/config access for LLM providers."""

from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class LLMConfigurationError(RuntimeError):
    """Raised when a required LLM provider setting is missing."""


def get_openrouter_api_key() -> str:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise LLMConfigurationError(
            "OPENROUTER_API_KEY is not set. Configure it in the environment to enable "
            "AI grading and study-plan generation."
        )
    return api_key


def get_gemini_api_key() -> str:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise LLMConfigurationError(
            "GEMINI_API_KEY is not set. Configure it in the environment to enable "
            "Reading/Listening explanation generation."
        )
    return api_key
