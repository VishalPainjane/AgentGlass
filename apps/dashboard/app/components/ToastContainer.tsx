"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X, Info, CheckCircle, AlertTriangle, AlertCircle } from "lucide-react";
import { useToastStore, Toast } from "./Toast";

const iconMap = {
  info: <Info size={18} />,
  success: <CheckCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  error: <AlertCircle size={18} />,
};

const colorMap = {
  info: "var(--info)",
  success: "var(--success)",
  warning: "var(--warning)",
  error: "var(--error)",
};

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="toast-item"
      style={{ "--toast-color": colorMap[toast.type] } as React.CSSProperties}
    >
      <div className="toast-icon">{iconMap[toast.type]}</div>
      <div className="toast-content">
        <p className="toast-title">{toast.title}</p>
        {toast.message && <p className="toast-message">{toast.message}</p>}
      </div>
      {toast.action && (
        <button className="toast-action-btn" onClick={toast.action.onClick}>
          {toast.action.label}
        </button>
      )}
      <button
        className="toast-close"
        onClick={() => removeToast(toast.id)}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className="toast-container">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}