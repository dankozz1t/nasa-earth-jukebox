"""AI composer, both transports and provider selection. No network."""

import json
from pathlib import Path
from typing import Any

import anthropic
import httpx
import httpx2
import pytest

from earth_sound.adapters.outbound.ai.anthropic_transport import AnthropicTransport
from earth_sound.adapters.outbound.ai.budget import BudgetedComposer
from earth_sound.adapters.outbound.ai.disabled import DisabledComposer
from earth_sound.adapters.outbound.ai.factory import AiConfig, build_ai_composer, resolve_provider
from earth_sound.adapters.outbound.ai.llm_composer import LlmComposer
from earth_sound.adapters.outbound.ai.openrouter_transport import BASE_URL, OpenRouterTransport
from earth_sound.adapters.outbound.ai.prompt import SCHEMA, SYSTEM
from earth_sound.adapters.outbound.ai.transport import Completion, CompletionRequest
from earth_sound.application.ports.composer import ComposerError, ComposerRequest
from earth_sound.bootstrap.settings import Settings

PLAN = {"title": "T", "mode": "major", "rationale_en": "e", "rationale_uk": "u", "bars": []}
REQUEST = ComposerRequest(
    section="temperature",
    unit="°C",
    mood="warm",
    tonic_name="D",
    tempo_bpm=72,
    bars=4,
    observed_at="2026-11-14T12:00Z",
    features=[{"level": 0.5}],
)


class StubTransport:
    provider = "stub"
    model = "stub-model"

    def __init__(self, completion: Completion) -> None:
        self.completion = completion
        self.requests: list[CompletionRequest] = []

    def complete(self, request: CompletionRequest) -> Completion:
        self.requests.append(request)
        return self.completion


@pytest.fixture(autouse=True)
def no_ambient_credentials(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Keep the developer's own keys and `ant auth login` profile out of the tests."""
    for name in (
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_PROFILE",
        "ANTHROPIC_FEDERATION_RULE_ID",
        "OPENROUTER_API_KEY",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))


def test_llm_composer_sends_shared_prompt_and_parses_plan() -> None:
    transport = StubTransport(Completion(json.dumps(PLAN), "end"))
    composer = LlmComposer(transport)

    assert composer.compose(REQUEST) == PLAN
    assert composer.available
    assert composer.name == "ai:stub-model"
    sent = transport.requests[0]
    assert sent.system == SYSTEM
    assert sent.schema == SCHEMA
    assert json.loads(sent.user.split("\n", 1)[1])["bars_required"] == 4


@pytest.mark.parametrize(
    ("completion", "message"),
    [
        (Completion("", "refusal"), "declined"),
        (Completion('{"title": "cut', "max_tokens"), "ran out of room"),
        (Completion("not json", "end"), "invalid JSON"),
        (Completion("[1, 2]", "end"), "unexpected shape"),
    ],
)
def test_llm_composer_turns_bad_replies_into_composer_errors(completion: Completion, message: str) -> None:
    with pytest.raises(ComposerError, match=message):
        LlmComposer(StubTransport(completion)).compose(REQUEST)


def openrouter(handler: Any) -> OpenRouterTransport:
    http = httpx.Client(base_url=BASE_URL, transport=httpx.MockTransport(handler))
    return OpenRouterTransport("anthropic/claude-haiku-5.5", "low", 30, "or-test-key", http=http)


def chat_reply(content: str | None, finish: str = "stop", refusal: str | None = None) -> dict[str, Any]:
    message = {"role": "assistant", "content": content, "refusal": refusal}
    return {"id": "gen-1", "choices": [{"message": message, "finish_reason": finish}]}


