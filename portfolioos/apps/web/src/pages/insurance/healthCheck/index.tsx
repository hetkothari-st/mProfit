/**
 * Route wrappers that extract URL params and pass them as props.
 * React Router v6 passes params via useParams, not props.
 */

import { useParams, Navigate } from 'react-router-dom';
import { UploadPage } from './UploadPage';
import { ExtractionProgressPage } from './ExtractionProgressPage';
import { VerificationPage } from './VerificationPage';
import { AnalysisProgressPage } from './AnalysisProgressPage';
import { VerdictPage } from './VerdictPage';
import { HealthCheckReportPage } from './HealthCheckReportPage';

export function UploadPageRoute() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/insurance" replace />;
  return <UploadPage policyId={id} />;
}

export function ExtractionProgressRoute() {
  const { checkId } = useParams<{ checkId: string }>();
  if (!checkId) return <Navigate to="/insurance" replace />;
  return <ExtractionProgressPage checkId={checkId} />;
}

export function VerificationPageRoute() {
  const { checkId } = useParams<{ checkId: string }>();
  if (!checkId) return <Navigate to="/insurance" replace />;
  return <VerificationPage checkId={checkId} />;
}

export function AnalysisProgressRoute() {
  const { checkId } = useParams<{ checkId: string }>();
  if (!checkId) return <Navigate to="/insurance" replace />;
  return <AnalysisProgressPage checkId={checkId} />;
}

export function VerdictPageRoute() {
  const { checkId } = useParams<{ checkId: string }>();
  if (!checkId) return <Navigate to="/insurance" replace />;
  return <VerdictPage checkId={checkId} />;
}

export function HealthCheckReportRoute() {
  const { checkId } = useParams<{ checkId: string }>();
  if (!checkId) return <Navigate to="/insurance" replace />;
  return <HealthCheckReportPage checkId={checkId} />;
}
