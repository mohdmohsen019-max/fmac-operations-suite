import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const unsubProfileRef = useRef(null)

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      // Clean up any existing profile listener
      if (unsubProfileRef.current) {
        unsubProfileRef.current()
        unsubProfileRef.current = null
      }

      setUser(firebaseUser)

      if (firebaseUser) {
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
        setUserProfile(null)
        setLoading(false)
      }
    })

    return () => {
      unsubAuth()
      if (unsubProfileRef.current) unsubProfileRef.current()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, userProfile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
