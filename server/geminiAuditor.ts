import { GoogleGenAI, Type } from '@google/genai';
import type { AiAsset, AiRouteAuditResponse, ProtocolInfo } from '../src/types/protocol.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function analyzeRouteAndAssetSecurity(params: {
  fromAsset: AiAsset;
  toAsset: AiAsset;
  fromProtocol: ProtocolInfo;
  toProtocol: ProtocolInfo;
  amountUsd: number;
}): Promise<AiRouteAuditResponse> {
  const ai = getAiClient();

  const prompt = `Analyze a cross-protocol AI asset trade on TensorLedger:
- From Asset: ${params.fromAsset.symbol} (${params.fromAsset.name}, Category: ${params.fromAsset.category}, ZK Status: ${params.fromAsset.zkProofStatus})
- To Asset: ${params.toAsset.symbol} (${params.toAsset.name}, Category: ${params.toAsset.category}, ZK Status: ${params.toAsset.zkProofStatus})
- Source Protocol: ${params.fromProtocol.name} (${params.fromProtocol.chainType}, Security: ${params.fromProtocol.securityModel}, Settlement: ${params.fromProtocol.settlementTimeSec}s)
- Destination Protocol: ${params.toProtocol.name} (${params.toProtocol.chainType}, Security: ${params.toProtocol.securityModel}, Settlement: ${params.toProtocol.settlementTimeSec}s)
- Trade Notional: $${params.amountUsd.toFixed(2)} USD
- Destination Merkle Root: ${params.toAsset.merkleRoot}
- Auditor: ${params.toAsset.securityAudit.auditor} (${params.toAsset.securityAudit.invariantChecks}, Slashing Bond: $${params.toAsset.securityAudit.slashingBondUsd.toLocaleString()})

Provide a concise, institutional-grade security & liquidity routing audit.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'You are an institutional blockchain security auditor and cross-chain liquidity routing analyst. Be concise, precise, and objective.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: '2-sentence executive summary of cross-protocol settlement safety and liquidity depth.',
          },
          securityPosture: {
            type: Type.STRING,
            description: 'Must be exactly one of: Verified, Caution, Elevated Risk',
          },
          recommendedRoute: {
            type: Type.STRING,
            description: 'Recommended atomic execution path across protocols.',
          },
          riskFactors: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2 to 3 concrete risk checks (e.g. slippage, bridge finality, attestation status).',
          },
          cryptographicChecks: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2 to 3 cryptographic verification invariants satisfied.',
          },
        },
        required: ['summary', 'securityPosture', 'recommendedRoute', 'riskFactors', 'cryptographicChecks'],
      },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('Empty response received from Gemini route auditor.');
  }

  const parsed = JSON.parse(text) as AiRouteAuditResponse;
  return parsed;
}
