import { useEffect, useState } from 'react';
import {
  ArrowDownUp,
  CheckCircle2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type {
  AiAsset,
  AiRouteAuditResponse,
  ChainBlock,
  LimitOrder,
  OrderBookSnapshot,
  PortfolioPosition,
  ProtocolId,
  ProtocolInfo,
  SwapQuote,
  TradeTransaction,
} from '../types/protocol';
import {
  CATEGORY_LABELS,
  PROTOCOL_NAMES,
  formatAssetPrice,
  formatNumber,
  formatTimeUtc,
  formatUsd,
  truncateHash,
} from '../utils/format';
import { PriceChart } from './PriceChart';

interface TradeTerminalProps {
  assets: AiAsset[];
  protocols: ProtocolInfo[];
  portfolio: PortfolioPosition[];
  orders: LimitOrder[];
  trades: TradeTransaction[];
  selectedAssetId: string;
  onSelectAsset: (assetId: string) => void;
  connectedAddress: string | null;
  onOpenWalletModal: () => void;
  onStateSync: (payload: {
    portfolio?: PortfolioPosition[];
    assets?: AiAsset[];
    orders?: LimitOrder[];
    blocks?: ChainBlock[];
    trades?: TradeTransaction[];
  }) => void;
}

export function TradeTerminal({
  assets,
  protocols,
  portfolio,
  orders,
  trades,
  selectedAssetId,
  onSelectAsset,
  connectedAddress,
  onOpenWalletModal,
  onStateSync,
}: TradeTerminalProps) {
  const activeAsset = assets.find((a) => a.id === selectedAssetId && a.id !== 'usdc-mesh') ?? assets[1] ?? assets[0];

  const [orderBook, setOrderBook] = useState<OrderBookSnapshot | null>(null);
  const [timeframe, setTimeframe] = useState<'6H' | '12H' | '24H'>('24H');
  const [tradeMode, setTradeMode] = useState<'swap' | 'limit'>('swap');

  // Swap state
  const [fromAssetId, setFromAssetId] = useState<string>('usdc-mesh');
  const [toAssetId, setToAssetId] = useState<string>(activeAsset.id);
  const [fromProtocol, setFromProtocol] = useState<ProtocolId>('tensorledger');
  const [toProtocol, setToProtocol] = useState<ProtocolId>(activeAsset.originProtocol);
  const [inputAmount, setInputAmount] = useState<string>('2500');
  const [mevGuard, setMevGuard] = useState<boolean>(true);
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [executing, setExecuting] = useState<boolean>(false);
  const [tradeFeedback, setTradeFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  // Limit order state
  const [limitSide, setLimitSide] = useState<'buy' | 'sell'>('buy');
  const [limitPrice, setLimitPrice] = useState<string>(String(activeAsset.priceUsd));
  const [limitAmount, setLimitAmount] = useState<string>('50');
  const [limitProtocol, setLimitProtocol] = useState<ProtocolId>(activeAsset.originProtocol);

  // AI Security Audit state
  const [auditLoading, setAuditLoading] = useState<boolean>(false);
  const [auditResult, setAuditResult] = useState<AiRouteAuditResponse | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  // Live Hash Verification state
  const [hashReceipt, setHashReceipt] = useState<{ symbol: string; verificationReceipt: string; verifiedAt: string } | null>(
    null
  );

  useEffect(() => {
    setToAssetId(activeAsset.id);
    setToProtocol(activeAsset.originProtocol);
    setLimitPrice(String(activeAsset.priceUsd));
    setLimitProtocol(activeAsset.originProtocol);
    setAuditResult(null);
    setAuditError(null);
    setHashReceipt(null);
  }, [activeAsset.id]);

  // Fetch orderbook for active asset
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/orderbook/${activeAsset.id}`)
      .then((res) => res.json())
      .then((data: OrderBookSnapshot) => {
        if (!cancelled) setOrderBook(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeAsset.id, activeAsset.priceUsd]);

  // Fetch live swap quote
  useEffect(() => {
    const parsed = Number(inputAmount);
    if (!Number.isFinite(parsed) || parsed <= 0 || fromAssetId === toAssetId) {
      setQuote(null);
      setQuoteError(fromAssetId === toAssetId ? 'Select two distinct assets to swap.' : null);
      return;
    }

    const controller = new AbortController();
    fetch('/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromAssetId,
        toAssetId,
        fromProtocol,
        toProtocol,
        inputAmount: parsed,
        mevGuardActive: mevGuard,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Quote error');
        setQuote(json as SwapQuote);
        setQuoteError(null);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setQuoteError(err instanceof Error ? err.message : 'Unable to compute route');
        }
      });

    return () => controller.abort();
  }, [fromAssetId, toAssetId, fromProtocol, toProtocol, inputAmount, mevGuard]);

  const fromAsset = assets.find((a) => a.id === fromAssetId) ?? assets[0];
  const toAsset = assets.find((a) => a.id === toAssetId) ?? activeAsset;

  const fromHolding = portfolio.find((p) => p.assetId === fromAsset.id);
  const availableFromBalance = fromHolding ? Math.max(0, fromHolding.balance - fromHolding.stakedForInference) : 0;

  const chartSeries =
    timeframe === '6H'
      ? activeAsset.priceHistory.slice(-6)
      : timeframe === '12H'
      ? activeAsset.priceHistory.slice(-12)
      : activeAsset.priceHistory;

  function handleInvertSwap() {
    setFromAssetId(toAssetId);
    setToAssetId(fromAssetId);
    setFromProtocol(toProtocol);
    setToProtocol(fromProtocol);
  }

  async function handleExecuteSwap() {
    if (!connectedAddress) {
      onOpenWalletModal();
      return;
    }
    const parsed = Number(inputAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    setExecuting(true);
    setTradeFeedback(null);
    try {
      const res = await fetch('/api/trade/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAssetId,
          toAssetId,
          fromProtocol,
          toProtocol,
          inputAmount: parsed,
          signerAddress: connectedAddress,
          mevGuardActive: mevGuard,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Swap failed');

      onStateSync({
        portfolio: json.portfolio,
        assets: json.assets,
        blocks: json.blocks,
        trades: json.trades,
      });
      setTradeFeedback({
        kind: 'success',
        message: `Settled ${formatNumber(json.transaction.fromAmount)} ${json.transaction.fromSymbol} → ${formatNumber(
          json.transaction.toAmount
        )} ${json.transaction.toSymbol} in block #${json.block.height}`,
      });
    } catch (err) {
      setTradeFeedback({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Swap execution failed.',
      });
    } finally {
      setExecuting(false);
    }
  }

  async function handlePlaceLimitOrder() {
    if (!connectedAddress) {
      onOpenWalletModal();
      return;
    }
    const price = Number(limitPrice);
    const amount = Number(limitAmount);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(amount) || amount <= 0) return;

    setExecuting(true);
    setTradeFeedback(null);
    try {
      const res = await fetch('/api/trade/limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: activeAsset.id,
          side: limitSide,
          limitPriceUsd: price,
          amount,
          protocol: limitProtocol,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Limit order rejected');

      onStateSync({
        orders: json.orders,
        portfolio: json.portfolio,
        blocks: json.blocks,
      });
      setTradeFeedback({
        kind: 'success',
        message: `Escrowed ${limitSide.toUpperCase()} limit order for ${amount} ${activeAsset.symbol} at ${formatAssetPrice(price)}`,
      });
    } catch (err) {
      setTradeFeedback({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to place limit order.',
      });
    } finally {
      setExecuting(false);
    }
  }

  async function handleCancelOrder(orderId: string) {
    try {
      const res = await fetch(`/api/trade/limit/${orderId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Cancel failed');
      onStateSync({ orders: json.orders, portfolio: json.portfolio });
    } catch (err) {
      setTradeFeedback({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Unable to cancel order.',
      });
    }
  }

  async function handleVerifyAssetHash() {
    try {
      const res = await fetch('/api/verify-hash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: activeAsset.id }),
      });
      const json = await res.json();
      if (res.ok) {
        setHashReceipt(json);
      }
    } catch {
      // ignore transient error
    }
  }

  async function handleRunAiAudit() {
    setAuditLoading(true);
    setAuditError(null);
    setAuditResult(null);
    try {
      const notional = Number(inputAmount) * fromAsset.priceUsd;
      const res = await fetch('/api/ai/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAssetId,
          toAssetId,
          fromProtocol,
          toProtocol,
          amountUsd: Number.isFinite(notional) && notional > 0 ? notional : 1000,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'AI route audit failed.');
      }
      setAuditResult(json as AiRouteAuditResponse);
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'AI audit request failed.');
    } finally {
      setAuditLoading(false);
    }
  }

  const positiveChange = activeAsset.change24h >= 0;
  const openOrders = orders.filter((o) => o.status === 'open');

  return (
    <div className="space-y-6">
      {/* Market Bar + Asset Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-5 rounded-xl border border-slate-800 bg-[#111827]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div>
            <label htmlFor="market-asset-select" className="block text-xs text-slate-400 mb-1">
              Active AI Market Pair
            </label>
            <select
              id="market-asset-select"
              value={activeAsset.id}
              onChange={(e) => onSelectAsset(e.target.value)}
              className="bg-[#0B0F17] border border-slate-700 rounded-lg px-3 py-2 text-sm font-semibold text-slate-100 focus:outline-none focus:border-blue-500"
            >
              {assets
                .filter((a) => a.id !== 'usdc-mesh')
                .map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.symbol} / USDC — {asset.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="hidden sm:block h-9 w-px bg-slate-800" />

          <div className="flex flex-wrap items-center gap-6">
            <div>
              <div className="text-xs text-slate-400">Index Spot Price</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xl font-semibold font-mono tabular-nums text-slate-100">
                  {formatAssetPrice(activeAsset.priceUsd)}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-mono tabular-nums font-medium ${
                    positiveChange ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {positiveChange ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {positiveChange ? '+' : ''}
                  {activeAsset.change24h.toFixed(2)}%
                </span>
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400">24h Cross-Chain Vol</div>
              <div className="text-sm font-mono tabular-nums text-slate-200 mt-1">
                {formatUsd(activeAsset.volume24hUsd, true)}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400">Pool Liquidity</div>
              <div className="text-sm font-mono tabular-nums text-slate-200 mt-1">
                {formatUsd(activeAsset.liquidityUsd, true)}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400">Category · Origin</div>
              <div className="text-sm text-slate-200 mt-1">
                {CATEGORY_LABELS[activeAsset.category]} · {PROTOCOL_NAMES[activeAsset.originProtocol]}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleVerifyAssetHash}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-700 bg-[#0B0F17] text-xs font-medium text-slate-200 hover:border-slate-600 transition-colors whitespace-nowrap shrink-0"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Verify Merkle Root
          </button>
        </div>
      </div>

      {hashReceipt && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>{hashReceipt.symbol}</strong> parity verified against on-chain commitment{' '}
              <span className="font-mono">{truncateHash(hashReceipt.verificationReceipt, 10, 8)}</span>
            </span>
          </div>
          <span className="font-mono text-emerald-300/80 shrink-0">{formatTimeUtc(hashReceipt.verifiedAt)}</span>
        </div>
      )}

      {/* Main 12-Column Trading Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left 8 Columns: Chart + Orderbook + Orders/Trades */}
        <div className="xl:col-span-8 space-y-6">
          {/* Price Chart Surface */}
          <div className="p-5 rounded-xl border border-slate-800 bg-[#111827]">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-100">
                  {activeAsset.name}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {activeAsset.unitLabel} · Audited by {activeAsset.securityAudit.auditor} · Slashing bond{' '}
                  {formatUsd(activeAsset.securityAudit.slashingBondUsd, true)}
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0B0F17] border border-slate-800">
                {(['6H', '12H', '24H'] as const).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setTimeframe(tf)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      timeframe === tf
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            <PriceChart data={chartSeries} symbol={activeAsset.symbol} positive={positiveChange} height={240} />
          </div>

          {/* Multi-Protocol Aggregated Orderbook */}
          <div className="p-5 rounded-xl border border-slate-800 bg-[#111827]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Aggregated Cross-Protocol Orderbook</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Click any price level to pre-fill a Limit Order · Spread {orderBook?.spreadBps ?? 18} bps
                </p>
              </div>
              <div className="text-xs font-mono tabular-nums text-slate-300">
                Mid {formatAssetPrice(orderBook?.midPrice ?? activeAsset.priceUsd)}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Bids */}
              <div>
                <div className="grid grid-cols-3 text-xs text-slate-400 pb-2 border-b border-slate-800">
                  <span>Bid Price</span>
                  <span className="text-right">Size</span>
                  <span className="text-right">Protocol</span>
                </div>
                <div className="divide-y divide-slate-800/60">
                  {orderBook?.bids.slice(0, 6).map((level, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setTradeMode('limit');
                        setLimitSide('sell');
                        setLimitPrice(String(level.price));
                        setLimitProtocol(level.protocol);
                      }}
                      className="w-full grid grid-cols-3 items-center py-2 text-xs hover:bg-slate-800/40 transition-colors text-left"
                    >
                      <span className="font-mono tabular-nums text-emerald-400 font-medium">
                        {formatAssetPrice(level.price)}
                      </span>
                      <span className="font-mono tabular-nums text-slate-200 text-right">
                        {formatNumber(level.size, 2)}
                      </span>
                      <span className="text-slate-400 text-right truncate pl-2">
                        {PROTOCOL_NAMES[level.protocol]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Asks */}
              <div>
                <div className="grid grid-cols-3 text-xs text-slate-400 pb-2 border-b border-slate-800">
                  <span>Ask Price</span>
                  <span className="text-right">Size</span>
                  <span className="text-right">Protocol</span>
                </div>
                <div className="divide-y divide-slate-800/60">
                  {orderBook?.asks.slice(0, 6).map((level, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setTradeMode('limit');
                        setLimitSide('buy');
                        setLimitPrice(String(level.price));
                        setLimitProtocol(level.protocol);
                      }}
                      className="w-full grid grid-cols-3 items-center py-2 text-xs hover:bg-slate-800/40 transition-colors text-left"
                    >
                      <span className="font-mono tabular-nums text-red-400 font-medium">
                        {formatAssetPrice(level.price)}
                      </span>
                      <span className="font-mono tabular-nums text-slate-200 text-right">
                        {formatNumber(level.size, 2)}
                      </span>
                      <span className="text-slate-400 text-right truncate pl-2">
                        {PROTOCOL_NAMES[level.protocol]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Open Limit Orders & Recent Protocol Settlements */}
          <div className="p-5 rounded-xl border border-slate-800 bg-[#111827] space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 mb-3">Open Escrowed Limit Orders ({openOrders.length})</h3>
              {openOrders.length === 0 ? (
                <div className="py-5 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-lg">
                  No open limit orders. Click a price in the orderbook or switch to Limit Order to place one.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Asset</th>
                        <th className="py-2 pr-3 font-medium">Side</th>
                        <th className="py-2 pr-3 font-medium">Protocol</th>
                        <th className="py-2 pr-3 font-medium text-right">Limit Price</th>
                        <th className="py-2 pr-3 font-medium text-right">Amount</th>
                        <th className="py-2 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {openOrders.map((ord) => (
                        <tr key={ord.id} className="hover:bg-slate-800/30">
                          <td className="py-2.5 pr-3 font-mono font-medium text-slate-100">{ord.symbol}</td>
                          <td
                            className={`py-2.5 pr-3 font-medium uppercase ${
                              ord.side === 'buy' ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {ord.side}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-300">{PROTOCOL_NAMES[ord.protocol]}</td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-200">
                            {formatAssetPrice(ord.limitPriceUsd)}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-200">
                            {formatNumber(ord.amount)}
                          </td>
                          <td className="py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleCancelOrder(ord.id)}
                              className="px-2.5 py-1 rounded border border-slate-700 text-slate-300 hover:text-red-300 hover:border-red-500/50 transition-colors"
                            >
                              Cancel
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800">
              <h3 className="text-sm font-semibold text-slate-100 mb-3">Recent Cross-Protocol Settlements</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Tx Hash</th>
                      <th className="py-2 pr-3 font-medium">Execution</th>
                      <th className="py-2 pr-3 font-medium">Protocol Path</th>
                      <th className="py-2 pr-3 font-medium text-right">Notional</th>
                      <th className="py-2 font-medium text-right">Block</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {trades.slice(0, 5).map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 pr-3 font-mono text-blue-400">{truncateHash(tx.txHash, 8, 6)}</td>
                        <td className="py-2.5 pr-3 text-slate-200 font-mono tabular-nums">
                          {formatNumber(tx.fromAmount, 2)} {tx.fromSymbol} → {formatNumber(tx.toAmount, 2)} {tx.toSymbol}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-400">
                          {PROTOCOL_NAMES[tx.fromProtocol]} → {PROTOCOL_NAMES[tx.toProtocol]}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-200">
                          {formatUsd(tx.usdValue)}
                        </td>
                        <td className="py-2.5 text-right font-mono tabular-nums text-slate-400">#{tx.blockNumber}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Right 4 Columns: Atomic Swap & Limit Order Execution Desk */}
        <div className="xl:col-span-4 space-y-5">
          <div className="p-5 rounded-xl border border-slate-800 bg-[#111827] space-y-5">
            {/* Mode Segmented Toggle */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#0B0F17] border border-slate-800">
              <button
                type="button"
                onClick={() => setTradeMode('swap')}
                className={`py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  tradeMode === 'swap' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Atomic Swap
              </button>
              <button
                type="button"
                onClick={() => setTradeMode('limit')}
                className={`py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  tradeMode === 'limit' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Limit Order
              </button>
            </div>

            {tradeMode === 'swap' ? (
              <div className="space-y-4">
                {/* From Asset & Protocol */}
                <div className="p-4 rounded-lg border border-slate-800 bg-[#0B0F17] space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Pay Asset</span>
                    <button
                      type="button"
                      onClick={() => setInputAmount(String(availableFromBalance))}
                      className="font-mono tabular-nums text-blue-400 hover:text-blue-300"
                    >
                      Max: {formatNumber(availableFromBalance, 4)} {fromAsset.symbol}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={inputAmount}
                      onChange={(e) => setInputAmount(e.target.value)}
                      aria-label="Pay asset amount"
                      className="w-full bg-transparent text-lg font-mono tabular-nums font-semibold text-slate-100 focus:outline-none"
                    />
                    <select
                      value={fromAssetId}
                      onChange={(e) => {
                        const next = assets.find((a) => a.id === e.target.value);
                        setFromAssetId(e.target.value);
                        if (next) setFromProtocol(next.originProtocol);
                      }}
                      aria-label="Pay asset selector"
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-100 focus:outline-none focus:border-blue-500"
                    >
                      {assets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.symbol}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                    <span className="text-slate-400">Source Chain</span>
                    <select
                      value={fromProtocol}
                      onChange={(e) => setFromProtocol(e.target.value as ProtocolId)}
                      aria-label="Source protocol"
                      className="bg-transparent text-slate-200 font-medium focus:outline-none text-right"
                    >
                      {fromAsset.supportedProtocols.map((pid) => (
                        <option key={pid} value={pid} className="bg-slate-900">
                          {PROTOCOL_NAMES[pid]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Flip Button */}
                <div className="flex justify-center -my-2 relative z-10">
                  <button
                    type="button"
                    onClick={handleInvertSwap}
                    className="p-2 rounded-lg border border-slate-700 bg-[#111827] text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
                    aria-label="Invert swap pair"
                  >
                    <ArrowDownUp className="w-4 h-4" />
                  </button>
                </div>

                {/* To Asset & Protocol */}
                <div className="p-4 rounded-lg border border-slate-800 bg-[#0B0F17] space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Receive AI Asset</span>
                    <span className="font-mono tabular-nums">
                      Spot: {formatAssetPrice(toAsset.priceUsd)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="w-full text-lg font-mono tabular-nums font-semibold text-emerald-400 truncate">
                      {quote ? formatNumber(quote.estimatedOutput, 4) : '0.0000'}
                    </div>
                    <select
                      value={toAssetId}
                      onChange={(e) => {
                        const next = assets.find((a) => a.id === e.target.value);
                        setToAssetId(e.target.value);
                        if (next) {
                          setToProtocol(next.originProtocol);
                          if (next.id !== 'usdc-mesh') onSelectAsset(next.id);
                        }
                      }}
                      aria-label="Receive asset selector"
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-100 focus:outline-none focus:border-blue-500"
                    >
                      {assets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.symbol}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                    <span className="text-slate-400">Settlement Protocol</span>
                    <select
                      value={toProtocol}
                      onChange={(e) => setToProtocol(e.target.value as ProtocolId)}
                      aria-label="Destination protocol"
                      className="bg-transparent text-slate-200 font-medium focus:outline-none text-right"
                    >
                      {toAsset.supportedProtocols.map((pid) => (
                        <option key={pid} value={pid} className="bg-slate-900">
                          {PROTOCOL_NAMES[pid]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Security & Route Parameters */}
                <div className="p-3.5 rounded-lg border border-slate-800 bg-[#0B0F17] space-y-2.5 text-xs">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="flex items-center gap-2 text-slate-200 font-medium">
                      <Lock className="w-3.5 h-3.5 text-blue-400" />
                      MEV-Protected ZK Escrow
                    </span>
                    <input
                      type="checkbox"
                      checked={mevGuard}
                      onChange={(e) => setMevGuard(e.target.checked)}
                      className="accent-blue-600 w-4 h-4"
                    />
                  </label>

                  {quote && (
                    <>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Price Impact</span>
                        <span className="font-mono tabular-nums text-slate-200">{quote.priceImpactPct}%</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Protocol + Bridge Fee</span>
                        <span className="font-mono tabular-nums text-slate-200">
                          {formatUsd(quote.protocolFeeUsd + quote.bridgeGasUsd)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Atomic Settlement</span>
                        <span className="font-mono tabular-nums text-slate-200">{quote.timelockSec}s finality</span>
                      </div>
                      <div className="pt-2 border-t border-slate-800/80">
                        <div className="text-slate-400 mb-1">Verified Route Path</div>
                        <div className="text-slate-200 leading-relaxed">
                          {quote.routeHops.map((h) => PROTOCOL_NAMES[h.protocol]).join(' → ')}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {quoteError && (
                  <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-200">
                    {quoteError}
                  </div>
                )}

                {tradeFeedback && (
                  <div
                    className={`p-3 rounded-lg border text-xs ${
                      tradeFeedback.kind === 'success'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                        : 'border-red-500/30 bg-red-500/10 text-red-200'
                    }`}
                  >
                    {tradeFeedback.message}
                  </div>
                )}

                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleExecuteSwap}
                    disabled={executing || Boolean(quoteError) || !quote}
                    className="w-full py-3 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
                  >
                    {!connectedAddress
                      ? 'Connect Signer to Swap'
                      : executing
                      ? 'Settling ZK Atomic Swap...'
                      : `Swap ${fromAsset.symbol} for ${toAsset.symbol}`}
                  </button>

                  <button
                    type="button"
                    onClick={handleRunAiAudit}
                    disabled={auditLoading}
                    className="w-full py-2.5 px-4 rounded-lg border border-slate-700 bg-[#0B0F17] hover:border-slate-600 text-slate-200 text-xs font-medium transition-colors"
                  >
                    {auditLoading ? 'Auditing Route & Contracts...' : 'Run AI Route & Security Audit'}
                  </button>
                </div>
              </div>
            ) : (
              /* Limit Order Mode */
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#0B0F17] border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setLimitSide('buy')}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                      limitSide === 'buy' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Buy {activeAsset.symbol}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLimitSide('sell')}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                      limitSide === 'sell' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Sell {activeAsset.symbol}
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Settlement Protocol</label>
                    <select
                      value={limitProtocol}
                      onChange={(e) => setLimitProtocol(e.target.value as ProtocolId)}
                      className="w-full bg-[#0B0F17] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                    >
                      {activeAsset.supportedProtocols.map((pid) => (
                        <option key={pid} value={pid}>
                          {PROTOCOL_NAMES[pid]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Limit Price (USD)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={limitPrice}
                      onChange={(e) => setLimitPrice(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Quantity ({activeAsset.symbol})</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={limitAmount}
                      onChange={(e) => setLimitAmount(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
                    <span className="text-slate-400">Escrowed Value</span>
                    <span className="font-mono tabular-nums text-slate-100 font-medium">
                      {formatUsd((Number(limitPrice) || 0) * (Number(limitAmount) || 0))}
                    </span>
                  </div>
                </div>

                {tradeFeedback && (
                  <div
                    className={`p-3 rounded-lg border text-xs ${
                      tradeFeedback.kind === 'success'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                        : 'border-red-500/30 bg-red-500/10 text-red-200'
                    }`}
                  >
                    {tradeFeedback.message}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handlePlaceLimitOrder}
                  disabled={executing}
                  className="w-full py-3 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                >
                  {!connectedAddress
                    ? 'Connect Signer to Place Order'
                    : executing
                    ? 'Locking Escrow...'
                    : `Place ${limitSide === 'buy' ? 'Buy' : 'Sell'} Limit Order`}
                </button>
              </div>
            )}
          </div>

          {/* AI Security & Route Audit Output Card */}
          {(auditResult || auditError) && (
            <div className="p-5 rounded-xl border border-slate-800 bg-[#111827] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">AI Route Security Audit</h3>
                {auditResult && (
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                      auditResult.securityPosture === 'Verified'
                        ? 'text-emerald-400'
                        : auditResult.securityPosture === 'Caution'
                        ? 'text-amber-400'
                        : 'text-red-400'
                    }`}
                  >
                    {auditResult.securityPosture === 'Verified' ? (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    ) : (
                      <ShieldAlert className="w-3.5 h-3.5" />
                    )}
                    {auditResult.securityPosture}
                  </span>
                )}
              </div>

              {auditError ? (
                <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-200 leading-relaxed">
                  {auditError}
                </div>
              ) : (
                auditResult && (
                  <div className="space-y-3 text-xs">
                    <p className="text-slate-300 leading-relaxed">{auditResult.summary}</p>

                    <div className="pt-2 border-t border-slate-800">
                      <div className="text-slate-400 mb-1">Recommended Route</div>
                      <div className="text-slate-200">{auditResult.recommendedRoute}</div>
                    </div>

                    <div className="pt-2 border-t border-slate-800">
                      <div className="text-slate-400 mb-1">Cryptographic Invariants</div>
                      <ul className="space-y-1 text-slate-300">
                        {auditResult.cryptographicChecks.map((check, i) => (
                          <li key={i}>· {check}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="pt-2 border-t border-slate-800">
                      <div className="text-slate-400 mb-1">Risk Factors</div>
                      <ul className="space-y-1 text-slate-300">
                        {auditResult.riskFactors.map((risk, i) => (
                          <li key={i}>· {risk}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
