import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Reproduces the dashboard crash: several components call
 * useProfilePermissions() in the same render pass, so the subscription helper
 * runs more than once for one profile id before anything unmounts.
 */
const removeChannel = vi.fn();
const channels: FakeChannel[] = [];

class FakeChannel {
  joined = false;
  onCalls = 0;
  constructor(public topic: string) {}
  cb: (() => void) | null = null;
  on(_type: unknown, _filter: unknown, cb: () => void) {
    // Mirrors RealtimeChannel.on(): throws once the channel is joining/joined.
    if (this.joined) {
      throw new Error(`cannot add \`postgres_changes\` callbacks for ${this.topic} after \`subscribe()\`.`);
    }
    this.onCalls += 1;
    this.cb = cb;
    return this;
  }
  subscribe() {
    this.joined = true;
    return this;
  }
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    // Mirrors RealtimeClient.channel(): returns the existing channel for a topic.
    channel: (topic: string) => {
      const realtimeTopic = `realtime:${topic}`;
      const existing = channels.find((c) => c.topic === realtimeTopic);
      if (existing) return existing;
      const created = new FakeChannel(realtimeTopic);
      channels.push(created);
      return created;
    },
    getChannels: () => channels,
    removeChannel: (c: FakeChannel) => {
      removeChannel(c);
      const i = channels.indexOf(c);
      if (i >= 0) channels.splice(i, 1);
    },
  },
}));

const { subscribeToProfilePermissions } = await import("./useProfilePermissions");

describe("profile permissions realtime channel", () => {
  beforeEach(() => {
    channels.length = 0;
    removeChannel.mockClear();
  });

  it("survives several consumers subscribing for the same profile", () => {
    const unsubs = Array.from({ length: 5 }, () =>
      subscribeToProfilePermissions("p1", vi.fn()),
    );

    expect(channels).toHaveLength(1);
    expect(channels[0]!.onCalls).toBe(1);
    unsubs.forEach((u) => u());
  });

  it("fans one change out to every listener", () => {
    const a = vi.fn();
    const b = vi.fn();
    const ua = subscribeToProfilePermissions("p1", a);
    const ub = subscribeToProfilePermissions("p1", b);

    channels[0]!.cb!();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    ua();
    ub();
  });

  it("removes the channel only when the last consumer leaves", () => {
    const u1 = subscribeToProfilePermissions("p1", vi.fn());
    const u2 = subscribeToProfilePermissions("p1", vi.fn());

    u1();
    expect(removeChannel).not.toHaveBeenCalled();
    u2();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });

  it("re-subscribes cleanly after the last consumer left", () => {
    subscribeToProfilePermissions("p1", vi.fn())();
    const again = subscribeToProfilePermissions("p1", vi.fn());
    expect(channels).toHaveLength(1);
    expect(channels[0]!.onCalls).toBe(1);
    again();
  });
});
