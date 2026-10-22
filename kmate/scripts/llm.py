"""Text generation for the K.Mate service: Claude (ANTHROPIC_API_KEY) or OpenAI (OPENAI_API_KEY).

One small helper instead of a client object per script, so swapping the model or provider is a
one-file change. KMATE_AI_PROVIDER=claude (and a key) selects Claude; anything else uses OpenAI.
Models: ANTHROPIC_MODEL (default claude-sonnet-5-5) / OPENAI_TEXT_MODEL (default gpt-4o-mini).
"""
import json
import os

import requests
from dotenv import load_dotenv

load_dotenv()

OPENAI_MODEL = os.getenv("OPENAI_TEXT_MODEL", "gpt-4o-mini")
CLAUDE_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5")
_client = None


def _use_claude():
    return os.getenv("KMATE_AI_PROVIDER", "").lower() == "claude" and bool(os.getenv("ANTHROPIC_API_KEY"))


def _get_client():
    global _client
    if _client is None:
        from openai import OpenAI

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is not set. Add it to kmate/.env to enable the K.Mate tutor.")
        _client = OpenAI(api_key=api_key)
    return _client


def _claude_request(prompt, max_tokens, stream=False):
    # Burmese and Korean need many more tokens with Claude than the limits written for OpenAI allow for
    limit = min((max_tokens or 1024) * 3, 16000)
    body = {
        "model": CLAUDE_MODEL,
        "max_tokens": limit,
        "thinking": {"type": "between_tools"},
        "messages": [{"role": "user", "content": prompt}],
    }
    if stream:
        body["stream"] = True
    return requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": os.environ["ANTHROPIC_API_KEY"],
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        # the current Claude models reject `temperature`, so it is not sent
        json=body,
        # a stream may run long overall; the read timeout only bounds the gap between events
        timeout=(10, 120),
        stream=stream,
    )


def _claude_error(response):
    try:
        message = (response.json().get("error") or {}).get("message")
    except ValueError:
        message = None
    return RuntimeError(message or f"Claude request failed ({response.status_code})")


def _complete_claude(prompt, max_tokens):
    response = _claude_request(prompt, max_tokens)
    data = response.json()
    if response.status_code != 200:
        raise RuntimeError((data.get("error") or {}).get("message") or f"Claude request failed ({response.status_code})")
    return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()


def complete(prompt, *, temperature=None, max_tokens=None):
    """Send a single user prompt and return the reply text."""
    if _use_claude():
        return _complete_claude(prompt, max_tokens)
    kwargs = {}
    if temperature is not None:
        kwargs["temperature"] = temperature
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    response = _get_client().chat.completions.create(
        model=OPENAI_MODEL,
        messages=[{"role": "user", "content": prompt}],
        **kwargs,
    )
    return (response.choices[0].message.content or "").strip()


def _stream_claude(prompt, max_tokens):
    response = _claude_request(prompt, max_tokens, stream=True)
    with response:
        if response.status_code != 200:
            raise _claude_error(response)
        # Server-sent events: only `data:` lines carry JSON. Lines are decoded one at a time, after
        # splitting, so a Korean or Burmese character is never cut in half across two network chunks.
        for raw in response.iter_lines():
            if not raw.startswith(b"data:"):
                continue
            event = json.loads(raw[5:].decode("utf-8"))
            if event.get("type") == "content_block_delta" and event["delta"].get("type") == "text_delta":
                yield event["delta"]["text"]
            elif event.get("type") == "error":
                raise RuntimeError((event.get("error") or {}).get("message") or "Claude stream failed")


def stream(prompt, *, temperature=None, max_tokens=None):
    """Like complete(), but yield the reply text in pieces as the model writes it."""
    if _use_claude():
        yield from _stream_claude(prompt, max_tokens)
        return
    kwargs = {}
    if temperature is not None:
        kwargs["temperature"] = temperature
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    chunks = _get_client().chat.completions.create(
        model=OPENAI_MODEL,
        messages=[{"role": "user", "content": prompt}],
        stream=True,
        **kwargs,
    )
    for chunk in chunks:
        if chunk.choices and chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content
