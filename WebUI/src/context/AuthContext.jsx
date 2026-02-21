import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
} from 'firebase/auth'
import { auth, googleProvider } from '../firebase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [backendUser, setBackendUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchBackendUser = async (idToken) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      })
      if (res.ok) {
        const data = await res.json()
        setBackendUser(data)
        return data
      }
    } catch (e) {
      console.error('Backend verify failed', e)
    }
    setBackendUser(null)
    return null
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        const token = await firebaseUser.getIdToken()
        await fetchBackendUser(token)
      } else {
        setBackendUser(null)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const signInWithEmail = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    const token = await cred.user.getIdToken()
    await fetchBackendUser(token)
  }

  const signUpWithEmail = async (email, password) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    const token = await cred.user.getIdToken()
    await fetchBackendUser(token)
  }

  const signInWithGoogle = async () => {
    const cred = await signInWithPopup(auth, googleProvider)
    const token = await cred.user.getIdToken()
    await fetchBackendUser(token)
  }

  const signOut = async () => {
    await firebaseSignOut(auth)
    setUser(null)
    setBackendUser(null)
  }

  const getAuthHeader = async () => {
    if (!user) return {}
    const token = await user.getIdToken()
    return { Authorization: `Bearer ${token}` }
  }

  const value = {
    user,
    backendUser,
    loading,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signOut,
    getAuthHeader,
    isAuthenticated: !!user,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
