import {
  DeviceCodeCancelledError,
  type DeviceCodeChallenge,
  type DeviceCodePollHooks,
} from './device-code-auth';
import type { TokenSet, UserInfo } from './token-manager';

export type DeviceCodeFlowState =
  | { phase: 'idle' }
  | { phase: 'requesting' }
  | { phase: 'polling'; userCode: string; pollStatus: 'waiting' | 'slow_down' }
  | { phase: 'error'; message: string };

export interface DeviceCodeControllerDeps {
  requestCode: () => Promise<DeviceCodeChallenge>;
  poll: (challenge: DeviceCodeChallenge, hooks: DeviceCodePollHooks) => Promise<TokenSet>;
  adoptTokens: (set: TokenSet) => Promise<UserInfo | null>;
  persistLiveMode: () => Promise<void>;
}

export class DeviceCodeController {
  private generation = 0;
  private state: DeviceCodeFlowState = { phase: 'idle' };
  private readonly stateListeners = new Set<(state: DeviceCodeFlowState) => void>();
  private readonly signInListeners = new Set<(user: UserInfo | null) => void>();

  constructor(private readonly deps: DeviceCodeControllerDeps) {}

  getState(): DeviceCodeFlowState {
    return this.state;
  }

  subscribe(listener: (state: DeviceCodeFlowState) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  onSignedIn(listener: (user: UserInfo | null) => void): () => void {
    this.signInListeners.add(listener);
    return () => {
      this.signInListeners.delete(listener);
    };
  }

  cancel(): void {
    this.generation += 1;
    this.setState({ phase: 'idle' });
  }

  clearError(): void {
    if (this.state.phase === 'error') this.setState({ phase: 'idle' });
  }

  async start(): Promise<UserInfo | null> {
    const generation = ++this.generation;
    const current = () => this.generation === generation;
    this.setState({ phase: 'requesting' });
    try {
      const challenge = await this.deps.requestCode();
      if (!current()) return null;
      this.setState({ phase: 'polling', userCode: challenge.userCode, pollStatus: 'waiting' });
      const tokens = await this.deps.poll(challenge, {
        cancelled: () => !current(),
        onStatus: (status) => {
          if (current()) {
            this.setState({ phase: 'polling', userCode: challenge.userCode, pollStatus: status });
          }
        },
      });
      if (!current()) return null;
      const user = await this.deps.adoptTokens(tokens);
      try {
        await this.deps.persistLiveMode();
      } catch {
      }
      if (current()) this.setState({ phase: 'idle' });
      for (const listener of [...this.signInListeners]) listener(user);
      return user;
    } catch (e) {
      if (e instanceof DeviceCodeCancelledError) {
        if (current()) this.setState({ phase: 'idle' });
        return null;
      }
      if (current()) {
        this.setState({
          phase: 'error',
          message: e instanceof Error ? e.message : 'Sign-in failed',
        });
      }
      return null;
    }
  }

  private setState(state: DeviceCodeFlowState): void {
    this.state = state;
    for (const listener of [...this.stateListeners]) listener(state);
  }
}
