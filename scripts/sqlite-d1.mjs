export function sqliteBinding(db) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() { return db.prepare(sql).get(...params) || null; },
            async run() {
              const result = db.prepare(sql).run(...params);
              return { meta: { changes: Number(result.changes) } };
            },
          };
        },
      };
    },
  };
}
