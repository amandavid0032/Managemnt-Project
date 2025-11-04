import { useEffect, useState } from "react";
import institutionsApi from "../api/institutionsApi";

export default function useFetchInstitutions(type) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await institutionsApi.getByType(type);
        // setData(res.data);
        setData(res.data.data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [type]);

  return { data, loading, error };
}
