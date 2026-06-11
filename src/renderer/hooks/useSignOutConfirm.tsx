
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
    {}
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


export interface UseSignOutConfirmReturn {
  triggerSignOut: () => void;
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
