import { apiRequest } from './client';
import { ApiError, ApiTransportError, isApiError } from './errors';
import {
  CONSENT_DOCUMENT_CODES,
  isConsentDocumentCode,
  isJsonRecord,
  type ApiSuccess,
  type ConsentDocumentCode,
} from './types';

export const CONVERSATION_CONTENT_UNTIL_DELETION_OR_WITHDRAWAL = 'until_deletion_or_withdrawal';
export const DELETION_SCOPES = ['conversation_content', 'consent_evidence'] as const;
export type DeletionScope = (typeof DELETION_SCOPES)[number];
export const DELETION_STATUSES = ['pending', 'in_progress', 'succeeded', 'failed'] as const;
export type DeletionStatus = (typeof DELETION_STATUSES)[number];
export const CONSENT_STATUS_POLL_FALLBACK_MS = 3000;

export type ConsentGrant = {
  documentCode: ConsentDocumentCode;
  documentVersion: string;
  granted: boolean;
};

export type ConsentRetention = {
  conversationContent: string;
  deletionDeadlineDays: { database: number; backup: number };
  operationalLogDays: number;
  consentHistoryYears: number;
  sunsetPolicy: string;
};

export type RecordConsentData = {
  recordedAt: string;
  granted: ConsentDocumentCode[];
  declined: ConsentDocumentCode[];
  liveModeUnlocked: boolean;
  retention: ConsentRetention;
};

export type WithdrawConsentData = {
  operationId: string;
  status: DeletionStatus;
  withdrawn: ConsentDocumentCode[];
  deletionScope: DeletionScope[];
  aggregateRetained: boolean;
};

export type ConsentRecord = {
  documentCode: ConsentDocumentCode;
  documentVersion: string;
  granted: boolean;
  grantedAt: string;
  withdrawnAt: string | null;
};

export type DeletionErrorBody = {
  code: string;
  message: string;
};

export type DeletionRecord = {
  operationId: string;
  status: DeletionStatus;
  requestedAt: string;
  completedAt: string | null;
  scope: DeletionScope[];
  error: DeletionErrorBody | null;
  retryable: boolean | null;
};

export type ConsentStatusData = {
  consents: ConsentRecord[];
  deletions: DeletionRecord[];
};

function parseFailure(field: string): never {
  throw new ApiError({ code: 'UNKNOWN', message: `동의 응답 필드 오류 ${field}` });
}

function parseConsentCodes(value: unknown, field: string): ConsentDocumentCode[] {
  if (!Array.isArray(value)) return parseFailure(field);
  const codes: ConsentDocumentCode[] = [];
  for (const item of value) {
    if (!isConsentDocumentCode(item)) return parseFailure(field);
    codes.push(item);
  }
  return codes;
}

function parseIsoTime(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) return parseFailure(field);
  return value;
}

function parseNullableIsoTime(value: unknown, field: string): string | null {
  if (value === null) return null;
  return parseIsoTime(value, field);
}

function parsePositiveInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return parseFailure(field);
  return value;
}

function parseDeletionStatus(value: unknown): DeletionStatus {
  if (typeof value === 'string' && (DELETION_STATUSES as readonly string[]).includes(value)) {
    return value as DeletionStatus;
  }
  return parseFailure('status');
}

function parseDeletionScopes(value: unknown, field: string): DeletionScope[] {
  if (!Array.isArray(value)) return parseFailure(field);
  const scopes: DeletionScope[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !(DELETION_SCOPES as readonly string[]).includes(item)) {
      return parseFailure(field);
    }
    scopes.push(item as DeletionScope);
  }
  return scopes;
}

