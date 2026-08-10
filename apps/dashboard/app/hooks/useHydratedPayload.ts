/**
 * useHydratedPayload Hook
 * 
 * Automatically resolves $blob references in payloads by fetching
 * them from the daemon's blob store.
 */

"use client";

import { useState, useEffect } from "react";
import { daemonHttp } from "../lib/daemonApi";

function isBlobRef(payload: any): payload is { $blob: string } {
  return payload && typeof payload === "object" && typeof payload.$blob === "string";
}

export function useHydratedPayload(payload: any) {
  const [hydrated, setHydrated] = useState<any>(payload);
  const [isLoadingBlob, setIsLoadingBlob] = useState(false);

  useEffect(() => {
    if (isBlobRef(payload)) {
      setIsLoadingBlob(true);
      fetch(daemonHttp(`/v1/blobs/${payload.$blob}`))
        .then(res => res.json())
        .then(data => setHydrated(data))
        .catch(err => {
          console.error("Failed to load blob", err);
          setHydrated({ $error: "Failed to load blob", hash: payload.$blob });
        })
        .finally(() => setIsLoadingBlob(false));
    } else {
      setHydrated(payload);
    }
  }, [payload]);

  return { hydrated, isLoadingBlob };
}
