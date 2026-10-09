import React from 'react';

interface LogoutModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

export function LogoutModal({ isOpen, onConfirm, onCancel, isLoading }: LogoutModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="logout-title">
      <div className="modal-card">
        <h3 id="logout-title" style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', color: 'var(--color-text)' }}>
          Confirm Sign Out
        </h3>
        <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 1.5rem 0' }}>
          Are you sure you want to end your current session? You will need to sign in again to manage your hotspot
          operations and customer accounts.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn-outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Signing Out...' : 'Sign Out'}
          </button>
        </div>
      </div>
    </div>
  );
}