function parseRetention(value: unknown): ConsentRetention {
  if (!isJsonRecord(value)) return parseFailure('retention');
  if (typeof value.conversationContent !== 'string' || value.conversationContent.length === 0) {
    return parseFailure('conversationContent');
  }
  if (!isJsonRecord(value.deletionDeadlineDays)) return parseFailure('deletionDeadlineDays');
  if (typeof value.sunsetPolicy !== 'string' || value.sunsetPolicy.length === 0) {
    return parseFailure('sunsetPolicy');
  }
  return {
    conversationContent: value.conversationContent,
    deletionDeadlineDays: {
      database: parsePositiveInt(value.deletionDeadlineDays.database, 'database'),
      backup: parsePositiveInt(value.deletionDeadlineDays.backup, 'backup'),
    },
    operationalLogDays: parsePositiveInt(value.operationalLogDays, 'operationalLogDays'),
    consentHistoryYears: parsePositiveInt(value.consentHistoryYears, 'consentHistoryYears'),
    sunsetPolicy: value.sunsetPolicy,
  };
}

function parseRecordConsentData(value: unknown): RecordConsentData {
  if (!isJsonRecord(value)) return parseFailure('data');
  if (typeof value.liveModeUnlocked !== 'boolean') return parseFailure('liveModeUnlocked');
  return {
    recordedAt: parseIsoTime(value.recordedAt, 'recordedAt'),
    granted: parseConsentCodes(value.granted, 'granted'),
    declined: parseConsentCodes(value.declined, 'declined'),
    liveModeUnlocked: value.liveModeUnlocked,
    retention: parseRetention(value.retention),
  };
}

function parseWithdrawConsentData(value: unknown): WithdrawConsentData {
  if (!isJsonRecord(value)) return parseFailure('data');
  if (typeof value.operationId !== 'string' || value.operationId.length === 0) return parseFailure('operationId');
  if (typeof value.aggregateRetained !== 'boolean') return parseFailure('aggregateRetained');
  return {
    operationId: value.operationId,
    status: parseDeletionStatus(value.status),
    withdrawn: parseConsentCodes(value.withdrawn, 'withdrawn'),
    deletionScope: parseDeletionScopes(value.deletionScope, 'deletionScope'),
    aggregateRetained: value.aggregateRetained,
  };
}

function parseConsentRecord(value: unknown): ConsentRecord {
  if (!isJsonRecord(value)) return parseFailure('consents');
  if (!isConsentDocumentCode(value.documentCode)) return parseFailure('documentCode');
  if (typeof value.documentVersion !== 'string' || value.documentVersion.length === 0) {
    return parseFailure('documentVersion');
  }
  if (typeof value.granted !== 'boolean') return parseFailure('granted');
  return {
    documentCode: value.documentCode,
    documentVersion: value.documentVersion,
    granted: value.granted,
    grantedAt: parseIsoTime(value.grantedAt, 'grantedAt'),
    withdrawnAt: parseNullableIsoTime(value.withdrawnAt, 'withdrawnAt'),
  };
}

function parseDeletionError(value: unknown): DeletionErrorBody | null {
  if (value === null) return null;
  if (!isJsonRecord(value) || typeof value.code !== 'string' || typeof value.message !== 'string') {
    return parseFailure('error');
  }
  return { code: value.code, message: value.message };
}

function parseDeletionRecord(value: unknown): DeletionRecord {
  if (!isJsonRecord(value)) return parseFailure('deletions');
  if (typeof value.operationId !== 'string' || value.operationId.length === 0) return parseFailure('operationId');
  if (value.retryable !== null && typeof value.retryable !== 'boolean') return parseFailure('retryable');
  return {
    operationId: value.operationId,
    status: parseDeletionStatus(value.status),
    requestedAt: parseIsoTime(value.requestedAt, 'requestedAt'),
    completedAt: parseNullableIsoTime(value.completedAt, 'completedAt'),
    scope: parseDeletionScopes(value.scope, 'scope'),
    error: parseDeletionError(value.error),
    retryable: value.retryable,
  };
}

function parseConsentStatusData(value: unknown): ConsentStatusData {
  if (!isJsonRecord(value) || !Array.isArray(value.consents) || !Array.isArray(value.deletions)) {
    return parseFailure('data');
  }
  return {
    consents: value.consents.map(parseConsentRecord),
    deletions: value.deletions.map(parseDeletionRecord),
  };
}

