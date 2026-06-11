/**
 * 設定（config.ts）のテスト
 * - ネットワークドライブパスの判定
 * - バックエンドからのapiTimeoutを含む設定取得・保存
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getNetworkDrivePath, getConfig, saveEditorPreferences, getApiTimeout, resetConfigCacheForTesting } from './config';

describe('getNetworkDrivePath', () => {

    beforeEach(() => {
        // Mock window and navigator
        vi.stubGlobal('window', {
            navigator: {
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
            }
        });
        vi.stubGlobal('navigator', {
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('should use Windows path from env when on Windows', () => {
        vi.stubGlobal('window', {
            navigator: {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            }
        });
        vi.stubEnv('VITE_NETWORK_DRIVE_PATH_WINDOWS', '\\\\custom\\windows\\path');

        expect(getNetworkDrivePath()).toBe('\\\\custom\\windows\\path');
    });

    it('should use Mac/Linux path from env when on Mac', () => {
        vi.stubGlobal('window', {
            navigator: {
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
            }
        });
        vi.stubEnv('VITE_NETWORK_DRIVE_PATH_MAC', '/Volumes/custom_mac_path');

        expect(getNetworkDrivePath()).toBe('/Volumes/custom_mac_path');
    });

    it('should fall back to default Windows path if env is missing', () => {
        vi.stubGlobal('window', {
            navigator: {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            }
        });
        vi.stubEnv('VITE_NETWORK_DRIVE_PATH_WINDOWS', '');

        // Assuming we keep the existing hardcoded values as defaults
        expect(getNetworkDrivePath()).toBe('\\\\vnau12\\xxx\\yyy');
    });

    it('should fall back to default Mac path if env is missing', () => {
        vi.stubGlobal('window', {
            navigator: {
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            }
        });
        vi.stubEnv('VITE_NETWORK_DRIVE_PATH_MAC', '');

        expect(getNetworkDrivePath()).toBe('/Volumes/mine_nas');
    });
});

describe('apiTimeout configuration', () => {
    beforeEach(() => {
        resetConfigCacheForTesting();
        // Mock window and navigator
        vi.stubGlobal('window', {
            navigator: {
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
            }
        });
        vi.stubGlobal('navigator', {
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
        });
        // Mock fetch
        vi.stubGlobal('fetch', vi.fn());
        // Mock localStorage
        const store: Record<string, string> = {};
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => store[key] || null,
            setItem: (key: string, value: string) => { store[key] = value; },
            clear: () => {}
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('should fetch and cache apiTimeout from backend config', async () => {
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                defaultBasePath: '/mock/path',
                isWindows: false,
                textFileOpenMode: 'web',
                markdownOpenMode: 'web',
                apiTimeout: 15
            })
        } as Response);

        const config = await getConfig();
        expect(config.apiTimeout).toBe(15);
        expect(getApiTimeout()).toBe(15);
    });

    it('should fall back to default 10 seconds if apiTimeout is missing or invalid', async () => {
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                defaultBasePath: '/mock/path',
                isWindows: false,
                textFileOpenMode: 'web',
                markdownOpenMode: 'web'
                // apiTimeout is missing
            })
        } as Response);

        const config = await getConfig();
        // ここで失敗するはず（未実装のため）
        expect(config.apiTimeout).toBe(10);
        expect(getApiTimeout()).toBe(10);
    });

    it('should send apiTimeout when saving preferences', async () => {
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                textFileOpenMode: 'web',
                markdownOpenMode: 'web',
                apiTimeout: 25
            })
        } as Response);

        // キャッシュクリアのために一度取得（この時点でconfigCacheに別のが入るのを防ぐため、直接saveを呼ぶ）
        await saveEditorPreferences('web', 'web', 25);

        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/config/preferences'),
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    textFileOpenMode: 'web',
                    markdownOpenMode: 'web',
                    apiTimeout: 25
                })
            })
        );
        expect(getApiTimeout()).toBe(25);
    });
});
