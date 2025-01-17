/**
 * @vi-environment jsdom
 */
import { ChannelNameWithParams, Consumer } from "@rails/actioncable";
import { act, render } from "@testing-library/react";
import React from "react";
import { beforeEach, expect, test, vi } from "vitest";

import { useActionCable, useChannel } from "./index";

vi.mock("@rails/actioncable", () => ({
  createConsumer: () => {
    return {
      disconnect: vi.fn()
    };
  }
}));

const perform = vi.fn();

function setup({
  connected = true,
  enablePerform = true,
  performCallbacks = false,
  verbose = false,
  caseTransforms = true
} = {}) {
  const cable: Consumer = {
    subscriptions: {
      // @ts-ignore
      create: vi.fn(
        (
          data: ChannelNameWithParams,
          callbacks: {
            received: (x: unknown) => void;
            initialized: () => void;
            connected: () => void;
            disconnected: () => void;
          }
        ) => {
          callbacks.initialized();

          if (connected) callbacks.connected();

          if (performCallbacks) {
            callbacks.received("test");
            callbacks.disconnected();
          }

          if (enablePerform) {
            return {
              perform: perform,
              identifier: data.channel
            };
          }

          return {
            identifier: data.channel
          };
        }
      ),
      remove: vi.fn()
    }
  };
  const channel: Partial<ReturnType<Consumer["subscriptions"]["create"]>> = {};

  const TestComponent = () => {
    Object.assign(cable, {
      ...(verbose
        ? useActionCable("url", { verbose: true })
        : useActionCable("url"))
    });
    Object.assign(channel, {
      ...(verbose
        ? useChannel(cable, {
            verbose,
            receiveCamelCase: true,
            sendSnakeCase: true
          })
        : !caseTransforms
          ? useChannel(cable, {
              verbose: false,
              receiveCamelCase: false,
              sendSnakeCase: false
            })
          : useChannel(cable))
    });
    return null;
  };

  const { unmount } = render(React.createElement(TestComponent));
  return { cable, channel, unmount };
}

beforeEach(() => vi.clearAllMocks());

test("should connect to a channel", () => {
  const { cable, channel } = setup();
  act(() => {
    channel.subscribe({ channel: "TestChannel" }, {});
  });

  expect(cable.subscriptions.create).toHaveBeenCalledTimes(1);
});

test("should immediately process the first action added to the queue when there is a connection to the channel", () => {
  const { channel } = setup();
  act(() => {
    channel.subscribe({ channel: "TestChannel" }, {});
  });

  act(() => {
    channel.send?.({
      action: "ping",
      payload: {},
      useQueue: true
    });
  });

  expect(perform).toHaveBeenCalledTimes(1);
});

test("should immediately process the first action added to the queue when there is a connection to the channel no case transform", () => {
  const { channel } = setup({ caseTransforms: false });
  act(() => {
    channel.subscribe({ channel: "TestChannel" }, {});
  });

  act(() => {
    channel.send?.({
      action: "ping",
      payload: {},
      useQueue: true
    });
  });

  expect(perform).toHaveBeenCalledTimes(1);
});

test("should immediately send a message to the channel when the queue is not used", () => {
  const { channel } = setup();
  act(() => {
    channel.subscribe({ channel: "TestChannel" }, {});
  });

  act(() => {
    channel.send?.({
      action: "ping",
      payload: {},
      useQueue: false
    });
  });

  expect(perform).toHaveBeenCalledTimes(1);
});

test("should throw an error when sending a message without using the queue when not subscribed to a channel", () => {
  const { channel } = setup();

  expect(() => {
    channel.send?.({
      action: "ping",
      payload: {},
      useQueue: false
    });
  }).toThrow("useChannel: not subscribed");
});

test("should throw an error when sending a message without using the queue when not connected to a channel", () => {
  const { channel } = setup({ connected: false });

  act(() => {
    channel.subscribe({ channel: "TestChannel" }, {});
  });

  expect(() => {
    channel.send?.({
      action: "ping",
      payload: {},
      useQueue: false
    });
  }).toThrow("useChannel: not connected");
});

test("should throw an unknown error when sending a message when subscribed and connected, but when performing the action fails", () => {
  const { channel } = setup({ enablePerform: false });

  act(() => {
    channel.subscribe({ channel: "TestChannel" }, {});
  });

  expect(() => {
    channel.send?.({
      action: "ping",
      payload: {},
      useQueue: false
    });
  }).toThrow("useChannel: Unknown error");
});

