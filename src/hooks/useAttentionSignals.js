import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query } from 'firebase/firestore';

/**
 * Live operational attention signals, shared by the global bell and any
 * other consumer. One fetch on mount, refresh() on demand, and a gentle
 * 10-minute background refresh. All sources fail independently.
 */
export default function useAttentionSignals() {
  const [signals, setSignals] = useState({});
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  /* Fetch without touching loading synchronously — safe to call from
     effects. All setState here happens after awaits. */
  const fetchSignals = useCallback(async () => {
    const patch = {};

    await Promise.allSettled([
      (async () => {
        const snap = await getDocs(collection(db, 'requests'));
        const rows = snap.docs.map(d => d.data());
        patch.overdueTickets = rows.filter(
          r => r.slaDeadline?.toDate && r.slaDeadline.toDate() < new Date() && r.status !== 'closed'
        ).length;
        patch.openTickets = rows.filter(r => r.status !== 'closed').length;
      })(),
      (async () => {
        const snap = await getDocs(collection(db, 'users'));
        patch.pendingUsers = snap.docs.map(d => d.data()).filter(u => u.status === 'pending').length;
      })(),
      (async () => {
        const snap = await getDocs(query(collection(db, 'inventory_items')));
        const items = snap.docs.map(d => d.data()).filter(i => i.isActive !== false);
        patch.outStock = items.filter(i => i.currentStock === 0).length;
        patch.lowStock = items.filter(i => i.currentStock > 0 && i.currentStock <= (i.minThreshold ?? 5)).length;
      })(),
      (async () => {
        const now = new Date();
        const monthId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const snap = await getDocs(query(collection(db, 'report_sections')));
        const monthSections = snap.docs.map(d => d.data()).filter(s => s.reportId === monthId);
        const approved = monthSections.filter(s => s.status === 'approved').length;
        patch.unapproved = Math.max(monthSections.length - approved, 0);
      })(),
    ]);

    if (!alive.current) return;
    setSignals(prev => ({ ...prev, ...patch }));
    setLoading(false);
  }, []);

  /* User-triggered refresh shows the spinner immediately */
  const refresh = useCallback(() => {
    setLoading(true);
    fetchSignals();
  }, [fetchSignals]);

  useEffect(() => {
    alive.current = true;
    // fetchSignals never sets state synchronously (all writes are
    // post-await) — same pattern/waiver as useIsMobile.js.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSignals();
    const id = setInterval(fetchSignals, 10 * 60 * 1000);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [fetchSignals]);

  const count =
    (signals.overdueTickets > 0 ? 1 : 0) +
    (signals.pendingUsers > 0 ? 1 : 0) +
    (signals.outStock > 0 ? 1 : 0) +
    (signals.unapproved > 0 ? 1 : 0);

  return { signals, count, loading, refresh };
}
