import axios from "axios";

const axiosClient = axios.create({
  // baseURL: "http://localhost:5000/api",
  
  baseURL: "https://managemnt-project.onrender.com/api",

  headers: {
    "Content-Type": "application/json",
  },
});

export default axiosClient;
