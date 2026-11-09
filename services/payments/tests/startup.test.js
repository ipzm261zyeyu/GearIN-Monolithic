import { describe, expect, it, jest } from "@jest/globals";
import { spawn } from "child_process";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";

const SERVICE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const BraintreeGateway = jest.fn(() => ({}));

jest.unstable_mockModule("braintree", () => ({
  default: { BraintreeGateway, Environment: { Sandbox: "sandbox" } },
}));

const freePort = () =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

const envWithoutKeys = (extra) => {
  const env = { ...process.env, ...extra };
  delete env.BRAINTREE_MERCHANT_ID;
  delete env.BRAINTREE_PUBLIC_KEY;
  delete env.BRAINTREE_PRIVATE_KEY;
  return env;
};

const startServer = (env) => {
  const child = spawn(process.execPath, ["src/server.js"], { cwd: SERVICE_ROOT, env });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const exited = new Promise((resolve) => {
    child.on("exit", (code) => resolve({ code, stderr }));
  });
  const listening = new Promise((resolve) => {
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("listening")) resolve();
    });
  });
  return { child, exited, listening };
};

describe("start without Braintree keys", () => {
  it("does not create a Braintree client when modules are imported", async () => {
    await import("../src/app.js");
    await import("../src/providers/BraintreeProvider.js");
    await import("../src/providers/ProviderFactory.js");

    expect(BraintreeGateway).not.toHaveBeenCalled();
  });

  it("does not create a Braintree client for the fake provider", async () => {
    const { ProviderFactory } = await import("../src/providers/ProviderFactory.js");

    ProviderFactory.create({ paymentProvider: "fake", braintree: null });

    expect(BraintreeGateway).not.toHaveBeenCalled();
  });

  it("creates the client only when the braintree provider is built", async () => {
    const { ProviderFactory } = await import("../src/providers/ProviderFactory.js");

    ProviderFactory.create({
      paymentProvider: "braintree",
      braintree: { merchantId: "m", publicKey: "p", privateKey: "k" },
    });

    expect(BraintreeGateway).toHaveBeenCalledTimes(1);
  });

  it("serves requests as a real process with the fake provider and no keys", async () => {
    const port = await freePort();
    const { child, listening, exited } = startServer(
      envWithoutKeys({ PORT: String(port), PAYMENT_PROVIDER: "fake" })
    );

    try {
      await Promise.race([
        listening,
        exited.then(({ code, stderr }) => {
          throw new Error(`exited with ${code}: ${stderr}`);
        }),
      ]);

      const token = await fetch(`http://127.0.0.1:${port}/api/v1/product/braintree/token`);
      const charge = await fetch(`http://127.0.0.1:${port}/internal/charge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 40, nonce: "abc" }),
      });

      expect(token.status).toBe(200);
      expect((await token.json()).clientToken).toBe("fake-client-token");
      expect(charge.status).toBe(200);
    } finally {
      child.kill();
      await exited;
    }
  });

  it("refuses to start with the braintree provider and no keys", async () => {
    const port = await freePort();
    const { exited } = startServer(
      envWithoutKeys({ PORT: String(port), PAYMENT_PROVIDER: "braintree" })
    );

    const { code, stderr } = await exited;

    expect(code).not.toBe(0);
    expect(stderr).toContain("BRAINTREE_MERCHANT_ID is required");
  });
});
