import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Route, Switch, Router as WouterRouter } from 'wouter';

import AppLayout from '@/components/layout/app-layout';
import { AuthGate } from '@/components/auth-gate';
import Landing from '@/pages/landing';
import Dashboard from '@/pages/dashboard';
import Calls from '@/pages/calls';
import CallDetail from '@/pages/call-detail';
import Jobs from '@/pages/jobs';
import Assistants from '@/pages/assistants';
import Contacts from '@/pages/contacts';
import Settings from '@/pages/settings';
import Quotes from '@/pages/quotes';
import Invoices from '@/pages/invoices';
import Certificates from '@/pages/certificates';
import EmailInbox from '@/pages/email-inbox';
import Tasks from '@/pages/tasks';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-secondary">404</h1>
        <p className="mt-2 text-muted-foreground">Page not found</p>
        <a href="/" className="mt-4 text-primary hover:underline block">Return home</a>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public Route */}
      <Route path="/" component={Landing} />

      {/* App Routes wrapped in layout — all gated behind an admin session */}
      <Route path="/dashboard">
        <AuthGate><AppLayout><Dashboard /></AppLayout></AuthGate>
      </Route>
      <Route path="/calls">
        <AuthGate><AppLayout><Calls /></AppLayout></AuthGate>
      </Route>
      <Route path="/calls/:id">
        <AuthGate><AppLayout><CallDetail /></AppLayout></AuthGate>
      </Route>
      <Route path="/jobs">
        <AuthGate><AppLayout><Jobs /></AppLayout></AuthGate>
      </Route>
      <Route path="/assistants">
        <AuthGate><AppLayout><Assistants /></AppLayout></AuthGate>
      </Route>
      <Route path="/contacts">
        <AuthGate><AppLayout><Contacts /></AppLayout></AuthGate>
      </Route>
      <Route path="/quotes">
        <AuthGate><AppLayout><Quotes /></AppLayout></AuthGate>
      </Route>
      <Route path="/invoices">
        <AuthGate><AppLayout><Invoices /></AppLayout></AuthGate>
      </Route>
      <Route path="/certificates">
        <AuthGate><AppLayout><Certificates /></AppLayout></AuthGate>
      </Route>
      <Route path="/email-inbox">
        <AuthGate><AppLayout><EmailInbox /></AppLayout></AuthGate>
      </Route>
      <Route path="/settings">
        <AuthGate><AppLayout><Settings /></AppLayout></AuthGate>
      </Route>
      <Route path="/tasks">
        <AuthGate><AppLayout><Tasks /></AppLayout></AuthGate>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
