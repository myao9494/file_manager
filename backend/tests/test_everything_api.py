"""
インデックス検索プロキシのOS別接続先を検証する。
macOSではLocal-fulltext-searchへ統合し、WindowsのEverything接続は維持する。
"""


class _MockResponse:
    """httpx.Response 互換の最小モック。"""

    def __init__(self, payload):
        self._payload = payload

    def json(self):
        return self._payload

    def raise_for_status(self) -> None:
        return None


class _MockAsyncClient:
    """テスト用の httpx.AsyncClient モック。"""

    def __init__(self, *, calls, **_kwargs):
        self._calls = calls

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url, *, params=None, timeout=None):
        self._calls.append((url, params, timeout))
        return _MockResponse({"totalResults": 1, "results": []})


def test_mac_index_search_proxies_to_local_fulltext_search(client, monkeypatch):
    """
    macOSの /api/index は localhost:8080 ではなく統合済みAPIへ転送する。
    """
    from app.routers import everything

    calls = []
    monkeypatch.setattr(everything.platform, "system", lambda: "Darwin")
    monkeypatch.setattr(
        everything.httpx,
        "AsyncClient",
        lambda **kwargs: _MockAsyncClient(calls=calls, **kwargs),
    )

    response = client.get("/api/index", params={"search": "alpha", "count": 10})

    assert response.status_code == 200
    assert calls[0][0].endswith("/api/index")
    assert calls[0][0].startswith("http://127.0.0.1:8079")
    assert calls[0][1]["search"] == "alpha"


def test_windows_index_search_keeps_everything_port(client, monkeypatch):
    """
    Windowsの /api/index は従来通り localhost:8080 のEverythingへ転送する。
    """
    from app.routers import everything

    calls = []
    monkeypatch.setattr(everything.platform, "system", lambda: "Windows")
    monkeypatch.setattr(
        everything.httpx,
        "AsyncClient",
        lambda **kwargs: _MockAsyncClient(calls=calls, **kwargs),
    )

    response = client.get("/api/index", params={"search": "alpha", "count": 10})

    assert response.status_code == 200
    assert calls[0][0] == "http://localhost:8080/"
    assert calls[0][1]["json"] == 1
