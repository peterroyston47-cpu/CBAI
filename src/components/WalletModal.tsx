import { useState } from 'react';
import { ShieldCheck, Wallet, X, KeyRound } from 'lucide-react';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectedAddress: string | null;
  walletProviderLabel: string | null;
  onConnect: (address: string, label: string) => void;
  onDisconnect: () => void;
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

export function WalletModal({
  isOpen,
  onClose,
  connectedAddress,
  walletProviderLabel,
  onConnect,
  onDisconnect,
}: WalletModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function handleBrowserWallet() {
    setError(null);
    if (!window.ethereum) {
      setError('No EIP-1193 browser extension wallet detected in this environment.');
      return;
    }
    try {
      setLoading(true);
      const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[];
      if (accounts && accounts[0]) {
        onConnect(accounts[0], 'Browser EIP-1193 Wallet');
        onClose();
      } else {
        setError('Wallet returned no active accounts.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wallet connection rejected.');
    } finally {
      setLoading(false);
    }
  }

  function handleSessionSigner() {
    setError(null);
    onConnect('0x74F28b19C0a4E820B913f8e47A29C014A91C', 'Institutional Session Vault');
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#111827] p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <h2 id="wallet-modal-title" className="text-base font-semibold text-slate-100">
            Cryptographic Signer Connection
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            aria-label="Close wallet modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {connectedAddress ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-slate-800 bg-[#0B0F17]">
                <div className="text-xs text-slate-400 mb-1">Active Signer · {walletProviderLabel}</div>
                <div className="font-mono text-sm text-slate-100 break-all">{connectedAddress}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onDisconnect();
                  onClose();
                }}
                className="w-full py-2.5 px-4 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 text-sm font-medium hover:bg-red-500/20 transition-colors"
              >
                Disconnect Signer
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-400 leading-relaxed">
                Connect an EIP-1193 wallet extension or authorize the local Institutional Session Vault to sign cross-protocol swaps, limit orders, and bridge proofs.
              </p>

              <button
                type="button"
                onClick={handleBrowserWallet}
                disabled={loading}
                className="w-full flex items-center justify-between p-4 rounded-lg border border-slate-800 bg-[#0B0F17] hover:border-slate-700 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <Wallet className="w-5 h-5 text-blue-400 shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-slate-100">Browser Wallet (EIP-1193)</div>
                    <div className="text-xs text-slate-400">MetaMask, Rabby, or hardware bridge</div>
                  </div>
                </div>
                <span className="text-xs font-medium text-slate-300">Connect</span>
              </button>

              <button
                type="button"
                onClick={handleSessionSigner}
                className="w-full flex items-center justify-between p-4 rounded-lg border border-blue-600/40 bg-blue-600/10 hover:bg-blue-600/15 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <KeyRound className="w-5 h-5 text-blue-400 shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-slate-100">Institutional Session Vault</div>
                    <div className="text-xs text-slate-400">Multi-sig signer · 0x74F2...A91C</div>
                  </div>
                </div>
                <span className="text-xs font-medium text-blue-300">Authorize</span>
              </button>

              {error && (
                <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200">
                  {error}
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 text-xs text-slate-400">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>All trades settle through audited escrow contracts with MEV protection.</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
