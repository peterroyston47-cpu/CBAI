export type ProtocolId =
  | 'tensorledger'
  | 'bittensor'
  | 'akash'
  | 'ritual'
  | 'fetch-asi'
  | 'near-ai'
  | 'filecoin';

export type AssetCategory =
  | 'weights'
  | 'compute'
  | 'dataset'
  | 'agent'
  | 'inference';

export interface SecurityAudit {
  auditor: string;
  blockHeight: number;
  invariantChecks: string;
  slashingBondUsd: number;
}

export interface AiAsset {
  id: string;
  symbol: string;
  name: string;
  category: AssetCategory;
  originProtocol: ProtocolId;
  supportedProtocols: ProtocolId[];
  priceUsd: number;
  change24h: number;
  volume24hUsd: number;
  liquidityUsd: number;
  marketCapUsd: number;
  unitLabel: string;
  merkleRoot: string;
  zkProofStatus: 'verified' | 'tee-enclave' | 'attestation-pending';
  securityAudit: SecurityAudit;
  license: string;
  priceHistory: number[];
  description: string;
}

export interface ProtocolInfo {
  id: ProtocolId;
  name: string;
  chainType: string;
  settlementTimeSec: number;
  bridgeFeeBps: number;
  tvlUsd: number;
  securityModel: string;
  validatorCount: number;
  escrowContract: string;
}

export interface OrderBookLevel {
  price: number;
  size: number;
  total: number;
  protocol: ProtocolId;
}

export interface OrderBookSnapshot {
  assetId: string;
  midPrice: number;
  spreadBps: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface RouteHop {
  protocol: ProtocolId;
  pool: string;
  sharePct: number;
}

export interface SwapQuote {
  fromAssetId: string;
  toAssetId: string;
  fromProtocol: ProtocolId;
  toProtocol: ProtocolId;
  inputAmount: number;
  estimatedOutput: number;
  executionPrice: number;
  priceImpactPct: number;
  protocolFeeUsd: number;
  bridgeGasUsd: number;
  routeHops: RouteHop[];
  mevGuardActive: boolean;
  zkProofHash: string;
  timelockSec: number;
}

export interface TradeTransaction {
  id: string;
  txHash: string;
  timestamp: string;
  type: 'swap' | 'limit' | 'bridge' | 'liquidity';
  fromSymbol: string;
  toSymbol: string;
  fromAmount: number;
  toAmount: number;
  usdValue: number;
  fromProtocol: ProtocolId;
  toProtocol: ProtocolId;
  signerAddress: string;
  zkProofHash: string;
  blockNumber: number;
  status: 'settled' | 'escrowed';
}

export interface LimitOrder {
  id: string;
  assetId: string;
  symbol: string;
  side: 'buy' | 'sell';
  limitPriceUsd: number;
  amount: number;
  protocol: ProtocolId;
  createdAt: string;
  status: 'open' | 'filled' | 'cancelled';
}

export interface ChainBlock {
  height: number;
  hash: string;
  stateRoot: string;
  proposer: string;
  protocolOrigin: ProtocolId;
  txCount: number;
  zkProofsVerified: number;
  gasUsedPct: number;
  timestamp: string;
}

export interface PortfolioPosition {
  assetId: string;
  symbol: string;
  name: string;
  category: AssetCategory;
  balance: number;
  avgEntryUsd: number;
  protocol: ProtocolId;
  stakedForInference: number;
}

export interface LiquidityPool {
  id: string;
  pairLabel: string;
  assetAId: string;
  assetBId: string;
  protocol: ProtocolId;
  tvlUsd: number;
  aprPct: number;
  volume24hUsd: number;
  userShareUsd: number;
  zkEscrowVerified: boolean;
}

export interface AiRouteAuditResponse {
  summary: string;
  securityPosture: 'Verified' | 'Caution' | 'Elevated Risk';
  recommendedRoute: string;
  riskFactors: string[];
  cryptographicChecks: string[];
}
