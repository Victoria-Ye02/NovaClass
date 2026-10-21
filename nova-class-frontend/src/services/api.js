import axios from "axios";

const API = axios.create({ baseURL: "http://localhost:5001/api" });

// Auto-attach token
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("nova_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A token the server no longer accepts (they last 7 days) makes every request fail with 401, which the pages show as
// "could not be loaded" or "is the server running?". Send the student to the login page instead. Wrong-password answers
// from the login / sign-up endpoints are 401 as well and must not do this.
export function handleExpiredSession(error, { storage = localStorage, goToLogin = () => window.location.assign("/login") } = {}) {
  const status = error?.response?.status;
  const url = String(error?.config?.url || "");
  if (status === 401 && storage.getItem("nova_token") && !url.includes("/auth/")) {
    ["nova_token", "nova_name", "nova_role", "nova_email"].forEach(key => storage.removeItem(key));
    goToLogin();
  }
  return Promise.reject(error);
}
API.interceptors.response.use(response => response, handleExpiredSession);

export default API;
