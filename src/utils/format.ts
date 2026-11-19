import type { AssetCategory, ProtocolId } from '../types/protocol';

export const PROTOCOL_NAMES: Record<ProtocolId, string> = {
  tensorledger: 'TensorLedger L1',
  bittensor: 'Bittensor',
  akash: 'Akash Network',
  ritual: 'Ritual Infernet',
  'fetch-asi': 'Fetch.ai / ASI',
  'near-ai': 'NEAR AI',
  filecoin: 'Filecoin FVM',
};

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  weights: 'Model Weights',
  compute: 'GPU Compute',
  dataset: 'Training Dataset',
  agent: 'Autonomous Agent',
  inference: 'Inference Credit',
};

export function formatUsd(value: number, compact = false): string {
  if (compact) {
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  }
  const decimals = value >= 100 ? 2 : value >= 1 ? 2 : 4;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatAssetPrice(value: number): string {
  if (value >= 100) return `$${value.toFixed(2)}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

export function formatNumber(value: number, maxDecimals = 4): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(value);
}

export function truncateHash(hash: string, prefix = 8, suffix = 6): string {
  if (hash.length <= prefix + suffix + 3) return hash;
  return `${hash.slice(0, prefix)}...${hash.slice(-suffix)}`;
}

export function formatTimeUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}
