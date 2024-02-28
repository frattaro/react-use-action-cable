import {
  ChannelNameWithParams,
  Consumer,
  Subscription,
  createConsumer
} from "@rails/actioncable";
import { useEffect, useMemo, useRef, useState } from "react";

type Action = Parameters<Subscription<Consumer>["perform"]>[0];
type Payload = Parameters<Subscription<Consumer>["perform"]>[1];
type QueueItem = {
  action: Action;
  payload: Payload;
};

const log = (x: {
  verbose: boolean;
  type: "info" | "warn";
  message: string;
}) => {
  if (x.verbose) console[x.type](`useActionCable: ${x.message}`);
};

export function useActionCable(url: string, { verbose } = { verbose: false }) {
  const actionCable = useMemo(() => createConsumer(url), []);
  useEffect(() => {
    log({
      verbose: verbose,
      type: "info",
      message: "Created Action Cable"
    });
    return () => {
      log({
        verbose: verbose,
        type: "info",
        message: "Disconnected Action Cable"
      });
      actionCable.disconnect();
    };
  }, []);
  return {
    actionCable
  };
}

export type ChannelOptions = {
  verbose: boolean;
  incomingTransformer?: null | ((incomingData: Payload) => Payload);
  outgoingTransformer?: null | ((outgoingData: Payload) => Payload);
};

export function useChannel<T>(
  actionCable: Consumer,
  { verbose, incomingTransformer, outgoingTransformer }: ChannelOptions = {
    verbose: false,
    incomingTransformer: null,
    outgoingTransformer: null
  }
) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const channelRef = useRef<ReturnType<
    Consumer["subscriptions"]["create"]
  > | null>();
  useEffect(() => {
    return () => {
      unsubscribe();
    };
  }, []);

  const subscribe = (
    data: ChannelNameWithParams,
    callbacks: {
      received?: (x: T) => void;
      initialized?: () => void;
      connected?: () => void;
      disconnected?: () => void;
    }
  ) => {
    log({
      verbose: verbose,
      type: "info",
      message: `Connecting to ${data.channel}`
    });
    const channel = actionCable.subscriptions.create(data, {
      received: (x) => {
        log({
          verbose: verbose,
          type: "info",
          message: `Received ${JSON.stringify(x)}`
        });
        if (incomingTransformer && x) {
          x = incomingTransformer(x);
        }
        callbacks.received?.(x);
      },
      initialized: () => {
        log({
          verbose: verbose,
          type: "info",
          message: `Init ${data.channel}`
        });
        setSubscribed(true);
        callbacks.initialized?.();
      },
      connected: () => {
        log({
          verbose: verbose,
          type: "info",
          message: `Connected to ${data.channel}`
        });
        setConnected(true);
        callbacks.connected?.();
      },
      disconnected: () => {
        log({
          verbose: verbose,
          type: "info",
          message: `Disconnected`
        });
        setConnected(false);
        callbacks.disconnected?.();
      }
    });
    channelRef.current = channel;
  };

  const unsubscribe = () => {
    setSubscribed(false);

    if (channelRef.current) {
      log({
        verbose: verbose,
        type: "info",
        message: `Unsubscribing from ${channelRef.current.identifier}`
      });
      // @ts-ignore
      actionCable.subscriptions.remove(channelRef.current);
      channelRef.current = null;
    }
  };

  useEffect(() => {
    if (subscribed && connected && queue.length > 0) {
      processQueue();
    } else if ((!subscribed || !connected) && queue.length > 0) {
      log({
        verbose: verbose,
        type: "info",
        message: `Queue paused. Subscribed: ${subscribed}. Connected: ${connected}. Queue length: ${queue.length}`
      });
    }
  }, [queue[0], connected, subscribed]);

  const processQueue = () => {
    const action = queue[0];

    try {
      perform(action.action, action.payload);
      setQueue((prevState) => {
        const q = [...prevState];
        q.shift();
        return q;
      });
    } catch {
      log({
        verbose: verbose,
        type: "warn",
        message: `Unable to perform action '${action.action}'. It will stay at the front of the queue.`
      });
    }
  };

  const enqueue = (action: Action, payload: Payload) => {
    log({
      verbose: verbose,
      type: "info",
      message: `Adding action to queue - ${action}: ${JSON.stringify(payload)}`
    });
    setQueue((prevState) => [
      ...prevState,
      {
        action,
        payload
      }
    ]);
  };

  const perform = (action: Action, payload: Payload) => {
    if (subscribed && !connected) throw "useActionCable: not connected";
    if (!subscribed) throw "useActionCable: not subscribed";
    try {
      log({
        verbose: verbose,
        type: "info",
        message: `Sending ${action} with payload ${JSON.stringify(payload)}`
      });
      channelRef.current?.perform(action, payload);
    } catch {
      throw "useActionCable: Unknown error";
    }
  };

  const send = ({
    action,
    payload,
    useQueue
  }: {
    action: Action;
    payload: Payload;
    useQueue: boolean;
  }) => {
    const formattedPayload =
      outgoingTransformer && payload ? outgoingTransformer(payload) : payload;
    if (useQueue) {
      enqueue(action, formattedPayload);
    } else {
      perform(action, formattedPayload);
    }
  };

  return {
    subscribe,
    unsubscribe,
    send
  };
}
