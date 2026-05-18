"""
クリップボードAPIのテスト
- WindowsのCF_HDROP形式でExplorer貼り付け可能なデータを渡す
- pywin32未導入環境や非Windows環境の分岐を確認する
"""
import sys
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app
from app.routers import clipboard


def test_copy_files_to_clipboard_sets_cf_hdrop_bytes_once(tmp_path, monkeypatch):
    """WindowsではCF_HDROPへDROPFILES構造体付きのbytesを一度だけ設定する"""
    target = tmp_path / "sample.txt"
    target.write_text("sample", encoding="utf-8")

    set_calls = []
    lifecycle_calls = []

    def fake_set_clipboard_data(fmt, data):
        set_calls.append((fmt, data))
        return 1

    fake_win32clipboard = SimpleNamespace(
        CF_HDROP=15,
        OpenClipboard=lambda: lifecycle_calls.append("open"),
        EmptyClipboard=lambda: lifecycle_calls.append("empty"),
        SetClipboardData=fake_set_clipboard_data,
        CloseClipboard=lambda: lifecycle_calls.append("close"),
    )

    monkeypatch.setattr(clipboard.sys, "platform", "win32")
    monkeypatch.setitem(sys.modules, "win32clipboard", fake_win32clipboard)
    monkeypatch.setitem(sys.modules, "win32con", SimpleNamespace(CF_HDROP=15))

    response = TestClient(app).post("/api/clipboard/copy", json={"paths": [str(target)]})

    assert response.status_code == 200
    assert response.json() == {"status": "success", "count": 1}
    assert lifecycle_calls == ["open", "empty", "close"]
    assert len(set_calls) == 1
    assert set_calls[0][0] == 15
    assert isinstance(set_calls[0][1], bytes)
    assert str(target).replace("/", "\\").encode("utf-16le") in set_calls[0][1]
