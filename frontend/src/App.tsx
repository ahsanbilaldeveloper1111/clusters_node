import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.js';
import LoginPage from './pages/LoginPage.js';
import DashboardPage from './pages/DashboardPage.js';
import ProductsPage from './pages/ProductsPage.js';
import OrdersPage from './pages/OrdersPage.js';
import AnalyticsPage from './pages/AnalyticsPage.js';
import AiAssistantPage from './pages/AiAssistantPage.js';
import MlLabPage from './pages/MlLabPage.js';
import AuditPage from './pages/AuditPage.js';
import SystemPage from './pages/SystemPage.js';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, can } = useAuth();
  const location = useLocation();

  const nav = [
    { to: '/', label: 'Dashboard' },
    { to: '/products', label: 'Products' },
    { to: '/orders', label: 'Orders' },
    ...(can('analytics') ? [{ to: '/analytics', label: 'Analytics' }] : []),
    ...(can('ai') ? [{ to: '/ai', label: 'AI Assistant' }] : []),
    ...(can('ml') ? [{ to: '/ml', label: 'ML Lab' }] : []),
    ...(can('audit') ? [{ to: '/audit', label: 'Audit' }] : []),
    ...(can('system') ? [{ to: '/system', label: 'System' }] : []),
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">◆</span>
          <span>Enterprise</span>
        </div>
        <nav>
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={location.pathname === item.to ? 'nav-link active' : 'nav-link'}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-badge">
            <span className="role">{user?.role}</span>
            <span className="email">{user?.email}</span>
          </div>
          <button type="button" className="btn-ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/ai" element={<AiAssistantPage />} />
                <Route path="/ml" element={<MlLabPage />} />
                <Route path="/audit" element={<AuditPage />} />
                <Route path="/system" element={<SystemPage />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
