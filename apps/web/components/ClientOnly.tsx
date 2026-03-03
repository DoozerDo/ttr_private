"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type ClientOnlyProps = {
  children: ReactNode;
};

export function ClientOnly({ children }: ClientOnlyProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return <>{children}</>;
}
