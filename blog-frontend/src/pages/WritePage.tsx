import { useAuthStore } from '../store/authStore'
import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'

export default function WritePage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  useEffect(() => { if (!user) navigate('/login') }, [user])
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-black text-white mb-4">Write Article</h1>
      <p className="text-zinc-500 text-sm">Article editor — go to <a href="/blog/admin" className="text-amber-400 underline">Admin panel</a> to create articles.</p>
    </div>
  )
}
