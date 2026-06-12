
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
import { SignOutRegular, PersonSwapRegular } from '@fluentui/react-icons';
import { useAuthStore } from '../stores/auth-store';

export type SessionEndAction = 'sign-out' | 'switch-account';

const COPY: Record<
  SessionEndAction,
  { title: string; body: string; confirmLabel: string }
> = {
  'sign-out': {
    title: 'Sign out?',
    body: 'You will be returned to the sign-in screen. Any open reports will be closed.',
    confirmLabel: 'Sign out',
  },
  'switch-account': {
    title: 'Switch account?',
    body: 'Switching accounts closes any open reports and dashboards and returns you to the sign-in screen to choose another account.',
    confirmLabel: 'Switch account',
  },
};

const DANGER_BUTTON_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--colorStatusDangerBackground3, #d13438)',
  borderColor: 'var(--colorStatusDangerBackground3, #d13438)',
  color: '#ffffff',
};

export interface SignOutConfirmDialogProps {
  open: boolean;
  action: SessionEndAction;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export const SignOutConfirmDialog: React.FC<SignOutConfirmDialogProps> = ({
  open,
  action,
  onOpenChange,
  onConfirm,
  onCancel,
}) => {
  const copy = COPY[action];
  return (
    <Dialog open={open} onOpenChange={(_e, data) => onOpenChange(data.open)}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogContent>{copy.body}</DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary" onClick={onCancel}>
                Cancel
              </Button>
            </DialogTrigger>
            <Button
              appearance="primary"
              style={DANGER_BUTTON_STYLE}
              icon={action === 'sign-out' ? <SignOutRegular /> : <PersonSwapRegular />}
              onClick={onConfirm}
            >
              {copy.confirmLabel}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

export interface UseSignOutConfirmReturn {
  triggerSignOut: () => void;
  triggerSwitchAccount: () => void;
  dialogProps: SignOutConfirmDialogProps;
}

export function useSignOutConfirm(): UseSignOutConfirmReturn {
  const { logout, switchAccount } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<SessionEndAction>('sign-out');

  const triggerSignOut = useCallback(() => {
    setAction('sign-out');
    setOpen(true);
  }, []);

  const triggerSwitchAccount = useCallback(() => {
    setAction('switch-account');
    setOpen(true);
  }, []);

  const handleConfirm = useCallback(() => {
    setOpen(false);
    if (action === 'switch-account') {
      void switchAccount();
    } else {
      void logout();
    }
  }, [action, logout, switchAccount]);

  const handleCancel = useCallback(() => {
    setOpen(false);
  }, []);

  return {
    triggerSignOut,
    triggerSwitchAccount,
    dialogProps: {
      open,
      action,
      onOpenChange: setOpen,
      onConfirm: handleConfirm,
      onCancel: handleCancel,
    },
  };
}

export default useSignOutConfirm;
