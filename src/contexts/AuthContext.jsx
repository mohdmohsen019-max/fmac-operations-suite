import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { clearAuthSession, getAuthSessionExpiry, restoreAuthSession } from '../services/authSession'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const unsubProfileRef = useRef(null)
  const expiryTimerRef = useRef(null)

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (expiryTimerRef.current) {
        clearTimeout(expiryTimerRef.current)
        expiryTimerRef.current = null
      }

      // Clean up any existing profile listener
      if (unsubProfileRef.current) {
        unsubProfileRef.current()
        unsubProfileRef.current = null
      }

      if (firebaseUser) {
        if (!restoreAuthSession(firebaseUser.uid)) {
          setUser(null)
          setUserProfile(null)
          setLoading(false)
          await signOut(auth)
          return
        }

        setUser(firebaseUser)
        const armExpiryTimer = () => {
          const expiresAt = getAuthSessionExpiry(firebaseUser.uid)
          if (!expiresAt) return
          const remaining = expiresAt - Date.now()
          if (remaining <= 0) {
            signOut(auth)
            return
          }
          expiryTimerRef.current = setTimeout(armExpiryTimer, remaining + 250)
        }
        armExpiryTimer()
        unsubProfileRef.current = onSnapshot(
          doc(db, 'users', firebaseUser.uid),
          (snap) => {
            setUserProfile(snap.exists() ? { uid: snap.id, ...snap.data() } : null)
            setLoading(false)
          },
          () => {
            setUserProfile(null)
            setLoading(false)
          }
        )
      } else {
        clearAuthSession()
        setUser(null)
        setUserProfile(null)
        setLoading(false)
      }
    })

    return () => {
      unsubAuth()
      if (unsubProfileRef.current) unsubProfileRef.current()
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, userProfile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
