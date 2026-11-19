import { useState } from 'react';
import { Search, ShieldCheck, X } from 'lucide-react';
import type { ChainBlock, TradeTransaction } from '../types/protocol';
import { PROTOCOL_NAMES, formatNumber, formatTimeUtc, formatUsd, truncateHash } from '../utils/format';

interface ChainExplorerProps {
  blocks: ChainBlock[];
  trades: TradeTransaction[];
}

export function ChainExplorer({ blocks, trades }: ChainExplorerProps) {
  const [query, setQuery] = useState('');
  const [selectedTx, setSelectedTx] = useState<TradeTransaction | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<ChainBlock | null>(null);

  const normalized = query.trim().toLowerCase();

  const filteredBlocks = blocks.filter(
    (b) =>
      !normalized ||
      String(b.height).includes(normalized) ||
      b.hash.toLowerCase().includes(normalized) ||
      b.proposer.toLowerCase().includes(normalized)
  );

  const filteredTrades = trades.filter(
    (t) =>
      !normalized ||
      t.txHash.toLowerCase().includes(normalized) ||
      t.fromSymbol.toLowerCase().includes(normalized) ||
      t.toSymbol.toLowerCase().includes(normalized) ||
      t.zkProofHash.toLowerCase().includes(normalized)
  );

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-slate-800 bg-[#111827]">
        <div>
          <h2 className="text-base font-semibold text-slate-100">TensorLedger Settlement Explorer</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Inspect finalized AI blocks, state Merkle roots, ZK-proof attestations, and cross-protocol settlements.
          </p>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by block #, tx hash, or asset..."
            className="w-full sm:w-80 pl-9 pr-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Blocks Table */}
      <div className="p-5 rounded-xl border border-slate-800 bg-[#111827] space-y-4">
        <h3 className="text-sm font-semibold text-slate-100">Finalized Consensus Blocks</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 pr-4 font-medium">Height</th>
                <th className="py-2.5 pr-4 font-medium">Block Hash</th>
                <th className="py-2.5 pr-4 font-medium">Origin Protocol</th>
                <th className="py-2.5 pr-4 font-medium">Validator</th>
                <th className="py-2.5 pr-4 font-medium text-right">Txs</th>
                <th className="py-2.5 pr-4 font-medium text-right">ZK Proofs</th>
                <th className="py-2.5 font-medium text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredBlocks.map((b) => (
                <tr
                  key={b.height}
                  onClick={() => setSelectedBlock(b)}
                  className="hover:bg-slate-800/35 cursor-pointer transition-colors"
                >
                  <td className="py-3 pr-4 font-mono tabular-nums font-semibold text-blue-400">#{b.height}</td>
                  <td className="py-3 pr-4 font-mono text-slate-200">{truncateHash(b.hash, 10, 8)}</td>
                  <td className="py-3 pr-4 text-slate-300">{PROTOCOL_NAMES[b.protocolOrigin]}</td>
                  <td className="py-3 pr-4 font-mono text-slate-400">{b.proposer}</td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-200">{b.txCount}</td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-emerald-400">{b.zkProofsVerified}</td>
                  <td className="py-3 text-right font-mono tabular-nums text-slate-400">{formatTimeUtc(b.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transactions Ledger */}
      <div className="p-5 rounded-xl border border-slate-800 bg-[#111827] space-y-4">
        <h3 className="text-sm font-semibold text-slate-100">Cross-Protocol Settlement Ledger</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 pr-4 font-medium">Transaction Hash</th>
                <th className="py-2.5 pr-4 font-medium">Operation</th>
                <th className="py-2.5 pr-4 font-medium">Protocol Route</th>
                <th className="py-2.5 pr-4 font-medium text-right">Value</th>
                <th className="py-2.5 pr-4 font-medium">ZK Commitment</th>
                <th className="py-2.5 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredTrades.map((tx) => (
                <tr
                  key={tx.id}
                  onClick={() => setSelectedTx(tx)}
                  className="hover:bg-slate-800/35 cursor-pointer transition-colors"
                >
                  <td className="py-3 pr-4 font-mono text-blue-400">{truncateHash(tx.txHash, 10, 6)}</td>
                  <td className="py-3 pr-4 text-slate-200">
                    <span className="capitalize font-medium">{tx.type}</span> ·{' '}
                    <span className="font-mono tabular-nums">
                      {formatNumber(tx.fromAmount, 2)} {tx.fromSymbol} → {formatNumber(tx.toAmount, 2)} {tx.toSymbol}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-300">
                    {PROTOCOL_NAMES[tx.fromProtocol]} → {PROTOCOL_NAMES[tx.toProtocol]}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-100">
                    {formatUsd(tx.usdValue)}
                  </td>
                  <td className="py-3 pr-4 font-mono text-slate-400">{truncateHash(tx.zkProofHash, 8, 6)}</td>
                  <td className="py-3 text-right">
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Settled
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Block Detail Modal */}
      {selectedBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-[#111827] p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-semibold text-slate-100 font-mono">Block #{selectedBlock.height}</h3>
              <button
                type="button"
                onClick={() => setSelectedBlock(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <div className="text-slate-400">Block Hash</div>
                <div className="font-mono text-slate-100 break-all mt-0.5">{selectedBlock.hash}</div>
              </div>
              <div>
                <div className="text-slate-400">Merkle State Root</div>
                <div className="font-mono text-slate-100 break-all mt-0.5">{selectedBlock.stateRoot}</div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800">
                <div>
                  <div className="text-slate-400">Proposer</div>
                  <div className="font-mono text-slate-200 mt-0.5">{selectedBlock.proposer}</div>
                </div>
                <div>
                  <div className="text-slate-400">Gas Utilization</div>
                  <div className="font-mono tabular-nums text-slate-200 mt-0.5">{selectedBlock.gasUsedPct}%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tx Detail Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-[#111827] p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-semibold text-slate-100">Cryptographic Settlement Receipt</h3>
              <button
                type="button"
                onClick={() => setSelectedTx(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <div className="text-slate-400">Transaction Hash</div>
                <div className="font-mono text-slate-100 break-all mt-0.5">{selectedTx.txHash}</div>
              </div>
              <div>
                <div className="text-slate-400">Zero-Knowledge Proof Commitment</div>
                <div className="font-mono text-emerald-300 break-all mt-0.5">{selectedTx.zkProofHash}</div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800">
                <div>
                  <div className="text-slate-400">Signer</div>
                  <div className="font-mono text-slate-200 mt-0.5">{selectedTx.signerAddress}</div>
                </div>
                <div>
                  <div className="text-slate-400">Included in Block</div>
                  <div className="font-mono tabular-nums text-slate-200 mt-0.5">#{selectedTx.blockNumber}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
