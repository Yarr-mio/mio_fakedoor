import { apiRequest } from './client';
import { ApiError } from './errors';
import {
  isConsentDocumentCode,
  isJsonRecord,
  isServerMode,
  VISIT_CHANNEL_KEYS,
  VISIT_CHANNEL_VALUE_MAX_LENGTH,
  type ApiSuccess,
  type ConsentDocumentCode,
  type ServerAssignedFlags,
  type StartVisitData,
  type StartVisitRequest,
  type VisitChannel,
  type VisitStatusData,
  type VisitorId,
} from './types';

function parseFailure(field: string): never {
  throw new ApiError({ code: 'UNKNOWN', message: `방문 응답 필드 오류 ${field}` });
}

function parseVisitorId(value: unknown): VisitorId | null {
  if (value === null) return null;
  if (typeof value === 'string' && value.length > 0) return value;
  return parseFailure('visitorId');
}

function parseServerAssignedFlags(value: Record<string, unknown>): ServerAssignedFlags {
  if (!isServerMode(value.mode)) return parseFailure('mode');
  if (typeof value.isInternal !== 'boolean') return parseFailure('isInternal');
  return { mode: value.mode, isInternal: value.isInternal };
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

function parseNullableId(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value === 'string' && value.length > 0) return value;
  return parseFailure(field);
}

function sanitizeChannel(channel: VisitChannel | undefined): VisitChannel | undefined {
  if (!channel) return undefined;
  const sanitized: VisitChannel = {};
  for (const key of VISIT_CHANNEL_KEYS) {
    const value = channel[key];
    if (typeof value === 'string' && value.length > 0) {
      sanitized[key] = value.slice(0, VISIT_CHANNEL_VALUE_MAX_LENGTH);
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function parseStartVisitData(value: unknown): StartVisitData {
  if (!isJsonRecord(value)) return parseFailure('data');
  const flags = parseServerAssignedFlags(value);
  if (typeof value.journeyId !== 'string' || value.journeyId.length === 0) return parseFailure('journeyId');
  if (typeof value.liveModeAvailable !== 'boolean') return parseFailure('liveModeAvailable');
  if (typeof value.policyVersion !== 'string' || value.policyVersion.length === 0) return parseFailure('policyVersion');
  return {
    visitorId: parseVisitorId(value.visitorId),
    journeyId: value.journeyId,
    liveModeAvailable: value.liveModeAvailable,
    consentRequired: parseConsentCodes(value.consentRequired, 'consentRequired'),
    policyVersion: value.policyVersion,
    ...flags,
  };
}

function parseVisitStatusData(value: unknown): VisitStatusData {
  if (!isJsonRecord(value)) return parseFailure('data');
  const flags = parseServerAssignedFlags(value);
  if (typeof value.liveModeAvailable !== 'boolean') return parseFailure('liveModeAvailable');
  return {
    visitorId: parseVisitorId(value.visitorId),
    liveModeAvailable: value.liveModeAvailable,
    consentGranted: parseConsentCodes(value.consentGranted, 'consentGranted'),
    consentRequired: parseConsentCodes(value.consentRequired, 'consentRequired'),
    activeConversationId: parseNullableId(value.activeConversationId, 'activeConversationId'),
    ...flags,
  };
}

export function startVisit(input: StartVisitRequest): Promise<ApiSuccess<StartVisitData>> {
  // 방문 시작 쿠키 미발급
  const channel = sanitizeChannel(input.channel);
  const body: StartVisitRequest = channel ? { journeyId: input.journeyId, channel } : { journeyId: input.journeyId };
  return apiRequest<unknown>({ method: 'POST', path: '/v1/visit', body }).then((result) => ({
    ...result,
    data: parseStartVisitData(result.data),
  }));
}

export function getVisit(): Promise<ApiSuccess<VisitStatusData>> {
  return apiRequest<unknown>({ method: 'GET', path: '/v1/visit' }).then((result) => ({
    ...result,
    data: parseVisitStatusData(result.data),
  }));
}
