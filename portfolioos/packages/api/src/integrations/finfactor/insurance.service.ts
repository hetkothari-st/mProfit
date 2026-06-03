/**
 * Insurance insights via Finfactor (Account Aggregator).
 *
 * Wraps the documented life-insurance and general-insurance endpoints.
 * Same pattern as the MF service — thin pass-through, demo-mode short
 * circuit, no projection / mapping yet (that lands once we have a
 * real upstream payload to validate against).
 */

import { finfactorPost } from './client.js';
import {
  DEMO_GENERAL_INSURANCE_LINKED_ACCOUNTS,
  DEMO_GENERAL_INSURANCE_STATEMENT,
  DEMO_LIFE_INSURANCE_LINKED_ACCOUNTS,
  DEMO_LIFE_INSURANCE_STATEMENT,
  isFinfactorDemoMode,
} from './demo.js';
import type {
  InsuranceLinkedAccountsRequest,
  InsuranceLinkedAccountsResponse,
  InsuranceStatementRequest,
  InsuranceStatementResponse,
} from './types.js';

export function fetchLifeInsuranceLinkedAccounts(
  body: InsuranceLinkedAccountsRequest,
): Promise<InsuranceLinkedAccountsResponse> {
  if (isFinfactorDemoMode()) {
    return Promise.resolve(DEMO_LIFE_INSURANCE_LINKED_ACCOUNTS as InsuranceLinkedAccountsResponse);
  }
  return finfactorPost<InsuranceLinkedAccountsRequest, InsuranceLinkedAccountsResponse>(
    '/pfm/api/v2/life-insurance/user-linked-accounts',
    body,
  );
}

export function fetchLifeInsuranceStatement(
  body: InsuranceStatementRequest,
): Promise<InsuranceStatementResponse> {
  if (isFinfactorDemoMode()) {
    return Promise.resolve(DEMO_LIFE_INSURANCE_STATEMENT as InsuranceStatementResponse);
  }
  return finfactorPost<InsuranceStatementRequest, InsuranceStatementResponse>(
    '/pfm/api/v2/life-insurance/user-account-statement',
    body,
  );
}

export function fetchGeneralInsuranceLinkedAccounts(
  body: InsuranceLinkedAccountsRequest,
): Promise<InsuranceLinkedAccountsResponse> {
  if (isFinfactorDemoMode()) {
    return Promise.resolve(DEMO_GENERAL_INSURANCE_LINKED_ACCOUNTS as InsuranceLinkedAccountsResponse);
  }
  return finfactorPost<InsuranceLinkedAccountsRequest, InsuranceLinkedAccountsResponse>(
    '/pfm/api/v2/general-insurance/user-linked-accounts',
    body,
  );
}

export function fetchGeneralInsuranceStatement(
  body: InsuranceStatementRequest,
): Promise<InsuranceStatementResponse> {
  if (isFinfactorDemoMode()) {
    return Promise.resolve(DEMO_GENERAL_INSURANCE_STATEMENT as InsuranceStatementResponse);
  }
  return finfactorPost<InsuranceStatementRequest, InsuranceStatementResponse>(
    '/pfm/api/v2/general-insurance/user-account-statement',
    body,
  );
}
