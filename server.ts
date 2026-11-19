import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import {
  INITIAL_ASSETS,
  INITIAL_BLOCKS,
  INITIAL_ORDERS,
  INITIAL_POOLS,
  INITIAL_PORTFOLIO,
  INITIAL_PROTOCOLS,
  INITIAL_TRADES,
  buildOrderBook,
  makeHash,
} from './server/ledgerData.ts';
import { analyzeRouteAndAssetSecurity } from './server/geminiAuditor.ts';
import type {
  AiAsset,
  ChainBlock,
  LimitOrder,
  LiquidityPool,
  PortfolioPosition,
  ProtocolId,
  SwapQuote,
  TradeTransaction,
} from './src/types/protocol.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Server-authoritative ledger state
const protocols = [...INITIAL_PROTOCOLS];
const assets: AiAsset[] = INITIAL_ASSETS.map((a) => ({
  ...a,
  priceHistory: [...a.priceHistory],
  supportedProtocols: [...a.supportedProtocols],
  securityAudit: { ...a.securityAudit },
}));
const pools: LiquidityPool[] = INITIAL_POOLS.map((p) => ({ ...p }));
const portfolio: PortfolioPosition[] = INITIAL_PORTFOLIO.map((p) => ({ ...p }));
const orders: LimitOrder[] = INITIAL_ORDERS.map((o) => ({ ...o }));
const blocks: ChainBlock[] = INITIAL_BLOCKS.map((b) => ({ ...b }));
const trades: TradeTransaction[] = INITIAL_TRADES.map((t) => ({ ...t }));

function findAsset(id: string): AiAsset | undefined {
  return assets.find((a) => a.id === id);
}

function findProtocol(id: ProtocolId) {
  return protocols.find((p) => p.id === id);
}

function upsertPortfolioPosition(
  asset: AiAsset,
  delta: number,
  protocol: ProtocolId,
  execPriceUsd: number
) {
  const existing = portfolio.find((p) => p.assetId === asset.id);
  if (existing) {
    if (delta > 0) {
      const totalCost = existing.balance * existing.avgEntryUsd + delta * execPriceUsd;
      const newBalance = Number((existing.balance + delta).toFixed(6));
      existing.avgEntryUsd = newBalance > 0 ? Number((totalCost / newBalance).toFixed(4)) : execPriceUsd;
      existing.balance = newBalance;
    } else {
      existing.balance = Math.max(0, Number((existing.balance + delta).toFixed(6)));
      if (existing.stakedForInference > existing.balance) {
        existing.stakedForInference = existing.balance;
      }
    }
    existing.protocol = protocol;
  } else if (delta > 0) {
    portfolio.push({
      assetId: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      category: asset.category,
      balance: Number(delta.toFixed(6)),
      avgEntryUsd: Number(execPriceUsd.toFixed(4)),
      protocol,
      stakedForInference: 0,
    });
  }
}

function mintLedgerBlock(protocolOrigin: ProtocolId, zkCount: number): ChainBlock {
  const topHeight = blocks[0]?.height ?? 1948224;
  const newHeight = topHeight + 1;
  const block: ChainBlock = {
    height: newHeight,
    hash: makeHash(`block-${newHeight}-${Date.now()}`),
    stateRoot: makeHash(`state-${newHeight}-${trades.length}-${Date.now()}`),
    proposer: `val-${protocolOrigin}-01`,
    protocolOrigin,
    txCount: 1 + Math.floor(Math.random() * 14),
    zkProofsVerified: zkCount,
    gasUsedPct: Number((42 + Math.random() * 28).toFixed(1)),
    timestamp: new Date().toISOString(),
  };
  blocks.unshift(block);
  if (blocks.length > 30) blocks.pop();
  return block;
}

