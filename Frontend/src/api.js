import axios from "axios";

const api = axios.create({ baseURL: process.env.REACT_APP_API_URL });

export const photoUrl = (productId) =>
  api.getUri({ url: `/api/v1/product/product-photo/${productId}` });

export default api;