def test_openrouter_request_shape_and_reply() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=chat_reply(json.dumps(PLAN)))

    plan = LlmComposer(openrouter(handler)).compose(REQUEST)

    assert plan == PLAN
    request = seen[0]
    assert str(request.url) == "https://openrouter.ai/api/v1/chat/completions"
    assert request.headers["Authorization"] == "Bearer or-test-key"
    body = json.loads(request.content)
    assert body["model"] == "anthropic/claude-haiku-5.5"
    assert [m["role"] for m in body["messages"]] == ["system", "user"]
    assert body["response_format"]["type"] == "json_schema"
    assert body["response_format"]["json_schema"]["strict"] is True
    assert body["response_format"]["json_schema"]["schema"] == SCHEMA
    assert body["reasoning"]["effort"] == "low"
    assert body["provider"] == {"require_parameters": True}


@pytest.mark.parametrize(
    ("reply", "stop"),
    [
        (chat_reply(None, refusal="no"), "refusal"),
        (chat_reply("", finish="content_filter"), "refusal"),
        (chat_reply('{"a"', finish="length"), "max_tokens"),
        (chat_reply("{}"), "end"),
    ],
)
def test_openrouter_maps_finish_reasons(reply: dict[str, Any], stop: str) -> None:
    transport = openrouter(lambda _: httpx.Response(200, json=reply))
    assert transport.complete(CompletionRequest("s", "u", SCHEMA, "x", 100)).stop == stop


@pytest.mark.parametrize(
    ("response", "message"),
    [
        (httpx.Response(401, json={"error": {"code": 401, "message": "bad key"}}), "credentials were rejected"),
        (httpx.Response(402, json={"error": {"code": 402}}), "not enough credits"),
        (httpx.Response(429, json={}), "rate limited"),
        (httpx.Response(503, text="down"), r"error \(503\)"),
        (httpx.Response(200, json={"error": {"code": 502, "message": "upstream"}}), r"error \(502\)"),
        (httpx.Response(200, json={"choices": []}), "unexpected shape"),
        (httpx.Response(200, text="<html>"), "unreadable"),
    ],
)
def test_openrouter_errors_become_composer_errors(response: httpx.Response, message: str) -> None:
    transport = openrouter(lambda _: response)
    with pytest.raises(ComposerError, match=message):
        transport.complete(CompletionRequest("s", "u", SCHEMA, "x", 100))


def test_openrouter_connection_failure() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline", request=request)

    with pytest.raises(ComposerError, match=r"\(openrouter\) could not be reached"):
        openrouter(handler).complete(CompletionRequest("s", "u", SCHEMA, "x", 100))


def anthropic_transport(handler: Any) -> AnthropicTransport:
    """The SDK uses httpx2, so the mock transport comes from httpx2 too."""
    transport = AnthropicTransport("claude-opus-5-5", "low", 30, api_key="sk-ant-test")
    transport._client = anthropic.Anthropic(
        api_key="sk-ant-test", max_retries=0, http_client=httpx2.Client(transport=httpx2.MockTransport(handler))
    )
    return transport


def test_anthropic_request_shape_and_reply() -> None:
    seen: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        seen.append(request)
        return httpx2.Response(
            200,
            json={
                "id": "msg_1",
                "type": "message",
                "role": "assistant",
                "model": "claude-opus-5-5",
                "content": [{"type": "text", "text": json.dumps(PLAN)}],
                "stop_reason": "end_turn",
                "stop_sequence": None,
                "usage": {"input_tokens": 1, "output_tokens": 1},
            },
        )

    assert LlmComposer(anthropic_transport(handler)).compose(REQUEST) == PLAN
    body = json.loads(seen[0].content)
    assert body["model"] == "claude-opus-5-5"
    assert body["output_config"]["effort"] == "low"
    assert body["output_config"]["format"]["schema"] == SCHEMA
    assert body["system"] == SYSTEM


@pytest.mark.parametrize(
    ("status", "message"),
    [(401, "credentials were rejected"), (429, "rate limited"), (500, r"error \(500\)")],
)
def test_anthropic_errors_match_openrouter_wording(status: int, message: str) -> None:
    transport = anthropic_transport(lambda _: httpx2.Response(status, json={"type": "error", "error": {}}))
    with pytest.raises(ComposerError, match=rf"\(anthropic\).*{message}"):
        transport.complete(CompletionRequest("s", "u", SCHEMA, "x", 100))


