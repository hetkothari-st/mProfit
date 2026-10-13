import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import Contact from './pages/Contact';
import Features from './pages/Features';
import Home from './pages/Home';
import { NotFound, Pricing, Security } from './pages/Other';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="features" element={<Features />} />
        <Route path="pricing" element={<Pricing />} />
        <Route path="security" element={<Security />} />
        <Route path="contact" element={<Contact />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
