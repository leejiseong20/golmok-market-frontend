import { client } from "./client.js";

export const searchRegions = (keyword, signal) => client.request(`/regions?${new URLSearchParams({ keyword })}`, { signal });
export const nearbyRegions = (lat, lng, signal) => client.request(`/regions/nearby?${new URLSearchParams({ lat, lng })}`, { signal });
