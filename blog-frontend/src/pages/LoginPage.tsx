import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/blog/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')
      localStorage.setItem('ol_token', data.token)
      localStorage.setItem('ol_user', JSON.stringify(data.author))
      navigate('/admin')
    } catch (err: any) {
      setError(err.message || 'Invalid credentials')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl p-8">
        <h1 className="text-xl font-black text-white mb-6 font-mono">AUTHOR LOGIN</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-zinc-500 mb-1.5">EMAIL</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 outline-none focus:border-amber-500/50 font-mono"/>
          </div>
          <div>
            <label className="block text-xs font-mono text-zinc-500 mb-1.5">PASSWORD</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 outline-none focus:border-amber-500/50 font-mono"/>
          </div>
          {error && <p className="text-xs text-red-400 font-mono">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-sm font-mono rounded-lg transition-all">
            {loading ? 'SIGNING IN...' : '▶ SIGN IN'}
          </button>
        </form>
        <p className="text-center text-[10px] text-zinc-700 font-mono mt-4">Default: amit@optionslab.in / admin123</p>
      </div>
    </div>
  )
}


