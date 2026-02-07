import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from 'react-helmet-async';
import { AuthGuard } from "@/components/AuthGuard";
import { UploadProgressBanner } from "@/components/UploadProgressBanner";
import GatePage from "./pages/GatePage";
import Landing from "./pages/Landing";
import LandingEcom from "./pages/LandingEcom";
import LandingFilm from "./pages/LandingFilm";
import Affiliate from "./pages/Affiliate";
import Upload from "./pages/Upload";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import Chat from "./pages/Chat";
import Pricing from "./pages/Pricing";
import Soundboard from "./pages/Soundboard";
import CourseView from "./pages/CourseView";
import AdminDashboard from "./pages/AdminDashboard";
import OpsDashboard from "./pages/OpsDashboard";
import UserViewDashboard from "./pages/UserViewDashboard";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import HelpCenter from "./pages/HelpCenter";
import Press from "./pages/Press";
import CaseStudy from "./pages/CaseStudy";
import Evidence from "./pages/Evidence";
import DownloadPage from "./pages/Download";
import DownloadModulePage from "./pages/DownloadModule";
import FoundersNotes from "./pages/FoundersNotes";
import Watch from "./pages/Watch";
import NotFound from "./pages/NotFound";
import Transform from "./pages/Transform";
import TransformReview from "./pages/TransformReview";
import Artifacts from "./pages/Artifacts";
import IPNotice from "./pages/IPNotice";
import PatentFigures from "./pages/PatentFigures";
import PatentArchive from "./pages/PatentArchive";
import UploadSimulator from "./pages/UploadSimulator";
import QueueMonitor from "./pages/QueueMonitor";

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <UploadProgressBanner />
          <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/signup" element={<Auth />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/ecom" element={<LandingEcom />} />
          <Route path="/film" element={<LandingFilm />} />
          <Route path="/affiliate" element={<Affiliate />} />
          <Route path="/upload" element={<AuthGuard><Upload /></AuthGuard>} />
          <Route path="/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
          <Route path="/chat/:courseId" element={<AuthGuard><Chat /></AuthGuard>} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/soundboard" element={<Soundboard />} />
          <Route path="/view/:courseId" element={<CourseView />} />
          <Route path="/watch" element={<Watch />} />
          <Route path="/download/:courseId" element={<DownloadPage />} />
          <Route path="/download/module/:moduleId" element={<DownloadModulePage />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/ops" element={<OpsDashboard />} />
            <Route path="/admin/users" element={<UserViewDashboard />} />
            <Route path="/admin/queue" element={<QueueMonitor />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/help" element={<HelpCenter />} />
          <Route path="/press" element={<Press />} />
          <Route path="/case-study" element={<CaseStudy />} />
          <Route path="/evidence" element={<AuthGuard><Evidence /></AuthGuard>} />
          <Route path="/founders-notes" element={<AuthGuard><FoundersNotes /></AuthGuard>} />
          <Route path="/ip-notice" element={<IPNotice />} />
          {/* Transformation Engine Routes */}
          <Route path="/transform" element={<AuthGuard><Transform /></AuthGuard>} />
          <Route path="/transform/:artifactId/review" element={<AuthGuard><TransformReview /></AuthGuard>} />
          <Route path="/artifacts" element={<AuthGuard><Artifacts /></AuthGuard>} />
          <Route path="/patent-figures" element={<AuthGuard><PatentFigures /></AuthGuard>} />
            <Route path="/patent-archive" element={<AuthGuard><PatentArchive /></AuthGuard>} />
            {/* Upload Reliability Simulator - Sandbox only */}
            <Route path="/upload-simulator" element={<UploadSimulator />} />
            <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </HelmetProvider>
);

export default App;
