"use client";

import { create } from "zustand";

export type ToastType = "info" | "success" | "warning" | "error";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newToast: Toast = { ...toast, id };

    set((state) => ({
      toasts: [...state.toasts, newToast],
    }));

    if (toast.duration !== 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, toast.duration ?? 5000);
    }

    return id;
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearToasts: () => set({ toasts: [] }),
}));

export const toast = {
  info: (title: string, message?: string, action?: Toast["action"]) =>
    useToastStore.getState().addToast({ type: "info", title, message, action }),
  success: (title: string, message?: string, action?: Toast["action"]) =>
    useToastStore.getState().addToast({ type: "success", title, message, action }),
  warning: (title: string, message?: string, action?: Toast["action"]) =>
    useToastStore.getState().addToast({ type: "warning", title, message, action }),
  error: (title: string, message?: string, action?: Toast["action"]) =>
    useToastStore.getState().addToast({ type: "error", title, message, action }),
};