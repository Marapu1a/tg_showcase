import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from './components/AppLayout';
import { BillingPage } from './pages/BillingPage';
import { DashboardPage } from './pages/DashboardPage';
import { OfferCreatePage } from './pages/OfferCreatePage';
import { OfferDetailPage } from './pages/OfferDetailPage';
import { OffersPage } from './pages/OffersPage';
import { ProductsPage } from './pages/ProductsPage';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready?: () => void;
      };
    };
  }
}

export function App() {
  useEffect(() => {
    window.Telegram?.WebApp?.ready?.();
  }, []);

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate replace to="/dashboard" />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/offers" element={<OffersPage />} />
        <Route path="/offers/new" element={<OfferCreatePage />} />
        <Route path="/offers/:id" element={<OfferDetailPage />} />
        <Route path="/billing" element={<BillingPage />} />
      </Route>
    </Routes>
  );
}
