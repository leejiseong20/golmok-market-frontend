import { client } from "./client.js";

export const login = (credentials, options) => client.login(credentials, options);
export const logout = () => client.logout();
export const signup = (fields) => client.request("/auth/signup", { method: "POST", body: fields, auth: false });
