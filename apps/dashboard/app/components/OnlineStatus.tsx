"use client";

import { useEffect, useState, useCallback } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { toast } from "./Toast";

export function OnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [showBanner, setShowBanner] = useState(false);

  const handleOnline = useCallback(() => {
    setIsOnline(true);
    setShowBanner(false);
    toast.success("Connection restored", "You are back online");
  }, []);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    setShowBanner(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [handleOnline, handleOffline]);

  if (!showBanner && isOnline) return null;

  return (
    <div className="online-status-banner" data-online={isOnline}>
      {isOnline ? (
        <>
          <Wifi size={14} />
          <span>Connected</span>
        </>
      ) : (
        <>
          <WifiOff size={14} />
          <span>Reconnecting...</span>
        </>
      )}
    </div>
  );
}