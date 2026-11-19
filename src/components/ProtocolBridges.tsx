import { useState } from 'react';
import { ArrowRight, Check, Copy, Lock, ShieldCheck, X } from 'lucide-react';
import type {
  AiAsset,
  ChainBlock,
  LiquidityPool,
  PortfolioPosition,
  ProtocolId,
  ProtocolInfo,
  TradeTransaction,
} from '../types/protocol';
import { PROTOCOL_NAMES, formatNumber, formatUsd, truncateHash } from '../utils/format';

interface ProtocolBridgesProps {
  protocols: ProtocolInfo[];
  assets: AiAsset[];
  pools: LiquidityPool[];
  portfolio: PortfolioPosition[];
  connectedAddress: string | null;
  onOpenWalletModal: () => void;
  onStateSync: (payload: {
    portfolio?: PortfolioPosition[];
    assets?: AiAsset[];
    pools?: LiquidityPool[];
    blocks?: ChainBlock[];
    trades?: TradeTransaction[];
  }) => void;
}

export function ProtocolBridges({
  protocols,
  assets,
  pools,
  portfolio,
  connectedAddress,
  onOpenWalletModal,
  onStateSync,
}: ProtocolBridgesProps) {
  const [bridgeAssetId, setBridgeAssetId] = useState<string>('cbai');
  const [fromProto, setFromProto] = useState<ProtocolId>('tensorledger');
  const [toProto, setToProto] = useState<ProtocolId>('bittensor');
  const [bridgeAmount, setBridgeAmount] = useState<string>('25');
  const [bridging, setBridging] = useState(false);
  const [bridgeFeedback, setBridgeFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [copiedContract, setCopiedContract] = useState<string | null>(null);

  // Pool Liquidity Modal
  const [activePool, setActivePool] = useState<LiquidityPool | null>(null);
  const [lpAction, setLpAction] = useState<'add' | 'remove'>('add');
  const [lpAmountUsd, setLpAmountUsd] = useState<string>('2500');
  const [lpLoading, setLpLoading] = useState(false);
  const [lpError, setLpError] = useState<string | null>(null);

  const selectedAsset = assets.find((a) => a.id === bridgeAssetId) ?? assets[0];
  const holding = portfolio.find((p) => p.assetId === selectedAsset.id);
  const available = holding ? Math.max(0, holding.balance - holding.stakedForInference) : 0;
  const destProtoInfo = protocols.find((p) => p.id === toProto) ?? protocols[0];

  function copyAddress(addr: string) {
    navigator.clipboard?.writeText(addr);
    setCopiedContract(addr);
    setTimeout(() => setCopiedContract(null), 1600);
  }

  async function handleExecuteBridge() {
    if (!connectedAddress) {
      onOpenWalletModal();
      return;
    }
    const amt = Number(bridgeAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;

    setBridging(true);
    setBridgeFeedback(null);
    try {
      const res = await fetch('/api/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: bridgeAssetId,
          fromProtocol: fromProto,
          toProtocol: toProto,
          amount: amt,
          signerAddress: connectedAddress,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Bridge failed');

      onStateSync({
        portfolio: json.portfolio,
        assets: json.assets,
        blocks: json.blocks,
        trades: json.trades,
      });
      setBridgeFeedback({
        kind: 'success',
        message: `Bridged ${formatNumber(json.transaction.toAmount)} ${selectedAsset.symbol} from ${
          PROTOCOL_NAMES[fromProto]
        } to ${PROTOCOL_NAMES[toProto]} in block #${json.block.height}`,
      });
    } catch (err) {
      setBridgeFeedback({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Cross-protocol bridge failed.',
      });
    } finally {
      setBridging(false);
    }
  }

  async function handlePoolLiquidity() {
    if (!activePool) return;
    if (!connectedAddress) {
      onOpenWalletModal();
      return;
    }
    const amt = Number(lpAmountUsd);
    if (!Number.isFinite(amt) || amt <= 0) return;

    setLpLoading(true);
    setLpError(null);
    try {
      const res = await fetch('/api/pool/liquidity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId: activePool.id,
          action: lpAction,
          amountUsd: amt,
          signerAddress: connectedAddress,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Liquidity update failed');

      onStateSync({
        pools: json.pools,
        portfolio: json.portfolio,
        blocks: json.blocks,
        trades: json.trades,
      });
      setActivePool(null);
    } catch (err) {
      setLpError(err instanceof Error ? err.message : 'Unable to update liquidity.');
    } finally {
      setLpLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top 2-Column Split: Cross-Protocol Bridge + Escrow Protocol Matrix */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Cross-Protocol Bridge Form */}
        <div className="xl:col-span-5 p-6 rounded-xl border border-slate-800 bg-[#111827] space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-100">ZK Cross-Protocol Asset Bridge</h2>
            <p className="text-xs text-slate-400 mt-1">
              Transfer AI model weights, compute futures, and inference credits across independent blockchains with light-client finality.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span>AI Asset to Bridge</span>
                <button
                  type="button"
                  onClick={() => setBridgeAmount(String(available))}
                  className="font-mono tabular-nums text-blue-400 hover:text-blue-300"
                >
                  Available: {formatNumber(available, 4)} {selectedAsset.symbol}
                </button>
              </div>
              <select
                value={bridgeAssetId}
                onChange={(e) => {
                  const next = assets.find((a) => a.id === e.target.value);
                  setBridgeAssetId(e.target.value);
                  if (next) setFromProto(next.originProtocol);
                }}
                className="w-full bg-[#0B0F17] border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              >
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.symbol} — {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Source Protocol</label>
                <select
                  value={fromProto}
                  onChange={(e) => setFromProto(e.target.value as ProtocolId)}
                  className="w-full bg-[#0B0F17] border border-slate-700 rounded-lg px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  {protocols.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Destination Protocol</label>
                <select
                  value={toProto}
                  onChange={(e) => setToProto(e.target.value as ProtocolId)}
                  className="w-full bg-[#0B0F17] border border-slate-700 rounded-lg px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  {protocols.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Amount ({selectedAsset.symbol})</label>
              <input
                type="number"
                min="0"
                step="any"
                value={bridgeAmount}
                onChange={(e) => setBridgeAmount(e.target.value)}
                className="w-full bg-[#0B0F17] border border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="p-4 rounded-lg border border-slate-800 bg-[#0B0F17] space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span>Bridge Path</span>
                <span className="text-slate-200 inline-flex items-center gap-1.5">
                  {PROTOCOL_NAMES[fromProto]} <ArrowRight className="w-3 h-3" /> {PROTOCOL_NAMES[toProto]}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Destination Bridge Fee</span>
                <span className="font-mono tabular-nums text-slate-200">{destProtoInfo.bridgeFeeBps} bps</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Security Verification</span>
                <span className="text-emerald-400 inline-flex items-center gap-1">
                  <Lock className="w-3 h-3" /> {destProtoInfo.securityModel}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Expected Finality</span>
                <span className="font-mono tabular-nums text-slate-200">{destProtoInfo.settlementTimeSec}s</span>
              </div>
            </div>

            {bridgeFeedback && (
              <div
                className={`p-3 rounded-lg border text-xs ${
                  bridgeFeedback.kind === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-red-500/30 bg-red-500/10 text-red-200'
                }`}
              >
                {bridgeFeedback.message}
              </div>
            )}

            <button
              type="button"
              onClick={handleExecuteBridge}
              disabled={bridging || fromProto === toProto}
              className="w-full py-3 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {!connectedAddress
                ? 'Connect Signer to Bridge'
                : bridging
                ? 'Generating Light-Client Proof...'
                : `Bridge ${selectedAsset.symbol} to ${PROTOCOL_NAMES[toProto]}`}
            </button>
          </div>
        </div>

        {/* Connected Protocols & Escrow Contracts Table */}
        <div className="xl:col-span-7 p-6 rounded-xl border border-slate-800 bg-[#111827] space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Connected Decentralized AI Protocols</h2>
            <p className="text-xs text-slate-400 mt-1">
              Cryptographic escrow contracts, consensus validators, and total value locked across supported networks.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 pr-3 font-medium">Protocol</th>
                  <th className="py-2.5 pr-3 font-medium">Security Model</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Finality</th>
                  <th className="py-2.5 pr-3 font-medium text-right">TVL</th>
                  <th className="py-2.5 font-medium text-right">Escrow Contract</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {protocols.map((proto) => (
                  <tr key={proto.id} className="hover:bg-slate-800/30">
                    <td className="py-3 pr-3">
                      <div className="font-medium text-slate-100">{proto.name}</div>
                      <div className="text-slate-400">
                        {proto.chainType} · {proto.validatorCount} validators
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-slate-300">{proto.securityModel}</td>
                    <td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-200">
                      {proto.settlementTimeSec}s
                    </td>
                    <td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-200">
                      {formatUsd(proto.tvlUsd, true)}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => copyAddress(proto.escrowContract)}
                        className="inline-flex items-center gap-1.5 font-mono text-slate-300 hover:text-white"
                      >
                        {truncateHash(proto.escrowContract, 8, 5)}
                        {copiedContract === proto.escrowContract ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Multi-Protocol Liquidity Pools */}
      <div className="p-6 rounded-xl border border-slate-800 bg-[#111827] space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Decentralized AI Liquidity Pools</h2>
          <p className="text-xs text-slate-400 mt-1">
            Provide settlement liquidity for tokenized model weights, GPU futures, and autonomous agents to earn protocol swap fees.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 pr-4 font-medium">Pool Pair</th>
                <th className="py-2.5 pr-4 font-medium">Host Protocol</th>
                <th className="py-2.5 pr-4 font-medium text-right">Pool TVL</th>
                <th className="py-2.5 pr-4 font-medium text-right">24h Volume</th>
                <th className="py-2.5 pr-4 font-medium text-right">Fee APR</th>
                <th className="py-2.5 pr-4 font-medium text-right">Your LP Position</th>
                <th className="py-2.5 font-medium text-right">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {pools.map((pool) => (
                <tr key={pool.id} className="hover:bg-slate-800/30">
                  <td className="py-3 pr-4">
                    <div className="font-mono font-semibold text-slate-100">{pool.pairLabel}</div>
                    <div className="text-emerald-400 inline-flex items-center gap-1 mt-0.5">
                      <ShieldCheck className="w-3 h-3" /> ZK Escrow Guard
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-slate-300">{PROTOCOL_NAMES[pool.protocol]}</td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-200">
                    {formatUsd(pool.tvlUsd, true)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-300">
                    {formatUsd(pool.volume24hUsd, true)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-emerald-400 font-medium">
                    {pool.aprPct.toFixed(1)}%
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-100">
                    {formatUsd(pool.userShareUsd)}
                  </td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setActivePool(pool);
                        setLpAction('add');
                        setLpError(null);
                      }}
                      className="px-3 py-1.5 rounded-md border border-slate-700 text-slate-200 hover:border-blue-500 hover:text-white transition-colors"
                    >
                      Manage LP
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manage LP Modal */}
      {activePool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#111827] p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-100">{activePool.pairLabel}</h3>
                <div className="text-xs text-slate-400">
                  {PROTOCOL_NAMES[activePool.protocol]} · {activePool.aprPct.toFixed(1)}% Fee APR
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActivePool(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#0B0F17] border border-slate-800">
              <button
                type="button"
                onClick={() => setLpAction('add')}
                className={`py-2 text-xs font-medium rounded-md ${
                  lpAction === 'add' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Add Liquidity
              </button>
              <button
                type="button"
                onClick={() => setLpAction('remove')}
                className={`py-2 text-xs font-medium rounded-md ${
                  lpAction === 'remove' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Remove Liquidity
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span>Settlement Amount (USDC)</span>
                <span className="font-mono tabular-nums">
                  Current LP: {formatUsd(activePool.userShareUsd)}
                </span>
              </div>
              <input
                type="number"
                min="0"
                step="any"
                value={lpAmountUsd}
                onChange={(e) => setLpAmountUsd(e.target.value)}
                className="w-full bg-[#0B0F17] border border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            {lpError && (
              <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-200">
                {lpError}
              </div>
            )}

            <button
              type="button"
              onClick={handlePoolLiquidity}
              disabled={lpLoading}
              className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold"
            >
              {lpLoading ? 'Confirming Escrow...' : lpAction === 'add' ? 'Deposit Liquidity' : 'Withdraw Liquidity'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