export function buildConsentGrants(
  selection: Record<ConsentDocumentCode, boolean>,
  documentVersion: string,
): ConsentGrant[] {
  // 거부도 전송
  const grants = CONSENT_DOCUMENT_CODES.map((documentCode) => ({
    documentCode,
    documentVersion,
    granted: selection[documentCode],
  }));
  const seen = new Set<ConsentDocumentCode>();
  for (const grant of grants) {
    if (seen.has(grant.documentCode)) {
      throw new ApiError({ code: 'VALIDATION_ERROR', message: 'documentCode 중복' });
    }
    seen.add(grant.documentCode);
  }
  if (grants.length < 1 || grants.length > 5) {
    throw new ApiError({ code: 'VALIDATION_ERROR', message: 'grants 개수 오류' });
  }
  return grants;
}

export function endsConversationOnWithdraw(documentCodes: ConsentDocumentCode[] | undefined): boolean {
  if (!documentCodes || documentCodes.length === 0) return true;
  return documentCodes.includes('personal') || documentCodes.includes('sensitive');
}

export function consentStatusPollDelayMs(retryAfterSeconds: number | undefined, status: DeletionStatus): number {
  if (typeof retryAfterSeconds === 'number') return retryAfterSeconds * 1000;
  if (status === 'pending' || status === 'in_progress') return CONSENT_STATUS_POLL_FALLBACK_MS;
  return CONSENT_STATUS_POLL_FALLBACK_MS;
}

export function recordConsent(input: {
  journeyId: string;
  grants: ConsentGrant[];
  idempotencyKey: string;
}): Promise<ApiSuccess<RecordConsentData>> {
  // Idempotency Key 필수
  const body = { journeyId: input.journeyId, grants: input.grants };
  return apiRequest<unknown>({
    method: 'POST',
    path: '/v1/consent',
    body,
    idempotencyKey: input.idempotencyKey,
  }).then((result) => ({
    ...result,
    data: parseRecordConsentData(result.data),
  }));
}

export function withdrawConsent(input: {
  documentCodes?: ConsentDocumentCode[];
  idempotencyKey: string;
}): Promise<ApiSuccess<WithdrawConsentData>> {
  // 생략은 전체 철회
  const body = input.documentCodes ? { documentCodes: input.documentCodes } : {};
  return apiRequest<unknown>({
    method: 'DELETE',
    path: '/v1/consent',
    body,
    idempotencyKey: input.idempotencyKey,
  }).then((result) => ({
    ...result,
    data: parseWithdrawConsentData(result.data),
  }));
}

export function getConsentStatus(operationId?: string): Promise<ApiSuccess<ConsentStatusData>> {
  // Retry After 폴링
  const query = operationId ? `?operationId=${encodeURIComponent(operationId)}` : '';
  return apiRequest<unknown>({
    method: 'GET',
    path: `/v1/consent/status${query}`,
  }).then((result) => ({
    ...result,
    data: parseConsentStatusData(result.data),
  }));
}

export function consentRecordErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.code === 'VALIDATION_ERROR') return '동의 항목 형식을 확인해 주세요';
    if (error.code === 'CONSENT_REQUIRED') return '지금 보이는 문서 버전과 게시 버전이 달라요 문서를 다시 확인해 주세요';
    if (error.code === 'ORIGIN_MISMATCH') return '요청 출처가 허용되지 않아요';
    if (error.code === 'CONFLICT') return '같은 요청으로 다른 내용이 이미 제출되었어요';
    return error.message;
  }
  if (error instanceof ApiTransportError) return '연결에 실패했어요 다시 시도해 주세요';
  return '동의 기록에 실패했어요';
}

export function consentWithdrawErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.code === 'VALIDATION_ERROR') return '철회할 항목을 확인해 주세요';
    if (error.code === 'UNAUTHORIZED') return '방문자 확인이 필요해요';
    if (error.code === 'ORIGIN_MISMATCH') return '요청 출처가 허용되지 않아요';
    if (error.code === 'NOT_FOUND') return '삭제 작업을 찾을 수 없어요';
    if (error.code === 'CONFLICT') return '같은 요청으로 다른 내용이 이미 제출되었어요';
    return error.message;
  }
  if (error instanceof ApiTransportError) return '연결에 실패했어요 다시 시도해 주세요';
  return '철회 요청에 실패했어요';
}
