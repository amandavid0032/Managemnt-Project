import axios from "axios";

/**
 * The base URL comes from the environment, never from source.
 * Set REACT_APP_API_URL in .env.local for development and in the build
 * environment for deployments.
 */
const baseURL = process.env.REACT_APP_API_URL || "http://localhost:4000/api/v1";

const axiosClient = axios.create({
  baseURL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
  // Required so the httpOnly refresh cookie is sent on auth requests.
  withCredentials: true,
});

export default axiosClient;
