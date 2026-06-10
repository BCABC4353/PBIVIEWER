/**
 * useSignOutConfirm
 *
 * Returns a trigger function and a Dialog element. Calling the trigger shows
 * a Fluent UI confirmation dialog; if the user confirms, the auth-store
 * `logout` action is invoked. The dialog state is fully managed internally.
 *
 * Usage:
 *   const { triggerSignOut, SignOutDialog } = useSignOutConfirm();
 *   // Render <SignOutDialog /> somewhere in the tree (e.g. below TitleBar),
 *   // then call triggerSignOut() from any click handler.
 */

import React, { useCallback, useState } from 'react';
import {
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Button,
} from '@fluentui/react-components';
import { SignOutRegular } from '@fluentui/react-icons';
import { useAuthStore } from '../stores/auth-store';

// Internal dialog component

interface SignOutDialogInternalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const SignOutDialogInternal: React.FC<SignOutDialogInternalProps> = ({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
}) => (
  <Dialog open={open} onOpenChange={(_e, data) => onOpenChange(data.open)}>
    {/* DialogTrigger is not rendered — we drive open state externally via
        triggerSignOut(). The Dialog is still accessible because open/
        onOpenChange are controlled. A hidden sentinel satisfies Fluent's
        internal trigger requirement. */}
    <DialogTrigger disableButtonEnhancement>
      <span style={{ display: 'none' }} aria-hidden="true" />
    </DialogTrigger>
    <DialogSurface>
      <DialogBody>
        <DialogTitle>Sign out?</DialogTitle>
        <DialogContent>
          You will be returned to the sign-in screen. Any open reports will be closed.
        </DialogContent>
        <DialogActions>
          <DialogTrigger disableButtonEnhancement>
            <Button appearance="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </DialogTrigger>
          <Button appearance="primary" icon={<SignOutRegular />} onClick={onConfirm}>
            Sign out
          </Button>
        </DialogActions>
      </DialogBody>
    </DialogSurface>
  </Dialog>
);

// Public hook

export interface UseSignOutConfirmReturn {
  /** Call this to open the confirmation dialog (e.g. from a MenuItem onClick). */
  triggerSignOut: () => void;
  /** Render this element in the component tree — it manages its own Dialog state. */
  SignOutDialog: React.FC;
}

export function useSignOutConfirm(): UseSignOutConfirmReturn {
  const { logout } = useAuthStore();
  const [open, setOpen] = useState(false);

  const triggerSignOut = useCallback(() => {
    setOpen(true);
  }, []);

  const handleConfirm = useCallback(() => {
    setOpen(false);
    void logout();
  }, [logout]);

  const handleCancel = useCallback(() => {
    setOpen(false);
  }, []);

  // Stable reference — the internal component reads the latest state via
  // props that close over the hook's local callbacks.
  const SignOutDialog: React.FC = useCallback(
    () => (
      <SignOutDialogInternal
        open={open}
        onOpenChange={setOpen}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    ),
    [open, handleConfirm, handleCancel],
  ) as React.FC;

  return { triggerSignOut, SignOutDialog };
}

export default useSignOutConfirm;
