export class ZodError extends Error {
  constructor(issues) {
    super("Validation failed");
    this.name = "ZodError";
    this.issues = issues;
  }
}

class Schema {
  constructor(parser) {
    this.parser = parser;
  }

  parse(value) {
    return this.parser(value, []);
  }

  default(defaultValue) {
    const base = this;
    return new Schema((value, path) =>
      value === undefined ? structuredClone(defaultValue) : base.parser(value, path)
    );
  }
}

function fail(path, message) {
  throw new ZodError([{ path, message }]);
}

class StringSchema extends Schema {
  constructor(checks = []) {
    super((value, path) => {
      if (typeof value !== "string") fail(path, "Expected string");
      for (const check of checks) check(value, path);
      return value;
    });
    this.checks = checks;
  }

  min(length) {
    return new StringSchema([
      ...this.checks,
      (value, path) => {
        if (value.length < length) fail(path, `Expected ${length} characters`);
      }
    ]);
  }

  datetime() {
    return new StringSchema([
      ...this.checks,
      (value, path) => {
        if (Number.isNaN(Date.parse(value))) fail(path, "Expected datetime");
      }
    ]);
  }
}

class NumberSchema extends Schema {
  constructor(checks = []) {
    super((value, path) => {
      if (typeof value !== "number" || Number.isNaN(value)) {
        fail(path, "Expected number");
      }
      for (const check of checks) check(value, path);
      return value;
    });
    this.checks = checks;
  }

  int() {
    return new NumberSchema([
      ...this.checks,
      (value, path) => {
        if (!Number.isInteger(value)) fail(path, "Expected integer");
      }
    ]);
  }

  nonnegative() {
    return new NumberSchema([
      ...this.checks,
      (value, path) => {
        if (value < 0) fail(path, "Expected nonnegative number");
      }
    ]);
  }
}

class ArraySchema extends Schema {
  constructor(item, checks = []) {
    super((value, path) => {
      if (!Array.isArray(value)) fail(path, "Expected array");
      for (const check of checks) check(value, path);
      return value.map((entry, index) =>
        item.parser(entry, [...path, index])
      );
    });
    this.item = item;
    this.checks = checks;
  }

  min(length) {
    return new ArraySchema(this.item, [
      ...this.checks,
      (value, path) => {
        if (value.length < length) fail(path, `Expected ${length} items`);
      }
    ]);
  }
}

class ObjectSchema extends Schema {
  constructor(shape) {
    super((value, path) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        fail(path, "Expected object");
      }
      return Object.fromEntries(
        Object.entries(shape).map(([key, schema]) => [
          key,
          schema.parser(value[key], [...path, key])
        ])
      );
    });
    this.shape = shape;
  }

  extend(extension) {
    return new ObjectSchema({ ...this.shape, ...extension });
  }
}

class LiteralSchema extends Schema {
  constructor(expected) {
    super((value, path) => {
      if (value !== expected) fail(path, `Expected literal ${expected}`);
      return value;
    });
  }
}

class EnumSchema extends Schema {
  constructor(values) {
    super((value, path) => {
      if (!values.includes(value)) fail(path, "Expected enum value");
      return value;
    });
  }
}

class RecordSchema extends Schema {
  constructor(valueSchema) {
    super((value, path) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        fail(path, "Expected record");
      }
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          valueSchema.parser(entry, [...path, key])
        ])
      );
    });
  }
}

class DiscriminatedUnionSchema extends Schema {
  constructor(discriminator, schemas) {
    super((value, path) => {
      if (!value || typeof value !== "object") fail(path, "Expected object");
      const match = schemas.find((schema) => {
        const literal = schema.shape[discriminator];
        try {
          literal.parse(value[discriminator]);
          return true;
        } catch {
          return false;
        }
      });
      if (!match) fail([...path, discriminator], "Unknown discriminator");
      return match.parser(value, path);
    });
  }
}

export const z = {
  string: () => new StringSchema(),
  number: () => new NumberSchema(),
  boolean: () =>
    new Schema((value, path) => {
      if (typeof value !== "boolean") fail(path, "Expected boolean");
      return value;
    }),
  unknown: () => new Schema((value) => value),
  literal: (value) => new LiteralSchema(value),
  enum: (values) => new EnumSchema(values),
  array: (item) => new ArraySchema(item),
  object: (shape) => new ObjectSchema(shape),
  record: (_key, value) => new RecordSchema(value),
  discriminatedUnion: (discriminator, schemas) =>
    new DiscriminatedUnionSchema(discriminator, schemas)
};
