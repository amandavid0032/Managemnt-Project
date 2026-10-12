import { useCallback, useEffect, useRef, useState } from "react";
import institutionsApi from "../api/institutionsApi";

/**
 * Paginated institution fetching.
 *
 * Replaces useFetchInstitutions, which fetched a server-filtered list and then
 * filtered it again client-side, and whose "Show More" button could never
 * reveal more than the API's hard 50-record cap.
 *
 * `loadMore` now requests the next real page, and `hasNext` comes from the
 * server, so the control is only shown when more data genuinely exists.
 */
export default function useInstitutions({ category, search, limit = 12 } = {}) {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // Guards against a slow first page overwriting a newer search's results.
  const requestId = useRef(0);

  const fetchPage = useCallback(
    async (page, { append }) => {
      const id = ++requestId.current;
      append ? setLoadingMore(true) : setLoading(true);
      setError(null);

      try {
        const params = { page, limit };
        if (category) params.category = category;
        if (search) params.search = search;

        const res = await institutionsApi.list(params);
        if (id !== requestId.current) return; // a newer request superseded this

        const body = res.data ?? {};
        const rows = body.data ?? [];
        setItems((prev) => (append ? [...prev, ...rows] : rows));
        setPagination(body.meta?.pagination ?? null);
      } catch (err) {
        if (id !== requestId.current) return;
        const apiMessage = err.response?.data?.error?.message;
        setError(apiMessage || "Unable to load institutions. Please try again.");
        if (!append) setItems([]);
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [category, search, limit],
  );

  useEffect(() => {
    fetchPage(1, { append: false });
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (pagination?.hasNext && !loadingMore) {
      fetchPage(pagination.page + 1, { append: true });
    }
  }, [pagination, loadingMore, fetchPage]);

  return {
    items,
    loading,
    loadingMore,
    error,
    hasNext: Boolean(pagination?.hasNext),
    total: pagination?.total ?? 0,
    loadMore,
    retry: () => fetchPage(1, { append: false }),
  };
}
