"use client";

import { SearchClient } from "./search-client";

// PAGE-SEARCH（/search?q=）：全部成员可用，结果按各自可见范围过滤（API-SEARCH-001）
export default function SearchPage() {
  return <SearchClient />;
}
