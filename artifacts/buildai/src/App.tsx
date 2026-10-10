import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Route, Switch, Router as WouterRouter } from 'wouter';

import AppLayout from '@/components/layout/app-layout';
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
import DataImport from '@/pages/data-import';
import Billing from '@/pages/billing';
import BusinessSetup from '@/pages/business-setup';
import PublicQuotePage from '@/pages/public-quote';
import { useRoute } from 'wouter';
import VoiceAssistant from '@/components/layout/voice-assistant';
import { VoiceProvider } from '@/lib/voice-context';

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
      <Route path="/quote/accept/:token" component={PublicQuotePage} />

      {/* App Routes wrapped in layout */}
      <Route path="/dashboard">
        <AppLayout><Dashboard /></AppLayout>
      </Route>
      <Route path="/calls">
        <AppLayout><Calls /></AppLayout>
      </Route>
      <Route path="/calls/:id">
        <AppLayout><CallDetail /></AppLayout>
      </Route>
      <Route path="/jobs">
        <AppLayout><Jobs /></AppLayout>
      </Route>
      <Route path="/assistants">
        <AppLayout><Assistants /></AppLayout>
      </Route>
      <Route path="/contacts">
        <AppLayout><Contacts /></AppLayout>
      </Route>
      <Route path="/quotes">
        <AppLayout><Quotes /></AppLayout>
      </Route>
      <Route path="/invoices">
        <AppLayout><Invoices /></AppLayout>
      </Route>
      <Route path="/certificates">
        <AppLayout><Certificates /></AppLayout>
      </Route>
      <Route path="/email-inbox">
        <AppLayout><EmailInbox /></AppLayout>
      </Route>
      <Route path="/settings">
        <AppLayout><Settings /></AppLayout>
      </Route>
      <Route path="/business-setup">
        <AppLayout><BusinessSetup /></AppLayout>
      </Route>
      <Route path="/data-import">
        <AppLayout><DataImport /></AppLayout>
      </Route>
      <Route path="/billing">
        <AppLayout><Billing /></AppLayout>
      </Route>
      <Route path="/tasks">
        <AppLayout><Tasks /></AppLayout>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function Shell() {
  const [isPublic] = useRoute('/quote/accept/:token');
  return (<><Router />{!isPublic && <VoiceAssistant />}</>);
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <VoiceProvider>
          <Shell />
        </VoiceProvider>
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