test("should execute the provided callbacks", () => {
  const { channel } = setup({ verbose: true, performCallbacks: true });

  const received = vi.fn();
  const initialized = vi.fn();
  const connected = vi.fn();
  const disconnected = vi.fn();

  act(() => {
    channel.subscribe(
      { channel: "TestChannel" },
      {
        received: () => received(),
        initialized: () => initialized(),
        connected: () => connected(),
        disconnected: () => disconnected()
      }
    );
  });

  expect(received).toHaveBeenCalledTimes(1);
  expect(initialized).toHaveBeenCalledTimes(1);
  expect(connected).toHaveBeenCalledTimes(1);
  expect(disconnected).toHaveBeenCalledTimes(1);
});

test("should execute the provided callbacks not verbose", () => {
  const { channel } = setup({ performCallbacks: true });

  const received = vi.fn();
  const initialized = vi.fn();
  const connected = vi.fn();
  const disconnected = vi.fn();

  act(() => {
    channel.subscribe(
      { channel: "TestChannel" },
      {
        received: () => received(),
        initialized: () => initialized(),
        connected: () => connected(),
        disconnected: () => disconnected()
      }
    );
  });

  expect(received).toHaveBeenCalledTimes(1);
  expect(initialized).toHaveBeenCalledTimes(1);
  expect(connected).toHaveBeenCalledTimes(1);
  expect(disconnected).toHaveBeenCalledTimes(1);
});

test("should execute the provided callbacks not verbose not case transform", () => {
  const { channel } = setup({ performCallbacks: true, caseTransforms: false });

  const received = vi.fn();
  const initialized = vi.fn();
  const connected = vi.fn();
  const disconnected = vi.fn();

  act(() => {
    channel.subscribe(
      { channel: "TestChannel" },
      {
        received: () => received(),
        initialized: () => initialized(),
        connected: () => connected(),
        disconnected: () => disconnected()
      }
    );
  });

  expect(received).toHaveBeenCalledTimes(1);
  expect(initialized).toHaveBeenCalledTimes(1);
  expect(connected).toHaveBeenCalledTimes(1);
  expect(disconnected).toHaveBeenCalledTimes(1);
});

test("should execute the provided callbacks 2", () => {
  const { channel } = setup({ performCallbacks: true });

  const received = vi.fn();
  const initialized = vi.fn();
  const connected = vi.fn();
  const disconnected = vi.fn();

  act(() => {
    channel.subscribe({ channel: "TestChannel" }, {});
  });

  expect(received).toHaveBeenCalledTimes(0);
  expect(initialized).toHaveBeenCalledTimes(0);
  expect(connected).toHaveBeenCalledTimes(0);
  expect(disconnected).toHaveBeenCalledTimes(0);
});

test("should log the correct message when connecting", () => {
  const { channel } = setup({ verbose: true });

  const consoleInfoMock = vi.spyOn(console, "info");

  act(() => channel.subscribe({ channel: "TestChannel" }, {}));

  expect(consoleInfoMock.mock.calls[0][0]).toBe(
    "useChannel: Connecting to TestChannel"
  );
  expect(consoleInfoMock.mock.calls[1][0]).toBe("useChannel: Init TestChannel");
  expect(consoleInfoMock.mock.calls[2][0]).toBe(
    "useChannel: Connected to TestChannel"
  );
});

test("should pause the queue when disconnected or not subscribed and the queue length is greater than 0", () => {
  const { channel } = setup({ connected: false, verbose: true });
  const consoleInfoMock = vi.spyOn(console, "info");

  act(() => {
    channel.subscribe({ channel: "TestChannel" }, {});
  });

  act(() => {
    channel.send?.({
      action: "ping",
      payload: {},
      useQueue: true
    });
  });

  expect(consoleInfoMock.mock.calls[4][0]).toBe(
    "useChannel: Queue paused. Subscribed: true. Connected: false. Queue length: 1"
  );
});

test("should keep an item at the front of the queue when sending fails", () => {
  const { channel, unmount } = setup({ verbose: true, enablePerform: false });
  const consoleWarnMock = vi.spyOn(console, "warn");

  act(() => {
    channel.subscribe({ channel: "TestChannel" }, {});
  });

  act(() => {
    channel.send?.({
      action: "ping",
      payload: {},
      useQueue: true
    });
  });

  act(() => {
    channel.unsubscribe?.();
  });

  unmount();

  expect(consoleWarnMock.mock.calls[0][0]).toBe(
    "useChannel: Unable to perform action 'ping'. It will stay at the front of the queue."
  );
});
