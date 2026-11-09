import { postJson } from "./http.js";

export class UsersClient {
  #baseUrl;

  constructor(baseUrl) {
    this.#baseUrl = baseUrl;
  }

  async namesByIds(ids) {
    if (ids.length === 0) {
      return new Map();
    }
    try {
      const { status, body } = await postJson(
        "users",
        `${this.#baseUrl}/internal/users/by-ids`,
        { ids }
      );
      return status === 200
        ? new Map(body.users.map((user) => [String(user._id), user.name]))
        : new Map();
    } catch {
      return new Map();
    }
  }
}
