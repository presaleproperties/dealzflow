import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useNavigate, Routes, Route } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useComposerBackButton } from '@/hooks/useComposerBackButton';

/**
 * Mobile regression: composer back-button behavior.
 *
 * Bug being guarded against:
 *   When a user opens the Email or SMS composer from a Lead Detail page on
 *   mobile and presses the OS back gesture, the browser would navigate
 *   AWAY from the lead instead of just closing the composer modal.
 *
 * Contract under test (useComposerBackButton):
 *   1. When `open` flips to true, a synthetic history entry is pushed.
 *   2. A `popstate` event (back button) calls onClose(false) — the modal
 *      closes WITHOUT changing the route.
 *   3. When the modal is closed by the user (Cancel/Send) and not by Back,
 *      the synthetic entry is popped so we don't leak history.
 */
describe('useComposerBackButton — mobile composer regression', () => {
  beforeEach(() => {
    // Reset history to a known baseline for each test.
    window.history.replaceState({}, '', '/crm/leads/lead-123');
  });

  it('pushes a synthetic history entry when the composer opens', () => {
    const onClose = vi.fn();
    const pushSpy = vi.spyOn(window.history, 'pushState');

    renderHook(({ open }) => useComposerBackButton(open, onClose), {
      initialProps: { open: true },
    });

    expect(pushSpy).toHaveBeenCalledWith({ __composeOpen: true }, '');
    pushSpy.mockRestore();
  });

  it('closes the composer (does NOT navigate away) when back button fires popstate', () => {
    const onClose = vi.fn();
    const startPath = window.location.pathname;

    renderHook(() => useComposerBackButton(true, onClose));

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(onClose).toHaveBeenCalledWith(false);
    // Critical: we must still be on the lead detail page.
    expect(window.location.pathname).toBe(startPath);
  });

  it('cleans up the synthetic entry when closed via Cancel/Send (no Back press)', () => {
    const onClose = vi.fn();
    const backSpy = vi.spyOn(window.history, 'back');

    const { rerender } = renderHook(
      ({ open }) => useComposerBackButton(open, onClose),
      { initialProps: { open: true } },
    );

    // Simulate user closing by clicking Send/Cancel — open flips to false.
    rerender({ open: false });

    expect(backSpy).toHaveBeenCalledTimes(1);
    backSpy.mockRestore();
  });

  it('does not register popstate listener when composer is closed', () => {
    const onClose = vi.fn();
    renderHook(() => useComposerBackButton(false, onClose));

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});

/**
 * Integration-style regression: a tiny component mirroring the composer
 * pattern used by ComposeEmailDialog and SendSmsDialog. Verifies the
 * end-to-end flow keeps the user on the lead detail route.
 */
function FakeLeadDetail() {
  const [open, setOpen] = useState(false);
  useComposerBackButton(open, setOpen);
  return (
    <div>
      <h1>Lead Detail</h1>
      <button onClick={() => setOpen(true)}>Email</button>
      {open && <div role="dialog">Composer Open</div>}
    </div>
  );
}

function NotLeadPage() {
  return <h1>Other Page</h1>;
}

function TestRouter({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/crm/leads/lead-123']}>
      <Routes>
        <Route path="/crm/leads/lead-123" element={children} />
        <Route path="/other" element={<NotLeadPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Composer flow stays on lead detail page', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/crm/leads/lead-123');
  });

  it('back press closes composer and stays on lead', () => {
    render(
      <TestRouter>
        <FakeLeadDetail />
      </TestRouter>,
    );

    fireEvent.click(screen.getByText('Email'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Lead Detail')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Lead detail header must still be on screen.
    expect(screen.getByText('Lead Detail')).toBeInTheDocument();
  });
});
