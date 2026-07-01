// Dev-only harness root. Wraps the real surfaces in the providers they need.
import { AuthProvider } from '../contexts/AuthContext';
import { ClientStrategyProvider } from '../contexts/ClientStrategyContext';
import { CommandFPage } from '../components/CommandFPage';
import { CommandFLogin } from '../standalone/CommandFLogin';
import { SetPasswordScreen } from '../components/SetPasswordScreen';

// Mock user identity for the dev harness (matches the stubbed getSession in main.tsx).
const MOCK_USER_NAME = 'Ty Bibas';
const MOCK_USER_EMAIL = 'ty@actionistconsulting.com';

export function HarnessRoot({ view }: { view: string }) {
  if (view === 'login') {
    return <AuthProvider><CommandFLogin /></AuthProvider>;
  }
  if (view === 'setpassword') {
    return <AuthProvider><SetPasswordScreen /></AuthProvider>;
  }
  // Default: the full product shell (home/chat/deck/survey/panels), driven by
  // Playwright interactions against the real fetch-stubbed api layer.
  return (
    <AuthProvider>
      <ClientStrategyProvider>
        <div className="h-screen flex flex-col bg-bg-primary overflow-hidden">
          <CommandFPage
            userName={MOCK_USER_NAME}
            userEmail={MOCK_USER_EMAIL}
            onSignOut={() => console.info('[harness] sign-out triggered')}
          />
        </div>
      </ClientStrategyProvider>
    </AuthProvider>
  );
}
