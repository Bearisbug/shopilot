"use client";

import { useQuery } from "@tanstack/react-query";
import type { Me } from "@/contracts/auth";
import { api } from "@/lib/api";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/api/v1/me"), staleTime: 30_000 });
}

export function useCan() {
  const { data } = useMe();
  return (perm: string) => Boolean(data?.active.permissions.includes(perm));
}
