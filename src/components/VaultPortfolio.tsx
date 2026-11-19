import { useState } from 'react';
import { Download, Lock, Unlock } from 'lucide-react';
import type { AiAsset, LimitOrder, PortfolioPosition, TradeTransaction } from '../types/protocol';
import { CATEGORY_LABELS, PROTOCOL_NAMES, formatAssetPrice, formatNumber, formatUsd, truncateHash } from '../utils/format';

interface VaultPortfolioProps {
  assets: AiAsset[];
  portfolio: PortfolioPosition[];
  orders: LimitOrder[];
  trades: TradeTransaction[];
  connectedAddress: string | null;
  onOpenWalletModal: () => void;
  onTradeAsset: (assetId: string) => void;
  onStateSync: (payload: { portfolio?: PortfolioPosition[] }) => void;
}

export function VaultPortfolio({
  assets,
  portfolio,
  orders,
  trades,
  connectedAddress,
  onOpenWalletModal,
  onTradeAsset,
  onStateSync,
}: VaultPortfolioProps) {
  const [stakeMessage, setStakeMessage] = useState<string | null>(null);

  const enriched = portfolio
    .filter((p) => p.balance > 0)
    .map((pos) => {
      const asset = assets.find((a) => a.id === pos.assetId);
      const spot = asset?.priceUsd ?? pos.avgEntryUsd;
      const valueUsd = pos.balance * spot;
      const costUsd = pos.balance * pos.avgEntryUsd;
      const pnlUsd = valueUsd - costUsd;
      return { ...pos, spot, valueUsd, pnlUsd };
    });

  const totalValueUsd = enriched.reduce((sum, p) => sum + p.valueUsd, 0);
  const totalStakedUsd = enriched.reduce((sum, p) => sum + p.stakedForInference * p.spot, 0);
  const totalPnlUsd = enriched.reduce((sum, p) => sum + p.pnlUsd, 0);

  async function handleStakeToggle(pos: PortfolioPosition, action: 'stake' | 'unstake') {
    if (!connectedAddress) {
      onOpenWalletModal();
      return;
    }
    const available = action === 'stake' ? pos.balance - pos.stakedForInference : pos.stakedForInference;
    const stepAmount = Number((available * 0.5).toFixed(4)) || available;
    if (stepAmount <= 0) return;

    const res = await fetch('/api/stake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId: pos.assetId, action, amount: stepAmount }),
    });
    const json = await res.json();
    if (res.ok) {
      onStateSync({ portfolio: json.portfolio });
      setStakeMessage(
        `${action === 'stake' ? 'Staked' : 'Unstaked'} ${formatNumber(stepAmount, 2)} ${pos.symbol} for inference yield.`
      );
    }
  }

  function handleExportAuditJson() {
    const receipt = {
      exportedAt: new Date().toISOString(),
      signer: connectedAddress ?? 'unconnected',
      totalVaultUsd: Number(totalValueUsd.toFixed(2)),
      positions: enriched,
      openLimitOrders: orders.filter((o) => o.status === 'open'),
      recentSettlements: trades.slice(0, 15),
    };
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tensorledger-vault-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Portfolio Valuation Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl border border-slate-800 bg-[#111827]">
          <div className="text-xs text-slate-400">Total Vault Equity</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-100 mt-1">
            {formatUsd(totalValueUsd)}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {connectedAddress ? `Signer ${truncateHash(connectedAddress, 8, 5)}` : 'Preview Vault · Connect Signer to trade'}
          </div>
        </div>

        <div className="p-5 rounded-xl border border-slate-800 bg-[#111827]">
          <div className="text-xs text-slate-400">Staked in Inference Nodes</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-blue-400 mt-1">
            {formatUsd(totalStakedUsd)}
          </div>
          <div className="text-xs text-slate-400 mt-1">Earning verifiable compute & royalty fees</div>
        </div>

        <div className="p-5 rounded-xl border border-slate-800 bg-[#111827]">
          <div className="text-xs text-slate-400">Unrealized Position PnL</div>
          <div
            className={`text-2xl font-semibold font-mono tabular-nums mt-1 ${
              totalPnlUsd >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {totalPnlUsd >= 0 ? '+' : ''}
            {formatUsd(totalPnlUsd)}
          </div>
          <div className="text-xs text-slate-400 mt-1">Marked to live cross-protocol spot index</div>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="p-5 rounded-xl border border-slate-800 bg-[#111827] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100">AI Asset Vault & Inference Staking</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Holdings across tokenized model weights, GPU futures, datasets, autonomous agents, and settlement reserves.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportAuditJson}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-700 text-xs font-medium text-slate-200 hover:border-slate-500"
          >
            <Download className="w-3.5 h-3.5" />
            Export Ledger Receipt
          </button>
        </div>

        {stakeMessage && (
          <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-200">
            {stakeMessage}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 pr-4 font-medium">Asset</th>
                <th className="py-2.5 pr-4 font-medium">Protocol Custody</th>
                <th className="py-2.5 pr-4 font-medium text-right">Total Balance</th>
                <th className="py-2.5 pr-4 font-medium text-right">Staked</th>
                <th className="py-2.5 pr-4 font-medium text-right">Spot Price</th>
                <th className="py-2.5 pr-4 font-medium text-right">USD Value</th>
                <th className="py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {enriched.map((pos) => (
                <tr key={pos.assetId} className="hover:bg-slate-800/30">
                  <td className="py-3 pr-4">
                    <div className="font-mono font-semibold text-slate-100">{pos.symbol}</div>
                    <div className="text-slate-400">{CATEGORY_LABELS[pos.category]}</div>
                  </td>
                  <td className="py-3 pr-4 text-slate-300">{PROTOCOL_NAMES[pos.protocol]}</td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-100">
                    {formatNumber(pos.balance, 4)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-blue-400">
                    {formatNumber(pos.stakedForInference, 4)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-300">
                    {formatAssetPrice(pos.spot)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-100 font-medium">
                    {formatUsd(pos.valueUsd)}
                  </td>
                  <td className="py-3 text-right whitespace-nowrap space-x-2">
                    {pos.assetId !== 'usdc-mesh' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleStakeToggle(pos, 'stake')}
                          disabled={pos.balance - pos.stakedForInference <= 0}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-700 text-slate-300 hover:text-white disabled:opacity-40"
                        >
                          <Lock className="w-3 h-3" /> Stake 50%
                        </button>
                        {pos.stakedForInference > 0 && (
                          <button
                            type="button"
                            onClick={() => handleStakeToggle(pos, 'unstake')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-700 text-slate-300 hover:text-white"
                          >
                            <Unlock className="w-3 h-3" /> Unstake
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onTradeAsset(pos.assetId)}
                          className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium"
                        >
                          Trade
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
