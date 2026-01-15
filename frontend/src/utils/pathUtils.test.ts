import { describe, it, expect } from 'vitest';
import { formatPathForClipboard } from './pathUtils';

describe('formatPathForClipboard', () => {
    it('should format simple absolute path', () => {
        const input = "/Users/mine/test";
        expect(formatPathForClipboard(input)).toBe("/Users/mine/test");
    });

    it('should format simple relative path', () => {
        const input = "test/file.txt";
        expect(formatPathForClipboard(input)).toBe("test/file.txt");
    });

    it('should convert Windows-like path starting with /C:/ to C:\\', () => {
        const input = "/C:/Users/mine";
        expect(formatPathForClipboard(input)).toBe("C:\\Users\\mine");
    });

    it('should convert Windows-like path starting with /d:/ to D:\\ (case insensitive drive letter)', () => {
        const input = "/d:/Data";
        expect(formatPathForClipboard(input)).toBe("D:\\Data");
    });

    it('should convert path with backslashes to Windows format if it looks like Windows path', () => {
        // This case might be tricky. If it already has backslashes, it might be fine, but we generally want to standardize based on the request.
        // The request says "replace / with \".
        const input = "C:/Users/mine";
        expect(formatPathForClipboard(input)).toBe("C:\\Users\\mine");
    });

    it('should handle UNC paths (starting with //)', () => {
        const input = "//server/share/file";
        expect(formatPathForClipboard(input)).toBe("\\\\server\\share\\file");
    });

    it('should handle mixed slashes in Windows path', () => {
        const input = "C:\\Users/mine";
        expect(formatPathForClipboard(input)).toBe("C:\\Users\\mine");
    });
});
