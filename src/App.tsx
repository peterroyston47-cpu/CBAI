import { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  Blocks,
  Cpu,
  Layers,
  Menu,
  Wallet,
  X,
} from 'lucide-react';
import type {
  AiAsset,
  ChainBlock,
  LimitOrder,
  LiquidityPool,
  PortfolioPosition,
  ProtocolInfo,
  TradeTransaction,
} from './types/protocol';
import { truncateHash } from './utils/format';
import { TradeTerminal } from './components/TradeTerminal';
import { AssetRegistry } from './components/AssetRegistry';
import { ProtocolBridges } from './components/ProtocolBridges';
import { ChainExplorer } from './components/ChainExplorer';
import { VaultPortfolio } from './components/VaultPortfolio';
import { WalletModal } from './components/WalletModal';

type NavTab = 'trade' | 'registry' | 'bridges' | 'explorer' | 'vault';

const NAV_ITEMS: { id: NavTab; label: string; icon: typeof ArrowLeftRight }[] = [
  { id: 'trade', label: 'Trade Terminal', icon: ArrowLeftRight },
  { id: 'registry', label: 'AI Asset Registry', icon: Cpu },
  { id: 'bridges', label: 'Protocol Bridges', icon: Layers },
  { id: 'explorer', label: 'Chain Explorer', icon: Blocks },
  { id: 'vault', label: 'Vault & Positions', icon: Wallet },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('trade');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [protocols, setProtocols] = useState<ProtocolInfo[]>([]);
  const [assets, setAssets] = useState<AiAsset[]>([]);
  const [pools, setPools] = useState<LiquidityPool[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioPosition[]>([]);
  const [orders, setOrders] = useState<LimitOrder[]>([]);
  const [blocks, setBlocks] = useState<ChainBlock[]>([]);
  const [trades, setTrades] = useState<TradeTransaction[]>([]);

  const [selectedAssetId, setSelectedAssetId] = useState<string>('cbai');
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [walletLabel, setWalletLabel] = useState<string | null>(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  async function fetchLedgerState() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error('Failed to load decentralized ledger state.');
      const data = await res.json();
      setProtocols(data.protocols);
      setAssets(data.assets);
      setPools(data.pools);
      setPortfolio(data.portfolio);
      setOrders(data.orders);
      setBlocks(data.blocks);
      setTrades(data.trades);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to reach TensorLedger node.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLedgerState();
  }, []);

  function handleStateSync(payload: {
    portfolio?: PortfolioPosition[];
    assets?: AiAsset[];
    pools?: LiquidityPool[];
    orders?: LimitOrder[];
    blocks?: ChainBlock[];
    trades?: TradeTransaction[];
  }) {
    if (payload.portfolio) setPortfolio(payload.portfolio);
    if (payload.assets) setAssets(payload.assets);
    if (payload.pools) setPools(payload.pools);
    if (payload.orders) setOrders(payload.orders);
    if (payload.blocks) setBlocks(payload.blocks);
    if (payload.trades) setTrades(payload.trades);
  }

  function handleTradeAssetShortcut(assetId: string) {
    setSelectedAssetId(assetId);
    setActiveTab('trade');
  }

  const activeNavLabel = NAV_ITEMS.find((item) => item.id === activeTab)?.label ?? 'Trade Terminal';
  const latestBlockHeight = blocks[0]?.height ?? 1948224;

  return (
    <div className="min-h-screen flex bg-[#0B0F17] text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 border-r border-slate-800 bg-[#0E131D]">
        <div className="h-16 px-6 flex items-center border-b border-slate-800">
          <span className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
            TensorLedger
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1" aria-label="Primary Workspace">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-600/15 text-blue-400'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-5 border-t border-slate-800 text-xs text-slate-400 space-y-1.5">
          <div className="flex items-center justify-between">
            <span>Consensus Head</span>
            <span className="font-mono tabular-nums text-slate-200">#{latestBlockHeight}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Active Networks</span>
            <span className="font-mono tabular-nums text-slate-200">{protocols.length || 7}</span>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/70" onClick={() => setMobileNavOpen(false)} />
          <aside className="relative w-64 max-w-[80vw] bg-[#0E131D] border-r border-slate-800 flex flex-col z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800">
              <span className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap">
                TensorLedger
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-blue-600/15 text-blue-400'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb on left, 1 primary CTA on right */}
        <header className="h-16 px-4 sm:px-8 border-b border-slate-800 bg-[#0B0F17] flex items-center justify-between gap-8 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-800 text-slate-300 hover:text-white"
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="text-sm text-slate-400 truncate">
              <span>TensorLedger</span>
              <span className="mx-2 text-slate-600">/</span>
              <span className="font-medium text-slate-100">{activeNavLabel}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setWalletModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 font-mono"
          >
            {connectedAddress ? truncateHash(connectedAddress, 6, 4) : 'Connect Wallet'}
          </button>
        </header>

        {/* Main Scrollable Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {loading ? (
            <div className="space-y-6">
              <div className="h-24 rounded-xl border border-slate-800 bg-[#111827] opacity-60" />
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <div className="xl:col-span-8 h-96 rounded-xl border border-slate-800 bg-[#111827] opacity-60" />
                <div className="xl:col-span-4 h-96 rounded-xl border border-slate-800 bg-[#111827] opacity-60" />
              </div>
            </div>
          ) : loadError ? (
            <div className="p-8 rounded-xl border border-red-500/30 bg-red-500/10 text-center space-y-3">
              <div className="text-sm font-medium text-red-200">{loadError}</div>
              <button
                type="button"
                onClick={fetchLedgerState}
                className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-medium text-slate-100 hover:border-slate-500"
              >
                Retry Node Sync
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'trade' && (
                <TradeTerminal
                  assets={assets}
                  protocols={protocols}
                  portfolio={portfolio}
                  orders={orders}
                  trades={trades}
                  selectedAssetId={selectedAssetId}
                  onSelectAsset={setSelectedAssetId}
                  connectedAddress={connectedAddress}
                  onOpenWalletModal={() => setWalletModalOpen(true)}
                  onStateSync={handleStateSync}
                />
              )}

              {activeTab === 'registry' && (
                <AssetRegistry assets={assets} onTradeAsset={handleTradeAssetShortcut} />
              )}

              {activeTab === 'bridges' && (
                <ProtocolBridges
                  protocols={protocols}
                  assets={assets}
                  pools={pools}
                  portfolio={portfolio}
                  connectedAddress={connectedAddress}
                  onOpenWalletModal={() => setWalletModalOpen(true)}
                  onStateSync={handleStateSync}
                />
              )}

              {activeTab === 'explorer' && <ChainExplorer blocks={blocks} trades={trades} />}

              {activeTab === 'vault' && (
                <VaultPortfolio
                  assets={assets}
                  portfolio={portfolio}
                  orders={orders}
                  trades={trades}
                  connectedAddress={connectedAddress}
                  onOpenWalletModal={() => setWalletModalOpen(true)}
                  onTradeAsset={handleTradeAssetShortcut}
                  onStateSync={handleStateSync}
                />
              )}
            </>
          )}
        </main>
      </div>

      <WalletModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
        connectedAddress={connectedAddress}
        walletProviderLabel={walletLabel}
        onConnect={(addr, label) => {
          setConnectedAddress(addr);
          setWalletLabel(label);
        }}
        onDisconnect={() => {
          setConnectedAddress(null);
          setWalletLabel(null);
        }}
      />
    </div>
  );
}
