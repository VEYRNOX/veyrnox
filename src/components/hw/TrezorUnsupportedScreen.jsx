export function TrezorUnsupportedScreen() {
  return (
    <div style={{ padding: '32px 24px', background: '#0D1117', border: '1px solid #1D222B', borderRadius: 12, textAlign: 'center' }}>
      <p style={{ color: '#E8EAF0', fontFamily: 'Schibsted Grotesk, sans-serif', fontSize: 16, margin: '0 0 12px' }}>
        Trezor not supported on iOS
      </p>
      <p style={{ color: '#8B929E', fontFamily: 'Schibsted Grotesk, sans-serif', fontSize: 14, margin: 0 }}>
        iOS does not support USB hardware wallets. Open Veyrnox in a desktop browser (Chrome or Edge) to sign with your Trezor.
      </p>
    </div>
  );
}
