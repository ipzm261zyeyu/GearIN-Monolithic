import { CatalogClient } from "./CatalogClient.js";
import { PaymentsClient } from "./PaymentsClient.js";
import { UsersClient } from "./UsersClient.js";

export const createClients = ({ catalogUrl, paymentsUrl, usersUrl }) => ({
  catalog: new CatalogClient(catalogUrl),
  payments: new PaymentsClient(paymentsUrl),
  users: new UsersClient(usersUrl),
});
