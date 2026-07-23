const DEVICE_ID_KEY = 'veyrnox-device-id';

/** @type {string | null} */
let cached = null;

export function getOrCreateDeviceId() {
  if (cached) return cached;
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (id) { cached = id; return id; }
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      id = crypto.randomUUID();
    } else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buf = new Uint8Array(16);
      crypto.getRandomValues(buf);
      buf[6] = (buf[6] & 0x0f) | 0x40;
      buf[8] = (buf[8] & 0x3f) | 0x80;
      const h = [...buf].map(b => b.toString(16).padStart(2, '0')).join('');
      id = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    } else {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    }
    localStorage.setItem(DEVICE_ID_KEY, id);
    cached = id;
    return id;
  } catch {
    return null;
  }
}
