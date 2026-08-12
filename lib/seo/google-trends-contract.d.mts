export type GoogleTrendsValidationInput = {
  trendSignals: unknown[];
  trendCollection?: unknown;
  candidateKeywords: string[];
  reportDate: string;
  attestationVerificationKey?: string;
  expectedAttestationClientEmail?: string;
  requireVerifiedAttestation?: boolean;
};

export const GOOGLE_TRENDS_BIGQUERY_PROVIDER: string;
export const GOOGLE_TRENDS_BIGQUERY_METHOD: string;
export const GOOGLE_TRENDS_BIGQUERY_SOURCE_URL: string;
export const GOOGLE_TRENDS_TOP_TERMS_TABLE: string;
export const GOOGLE_TRENDS_TOP_RISING_TERMS_TABLE: string;
export const GOOGLE_TRENDS_ATTESTATION_ALGORITHM: "RSA-SHA256";
export const GOOGLE_TRENDS_TOP_TERMS_SQL_DIGEST: string;
export const GOOGLE_TRENDS_TOP_RISING_TERMS_SQL_DIGEST: string;
export function normalizeGoogleTrendsTerm(value: unknown): string;
export function computeGoogleTrendsCollectionDigest(collection: unknown): string;
export function computeGoogleTrendsResultDigest(rows: unknown[]): string;
export function googleTrendsAttestationKeyFingerprint(key: string): string;
export function attestGoogleTrendsCollection(collection: unknown, options: {
  privateKey: string;
  clientEmail: string;
}): Record<string, unknown>;
export function verifyGoogleTrendsCollectionAttestation(collection: unknown, options: {
  verificationKey: string;
  expectedClientEmail: string;
}): true;
export function isDndDiscoveryTerm(value: unknown): boolean;
export function validateGoogleTrendsEvidence(input: GoogleTrendsValidationInput): {
  trendSignals: unknown[];
  trendCollection: unknown | null;
  attestationVerified: boolean;
};
export function isQualifyingGoogleTrendsSignal(signal: unknown, options?: {
  selectedKeyword?: unknown;
  reportDate?: string;
  trendCollection?: unknown;
  requireBigQuery?: boolean;
  attestationVerificationKey?: string;
  expectedAttestationClientEmail?: string;
}): boolean;
export function summarizeGoogleTrendsEvidence(input: {
  trendSignals?: unknown;
  trendCollection?: unknown;
  reportDate?: string;
  requireBigQuery?: boolean;
  attestationVerificationKey?: string;
  expectedAttestationClientEmail?: string;
}): {
  providerState: string;
  recorded: number;
  observed: number;
  notObserved: number;
  unavailable: number;
  qualifying: number;
};
