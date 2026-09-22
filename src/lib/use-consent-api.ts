'use client';

import { useEffect, useRef, useState } from 'react';
import {
  buildConsentGrants,
  consentRecordErrorMessage,
  consentStatusPollDelayMs,
  consentWithdrawErrorMessage,
  getConsentStatus,
  recordConsent,
  withdrawConsent,
  type ConsentGrant,
  type ConsentRetention,
  type ConsentStatusData,
  type DeletionRecord,
  type RecordConsentData,
  type WithdrawConsentData,
} from '@/lib/api/consent';
import { createIdempotencyKey, isApiError, type ConsentDocumentCode } from '@/lib/api';
import { LEGAL_DOCUMENT_VERSION } from '@/lib/legal-version';
import { currentJourneyId } from '@/lib/need-events';

function grantsFingerprint(grants: ConsentGrant[]): string {
  return grants.map((grant) => `${grant.documentCode}:${grant.documentVersion}:${grant.granted ? '1' : '0'}`).join('|');
}

function withdrawFingerprint(documentCodes?: ConsentDocumentCode[]): string {
  return documentCodes && documentCodes.length > 0 ? [...documentCodes].sort().join(',') : '*';
}

export function useConsentApi() {
  const [recordBusy, setRecordBusy] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<RecordConsentData | null>(null);
  const [retention, setRetention] = useState<ConsentRetention | null>(null);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawal, setWithdrawal] = useState<WithdrawConsentData | null>(null);
  const [status, setStatus] = useState<ConsentStatusData | null>(null);
  const recordAttempt = useRef<{ key: string; fingerprint: string } | null>(null);
  const withdrawAttempt = useRef<{ key: string; fingerprint: string } | null>(null);

  const activeDeletion: DeletionRecord | null = (() => {
    if (!withdrawal) return null;
    return status?.deletions.find((item) => item.operationId === withdrawal.operationId) ?? null;
  })();

  useEffect(() => {
    const operationId = withdrawal?.operationId;
    if (!operationId) return;
    let cancelled = false;
    let timer = 0;
    const tick = async () => {
      try {
        const result = await getConsentStatus(operationId);
        if (cancelled) return;
        setStatus(result.data);
        const deletion = result.data.deletions.find((item) => item.operationId === operationId);
        const nextStatus = deletion?.status ?? 'pending';
        if (nextStatus === 'succeeded' || nextStatus === 'failed') return;
        timer = window.setTimeout(tick, consentStatusPollDelayMs(result.retryAfterSeconds, nextStatus));
      } catch (error) {
        if (cancelled) return;
        setWithdrawError(consentWithdrawErrorMessage(error));
      }
    };
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [withdrawal?.operationId]);

  async function submitRecord(selection: Record<ConsentDocumentCode, boolean>): Promise<RecordConsentData | null> {
    const grants = buildConsentGrants(selection, LEGAL_DOCUMENT_VERSION);
    const fingerprint = grantsFingerprint(grants);
    if (recordAttempt.current?.fingerprint !== fingerprint) {
      recordAttempt.current = { key: createIdempotencyKey(), fingerprint };
    }
    setRecordBusy(true);
    setRecordError(null);
    try {
      const result = await recordConsent({
        journeyId: currentJourneyId(),
        grants,
        idempotencyKey: recordAttempt.current.key,
      });
      setRecorded(result.data);
      setRetention(result.data.retention);
      return result.data;
    } catch (error) {
      if (isApiError(error) && error.code === 'CONFLICT') {
        recordAttempt.current = { key: createIdempotencyKey(), fingerprint };
      }
      setRecordError(consentRecordErrorMessage(error));
      return null;
    } finally {
      setRecordBusy(false);
    }
  }

  async function submitWithdraw(documentCodes?: ConsentDocumentCode[]): Promise<WithdrawConsentData | null> {
    const fingerprint = withdrawFingerprint(documentCodes);
    if (withdrawAttempt.current?.fingerprint !== fingerprint) {
      withdrawAttempt.current = { key: createIdempotencyKey(), fingerprint };
    }
    setWithdrawBusy(true);
    setWithdrawError(null);
    try {
      const result = await withdrawConsent({
        documentCodes,
        idempotencyKey: withdrawAttempt.current.key,
      });
      setWithdrawal(result.data);
      return result.data;
    } catch (error) {
      if (isApiError(error) && error.code === 'CONFLICT') {
        withdrawAttempt.current = { key: createIdempotencyKey(), fingerprint };
      }
      setWithdrawError(consentWithdrawErrorMessage(error));
      return null;
    } finally {
      setWithdrawBusy(false);
    }
  }

  async function retryFailedDeletion(): Promise<WithdrawConsentData | null> {
    if (activeDeletion?.status !== 'failed' || activeDeletion.retryable !== true) return null;
    const fingerprint = withdrawAttempt.current?.fingerprint ?? '*';
    const codes = fingerprint === '*' ? undefined : fingerprint.split(',') as ConsentDocumentCode[];
    withdrawAttempt.current = { key: createIdempotencyKey(), fingerprint };
    return submitWithdraw(codes);
  }

  return {
    recordBusy,
    recordError,
    recorded,
    retention,
    submitRecord,
    withdrawBusy,
    withdrawError,
    withdrawal,
    status,
    activeDeletion,
    submitWithdraw,
    retryFailedDeletion,
  };
}
