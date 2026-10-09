import React, { useEffect, useState } from 'react';
import { AuthView } from './components/AuthView.js';
import { LogoutModal } from './components/LogoutModal.js';

const API = import.meta.env.VITE_API_BASE_URL ?? '';

interface UserProfile {
  id: string;
  email: string;
  businessName: string;
  displayName?: string;
  role: 'SUPER_ADMIN' | 'OWNER' | 'STAFF' | 'CUSTOMER';
  defaultCurrency: string;
  isActive: boolean;
}

interface AdminOverviewData {
  metrics: {
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    roleDistribution: {
      superAdmins: number;
      owners: number;
      staff: number;
    };
  };
  system: {
    uptimeSeconds: number;
    rateLimiterActive: boolean;
  };
}

export function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('hotspot_auth_token'));
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'customers' | 'packages' | 'coupons' | 'payments' | 'users' | 'audit' | 'ai' | 'security'>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  // Live Data States
  const [apiHealth, setApiHealth] = useState<'connected' | 'checking' | 'offline'>('checking');
  const [capabilities, setCapabilities] = useState<any>(null);
  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [paymentsList, setPaymentsList] = useState<any[]>([]);
  const [ledgerList, setLedgerList] = useState<any[]>([]);
  const [ledgerBalance, setLedgerBalance] = useState<any>(null);
  const [reconciliationReport, setReconciliationReport] = useState<any>(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [aiInsights, setAiInsights] = useState<any>(null);

  // Payments & Cash States
  const [cashAmountMajor, setCashAmountMajor] = useState<number>(5);
  const [cashPkgId, setCashPkgId] = useState<string>('');
  const [cashNote, setCashNote] = useState<string>('');
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const [latestReceipt, setLatestReceipt] = useState<any>(null);
  const [refundPaymentId, setRefundPaymentId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState<string>('Customer cancellation');
  const [refundSubmitting, setRefundSubmitting] = useState(false);

  // Forms & Modals
  const [customerSearch, setCustomerSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // New Entity Forms
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustName, setNewCustName] = useState('');
  const [newCustMac, setNewCustMac] = useState('');

  const [newPkgName, setNewPkgName] = useState('1-Hour Standard');
  const [newPkgDurationMins, setNewPkgDurationMins] = useState(60);
  const [newPkgPriceCents, setNewPkgPriceCents] = useState(250);

  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponPkgId, setNewCouponPkgId] = useState('');
  const [newCouponMaxUses, setNewCouponMaxUses] = useState(1);

  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [newStaffName, setNewStaffName] = useState('');

  const [couponTestCode, setCouponTestCode] = useState('');
  const [couponTestResult, setCouponTestResult] = useState<any>(null);

  // Check API Health
  useEffect(() => {
    fetch(`${API}/api/v1/health`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        setApiHealth('connected');
        setCapabilities(data.capabilities);
      })
      .catch(() => setApiHealth('offline'));
  }, []);

  // Fetch Current User Profile
  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }

    fetch(`${API}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        setUser(data.owner);
      })
      .catch(() => {
        setToken(null);
        localStorage.removeItem('hotspot_auth_token');
      });
  }, [token]);

  // Load Tab Data
  const refreshTabData = () => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    if (activeTab === 'overview') {
      fetch(`${API}/api/v1/admin/overview`, { headers })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setOverview(d))
        .catch(() => {});
    }

    if (activeTab === 'customers') {
      fetch(`${API}/api/v1/customers?query=${encodeURIComponent(customerSearch)}`, { headers })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setCustomers(d.customers))
        .catch(() => {});
    }

    if (activeTab === 'packages') {
      fetch(`${API}/api/v1/packages`, { headers })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setPackages(d.packages))
        .catch(() => {});
    }

    if (activeTab === 'coupons') {
      fetch(`${API}/api/v1/coupons`, { headers })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setCoupons(d.coupons))
        .catch(() => {});
      fetch(`${API}/api/v1/packages`, { headers })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setPackages(d.packages))
        .catch(() => {});
    }

    if (activeTab === 'payments') {
      fetch(`${API}/api/v1/payments`, { headers })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setPaymentsList(d.payments))
        .catch(() => {});
      fetch(`${API}/api/v1/payments/ledger`, { headers })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => {
          if (d) {
            setLedgerList(d.entries);
            setLedgerBalance(d.balance);
          }
        })
        .catch(() => {});
      fetch(`${API}/api/v1/packages`, { headers })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setPackages(d.packages))
        .catch(() => {});
    }

    if (activeTab === 'users') {
      fetch(`${API}/api/v1/admin/users?search=${encodeURIComponent(userSearch)}`, { headers })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setAdminUsers(d.users))
        .catch(() => {});
    }

    if (activeTab === 'audit') {
      fetch(`${API}/api/v1/admin/audit-logs`, { headers })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setAuditLogs(d.auditLogs))
        .catch(() => {});
    }

    if (activeTab === 'ai') {
      fetch(`${API}/api/v1/admin/ai/insights`, { headers })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setAiInsights(d))
        .catch(() => {});
    }
  };

  useEffect(() => {
    refreshTabData();
  }, [activeTab, token, customerSearch, userSearch]);

  const handleAuthSuccess = (newToken: string, newUser: UserProfile) => {
    setToken(newToken);
    localStorage.setItem('hotspot_auth_token', newToken);
    setUser(newUser);
    setActiveTab('overview');
  };

  const handleConfirmLogout = async () => {
    setLogoutLoading(true);
    try {
      if (token) {
        await fetch(`${API}/api/v1/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // Continue client cleanup regardless of network
    } finally {
      setToken(null);
      localStorage.removeItem('hotspot_auth_token');
      setUser(null);
      setIsLogoutModalOpen(false);
      setLogoutLoading(false);
    }
  };

  // Actions
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/v1/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          phone: newCustPhone || undefined,
          displayName: newCustName || undefined,
          deviceMac: newCustMac || undefined,
          consentAccepted: true,
          dataRetentionConsent: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Creation failed');
      setFeedback({ message: 'Customer created with terms consent.', type: 'success' });
      setNewCustPhone('');
      setNewCustName('');
      setNewCustMac('');
      refreshTabData();
    } catch (err: unknown) {
      setFeedback({ message: err instanceof Error ? err.message : 'Error', type: 'error' });
    }
  };

  const handleCreatePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/v1/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: newPkgName,
          durationSeconds: newPkgDurationMins * 60,
          priceMinor: newPkgPriceCents,
          currency: 'USD',
          active: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Creation failed');
      setFeedback({ message: 'Package added to active catalog.', type: 'success' });
      refreshTabData();
    } catch (err: unknown) {
      setFeedback({ message: err instanceof Error ? err.message : 'Error', type: 'error' });
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/v1/coupons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          code: newCouponCode,
          packageId: newCouponPkgId,
          maxUses: Number(newCouponMaxUses),
          active: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Creation failed');
      setFeedback({ message: 'Voucher generated successfully.', type: 'success' });
      setNewCouponCode('');
      refreshTabData();
    } catch (err: unknown) {
      setFeedback({ message: err instanceof Error ? err.message : 'Error', type: 'error' });
    }
  };

  const handleTestCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const res = await fetch(`${API}/api/v1/coupons/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerId: user.id,
          code: couponTestCode,
        }),
      });
      const data = await res.json();
      setCouponTestResult(data);
    } catch {
      setCouponTestResult({ valid: false, error: { message: 'Network error validating voucher.' } });
    }
  };

  const handleRecordManualCash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setCashSubmitting(true);
    try {
      const res = await fetch(`${API}/api/v1/payments/manual-cash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amountMinor: Math.round(cashAmountMajor * 100),
          currency: user?.defaultCurrency || 'USD',
          packageId: cashPkgId || undefined,
          referenceNote: cashNote || 'Counter cash payment',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Payment recording failed');
      setFeedback({ message: `Cash payment recorded. Receipt: ${data.receiptNumber}`, type: 'success' });
      setLatestReceipt(data);
      setCashNote('');
      refreshTabData();
    } catch (err: unknown) {
      setFeedback({ message: err instanceof Error ? err.message : 'Error', type: 'error' });
    } finally {
      setCashSubmitting(false);
    }
  };

  const handleExecuteRefund = async (paymentId: string) => {
    if (!token) return;
    const reason = window.prompt ? window.prompt('Refund reason:', 'Customer cancellation') : 'Customer cancellation';
    if (!reason) return;
    setRefundSubmitting(true);
    try {
      const res = await fetch(`${API}/api/v1/payments/${paymentId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Refund failed');
      setFeedback({ message: 'Payment successfully refunded and ledger adjusted.', type: 'success' });
      refreshTabData();
    } catch (err: unknown) {
      setFeedback({ message: err instanceof Error ? err.message : 'Refund failed', type: 'error' });
    } finally {
      setRefundSubmitting(false);
    }
  };

  const handleRunReconciliation = async () => {
    if (!token) return;
    setIsReconciling(true);
    try {
      const res = await fetch(`${API}/api/v1/payments/reconcile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Reconciliation failed');
      setReconciliationReport(data.report);
      setFeedback({
        message: data.report.status === 'balanced'
          ? 'Reconciliation audit completed: All accounts balanced (0 discrepancy).'
          : `Reconciliation audit flagged discrepancy: $${(data.report.discrepancyMinor / 100).toFixed(2)}`,
        type: data.report.status === 'balanced' ? 'success' : 'error',
      });
    } catch (err: unknown) {
      setFeedback({ message: err instanceof Error ? err.message : 'Audit failed', type: 'error' });
    } finally {
      setIsReconciling(false);
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/v1/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: newStaffEmail,
          password: newStaffPassword,
          displayName: newStaffName,
          role: 'STAFF',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Creation failed');
      setFeedback({ message: 'Staff operator created successfully.', type: 'success' });
      setNewStaffEmail('');
      setNewStaffPassword('');
      setNewStaffName('');
      refreshTabData();
    } catch (err: unknown) {
      setFeedback({ message: err instanceof Error ? err.message : 'Error', type: 'error' });
    }
  };

  const handleToggleUserActive = async (targetId: string, currentActive: boolean) => {
    if (!token) return;
    const endpoint = currentActive ? 'deactivate' : 'activate';
    try {
      const res = await fetch(`${API}/api/v1/admin/users/${targetId}/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Operation failed');
      setFeedback({ message: data.message || 'Status updated.', type: 'success' });
      refreshTabData();
    } catch (err: unknown) {
      setFeedback({ message: err instanceof Error ? err.message : 'Error', type: 'error' });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setFeedback({ message: 'New passwords do not match', type: 'error' });
      return;
    }
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/v1/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed');
      setFeedback({ message: 'Password changed. Please sign in again with your new credentials.', type: 'success' });
      setTimeout(() => {
        setToken(null);
        localStorage.removeItem('hotspot_auth_token');
        setUser(null);
      }, 1500);
    } catch (err: unknown) {
      setFeedback({ message: err instanceof Error ? err.message : 'Error', type: 'error' });
    }
  };

  // If not authenticated, show polished AuthView
  if (!token || !user) {
    return <AuthView apiBase={API} onAuthSuccess={handleAuthSuccess} />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const isOwner = user.role === 'OWNER';
  const canAccessAdmin = isSuperAdmin || isOwner;

  return (
    <div className="app-container">
      {/* Mobile Backdrop */}
      {mobileSidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileSidebarOpen(false)} />
      )}

      {/* Collapsible Sidebar */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileSidebarOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', overflow: 'hidden' }}>
            <div className="logo" style={{ width: '2.2rem', height: '2.2rem', fontSize: '1.2rem', borderRadius: '0.6rem' }}>
              ◉
            </div>
            {!sidebarCollapsed && (
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {user.businessName || 'Hotspot Ops'}
                </div>
                <small style={{ color: 'var(--color-brand-secondary)', fontSize: '0.7rem' }}>
                  {user.role}
                </small>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              padding: '0.2rem',
              display: sidebarCollapsed ? 'none' : 'block',
            }}
            title="Toggle sidebar collapse"
          >
            ◀
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-title">{!sidebarCollapsed && 'Operations'}</div>
          <button
            type="button"
            className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => { setActiveTab('overview'); setMobileSidebarOpen(false); }}
          >
            <span className="nav-icon">📊</span>
            {!sidebarCollapsed && <span>Dashboard</span>}
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === 'customers' ? 'active' : ''}`}
            onClick={() => { setActiveTab('customers'); setMobileSidebarOpen(false); }}
          >
            <span className="nav-icon">👥</span>
            {!sidebarCollapsed && <span>Customers</span>}
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === 'packages' ? 'active' : ''}`}
            onClick={() => { setActiveTab('packages'); setMobileSidebarOpen(false); }}
          >
            <span className="nav-icon">📦</span>
            {!sidebarCollapsed && <span>Access Packages</span>}
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === 'coupons' ? 'active' : ''}`}
            onClick={() => { setActiveTab('coupons'); setMobileSidebarOpen(false); }}
          >
            <span className="nav-icon">🎟️</span>
            {!sidebarCollapsed && <span>Coupons &amp; Vouchers</span>}
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === 'payments' ? 'active' : ''}`}
            onClick={() => { setActiveTab('payments'); setMobileSidebarOpen(false); }}
          >
            <span className="nav-icon">💳</span>
            {!sidebarCollapsed && <span>Payments &amp; Ledger</span>}
          </button>

          {canAccessAdmin && (
            <>
              <div className="nav-section-title">{!sidebarCollapsed && 'Administration'}</div>
              <button
                type="button"
                className={`nav-item ${activeTab === 'users' ? 'active' : ''}`}
                onClick={() => { setActiveTab('users'); setMobileSidebarOpen(false); }}
              >
                <span className="nav-icon">🛡️</span>
                {!sidebarCollapsed && <span>User Management</span>}
              </button>
              <button
                type="button"
                className={`nav-item ${activeTab === 'audit' ? 'active' : ''}`}
                onClick={() => { setActiveTab('audit'); setMobileSidebarOpen(false); }}
              >
                <span className="nav-icon">📜</span>
                {!sidebarCollapsed && <span>Audit Trail</span>}
              </button>
              <button
                type="button"
                className={`nav-item ${activeTab === 'ai' ? 'active' : ''}`}
                onClick={() => { setActiveTab('ai'); setMobileSidebarOpen(false); }}
              >
                <span className="nav-icon">🤖</span>
                {!sidebarCollapsed && <span>AI Operations</span>}
              </button>
            </>
          )}

          <div className="nav-section-title">{!sidebarCollapsed && 'Account'}</div>
          <button
            type="button"
            className={`nav-item ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => { setActiveTab('security'); setMobileSidebarOpen(false); }}
          >
            <span className="nav-icon">🔒</span>
            {!sidebarCollapsed && <span>Security &amp; Password</span>}
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="main-content">
        <header className="top-navbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn-outline"
              style={{ display: 'inline-flex', padding: '0.4rem 0.65rem' }}
              onClick={() => {
                if (window.innerWidth <= 768) {
                  setMobileSidebarOpen(!mobileSidebarOpen);
                } else {
                  setSidebarCollapsed(!sidebarCollapsed);
                }
              }}
            >
              ☰
            </button>
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
              {activeTab === 'overview' && 'Operations Dashboard'}
              {activeTab === 'customers' && 'Customer Management'}
              {activeTab === 'packages' && 'Access Packages Catalog'}
              {activeTab === 'coupons' && 'Coupons & Vouchers Engine'}
              {activeTab === 'payments' && 'Financial Ledger, Cash Desk & Payment Processing'}
              {activeTab === 'users' && 'Administration • User Management'}
              {activeTab === 'audit' && 'Security & Operational Audit Logs'}
              {activeTab === 'ai' && 'AI-Assisted Operations & Telemetry'}
              {activeTab === 'security' && 'Account Security & Password'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className={`badge ${user.role === 'SUPER_ADMIN' ? 'badge-super-admin' : user.role === 'OWNER' ? 'badge-owner' : 'badge-staff'}`}>
              {user.role}
            </span>
            <span className={`pill ${apiHealth}`} style={{ padding: '0.35rem 0.65rem' }}>
              {apiHealth === 'connected' ? 'API Live' : 'API Offline'}
            </span>
            <button
              type="button"
              className="btn-outline"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
              onClick={() => setIsLogoutModalOpen(true)}
            >
              Sign Out
            </button>
          </div>
        </header>

        <main className="view-container">
          {feedback && (
            <div
              style={{
                background: feedback.type === 'success' ? '#ecfdf5' : '#fef2f2',
                color: feedback.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)',
                border: `1px solid ${feedback.type === 'success' ? '#d1fae5' : '#fee2e2'}`,
                padding: '0.75rem 1rem',
                borderRadius: '0.6rem',
                fontSize: '0.85rem',
                marginBottom: '1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{feedback.message}</span>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>
          )}

          {/* TAB 1: OVERVIEW / DASHBOARD */}
          {activeTab === 'overview' && (
            <div>
              <section className="hero">
                <small>ENGINEERING OPERATIONS PLATFORM</small>
                <h2>Welcome, {user.displayName || user.businessName}</h2>
                <p>
                  Internet Coupon Hotspot provides authoritative time-based access control, integer minor-unit financial accounting,
                  and cross-tenant role isolation.
                </p>
                <b>Role: {user.role} · System Active</b>
              </section>

              {overview && (
                <div className="grid" style={{ marginBottom: '1.5rem' }}>
                  <article className="card">
                    <span className="icon ok">👥</span>
                    <div>
                      <h3>{overview.metrics.totalUsers} Total Accounts</h3>
                      <p>{overview.metrics.activeUsers} active · {overview.metrics.inactiveUsers} inactive</p>
                    </div>
                  </article>
                  <article className="card">
                    <span className="icon ok">🛡️</span>
                    <div>
                      <h3>{overview.metrics.roleDistribution.superAdmins} Super Admins</h3>
                      <p>{overview.metrics.roleDistribution.owners} Business Owners · {overview.metrics.roleDistribution.staff} Staff</p>
                    </div>
                  </article>
                  <article className="card">
                    <span className="icon ok">⏱️</span>
                    <div>
                      <h3>{overview.system.uptimeSeconds}s Uptime</h3>
                      <p>Rate limiter &amp; brute-force protection active</p>
                    </div>
                  </article>
                </div>
              )}

              <div className="heading">
                <div>
                  <small>SERVICE STATUS</small>
                  <h2>Verified Capabilities</h2>
                </div>
                <p>Unavailable capabilities are disclosed honestly.</p>
              </div>

              <div className="grid">
                <article className="card">
                  <span className="icon ok">✓</span>
                  <div>
                    <h3>Relational Persistence</h3>
                    <p>PostgreSQL schema &amp; repository isolation active.</p>
                  </div>
                  <small>Ready</small>
                </article>
                <article className="card">
                  <span className="icon ok">✓</span>
                  <div>
                    <h3>Authentication &amp; RBAC</h3>
                    <p>PBKDF2/SHA-512, bearer sessions, and role checks active.</p>
                  </div>
                  <small>Ready</small>
                </article>
                <article className="card">
                  <span className="icon ok">✓</span>
                  <div>
                    <h3>Customer &amp; Consent Manager</h3>
                    <p>Phase 5 terms acceptance, MAC, and session logs active.</p>
                  </div>
                  <small>Ready</small>
                </article>
                <article className="card">
                  <span className="icon ok">✓</span>
                  <div>
                    <h3>Packages &amp; Voucher Engine</h3>
                    <p>Phase 6 pricing snapshots &amp; redemption validator active.</p>
                  </div>
                  <small>Ready</small>
                </article>
                <article className="card">
                  <span className="icon pending">○</span>
                  <div>
                    <h3>Hotspot Enforcement</h3>
                    <p>Requires compatible managed gateway hardware router.</p>
                  </div>
                  <small>Planned</small>
                </article>
                <article className="card">
                  <span className="icon pending">○</span>
                  <div>
                    <h3>Payment Verification</h3>
                    <p>Provider-hosted webhooks &amp; ledger idempotency (Phase 7).</p>
                  </div>
                  <small>Planned</small>
                </article>
              </div>

              <aside>
                <strong>Network Reality Check</strong>
                <p>
                  Standard Android hotspot mode cannot enforce per-client disconnections or bandwidth limits without a dedicated
                  router or managed captive portal. The software accurately discloses this constraint.
                </p>
              </aside>
            </div>
          )}

          {/* TAB 2: CUSTOMERS */}
          {activeTab === 'customers' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search by name, phone, or MAC..."
                  style={{ maxWidth: '320px' }}
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
              </div>

              {/* Create Customer Box */}
              <div style={{ background: 'var(--color-surface)', padding: '1.25rem', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)', marginBottom: '1.5rem', boxShadow: 'var(--shadow-card)' }}>
                <h4 style={{ margin: '0 0 0.75rem 0' }}>Register Customer (with Privacy Consent)</h4>
                <form onSubmit={handleCreateCustomer} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 160px' }}>
                    <label className="form-label">Full Name</label>
                    <input className="form-input" value={newCustName} onChange={(e) => setNewCustName(e.target.value)} placeholder="Jane Doe" />
                  </div>
                  <div style={{ flex: '1 1 160px' }}>
                    <label className="form-label">Phone Number</label>
                    <input className="form-input" value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} placeholder="+15551234567" />
                  </div>
                  <div style={{ flex: '1 1 160px' }}>
                    <label className="form-label">Device MAC (Optional)</label>
                    <input className="form-input" value={newCustMac} onChange={(e) => setNewCustMac(e.target.value)} placeholder="AA:BB:CC:11:22:33" />
                  </div>
                  <button type="submit" className="btn-secondary">Add Customer</button>
                </form>
              </div>

              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Display Name</th>
                      <th>Phone</th>
                      <th>Device MAC</th>
                      <th>Consent Accepted</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '2rem' }}>
                          No customers found. Register a customer above.
                        </td>
                      </tr>
                    ) : (
                      customers.map((c) => (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 600 }}>{c.displayName || 'Anonymous Guest'}</td>
                          <td>{c.phone || '—'}</td>
                          <td><code>{c.deviceMac || '—'}</code></td>
                          <td>
                            <span className="badge badge-active">
                              {c.consentAcceptedAt ? '✓ Consent Verified' : 'Standard'}
                            </span>
                          </td>
                          <td style={{ color: 'var(--color-muted)' }}>{new Date(c.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: PACKAGES */}
          {activeTab === 'packages' && (
            <div>
              <div style={{ background: 'var(--color-surface)', padding: '1.25rem', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)', marginBottom: '1.5rem', boxShadow: 'var(--shadow-card)' }}>
                <h4 style={{ margin: '0 0 0.75rem 0' }}>Create Access Package</h4>
                <form onSubmit={handleCreatePackage} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 180px' }}>
                    <label className="form-label">Package Name</label>
                    <input className="form-input" value={newPkgName} onChange={(e) => setNewPkgName(e.target.value)} required />
                  </div>
                  <div style={{ flex: '1 1 120px' }}>
                    <label className="form-label">Duration (Minutes)</label>
                    <input type="number" min="1" className="form-input" value={newPkgDurationMins} onChange={(e) => setNewPkgDurationMins(Number(e.target.value))} required />
                  </div>
                  <div style={{ flex: '1 1 120px' }}>
                    <label className="form-label">Price (Cents / Minor)</label>
                    <input type="number" min="0" className="form-input" value={newPkgPriceCents} onChange={(e) => setNewPkgPriceCents(Number(e.target.value))} required />
                  </div>
                  <button type="submit" className="btn-primary">Add Package</button>
                </form>
              </div>

              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Package Name</th>
                      <th>Duration</th>
                      <th>Price</th>
                      <th>Status</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packages.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '2rem' }}>
                          No access packages configured yet.
                        </td>
                      </tr>
                    ) : (
                      packages.map((p) => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600 }}>{p.name}</td>
                          <td>{Math.floor(p.durationSeconds / 60)} minutes</td>
                          <td><strong>${(p.priceMinor / 100).toFixed(2)}</strong> {p.currency}</td>
                          <td>
                            <span className={`badge ${p.active ? 'badge-active' : 'badge-inactive'}`}>
                              {p.active ? 'Active' : 'Archived'}
                            </span>
                          </td>
                          <td style={{ color: 'var(--color-muted)' }}>{new Date(p.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: COUPONS & VOUCHERS */}
          {activeTab === 'coupons' && (
            <div>
              {/* Voucher Generation Box */}
              <div style={{ background: 'var(--color-surface)', padding: '1.25rem', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)', marginBottom: '1.5rem', boxShadow: 'var(--shadow-card)' }}>
                <h4 style={{ margin: '0 0 0.75rem 0' }}>Generate Access Voucher</h4>
                <form onSubmit={handleCreateCoupon} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 160px' }}>
                    <label className="form-label">Voucher Code</label>
                    <input className="form-input" value={newCouponCode} onChange={(e) => setNewCouponCode(e.target.value)} placeholder="SUMMERPASS" required />
                  </div>
                  <div style={{ flex: '1 1 200px' }}>
                    <label className="form-label">Linked Package</label>
                    <select className="form-input" value={newCouponPkgId} onChange={(e) => setNewCouponPkgId(e.target.value)} required>
                      <option value="">Select Package...</option>
                      {packages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (${(p.priceMinor / 100).toFixed(2)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: '1 1 100px' }}>
                    <label className="form-label">Max Redemptions</label>
                    <input type="number" min="1" className="form-input" value={newCouponMaxUses} onChange={(e) => setNewCouponMaxUses(Number(e.target.value))} required />
                  </div>
                  <button type="submit" className="btn-secondary">Issue Voucher</button>
                </form>
              </div>

              {/* Public Redemption Validator Test Box */}
              <div style={{ background: '#f8fafc', padding: '1rem 1.25rem', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
                <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--color-brand-primary)' }}>Customer Voucher Redemption Tester</h5>
                <form onSubmit={handleTestCoupon} style={{ display: 'flex', gap: '0.5rem', maxWidth: '450px' }}>
                  <input className="form-input" placeholder="Enter voucher code (e.g. SUMMERPASS)" value={couponTestCode} onChange={(e) => setCouponTestCode(e.target.value)} required />
                  <button type="submit" className="btn-outline">Validate</button>
                </form>
                {couponTestResult && (
                  <div style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
                    {couponTestResult.valid ? (
                      <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                        ✓ Valid! Grants "{couponTestResult.packageSnapshot?.name}" ({couponTestResult.coupon?.remainingUses} redemptions left)
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                        ✕ Rejected: {couponTestResult.error?.message}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Voucher Code</th>
                      <th>Redemptions</th>
                      <th>Status</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '2rem' }}>
                          No vouchers issued yet.
                        </td>
                      </tr>
                    ) : (
                      coupons.map((c) => (
                        <tr key={c.id}>
                          <td><code>{c.code}</code></td>
                          <td>{c.currentUses} of {c.maxUses} used</td>
                          <td>
                            <span className={`badge ${c.currentUses < c.maxUses && c.active ? 'badge-active' : 'badge-inactive'}`}>
                              {c.currentUses >= c.maxUses ? 'Exhausted' : c.active ? 'Available' : 'Disabled'}
                            </span>
                          </td>
                          <td style={{ color: 'var(--color-muted)' }}>{new Date(c.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: PAYMENTS & GENERAL LEDGER */}
          {activeTab === 'payments' && (
            <div>
              {/* Financial KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ background: 'var(--color-surface)', padding: '1.25rem', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Settled Cash</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-success)', marginTop: '0.35rem' }}>
                    ${(((ledgerBalance?.netBalanceMinor ?? 0) / 100).toFixed(2))}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '0.25rem' }}>Authoritative ledger balance</div>
                </div>

                <div style={{ background: 'var(--color-surface)', padding: '1.25rem', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gross Sales Revenue</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-brand-primary)', marginTop: '0.35rem' }}>
                    ${(((ledgerBalance?.totalRevenueMinor ?? 0) / 100).toFixed(2))}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '0.25rem' }}>Settled payments &amp; cash</div>
                </div>

                <div style={{ background: 'var(--color-surface)', padding: '1.25rem', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Refunds</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-danger)', marginTop: '0.35rem' }}>
                    -${(((ledgerBalance?.totalRefundsMinor ?? 0) / 100).toFixed(2))}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '0.25rem' }}>Disbursed refund reserve</div>
                </div>

                <div style={{ background: 'var(--color-surface)', padding: '1.25rem', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Transactions</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text)', marginTop: '0.35rem' }}>
                    {paymentsList.length}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '0.25rem' }}>Intents and counter receipts</div>
                </div>
              </div>

              {/* On-Premise Counter Cash Terminal */}
              <div style={{ background: 'var(--color-surface)', padding: '1.25rem', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)', marginBottom: '1.5rem', boxShadow: 'var(--shadow-card)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h4 style={{ margin: 0 }}>💵 Counter Cash Collection Terminal</h4>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Produces tamper-evident receipt &amp; ledger entry</span>
                </div>
                <form onSubmit={handleRecordManualCash} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 120px' }}>
                    <label className="form-label">Amount ($ USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.10"
                      className="form-input"
                      value={cashAmountMajor}
                      onChange={(e) => setCashAmountMajor(parseFloat(e.target.value) || 0)}
                      required
                    />
                  </div>
                  <div style={{ flex: '1 1 200px' }}>
                    <label className="form-label">Linked Package (Optional)</label>
                    <select
                      className="form-input"
                      value={cashPkgId}
                      onChange={(e) => {
                        setCashPkgId(e.target.value);
                        const sel = packages.find((p) => p.id === e.target.value);
                        if (sel) setCashAmountMajor(sel.priceMinor / 100);
                      }}
                    >
                      <option value="">Custom Cash Amount</option>
                      {packages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (${(p.priceMinor / 100).toFixed(2)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: '2 1 220px' }}>
                    <label className="form-label">Counter Note / Reference</label>
                    <input
                      className="form-input"
                      placeholder="e.g. Front desk counter cash, table #4"
                      value={cashNote}
                      onChange={(e) => setCashNote(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="btn-primary" disabled={cashSubmitting}>
                    {cashSubmitting ? 'Recording...' : 'Collect Cash & Issue Receipt'}
                  </button>
                </form>

                {/* Print/View Latest Receipt */}
                {latestReceipt && (
                  <div style={{ marginTop: '1rem', padding: '0.85rem 1rem', background: '#ecfdf5', borderRadius: 'var(--radius-card)', border: '1px solid #d1fae5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--color-success)', fontSize: '0.9rem' }}>
                        ✓ Payment Confirmed: Receipt #{latestReceipt.receiptNumber}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#047857', marginTop: '0.2rem' }}>
                        Amount: ${(latestReceipt.payment.amountMinor / 100).toFixed(2)} {latestReceipt.payment.currency} • Recorded by {latestReceipt.payment.metadata?.actor || 'Owner'}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                      onClick={() => window.print && window.print()}
                    >
                      Print Receipt
                    </button>
                  </div>
                )}
              </div>

              {/* Financial Reconciliation Inspector */}
              <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div>
                    <h5 style={{ margin: 0, color: 'var(--color-brand-primary)', fontSize: '0.95rem' }}>
                      ⚖️ Financial Ledger Reconciliation Audit
                    </h5>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '0.2rem' }}>
                      Compares settled payment intents against general ledger entries to ensure mathematical integrity.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={handleRunReconciliation}
                    disabled={isReconciling}
                  >
                    {isReconciling ? 'Auditing...' : 'Run Reconciliation Audit'}
                  </button>
                </div>

                {reconciliationReport && (
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--color-surface)', borderRadius: '0.5rem', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                      <div>
                        Status:{' '}
                        <strong style={{ color: reconciliationReport.status === 'balanced' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                          {reconciliationReport.status.toUpperCase()}
                        </strong>
                      </div>
                      <div>Discrepancy: <strong>${(reconciliationReport.discrepancyMinor / 100).toFixed(2)}</strong></div>
                      <div>Settled Payments: <strong>{reconciliationReport.completedPaymentsCount}</strong> (${(reconciliationReport.paymentsSumMinor / 100).toFixed(2)})</div>
                      <div>Ledger Sum: <strong>${(reconciliationReport.ledgerSumMinor / 100).toFixed(2)}</strong></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Transactions Table */}
              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ margin: '0 0 0.75rem 0' }}>Payment Transactions</h4>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Receipt / Ref</th>
                        <th>Provider</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentsList.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '2rem' }}>
                            No payment transactions recorded yet.
                          </td>
                        </tr>
                      ) : (
                        paymentsList.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <code>{p.receiptNumber || p.providerRef || p.id.slice(0, 8)}</code>
                            </td>
                            <td>
                              <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: p.provider === 'manual_cash' ? '#f0fdf4' : '#eff6ff', color: p.provider === 'manual_cash' ? '#15803d' : '#1d4ed8' }}>
                                {p.provider}
                              </span>
                            </td>
                            <td>
                              <strong>${(p.amountMinor / 100).toFixed(2)}</strong> {p.currency}
                            </td>
                            <td>
                              <span
                                className={`badge ${
                                  p.status === 'completed'
                                    ? 'badge-active'
                                    : p.status === 'refunded'
                                    ? 'badge-super-admin'
                                    : 'badge-inactive'
                                }`}
                              >
                                {p.status}
                              </span>
                            </td>
                            <td style={{ color: 'var(--color-muted)' }}>{new Date(p.createdAt).toLocaleDateString()}</td>
                            <td>
                              {p.status === 'completed' && (
                                <button
                                  type="button"
                                  className="btn-outline"
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: 'var(--color-danger)' }}
                                  onClick={() => handleExecuteRefund(p.id)}
                                  disabled={refundSubmitting}
                                >
                                  Refund
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* General Ledger Entries */}
              <div>
                <h4 style={{ margin: '0 0 0.75rem 0' }}>General Ledger Entries (Double-Entry Log)</h4>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Entry Type</th>
                        <th>Account</th>
                        <th>Amount</th>
                        <th>Description</th>
                        <th>Actor</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerList.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '2rem' }}>
                            Ledger is currently empty.
                          </td>
                        </tr>
                      ) : (
                        ledgerList.map((entry) => (
                          <tr key={entry.id}>
                            <td>
                              <span
                                style={{
                                  fontWeight: 600,
                                  color: entry.entryType === 'sale' ? 'var(--color-success)' : 'var(--color-danger)',
                                }}
                              >
                                {entry.entryType.toUpperCase()}
                              </span>
                            </td>
                            <td><code>{entry.account || 'revenue'}</code></td>
                            <td>
                              <strong style={{ color: entry.amountMinor > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                {entry.amountMinor > 0 ? `+$${(entry.amountMinor / 100).toFixed(2)}` : `-$${(Math.abs(entry.amountMinor) / 100).toFixed(2)}`}
                              </strong>
                            </td>
                            <td style={{ fontSize: '0.85rem' }}>{entry.description}</td>
                            <td style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>{entry.actor || 'System'}</td>
                            <td style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>{new Date(entry.createdAt).toLocaleTimeString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: USER MANAGEMENT */}
          {activeTab === 'users' && canAccessAdmin && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search accounts by name or email..."
                  style={{ maxWidth: '320px' }}
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>

              {/* Add Staff Operator */}
              <div style={{ background: 'var(--color-surface)', padding: '1.25rem', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)', marginBottom: '1.5rem', boxShadow: 'var(--shadow-card)' }}>
                <h4 style={{ margin: '0 0 0.75rem 0' }}>Provision Staff Operator Account</h4>
                <form onSubmit={handleCreateStaff} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 160px' }}>
                    <label className="form-label">Full Name</label>
                    <input className="form-input" value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)} required />
                  </div>
                  <div style={{ flex: '1 1 180px' }}>
                    <label className="form-label">Staff Email</label>
                    <input type="email" className="form-input" value={newStaffEmail} onChange={(e) => setNewStaffEmail(e.target.value)} required />
                  </div>
                  <div style={{ flex: '1 1 160px' }}>
                    <label className="form-label">Temporary Password (min 8)</label>
                    <input type="password" minLength={8} className="form-input" value={newStaffPassword} onChange={(e) => setNewStaffPassword(e.target.value)} required />
                  </div>
                  <button type="submit" className="btn-primary">Add Staff</button>
                </form>
              </div>

              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Last Login</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{u.displayName || u.businessName}</div>
                          <small style={{ color: 'var(--color-muted)' }}>{u.email}</small>
                        </td>
                        <td>
                          <span className={`badge ${u.role === 'SUPER_ADMIN' ? 'badge-super-admin' : u.role === 'OWNER' ? 'badge-owner' : 'badge-staff'}`}>
                            {u.role}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${u.isActive ? 'badge-active' : 'badge-inactive'}`}>
                            {u.isActive ? 'Active' : 'Deactivated'}
                          </span>
                        </td>
                        <td style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>
                          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                        </td>
                        <td>
                          {isSuperAdmin && (
                            <button
                              type="button"
                              className={u.isActive ? 'btn-danger' : 'btn-outline'}
                              style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                              onClick={() => handleToggleUserActive(u.id, u.isActive)}
                            >
                              {u.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: AUDIT TRAIL */}
          {activeTab === 'audit' && canAccessAdmin && (
            <div>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Timestamp (UTC)</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Resource Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '2rem' }}>
                          No audit records found.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>{log.createdAt}</td>
                          <td style={{ fontWeight: 600 }}>{log.actor}</td>
                          <td><code>{log.action}</code></td>
                          <td><span className="badge badge-staff">{log.resourceType}</span></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: AI OPERATIONS INSIGHTS */}
          {activeTab === 'ai' && canAccessAdmin && (
            <div>
              <section className="hero">
                <small>AI-ASSISTED OPERATIONAL TELEMETRY</small>
                <h2>Operational Telemetry &amp; Security Posture</h2>
                <p>
                  AI insights operate over anonymized authorized telemetry. Critical operations require human verification;
                  automated role elevation or privilege changes are strictly blocked.
                </p>
                <b>Privacy Safe · Free-Tier First Architecture</b>
              </section>

              {aiInsights && (
                <>
                  <div className="grid" style={{ marginBottom: '1.5rem' }}>
                    <article className="card">
                      <span className="icon ok">🛡️</span>
                      <div>
                        <h3>{aiInsights.summary.recentAuditedActions} Audited Actions</h3>
                        <p>{aiInsights.summary.loginsDetected} successful sign-ins detected</p>
                      </div>
                    </article>
                    <article className="card">
                      <span className="icon ok">✓</span>
                      <div>
                        <h3>{aiInsights.summary.totalTrackedAccounts} Tracked Accounts</h3>
                        <p>{aiInsights.summary.sensitiveStateTransitions} sensitive administrative transitions</p>
                      </div>
                    </article>
                  </div>

                  <div className="heading">
                    <div>
                      <small>ANALYTICS ENGINE</small>
                      <h2>Advisories &amp; Insights</h2>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {aiInsights.insights.map((ins: any, idx: number) => (
                      <div
                        key={idx}
                        style={{
                          background: 'white',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-card)',
                          padding: '1.25rem',
                          boxShadow: 'var(--shadow-card)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-brand-primary)' }}>
                            {ins.headline}
                          </span>
                          <span className="badge badge-active">{ins.level}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-muted)', lineHeight: 1.5 }}>
                          {ins.detail}
                        </p>
                      </div>
                    ))}
                  </div>

                  <aside style={{ marginTop: '1.5rem' }}>
                    <strong>Safety Guarantee</strong>
                    <p>{aiInsights.disclaimer}</p>
                  </aside>
                </>
              )}
            </div>
          )}

          {/* TAB 8: SECURITY & PASSWORD CHANGE */}
          {activeTab === 'security' && (
            <div style={{ maxWidth: '480px' }}>
              <div style={{ background: 'var(--color-surface)', padding: '1.5rem', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}>
                <h3 style={{ margin: '0 0 0.5rem 0' }}>Change Account Password</h3>
                <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                  Updating your password will immediately invalidate any other active sessions.
                </p>

                <form onSubmit={handleChangePassword}>
                  <div className="form-group">
                    <label className="form-label">Current Password</label>
                    <input
                      type="password"
                      className="form-input"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">New Password (min 8 characters)</label>
                    <input
                      type="password"
                      minLength={8}
                      className="form-input"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Confirm New Password</label>
                    <input
                      type="password"
                      minLength={8}
                      className="form-input"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>

                  <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
                    Update Password
                  </button>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Logout Confirmation Dialog */}
      <LogoutModal
        isOpen={isLogoutModalOpen}
        onCancel={() => setIsLogoutModalOpen(false)}
        onConfirm={handleConfirmLogout}
        isLoading={logoutLoading}
      />
    </div>
  );
}
