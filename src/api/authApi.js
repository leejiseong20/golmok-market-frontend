import { client } from "./client.js";

export const login = (credentials) => client.login(credentials);
export const logout = () => client.logout();
export const signup = (fields) => client.request("/auth/signup", { method: "POST", body: fields, auth: false });
