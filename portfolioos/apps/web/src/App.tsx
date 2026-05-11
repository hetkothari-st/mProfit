import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { PortfolioListPage } from './pages/portfolios/PortfolioListPage';
import { PortfolioDetailPage } from './pages/portfolios/PortfolioDetailPage';
import { PortfolioGroupDetailPage } from './pages/portfolios/PortfolioGroupDetailPage';
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
import { GmailScanSetupPage } from './pages/mailboxes/GmailScanSetupPage';
import { CasPage } from './pages/cas/CasPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { IngestionPage } from './pages/ingestion/IngestionPage';
import { SendersPage } from './pages/ingestion/SendersPage';
import { ReviewPage } from './pages/ingestion/ReviewPage';
import { VehicleListPage } from './pages/vehicles/VehicleListPage';
import { VehicleDetailPage } from './pages/vehicles/VehicleDetailPage';
import { VehicleValuePage } from './pages/vehicles/VehicleValuePage';
import { CashFlowsPage } from './pages/cashflows/CashFlowsPage';
import { RentalListPage } from './pages/rental/RentalListPage';
import { RentalDetailPage } from './pages/rental/RentalDetailPage';
import { InsuranceListPage } from './pages/insurance/InsuranceListPage';
import { InsuranceDetailPage } from './pages/insurance/InsuranceDetailPage';
import { LoanListPage } from './pages/loans/LoanListPage';
import { LoanDetailPage } from './pages/loans/LoanDetailPage';
import { CreditCardListPage } from './pages/creditCards/CreditCardListPage';
import { CreditCardDetailPage } from './pages/creditCards/CreditCardDetailPage';
import { RealEstateListPage } from './pages/realEstate/RealEstateListPage';
import { RealEstateDetailPage } from './pages/realEstate/RealEstateDetailPage';
import { FixedDepositsPage } from './pages/assetClasses/FixedDepositsPage';
import { FdDetailPage } from './pages/assetClasses/FdDetailPage';
import { BondsPage } from './pages/assetClasses/BondsPage';
import { GoldPage } from './pages/assetClasses/GoldPage';
import { GoldAssetDetailPage } from './pages/assetClasses/GoldAssetDetailPage';
import { CryptoPage } from './pages/assetClasses/CryptoPage';
import { CryptoDetailPage } from './pages/assetClasses/CryptoDetailPage';
import { NpsPage } from './pages/assetClasses/NpsPage';
import { ProvidentFundPage } from './pages/assetClasses/ProvidentFundPage';
import { PfExtensionPairPage } from './pages/pf/PfExtensionPairPage';
import { OtherAssetsPage } from './pages/assetClasses/OtherAssetsPage';
import { PostOfficePage } from './pages/assetClasses/PostOfficePage';
import { FuturesOptionsPage } from './pages/assetClasses/FuturesOptionsPage';
import { ForexPage } from './pages/forex/ForexPage';
import { AccountingPage } from './pages/accounting/AccountingPage';
import { AlertsPage } from './pages/alerts/AlertsPage';
import { OnboardingWizard } from './pages/onboarding/OnboardingWizard';
import { PrivacyPage } from './pages/legal/PrivacyPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingWizard onComplete={() => localStorage.setItem('onboarding_v2_done', '1')} />
          </ProtectedRoute>
        }
      />

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
        <Route path="/portfolio-groups/:id" element={<PortfolioGroupDetailPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/stocks" element={<StocksPage />} />
        <Route path="/mutual-funds" element={<MutualFundsPage />} />
        <Route path="/fo" element={<FuturesOptionsPage />} />
        <Route path="/bonds" element={<BondsPage />} />
        <Route path="/fds" element={<FixedDepositsPage />} />
        <Route path="/fds/:holdingId" element={<FdDetailPage />} />
        <Route path="/gold" element={<GoldPage />} />
        <Route path="/gold/:holdingId" element={<GoldAssetDetailPage />} />
        <Route path="/crypto" element={<CryptoPage />} />
        <Route path="/crypto/:holdingId" element={<CryptoDetailPage />} />
        <Route path="/forex" element={<ForexPage />} />
        <Route path="/provident-fund" element={<ProvidentFundPage />} />
        <Route path="/provident-fund/extension" element={<PfExtensionPairPage />} />
        {/* PPF + EPF merged into /provident-fund. Old paths redirect for back-compat. */}
        <Route path="/ppf" element={<Navigate to="/provident-fund" replace />} />
        <Route path="/epf" element={<Navigate to="/provident-fund" replace />} />
        {/* NPS — disabled until NSDL CRA adapter lands (§10.2) */}
        {/* <Route path="/nps" element={<NpsPage />} /> */}
        <Route path="/post-office" element={<PostOfficePage />} />
        <Route path="/others" element={<OtherAssetsPage />} />
        <Route path="/vehicles" element={<VehicleListPage />} />
        <Route path="/vehicles/value" element={<VehicleValuePage />} />
        <Route path="/vehicles/:id" element={<VehicleDetailPage />} />
        <Route path="/rental" element={<RentalListPage />} />
        <Route path="/rental/:id" element={<RentalDetailPage />} />
        <Route path="/insurance" element={<InsuranceListPage />} />
        <Route path="/insurance/:id" element={<InsuranceDetailPage />} />
        <Route path="/loans" element={<LoanListPage />} />
        <Route path="/loans/:id" element={<LoanDetailPage />} />
        <Route path="/credit-cards" element={<CreditCardListPage />} />
        <Route path="/credit-cards/:id" element={<CreditCardDetailPage />} />
        <Route path="/real-estate" element={<RealEstateListPage />} />
        <Route path="/real-estate/:id" element={<RealEstateDetailPage />} />
        <Route path="/cashflows" element={<CashFlowsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/import/failures" element={<FailuresPage />} />
        {/* /ops/ingestion-failures is the plan-specified ops URL — alias to /import/failures */}
        <Route path="/ops/ingestion-failures" element={<Navigate to="/import/failures" replace />} />
        <Route path="/connectors" element={<ConnectorsPage />} />
        {/* /mailboxes consolidated into /ingestion. Old route preserved
            as a redirect so bookmarked URLs don't 404. */}
        <Route path="/mailboxes" element={<Navigate to="/ingestion" replace />} />
        <Route path="/gmail/callback" element={<GmailCallbackPage />} />
        <Route path="/gmail/scan-setup" element={<GmailScanSetupPage />} />
        <Route path="/cas" element={<CasPage />} />
        <Route path="/ingestion" element={<IngestionPage />} />
        <Route path="/ingestion/senders" element={<SendersPage />} />
        <Route path="/ingestion/history" element={<ReviewPage />} />
        <Route path="/ingestion/review" element={<Navigate to="/ingestion" replace />} />
        <Route path="/ingestion/discovery" element={<Navigate to="/ingestion" replace />} />
        <Route path="/accounting" element={<AccountingPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
