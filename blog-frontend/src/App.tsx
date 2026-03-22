import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import Header from './components/layout/Header'
import Footer from './components/layout/Footer'
import HomePage from './pages/HomePage'
import ArticlePage from './pages/ArticlePage'
import AnalysisPage from './pages/AnalysisPage'
import ToolsPage from './pages/ToolsPage'
import AuthorsPage from './pages/AuthorsPage'
import AuthorPage from './pages/AuthorPage'
import LoginPage from './pages/LoginPage'
import WritePage from './pages/WritePage'
import AdminPage from './pages/AdminPage'
import LearnPage from './pages/LearnPage'
import GlossaryPage from './pages/GlossaryPage'
import DisclaimerPage from './pages/DisclaimerPage'
import RiskDisclosurePage from './pages/RiskDisclosurePage'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5 * 60 * 1000 } },
})

function AppInner() {
  const location = useLocation()
  const hideFooter = ['/learn', '/write', '/admin'].includes(location.pathname)
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/"               element={<HomePage />} />
          <Route path="/article/:slug"  element={<ArticlePage />} />
          <Route path="/analysis"       element={<AnalysisPage />} />
          <Route path="/tools"          element={<ToolsPage />} />
          <Route path="/learn"          element={<LearnPage />} />
          <Route path="/glossary"       element={<GlossaryPage />} />
          <Route path="/authors"        element={<AuthorsPage />} />
          <Route path="/author/:slug"   element={<AuthorPage />} />
          <Route path="/login"          element={<LoginPage />} />
          <Route path="/write"          element={<WritePage />} />
          <Route path="/write/:id"      element={<WritePage />} />
          <Route path="/admin"          element={<AdminPage />} />
          <Route path="/disclaimer"     element={<DisclaimerPage />} />
          <Route path="/risk-disclosure" element={<RiskDisclosurePage />} />
          <Route path="/privacy"        element={<PrivacyPage />} />
          <Route path="/terms"          element={<TermsPage />} />
        </Routes>
      </main>
      {!hideFooter && <Footer />}
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router basename="/blog">
        <AppInner />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { background: '#18181b', color: '#e4e4e7', border: '1px solid #27272a', fontSize: '13px', fontFamily: 'monospace' },
          }}
        />
      </Router>
    </QueryClientProvider>
  )
}
