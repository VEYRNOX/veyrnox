// docs/SendCrypto.integration.md
//
// HOW TO REWIRE SendCrypto.jsx — keep ALL your UI, swap ONLY the fake core.
//
// Your page is already well-structured: WalletSelectorDropdown, AddressInput,
// AmountInput, GasFeeDisplay, VerificationStep, the MFA flow, address-poisoning
// and high-value confirmation — ALL of that stays exactly as is. The only thing
// that changes is the body of the `sendTx` mutation, which today fabricates a
// hash and edits a DB balance. We replace that body with a real local-signed
// broadcast and let the chain be the source of truth.

# 1) Wrap the app (once), near your AuthProvider in App.jsx:

```jsx
import { WalletProvider } from '@/lib/WalletProvider';
// ...
<AuthProvider>
  <WalletProvider>
    {/* existing routes */}
  </WalletProvider>
</AuthProvider>
```

# 2) In SendCrypto.jsx, add imports and the hook:

```jsx
import { useWallet } from '@/lib/WalletProvider';
import { signAndBroadcast } from '@/wallet-core/evm/send';
import { getBalanceEth } from '@/wallet-core/evm/provider';

// inside the component:
const { isUnlocked, accounts, withPrivateKey } = useWallet();
const NETWORK_KEY = 'sepolia'; // testnet-first; mainnet stays gated until audit
```

# 3) REPLACE the body of the `sendTx` mutationFn.
#    BEFORE (the fake core to delete):

```jsx
// const txHash = "0x" + Array.from({ length: 64 }, () =>
//   "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
// await base44.entities.Transaction.create({ ... status: "confirmed", tx_hash: txHash, ... });
// await base44.entities.Wallet.update(walletId, { balance: (selectedWallet.balance || 0) - parseFloat(amount) });
```

#    AFTER (real signing + broadcast). Keep the rate-limit + simulation guards
#    above it if you like; just swap the fund-moving part:

```jsx
if (!isUnlocked) throw new Error('Unlock your wallet to send');

// Map the selected wallet to its HD derivation index (see note below).
const acct = accounts.find(a => a.address.toLowerCase() === selectedWallet.address.toLowerCase());
if (!acct) throw new Error('Selected wallet is not in the unlocked HD set');

// Sign LOCALLY and broadcast. privateKey is transient and never persisted.
const tx = await withPrivateKey(acct.index, (privateKey) =>
  signAndBroadcast({
    networkKey: NETWORK_KEY,
    privateKey,
    to: toAddress,
    amountEth: amount,
  })
);

// Record the REAL hash as 'pending'. Do NOT write balances — read them from chain.
await base44.entities.Transaction.create({
  wallet_id: walletId,
  type: 'send',
  amount: parseFloat(amount),
  currency: selectedWallet.currency,
  to_address: toAddress,
  from_address: selectedWallet.address,
  status: 'pending',          // becomes confirmed after tx.wait()
  tx_hash: tx.hash,           // REAL chain hash
  explorer_url: tx.explorerUrl,
  note,
});

// Confirm in the background, then refresh from chain.
tx.wait(1).then(async () => {
  queryClient.invalidateQueries({ queryKey: ['send-wallets'] });
  queryClient.invalidateQueries({ queryKey: ['transactions'] });
}).catch(() => {/* surface a "still pending / failed" state in UI */});
```

# 4) Make balances read from the chain (source of truth), not the DB.
#    Wherever you currently show selectedWallet.balance, prefer a live read:

```jsx
const { data: liveBalance } = useQuery({
  queryKey: ['evm-balance', NETWORK_KEY, selectedWallet?.address],
  queryFn: () => getBalanceEth(NETWORK_KEY, selectedWallet.address),
  enabled: !!selectedWallet?.address,
  refetchInterval: 15000,
});
// Use liveBalance (string ETH) for the max button and balance checks.
```

# NOTE on wallet identity:
# Today wallets come from base44 autoCreateWallets and carry a DB `address`.
# For the EVM slice, the source of truth for addresses should be the HD
# accounts derived from the vault (accounts[]). The cleanest integration
# (good task for Claude Code) is: when the vault is unlocked, derive N EVM
# accounts and use THOSE as the selectable wallets, persisting only their
# PUBLIC addresses + labels in base44 (never keys). The DB becomes a label/
# cache store; the chain holds truth; the vault holds keys locally.

# WHAT NOT TO CHANGE:
# - All the security UX (MFA, OTP, poisoning, simulation, rate limit) stays.
# - Note: the OTP code generation in sendOTP() uses Math.random() — fine for a
#   non-key UX nicety, but consider crypto.getRandomValues for defense in depth.
#   It is NOT key material, so it's out of scope for the crypto-path audit gate.
```
