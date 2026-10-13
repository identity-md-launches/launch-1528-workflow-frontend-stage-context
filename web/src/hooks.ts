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
  const [selected, setSelected] = useState(0);
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const announce = (e: Event) => {
      const d = (
        e as CustomEvent<{ info: { name: string }; provider: Provider }>
      ).detail;
      if (d?.provider)
        setOptions((prev) =>
          prev.some((p) => p.provider === d.provider)
            ? prev
            : [...prev, { name: d.info.name, provider: d.provider }],
        );
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    if (window.ethereum)
      setOptions((prev) =>
        prev.length
          ? prev
          : (window.ethereum?.providers || [window.ethereum!]).map((p, i) => ({
              name: `Browser wallet${i ? ` ${i + 1}` : ""}`,
              provider: p,
            })),
      );
    return () =>
      window.removeEventListener("eip6963:announceProvider", announce);
  }, []);
  const provider = options[selected]?.provider;
  useEffect(() => {
    setAccount(undefined);
    setChainId(undefined);
    if (!provider) return;
    const accounts = (a: unknown) => {
      const list = a as string[];
      setAccount(list?.[0] ? getAddress(list[0]) : undefined);
    };
    const chain = (id: unknown) => setChainId(Number(id));
    const disconnect = () => {
      setAccount(undefined);
      setChainId(undefined);
    };
    provider.on?.("accountsChanged", accounts);
    provider.on?.("chainChanged", chain);
    provider.on?.("disconnect", disconnect);
    return () => {
      provider.removeListener?.("accountsChanged", accounts);
      provider.removeListener?.("chainChanged", chain);
      provider.removeListener?.("disconnect", disconnect);
    };
  }, [provider]);
  const connect = async () => {
    setError("");
    if (!provider) {
      setError(
        "No browser wallet detected. Open this site in an Ethereum wallet browser or enable a wallet extension. You can still watch without a wallet.",
      );
      return;
    }
    setBusy(true);
    try {
      const addresses = await provider.request({
        method: "eth_requestAccounts",
      });
      setAccount(addresses[0] ? getAddress(addresses[0]) : undefined);
      setChainId(Number(await provider.request({ method: "eth_chainId" })));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
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
    selected,
    setSelected,
    provider,
    account,
    chainId,
    error,
    busy,
    connect,
    switchChain,
    disconnect: () => {
      setAccount(undefined);
      setError("");
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
