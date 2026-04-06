import requests
import pytest
import time

def test_backend_live_config():
    """バックエンドサーバーが起動しており、configエンドポイントがJSONを返すことを確認"""
    url = "http://localhost:8001/api/config"
    try:
        response = requests.get(url, timeout=5)
        assert response.status_code == 200
        data = response.json()
        assert "defaultBasePath" in data
        assert "isWindows" in data
    except requests.exceptions.ConnectionError:
        pytest.fail("Backend server is not running on port 8001")

def test_frontend_live():
    """フロントエンドサーバーが起動していることを確認"""
    url = "http://localhost:5173"
    try:
        response = requests.get(url, timeout=5)
        # Viteの構成ファイルやHTMLが含まれているか確認
        assert response.status_code == 200
        assert "<title>" in response.text or "Vite" in response.text
    except requests.exceptions.ConnectionError:
        pytest.fail("Frontend server is not running on port 5173")
