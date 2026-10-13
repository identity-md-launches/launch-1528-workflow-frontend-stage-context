import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAddress, type Address } from "viem";
import { loadRuntime, type Runtime } from "./config";
import {
  discoverCreator,
  errorText,
  loadSnapshot,
  makeReader,
  switchNetwork,
  verifyBindings,
  type Provider,
  type Snapshot,
  type Bindings,
} from "./chain";
export function useRuntime() {
  const [runtime, setRuntime] = useState<Runtime>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    loadRuntime()
      .then((x) => active && setRuntime(x))
      .catch((e) => active && setError(errorText(e)));
    return () => {
      active = false;
    };
  }, []);
  return { runtime, error };
}
export function useWallet(runtime: Runtime | undefined) {
  const [options, setOptions] = useState<
    { name: string; provider: Provider }[]
  >([]);
  const [provider, setProvider] = useState<Provider>();
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false);
  const [uri, setUri] = useState(""),
    [qr, setQr] = useState("");
  const wc = useRef<import("../addons/wallet").UniversalProvider | undefined>(
    undefined,
  );
  const attempt = useRef(0);
  useEffect(() => {
    const announce = (e: Event) => {
      const d = (
        e as CustomEvent<{ info: { name: string }; provider: Provider }>
      ).detail;
      if (d?.provider)
        setOptions((p) =>
          p.some((o) => o.provider === d.provider)
            ? p
            : [...p, { name: d.info.name, provider: d.provider }],
        );
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    if (window.ethereum)
      setOptions((p) =>
        p.length
          ? p
          : (window.ethereum?.providers || [window.ethereum!]).map(
              (provider, i) => ({
                name: (
                  provider as Provider & {
                    isRabby?: boolean;
                    isMetaMask?: boolean;
                  }
                ).isRabby
                  ? "Rabby"
                  : (provider as Provider & { isMetaMask?: boolean }).isMetaMask
                    ? "MetaMask"
                    : `Browser wallet${i ? " " + (i + 1) : ""}`,
                provider,
              }),
            ),
      );
    return () =>
      window.removeEventListener("eip6963:announceProvider", announce);
  }, []);
  useEffect(() => {
    if (!provider) return;
    const accounts = (value: unknown) => {
      const a = value as string[];
      setAccount(a?.[0] ? getAddress(a[0]) : undefined);
    };
    const chain = (value: unknown) => setChainId(Number(value));
    const disconnected = () => {
      setAccount(undefined);
      setChainId(undefined);
    };
    provider.on?.("accountsChanged", accounts);
    provider.on?.("chainChanged", chain);
    provider.on?.("disconnect", disconnected);
    return () => {
      provider.removeListener?.("accountsChanged", accounts);
      provider.removeListener?.("chainChanged", chain);
      provider.removeListener?.("disconnect", disconnected);
    };
  }, [provider]);
  const accept = async (p: Provider, gen: number) => {
    const a = await p.request({ method: "eth_requestAccounts" });
    const id = Number(await p.request({ method: "eth_chainId" }));
    if (gen !== attempt.current) return;
    if (!a[0]) throw Error("No wallet account selected. Try connecting again.");
    setProvider(p);
    setAccount(getAddress(a[0]));
    setChainId(id);
    setOpen(false);
    setUri("");
    setQr("");
  };
  const connect = async (p: Provider) => {
    if (busy) return;
    const gen = ++attempt.current;
    setBusy(true);
    setError("");
    try {
      await accept(p, gen);
    } catch (e) {
      if (gen === attempt.current) setError(errorText(e));
    } finally {
      if (gen === attempt.current) setBusy(false);
    }
  };
  const connectWC = async () => {
    if (!runtime || busy) return;
    const gen = ++attempt.current;
    setBusy(true);
    setError("");
    setUri("");
    setQr("");
    try {
      const { UniversalProvider, qrImage } = await import("../addons/wallet");
      if (!wc.current)
        wc.current = await UniversalProvider.init({
          projectId: "3947504ee7f39ad210074c117aa8784c",
          metadata: {
            name: "PONZIRAMID",
            description: "Build a brick. Chase the crown.",
            url: "https://ponziram.sites.imd.fun",
            icons: [new URL("./favicon.svg", location.href).href],
          },
        });
      const client = wc.current;
      const display = (value: string) => {
        if (gen !== attempt.current) return;
        setUri(value);
        void qrImage(value).then((image) => {
          if (gen === attempt.current) setQr(image);
        });
      };
      client.on("display_uri", display);
      try {
        if (!client.session)
          await client.connect({
            namespaces: {
              eip155: {
                chains: ["eip155:1"],
                methods: [
                  "eth_sendTransaction",
                  "personal_sign",
                  "eth_signTypedData_v4",
                  "wallet_switchEthereumChain",
                ],
                events: ["accountsChanged", "chainChanged"],
                rpcMap: { "1": runtime.deployment.network.rpcUrls[0] },
              },
            },
          });
        if (gen === attempt.current)
          await accept(client as unknown as Provider, gen);
      } finally {
        client.removeListener("display_uri", display);
      }
    } catch (e) {
      if (gen === attempt.current) setError(errorText(e));
    } finally {
      if (gen === attempt.current) setBusy(false);
    }
  };
  const setDialog = (value: boolean) => {
    setOpen(value);
    if (!value) {
      attempt.current++;
      wc.current?.abortPairingAttempt();
      setBusy(false);
      setUri("");
      setQr("");
    }
  };
  const switchChain = async () => {
    if (!provider || !runtime) return;
    setBusy(true);
    setError("");
    try {
      await switchNetwork(provider, runtime);
      setChainId(Number(await provider.request({ method: "eth_chainId" })));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return {
    options,
    provider,
    account,
    chainId,
    error,
    busy,
    connect,
    connectWC,
    switchChain,
    open,
    setOpen: setDialog,
    uri,
    qr,
    disconnect: async () => {
      attempt.current++;
      setAccount(undefined);
      setChainId(undefined);
      setProvider(undefined);
      setError("");
      if (wc.current?.session)
        try {
          await wc.current.disconnect();
        } catch {
          /* Local disconnection still completed. */
        }
    },
  };
}
export function useGame(
  runtime: Runtime | undefined,
  provider: Provider | undefined,
  account: Address | undefined,
) {
  const reader = useMemo(
    () => (runtime ? makeReader(runtime, provider) : undefined),
    [runtime, provider],
  );
  const currentScope = useRef({ reader, account });
  currentScope.current = { reader, account };
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [creatorError, setCreatorError] = useState("");
  const generation = useRef(0),
    lock = useRef(false),
    bindings = useRef<Bindings | undefined>(undefined),
    creator = useRef<Address | undefined>(undefined),
    lastBlock = useRef<bigint | undefined>(undefined);
  const attempt = useRef(false);
  const refreshWaiters = useRef<(() => void)[]>([]);
  const refresh = useCallback(
    async (force = true): Promise<void> => {
      if (
        !runtime ||
        !reader ||
        currentScope.current.reader !== reader ||
        currentScope.current.account !== account
      )
        return;
      const gen = generation.current;
      // A receipt-triggered refresh must wait for an older poll, then read again.
      // Otherwise an old allowance could briefly re-enable the approval step.
      if (lock.current) {
        if (!force) return;
        await new Promise<void>((resolve) =>
          refreshWaiters.current.push(resolve),
        );
        if (gen === generation.current) await refresh(true);
        return;
      }
      lock.current = true;
      setLoading(true);
      try {
        if (!bindings.current) {
          bindings.current = await verifyBindings(reader, runtime);
          if (gen !== generation.current) return;
          setVerified(true);
        }
        if (
          !force &&
          lastBlock.current === (await reader.getBlockNumber({ cacheTime: 0 }))
        )
          return;
        const next = await loadSnapshot(
          reader,
          runtime,
          bindings.current,
          account,
          creator.current,
        );
        if (gen !== generation.current) return;
        if (!creator.current && !attempt.current) {
          attempt.current = true;
          try {
            creator.current = await discoverCreator(
              reader,
              runtime,
              next.initialFunding,
            );
            if (gen !== generation.current) return;
            next.creator = creator.current;
            next.creatorBalance = (await reader.readContract({
              address: runtime.token,
              abi: runtime.abis.LaunchToken,
              functionName: "balanceOf",
              args: [creator.current],
              blockNumber: next.block,
            })) as bigint;
            setCreatorError("");
          } catch (e) {
            if (gen === generation.current) setCreatorError(errorText(e));
          }
        }
        if (gen !== generation.current) return;
        lastBlock.current = next.block;
        setSnapshot(next);
        setError("");
      } catch (e) {
        if (gen === generation.current) setError(errorText(e));
      } finally {
        if (gen === generation.current) {
          lock.current = false;
          setLoading(false);
          refreshWaiters.current.splice(0).forEach((resolve) => resolve());
        }
      }
    },
    [runtime, reader, account],
  );
  useEffect(() => {
    generation.current++;
    lock.current = false;
    bindings.current = undefined;
    creator.current = undefined;
    attempt.current = false;
    lastBlock.current = undefined;
    setVerified(false);
    setSnapshot(undefined);
    setError("");
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh(false);
    }, 5000);
    return () => {
      generation.current++;
      clearInterval(timer);
      refreshWaiters.current.splice(0).forEach((resolve) => resolve());
    };
  }, [refresh]);
  return {
    reader,
    snapshot,
    error,
    loading,
    verified,
    creatorError,
    refresh: () => {
      attempt.current = false;
      return refresh();
    },
  };
}
