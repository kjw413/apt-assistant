export function acquireWriterLock(): Promise<'acquired' | 'busy' | 'unsupported'> {
  if (typeof navigator === 'undefined' || !navigator.locks) return Promise.resolve('unsupported');
  return new Promise((resolve, reject) => {
    navigator.locks.request('apt-writer', { ifAvailable: true }, lock => {
      if (!lock) {
        resolve('busy');
        return;
      }
      resolve('acquired');
      return new Promise<void>(() => {});
    }).catch(reject);
  });
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  try {
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
