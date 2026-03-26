import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

export default function LoginPage() {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;

    setLoading(true);
    setError('');

    // Temporarily store key to test connection
    localStorage.setItem('admin_api_key', apiKey.trim());
    try {
      await api.health();
      login(apiKey.trim());
      navigate('/');
    } catch {
      localStorage.removeItem('admin_api_key');
      setError('Failed to connect. Check your API key and server status.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
      <div
        className="w-full max-w-sm rounded-xl p-8 shadow-lg"
        style={{ backgroundColor: 'var(--color-bg-primary)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex flex-col items-center gap-3 mb-8">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          >
            <KeyRound size={24} />
          </div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            mem0 Dashboard
          </h1>
          <p className="text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
            Enter your API key to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            placeholder="ADMIN_API_KEY"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoFocus
            className="w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-colors"
            style={{
              backgroundColor: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          />

          {error && (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-danger)' }}>
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !apiKey.trim()}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Connect'}
          </button>
        </form>
      </div>
    </div>
  );
}
