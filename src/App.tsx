import { Suspense } from "react";
import { lazyWithRetry as lazy } from "@/utils/lazyWithRetry";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import PWAUpdatePrompt from "@/components/PWAUpdatePrompt";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { useNativeStartup } from "@/hooks/useNativeStartup";
import Auth from "./pages/Auth";



// Lazy-load all route pages for faster initial load
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Attendance = lazy(() => import("./pages/Attendance"));
const Visits = lazy(() => import("./pages/Visits"));
const Expenses = lazy(() => import("./pages/Expenses"));
const More = lazy(() => import("./pages/More"));
const GPSTracking = lazy(() => import("./pages/GPSTracking"));
const AdminControls = lazy(() => import("./pages/AdminControls"));
const AdminUserManagement = lazy(() => import("./pages/AdminUserManagement"));
const AttendanceManagement = lazy(() => import("./pages/AttendanceManagement"));
const AdminExpenseManagement = lazy(() => import("./pages/AdminExpenseManagement"));
const SecurityManagement = lazy(() => import("./pages/SecurityManagement"));
const CompanyProfile = lazy(() => import("./pages/CompanyProfile"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ProjectsPage = lazy(() => import("./pages/Projects"));
const ProjectDetailPage = lazy(() => import("./pages/ProjectDetail"));
const TemplatesPage = lazy(() => import("./pages/Templates"));
const PendingApprovals = lazy(() => import("./pages/PendingApprovals"));
const Activities = lazy(() => import("./pages/Activities"));
const ActivityTimeline = lazy(() => import("./pages/ActivityTimeline"));
const SiteMasterPage = lazy(() => import("./pages/SiteMaster"));
const ActivityTypeMasterPage = lazy(() => import("./pages/ActivityTypeMaster"));
const InstallApp = lazy(() => import("./pages/InstallApp"));
const Profile = lazy(() => import("./pages/Profile"));
const MyTeam = lazy(() => import("./pages/MyTeam"));
const Vendors = lazy(() => import("./pages/Vendors"));
const VendorDetail = lazy(() => import("./pages/VendorDetail"));
const MasterData = lazy(() => import("./pages/MasterData"));
const CategoryMaster = lazy(() => import("./pages/master/CategoryMaster"));
const ProductMaster = lazy(() => import("./pages/master/ProductMaster"));
const AddressBook = lazy(() => import("./pages/master/AddressBook"));

const Procurement = lazy(() => import("./pages/Procurement"));
const GRN = lazy(() => import("./pages/GRN"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Customers = lazy(() => import("./pages/Customers"));
const CustomerDetail = lazy(() => import("./pages/CustomerDetail"));

const OpportunityDetail = lazy(() => import("./pages/OpportunityDetail"));
const Opportunities = lazy(() => import("./pages/Opportunities"));
const OpportunityStagesMaster = lazy(() => import("./pages/master/OpportunityStagesMaster"));
const OpportunityTypesMaster = lazy(() => import("./pages/master/OpportunityTypesMaster"));
const UomMaster = lazy(() => import("./pages/master/UomMaster"));
const ConfigurationWorkflow = lazy(() => import("./pages/ConfigurationWorkflow"));
const Leads = lazy(() => import("./pages/Leads"));
const Events = lazy(() => import("./pages/Events"));
const LeadDetail = lazy(() => import("./pages/LeadDetail"));
const EventDetail = lazy(() => import("./pages/EventDetail"));
const EventTypesMaster = lazy(() => import("./pages/master/EventTypesMaster"));
const LeadStatusesMaster = lazy(() => import("./pages/master/LeadStatusesMaster"));
const LeadSourcesMaster = lazy(() => import("./pages/master/LeadSourcesMaster"));
const OutcomeMaster = lazy(() => import("./pages/master/OutcomeMaster"));
const IndustriesMaster = lazy(() => import("./pages/master/IndustriesMaster"));
const LeadScoringMaster = lazy(() => import("./pages/master/LeadScoringMaster"));
const CurrencyMaster = lazy(() => import("./pages/master/CurrencyMaster"));
const PaymentTermsMaster = lazy(() => import("./pages/master/PaymentTermsMaster"));
const OpportunityScoringMaster = lazy(() => import("./pages/master/OpportunityScoringMaster"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const App = () => {
  // Request native hardware permissions at launch, before any tracking hook
  // mounts. Keeping this at the root avoids racing the background-geolocation
  // watcher, which Android cannot resolve concurrently.
  useNativeStartup();

  return (
  <QueryClientProvider client={queryClient}>

    <AppErrorBoundary>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <PWAUpdatePrompt />
      <BrowserRouter>

        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Suspense fallback={<PageFallback />}><Dashboard /></Suspense>} />
            <Route path="/attendance" element={<Suspense fallback={<PageFallback />}><Attendance /></Suspense>} />
            <Route path="/visits" element={<Suspense fallback={<PageFallback />}><Visits /></Suspense>} />
            <Route path="/expenses" element={<Suspense fallback={<PageFallback />}><Expenses /></Suspense>} />
            <Route path="/more" element={<Suspense fallback={<PageFallback />}><More /></Suspense>} />
            <Route path="/gps-tracking" element={<Suspense fallback={<PageFallback />}><GPSTracking /></Suspense>} />
            <Route path="/admin-controls" element={<Suspense fallback={<PageFallback />}><AdminControls /></Suspense>} />
            <Route path="/admin" element={<Suspense fallback={<PageFallback />}><AdminControls /></Suspense>} />
            <Route path="/admin/users" element={<Suspense fallback={<PageFallback />}><AdminUserManagement /></Suspense>} />
            <Route path="/admin/attendance" element={<Suspense fallback={<PageFallback />}><AttendanceManagement /></Suspense>} />
            <Route path="/admin/expenses" element={<Suspense fallback={<PageFallback />}><AdminExpenseManagement /></Suspense>} />
            <Route path="/admin/security" element={<Suspense fallback={<PageFallback />}><SecurityManagement /></Suspense>} />
            <Route path="/admin/company" element={<Suspense fallback={<PageFallback />}><CompanyProfile /></Suspense>} />
            <Route path="/admin/configuration" element={<Suspense fallback={<PageFallback />}><ConfigurationWorkflow /></Suspense>} />
            <Route path="/admin/sites" element={<Navigate to="/sites" replace />} />
            <Route path="/sites" element={<Suspense fallback={<PageFallback />}><SiteMasterPage /></Suspense>} />
            <Route path="/activity-types" element={<Suspense fallback={<PageFallback />}><ActivityTypeMasterPage /></Suspense>} />
            <Route path="/admin/activity-types" element={<Navigate to="/activity-types" replace />} />
            <Route path="/projects" element={<Suspense fallback={<PageFallback />}><ProjectsPage /></Suspense>} />
            <Route path="/projects/:id" element={<Suspense fallback={<PageFallback />}><ProjectDetailPage /></Suspense>} />
            <Route path="/templates" element={<Suspense fallback={<PageFallback />}><TemplatesPage /></Suspense>} />
            <Route path="/templates/:id" element={<Suspense fallback={<PageFallback />}><TemplatesPage /></Suspense>} />
            <Route path="/pending-approvals" element={<Suspense fallback={<PageFallback />}><PendingApprovals /></Suspense>} />
            <Route path="/activities" element={<Suspense fallback={<PageFallback />}><Activities /></Suspense>} />
            <Route path="/activity-timeline" element={<Suspense fallback={<PageFallback />}><ActivityTimeline /></Suspense>} />
            <Route path="/profile" element={<Suspense fallback={<PageFallback />}><Profile /></Suspense>} />
            <Route path="/my-team" element={<Suspense fallback={<PageFallback />}><MyTeam /></Suspense>} />
            <Route path="/vendors" element={<Suspense fallback={<PageFallback />}><Vendors /></Suspense>} />
            <Route path="/vendors/:id" element={<Suspense fallback={<PageFallback />}><VendorDetail /></Suspense>} />
            <Route path="/master-data" element={<Suspense fallback={<PageFallback />}><MasterData /></Suspense>} />
            <Route path="/master-data/categories" element={<Suspense fallback={<PageFallback />}><CategoryMaster /></Suspense>} />
            <Route path="/master-data/products" element={<Suspense fallback={<PageFallback />}><ProductMaster /></Suspense>} />
            <Route path="/master-data/addresses" element={<Suspense fallback={<PageFallback />}><AddressBook /></Suspense>} />
            
            <Route path="/procurement" element={<Suspense fallback={<PageFallback />}><Procurement /></Suspense>} />
            <Route path="/grn" element={<Suspense fallback={<PageFallback />}><GRN /></Suspense>} />
            <Route path="/customers" element={<Suspense fallback={<PageFallback />}><Customers /></Suspense>} />
            <Route path="/crm" element={<Navigate to="/customers" replace />} />
            <Route path="/customers/:id" element={<Suspense fallback={<PageFallback />}><CustomerDetail /></Suspense>} />
            <Route path="/opportunities" element={<Suspense fallback={<PageFallback />}><Opportunities /></Suspense>} />
            <Route path="/opportunities/:id" element={<Suspense fallback={<PageFallback />}><OpportunityDetail /></Suspense>} />
            <Route path="/master-data/opportunity-stages" element={<Suspense fallback={<PageFallback />}><OpportunityStagesMaster /></Suspense>} />
            <Route path="/master-data/opportunity-types" element={<Suspense fallback={<PageFallback />}><OpportunityTypesMaster /></Suspense>} />
            <Route path="/master-data/uom" element={<Suspense fallback={<PageFallback />}><UomMaster /></Suspense>} />
            <Route path="/master-data/event-types" element={<Suspense fallback={<PageFallback />}><EventTypesMaster /></Suspense>} />
            <Route path="/master-data/lead-statuses" element={<Suspense fallback={<PageFallback />}><LeadStatusesMaster /></Suspense>} />
            <Route path="/master-data/lead-sources" element={<Suspense fallback={<PageFallback />}><LeadSourcesMaster /></Suspense>} />
            <Route path="/master-data/activity-outcomes" element={<Suspense fallback={<PageFallback />}><OutcomeMaster /></Suspense>} />
            <Route path="/master-data/industries" element={<Suspense fallback={<PageFallback />}><IndustriesMaster /></Suspense>} />
            <Route path="/master-data/lead-scoring" element={<Suspense fallback={<PageFallback />}><LeadScoringMaster /></Suspense>} />
            <Route path="/master-data/currencies" element={<Suspense fallback={<PageFallback />}><CurrencyMaster /></Suspense>} />
            <Route path="/master-data/payment-terms" element={<Suspense fallback={<PageFallback />}><PaymentTermsMaster /></Suspense>} />
            <Route path="/master-data/opportunity-scoring" element={<Suspense fallback={<PageFallback />}><OpportunityScoringMaster /></Suspense>} />
            <Route path="/leads" element={<Suspense fallback={<PageFallback />}><Leads /></Suspense>} />
            <Route path="/leads/:id" element={<Suspense fallback={<PageFallback />}><LeadDetail /></Suspense>} />
            <Route path="/events" element={<Suspense fallback={<PageFallback />}><Events /></Suspense>} />
            <Route path="/events/:id" element={<Suspense fallback={<PageFallback />}><EventDetail /></Suspense>} />
            <Route path="/leads-events" element={<Navigate to="/leads" replace />} />
            <Route path="/leads-events/leads/:id" element={<Navigate to="/leads" replace />} />
            <Route path="/leads-events/events/:id" element={<Navigate to="/events" replace />} />
            <Route path="/reports" element={<Suspense fallback={<PageFallback />}><Analytics /></Suspense>} />
            <Route path="/reports/:type" element={<Navigate to="/reports" replace />} />
            <Route path="/analytics" element={<Navigate to="/reports" replace />} />
          </Route>
          <Route path="/install" element={<Suspense fallback={<PageFallback />}><InstallApp /></Suspense>} />
          <Route path="*" element={<Suspense fallback={<PageFallback />}><NotFound /></Suspense>} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </AppErrorBoundary>
  </QueryClientProvider>
  );
};


export default App;
