import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import MemoriesPage from './pages/MemoriesPage';
import SearchPage from './pages/SearchPage';
import StatsPage from './pages/StatsPage';
import RequestsPage from './pages/RequestsPage';
import EntitiesPage from './pages/EntitiesPage';
import MaintenancePage from './pages/MaintenancePage';
import HealthPage from './pages/HealthPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function RequireAuth() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Layout />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<RequireAuth />}>
                <Route index element={<DashboardPage />} />
                <Route path="memories" element={<MemoriesPage />} />
                <Route path="search" element={<SearchPage />} />
                <Route path="stats" element={<StatsPage />} />
                <Route path="requests" element={<RequestsPage />} />
                <Route path="entities" element={<EntitiesPage />} />
                <Route path="maintenance" element={<MaintenancePage />} />
                <Route path="health" element={<HealthPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