@pytest.mark.parametrize(
    ("config", "provider"),
    [
        (AiConfig(), None),
        (AiConfig(anthropic_api_key="a"), "anthropic"),
        (AiConfig(openrouter_api_key="o"), "openrouter"),
        (AiConfig(anthropic_api_key="a", openrouter_api_key="o"), "anthropic"),  # auto: Anthropic first
        (AiConfig(provider="openrouter", anthropic_api_key="a", openrouter_api_key="o"), "openrouter"),
        (AiConfig(provider="anthropic", openrouter_api_key="o"), None),
        (AiConfig(provider="openrouter", anthropic_api_key="a"), None),
    ],
)
def test_resolve_provider(config: AiConfig, provider: str | None) -> None:
    assert resolve_provider(config) == provider


def test_resolve_provider_sees_anthropic_env_and_profile(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("ANTHROPIC_AUTH_TOKEN", "t")
    assert resolve_provider(AiConfig()) == "anthropic"
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN")
    (tmp_path / "anthropic").mkdir()
    (tmp_path / "anthropic" / "profile.json").write_text("{}")
    assert resolve_provider(AiConfig()) == "anthropic"


@pytest.mark.parametrize(
    ("config", "name"),
    [
        (AiConfig(openrouter_api_key="o"), "ai:anthropic/claude-haiku-5.5"),
        (AiConfig(anthropic_api_key="a"), "ai:claude-opus-5-5"),
        (AiConfig(openrouter_api_key="o", model="openai/gpt-x"), "ai:openai/gpt-x"),
    ],
)
def test_build_uses_provider_default_model(config: AiConfig, name: str) -> None:
    composer = build_ai_composer(config)
    assert composer.available
    assert composer.name == name


def test_build_without_keys_or_when_disabled_is_off() -> None:
    assert isinstance(build_ai_composer(AiConfig()), DisabledComposer)
    assert isinstance(build_ai_composer(AiConfig(enabled=False, openrouter_api_key="o")), DisabledComposer)
    assert not build_ai_composer(AiConfig()).available


def test_settings_read_keys_from_env_and_treat_empty_as_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "or-from-env")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    monkeypatch.setenv("ES_AI_MODEL", "")
    config = Settings(_env_file=None).ai_config()
    assert config.openrouter_api_key == "or-from-env"
    assert config.anthropic_api_key is None
    assert config.model is None
    assert "or-from-env" not in repr(Settings(_env_file=None))


class CountingComposer:
    available = True
    name = "ai:count"

    def __init__(self) -> None:
        self.calls = 0

    def compose(self, request: ComposerRequest) -> dict[str, Any]:
        self.calls += 1
        return PLAN


def test_budget_stops_paid_calls_at_the_daily_limit_and_resets_next_day() -> None:
    from datetime import date

    day = [date(2026, 11, 15)]
    inner = CountingComposer()
    composer = BudgetedComposer(inner, daily_limit=2, today=lambda: day[0])
    composer.compose(REQUEST)
    composer.compose(REQUEST)
    with pytest.raises(ComposerError, match="budget"):
        composer.compose(REQUEST)
    assert inner.calls == 2
    assert composer.available  # the rules take over, the composer still reports as configured

    day[0] = date(2026, 11, 16)
    composer.compose(REQUEST)
    assert inner.calls == 3


def test_build_wraps_the_live_composer_in_the_daily_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    assert isinstance(build_ai_composer(AiConfig(openrouter_api_key="o", daily_limit=5)), BudgetedComposer)
    monkeypatch.setenv("ES_AI_DAILY_LIMIT", "7")
    assert Settings(_env_file=None).ai_config().daily_limit == 7
    monkeypatch.delenv("ES_AI_DAILY_LIMIT")
    assert Settings(_env_file=None).ai_config().daily_limit == 100
