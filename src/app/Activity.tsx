import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// Always say what is happening, with a running timer so waiting never feels stuck (from bloom).
export default function ActivityBar({ activity }: { activity: { text: string; since: number } | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!activity) return null;
  const secs = Math.max(0, Math.round(now / 1000 - activity.since));
  return (
    <AnimatePresence mode="wait">
      <motion.div key={activity.text} className="activity-bar"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }}>
        <span className="activity-dot" aria-hidden />
        <div>
          <strong>Happening now</strong>
          <p role="status">{activity.text}</p>
        </div>
        <time>{secs}s</time>
      </motion.div>
    </AnimatePresence>
  );
}
