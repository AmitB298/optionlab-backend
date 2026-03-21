import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import Header from './components/layout/Header'
import Footer from './components/layout/Footer'
import HomePage from './pages/HomePage'
import ArticlePage from './pages/ArticlePage'
import { AnalysisPage, ToolsPage, AuthorsPage, LoginPage } from './pages/OtherPages'
import AdminPage from './pages/AdminPage'
import './styles/globals.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/blog">
        <div className="min-h-screen flex flex-col bg-ink">
          <Header />
          <main className="flex-1">
            <Routes>
              <Route path="/"              element={<HomePage />} />
              <Route path="/article/:slug" element={<ArticlePage />} />
              <Route path="/analysis"      element={<AnalysisPage />} />
              <Route path="/tools"         element={<ToolsPage />} />
              <Route path="/authors"       element={<AuthorsPage />} />
              <Route path="/login"         element={<LoginPage />} />
              <Route path="/admin/*"       element={<AdminPage />} />
            </Routes>
          </main>
          <Footer />
        </div>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#0b1220',
              border: '1px solid #223555',
              color: '#f0f4f8',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '12px',
            },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  )
}


