import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { PortfolioListPage } from './pages/portfolios/PortfolioListPage';
import { PortfolioDetailPage } from './pages/portfolios/PortfolioDetailPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { TransactionsPage } from './pages/transactions/TransactionsPage';
import { StocksPage } from './pages/assetClasses/StocksPage';
import { MutualFundsPage } from './pages/assetClasses/MutualFundsPage';
import { ImportPage } from './pages/imports/ImportPage';
import { FailuresPage } from './pages/imports/FailuresPage';
import { ConnectorsPage } from './pages/connectors/ConnectorsPage';
import { MailboxesPage } from './pages/mailboxes/MailboxesPage';
import { GmailCallbackPage } from './pages/mailboxes/GmailCallbackPage';
import { CasPage } from './pages/cas/CasPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { IngestionPage } from './pages/ingestion/IngestionPage';
import { SendersPage } from './pages/ingestion/SendersPage';
import { ReviewPage } from './pages/ingestion/ReviewPage';
import { VehicleListPage } from './pages/vehicles/VehicleListPage';
import { VehicleDetailPage } from './pages/vehicles/VehicleDetailPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/portfolios" element={<PortfolioListPage />} />
        <Route path="/portfolios/:id" element={<PortfolioDetailPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/stocks" element={<StocksPage />} />
        <Route path="/mutual-funds" element={<MutualFundsPage />} />
        <Route path="/fo" element={<PlaceholderPage title="Futures & Options" />} />
        <Route path="/bonds" element={<PlaceholderPage title="Bonds" />} />
        <Route path="/fds" element={<PlaceholderPage title="Fixed Deposits" />} />
        <Route path="/nps" element={<PlaceholderPage title="NPS" />} />
        <Route path="/others" element={<PlaceholderPage title="Other Assets" />} />
        <Route path="/vehicles" element={<VehicleListPage />} />
        <Route path="/vehicles/:id" element={<VehicleDetailPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/import/failures" element={<FailuresPage />} />
        <Route path="/connectors" element={<ConnectorsPage />} />
        <Route path="/mailboxes" element={<MailboxesPage />} />
        <Route path="/gmail/callback" element={<GmailCallbackPage />} />
        <Route path="/cas" element={<CasPage />} />
        <Route path="/ingestion" element={<IngestionPage />} />
        <Route path="/ingestion/senders" element={<SendersPage />} />
        <Route path="/ingestion/history" element={<ReviewPage />} />
        <Route path="/ingestion/review" element={<Navigate to="/ingestion" replace />} />
        <Route path="/ingestion/discovery" element={<Navigate to="/ingestion" replace />} />
        <Route path="/accounting" element={<PlaceholderPage title="Accounting" />} />
        <Route path="/alerts" element={<PlaceholderPage title="Alerts & Reminders" />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
