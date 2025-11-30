import { useEffect, useState } from "react";
import institutionsApi from "../api/institutionsApi";

export default function useFetchInstitutions(type) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {


        const res = await institutionsApi.getByType(type);
        // Inspect the response structure
        console.log("API response:", res);

        // Get the array safely
        const allInstitutions = res?.data?.data || res?.data || [];

        // Filter by type (case-insensitive)
        const filteredInstitutions = allInstitutions.filter(
          (inst) => inst.type?.toLowerCase() === type.toLowerCase()
        );

        setData(filteredInstitutions);
      } catch (err) {
        setError(err.message || "Failed to fetch institutions");
        setData([]);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [type]);

  return { data, loading, error };
}
