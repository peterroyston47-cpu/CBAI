import { useState } from 'react';
import { CheckCircle2, Search, ShieldCheck, X } from 'lucide-react';
import type { AiAsset, AssetCategory, ProtocolId } from '../types/protocol';
import {
  CATEGORY_LABELS,
  PROTOCOL_NAMES,
  formatAssetPrice,
  formatUsd,
  truncateHash,
} from '../utils/format';
import { MiniSparkline } from './PriceChart';

interface AssetRegistryProps {
  assets: AiAsset[];
  onTradeAsset: (assetId: string) => void;
}

const CATEGORIES: { id: 'all' | AssetCategory; label: string }[] = [
  { id: 'all', label: 'All AI Assets' },
  { id: 'weights', label: 'Model Weights' },
  { id: 'compute', label: 'GPU Compute' },
  { id: 'dataset', label: 'Training Datasets' },
  { id: 'agent', label: 'Autonomous Agents' },
  { id: 'inference', label: 'Inference Credits' },
];

export function AssetRegistry({ assets, onTradeAsset }: AssetRegistryProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | AssetCategory>('all');
  const [protocolFilter, setProtocolFilter] = useState<'all' | ProtocolId>('all');
  const [inspectedAsset, setInspectedAsset] = useState<AiAsset | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ verificationReceipt: string; verifiedAt: string } | null>(null);

  const filtered = assets.filter((asset) => {
    const matchesSearch =
      asset.symbol.toLowerCase().includes(search.toLowerCase()) ||
      asset.name.toLowerCase().includes(search.toLowerCase()) ||
      asset.merkleRoot.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'all' || asset.category === category;
    const matchesProtocol =
      protocolFilter === 'all' ||
      asset.originProtocol === protocolFilter ||
      asset.supportedProtocols.includes(protocolFilter);
    return matchesSearch && matchesCategory && matchesProtocol;
  });

  async function handleInspectAsset(asset: AiAsset) {
    setInspectedAsset(asset);
    setVerifyResult(null);
  }

  async function handleRunLiveVerify(assetId: string) {
    setVerifyLoading(true);
    try {
      const res = await fetch('/api/verify-hash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId }),
      });
      const json = await res.json();
      if (res.ok) setVerifyResult(json);
    } finally {
      setVerifyLoading(false);
    }
  }

  const totalMcap = assets.reduce((sum, a) => sum + a.marketCapUsd, 0);
  const totalVol = assets.reduce((sum, a) => sum + a.volume24hUsd, 0);

  return (
    <div className="space-y-6">
      {/* Header Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl border border-slate-800 bg-[#111827]">
          <div className="text-xs text-slate-400">Tokenized AI Asset Universe</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-100 mt-1">
            {assets.length} Verified Markets
          </div>
          <div className="text-xs text-slate-400 mt-1">Weights · Compute · Datasets · Agents · Inference</div>
        </div>
        <div className="p-5 rounded-xl border border-slate-800 bg-[#111827]">
          <div className="text-xs text-slate-400">Aggregate AI Asset Market Cap</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-100 mt-1">
            {formatUsd(totalMcap, true)}
          </div>
          <div className="text-xs text-slate-400 mt-1">Backed by Merkle weight commitments</div>
        </div>
        <div className="p-5 rounded-xl border border-slate-800 bg-[#111827]">
          <div className="text-xs text-slate-400">24h Cross-Protocol Volume</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-100 mt-1">
            {formatUsd(totalVol, true)}
          </div>
          <div className="text-xs text-slate-400 mt-1">Settled across 7 decentralized networks</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-5 rounded-xl border border-slate-800 bg-[#111827] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#0B0F17] border border-slate-800">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  category === cat.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search symbol, model, or hash..."
                className="w-full sm:w-64 pl-9 pr-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <select
              value={protocolFilter}
              onChange={(e) => setProtocolFilter(e.target.value as 'all' | ProtocolId)}
              aria-label="Filter by decentralized protocol"
              className="bg-[#0B0F17] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Protocols</option>
              {Object.entries(PROTOCOL_NAMES).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* High-Density Data Grid */}
        {filtered.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-slate-800 rounded-lg space-y-2">
            <div className="text-sm font-medium text-slate-300">No AI assets match your current filters</div>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCategory('all');
                setProtocolFilter('all');
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 hover:bg-slate-800"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 pr-4 font-medium">AI Asset</th>
                  <th className="py-3 pr-4 font-medium">Class · Origin</th>
                  <th className="py-3 pr-4 font-medium">24h Trend</th>
                  <th className="py-3 pr-4 font-medium text-right">Spot Price</th>
                  <th className="py-3 pr-4 font-medium text-right">24h Change</th>
                  <th className="py-3 pr-4 font-medium text-right">Liquidity</th>
                  <th className="py-3 pr-4 font-medium">Verification</th>
                  <th className="py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filtered.map((asset) => {
                  const pos = asset.change24h >= 0;
                  return (
                    <tr key={asset.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="font-mono font-semibold text-slate-100">{asset.symbol}</div>
                        <div className="text-slate-400 truncate max-w-[220px]">{asset.name}</div>
                      </td>
                      <td className="py-3 pr-4 text-slate-300 whitespace-nowrap">
                        {CATEGORY_LABELS[asset.category]} · {PROTOCOL_NAMES[asset.originProtocol]}
                      </td>
                      <td className="py-3 pr-4">
                        <MiniSparkline data={asset.priceHistory} positive={pos} />
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-100 font-medium">
                        {formatAssetPrice(asset.priceUsd)}
                      </td>
                      <td
                        className={`py-3 pr-4 text-right font-mono tabular-nums font-medium ${
                          pos ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {pos ? '+' : ''}
                        {asset.change24h.toFixed(2)}%
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-300">
                        {formatUsd(asset.liquidityUsd, true)}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 font-medium ${
                            asset.zkProofStatus === 'verified'
                              ? 'text-emerald-400'
                              : asset.zkProofStatus === 'tee-enclave'
                              ? 'text-blue-400'
                              : 'text-amber-400'
                          }`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {asset.zkProofStatus === 'verified'
                            ? 'zkML Verified'
                            : asset.zkProofStatus === 'tee-enclave'
                            ? 'TEE Enclave'
                            : 'Attestation Pending'}
                        </span>
                      </td>
                      <td className="py-3 text-right whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={() => handleInspectAsset(asset)}
                          className="px-2.5 py-1.5 rounded-md border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
                        >
                          Inspect
                        </button>
                        {asset.id !== 'usdc-mesh' && (
                          <button
                            type="button"
                            onClick={() => onTradeAsset(asset.id)}
                            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
                          >
                            Trade
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Asset Provenance & Cryptographic Audit Modal */}
      {inspectedAsset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl rounded-xl border border-slate-800 bg-[#111827] p-6 space-y-5">
            <div className="flex items-start justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  {inspectedAsset.symbol} — {inspectedAsset.name}
                </h3>
                <div className="text-xs text-slate-400 mt-1">
                  {CATEGORY_LABELS[inspectedAsset.category]} · {inspectedAsset.license}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectedAsset(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                aria-label="Close asset inspection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">{inspectedAsset.description}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg border border-slate-800 bg-[#0B0F17] text-xs">
              <div>
                <div className="text-slate-400">On-Chain Weight / Corpus Merkle Root</div>
                <div className="font-mono text-slate-100 mt-1 break-all">{inspectedAsset.merkleRoot}</div>
              </div>
              <div>
                <div className="text-slate-400">Security Auditor & Bond</div>
                <div className="text-slate-100 mt-1">
                  {inspectedAsset.securityAudit.auditor} · {formatUsd(inspectedAsset.securityAudit.slashingBondUsd, true)}{' '}
                  bond
                </div>
                <div className="text-slate-400 mt-0.5">{inspectedAsset.securityAudit.invariantChecks}</div>
              </div>
              <div className="sm:col-span-2 pt-2 border-t border-slate-800">
                <div className="text-slate-400 mb-1">Supported Settlement Protocols</div>
                <div className="text-slate-200">
                  {inspectedAsset.supportedProtocols.map((p) => PROTOCOL_NAMES[p]).join(' · ')}
                </div>
              </div>
            </div>

            {verifyResult && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Cryptographic proof verified: <span className="font-mono">{truncateHash(verifyResult.verificationReceipt, 12, 8)}</span>
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleRunLiveVerify(inspectedAsset.id)}
                disabled={verifyLoading}
                className="px-4 py-2 rounded-lg border border-slate-700 text-xs font-medium text-slate-200 hover:border-slate-500"
              >
                {verifyLoading ? 'Verifying SHA-256 Parity...' : 'Run Live Hash Verification'}
              </button>
              {inspectedAsset.id !== 'usdc-mesh' && (
                <button
                  type="button"
                  onClick={() => {
                    onTradeAsset(inspectedAsset.id);
                    setInspectedAsset(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
                >
                  Open in Trade Terminal
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
