"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readClientSession } from "@/lib/session";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const session = readClientSession();
    if (!session) {
      router.replace("/login");
    } else if (session.role === "admin") {
      router.replace("/admin");
    } else {
      router.replace("/deo-data-entry");
    }
  }, [router]);

  return null;
}
