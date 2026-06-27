export function getTransport() {
  if (typeof navigator !== 'undefined' && /** @type {any} */ (navigator).usb) {
    return { type: 'webusb' };
  }
  return { type: 'unsupported' };
}
