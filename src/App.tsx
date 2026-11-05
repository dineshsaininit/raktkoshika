import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './store/store';
import { ToastProvider } from './ui/kit';
import { Shell } from './layouts/Shell';
import Landing from './pages/public/Landing';
import Login from './pages/public/Login';
import PublicFind from './pages/public/PublicFind';
import { FindBlood } from './pages/shared/FindBlood';
import { NewOrder } from './pages/shared/NewOrder';
import { OrderDetail, OrdersPage } from './pages/shared/Orders';
import { WalletPage } from './pages/shared/Wallet';
import { ChatPage } from './pages/shared/Chat';
import { CampsPage, DonorRequests, HistoryPage, PlansPage } from './pages/shared/Community';
import { UserHome } from './pages/user/Home';
import { Donate } from './pages/user/Donate';
import { Profile } from './pages/user/Profile';
import { ReferralHome } from './pages/referral/Home';
import { BankDonors, BankHome, BankRequests, BankStock } from './pages/bank/Operations';
import { BankAccounts, BankCentres, BankQuality, BankReferrals, BankReports } from './pages/bank/Back';
import { FranchiseCentres, FranchiseEarnings, FranchiseHome, Pipeline, SupportPage } from './pages/franchise/Franchise';
import { AdminCompliance, AdminHome, AdminLedger, AdminNetwork, AdminVerification } from './pages/admin/Admin';
import { RevenueModels } from './pages/admin/Revenue';

const shared = (
  <>
    <Route path="find" element={<FindBlood />} />
    <Route path="order" element={<NewOrder />} />
    <Route path="orders" element={<OrdersPage />} />
    <Route path="orders/:id" element={<OrderDetail />} />
    <Route path="plans" element={<PlansPage />} />
    <Route path="donor-requests" element={<DonorRequests />} />
    <Route path="camps" element={<CampsPage />} />
    <Route path="wallet" element={<WalletPage />} />
    <Route path="chat" element={<ChatPage />} />
    <Route path="history" element={<HistoryPage />} />
  </>
);

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/find" element={<PublicFind />} />
            <Route path="/app/user" element={<Shell role="user" />}>
              <Route index element={<UserHome />} />
              {shared}
              <Route path="donate" element={<Donate />} />
              <Route path="profile" element={<Profile />} />
            </Route>
            <Route path="/app/referral" element={<Shell role="referral" />}>
              <Route index element={<ReferralHome />} />
              {shared}
            </Route>
            <Route path="/app/bank" element={<Shell role="bank" />}>
              <Route index element={<BankHome />} />
              <Route path="requests" element={<BankRequests />} />
              <Route path="stock" element={<BankStock />} />
              <Route path="donors" element={<BankDonors />} />
              <Route path="camps" element={<CampsPage />} />
              <Route path="quality" element={<BankQuality />} />
              <Route path="reports" element={<BankReports />} />
              <Route path="referrals" element={<BankReferrals />} />
              <Route path="centres" element={<BankCentres />} />
              <Route path="accounts" element={<BankAccounts />} />
              <Route path="wallet" element={<WalletPage />} />
              <Route path="chat" element={<ChatPage />} />
            </Route>
            <Route path="/app/franchise" element={<Shell role="franchise" />}>
              <Route index element={<FranchiseHome />} />
              <Route path="pipeline" element={<Pipeline />} />
              <Route path="centres" element={<FranchiseCentres />} />
              <Route path="earnings" element={<FranchiseEarnings />} />
              <Route path="support" element={<SupportPage />} />
              <Route path="chat" element={<ChatPage />} />
            </Route>
            <Route path="/app/admin" element={<Shell role="admin" />}>
              <Route index element={<AdminHome />} />
              <Route path="network" element={<AdminNetwork />} />
              <Route path="verification" element={<AdminVerification />} />
              <Route path="transactions" element={<AdminLedger />} />
              <Route path="revenue" element={<RevenueModels />} />
              <Route path="compliance" element={<AdminCompliance />} />
              <Route path="support" element={<SupportPage />} />
              <Route path="chat" element={<ChatPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </ToastProvider>
    </StoreProvider>
  );
}
