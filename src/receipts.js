// Comprovantes (fotos/PDF) anexados às transações, guardados no IndexedDB do aparelho.
const DB_NAME = 'ruffino-financas-arquivos';
const STORE = 'comprovantes';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const putReceipt = (id, blob) => run('readwrite', (s) => s.put(blob, id));
export const getReceipt = (id) => run('readonly', (s) => s.get(id));
export const deleteReceipt = (id) => run('readwrite', (s) => s.delete(id)).catch(() => {});

/** Reduz fotos para no máximo 1400px em JPEG; PDFs e outros arquivos ficam como estão. */
export async function prepareFile(file) {
  if (!file.type.startsWith('image/')) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b || file), 'image/jpeg', 0.72));
}
