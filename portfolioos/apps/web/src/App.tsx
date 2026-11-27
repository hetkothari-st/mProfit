import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RouteFallback } from './components/layout/RouteFallback';
import { NotFoundPage } from './pages/notFound/NotFoundPage';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { RedirectIfSignedIn } from './components/auth/RedirectIfSignedIn';
import { NotWhileManaging } from './components/family/NotWhileManaging';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { ProfessionalTwoFactorGate } from './components/ca/ProfessionalTwoFactorGate';

// Each page is its own chunk: a visitor downloads the shell plus the page they open, not all ~100.
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const PortfolioListPage = lazy(() => import('./pages/portfolios/PortfolioListPage').then((m) => ({ default: m.PortfolioListPage })));
const PortfolioDetailPage = lazy(() => import('./pages/portfolios/PortfolioDetailPage').then((m) => ({ default: m.PortfolioDetailPage })));
const PortfolioGroupDetailPage = lazy(() => import('./pages/portfolios/PortfolioGroupDetailPage').then((m) => ({ default: m.PortfolioGroupDetailPage })));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const AcceptInvitationPage = lazy(() => import('./pages/family/AcceptInvitationPage').then((m) => ({ default: m.AcceptInvitationPage })));
const ClaimProfilePage = lazy(() => import('./pages/family/ClaimProfilePage').then((m) => ({ default: m.ClaimProfilePage })));
const FamilyPage = lazy(() => import('./pages/family/FamilyPage').then((m) => ({ default: m.FamilyPage })));
const CaWorkspacePage = lazy(() => import('./pages/ca/CaWorkspacePage').then((m) => ({ default: m.CaWorkspacePage })));
const ClientBooksPage = lazy(() => import('./pages/ca/ClientBooksPage').then((m) => ({ default: m.ClientBooksPage })));
const AcceptCaInvitationPage = lazy(() => import('./pages/ca/AcceptCaInvitationPage').then((m) => ({ default: m.AcceptCaInvitationPage })));
const AcceptProfessionalInvitePage = lazy(() => import('./pages/ca/AcceptProfessionalInvitePage').then((m) => ({ default: m.AcceptProfessionalInvitePage })));
const ProfessionalAccessPage = lazy(() => import('./pages/settings/ProfessionalAccessPage').then((m) => ({ default: m.ProfessionalAccessPage })));
const AiConnectorsPage = lazy(() => import('./pages/settings/AiConnectorsPage').then((m) => ({ default: m.AiConnectorsPage })));
const LoanRatesAdminPage = lazy(() => import('./pages/settings/LoanRatesAdminPage').then((m) => ({ default: m.LoanRatesAdminPage })));
const SupportPage = lazy(() => import('./pages/support/SupportPage').then((m) => ({ default: m.SupportPage })));
const SupportAdminPage = lazy(() => import('./pages/settings/SupportAdminPage').then((m) => ({ default: m.SupportAdminPage })));
const CorporateActionsAdminPage = lazy(() => import('./pages/settings/CorporateActionsAdminPage').then((m) => ({ default: m.CorporateActionsAdminPage })));
const FamilyMemberPage = lazy(() => import('./pages/family/FamilyMemberPage').then((m) => ({ default: m.FamilyMemberPage })));
const TransactionsPage = lazy(() => import('./pages/transactions/TransactionsPage').then((m) => ({ default: m.TransactionsPage })));
const StocksPage = lazy(() => import('./pages/assetClasses/StocksPage').then((m) => ({ default: m.StocksPage })));
const MutualFundsPage = lazy(() => import('./pages/assetClasses/MutualFundsPage').then((m) => ({ default: m.MutualFundsPage })));
const FundDetailPage = lazy(() => import('./pages/mf/FundDetailPage').then((m) => ({ default: m.FundDetailPage })));
const MfPortfolioPage = lazy(() => import('./pages/mf/MfPortfolioPage').then((m) => ({ default: m.MfPortfolioPage })));
const MethodologyPage = lazy(() => import('./pages/mf/MethodologyPage').then((m) => ({ default: m.MethodologyPage })));
const QualitativeFactsAdminPage = lazy(() => import('./pages/mf/QualitativeFactsAdminPage').then((m) => ({ default: m.QualitativeFactsAdminPage })));
const ImportPage = lazy(() => import('./pages/imports/ImportPage').then((m) => ({ default: m.ImportPage })));
const FailuresPage = lazy(() => import('./pages/imports/FailuresPage').then((m) => ({ default: m.FailuresPage })));
const ConnectorsPage = lazy(() => import('./pages/connectors/ConnectorsPage').then((m) => ({ default: m.ConnectorsPage })));
const MailboxesPage = lazy(() => import('./pages/mailboxes/MailboxesPage').then((m) => ({ default: m.MailboxesPage })));
const GmailCallbackPage = lazy(() => import('./pages/mailboxes/GmailCallbackPage').then((m) => ({ default: m.GmailCallbackPage })));
const GmailScanSetupPage = lazy(() => import('./pages/mailboxes/GmailScanSetupPage').then((m) => ({ default: m.GmailScanSetupPage })));
const CasPage = lazy(() => import('./pages/cas/CasPage').then((m) => ({ default: m.CasPage })));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const AnalyticsPage = lazy(() => import('./pages/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const TaxPage = lazy(() => import('./pages/tax/TaxPage').then((m) => ({ default: m.TaxPage })));
const IngestionPage = lazy(() => import('./pages/ingestion/IngestionPage').then((m) => ({ default: m.IngestionPage })));
const SendersPage = lazy(() => import('./pages/ingestion/SendersPage').then((m) => ({ default: m.SendersPage })));
const ReviewPage = lazy(() => import('./pages/ingestion/ReviewPage').then((m) => ({ default: m.ReviewPage })));
const VehicleListPage = lazy(() => import('./pages/vehicles/VehicleListPage').then((m) => ({ default: m.VehicleListPage })));
const VehicleDetailPage = lazy(() => import('./pages/vehicles/VehicleDetailPage').then((m) => ({ default: m.VehicleDetailPage })));
const VehicleValuePage = lazy(() => import('./pages/vehicles/VehicleValuePage').then((m) => ({ default: m.VehicleValuePage })));
const CashFlowsPage = lazy(() => import('./pages/cashflows/CashFlowsPage').then((m) => ({ default: m.CashFlowsPage })));
const UploadPageRoute = lazy(() => import('./pages/insurance/healthCheck/index').then((m) => ({ default: m.UploadPageRoute })));
const ExtractionProgressRoute = lazy(() => import('./pages/insurance/healthCheck/index').then((m) => ({ default: m.ExtractionProgressRoute })));
const VerificationPageRoute = lazy(() => import('./pages/insurance/healthCheck/index').then((m) => ({ default: m.VerificationPageRoute })));
const AnalysisProgressRoute = lazy(() => import('./pages/insurance/healthCheck/index').then((m) => ({ default: m.AnalysisProgressRoute })));
const VerdictPageRoute = lazy(() => import('./pages/insurance/healthCheck/index').then((m) => ({ default: m.VerdictPageRoute })));
const HealthCheckReportRoute = lazy(() => import('./pages/insurance/healthCheck/index').then((m) => ({ default: m.HealthCheckReportRoute })));
const RentalListPage = lazy(() => import('./pages/rental/RentalListPage').then((m) => ({ default: m.RentalListPage })));
const RentalDetailPage = lazy(() => import('./pages/rental/RentalDetailPage').then((m) => ({ default: m.RentalDetailPage })));
const TenantKhataPage = lazy(() => import('./pages/rental/TenantKhataPage').then((m) => ({ default: m.TenantKhataPage })));
const InsuranceListPage = lazy(() => import('./pages/insurance/InsuranceListPage').then((m) => ({ default: m.InsuranceListPage })));
const InsuranceDetailPage = lazy(() => import('./pages/insurance/InsuranceDetailPage').then((m) => ({ default: m.InsuranceDetailPage })));
const EmergencySheetPage = lazy(() => import('./pages/insurance/EmergencySheetPage').then((m) => ({ default: m.EmergencySheetPage })));
const HelpLibraryPage = lazy(() => import('./pages/insurance/HelpLibraryPage').then((m) => ({ default: m.HelpLibraryPage })));
const CoveragePage = lazy(() => import('./pages/insurance/CoveragePage').then((m) => ({ default: m.CoveragePage })));
const LoanListPage = lazy(() => import('./pages/loans/LoanListPage').then((m) => ({ default: m.LoanListPage })));
const LoanDetailPage = lazy(() => import('./pages/loans/LoanDetailPage').then((m) => ({ default: m.LoanDetailPage })));
const LoanGivenDetailPage = lazy(() => import('./pages/loans/given/LoanGivenDetailPage').then((m) => ({ default: m.LoanGivenDetailPage })));
const SplitHomePage = lazy(() => import('./pages/split/SplitHomePage').then((m) => ({ default: m.SplitHomePage })));
const GroupPage = lazy(() => import('./pages/split/GroupPage').then((m) => ({ default: m.GroupPage })));
const ExpenseDetailPage = lazy(() => import('./pages/split/ExpenseDetailPage').then((m) => ({ default: m.ExpenseDetailPage })));
const FriendPage = lazy(() => import('./pages/split/FriendPage').then((m) => ({ default: m.FriendPage })));
const SplitSettingsPage = lazy(() => import('./pages/split/SplitSettingsPage').then((m) => ({ default: m.SplitSettingsPage })));
const EmiCalculatorPage = lazy(() => import('./pages/emi/EmiCalculatorPage').then((m) => ({ default: m.EmiCalculatorPage })));
const PersonalInflationPage = lazy(() => import('./pages/personalInflation/PersonalInflationPage').then((m) => ({ default: m.PersonalInflationPage })));
const SafeToInvestPage = lazy(() => import('./pages/safeToInvest/SafeToInvestPage').then((m) => ({ default: m.SafeToInvestPage })));
const DocumentSorterPage = lazy(() => import('./pages/documentSorter/DocumentSorterPage').then((m) => ({ default: m.DocumentSorterPage })));
const LegacyPage = lazy(() => import('./pages/legacy/LegacyPage').then((m) => ({ default: m.LegacyPage })));
const LegacyLinkPage = lazy(() => import('./pages/legacy/LegacyLinkPage').then((m) => ({ default: m.LegacyLinkPage })));
const LegacyAccessPage = lazy(() => import('./pages/legacy/LegacyAccessPage').then((m) => ({ default: m.LegacyAccessPage })));
const GoalsPage = lazy(() => import('./pages/goals/GoalsPage').then((m) => ({ default: m.GoalsPage })));
const WillOverviewPage = lazy(() => import('./pages/will/WillOverviewPage').then((m) => ({ default: m.WillOverviewPage })));
const ConnectAuthorizePage = lazy(() => import('./pages/connect/ConnectAuthorizePage').then((m) => ({ default: m.ConnectAuthorizePage })));
const WillExecutePage = lazy(() => import('./pages/will/execute/WillExecutePage').then((m) => ({ default: m.WillExecutePage })));
const WillWizardPage = lazy(() => import('./pages/will/WillWizardPage').then((m) => ({ default: m.WillWizardPage })));
const IncomePage = lazy(() => import('./pages/income/IncomePage').then((m) => ({ default: m.IncomePage })));
const HealthScorePage = lazy(() => import('./pages/intelligence/HealthScorePage').then((m) => ({ default: m.HealthScorePage })));
const AdvisorPage = lazy(() => import('./pages/advisor/AdvisorPage').then((m) => ({ default: m.AdvisorPage })));
const ActOnItPage = lazy(() => import('./pages/actOnIt/ActOnItPage').then((m) => ({ default: m.ActOnItPage })));
const HiddenCostsPage = lazy(() => import('./pages/hiddenCosts/HiddenCostsPage').then((m) => ({ default: m.HiddenCostsPage })));
const CreditCardListPage = lazy(() => import('./pages/creditCards/CreditCardListPage').then((m) => ({ default: m.CreditCardListPage })));
const CreditCardDetailPage = lazy(() => import('./pages/creditCards/CreditCardDetailPage').then((m) => ({ default: m.CreditCardDetailPage })));
const RealEstateListPage = lazy(() => import('./pages/realEstate/RealEstateListPage').then((m) => ({ default: m.RealEstateListPage })));
const RealEstateDetailPage = lazy(() => import('./pages/realEstate/RealEstateDetailPage').then((m) => ({ default: m.RealEstateDetailPage })));
const BankAccountListPage = lazy(() => import('./pages/bankAccounts/BankAccountListPage').then((m) => ({ default: m.BankAccountListPage })));
const BankAccountDetailPage = lazy(() => import('./pages/bankAccounts/BankAccountDetailPage').then((m) => ({ default: m.BankAccountDetailPage })));
const FixedDepositsPage = lazy(() => import('./pages/assetClasses/FixedDepositsPage').then((m) => ({ default: m.FixedDepositsPage })));
const FdDetailPage = lazy(() => import('./pages/assetClasses/FdDetailPage').then((m) => ({ default: m.FdDetailPage })));
const BondsPage = lazy(() => import('./pages/assetClasses/BondsPage').then((m) => ({ default: m.BondsPage })));
const GoldPage = lazy(() => import('./pages/assetClasses/GoldPage').then((m) => ({ default: m.GoldPage })));
const GoldAssetDetailPage = lazy(() => import('./pages/assetClasses/GoldAssetDetailPage').then((m) => ({ default: m.GoldAssetDetailPage })));
const CryptoPage = lazy(() => import('./pages/assetClasses/CryptoPage').then((m) => ({ default: m.CryptoPage })));
const CryptoDetailPage = lazy(() => import('./pages/assetClasses/CryptoDetailPage').then((m) => ({ default: m.CryptoDetailPage })));
const NpsPage = lazy(() => import('./pages/assetClasses/NpsPage').then((m) => ({ default: m.NpsPage })));
const ProvidentFundPage = lazy(() => import('./pages/assetClasses/ProvidentFundPage').then((m) => ({ default: m.ProvidentFundPage })));
const PfExtensionPairPage = lazy(() => import('./pages/pf/PfExtensionPairPage').then((m) => ({ default: m.PfExtensionPairPage })));
const OtherAssetsPage = lazy(() => import('./pages/assetClasses/OtherAssetsPage').then((m) => ({ default: m.OtherAssetsPage })));
const PostOfficePage = lazy(() => import('./pages/assetClasses/PostOfficePage').then((m) => ({ default: m.PostOfficePage })));
const PostOfficeDetailPage = lazy(() => import('./pages/assetClasses/PostOfficeDetailPage').then((m) => ({ default: m.PostOfficeDetailPage })));
const FuturesOptionsPage = lazy(() => import('./pages/assetClasses/FuturesOptionsPage').then((m) => ({ default: m.FuturesOptionsPage })));
const ForexPage = lazy(() => import('./pages/forex/ForexPage').then((m) => ({ default: m.ForexPage })));
const AccountingPage = lazy(() => import('./pages/accounting/AccountingPage').then((m) => ({ default: m.AccountingPage })));
const PricingPage = lazy(() => import('./pages/pricing/PricingPage').then((m) => ({ default: m.PricingPage })));
const AlertsPage = lazy(() => import('./pages/alerts/AlertsPage').then((m) => ({ default: m.AlertsPage })));
const OnboardingWizard = lazy(() => import('./pages/onboarding/OnboardingWizard').then((m) => ({ default: m.OnboardingWizard })));
const PrivacyPage = lazy(() => import('./pages/legal/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const AiUsePage = lazy(() => import('./pages/legal/AiUsePage').then((m) => ({ default: m.AiUsePage })));

export function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Signed-in users have no use for these (no in-app link reaches them
          while signed in); they go where /login would send them. */}
      <Route path="/register" element={<RedirectIfSignedIn><RegisterPage /></RedirectIfSignedIn>} />
      <Route
        path="/forgot-password"
        element={<RedirectIfSignedIn><ForgotPasswordPage /></RedirectIfSignedIn>}
      />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/legal/ai-use" element={<AiUsePage />} />
      <Route
        path="/families/invitations/:token/accept"
        element={<AcceptInvitationPage />}
      />
      {/* Outside the protected tree on purpose: the person taking over the
          account kept for them has no login yet — that is the point. */}
      <Route path="/family/claims/:token" element={<ClaimProfilePage />} />
      {/* Legacy Transfer links: outside the protected tree on purpose — the
          owner may be unable to sign in, and nominees have no account. */}
      <Route path="/legacy/ok/:token" element={<LegacyLinkPage kind="ok" />} />
      <Route path="/legacy/ack/:token" element={<LegacyLinkPage kind="ack" />} />
      <Route path="/legacy/verify/:token" element={<LegacyLinkPage kind="verify" />} />
      <Route path="/legacy/access/:token" element={<LegacyAccessPage />} />
      {/* Outside the protected tree on purpose: a professional opening this
          link may not have an account yet, and has to be told who is asking
          before being asked to make one. */}
      <Route
        path="/professional-invitations/:token"
        element={<AcceptProfessionalInvitePage />}
      />
      {/* AI Connector approval: signed in, but outside the app layout. A
          signed-out user is sent to /login and comes back here (ProtectedRoute). */}
      <Route
        path="/connect/authorize"
        element={
          <ProtectedRoute>
            <ConnectAuthorizePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <NotWhileManaging to="/portfolios">
              <OnboardingWizard onComplete={() => localStorage.setItem('onboarding_v2_done', '1')} />
            </NotWhileManaging>
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
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/portfolios" element={<PortfolioListPage />} />
        <Route path="/portfolios/:id" element={<PortfolioDetailPage />} />
        <Route path="/portfolio-groups/:id" element={<PortfolioGroupDetailPage />} />
        <Route path="/family" element={<FamilyPage />} />
        <Route path="/family/members/:userId" element={<FamilyMemberPage />} />
        {/* CA workspace. The client-facing routes deliberately sit outside it:
            seeing and withdrawing access must not depend on a plan. */}
        <Route path="/ca" element={<ProfessionalTwoFactorGate><CaWorkspacePage /></ProfessionalTwoFactorGate>} />
        <Route path="/ca/clients/:clientId" element={<ProfessionalTwoFactorGate><ClientBooksPage /></ProfessionalTwoFactorGate>} />
        <Route path="/ca/invitations/:token/accept" element={<AcceptCaInvitationPage />} />
        <Route path="/settings/professional-access" element={<ProfessionalAccessPage />} />
        <Route path="/settings/ai-connectors" element={<AiConnectorsPage />} />
        <Route path="/settings/loan-rates" element={<LoanRatesAdminPage />} />
        <Route path="/settings/support" element={<SupportAdminPage />} />
        <Route path="/settings/corporate-actions" element={<CorporateActionsAdminPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/stocks" element={<StocksPage />} />
        <Route path="/mutual-funds" element={<MutualFundsPage />} />
        {/* MF analytics fund detail (`docs/mf-analytics` Task 3.2). Nested under
            /mutual-funds so the scheme page reads as a child of the holdings
            list; the param is an AMFI scheme code, not a holding id. */}
        {/* Static segment, declared before the dynamic one for readability.
            React Router v6 ranks static above dynamic regardless of order, so
            "analysis" can never be swallowed as a scheme code — but a reader
            scanning this list should not have to know that. */}
        <Route path="/mutual-funds/analysis" element={<MfPortfolioPage />} />
        <Route path="/mutual-funds/:schemeCode" element={<FundDetailPage />} />
        {/* `06-QUALITY-COMPLIANCE.md §5` names this path. It is the
            transparency artefact for the scoring layer and is deliberately not
            entitlement-gated: a reader has to be able to judge what a rating
            means before paying for the plan that shows them ratings. */}
        <Route path="/methodology/mf-score" element={<MethodologyPage />} />
        {/* Admin-only entry surface for MfSchemeQualitativeFact (Task 6.2).
            Under /admin rather than /mutual-funds because it is not a view of
            the caller's book: it writes shared reference data that changes
            every user's scores. The real gate is requireRole('ADMIN') on the
            server; the page's own role check only avoids showing a form whose
            every request would 401. */}
        <Route path="/admin/mf-qualitative-facts" element={<QualitativeFactsAdminPage />} />
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
        {/* NPS — manual entry only; NSDL CRA auto-fetch adapter is a separate future project (§10.2) */}
        <Route path="/nps" element={<NpsPage />} />
        <Route path="/post-office" element={<PostOfficePage />} />
        <Route path="/post-office/:holdingId" element={<PostOfficeDetailPage />} />
        <Route path="/others" element={<OtherAssetsPage />} />
        <Route path="/vehicles" element={<VehicleListPage />} />
        <Route path="/vehicles/value" element={<VehicleValuePage />} />
        <Route path="/vehicles/:id" element={<VehicleDetailPage />} />
        <Route path="/rental" element={<RentalListPage />} />
        <Route path="/rental/tenancies/:tenancyId" element={<TenantKhataPage />} />
        <Route path="/rental/:id" element={<RentalDetailPage />} />
        <Route path="/insurance" element={<InsuranceListPage />} />
        <Route path="/insurance/emergency-sheet" element={<EmergencySheetPage />} />
        <Route path="/insurance/help" element={<HelpLibraryPage />} />
        <Route path="/insurance/coverage" element={<CoveragePage />} />
        {/* Health check flow */}
        <Route path="/insurance/:id/health-check" element={<UploadPageRoute />} />
        <Route path="/insurance/health-check/:checkId/progress" element={<ExtractionProgressRoute />} />
        <Route path="/insurance/health-check/:checkId/verify" element={<VerificationPageRoute />} />
        <Route path="/insurance/health-check/:checkId/analyzing" element={<AnalysisProgressRoute />} />
        <Route path="/insurance/health-check/:checkId/verdict" element={<VerdictPageRoute />} />
        <Route path="/insurance/health-check/:checkId/report" element={<HealthCheckReportRoute />} />
        <Route path="/insurance/:id" element={<InsuranceDetailPage />} />
        <Route path="/loans" element={<LoanListPage />} />
        <Route path="/loans/given/:id" element={<LoanGivenDetailPage />} />
        <Route path="/loans/:id" element={<LoanDetailPage />} />
        <Route path="/split" element={<SplitHomePage />} />
        <Route path="/emi" element={<EmiCalculatorPage />} />
        <Route path="/personal-inflation" element={<PersonalInflationPage />} />
        <Route path="/safe-to-invest" element={<SafeToInvestPage />} />
        <Route path="/documents" element={<DocumentSorterPage />} />
        <Route path="/legacy" element={<LegacyPage />} />
        <Route path="/split/settings" element={<SplitSettingsPage />} />
        <Route path="/split/groups/:id" element={<GroupPage />} />
        <Route path="/split/expenses/:id" element={<ExpenseDetailPage />} />
        <Route path="/split/friends/:key" element={<FriendPage />} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/will" element={<WillOverviewPage />} />
        <Route path="/will/:id/execute" element={<WillExecutePage />} />
        <Route path="/will/:id/:step" element={<WillWizardPage />} />
        <Route path="/income" element={<IncomePage />} />
        <Route path="/health-score" element={<HealthScorePage />} />
        <Route path="/advisor" element={<AdvisorPage />} />
        <Route path="/act-on-it" element={<ActOnItPage />} />
        <Route path="/hidden-costs" element={<HiddenCostsPage />} />
        <Route path="/credit-cards" element={<CreditCardListPage />} />
        <Route path="/credit-cards/:id" element={<CreditCardDetailPage />} />
        <Route path="/bank-accounts" element={<BankAccountListPage />} />
        <Route path="/bank-accounts/:id" element={<BankAccountDetailPage />} />
        <Route path="/real-estate" element={<RealEstateListPage />} />
        <Route path="/real-estate/:id" element={<RealEstateDetailPage />} />
        <Route path="/cashflows" element={<CashFlowsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/tax" element={<TaxPage />} />
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
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        {/* Inside the protected shell: signed-out visitors still go to login. */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
