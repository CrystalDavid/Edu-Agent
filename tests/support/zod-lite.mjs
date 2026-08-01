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

  optional() {
    const base = this;
    return new Schema((value, path) =>
      value === undefined ? undefined : base.parser(value, path)
    );
  }

  nullable() {
    const base = this;
    return new Schema((value, path) =>
      value === null ? null : base.parser(value, path)
    );
  }

  refine(refiner, options = {}) {
    const base = this;
    return new Schema((value, path) => {
      const parsed = base.parser(value, path);
      if (!refiner(parsed)) {
        throw new ZodError([{
          path,
          message: options.message ?? "Invalid input"
        }]);
      }
      return parsed;
    });
  }

  superRefine(refiner) {
    const base = this;
    return new Schema((value, path) => {
      const parsed = base.parser(value, path);
      const issues = [];
      refiner(parsed, {
        addIssue(issue) {
          issues.push({
            ...issue,
            path: [...path, ...(issue.path ?? [])]
          });
        }
      });
      if (issues.length > 0) throw new ZodError(issues);
      return parsed;
    });
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

  trim() {
    return this;
  }

  min(length) {
    return new StringSchema([
      ...this.checks,
      (value, path) => {
        if (value.length < length) fail(path, `Expected ${length} characters`);
      }
    ]);
  }

  max(length) {
    return new StringSchema([
      ...this.checks,
      (value, path) => {
        if (value.length > length) fail(path, `Expected at most ${length} characters`);
      }
    ]);
  }

  regex(pattern) {
    return new StringSchema([
      ...this.checks,
      (value, path) => {
        pattern.lastIndex = 0;
        if (!pattern.test(value)) fail(path, `Expected string to match ${pattern}`);
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

  finite() {
    return new NumberSchema([
      ...this.checks,
      (value, path) => {
        if (!Number.isFinite(value)) fail(path, "Expected finite number");
      }
    ]);
  }

  min(minimum) {
    return new NumberSchema([
      ...this.checks,
      (value, path) => {
        if (value < minimum) fail(path, `Expected number >= ${minimum}`);
      }
    ]);
  }

  max(maximum) {
    return new NumberSchema([
      ...this.checks,
      (value, path) => {
        if (value > maximum) fail(path, `Expected number <= ${maximum}`);
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

  positive() {
    return new NumberSchema([
      ...this.checks,
      (value, path) => {
        if (value <= 0) fail(path, "Expected positive number");
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

  max(length) {
    return new ArraySchema(this.item, [
      ...this.checks,
      (value, path) => {
        if (value.length > length) fail(path, `Expected at most ${length} items`);
      }
    ]);
  }

  length(length) {
    return new ArraySchema(this.item, [
      ...this.checks,
      (value, path) => {
        if (value.length !== length) fail(path, `Expected ${length} items`);
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

  partial() {
    return new ObjectSchema(
      Object.fromEntries(
        Object.entries(this.shape).map(([key, schema]) => [
          key,
          schema.optional()
        ])
      )
    );
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
    this.values = values;
  }

  exclude(excluded) {
    return new EnumSchema(
      this.values.filter((value) => !excluded.includes(value))
    );
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

class UnionSchema extends Schema {
  constructor(schemas) {
    super((value, path) => {
      for (const schema of schemas) {
        try {
          return schema.parser(value, path);
        } catch (error) {
          if (!(error instanceof ZodError)) throw error;
        }
      }
      fail(path, "Expected union value");
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
  null: () =>
    new Schema((value, path) => {
      if (value !== null) fail(path, "Expected null");
      return value;
    }),
  unknown: () => new Schema((value) => value),
  literal: (value) => new LiteralSchema(value),
  enum: (values) => new EnumSchema(values),
  array: (item) => new ArraySchema(item),
  object: (shape) => new ObjectSchema(shape),
  record: (_key, value) => new RecordSchema(value),
  union: (schemas) => new UnionSchema(schemas),
  discriminatedUnion: (discriminator, schemas) =>
    new DiscriminatedUnionSchema(discriminator, schemas)
};
