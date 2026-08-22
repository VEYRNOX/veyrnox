// @ts-nocheck
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { render, screen } from '@testing-library/react';
import ProtectedCloudRoute from '@/components/ProtectedCloudRoute';

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isConfigured: true,
  isLoading: false,
  suspended: false,
}));

vi.mock('@/lib/SupabaseAuthProvider', () => ({
  useSupabaseAuth: () => authState,
}));

vi.mock('@/components/Spinner', () => ({
  default: ({ label }) => <div>{label}</div>,
}));

describe('ProtectedCloudRoute', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isConfigured = true;
    authState.isLoading = false;
    authState.suspended = false;
  });

  function renderRoutes(initialEntry = '/account') {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/account/login" element={<div>login page</div>} />
          <Route element={<ProtectedCloudRoute />}>
            <Route path="/account" element={<div>protected page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  it('redirects unauthenticated users to the cloud login route', () => {
    renderRoutes();
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('renders the protected outlet when authenticated', () => {
    authState.isAuthenticated = true;
    renderRoutes();
    expect(screen.getByText('protected page')).toBeInTheDocument();
  });

  it('fails closed in deniability or demo sessions', () => {
    authState.suspended = true;
    renderRoutes();
    expect(screen.getByText('Unavailable in this session')).toBeInTheDocument();
  });

  it('shows the configuration guard when Supabase env vars are absent', () => {
    authState.isConfigured = false;
    renderRoutes();
    expect(screen.getByText('Cloud account not configured')).toBeInTheDocument();
  });
});
