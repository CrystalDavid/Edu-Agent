import { randomUUID } from "node:crypto";

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  next(prefix: string): string;
}

export const systemClock: Clock = {
  now: () => new Date().toISOString()
};

export const randomIdGenerator: IdGenerator = {
  next: (prefix) => `${prefix}:${randomUUID()}`
};

export class DeterministicIdGenerator implements IdGenerator {
  private counter = 0;

  next(prefix: string): string {
    this.counter += 1;
    return `${prefix}:${String(this.counter).padStart(4, "0")}`;
  }
}

export class FixedClock implements Clock {
  constructor(private readonly value: string) {}

  now(): string {
    return this.value;
  }
}