function computeQuote(params: {
  fromAssetId: string;
  toAssetId: string;
  fromProtocol: ProtocolId;
  toProtocol: ProtocolId;
  inputAmount: number;
  mevGuardActive?: boolean;
}): SwapQuote {
  const fromAsset = findAsset(params.fromAssetId);
  const toAsset = findAsset(params.toAssetId);
  const fromProto = findProtocol(params.fromProtocol);
  const toProto = findProtocol(params.toProtocol);

  if (!fromAsset || !toAsset || !fromProto || !toProto) {
    throw new Error('Invalid asset or protocol identifier.');
  }
  if (!Number.isFinite(params.inputAmount) || params.inputAmount <= 0) {
    throw new Error('Input amount must be greater than zero.');
  }

  const notionalUsd = params.inputAmount * fromAsset.priceUsd;
  const minLiquidity = Math.min(fromAsset.liquidityUsd, toAsset.liquidityUsd);
  const priceImpactPct = Math.min(4.5, Number(((notionalUsd / Math.max(minLiquidity, 1)) * 180).toFixed(4)));
  const protocolFeeBps = fromProto.id === toProto.id ? 6 : fromProto.bridgeFeeBps + toProto.bridgeFeeBps;
  const protocolFeeUsd = Number(((notionalUsd * protocolFeeBps) / 10000).toFixed(4));
  const bridgeGasUsd = fromProto.id === toProto.id ? 0.18 : 1.45;

  const netUsd = Math.max(0, notionalUsd * (1 - priceImpactPct / 100) - protocolFeeUsd);
  const estimatedOutput = Number((netUsd / toAsset.priceUsd).toFixed(6));
  const executionPrice = Number((toAsset.priceUsd * (1 + priceImpactPct / 100)).toFixed(4));

  const routeHops =
    fromProto.id === toProto.id
      ? [
          {
            protocol: fromProto.id,
            pool: `${fromAsset.symbol}/${toAsset.symbol} Direct Pool`,
            sharePct: 100,
          },
        ]
      : [
          {
            protocol: fromProto.id,
            pool: `${fromAsset.symbol}/USDC Escrow`,
            sharePct: 65,
          },
          {
            protocol: 'tensorledger' as ProtocolId,
            pool: 'TensorLedger ZK Atomic Bridge',
            sharePct: 100,
          },
          {
            protocol: toProto.id,
            pool: `USDC/${toAsset.symbol} Settlement`,
            sharePct: 35,
          },
        ];

  return {
    fromAssetId: fromAsset.id,
    toAssetId: toAsset.id,
    fromProtocol: fromProto.id,
    toProtocol: toProto.id,
    inputAmount: params.inputAmount,
    estimatedOutput,
    executionPrice,
    priceImpactPct,
    protocolFeeUsd,
    bridgeGasUsd,
    routeHops,
    mevGuardActive: params.mevGuardActive ?? true,
    zkProofHash: makeHash(`quote-${fromAsset.id}-${toAsset.id}-${params.inputAmount}-${Date.now()}`),
    timelockSec: fromProto.id === toProto.id ? fromProto.settlementTimeSec : fromProto.settlementTimeSec + toProto.settlementTimeSec,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', blockHeight: blocks[0]?.height ?? 0 });
  });

  app.get('/api/state', (_req, res) => {
    res.json({
      protocols,
      assets,
      pools,
      portfolio,
      orders,
      blocks,
      trades,
    });
  });

  app.get('/api/orderbook/:assetId', (req, res) => {
    const asset = findAsset(req.params.assetId);
    if (!asset) {
      res.status(404).json({ error: 'Asset not found.' });
      return;
    }
    res.json(buildOrderBook(asset));
  });

  app.post('/api/quote', (req, res) => {
    try {
      const quote = computeQuote(req.body);
      res.json(quote);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to compute quote.' });
    }
  });

  app.post('/api/trade/swap', (req, res) => {
    try {
      const { fromAssetId, toAssetId, fromProtocol, toProtocol, inputAmount, signerAddress, mevGuardActive } = req.body as {
        fromAssetId: string;
        toAssetId: string;
        fromProtocol: ProtocolId;
        toProtocol: ProtocolId;
        inputAmount: number;
        signerAddress?: string;
        mevGuardActive?: boolean;
      };

      const fromAsset = findAsset(fromAssetId);
      const toAsset = findAsset(toAssetId);
      if (!fromAsset || !toAsset) {
        res.status(404).json({ error: 'Asset not found.' });
        return;
      }

      const holding = portfolio.find((p) => p.assetId === fromAssetId);
      const available = holding ? holding.balance - holding.stakedForInference : 0;
      if (available < inputAmount) {
        res.status(400).json({
          error: `Insufficient available ${fromAsset.symbol} balance. Available: ${available.toFixed(4)} ${fromAsset.symbol}.`,
        });
        return;
      }

      const quote = computeQuote({
        fromAssetId,
        toAssetId,
        fromProtocol,
        toProtocol,
        inputAmount,
        mevGuardActive,
      });

      upsertPortfolioPosition(fromAsset, -inputAmount, fromProtocol, fromAsset.priceUsd);
      upsertPortfolioPosition(toAsset, quote.estimatedOutput, toProtocol, toAsset.priceUsd);

      // Update asset spot metrics realistically
      const notional = inputAmount * fromAsset.priceUsd;
      toAsset.volume24hUsd = Math.round(toAsset.volume24hUsd + notional);
      fromAsset.volume24hUsd = Math.round(fromAsset.volume24hUsd + notional);

      if (toAsset.id !== 'usdc-mesh') {
        const priceMove = Math.min(0.015, notional / Math.max(toAsset.liquidityUsd, 1));
        toAsset.priceUsd = Number((toAsset.priceUsd * (1 + priceMove)).toFixed(toAsset.priceUsd >= 100 ? 2 : 4));
        toAsset.priceHistory.push(toAsset.priceUsd);
        if (toAsset.priceHistory.length > 24) toAsset.priceHistory.shift();
      }

      const block = mintLedgerBlock(toProtocol, 2);
      const tx: TradeTransaction = {
        id: `tx-${Date.now()}`,
        txHash: makeHash(`swap-${fromAsset.id}-${toAsset.id}-${Date.now()}`),
        timestamp: new Date().toISOString(),
        type: 'swap',
        fromSymbol: fromAsset.symbol,
        toSymbol: toAsset.symbol,
        fromAmount: Number(inputAmount.toFixed(4)),
        toAmount: Number(quote.estimatedOutput.toFixed(4)),
        usdValue: Number(notional.toFixed(2)),
        fromProtocol,
        toProtocol,
        signerAddress: signerAddress || '0x74F2...A91C',
        zkProofHash: quote.zkProofHash,
        blockNumber: block.height,
        status: 'settled',
      };
      trades.unshift(tx);
      if (trades.length > 40) trades.pop();

      res.json({ transaction: tx, block, quote, portfolio, assets, blocks, trades });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Swap execution failed.' });
    }
  });

  app.post('/api/trade/limit', (req, res) => {
    const { assetId, side, limitPriceUsd, amount, protocol } = req.body as {
      assetId: string;
      side: 'buy' | 'sell';
      limitPriceUsd: number;
      amount: number;
      protocol: ProtocolId;
    };

    const asset = findAsset(assetId);
    if (!asset) {
      res.status(404).json({ error: 'Asset not found.' });
      return;
    }
    if (!Number.isFinite(limitPriceUsd) || limitPriceUsd <= 0 || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Limit price and amount must be positive numbers.' });
      return;
    }

    if (side === 'buy') {
      const requiredUsd = limitPriceUsd * amount;
      const usdc = portfolio.find((p) => p.assetId === 'usdc-mesh');
      if (!usdc || usdc.balance < requiredUsd) {
        res.status(400).json({ error: `Insufficient USDC to escrow buy limit ($${requiredUsd.toFixed(2)} required).` });
        return;
      }
      usdc.balance = Number((usdc.balance - requiredUsd).toFixed(4));
    } else {
      const pos = portfolio.find((p) => p.assetId === assetId);
      const available = pos ? pos.balance - pos.stakedForInference : 0;
      if (available < amount) {
        res.status(400).json({ error: `Insufficient available ${asset.symbol} for sell limit.` });
        return;
      }
      if (pos) pos.balance = Number((pos.balance - amount).toFixed(6));
    }

    const order: LimitOrder = {
      id: `ord-${Date.now()}`,
      assetId: asset.id,
      symbol: asset.symbol,
      side,
      limitPriceUsd: Number(limitPriceUsd.toFixed(4)),
      amount: Number(amount.toFixed(4)),
      protocol,
      createdAt: new Date().toISOString(),
      status: 'open',
    };
    orders.unshift(order);

    const block = mintLedgerBlock(protocol, 1);
    res.json({ order, orders, portfolio, blocks, block });
  });

  app.delete('/api/trade/limit/:orderId', (req, res) => {
    const order = orders.find((o) => o.id === req.params.orderId);
    if (!order || order.status !== 'open') {
      res.status(404).json({ error: 'Open limit order not found.' });
      return;
    }

    order.status = 'cancelled';
    const asset = findAsset(order.assetId);
    if (order.side === 'buy') {
      const usdcAsset = findAsset('usdc-mesh');
      if (usdcAsset) {
        upsertPortfolioPosition(usdcAsset, order.limitPriceUsd * order.amount, 'tensorledger', 1);
      }
    } else if (asset) {
      upsertPortfolioPosition(asset, order.amount, order.protocol, asset.priceUsd);
    }

    res.json({ order, orders, portfolio });
  });

  app.post('/api/bridge', (req, res) => {
    const { assetId, fromProtocol, toProtocol, amount, signerAddress } = req.body as {
      assetId: string;
      fromProtocol: ProtocolId;
      toProtocol: ProtocolId;
      amount: number;
      signerAddress?: string;
    };

    const asset = findAsset(assetId);
    const fromProto = findProtocol(fromProtocol);
    const toProto = findProtocol(toProtocol);

    if (!asset || !fromProto || !toProto) {
      res.status(400).json({ error: 'Invalid bridge asset or protocol.' });
      return;
    }
    if (fromProtocol === toProtocol) {
      res.status(400).json({ error: 'Source and destination protocols must be different.' });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Bridge amount must be greater than zero.' });
      return;
    }

    const pos = portfolio.find((p) => p.assetId === assetId);
    const available = pos ? pos.balance - pos.stakedForInference : 0;
    if (available < amount) {
      res.status(400).json({ error: `Insufficient available ${asset.symbol} to bridge.` });
      return;
    }

    const bridgeFee = amount * (toProto.bridgeFeeBps / 10000);
    const received = Number((amount - bridgeFee).toFixed(6));

    if (pos) {
      pos.balance = Number((pos.balance - bridgeFee).toFixed(6));
      pos.protocol = toProtocol;
    }

    if (!asset.supportedProtocols.includes(toProtocol)) {
      asset.supportedProtocols.push(toProtocol);
    }

    const block = mintLedgerBlock(toProtocol, 3);
    const tx: TradeTransaction = {
      id: `tx-${Date.now()}`,
      txHash: makeHash(`bridge-${asset.id}-${fromProtocol}-${toProtocol}-${Date.now()}`),
      timestamp: new Date().toISOString(),
      type: 'bridge',
      fromSymbol: asset.symbol,
      toSymbol: asset.symbol,
      fromAmount: Number(amount.toFixed(4)),
      toAmount: received,
      usdValue: Number((amount * asset.priceUsd).toFixed(2)),
      fromProtocol,
      toProtocol,
      signerAddress: signerAddress || '0x74F2...A91C',
      zkProofHash: makeHash(`zk-bridge-${asset.merkleRoot}-${Date.now()}`),
      blockNumber: block.height,
      status: 'settled',
    };
    trades.unshift(tx);

    res.json({ transaction: tx, block, portfolio, assets, blocks, trades });
  });

  app.post('/api/pool/liquidity', (req, res) => {
    const { poolId, action, amountUsd, signerAddress } = req.body as {
      poolId: string;
      action: 'add' | 'remove';
      amountUsd: number;
      signerAddress?: string;
    };

    const pool = pools.find((p) => p.id === poolId);
    if (!pool) {
      res.status(404).json({ error: 'Liquidity pool not found.' });
      return;
    }
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      res.status(400).json({ error: 'Liquidity amount must be positive.' });
      return;
    }

    const usdc = portfolio.find((p) => p.assetId === 'usdc-mesh');
    if (action === 'add') {
      if (!usdc || usdc.balance < amountUsd) {
        res.status(400).json({ error: 'Insufficient USDC settlement balance to provide liquidity.' });
        return;
      }
      usdc.balance = Number((usdc.balance - amountUsd).toFixed(2));
      pool.tvlUsd += amountUsd;
      pool.userShareUsd += amountUsd;
    } else {
      if (pool.userShareUsd < amountUsd) {
        res.status(400).json({ error: 'Amount exceeds your staked LP position.' });
        return;
      }
      pool.tvlUsd = Math.max(0, pool.tvlUsd - amountUsd);
      pool.userShareUsd -= amountUsd;
      if (usdc) usdc.balance = Number((usdc.balance + amountUsd).toFixed(2));
    }

    const block = mintLedgerBlock(pool.protocol, 1);
    const tx: TradeTransaction = {
      id: `tx-${Date.now()}`,
      txHash: makeHash(`lp-${pool.id}-${action}-${Date.now()}`),
      timestamp: new Date().toISOString(),
      type: 'liquidity',
      fromSymbol: action === 'add' ? 'USDC' : pool.pairLabel,
      toSymbol: action === 'add' ? pool.pairLabel : 'USDC',
      fromAmount: Number(amountUsd.toFixed(2)),
      toAmount: Number(amountUsd.toFixed(2)),
      usdValue: Number(amountUsd.toFixed(2)),
      fromProtocol: pool.protocol,
      toProtocol: pool.protocol,
      signerAddress: signerAddress || '0x74F2...A91C',
      zkProofHash: makeHash(`zk-lp-${pool.id}-${Date.now()}`),
      blockNumber: block.height,
      status: 'settled',
    };
    trades.unshift(tx);

    res.json({ pool, pools, portfolio, blocks, trades });
  });

  app.post('/api/stake', (req, res) => {
    const { assetId, action, amount } = req.body as {
      assetId: string;
      action: 'stake' | 'unstake';
      amount: number;
    };
    const pos = portfolio.find((p) => p.assetId === assetId);
    if (!pos) {
      res.status(404).json({ error: 'Asset position not found in vault.' });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Amount must be positive.' });
      return;
    }

    if (action === 'stake') {
      const unstaked = pos.balance - pos.stakedForInference;
      if (unstaked < amount) {
        res.status(400).json({ error: 'Amount exceeds unstaked balance.' });
        return;
      }
      pos.stakedForInference = Number((pos.stakedForInference + amount).toFixed(6));
    } else {
      if (pos.stakedForInference < amount) {
        res.status(400).json({ error: 'Amount exceeds staked balance.' });
        return;
      }
      pos.stakedForInference = Number((pos.stakedForInference - amount).toFixed(6));
    }

    res.json({ portfolio });
  });

  app.post('/api/verify-hash', (req, res) => {
    const { assetId } = req.body as { assetId: string };
    const asset = findAsset(assetId);
    if (!asset) {
      res.status(404).json({ error: 'Asset not found.' });
      return;
    }
    const recomputedProof = makeHash(`verify-${asset.merkleRoot}-${asset.securityAudit.blockHeight}`);
    res.json({
      assetId: asset.id,
      symbol: asset.symbol,
      merkleRoot: asset.merkleRoot,
      zkProofStatus: asset.zkProofStatus,
      auditor: asset.securityAudit.auditor,
      invariantChecks: asset.securityAudit.invariantChecks,
      verificationReceipt: recomputedProof,
      verifiedAt: new Date().toISOString(),
    });
  });

  app.post('/api/ai/audit', async (req, res) => {
    try {
      const { fromAssetId, toAssetId, fromProtocol, toProtocol, amountUsd } = req.body as {
        fromAssetId: string;
        toAssetId: string;
        fromProtocol: ProtocolId;
        toProtocol: ProtocolId;
        amountUsd: number;
      };

      const fromAsset = findAsset(fromAssetId);
      const toAsset = findAsset(toAssetId);
      const fromProto = findProtocol(fromProtocol);
      const toProto = findProtocol(toProtocol);

      if (!fromAsset || !toAsset || !fromProto || !toProto) {
        res.status(400).json({ error: 'Invalid asset or protocol for audit.' });
        return;
      }

      const audit = await analyzeRouteAndAssetSecurity({
        fromAsset,
        toAsset,
        fromProtocol: fromProto,
        toProtocol: toProto,
        amountUsd: Number(amountUsd) || 1000,
      });

      res.json(audit);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI route security audit failed.';
      res.status(500).json({ error: message });
    }
  });

  // Mount Vite dev middleware or serve built static files
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TensorLedger server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start TensorLedger server:', err);
  process.exit(1);
});
