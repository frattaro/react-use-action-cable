import {
  ChannelNameWithParams,
  Consumer,
  Subscription,
  createConsumer
} from "@rails/actioncable";
import camelcaseKeys from "camelcase-keys";
import { useEffect, useMemo, useRef, useState } from "react";
import snakecaseKeys from "snakecase-keys";

type Action = Parameters<Subscription["perform"]>[0];
type Payload = Parameters<Subscription["perform"]>[1];
type QueueItem = {
  action: Action;
  payload: Payload;
};

export type ActionCableOptions = {
  verbose?: boolean;
};

export function useActionCable(
  url: string,
  { verbose }: ActionCableOptions = {}
) {
  const actionCable = useMemo(() => createConsumer(url), []);
  useEffect(() => {
    verbose && console.info("useActionCable: Created Action Cable");

    return () => {
      verbose && console.info("useActionCable: Disconnected Action Cable");

      actionCable.disconnect();
    };
  }, []);
  return {
    actionCable
  };
}

export type ChannelOptions = {
  verbose: boolean;
  receiveCamelCase: boolean;
  sendSnakeCase: boolean;
};

export function useChannel<T>(
  actionCable: Consumer,
  { verbose, receiveCamelCase, sendSnakeCase }: ChannelOptions = {
    verbose: false,
    receiveCamelCase: true,
    sendSnakeCase: true
  }
) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  const channelRef = useRef<ReturnType<Consumer["subscriptions"]["create"]>[]>(
    []
  );

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
    verbose && console.info(`useChannel: Connecting to ${data.channel}`);
    const channel = actionCable.subscriptions.create(
      sendSnakeCase ? snakecaseKeys(data, { deep: true }) : data,
      {
        received: (x) => {
          verbose && console.info(`useChannel: Received ${JSON.stringify(x)}`);
          if (receiveCamelCase && x) {
            x = camelcaseKeys(x, { deep: true });
          }
          callbacks.received?.(x);
        },
        initialized: () => {
          verbose && console.info(`useChannel: Init ${data.channel}`);
          setSubscribed(true);
          callbacks.initialized?.();
        },
        connected: () => {
          verbose && console.info(`useChannel: Connected to ${data.channel}`);
          setConnected(true);
          callbacks.connected?.();
        },
        disconnected: () => {
          verbose && console.info(`useChannel: Disconnected`);
          setConnected(false);
          callbacks.disconnected?.();
        }
      }
    );
    channelRef.current = [...channelRef.current, channel];
  };

  const unsubscribe = () => {
    setSubscribed(false);

    verbose &&
      console.info(
        `useChannel: Unsubscribing from ${channelRef.current.length} channel(s)`
      );

    channelRef.current.forEach((x) => {
      // @ts-expect-error
      actionCable.subscriptions.remove(x);
    });

    channelRef.current = [];
  };

  useEffect(() => {
    if (subscribed && connected && queue.length > 0) {
      processQueue();
    } else if ((!subscribed || !connected) && queue.length > 0) {
      verbose &&
        console.info(
          `useChannel: Queue paused. Subscribed: ${subscribed}. Connected: ${connected}. Queue length: ${queue.length}`
        );
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
      verbose &&
        console.warn(
          `useChannel: Unable to perform action '${action.action}'. It will stay at the front of the queue.`
        );
    }
  };

  const enqueue = (action: Action, payload: Payload) => {
    verbose &&
      console.info(
        `useChannel: Adding action to queue - ${action}: ${JSON.stringify(payload)}`
      );
    setQueue((prevState) => [
      ...prevState,
      {
        action,
        payload
      }
    ]);
  };

  const perform = (action: Action, payload: Payload) => {
    if (subscribed && !connected) throw Error("useChannel: not connected");
    if (!subscribed) throw Error("useChannel: not subscribed");
    try {
      verbose &&
        console.info(
          `useChannel: Sending ${action} with payload ${JSON.stringify(payload)} to ${channelRef.current.length} channel(s)`
        );
      channelRef.current.forEach((x) => x.perform(action, payload));
    } catch {
      throw Error("useChannel: Unknown error");
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
      sendSnakeCase && payload
        ? snakecaseKeys(payload as Record<string, unknown>, { deep: true })
        : payload;
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
