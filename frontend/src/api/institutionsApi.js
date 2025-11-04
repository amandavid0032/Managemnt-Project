import axiosClient from "./axiosClient.js";

const institutionsApi = {
  getAll: (params) => axiosClient.get("/institutions", { params }),
  getByType: (type) => axiosClient.get(`/institutions?type=${type}`),
};

export default institutionsApi;
