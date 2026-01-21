import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getNetworkDrivePath } from './config';

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
