import { open, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const pendingWrites = new Map();

export function writeJsonAtomic(path, value) {
  const snapshot = JSON.stringify(value, null, 2);
  const previous = pendingWrites.get(path) ?? Promise.resolve();
  const writing = previous
    .catch(() => {})
    .then(async () => {
      const temporary = `${path}.${randomUUID()}.tmp`;
      let file;
      try {
        file = await open(temporary, 'wx', 0o600);
        await file.writeFile(snapshot, 'utf8');
        await file.sync();
        await file.close();
        file = null;
        await rename(temporary, path);
      } finally {
        await file?.close();
        await rm(temporary, { force: true });
      }
    });
  pendingWrites.set(path, writing);
  writing
    .finally(() => {
      if (pendingWrites.get(path) === writing) pendingWrites.delete(path);
    })
    .catch(() => {});
  return writing;
}
