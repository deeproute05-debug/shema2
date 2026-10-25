import { useState, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useAuthInit } from '@/core/useAuthInit';
import { useAuthStore } from '@/core/authStore';
import { RouteErrorBoundary } from '@/core/RouteErrorBoundary';
import { LoginScreen } from '@/shell/LoginScreen';
import { ProtectedLayout, type ShellView } from '@/shell/ProtectedLayout';
import { Dashboard } from '@/shell/Dashboard';
import { CompanyScreen } from '@/shell/CompanyScreen';
import { DepartmentsScreen } from '@/shell/DepartmentsScreen';
import { EmployeesScreen } from '@/shell/EmployeesScreen';
import { SettingsScreen } from '@/shell/SettingsScreen';
import { ModulesScreen } from '@/shell/ModulesScreen';
import { UpdateBanner } from '@/shell/UpdateBanner';
import { Toaster } from '@/components/Toaster';

const SchemaScreen = lazy(() => import('@/shell/SchemaScreen').then((m) => ({ default: m.SchemaScreen })));

function App() {
  const { t } = useTranslation();
  const { ready } = useAuthInit();
  const user = useAuthStore((s) => s.user);
  const [view, setView] = useState<ShellView>('dashboard');

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 dark:bg-ink-950">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <>
      <UpdateBanner />
      <Toaster />
      {!user ? (
        <LoginScreen />
      ) : (
        <ProtectedLayout view={view} onNavigate={setView}>
          <RouteErrorBoundary key={view} onReset={() => setView('dashboard')}>
            {view === 'dashboard' && <Dashboard onNavigate={setView} />}
            {view === 'company' && <CompanyScreen />}
            {view === 'departments' && <DepartmentsScreen />}
            {view === 'employees' && <EmployeesScreen />}
            {view === 'schema' && (
              <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ink-400" /></div>}>
                <SchemaScreen />
              </Suspense>
            )}
            {view === 'settings' && <SettingsScreen />}
            {view === 'modules' && <ModulesScreen />}
          </RouteErrorBoundary>
        </ProtectedLayout>
      )}
    </>
  );
}

export default App;
