import { parseCaptureTime, type CaptureFile } from '../domain/captures';

type DirectoryAccess = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: 'read' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'read' }): Promise<PermissionState>;
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
};

export function directoryPicker(): (() => Promise<FileSystemDirectoryHandle>) | undefined {
  if (typeof window === 'undefined') return undefined;
  const target = window as Window & { showDirectoryPicker?: (options: { mode: 'read' }) => Promise<FileSystemDirectoryHandle> };
  return typeof target.showDirectoryPicker === 'function' ? () => target.showDirectoryPicker!({ mode: 'read' }) : undefined;
}

async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<void> {
  const access = handle as DirectoryAccess;
  const options = { mode: 'read' } as const;
  if (await access.queryPermission(options) === 'granted') return;
  if (await access.requestPermission(options) !== 'granted') throw new Error('캡처 폴더 읽기 권한이 필요합니다');
}

export function timedCaptureFiles(files: File[]): CaptureFile[] {
  return files.flatMap(file => {
    const t = parseCaptureTime(file.name);
    const image = file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(file.name);
    return image && t !== null ? [{ name: file.name, t }] : [];
  });
}

export async function readCaptureDirectory(handle: FileSystemDirectoryHandle): Promise<File[]> {
  await ensurePermission(handle);
  const files: File[] = [];
  for await (const entry of (handle as DirectoryAccess).values()) {
    if (entry.kind !== 'file' || parseCaptureTime(entry.name) === null) continue;
    const file = await entry.getFile();
    if (timedCaptureFiles([file]).length) files.push(file);
  }
  return files;
}

export async function readCaptureFile(name: string, files: File[], handle: FileSystemDirectoryHandle | null): Promise<File | null> {
  const selected = files.find(file => file.name === name);
  if (selected) return selected;
  if (!handle) return null;
  try {
    await ensurePermission(handle);
    return await (await handle.getFileHandle(name)).getFile();
  } catch { return null; }
}
