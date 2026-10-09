import { describe, expect, it, vi } from 'vitest';
import { readCaptureDirectory, readCaptureFile } from './captureFiles';

function directory(permission: PermissionState = 'granted') {
  const file = new File(['png'], 'Aladin_2026-10-09_14-32-05.png', { type: 'image/png' });
  const getFile = vi.fn(async () => file);
  const handle = {
    name: 'ShareX', queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => 'granted' as PermissionState),
    getFileHandle: vi.fn(async () => ({ getFile })),
    async *values() {
      yield { kind: 'file', name: file.name, getFile };
      yield { kind: 'file', name: 'notes.txt', getFile: async () => new File(['text'], 'notes.txt') };
      yield { kind: 'directory', name: 'subdir' };
    },
  };
  return { handle, file };
}

describe('capture file access', () => {
  it('checks permission every read, requests it when needed, and selects only timestamped images', async () => {
    const { handle, file } = directory('prompt');
    expect(await readCaptureDirectory(handle as unknown as FileSystemDirectoryHandle)).toEqual([file]);
    expect(await readCaptureFile(file.name, [], handle as unknown as FileSystemDirectoryHandle)).toBe(file);
    expect(handle.queryPermission).toHaveBeenCalledTimes(2);
    expect(handle.requestPermission).toHaveBeenCalledTimes(2);
  });
  it('uses chosen files and reports missing files or denied access as null', async () => {
    const { handle, file } = directory('denied');
    handle.requestPermission.mockResolvedValue('denied');
    expect(await readCaptureFile(file.name, [file], handle as unknown as FileSystemDirectoryHandle)).toBe(file);
    expect(handle.queryPermission).not.toHaveBeenCalled();
    expect(await readCaptureFile('missing.png', [], handle as unknown as FileSystemDirectoryHandle)).toBeNull();
    await expect(readCaptureDirectory(handle as unknown as FileSystemDirectoryHandle)).rejects.toThrow('권한');
  });
  it('returns null for a stale directory entry', async () => {
    const { handle } = directory();
    handle.getFileHandle.mockRejectedValue(new Error('missing'));
    expect(await readCaptureFile('missing.png', [], handle as unknown as FileSystemDirectoryHandle)).toBeNull();
  });
});
