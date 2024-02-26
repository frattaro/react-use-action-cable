/**
 * @jest-environment jsdom
 */
import { ChannelNameWithParams, Consumer } from "@rails/actioncable";
import { act, render } from "@testing-library/react";
import React from "react";

import { useActionCable, useChannel } from ".";

jest.mock("@rails/actioncable", () => ({
  createConsumer: () => {
    return {
      disconnect: jest.fn()
    };
  }
}));

const perform = jest.fn();

function setup({
  connected = true,
  enablePerform = true,
  performCallbacks = false,
  verbose = false
} = {}) {
  const cable: jest.Mocked<Consumer> = {
    subscriptions: {
      // @ts-ignore
      create: jest.fn(
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
      remove: jest.fn()
    }
  };
  const channel: jest.Mocked<
    Partial<ReturnType<Consumer["subscriptions"]["create"]>>
  > = {};

  const TestComponent = () => {
    Object.assign(cable, {
      ...useActionCable("url", verbose ? { verbose: true } : undefined)
    });
    Object.assign(channel, {
      ...useChannel(cable, verbose ? { verbose: true } : undefined)
    });
    return null;
  };

  render(React.createElement(TestComponent));
  return { cable, channel };
}

beforeEach(() => jest.clearAllMocks());

test("should connect to a channel", () => {
  const { cable, channel } = setup();
  act(() => {
    channel.subscribe({ channel: "TestChannel" }, {});
  });
  expect(cable.subscriptions.create).toBeCalledTimes(1);
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
  }).toThrow("useActionCable: not subscribed");
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
  }).toThrow("useActionCable: not connected");
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
  }).toThrow("useActionCable: Unknown error");
});

test("should execute the provided callbacks", () => {
  const { channel } = setup({ performCallbacks: true });

  const received = jest.fn();
  const initialized = jest.fn();
  const connected = jest.fn();
  const disconnected = jest.fn();

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

  expect(received).toBeCalledTimes(1);
  expect(initialized).toBeCalledTimes(1);
  expect(connected).toBeCalledTimes(1);
  expect(disconnected).toBeCalledTimes(1);
});

test("should execute the provided callbacks 2", () => {
  const { channel } = setup({ performCallbacks: true });

  const received = jest.fn();
  const initialized = jest.fn();
  const connected = jest.fn();
  const disconnected = jest.fn();

  act(() => {
    channel.subscribe({ channel: "TestChannel" }, {});
  });

  expect(received).toBeCalledTimes(0);
  expect(initialized).toBeCalledTimes(0);
  expect(connected).toBeCalledTimes(0);
  expect(disconnected).toBeCalledTimes(0);
});

test("should log the correct message when connecting", () => {
  const { channel } = setup({ verbose: true });

  const consoleInfoMock = jest.spyOn(console, "info").mockImplementation();

  act(() => channel.subscribe({ channel: "TestChannel" }, {}));

  expect(consoleInfoMock.mock.calls[0][0]).toBe(
    "useActionCable: Connecting to TestChannel"
  );
  expect(consoleInfoMock.mock.calls[1][0]).toBe(
    "useActionCable: Init TestChannel"
  );
  expect(consoleInfoMock.mock.calls[2][0]).toBe(
    "useActionCable: Connected to TestChannel"
  );
});

test("should pause the queue when disconnected or not subscribed and the queue length is greater than 0", () => {
  const { channel } = setup({ connected: false, verbose: true });
  const consoleInfoMock = jest.spyOn(console, "info").mockImplementation();

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
    "useActionCable: Queue paused. Subscribed: true. Connected: false. Queue length: 1"
  );
});

test("should keep an item at the front of the queue when sending fails", () => {
  const { channel } = setup({ verbose: true, enablePerform: false });
  const consoleWarnMock = jest.spyOn(console, "warn").mockImplementation();

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

  expect(consoleWarnMock.mock.calls[0][0]).toBe(
    "useActionCable: Unable to perform action 'ping'. It will stay at the front of the queue."
  );
});
