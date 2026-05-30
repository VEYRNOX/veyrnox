import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ETH_RPC = "https://rpc.ankr.com/eth";
const ETHPLORER_KEY = "freekey";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action, address, method, params, network } = body;

    // --- Ethplorer: token + NFT discovery ---
    if (action === "tokens") {
      const url = `https://api.ethplorer.io/getAddressInfo/${address}?apiKey=${ETHPLORER_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      return Response.json(data);
    }

    // --- ETH balance via JSON-RPC ---
    if (action === "balance") {
      const rpcUrl = network === "polygon" ? "https://rpc.ankr.com/polygon"
        : network === "bsc" ? "https://rpc.ankr.com/bsc"
        : network === "arbitrum" ? "https://rpc.ankr.com/arbitrum"
        : ETH_RPC;

      const rpcRes = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "eth_getBalance",
          params: [address, "latest"],
        }),
      });
      const rpcData = await rpcRes.json();
      const weiHex = rpcData.result || "0x0";
      const wei = BigInt(weiHex);
      const eth = Number(wei) / 1e18;
      return Response.json({ wei: weiHex, eth, address, network: network || "ethereum" });
    }

    // --- Generic JSON-RPC passthrough ---
    if (action === "rpc") {
      const rpcRes = await fetch(ETH_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params || [] }),
      });
      const data = await rpcRes.json();
      return Response.json(data);
    }

    // --- Solana balance ---
    if (action === "solana_balance") {
      const rpcRes = await fetch("https://rpc.ankr.com/solana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "getBalance",
          params: [address],
        }),
      });
      const data = await rpcRes.json();
      const lamports = data.result?.value || 0;
      return Response.json({ lamports, sol: lamports / 1e9, address });
    }

    // --- ETH transaction count (nonce) ---
    if (action === "nonce") {
      const rpcRes = await fetch(ETH_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionCount", params: [address, "latest"] }),
      });
      const data = await rpcRes.json();
      return Response.json({ nonce: parseInt(data.result, 16), address });
    }

    // --- Gas price ---
    if (action === "gas_price") {
      const rpcRes = await fetch(ETH_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] }),
      });
      const data = await rpcRes.json();
      const wei = BigInt(data.result || "0x0");
      return Response.json({ gwei: Number(wei) / 1e9, wei: data.result });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});