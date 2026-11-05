import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ToastProvider } from '@/lib/toast';
import { ThemeProvider } from '@/lib/themes';
import './index.css';

function AppProviders({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  return (
    <ThemeProvider initialTheme={profile?.theme}>
      {children}
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <AuthProvider>
        <AppProviders>
          <App />
        </AppProviders>
      </AuthProvider>
    </ToastProvider>
  </StrictMode>
);
