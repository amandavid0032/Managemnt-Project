import axiosClient from "./axiosClient.js";

/**
 * Institution endpoints.
 *
 * The v1 API filters, paginates and searches server-side, so the client no
 * longer re-filters what it receives.
 */
const institutionsApi = {
  /**
   * @param {object} params
   * @param {number} [params.page]
   * @param {number} [params.limit]
   * @param {string} [params.search]
   * @param {string} [params.category]  case-insensitive; the API normalises it
   * @param {string} [params.countryCode]
   * @param {string} [params.city]
   * @param {'name'|'createdAt'|'updatedAt'} [params.sortBy]
   * @param {'asc'|'desc'} [params.sortOrder]
   */
  list: (params) => axiosClient.get("/institutions", { params }),
};

export default institutionsApi;
