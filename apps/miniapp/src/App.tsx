import { Route, Routes } from 'react-router-dom';
import { HubEntry, HubPage, HubProjectPage } from './pages/HubPage';
import { OwnerPage } from './pages/OwnerPage';
import { LegalPage } from './pages/LegalPage';

import { AppLayout } from './components/AppLayout';
import { BillingPage } from './pages/BillingPage';
import { ChannelPage } from './pages/ChannelPage';
import { OfferCreatePage } from './pages/OfferCreatePage';
import { OfferDetailPage } from './pages/OfferDetailPage';
import { OffersPage } from './pages/OffersPage';
import { ProductsPage } from './pages/ProductsPage';
import { OrdersPage } from './pages/OrdersPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HubEntry />} />
        <Route path="/hub" element={<HubPage />} />
        <Route path="/projects/:slug" element={<HubProjectPage />} />
        <Route path="/admin" element={<OwnerPage />} />
        <Route path="/dashboard" element={<ChannelPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/offers" element={<OffersPage />} />
        <Route path="/offers/new" element={<OfferCreatePage />} />
        <Route path="/offers/:id" element={<OfferDetailPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/terms" element={<LegalPage />} />
        <Route path="/privacy" element={<LegalPage privacy />} />
      </Route>
    </Routes>
  );
}
